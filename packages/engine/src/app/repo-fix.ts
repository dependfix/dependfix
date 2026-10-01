import { join } from 'node:path'
import type { Octokit } from '@octokit/rest'
import {
    filterAlerts,
    limitAlerts,
    prioritizeAlerts,
    toErrorMessage,
    type AiUsageAggregate,
    type FixAction,
    type NormalizedSecurityAlert,
} from '@dependfix/core'
import {
    applyVersionedOverrides,
    compareSemver,
    isCrossMajorFixRequired,
    readExistingOverrides,
    readLockfileVersion,
    readLockfileVersions,
    upgradeDependency,
} from '../fixers/dependency'
import { runAiIntegration } from '../ai/app-integration'
import {
    dedupeFixableAlerts,
    isRootDirectDependency,
    partitionSubmanifestAlerts,
    quickVerifyProject,
    restoreTrackedFiles,
    snapshotTrackedFiles,
    type MemberManifestAlert,
} from '../helpers'
import { buildUpgradeGroups } from '../grouping'
import type { CommandResult } from '../runners/verification-runner'
import { handleOverrideProtection } from './override-protect'
import {
    buildVersionedOverrides,
    mergeAiUsage,
    runCodeScanningFixes,
    tryLockfileRepair,
    upgradeAlert,
    type AppContext,
} from './helpers'
import { sampleVerificationBaseline, verifyProject } from './verify-project'
import { fetchDefaultBranch, fetchRepoAlerts, truncatedWarning } from './repo-alerts'
import { codeScanningAlertsTokenHint, dependabotAlertsTokenHint } from './token-hints'

// ---------------------------------------------------------------------------
// 单仓库修复管线（fix / fix-and-pr 模式共用）
//
// 自 app/index.ts 拆出（文件行数 + max-lines-per-function 治理）：
// 原 DependfixApp.processRepoForFix（681 行）按阶段拆为独立步骤函数，
// 上下文用 AppContext 切片，过程状态经 RepoFixProgress 显式传递。
// ---------------------------------------------------------------------------

/** 单仓库修复过程状态（跨步骤显式传递，避免隐式共享）。 */
interface RepoFixProgress {
    alertsCount: number
    fixable: number
    fixed: number
    failed: number
    lockfileRepaired: boolean
    verificationPassed: boolean | undefined
    /** 是否存在本次改动引入的验证失败（决定交付回滚；见 RepositoryResult.verificationBlocking） */
    verificationBlocking: boolean | undefined
    defaultBranch: string
}

/** run 级 AI 用量聚合的可变引用（步骤内 merge 后回写，报告 aiUsage 段数据源）。 */
export interface AiUsageRef {
    aggregate: AiUsageAggregate | undefined
}

/** 修复管线上下文 = AppContext + AI 用量引用（避免步骤函数参数超限）。 */
export interface RepoFixCtx extends AppContext {
    aiUsageRef: AiUsageRef
    /**
     * 运行级「修复前验证基线」持有器（由 index.ts 在运行开始时创建，跨仓库复用同一对象）。
     *
     * - 首次需要时惰性采样一次（修复前 pristine 工作区）
     * - 多仓库共享同一 workDir（就地修复）时沿用首采结果——与既有 `preExistingDirty`
     *   的运行级语义一致；多仓库场景的粒度局限同 `verification-gate.ts` 所述（todo.md G3）
     * - 未提供（如测试直接构造 ctx）⇒ 不采样，退回原始「全量归因」口径
     */
    verificationBaseline?: { value?: CommandResult[] }
}

/**
 * 惰性取得本次运行修复前的验证基线（每运行一次）。
 * dry-run 不做验证，因此也不需要基线。
 */
async function ensureVerificationBaseline(
    ctx: RepoFixCtx,
    repo: string,
): Promise<void> {
    if (ctx.config.dryRun || !ctx.verificationBaseline) {
        return
    }
    if (!ctx.verificationBaseline.value) {
        ctx.verificationBaseline.value = await sampleVerificationBaseline(ctx, repo)
    }
}

/** 读取本次运行的修复前基线（未采样 / 采样失败时为 undefined ⇒ 全量归因）。 */
function currentBaseline(ctx: RepoFixCtx): CommandResult[] | undefined {
    return ctx.verificationBaseline?.value
}

/** lockfile 依赖告警分区产物（供 lockfile / 成员 / 常规升级步骤共用）。 */
interface LockfileAlertSets {
    rootManifestAlerts: NormalizedSecurityAlert[]
    memberManifestAlerts: MemberManifestAlert[]
    lockfilePath: string
}

/**
 * 单仓库修复管线编排器（原 processRepoForFix）：
 * 抓取 → 模板修复 → lockfile 脆弱实例（版本化 overrides / 跨线 / 成员）→
 * 常规分组升级 → lockfile repair → 验证；失败不中断（逐仓库隔离），
 * 结果写入 repoResults（durationMs = 全程耗时）。
 */
export async function processRepoFix(
    ctx: RepoFixCtx,
    client: Octokit | null,
    repo: string,
): Promise<void> {
    const startTime = Date.now()
    const progress: RepoFixProgress = {
        alertsCount: 0,
        fixable: 0,
        fixed: 0,
        failed: 0,
        lockfileRepaired: false,
        verificationPassed: undefined,
        verificationBlocking: undefined,
        defaultBranch: '',
    }

    try {
        // 修复前一次性采样验证基线（在任何改动之前；用于区分「本次引入」与「既有」失败）
        await ensureVerificationBaseline(ctx, repo)
        const sets = await prepareRepoFix(ctx, client, repo, progress)
        const { singleVersionAlerts } = await applyLockfileFixes(ctx, client, repo, sets, progress)
        await applyMemberUpgrades(ctx, repo, sets, progress)
        await applyGroupUpgrades(ctx, repo, sets, singleVersionAlerts, progress)
        await finalizeRepoFix(ctx, repo, progress)
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        const hint = dependabotAlertsTokenHint(error) ?? codeScanningAlertsTokenHint(error)
        ctx.logger.error(`Failed to process ${repo}: ${message}${hint ? ` — ${hint}` : ''}`)
        ctx.allErrors.push({
            repository: repo,
            stage: 'fix',
            category: 'PROCESS_FAILED',
            message: hint ? `${message}（${hint}）` : message,
        })
    }

    ctx.repoResults.push({
        repository: repo,
        defaultBranch: progress.defaultBranch,
        alertsCount: progress.alertsCount,
        fixable: progress.fixable,
        fixed: progress.fixed,
        failed: progress.failed,
        lockfileRepaired: progress.lockfileRepaired,
        verificationPassed: progress.verificationPassed,
        verificationBlocking: progress.verificationBlocking,
        durationMs: Date.now() - startTime,
    })
}

/**
     * 步骤 1：抓取告警（双源 + 截断提示）→ Code Scanning 模板修复 → 依赖告警分区。
     * @returns 依赖告警分区产物（root/member/lockfilePath）
     */
async function prepareRepoFix(
    ctx: RepoFixCtx,
    client: Octokit | null,
    repo: string,
    progress: RepoFixProgress,
): Promise<LockfileAlertSets> {
    // 1. Fetch alerts（双源：github-dependabot 走 alertsToken / pnpm-audit 本地回退）
    const rawAlerts = await fetchRepoAlerts(ctx, repo)
    const { filtered } = filterAlerts(rawAlerts, { severityThreshold: ctx.config.severityThreshold })
    const prioritized = prioritizeAlerts(filtered)
    const { limited, truncated } = limitAlerts(prioritized, ctx.config.maxAlertsPerRepository)
    if (truncated.length > 0) {
        ctx.summary.alertsTruncated += truncated.length
        ctx.logger.warn(truncatedWarning(ctx.config, truncated.length))
    }
    progress.alertsCount = limited.length
    progress.fixable = limited.filter((a) => a.fixable).length

    const [owner, name] = repo.split('/')
    progress.defaultBranch = await fetchDefaultBranch(client, owner, name)

    ctx.allAlerts.push(...limited)

    // 2.0 Code Scanning 模板修复（A 类白名单；与依赖升级链路并行、互不干扰）
    // 逐告警：快照 → 应用模板 → quickVerify（lint）→ 失败回滚（不静默）
    const csCounts = await runCodeScanningFixes(ctx, repo, limited)
    progress.fixed += csCounts.fixed
    progress.failed += csCounts.failed

    // 2.1 子目录 / 根直接依赖 lockfile 告警（防护：docs vite 告警曾误降级根 vite@8→6）→ 剔除修复链路
    // 收尾审查遗留修复：code-scanning 告警（manifestPath 为源码路径）不参与依赖清单分区，
    // 避免全部落 sub 桶产生 skip 计数噪音（其可见性由 §Code Scanning Suggestions 承担）
    const dependencyAlerts = limited.filter((a) => a.source !== 'code-scanning')
    const { root: rootManifestAlerts, member: memberManifestAlerts, sub: submanifestAlerts } = partitionSubmanifestAlerts(dependencyAlerts, ctx.workDir)
    if (submanifestAlerts.length > 0) {
        ctx.logger.warn(
            `[alerts] ${submanifestAlerts.length} alert(s) from sub-directory / root-direct-dep manifest(s) skipped — manual review required: ${submanifestAlerts.map((a) => `${a.packageName} (${a.manifestPath})`).join(', ')}`,
        )
        ctx.summary.alertsSkipped += submanifestAlerts.length
    }

    return {
        rootManifestAlerts,
        memberManifestAlerts,
        lockfilePath: join(ctx.workDir, 'pnpm-lock.yaml'),
    }
}

/**
 * 步骤 2：lockfile 脆弱实例修复链（独立于分组升级，避免全局覆盖误伤根声明）。
 * - 2.0.1 版本化 overrides（多 major 共存 / 同 major 多小版本）
 * - 2.0.2 跨线升级（--allow-major-upgrade 显式授权；仅根直接依赖 + 单版本）
 *
 * @returns 常规链路单版本告警（供步骤 4 分组升级，排除多版本/跨线避免重复处理）
 */
async function applyLockfileFixes(
    ctx: RepoFixCtx,
    client: Octokit | null,
    repo: string,
    sets: LockfileAlertSets,
    progress: RepoFixProgress,
): Promise<{ singleVersionAlerts: NormalizedSecurityAlert[] }> {
    const { rootManifestAlerts, lockfilePath } = sets

    const lockfileManifestAlerts = rootManifestAlerts.filter(
        (a) => a.source !== 'code-scanning' && a.manifestPath.trim().replace(/\\/g, '/') === 'pnpm-lock.yaml'
            && a.fixable && a.recommendedVersion,
    )
    const allCrossMajorAlerts = lockfileManifestAlerts.filter((a) => isCrossMajorFixRequired(lockfilePath, a))
    const manualCrossMajorAlerts = allCrossMajorAlerts.filter(
        (a) => !(ctx.config.allowMajorUpgrade
            && isRootDirectDependency(ctx.workDir, a.packageName)
            && readLockfileVersions(lockfilePath, a.packageName).length === 1),
    )
    const autoMajorAlertIds = new Set(
        allCrossMajorAlerts.filter((a) => !manualCrossMajorAlerts.some((m) => m.id === a.id)).map((a) => a.id),
    )
    const crossMajorAlertIds = new Set(manualCrossMajorAlerts.map((a) => a.id))
    if (manualCrossMajorAlerts.length > 0) {
        ctx.logger.warn(
            `[alerts] ${manualCrossMajorAlerts.length} alert(s) require a cross-major upgrade (no fix within the installed major line) — manual review required: ${manualCrossMajorAlerts.map((a) => `${a.packageName} → ${a.recommendedVersion}`).join(', ')}`,
        )
        ctx.summary.alertsSkipped += manualCrossMajorAlerts.length
    }
    const autoMajorAlerts = lockfileManifestAlerts.filter((a) => autoMajorAlertIds.has(a.id))
    const fixableLockfileAlerts = lockfileManifestAlerts.filter(
        (a) => !crossMajorAlertIds.has(a.id) && !autoMajorAlertIds.has(a.id),
    )
    // 按包分组，构建 overrides（key 形式由大版本冲突判定决定：
    // 真实多 major 共存 → `pkg@major` 版本化；单 major → 无版本号 `pkg`，
    // 2026-08-09 复盘）；与已有 overrides 条目协同取 max，不丢不改写已有条目。
    // 非空即存在脆弱实例 → 进入 2.0.1
    const existingOverrides = readExistingOverrides(ctx.workDir)
    const versionedOverridesByPackage = new Map<string, Record<string, string>>()
    for (const alert of fixableLockfileAlerts) {
        if (!versionedOverridesByPackage.has(alert.packageName)) {
            const packageAlerts = fixableLockfileAlerts.filter((a) => a.packageName === alert.packageName)
            versionedOverridesByPackage.set(
                alert.packageName,
                buildVersionedOverrides(lockfilePath, packageAlerts, existingOverrides),
            )
        }
    }
    const multiVersionPackages = new Set(
        [...versionedOverridesByPackage.entries()]
            .filter(([, overrides]) => Object.keys(overrides).length > 0)
            .map(([packageName]) => packageName),
    )
    const multiVersionAlerts = fixableLockfileAlerts.filter((a) => multiVersionPackages.has(a.packageName))
    const multiVersionAlertIds = new Set(multiVersionAlerts.map((a) => a.id))
    const singleVersionAlerts = rootManifestAlerts.filter(
        (a) => !multiVersionAlertIds.has(a.id) && !crossMajorAlertIds.has(a.id) && !autoMajorAlertIds.has(a.id),
    )

    const upgradedMultiVersion = new Set<string>()
    for (const alert of multiVersionAlerts) {
        if (upgradedMultiVersion.has(alert.packageName)) {
            continue
        }
        upgradedMultiVersion.add(alert.packageName)
        const protectedAction = handleOverrideProtection(ctx, {
            overrideProtect: ctx.config.overrideProtect,
            repository: alert.repository,
            packageName: alert.packageName,
            toVersion: alert.recommendedVersion,
            scope: 'versioned-override',
        })
        if (protectedAction) {
            ctx.allActions.push(protectedAction)
            continue
        }
        const versionedOverrides = versionedOverridesByPackage.get(alert.packageName) ?? {}
        const targets = Object.values(versionedOverrides)
        const targetSummary = targets.length > 0 ? targets.join(', ') : alert.recommendedVersion
        if (ctx.config.dryRun) {
            // dry-run 不写盘：仅记录计划动作（与 upgradeAlert 的 dry-run 语义一致）
            ctx.logger.info(`[dry-run] Would apply versioned overrides for ${alert.packageName}`, { overrides: versionedOverrides })
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: '',
                toVersion: targetSummary,
                isMajor: false,
                strategy: 'versioned-override',
                success: true,
                durationMs: 0,
            })
            progress.fixed++
            continue
        }
        if (Object.keys(versionedOverrides).length === 0) {
            ctx.logger.info(`Skipping ${alert.packageName}: no vulnerable instances below targets`)
            ctx.summary.alertsConverged++
            continue
        }
        const snapshot = snapshotTrackedFiles(ctx.workDir)
        ctx.logger.info(`[multi-version] ${alert.packageName}: applying versioned overrides`, { overrides: versionedOverrides })
        const result = await applyVersionedOverrides({
            packageName: alert.packageName,
            versionedOverrides,
            workDir: ctx.workDir,
        })
        if (result.success && result.warning) {
            ctx.logger.warn(`[multi-version] ${alert.packageName}: ${result.warning}`)
        }
        const action: FixAction = {
            type: 'dependency-upgrade',
            repository: alert.repository,
            target: alert.packageName,
            fromVersion: '',
            toVersion: result.toVersion,
            isMajor: false,
            strategy: 'versioned-override',
            success: result.success,
            error: result.error,
            durationMs: 0,
        }
        if (!result.success) {
            ctx.allActions.push(action)
            progress.failed++
            continue
        }
        // 组级快速验证：lint 通过 → 保留；失败 → 回滚
        const groupOk = await quickVerifyProject(ctx, repo)
        if (groupOk) {
            ctx.allActions.push(action)
            progress.fixed++
            ctx.logger.info(`[multi-version] ${alert.packageName}: versioned overrides passed verification`)
        } else {
            restoreTrackedFiles(ctx.workDir, snapshot)
            action.success = false
            action.error = 'lint failed after versioned overrides; changes rolled back'
            ctx.allActions.push(action)
            progress.failed++
            ctx.logger.warn(`[multi-version] ${alert.packageName}: verification failed — rolled back versioned overrides`)
        }
    }

    const autoMajorByPackage = new Map<string, NormalizedSecurityAlert>()
    for (const alert of autoMajorAlerts) {
        const existing = autoMajorByPackage.get(alert.packageName)
        const existingTarget = existing?.recommendedVersion
        const alertTarget = alert.recommendedVersion
        if (!existing || (existingTarget && alertTarget && compareSemver(alertTarget, existingTarget) > 0)) {
            autoMajorByPackage.set(alert.packageName, alert)
        }
    }
    const autoMajorRepresentatives = [...autoMajorByPackage.values()]
    if (autoMajorAlerts.length > autoMajorRepresentatives.length) {
        ctx.logger.info(
            `[major-upgrade] ${autoMajorAlerts.length - autoMajorRepresentatives.length} cross-major alert(s) merged into package representatives (highest target per package)`,
        )
    }
    for (const alert of autoMajorRepresentatives) {
        if (ctx.config.dryRun) {
            // dry-run 不写盘：仅记录计划动作（与 2.0.1 dry-run 语义一致）
            ctx.logger.info(`[dry-run] Would apply major upgrade for ${alert.packageName} → ${alert.recommendedVersion}`)
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: '',
                toVersion: alert.recommendedVersion,
                isMajor: true,
                strategy: 'major-upgrade',
                success: true,
                durationMs: 0,
            })
            progress.fixed++
            continue
        }
        const majorSnapshot = snapshotTrackedFiles(ctx.workDir)
        ctx.logger.warn(
            `[major-upgrade] ${alert.packageName}: applying cross-major upgrade → ${alert.recommendedVersion} (explicit --allow-major-upgrade; full verification required)`,
        )
        const majorResult = await upgradeDependency({
            packageName: alert.packageName,
            targetVersion: alert.recommendedVersion!,
            workDir: ctx.workDir,
        })
        if (!majorResult.success) {
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: majorResult.fromVersion,
                toVersion: alert.recommendedVersion,
                isMajor: true,
                strategy: 'major-upgrade',
                success: false,
                error: majorResult.error,
                durationMs: 0,
            })
            progress.failed++
            continue
        }
        const remainingVersions = readLockfileVersions(lockfilePath, alert.packageName)
        const stillVulnerable = remainingVersions.some(
            (v) => compareSemver(v, alert.recommendedVersion!) < 0,
        )
        if (stillVulnerable) {
            restoreTrackedFiles(ctx.workDir, majorSnapshot)
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: majorResult.fromVersion,
                toVersion: alert.recommendedVersion,
                isMajor: true,
                strategy: 'major-upgrade',
                success: false,
                error: 'vulnerable instance(s) remain after cross-major upgrade (workspace member / transitive pin); changes rolled back',
                durationMs: 0,
            })
            progress.failed++
            ctx.logger.warn(
                `[major-upgrade] ${alert.packageName}: vulnerable instance(s) remain (${remainingVersions.join(', ')}) — rolled back cross-major upgrade, manual review required`,
            )
            continue
        }
        // 跨线升级保留**严格**口径（不套用基线归因）：命令级基线只能区分「同一命令红 / 绿」，
        // 无法区分失败身份（红的还是原来那条失败），不足以支撑「跨 major 升级可保留」的判断。
        // 基线归因仅用于最终交付门禁（finalizeRepoFix）。
        const majorVerifyActions = await verifyProject(ctx, repo)
        ctx.allActions.push(...majorVerifyActions)
        let majorOk = majorVerifyActions.every((a) => a.success)

        const ai = ctx.config.ai
        const aiTriggered = ai?.enabled === true
            && !ctx.config.dryRun
            && (ai.trigger === 'both' || ai.trigger === 'major' || (ai.trigger === 'failure' && !majorOk))
        if (aiTriggered) {
            const failureLog = majorOk
                ? undefined
                : majorVerifyActions.filter((a) => !a.success)
                    .map((a) => a.error ?? `exit code for ${a.target}`)
                    .join('\n')
            const aiResult = await runAiIntegration({
                ai,
                // 2.0.2 段仅对 lockfile 告警可达（GitHub 源），client 恒非空；
                // pnpm-audit 源告警 manifestPath='' 不满足 lockfileManifestAlerts 过滤
                client: client!,
                ctx,
                repo,
                dryRun: ctx.config.dryRun,
            }, {
                packageName: alert.packageName,
                fromVersion: majorResult.fromVersion,
                toVersion: alert.recommendedVersion!,
                failureLog,
            })
            ctx.allActions.push(...aiResult.actions)
            // run 级用量聚合（进报告 aiUsage 段）
            ctx.aiUsageRef.aggregate = mergeAiUsage(ctx.aiUsageRef.aggregate, aiResult.usage)
            // AI patch 成功 = AI 内部已通过完整验证（apply + verify）
            const aiPatchSuccess = aiResult.actions.some(
                (a) => a.strategy === 'ai-patch' && a.success && !a.noOp,
            )
            if (aiPatchSuccess) {
                majorOk = true
            }
        }

        if (majorOk) {
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: majorResult.fromVersion,
                toVersion: majorResult.toVersion,
                isMajor: true,
                strategy: 'major-upgrade',
                success: true,
                durationMs: 0,
            })
            progress.fixed++
            ctx.logger.info(`[major-upgrade] ${alert.packageName}: cross-major upgrade passed full verification`)
        } else {
            // 回滚声明 + lockfile（AI patch 已由 applier 内部回滚或未应用）
            restoreTrackedFiles(ctx.workDir, majorSnapshot)
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: majorResult.fromVersion,
                toVersion: alert.recommendedVersion,
                isMajor: true,
                strategy: 'major-upgrade',
                success: false,
                error: 'major upgrade failed full verification; changes rolled back',
                durationMs: 0,
            })
            progress.failed++
            ctx.logger.warn(
                `[major-upgrade] ${alert.packageName}: full verification failed — rolled back cross-major upgrade`,
            )
        }
    }

    return { singleVersionAlerts }
}

/**
 * 步骤 3：成员级升级（workspace 成员 manifest 直接依赖；member 桶准入已保证：
 * 成员白名单 + 直接声明 + fixable + 单版本 + 非跨线）。按「包名 + manifestDir」
 * 聚合取最高推荐为代表；逐项快照 → upgradeDependency({ manifestDir }) → 实例
 * 复核（残留脆弱实例回滚）→ quickVerify（根 lint）→ 失败回滚。不误标 fixed/converged。
 */
async function applyMemberUpgrades(
    ctx: RepoFixCtx,
    repo: string,
    sets: LockfileAlertSets,
    progress: RepoFixProgress,
): Promise<void> {
    const { memberManifestAlerts, lockfilePath } = sets
    const memberByPackageAndDir = new Map<string, MemberManifestAlert>()
    for (const item of memberManifestAlerts) {
        const key = `${item.alert.packageName}@${item.manifestDir}`
        const existing = memberByPackageAndDir.get(key)
        const existingTarget = existing?.alert.recommendedVersion
        const alertTarget = item.alert.recommendedVersion
        if (!existing || (existingTarget && alertTarget && compareSemver(alertTarget, existingTarget) > 0)) {
            memberByPackageAndDir.set(key, item)
        }
    }
    if (memberManifestAlerts.length > memberByPackageAndDir.size) {
        ctx.logger.info(
            `[member-upgrade] ${memberManifestAlerts.length - memberByPackageAndDir.size} member alert(s) merged into package+dir representatives (highest target per package per member)`,
        )
    }
    for (const item of [...memberByPackageAndDir.values()]) {
        const { alert, manifestDir } = item
        const memberManifestPath = `${manifestDir}/package.json`
        if (ctx.config.dryRun) {
            ctx.logger.info(`[dry-run] Would upgrade ${alert.packageName} in ${memberManifestPath} → ${alert.recommendedVersion}`)
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: '',
                toVersion: alert.recommendedVersion,
                isMajor: false,
                strategy: 'member-upgrade',
                success: true,
                durationMs: 0,
                filePath: memberManifestPath,
            })
            progress.fixed++
            continue
        }
        const memberSnapshot = snapshotTrackedFiles(ctx.workDir, [memberManifestPath])
        ctx.logger.warn(
            `[member-upgrade] ${alert.packageName}: upgrading member declaration in ${memberManifestPath} → ${alert.recommendedVersion}`,
        )
        const memberResult = await upgradeDependency({
            packageName: alert.packageName,
            targetVersion: alert.recommendedVersion!,
            workDir: ctx.workDir,
            manifestDir,
        })
        if (!memberResult.success) {
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: memberResult.fromVersion,
                toVersion: alert.recommendedVersion,
                isMajor: memberResult.isMajor,
                strategy: 'member-upgrade',
                success: false,
                error: memberResult.error,
                durationMs: 0,
                filePath: memberManifestPath,
            })
            progress.failed++
            continue
        }
        const remainingMemberVersions = readLockfileVersions(lockfilePath, alert.packageName)
        const stillVulnerable = remainingMemberVersions.some(
            (v) => compareSemver(v, alert.recommendedVersion!) < 0,
        )
        if (stillVulnerable) {
            restoreTrackedFiles(ctx.workDir, memberSnapshot)
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: memberResult.fromVersion,
                toVersion: alert.recommendedVersion,
                isMajor: false,
                strategy: 'member-upgrade',
                success: false,
                error: 'vulnerable instance(s) remain after member upgrade (root override / other pin); changes rolled back',
                durationMs: 0,
                filePath: memberManifestPath,
            })
            progress.failed++
            ctx.logger.warn(
                `[member-upgrade] ${alert.packageName}: vulnerable instance(s) remain (${remainingMemberVersions.join(', ')}) — rolled back member upgrade in ${memberManifestPath}; residual instance likely pinned by another workspace member / root override, manual review required`,
            )
            continue
        }
        const memberOk = await quickVerifyProject(ctx, repo)
        if (!memberOk) {
            restoreTrackedFiles(ctx.workDir, memberSnapshot)
            ctx.allActions.push({
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: memberResult.fromVersion,
                toVersion: memberResult.toVersion,
                isMajor: memberResult.isMajor,
                strategy: 'member-upgrade',
                success: false,
                error: 'member upgrade failed verification; changes rolled back',
                durationMs: 0,
                filePath: memberManifestPath,
            })
            progress.failed++
            ctx.logger.warn(
                `[member-upgrade] ${alert.packageName}: verification failed — rolled back member upgrade in ${memberManifestPath}`,
            )
            continue
        }
        ctx.allActions.push({
            type: 'dependency-upgrade',
            repository: alert.repository,
            target: alert.packageName,
            fromVersion: memberResult.fromVersion,
            toVersion: memberResult.toVersion,
            isMajor: memberResult.isMajor,
            strategy: 'member-upgrade',
            success: true,
            durationMs: 0,
            filePath: memberManifestPath,
        })
        progress.fixed++
        ctx.logger.info(`[member-upgrade] ${alert.packageName}: member upgrade passed verification (${memberManifestPath})`)
    }
}

/**
 * 步骤 4：常规分组升级（组级验证失败 → 整组回滚 → 拆组逐个重试；
 * 当前版本 >= 目标时跳过，不降级保护）。末尾统计 skipped 差额。
 */
async function applyGroupUpgrades(
    ctx: RepoFixCtx,
    repo: string,
    sets: LockfileAlertSets,
    singleVersionAlerts: NormalizedSecurityAlert[],
    progress: RepoFixProgress,
): Promise<void> {
    const { lockfilePath } = sets

    const fixableAlerts = dedupeFixableAlerts(
        singleVersionAlerts.filter((a) => a.fixable && a.recommendedVersion),
    )

    const { groups, cleanupCandidates } = buildUpgradeGroups(fixableAlerts, {
        workDir: ctx.workDir,
        explicitGroups: ctx.config.upgradeGroups,
    })
    for (const group of groups) {
        ctx.logger.info(`[group] ${group.name} (${group.source}): ${group.packages.join(', ')}`)
    }
    if (cleanupCandidates.length > 0) {
        ctx.logger.warn(
            `[group] orphan @types detected (main package removed) — not upgrading, consider removal: ${cleanupCandidates.join(', ')}`,
        )
    }

    const alertByPackage = new Map(fixableAlerts.map((a) => [a.packageName, a]))
    let snapshot: ReturnType<typeof snapshotTrackedFiles>

    for (const group of groups) {
        snapshot = snapshotTrackedFiles(ctx.workDir)

        const pendingActions: FixAction[] = []
        const upgradedInGroup: NormalizedSecurityAlert[] = []

        for (const packageName of group.packages) {
            const alert = alertByPackage.get(packageName)
            if (!alert) {
                continue
            }

            const currentVersion = readLockfileVersion(lockfilePath, alert.packageName)
            if (currentVersion && compareSemver(currentVersion, alert.recommendedVersion) >= 0) {
                ctx.logger.info(
                    `Skipping ${alert.packageName}: highest locked ${currentVersion} >= target ${alert.recommendedVersion} (no upgrade needed; vulnerable lower version may coexist across manifests — global fix not applicable, manual review advised)`,
                )
                ctx.summary.alertsConverged++
                continue
            }
            if (currentVersion === null) {
                ctx.logger.warn(
                    `Could not resolve current version of ${alert.packageName} from lockfile — no-downgrade protection inactive`,
                )
            }

            const action = await upgradeAlert(ctx, alert)
            pendingActions.push(action)
            if (!action.success) {
                progress.failed++
                continue
            }
            if (action.noOp) {
                continue
            }
            if (ctx.config.dryRun) {
                progress.fixed++
                continue
            }
            upgradedInGroup.push(alert)
        }

        if (ctx.config.dryRun || upgradedInGroup.length === 0) {
            ctx.allActions.push(...pendingActions)
            continue
        }

        const groupOk = await quickVerifyProject(ctx, repo)
        if (groupOk) {
            ctx.allActions.push(...pendingActions)
            progress.fixed += upgradedInGroup.length
            ctx.logger.info(
                `[group] ${group.name}: ${upgradedInGroup.length} upgrade(s) passed group verification`,
            )
            snapshot = snapshotTrackedFiles(ctx.workDir)
            continue
        }

        restoreTrackedFiles(ctx.workDir, snapshot)
        ctx.logger.warn(
            `[group] ${group.name}: group verification failed — rolling back group, retrying per-package`,
        )

        for (const action of pendingActions) {
            if (!action.success) {
                ctx.allActions.push(action)
            }
        }

        for (const alert of upgradedInGroup) {
            const action = await upgradeAlert(ctx, alert)
            ctx.allActions.push(action)
            if (!action.success) {
                progress.failed++
                continue
            }
            if (action.noOp) {
                continue
            }
            const quickOk = await quickVerifyProject(ctx, repo)
            if (!quickOk) {
                restoreTrackedFiles(ctx.workDir, snapshot)
                ctx.logger.warn(
                    `Rolled back ${alert.packageName} upgrade: lint failed after upgrade (per-package verification)`,
                )
                action.success = false
                action.error = 'lint failed after upgrade; per-package verification failed, changes rolled back'
                progress.failed++
                continue
            }
            progress.fixed++
            snapshot = snapshotTrackedFiles(ctx.workDir)
        }
    }

    const skippedCount = singleVersionAlerts.length - fixableAlerts.length
    ctx.summary.alertsSkipped += skippedCount
}

/**
 * 步骤 5：收尾——lockfile repair + 完整验证（dry-run 跳过验证）。
 */
async function finalizeRepoFix(
    ctx: RepoFixCtx,
    repo: string,
    progress: RepoFixProgress,
): Promise<void> {
    const repairAction = tryLockfileRepair(ctx, repo)
    ctx.allActions.push(repairAction)
    if (repairAction.success) {
        progress.lockfileRepaired = true
    }

    if (!ctx.config.dryRun) {
        const verifyActions = await verifyProject(ctx, repo, { baseline: currentBaseline(ctx) })
        ctx.allActions.push(...verifyActions)
        // 原始口径：修复后链路是否全绿（报告与「成功交付」启发式沿用）
        progress.verificationPassed = verifyActions.every((a) => a.success)
        // 归因口径：是否存在**本次引入**的失败（门禁据此回滚；既有失败不归因）
        progress.verificationBlocking = verifyActions.some((a) => !a.success && !a.preExisting)
    } else {
        ctx.logger.info(`[dry-run] Skipping verification for ${repo}`)
        progress.verificationPassed = undefined
        progress.verificationBlocking = undefined
    }
}
