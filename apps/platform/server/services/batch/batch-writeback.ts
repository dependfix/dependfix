import type { Repository } from 'typeorm'
import {
    type BatchAggregation,
    isUndecidedZeroChildRunning,
    resolveBatchFinishedAt,
    shouldWriteBackStatus,
} from './batch-aggregate'
import type { BatchRun } from '#server/entities/batch-run'
import type { ScanRun } from '#server/entities/scan-run'

/**
 * 把聚合结果写回 BatchRun 实体（原地变异），返回是否有字段变化
 * （`persistBatchAggregation` 据此决定是否发起条件 UPDATE）。
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

/** 条件写回结果：`changed` = 聚合判定有字段变化；`persisted` = 实际落库（affected > 0） */
export interface BatchPersistResult {
    changed: boolean
    persisted: boolean
}

/**
 * 条件写回载荷：状态 / 计数 / summary / finishedAt + 显式 `updatedAt`。
 * `update()` 不触发 `@UpdateDateColumn` 自动更新，须显式写入以驱动前端增量 reconcile。
 */
const toUpdatePayload = (batchRun: BatchRun) => ({
    status: batchRun.status,
    finishedCount: batchRun.finishedCount,
    completedCount: batchRun.completedCount,
    failedCount: batchRun.failedCount,
    pendingCount: batchRun.pendingCount,
    summaryJson: batchRun.summaryJson,
    finishedAt: batchRun.finishedAt,
    updatedAt: new Date(),
})

/**
 * 条件写回（仅当库中该批次仍为 `running`）：供状态流转与孤儿 `failed` 落库使用。
 * 若并发 admin `force-fail` 已把库中状态改为 `failed`，条件不匹配（affected = 0），
 * 不会把 `failed` 覆盖回 `completed` / `running`。
 * @returns 是否确实更新（affected > 0）
 */
export const persistBatchIfRunning = async (
    batchRepo: Repository<BatchRun>,
    batchRun: BatchRun,
): Promise<boolean> => {
    const result = await batchRepo.update({ id: batchRun.id, status: 'running' }, toUpdatePayload(batchRun))
    return (result.affected ?? 0) > 0
}

/**
 * 聚合结果条件写回：把 `applyBatchAggregation` 的原地变异落库，并以**读取时状态**作为乐观锁条件。
 *
 * 三处聚合写回（详情 GET / 周期对账 / sync 执行尾部）统一复用本函数，避免逻辑漂移：
 * - 状态流转（running → 终态）与计数对齐在同一条条件 UPDATE 内完成；
 * - 并发 admin `force-fail` 抢先时条件不匹配 → 跳过写回，绝不覆盖 `failed` 终态；
 * - 非 running 批次（如已 `failed`）在库中状态与读取值一致时仍按契约对齐计数。
 *
 * 调用方在 `persisted === false` 时应以库中实际状态为准，避免响应与库不一致。
 */
export const persistBatchAggregation = async (
    batchRepo: Repository<BatchRun>,
    batchRun: BatchRun,
    aggregation: BatchAggregation,
    runs: ScanRun[],
): Promise<BatchPersistResult> => {
    const storedStatus = batchRun.status
    if (!applyBatchAggregation(batchRun, aggregation, runs)) {
        return { changed: false, persisted: false }
    }
    const result = await batchRepo.update({ id: batchRun.id, status: storedStatus }, toUpdatePayload(batchRun))
    return { changed: true, persisted: (result.affected ?? 0) > 0 }
}
