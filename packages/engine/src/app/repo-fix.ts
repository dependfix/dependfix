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
import { buildUpgradeGroups } from '../grouping'
import {
    dedupeFixableAlerts,
    isRootDirectDependency,
    partitionSubmanifestAlerts,
    quickVerifyProject,
    restoreTrackedFiles,
    snapshotTrackedFiles,
    type MemberManifestAlert,
} from '../helpers'
import {
    buildVersionedOverrides,
    codeScanningAlertsTokenHint,
    dependabotAlertsTokenHint,
    mergeAiUsage,
    runCodeScanningFixes,
    tryLockfileRepair,
    upgradeAlert,
    verifyProject,
    type AppContext,
} from './helpers'
import { fetchDefaultBranch, fetchRepoAlerts, truncatedWarning } from './repo-alerts'

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
    defaultBranch: string
}

/** run 级 AI 用量聚合的可变引用（步骤内 merge 后回写，报告 aiUsage 段数据源）。 */
export interface AiUsageRef {
    aggregate: AiUsageAggregate | undefined
}

/** 修复管线上下文 = AppContext + AI 用量引用（避免步骤函数参数超限）。 */
export interface RepoFixCtx extends AppContext {
    aiUsageRef: AiUsageRef
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
        defaultBranch: '',
    }

    try {
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

    // 2.0 lockfile 脆弱实例 → overrides 修复（独立于分组升级，避免全局覆盖误伤根声明）
    // 门槛：该包在 lockfile 中存在脆弱实例（低于某大版本线的推荐目标）——
    // 覆盖多 major（vite@5.4.14 + vite@8.2.0）与同 major 多小版本
    // （fast-uri@3.1.0 + 3.1.5）两类场景（2026-08-06 run 31028234123 复盘）。
    // key 形式：真实多 major 共存 → 版本化 `pkg@major`；单 major → 无版本号 `pkg`
    // （2026-08-09 复盘：单 major 用 `pkg@major` 会与既有无版本号条目分裂并存）
    const lockfileManifestAlerts = rootManifestAlerts.filter(
        (a) => a.source !== 'code-scanning' && a.manifestPath.trim().replace(/\\/g, '/') === 'pnpm-lock.yaml'
            && a.fixable && a.recommendedVersion,
    )
    // 2.0 跨线告警分流（跨线告警复盘 + --allow-major-upgrade 扩展）：
    // 推荐版本的 major 不在 lockfile 实例 majors 中 → 本大版本线无修复版本
    // （如 5.x 实例的 GHSA-fx2h 推荐 6.4.3），只能跨大版本升级修复。
    // 默认保持不跨大版本自动升级——此类告警不修复、不标 fixed/converged，
    // 计入 skipped 并提示人工检查/升级/批准。
    // --allow-major-upgrade 显式授权后，仅「根 package.json 直接依赖 + lockfile
    // 单版本」的跨线告警进入 2.0.2 自动跨线（改声明 + 升级后实例复核 + 强制完整
    // 验证 + 失败回滚）；workspace 成员独占声明（root 未声明，修复器只改根
    // manifest——必然失败）、间接依赖、多版本共存跨线告警维持人工（跨线版本化
    // overrides 会破坏依赖方 range 导致 install 失败，全局 override 会降级根声明
    // ——保守正确，降级声明教训）。
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
    // 多版本包的所有 lockfile 告警进入 2.0.1（按告警身份排除，不按包名——同包
    // 其他 manifest 告警（package.json 根声明等）保留在常规链路，避免静默丢失）
    const multiVersionAlerts = fixableLockfileAlerts.filter((a) => multiVersionPackages.has(a.packageName))
    const multiVersionAlertIds = new Set(multiVersionAlerts.map((a) => a.id))
    // 常规链路同样排除跨线告警（避免 no-downgrade 用最高实例版本误判 converged——
    // 8.2.0 的安全会掩盖 5.4.x 实例的跨线告警未修复，PR #28 复盘）
    const singleVersionAlerts = rootManifestAlerts.filter(
        (a) => !multiVersionAlertIds.has(a.id) && !crossMajorAlertIds.has(a.id) && !autoMajorAlertIds.has(a.id),
    )

    // 2.0.1 执行版本化 overrides 修复（逐包：快照 → 写入 → install → 组级验证 → 回滚）
    const upgradedMultiVersion = new Set<string>()
    for (const alert of multiVersionAlerts) {
        if (upgradedMultiVersion.has(alert.packageName)) {
            continue
        }
        upgradedMultiVersion.add(alert.packageName)
        const versionedOverrides = versionedOverridesByPackage.get(alert.packageName) ?? {}
        const targets = Object.values(versionedOverrides)
        const targetSummary = targets.length > 0 ? targets.join(', ') : alert.recommendedVersion
        if (ctx.config.dryRun) {
            // dry-run 不写盘：仅记录计划动作（与 upgradeAlert 的 dry-run 语义一致）
            ctx.logger.info(`[dry-run] Would apply versioned overrides for ${alert.packageName}: ${JSON.stringify(versionedOverrides)}`)
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
        ctx.logger.info(
            `[multi-version] ${alert.packageName}: applying versioned overrides ${JSON.stringify(versionedOverrides)}`,
        )
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

    // 2.0.2 跨线升级（--allow-major-upgrade 显式授权；仅根直接依赖 + lockfile 单版本）
    // 逐包：快照 → upgradeDependency（改根声明 + install 内建失败回滚）→
    // 升级后实例复核（确认脆弱实例真实消除——跨线只改 root 声明，workspace 成员
    // 同 range / 传递依赖 pin 可能仍锁旧 major，残留实例必须回滚，避免误标 fixed
    // 且下一轮被最高实例掩盖误判 converged，PR #28 纪律）→ 强制完整验证
    // （install + lint + build，跨线 breaking change 面大，lint-only 不足以兜底
    // 类型/构建错误）→ 失败回滚。
    // 同包多条跨线告警取最高 recommendedVersion 为升级目标（镜像 dedupeFixableAlerts
    // 语义），被合并告警随代表告警一并处理并在日志中说明。
    // 不误标 fixed/converged：成功仅计入 fixed；失败计 failed + 错误可审计。
    // 按包聚合：取最高推荐版本为代表告警（避免同包多告警只升第一条目标、其余静默丢失）
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
        // 升级后实例复核：root 声明已升，但 workspace 成员同 range /
        // 传递依赖 pin 可能仍锁旧 major → lockfile 残留脆弱实例 → 回滚
        // （不进入验证阶段，省时且不制造"跨线成功但告警未消除"状态）
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
        // 跨线强制完整验证（install + lint + build）
        const majorVerifyActions = await verifyProject(ctx, repo)
        // 验证动作入 allActions：成功证据可审计（summary 验证计数 + PR body Verification 章节）
        ctx.allActions.push(...majorVerifyActions)
        let majorOk = majorVerifyActions.every((a) => a.success)

        // AI 研判接入：升级验证失败（带失败日志）或 major 升级（预防性）
        // 时触发 → code-change 修复（apply + 内部完整验证）→ 通过则保留。
        // 仅 --ai 开启且非 dry-run（不产生费用）。
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
            // dry-run 不写盘：仅记录计划动作（与 2.0.1/2.0.2 dry-run 语义一致）
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
        // 升级后实例复核：成员声明已升，但根全局 override / 其他位置 pin
        // 可能仍锁旧版本 → 残留脆弱实例 → 回滚（不进入验证阶段）
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
        // 快速验证（根 lint，与 2.0 常规升级一致）
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
        // 组前快照（整组回滚基线）
        snapshot = snapshotTrackedFiles(ctx.workDir)

        const pendingActions: FixAction[] = []
        const upgradedInGroup: NormalizedSecurityAlert[] = []

        for (const packageName of group.packages) {
            // 防御：assign 已通过 target 集合过滤，组内包必在 fixableAlerts 中
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
                // 包不在 lockfile（或格式非常规）——不降级保护失效，warn 提示
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
            if (ctx.config.dryRun) {
                // dry-run 无实际文件改动，跳过验证
                progress.fixed++
                continue
            }
            upgradedInGroup.push(alert)
        }

        // dry-run 或组内无实际升级：仅记录 action，不做组级验证
        if (ctx.config.dryRun || upgradedInGroup.length === 0) {
            ctx.allActions.push(...pendingActions)
            continue
        }

        // 组级快速验证：lint 通过 → 整组保留（一次验证替代逐包 N 次验证）
        const groupOk = await quickVerifyProject(ctx, repo)
        if (groupOk) {
            ctx.allActions.push(...pendingActions)
            progress.fixed += upgradedInGroup.length
            ctx.logger.info(
                `[group] ${group.name}: ${upgradedInGroup.length} upgrade(s) passed group verification`,
            )
            // 更新快照基线：后续组的失败回滚不应影响本组
            snapshot = snapshotTrackedFiles(ctx.workDir)
            continue
        }

        // 组级验证失败：整组回滚 → 拆组逐个重试（保留能单独通过的包）
        restoreTrackedFiles(ctx.workDir, snapshot)
        ctx.logger.warn(
            `[group] ${group.name}: group verification failed — rolling back group, retrying per-package`,
        )

        // 组内升级失败的包：保留原始失败记录（已计 failed）
        for (const action of pendingActions) {
            if (!action.success) {
                ctx.allActions.push(action)
            }
        }

        // 组内升级成功但组验证失败的包：逐个重新升级 + 验证
        for (const alert of upgradedInGroup) {
            const action = await upgradeAlert(ctx, alert)
            ctx.allActions.push(action)
            if (!action.success) {
                progress.failed++
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
            // 更新快照基线：后续包的失败回滚不应影响本包
            snapshot = snapshotTrackedFiles(ctx.workDir)
        }
    }

    // Track skipped (non-fixable) alerts（子目录 manifest 已在 2.0 单独计入，避免重复计数；
    // 多版本共存包已在 2.0.1 独立处理，不计入此 skipped 差额）
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
    // 3. Lockfile repair
    const repairAction = tryLockfileRepair(ctx, repo)
    ctx.allActions.push(repairAction)
    if (repairAction.success) {
        progress.lockfileRepaired = true
    }

    // 4. Verification (skip in dry-run mode)
    if (!ctx.config.dryRun) {
        const verifyActions = await verifyProject(ctx, repo)
        ctx.allActions.push(...verifyActions)
        progress.verificationPassed = verifyActions.every((a) => a.success)
    } else {
        ctx.logger.info(`[dry-run] Skipping verification for ${repo}`)
        progress.verificationPassed = undefined
    }
}
