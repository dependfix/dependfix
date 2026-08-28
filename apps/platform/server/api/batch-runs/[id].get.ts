import { In } from 'typeorm'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { aggregateScanRuns, shouldWriteBackStatus } from '#server/services/batch/batch-aggregate'

/**
 * GET /api/batch-runs/[id]：批量运行详情（含聚合统计 + 下属 ScanRun 列表）。
 * 聚合更新策略（设计 §5.2 方案 A 轮询更新）：查询下属 ScanRun 实时聚合统计并写回 BatchRun
 * （状态/计数/summary/finishedAt；状态流转 running → completed 时落 finishedAt），
 * 前端轮询本端点即触发进度收敛——不引入 Worker 回调机制。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'BATCH_RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const batchRepo = ds.getRepository(BatchRun)
    const batchRun = await batchRepo.findOne({ where: { id } })
    if (!batchRun) {
        throw createLocalizedError(event, { statusCode: 404, code: 'BATCH_RUN_NOT_FOUND' })
    }
    await requireOrgResource(event, batchRun.organizationId)

    const runs = await ds.getRepository(ScanRun).find({
        where: { batchRunId: id },
        order: { createdAt: 'ASC' },
        relations: { repository: true },
    })
    const results = runs.length > 0
        ? await ds.getRepository(ScanResult).find({ where: { scanRunId: In(runs.map((r) => r.id)) } })
        : []

    // 实时聚合 → 写回（轮询更新策略：仅值变化时落库，避免无谓写放大）
    // failed 终态保护：failed 是 executor 显式落库的终态（async 全部入队失败，无下属 run），
    // 聚合只产出 completed/running——用 shouldWriteBackStatus 判定流转，failed 保持 executor 终态
    const aggregation = aggregateScanRuns(runs, results)
    const statusWriteBack = shouldWriteBackStatus(batchRun.status, aggregation.status)
    if (statusWriteBack
        || aggregation.finishedCount !== batchRun.finishedCount
        || aggregation.completedCount !== batchRun.completedCount
        || aggregation.failedCount !== batchRun.failedCount
        || aggregation.pendingCount !== batchRun.pendingCount) {
        if (statusWriteBack) {
            batchRun.status = aggregation.status
        }
        batchRun.finishedCount = aggregation.finishedCount
        batchRun.completedCount = aggregation.completedCount
        batchRun.failedCount = aggregation.failedCount
        batchRun.pendingCount = aggregation.pendingCount
        batchRun.summaryJson = JSON.stringify(aggregation.summary)
        if (aggregation.status === 'completed' && !batchRun.finishedAt) {
            batchRun.finishedAt = new Date()
        }
        await batchRepo.save(batchRun)
    }

    // 对外状态：failed 终态取存储值（聚合无法表达）；其余取实时聚合值
    const effectiveStatus = batchRun.status === 'failed' ? 'failed' : aggregation.status

    return {
        id: batchRun.id,
        source: batchRun.source,
        scheduleId: batchRun.scheduleId,
        mode: batchRun.mode,
        severityThreshold: batchRun.severityThreshold,
        repositoryCount: batchRun.repositoryCount,
        finishedCount: aggregation.finishedCount,
        completedCount: aggregation.completedCount,
        failedCount: aggregation.failedCount,
        pendingCount: aggregation.pendingCount,
        summary: aggregation.summary,
        status: effectiveStatus,
        finishedAt: batchRun.finishedAt,
        createdAt: batchRun.createdAt,
        runs: runs.map((r) => ({
            id: r.id,
            repositoryId: r.repositoryId,
            owner: r.repository?.owner ?? null,
            name: r.repository?.name ?? null,
            mode: r.mode,
            severityThreshold: r.severityThreshold,
            executorKind: r.executorKind,
            status: r.status,
            startedAt: r.startedAt,
            finishedAt: r.finishedAt,
            runUrl: r.runUrl,
            summary: r.summaryJson ? JSON.parse(r.summaryJson) as Record<string, unknown> : null,
            error: r.errorJson ? JSON.parse(r.errorJson) as { code: string, message: string } : null,
        })),
    }
})
