import {
    type BatchAggregation,
    isUndecidedZeroChildRunning,
    resolveBatchFinishedAt,
    shouldWriteBackStatus,
} from './batch-aggregate'
import type { BatchRun } from '#server/entities/batch-run'
import type { ScanRun } from '#server/entities/scan-run'

/**
 * 把聚合结果写回 BatchRun 实体（原地变异），返回是否有字段变化（调用方据此决定是否 save）。
 *
 * 单一写回口径，供三处共用，避免逻辑漂移：
 * - 详情接口 `GET /api/batch-runs/[id]`（实时聚合，用户查看时收敛）
 * - 周期对账 `reconcileRunningBatchRuns()`（兜底，摆脱「看才发生」）
 * - sync 模式批量执行结束（串行跑完即立即终态化）
 *
 * 写回规则：
 * - 状态流转复用 `shouldWriteBackStatus`（仅 running 允许流转，failed 终态受保护）
 * - 计数 / summaryJson 仅在聚合值变化时写
 * - `finishedAt` 仅在首次到达 completed 时写入，取 `max(子项 finishedAt)`（真实完成时间）
 */
export const applyBatchAggregation = (batchRun: BatchRun, aggregation: BatchAggregation, runs: ScanRun[]): boolean => {
    // 零子项 + running：终态未定，任何通道都不得按 completed 收敛（否则孤儿被永久固化）
    if (isUndecidedZeroChildRunning(batchRun.status, runs.length)) {
        return false
    }
    const statusWriteBack = shouldWriteBackStatus(batchRun.status, aggregation.status)
    const countsChanged =
        aggregation.finishedCount !== batchRun.finishedCount
        || aggregation.completedCount !== batchRun.completedCount
        || aggregation.failedCount !== batchRun.failedCount
        || aggregation.pendingCount !== batchRun.pendingCount

    if (!statusWriteBack && !countsChanged) {
        return false
    }

    if (statusWriteBack) {
        batchRun.status = aggregation.status
    }
    batchRun.finishedCount = aggregation.finishedCount
    batchRun.completedCount = aggregation.completedCount
    batchRun.failedCount = aggregation.failedCount
    batchRun.pendingCount = aggregation.pendingCount
    batchRun.summaryJson = JSON.stringify(aggregation.summary)
    if (aggregation.status === 'completed' && !batchRun.finishedAt) {
        batchRun.finishedAt = resolveBatchFinishedAt(runs)
    }
    return true
}
