import { join } from 'node:path'
import type { Octokit } from '@octokit/rest'
import {
    addSkipped,
    addTruncatedBySeverity,
    filterAlerts,
    limitAlerts,
    prioritizeAlerts,
    toErrorMessage,
    type AiUsageAggregate,
    type FixAction,
    type NormalizedSecurityAlert,
    type VerificationSkipReason,
} from '@dependfix/core'
import {
    applyVersionedOverrides,
    compareSemver,
    isCrossMajorFixRequired,
    readExistingOverrides,
    readLockfileVersions,
} from '../fixers/dependency'
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
import { isAbortRequested } from '../runners/process-control'
import { handleOverrideProtection } from './override-protect'
import {
    buildVersionedOverrides,
    runCodeScanningFixes,
    type AppContext,
} from './helpers'
import { upgradeAlert } from './upgrade-alert'
import { applyMemberUpgrades } from './repo-fix-member'
import { tryBatchVersionedOverrides, type VersionedOverrideBatchItem } from './repo-fix-batch'
import { fetchDefaultBranch, fetchRepoAlerts, truncatedWarning } from './repo-alerts'
import { alertsFetchTokenHint } from './token-hints'
import { markEnvironmentalInstallFailure } from './environmental-failure'
import { recordConvergedAlerts, recordSkippedAlerts } from './alert-outcomes'
import { recordUpgradeFailure } from './upgrade-failure'
import { ensureVerificationBaseline, finalizeRepoFix, recordInstallBaselineFailure } from './repo-fix-finalize'
import { budgetAllows } from './budget'
import { recordVerificationCheckpoint, type VerificationCheckpoint } from './verification-checkpoint'
import { applyAutoMajorUpgrades } from './repo-fix-major'
import { applyRepeatedFailureSkips } from './repeated-failure'

// ---------------------------------------------------------------------------
// 单仓库修复管线（fix / fix-and-pr 模式共用）
//
// 自 app/index.ts 拆出（文件行数 + max-lines-per-function 治理）：
// 原 DependfixApp.processRepoForFix（681 行）按阶段拆为独立步骤函数，
// 上下文用 AppContext 切片，过程状态经 RepoFixProgress 显式传递。
// ---------------------------------------------------------------------------

/** 单仓库修复过程状态（跨步骤显式传递，避免隐式共享）。 */
export interface RepoFixProgress {
    alertsCount: number
    fixable: number
    fixed: number
    failed: number
    lockfileRepaired: boolean
    verificationPassed: boolean | undefined
    /** 是否存在本次改动引入的验证失败（决定交付回滚；见 RepositoryResult.verificationBlocking） */
    verificationBlocking: boolean | undefined
    /** 主动跳过验证的原因（运行预算不足 / 本次无写入；见 RepositoryResult.verificationSkipped） */
    verificationSkipped?: VerificationSkipReason
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
     * - 首个**有工作的仓库**处惰性采样一次（修复前 pristine 工作区）；零告警仓库不采样——
     *   其验证失败按「无改动即豁免」处理（口径见 docs/design/modules/dependency-fixer-records.md §12.9）
     * - 多仓库共享同一 workDir（就地修复）时沿用首采结果——与既有 `preExistingDirty`
     *   的运行级语义一致；多仓库场景的粒度局限同 `verification-gate.ts` 所述（按 run 级归因，无法逐仓库区分）
     * - 未提供（如测试直接构造 ctx）⇒ 不采样，退回原始「全量归因」口径
     */
    /** `repo` = 采样时的仓库（运行级首采只对采样仓库自身可信，多仓复用不用于快速失败判定） */
    verificationBaseline?: { repo?: string, value?: CommandResult[] }
    /**
     * 单元回滚 checkpoint 持有器（run 级；由 index.ts 创建并跨仓库传递）。
     * 每个依赖修复单元 probe 开始前记录；终验失败时 finalizeRepoFix 取当前仓库最近一个。
     */
    verificationCheckpoints?: VerificationCheckpoint[]
    /** 运行前工作区已有未提交改动：沿用门禁保护面，禁用选择性回滚。 */
    preExistingDirty?: boolean
    /**
     * checkpoint 建立失败的去重键（`仓库:原因`，run 级）。
     * 逐单元重试同一失败原因时只记一条降级审计，避免刷屏。
     */
    checkpointFailures?: Set<string>
}

/** lockfile 依赖告警分区产物（供 lockfile / 成员 / 常规升级步骤共用）。 */
export interface LockfileAlertSets {
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
        // 只读抓取前置（不写工作区）：本仓库是否有工作决定是否付一次修复前基线验证链——
        // 零告警仓库无任何写操作，其验证失败在 pristine 工作区下必然也是既有失败（判定见 ensureVerificationBaseline）
        const alertInputs = await fetchRepoFixInputs(ctx, client, repo, progress)
        // 告警分区 + 同告警尝试判定（纯读）：在基线采样之前完成，使「全部命中尝试上限」与
        // 零告警仓库同语义（无任何写操作 ⇒ 不必付一次完整基线验证链）
        const planned = await planRepoFixAlerts(ctx, client, repo, alertInputs)
        // 可执行工作判定：lockfile 告警全部需要跨 major 且未授权时，本次不会有任何写操作
        // （「有告警但 0 写入」形态），不付基线采样成本；未授权跨 major 的告警在后续链路记跳过。
        const lockfileTargets = planned.rootManifestAlerts.filter((alert) =>
            alert.source !== 'code-scanning' && alert.source !== 'code-quality'
            && alert.manifestPath.trim().replace(/\\/g, '/') === 'pnpm-lock.yaml'
            && alert.fixable && alert.recommendedVersion)
        const crossMajorOnly = lockfileTargets.length > 0
            && !ctx.config.allowMajorUpgrade
            && lockfileTargets.every((alert) => isCrossMajorFixRequired(join(ctx.workDir, 'pnpm-lock.yaml'), alert))
        // 修复前按需采样验证基线（首个有工作的仓库处采样，在任何改动之前；用于区分「本次引入」与「既有」失败）
        // 「有工作」按**可能写盘**判定（可修复的依赖告警 / 成员清单告警 / 可自动修复的 Code Scanning 告警）：
        // 全部不可修复的告警不会产生任何写入，其验证失败在 pristine 工作区下必然也是既有失败，无需付基线成本
        const codeScanningFixable = alertInputs.some((alert) => (
            alert.source === 'code-scanning' && alert.alertClass === 'auto-fixable'
        ))
        const manifestPathOf = (alert: NormalizedSecurityAlert) => alert.manifestPath.trim().replace(/\\/g, '/')
        // 跨 major 未授权只否决 **lockfile 告警**这一贡献：package.json / 成员清单 / 模板修复
        // 仍会写盘，不能被它一起否决（否则有写入却跳过基线 → 失败被误判既有失败）
        const fixableLockfileRoot = planned.rootManifestAlerts.some((alert) => (
            alert.fixable && alert.recommendedVersion && manifestPathOf(alert) === 'pnpm-lock.yaml'
        ))
        const fixableNonLockfileRoot = planned.rootManifestAlerts.some((alert) => (
            alert.fixable && alert.recommendedVersion && manifestPathOf(alert) !== 'pnpm-lock.yaml'
        ))
        const fixableMemberAlerts = planned.memberManifestAlerts.some((item) => item.alert.recommendedVersion)
        const hasWork = fixableNonLockfileRoot || fixableMemberAlerts || codeScanningFixable
            || (fixableLockfileRoot && !crossMajorOnly)
        const { exemptAttribution, baseline } = await ensureVerificationBaseline(ctx, repo, { hasWork })
        // pristine 安装失败 ⇒ overrides 安装必然同因失败；逐包重试只会耗尽预算，写盘前快速失败
        const installBaselineFailure = recordInstallBaselineFailure(ctx, repo, baseline)
        const sets = await prepareRepoFixSets(ctx, repo, planned, alertInputs, progress)
        if (installBaselineFailure) {
            ctx.logger.warn(`[multi-version] ${repo}: dependency upgrade chain skipped (pristine install baseline failed)`)
        } else {
            const { singleVersionAlerts, stopReason } = await applyLockfileFixes(ctx, client, repo, sets, progress)
            if (stopReason) {
                ctx.logger.warn(
                    `[multi-version] ${repo}: dependency install chain stopped (${stopReason}) `
                    + '— skipping member/group upgrades',
                )
            } else {
                const memberEnvironmentalStop = await applyMemberUpgrades(ctx, repo, sets, progress)
                if (memberEnvironmentalStop) {
                    ctx.logger.warn(`[member-upgrade] ${repo}: dependency install chain stopped (environmental) — skipping group upgrades`)
                } else {
                    await applyGroupUpgrades(ctx, repo, sets, singleVersionAlerts, progress)
                }
            }
        }
        await finalizeRepoFix(ctx, repo, progress, {
            exemptAttribution,
            client,
            ...(installBaselineFailure ? { installBaselineFailure } : {}),
        })
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        const hint = alertsFetchTokenHint(error)
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
        verificationSkipped: progress.verificationSkipped,
        durationMs: Date.now() - startTime,
    })
}

/**
 * 步骤 1a（只读抓取，不写工作区）：双源告警抓取 → 过滤 → 优先级 → 截断提示 → 默认分支。
 *
 * 拆出理由：调用方需要在「本仓库是否值得付一次修复前基线验证链」的判定之前拿到告警面——
 * 零告警仓库无任何写操作，其验证失败在 pristine 工作区下必然也是既有失败，无需采样
 * （判定见 `ensureVerificationBaseline`；口径见 docs/design/modules/dependency-fixer-records.md 验证链章节）。
 *
 * @returns 限流后的告警（含 Code Scanning 源；后续步骤共用）
 */
async function fetchRepoFixInputs(
    ctx: RepoFixCtx,
    client: Octokit | null,
    repo: string,
    progress: RepoFixProgress,
): Promise<NormalizedSecurityAlert[]> {
    // 1. Fetch alerts（双源：github-dependabot 走 alertsToken / pnpm-audit 本地回退）
    const rawAlerts = await fetchRepoAlerts(ctx, repo)
    const { filtered } = filterAlerts(rawAlerts, { severityThreshold: ctx.config.severityThreshold })
    const prioritized = prioritizeAlerts(filtered)
    const { limited, truncated } = limitAlerts(prioritized, ctx.config.maxAlertsPerRepository)
    if (truncated.length > 0) {
        addTruncatedBySeverity(ctx.summary, truncated.map((item) => item.alert))
        ctx.logger.warn(truncatedWarning(ctx.config, truncated.length))
    }
    progress.alertsCount = limited.length
    progress.fixable = limited.filter((a) => a.fixable).length

    const [owner, name] = repo.split('/')
    progress.defaultBranch = await fetchDefaultBranch(client, owner, name)

    ctx.allAlerts.push(...limited)

    return limited
}

/**
 * 告警分区 + 同告警尝试判定的只读产物（在基线采样之前完成，不写工作区）。
 */
interface PlannedRepoFixAlerts {
    rootManifestAlerts: NormalizedSecurityAlert[]
    memberManifestAlerts: MemberManifestAlert[]
    /** 子目录 / 根直接依赖 lockfile 等需人工复核的告警（不进入修复链路） */
    submanifestAlerts: NormalizedSecurityAlert[]
}

/**
 * 步骤 1b（只读段）：依赖告警分区 + 同告警尝试判定。
 *
 * 拆出理由：两者都不写盘，可以在**修复前基线采样之前**跑完；这样「全部告警命中尝试上限」
 * 的运行不会为一次必然被跳过的工作付完整验证链，与零告警仓库的「无改动即豁免」同语义。
 */
async function planRepoFixAlerts(
    ctx: RepoFixCtx,
    client: Octokit | null,
    repo: string,
    limited: NormalizedSecurityAlert[],
): Promise<PlannedRepoFixAlerts> {
    // 子目录 / 根直接依赖 lockfile 告警（防护：docs vite 告警曾误降级根 vite@8→6）→ 剔除修复链路
    // 收尾审查遗留修复：code-scanning / code-quality 告警（manifestPath 为源码路径）不参与依赖清单分区，
    // 避免全部落 sub 桶产生 skip 计数噪音（其可见性由 §Code Scanning Suggestions / §Code Quality Findings 承担）
    const dependencyAlerts = limited.filter((a) => a.source !== 'code-scanning' && a.source !== 'code-quality')
    const partition = partitionSubmanifestAlerts(dependencyAlerts, ctx.workDir)
    const { rootAlerts: rootManifestAlerts, memberAlerts: memberManifestAlerts } = await applyRepeatedFailureSkips({
        ctx,
        index: ctx.attemptIndex,
        client,
        repo,
        attemptRepo: ctx.attemptRepo,
        rootAlerts: partition.root,
        memberAlerts: partition.member,
    })
    const skippedCount = (partition.root.length + partition.member.length)
        - (rootManifestAlerts.length + memberManifestAlerts.length)
    if (skippedCount > 0) {
        ctx.logger.info(
            `[repeated-failure] ${repo}: ${skippedCount} alert(s) skipped at the attempt limit — upgrade chain not started for them`,
        )
    }
    return {
        rootManifestAlerts,
        memberManifestAlerts,
        submanifestAlerts: partition.sub,
    }
}

/**
 * 步骤 1c（写盘段）：Code Scanning 模板修复 → 修复链路前置计数（必须在基线采样之后）。
 * @returns 依赖告警分区产物（root/member/lockfilePath）
 */
async function prepareRepoFixSets(
    ctx: RepoFixCtx,
    repo: string,
    planned: PlannedRepoFixAlerts,
    limited: NormalizedSecurityAlert[],
    progress: RepoFixProgress,
): Promise<LockfileAlertSets> {
    // 2.0 Code Scanning 模板修复（A 类白名单；与依赖升级链路并行、互不干扰）
    // 逐告警：快照 → 应用模板 → quickVerify（lint）→ 失败回滚（不静默）
    const csCounts = await runCodeScanningFixes(ctx, repo, limited)
    progress.fixed += csCounts.fixed
    progress.failed += csCounts.failed

    const { rootManifestAlerts, memberManifestAlerts, submanifestAlerts } = planned
    if (submanifestAlerts.length > 0) {
        ctx.logger.warn(
            `[alerts] ${submanifestAlerts.length} alert(s) from sub-directory / root-direct-dep manifest(s) skipped — manual review required: ${submanifestAlerts.map((a) => `${a.packageName} (${a.manifestPath})`).join(', ')}`,
        )
        addSkipped(ctx.summary, 'subdirectory-manifest', submanifestAlerts.length)
        recordSkippedAlerts(ctx, submanifestAlerts, 'subdirectory-manifest')
    }

    // 不可自动修复残差按告警逐条统计（忽略 dedupeFixableAlerts 合并差额：被合并告警仍可能由代表
    // action 修复）；放在分区处一次算净，使「整段跳过升级链」的路径也覆盖
    const notFixableAlerts = rootManifestAlerts.filter((alert) => !alert.fixable || !alert.recommendedVersion)
    addSkipped(ctx.summary, 'not-fixable', notFixableAlerts.length)
    // 明细只记真正不可修复的实例：fixable=true 但暂无推荐版本属「等上游」，保持 not-tried
    recordSkippedAlerts(ctx, notFixableAlerts.filter((alert) => !alert.fixable), 'not-fixable')

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
): Promise<{ singleVersionAlerts: NormalizedSecurityAlert[], stopReason?: 'environmental' | 'aborted' | 'budget' }> {
    const { rootManifestAlerts, lockfilePath } = sets
    let stopReason: 'environmental' | 'aborted' | 'budget' | undefined

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
        addSkipped(ctx.summary, 'cross-major', manualCrossMajorAlerts.length)
        recordSkippedAlerts(ctx, manualCrossMajorAlerts, 'cross-major')
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
    const batchItems: VersionedOverrideBatchItem[] = []
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
            // 显式记录：被保护名单跳过的实例不能被同包其他实例的包级成功覆盖
            recordSkippedAlerts(ctx, [alert], 'override-protected')
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
        // 防御性分支：multiVersionAlerts 已按「overrides 非空」过滤，当前不可达；
        // 保留以防上游过滤条件变化，并保持告警级收敛计数口径。
        if (Object.keys(versionedOverrides).length === 0) {
            ctx.logger.info(`Skipping ${alert.packageName}: no vulnerable instances below targets`)
            // 告警级计数：同包多告警共用一次包级判定，不能只 +1
            const convergedAlerts = multiVersionAlerts.filter((a) => a.packageName === alert.packageName)
            ctx.summary.alertsConverged += convergedAlerts.length
            // 防御性对齐：该分支当前不可达（已按 overrides 非空过滤），记录点无独立用例
            recordConvergedAlerts(ctx, convergedAlerts, 'no vulnerable instances below targets')
            continue
        }
        batchItems.push({
            alert,
            versionedOverrides,
            targets,
            // From 列展示用：写入前该包的锁定实例（多实例以 `, ` 连接）
            fromVersion: readLockfileVersions(lockfilePath, alert.packageName).join(', '),
            // 同包全部告警：peer-only 跳过按告警级展开（与逐包路径同源）
            alerts: multiVersionAlerts.filter((a) => a.packageName === alert.packageName),
        })
    }

    // 合批快路径（≥2 个包）：把 K 次完整安装压到 1 次；失败则回滚并由下方逐包路径重试。
    // 环境性失败（信号 / 超时 / 无 stderr 诊断）例外：逐包重试只会重复同一失败并耗尽单仓预算，直接跳过。
    const batchOutcome = batchItems.length > 1
        ? await tryBatchVersionedOverrides(ctx, repo, progress, batchItems)
        : { applied: false }
    const skippedByBatch = new Set(batchOutcome.skipPackages ?? [])
    const itemsToRetry = batchOutcome.applied || batchOutcome.skipSequential
        ? []
        : batchItems.filter((item) => !skippedByBatch.has(item.alert.packageName))

    if (batchOutcome.budgetStop) {
        stopReason = 'budget'
        return { singleVersionAlerts, stopReason }
    }
    if (batchOutcome.skipSequential) {
        stopReason = isAbortRequested() ? 'aborted' : 'environmental'
        return { singleVersionAlerts, stopReason }
    }

    for (const { alert, versionedOverrides } of itemsToRetry) {
        // 运行级取消（合批失败后的回退路径可能在中止后才走到）：不再逐个试装——
        // 取消态下每条都会以同一原因失败，产出 K 条「失败动作」只污染报告且无归因价值
        if (isAbortRequested()) {
            stopReason = 'aborted'
            break
        }
        if (!budgetAllows(ctx, { repository: repo, stage: 'fix', work: `versioned override for ${alert.packageName}` })) {
            stopReason = 'budget'
            break
        }
        const snapshot = snapshotTrackedFiles(ctx.workDir)
        await recordVerificationCheckpoint(ctx, repo, progress, `versioned-override:${alert.packageName}`)
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
            fromVersion: result.fromVersion || '',
            toVersion: result.toVersion,
            isMajor: false,
            strategy: 'versioned-override',
            success: result.success,
            error: result.error,
            durationMs: 0,
        }
        if (!result.success) {
            if (isAbortRequested()) {
                stopReason = 'aborted'
                break
            }
            if (result.environmental) {
                // 环境级失败（OOM / 超时）：不产出失败动作 / 不计入 alertsFailed（与合批路径同口径），
                // 记非归因审计条目后停止本仓库剩余安装尝试（含成员 / 分组升级）。
                markEnvironmentalInstallFailure(ctx, {
                    scope: 'multi-version',
                    repository: alert.repository,
                    target: alert.packageName,
                    error: result.error,
                })
                stopReason = 'environmental'
                break
            }
            if (result.manualReview) {
                // 无法通过 overrides 自动修复（当前仅 peer-only 实例）：已回滚，记跳过而非失败动作，
                // 同包告警按告警级明细同步（与 convergent 计数口径一致）。
                const packageAlerts = multiVersionAlerts.filter((a) => a.packageName === alert.packageName)
                addSkipped(ctx.summary, 'peer-only', packageAlerts.length)
                recordSkippedAlerts(ctx, packageAlerts, 'peer-only')
                ctx.logger.warn(`[multi-version] ${alert.packageName}: ${result.error ?? 'manual review required'}`)
                continue
            }
            ctx.allActions.push(action)
            recordUpgradeFailure(ctx, progress, 'multi-version', alert.packageName, result.error)
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

    if (stopReason) {
        return { singleVersionAlerts, stopReason }
    }

    const majorStopReason = await applyAutoMajorUpgrades(ctx, {
        client,
        repo,
        lockfilePath,
        alerts: autoMajorAlerts,
        progress,
    })
    return majorStopReason ? { singleVersionAlerts, stopReason: majorStopReason } : { singleVersionAlerts }
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
    if (isAbortRequested()) {
        return
    }
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
    // 同批告警目标（显式 upgradeGroups / 组内告警）优先于家族规则解析结果
    const familyTargets: Record<string, string> = {}
    for (const alert of fixableAlerts) {
        if (alert.recommendedVersion) {
            familyTargets[alert.packageName] = alert.recommendedVersion
        }
    }
    let snapshot: ReturnType<typeof snapshotTrackedFiles>

    for (const group of groups) {
        if (!budgetAllows(ctx, { repository: repo, stage: 'fix', work: `group upgrade "${group.name}"` })) {
            return
        }
        snapshot = snapshotTrackedFiles(ctx.workDir)
        await recordVerificationCheckpoint(ctx, repo, progress, `group:${group.name}`)

        const pendingActions: FixAction[] = []
        const upgradedInGroup: NormalizedSecurityAlert[] = []
        let environmentalStop = false

        for (const packageName of group.packages) {
            if (!budgetAllows(ctx, { repository: repo, stage: 'fix', work: `package upgrade (group "${group.name}")` })) {
                // 预算不足：不再启动新安装，交给组级校验 / 收尾（不回滚已应用的单元）
                break
            }
            const alert = alertByPackage.get(packageName)
            if (!alert) {
                continue
            }

            // 收敛判定分三种形态（2026-10-18 cookie-cloudflare undici 实证）：
            // - 最高实例 >= 目标且全部实例 >= 目标 → 已收敛
            // - 最高实例 >= 目标但仍有低实例 → 不能算已收敛（低 major / 其它 manifest），
            //   默认不跨 major 自动覆盖，按人工 review 计
            // - 最高实例 < 目标 → 走常规升级（no-downgrade 保护只在最高实例已达标时生效）
            const lockedVersions = readLockfileVersions(lockfilePath, alert.packageName)
            const highestVersion = lockedVersions.at(-1)
            if (highestVersion !== undefined && compareSemver(highestVersion, alert.recommendedVersion) >= 0) {
                const belowTarget = lockedVersions.filter(
                    (version) => compareSemver(version, alert.recommendedVersion) < 0,
                )
                if (belowTarget.length === 0) {
                    ctx.logger.info(
                        `Skipping ${alert.packageName}: all locked versions ${lockedVersions.join(', ')} >= target ${alert.recommendedVersion} (no upgrade needed)`,
                    )
                    // 告警级计数：dedupeFixableAlerts 后仍有代表告警，但同包全部告警都已收敛
                    const convergedAlerts = singleVersionAlerts.filter(
                        (a) => a.packageName === alert.packageName && a.fixable && a.recommendedVersion,
                    )
                    ctx.summary.alertsConverged += convergedAlerts.length
                    recordConvergedAlerts(ctx, convergedAlerts, 'all locked versions >= target')
                    continue
                }
                ctx.logger.warn(
                    `Skipping ${alert.packageName}: locked instance(s) ${belowTarget.join(', ')} remain below target ${alert.recommendedVersion} `
                    + '(lower-major / different manifest instance; cross-major upgrade or manual review required)',
                )
                addSkipped(ctx.summary, 'cross-major')
                // 同包多告警逐条展开（与收敛分支口径一致：明细是实例级事实，summary 仍是 action 级计数）
                recordSkippedAlerts(ctx, singleVersionAlerts.filter(
                    (a) => a.packageName === alert.packageName && a.fixable && a.recommendedVersion,
                ), 'cross-major')
                continue
            }
            if (lockedVersions.length === 0) {
                ctx.logger.warn(
                    `Could not resolve current version of ${alert.packageName} from lockfile — no-downgrade protection inactive`,
                )
            }

            const action = await upgradeAlert(ctx, alert, { familyTargets })
            pendingActions.push(action)
            if (!action.success) {
                // 运行级取消：剩余包装不下去，也不该产出 K 条同因失败动作（口径同多版本路径）
                if (isAbortRequested()) {
                    ctx.allActions.push(...pendingActions.filter((pending) => pending.success))
                    return
                }
                // 环境性安装失败不归因仓库，且继续试装只会重复同因失败 / 耗尽单仓预算
                if (action.environmentalFailure) {
                    environmentalStop = true
                    break
                }
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
            if (environmentalStop) {
                ctx.logger.warn(`[group] ${group.name}: environmental install failure — stopping further upgrade attempts for ${repo}`)
                return
            }
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
            if (environmentalStop) {
                ctx.logger.warn(`[group] ${group.name}: environmental install failure — stopping further upgrade attempts for ${repo}`)
                return
            }
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

        if (environmentalStop) {
            // 组级验证失败且环境已不可用：整组回滚并停机。环境性动作已随 !success 入列，此处只补记
            // 「已应用但随整组回滚作废」的动作（noOp 从未写盘，不改判也不入列，与常规路径同口径）。
            for (const action of pendingActions) {
                if (action.success && !action.noOp) {
                    action.success = false
                    action.error = 'group verification failed after environmental stop; changes rolled back'
                    progress.failed++
                    ctx.allActions.push(action)
                }
            }
            ctx.logger.warn(
                `[group] ${group.name}: environmental install failure — rolled back group, stopping further upgrade attempts for ${repo}`,
            )
            return
        }

        for (const alert of upgradedInGroup) {
            if (!budgetAllows(ctx, { repository: repo, stage: 'fix', work: `package upgrade ${alert.packageName} (group "${group.name}")` })) {
                return
            }
            await recordVerificationCheckpoint(ctx, repo, progress, `group:${group.name}:${alert.packageName}`)
            const action = await upgradeAlert(ctx, alert, { familyTargets })
            ctx.allActions.push(action)
            if (!action.success) {
                if (isAbortRequested()) {
                    return
                }
                if (action.environmentalFailure) {
                    ctx.logger.warn(
                        `[group] ${group.name}: environmental install failure during per-package retry — stopping further upgrade attempts for ${repo}`,
                    )
                    return
                }
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
                    `Rolled back ${alert.packageName} upgrade: per-package verification failed (see the [quick-verify] log for the failing command)`,
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
}
