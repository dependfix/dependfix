/**
 * 批量运行聚合统计纯函数。
 * 输入：下属 ScanRun 列表（+ 可选 ScanResult 明细）→ 输出 BatchRun 的终态判定与跨仓库统计。
 * 聚合更新策略（设计 §5.2 双通道）：详情接口 GET /api/batch-runs/[id] 实时计算写回（用户查看时收敛）
 * + 周期兜底对账 batch-reconciler.ts（收敛未被查看的批次），不引入 Worker 回调机制（降低耦合）。
 */
import type { BatchRunStatus } from '#server/entities/batch-run'
import type { ScanResult } from '#server/entities/scan-result'
import type { ScanRun } from '#server/entities/scan-run'

/** 跨仓库聚合统计（BatchRun.summaryJson 形状） */
export interface BatchSummary {
    /** 告警总数（各 completed run 的 summary.alertsFound 求和） */
    alertsTotal: number
    /** 按严重级别分组计数（completed run 的 ScanResult.severity 分布） */
    severityCounts: Record<string, number>
    /** 修复总数（各 completed run 的 summary.alertsFixed 求和） */
    fixedCount: number
}

/** 聚合推导结果（写回 BatchRun 的计数/状态/summary 字段子集） */
export interface BatchAggregation {
    finishedCount: number
    completedCount: number
    failedCount: number
    degradedCount: number
    pendingCount: number
    status: BatchRunStatus
    summary: BatchSummary
}

/** 终态状态集合（聚合计数口径：completed + failed + dispatched + degraded 均计终态）。
 * degraded 是 sandbox 启动时降级的终态——业务结果完整（与 completed 等价口径计入 alertsTotal/fixedCount），
 * 但因路径偏离不计入 completedCount；详见 executor-sandbox.md §7.8.4 */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'dispatched', 'degraded'])

/** 解析 ScanRun.summaryJson（core RunSummary 形状），非法/缺失返回零值（防御：落库路径已控制） */
const parseRunSummary = (raw: string | null | undefined): { alertsFound: number, alertsFixed: number } => {
    if (!raw) {
        return { alertsFound: 0, alertsFixed: 0 }
    }
    try {
        const parsed = JSON.parse(raw) as { alertsFound?: unknown, alertsFixed?: unknown }
        return {
            alertsFound: typeof parsed.alertsFound === 'number' ? parsed.alertsFound : 0,
            alertsFixed: typeof parsed.alertsFixed === 'number' ? parsed.alertsFixed : 0,
        }
    } catch {
        return { alertsFound: 0, alertsFixed: 0 }
    }
}

/** 空批次聚合恒等值（无下属 run；供 executeBatchRun 空批次终态兜底复用） */
export const EMPTY_BATCH_SUMMARY: BatchSummary = { alertsTotal: 0, severityCounts: {}, fixedCount: 0 }

/**
 * 批量完成的真实时间：取下属 ScanRun 中最晚的 finishedAt，而非「聚合发生的时刻」。
 * 批次到达终态是由周期对账 / 详情查看触发，若用触发时刻会导致 finishedAt 被记为
 * 首次查看时间（生产事故：4 条早批次 finishedAt 均为同一查看时刻）。
 * 无任何带 finishedAt 的子项时回退 fallback（默认当前时刻）——零子项批次无真实完成时间。
 */
export const resolveBatchFinishedAt = (runs: ScanRun[], fallback: Date = new Date()): Date => {
    let latest = 0
    for (const run of runs) {
        const time = run.finishedAt ? run.finishedAt.getTime() : 0
        if (time > latest) {
            latest = time
        }
    }
    return latest > 0 ? new Date(latest) : fallback
}

/**
 * 聚合纯函数：多 ScanRun → 终态判定 + 跨仓库统计。
 * - 状态计数：pending/running 为进行中；completed/failed/dispatched 为终态
 * - 整体状态：进行中数归零即 completed（含部分失败——整体完成而非全部成功，见设计 §5.2）
 * - summary：alertsTotal/fixedCount 仅取 completed run 的 summary 求和；
 *   severityCounts 取 completed run 的 ScanResult 明细分组（非 completed 的结果不入统计）
 */
export const aggregateScanRuns = (runs: ScanRun[], results: ScanResult[] = []): BatchAggregation => {
    let finishedCount = 0
    let completedCount = 0
    let failedCount = 0
    let degradedCount = 0
    let pendingCount = 0
    let alertsTotal = 0
    let fixedCount = 0

    const completedRunIds = new Set<string>()
    for (const run of runs) {
        if (TERMINAL_STATUSES.has(run.status)) {
            finishedCount++
        }
        if (run.status === 'completed') {
            completedCount++
            completedRunIds.add(run.id)
            const summary = parseRunSummary(run.summaryJson)
            alertsTotal += summary.alertsFound
            fixedCount += summary.alertsFixed
        } else if (run.status === 'degraded') {
            // degraded 是业务结果完整的路径偏离终态——summaryJson 存在则计入 alertsTotal/fixedCount
            // 但独立计 degradedCount（不混入 completedCount）；ScanResult 参与 severityCounts（业务完整）
            degradedCount++
            completedRunIds.add(run.id)
            const summary = parseRunSummary(run.summaryJson)
            alertsTotal += summary.alertsFound
            fixedCount += summary.alertsFixed
        } else if (run.status === 'failed') {
            failedCount++
        } else if (run.status === 'pending' || run.status === 'running') {
            // 仅进行中状态计 pending 桶（dispatched/未知状态不落桶：dispatched 是终态，未知状态防御性忽略）
            pendingCount++
        }
    }

    const severityCounts: Record<string, number> = {}
    for (const result of results) {
        if (!completedRunIds.has(result.scanRunId)) {
            continue
        }
        severityCounts[result.severity] = (severityCounts[result.severity] ?? 0) + 1
    }

    return {
        finishedCount,
        completedCount,
        failedCount,
        degradedCount,
        pendingCount,
        status: pendingCount === 0 ? 'completed' : 'running',
        summary: { alertsTotal, severityCounts, fixedCount },
    }
}

/**
 * 轮询聚合写回决策：聚合状态是否允许覆盖 BatchRun 存储状态。
 * failed 是 executor 显式落库的终态（async 全部入队失败，无下属 run），聚合只产出
 * completed/running，覆盖会把它"修复"成 completed——仅 running 态允许流转。
 */
export const shouldWriteBackStatus = (storedStatus: string, aggregationStatus: string): boolean =>
    storedStatus === 'running' && aggregationStatus !== storedStatus

/**
 * 「零子项 + running」= 终态未定：既可能是 async 正在逐个建子项的窗口，也可能是孤儿
 * （触发进程异常 / 子仓库级联删除）。两种通道都不得按 completed 收敛：
 * - 详情接口：不得把孤儿永久固化为 completed（否则周期对账只扫 running，永远纠正不回来）
 * - 周期对账：未超阈值保持不动，超阈值按孤儿 failed 处理
 */
export const isUndecidedZeroChildRunning = (storedStatus: string, runCount: number): boolean =>
    storedStatus === 'running' && runCount === 0
