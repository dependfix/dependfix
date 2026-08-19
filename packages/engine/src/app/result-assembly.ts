// result-assembly.ts：从 app/helpers.ts 拆出的"结果汇总"段落。
// 控制 app/helpers.ts 行数（max-lines 800），保持向后兼容：原 helpers.ts 通过
// re-export 透出以下函数，内部消费者无需调整 import。
import type {
    RunReportConfig,
    RunResult,
    AiUsageAggregate,
    SupplyChainWarning,
} from '@dependfix/core'
import type { AiUsage } from '../ai/usage'
import type { AppContext } from './helpers'

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------

/** 汇总所有动作到 summary（alertsSkipped 已在 repo-fix 修复管线中累加）。 */
export function computeSummary(
    ctx: Pick<AppContext, 'allActions' | 'allAlerts' | 'repoResults' | 'summary'>,
): void {
    const { allActions, allAlerts, repoResults, summary } = ctx

    let fixed = 0
    let failed = 0
    let lockfileRepairs = 0
    let verificationsPassed = 0
    let verificationsFailed = 0

    for (const action of allActions) {
        // noOp（如 code-scanning 修复时文件已合规）不计入 fixed/failed（口径与 repoResults 一致）
        if (action.noOp) {
            continue
        }
        // AI 辅助动作（ai-patch 修复 / ai-suggestion 建议）是过程证据，不计入 fixed/failed——
        // 告警结果由主动作（major-upgrade 等）代表，避免同告警重复计数
        if (action.strategy === 'ai-patch' || action.strategy === 'ai-suggestion') {
            continue
        }
        if (action.type === 'dependency-upgrade' || action.type === 'code-scanning-fix') {
            if (action.success) {
                fixed++
            } else {
                failed++
            }
        }
        if (action.type === 'lockfile-repair' && action.success) {
            lockfileRepairs++
        }
        if (action.type === 'verification') {
            if (action.success) {
                verificationsPassed++
            } else {
                verificationsFailed++
            }
        }
    }

    const fixable = allAlerts.filter((a) => a.fixable).length

    // 用 repoResults 而非 config.repositories：pnpm-audit + 无 remote 时
    // config.repositories 为空但实际处理了 1 个 local 仓库（报告可审计性）
    summary.repositoriesScanned = repoResults.length
    summary.alertsFound = allAlerts.length
    summary.alertsFixable = fixable
    summary.alertsFixed = fixed
    summary.alertsFailed = failed
    summary.lockfileRepairs = lockfileRepairs
    summary.verificationsPassed = verificationsPassed
    summary.verificationsFailed = verificationsFailed
}

export function buildRunResult(
    ctx: Pick<AppContext, 'config' | 'runId' | 'startedAt' | 'finishedAt' | 'summary' | 'repoResults' | 'allAlerts' | 'allActions' | 'allErrors'>,
    aiUsage?: AiUsageAggregate, supplyChainWarnings?: SupplyChainWarning[],
): RunResult {
    const reportConfig: RunReportConfig = {
        mode: ctx.config.mode,
        severityThreshold: ctx.config.severityThreshold,
        repositories: ctx.config.repositories,
        dryRun: ctx.config.dryRun,
        createPullRequest: ctx.config.createPullRequest,
        maxAlertsPerRepository: ctx.config.maxAlertsPerRepository,
        alertSource: ctx.config.alertSource,
        codeScanningEnabled: ctx.config.codeScanningEnabled,
    }

    return {
        runId: ctx.runId,
        startedAt: ctx.startedAt,
        finishedAt: ctx.finishedAt,
        config: reportConfig,
        summary: ctx.summary,
        repositories: ctx.repoResults,
        alerts: ctx.allAlerts,
        actions: ctx.allActions,
        errors: ctx.allErrors,
        aiUsage: aiUsage && aiUsage.calls > 0 ? aiUsage : undefined,
        supplyChainWarnings: supplyChainWarnings && supplyChainWarnings.length > 0 ? supplyChainWarnings : undefined,
    }
}

/**
 * 聚合一次 AI 研判消耗到 run 级累计。
 * - 单次未调用（usage 为 undefined）幂等返回原累计
 * - 成本合并：任一侧 undefined 时结果 undefined（模型无单价 → 不做误导性估算）
 */
export function mergeAiUsage(
    aggregate: AiUsageAggregate | undefined,
    usage: AiUsage | undefined,
): AiUsageAggregate | undefined {
    if (!usage || usage.calls === 0) {
        return aggregate
    }
    const next: AiUsageAggregate = {
        calls: (aggregate?.calls ?? 0) + usage.calls,
        inputTokens: (aggregate?.inputTokens ?? 0) + usage.inputTokens,
        outputTokens: (aggregate?.outputTokens ?? 0) + usage.outputTokens,
        totalTokens: (aggregate?.totalTokens ?? 0) + usage.totalTokens,
    }
    // 成本合并语义：
    // - 首次聚合（aggregate 为空）→ 直接采用本次成本（含 undefined）
    // - 两侧均有单价 → 相加
    // - 已有累计成本而本次无单价（或反之）→ 整体 undefined（同模型单价一致，
    //   混合只会由异常配置产生，保守不估算，避免误导）
    if (aggregate === undefined) {
        next.estimatedCostUsd = usage.estimatedCostUsd
    } else if (aggregate.estimatedCostUsd === undefined || usage.estimatedCostUsd === undefined) {
        next.estimatedCostUsd = undefined
    } else {
        next.estimatedCostUsd = aggregate.estimatedCostUsd + usage.estimatedCostUsd
    }
    return next
}

/**
 * 计算退出码：
 * - 0: 全部仓库处理成功（无 failed actions、无 errors）
 * - 1: 部分仓库失败
 * - 2: 全部仓库失败（或无仓库被成功处理）
 *
 * 语义注记：AI 辅助动作（ai-patch）失败计入 exit code（fail-safe——AI 修复失败
 * 说明 breaking change 未解决，应报红提醒人工），但不计入 summary.alertsFailed
 * （告警结果由主动作代表；见 computeSummary 的 ai 辅助动作排除规则）。
 */
export function computeExitCode(
    ctx: Pick<AppContext, 'config' | 'allErrors' | 'allActions' | 'repoResults'>,
): number {
    const { config, allErrors, allActions, repoResults } = ctx
    const hasErrors = allErrors.length > 0
    const hasFailures = allActions.some((a) => !a.success)
    // 保守判定：dry-run 下成功仓库的 verificationPassed 为 undefined、alertsCount 可能为 0，
    // 与失败仓库并存时会被判为"无成功"（返回 2 而非 1）——fail-safe 方向可接受
    // （验证失败 verificationPassed === false 不算成功交付，改动已回滚）
    const hasRepoSuccess = repoResults.length > 0
        && repoResults.some((r) => r.verificationPassed !== false
            && (r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true))
    const hasCleanupSuccess = config.mode === 'cleanup-branches' // 该模式不填充 repoResults，以成功 branch-cleanup 判定
        && allActions.some((a) => a.success && a.type === 'branch-cleanup')
    const hasSuccess = hasRepoSuccess || hasCleanupSuccess

    if (!hasErrors && !hasFailures) {
        return 0
    }

    if (hasSuccess) {
        return 1
    }

    return 2
}
