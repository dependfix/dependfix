import { In } from 'typeorm'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { aggregateScanRuns, isUndecidedZeroChildRunning } from '#server/services/batch/batch-aggregate'
import { persistBatchAggregation } from '#server/services/batch/batch-writeback'

/**
 * GET /api/batch-runs/[id]：批量运行详情（含聚合统计 + 下属 ScanRun 列表）。
 * 聚合更新策略（设计 §5.2）：查询下属 ScanRun 实时聚合统计并写回 BatchRun
 * （状态/计数/summary/finishedAt；状态流转 running → completed 时落 finishedAt = max(子项 finishedAt)），
 * 用户查看时即时收敛；未被查看的批次由周期兜底对账（batch-reconciler.ts）收敛。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'BATCH_RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const batchRepo = ds.getRepository(BatchRun)
    let batchRun = await batchRepo.findOne({ where: { id } })
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

    // 实时聚合 → 条件写回（用户查看时收敛；周期兜底见 batch-reconciler.ts，两者共用 persistBatchAggregation）
    // failed 终态保护：failed 是 executor 显式落库的终态（async 全部入队失败，无下属 run），
    // 条件写回以「读取时状态」为乐观锁——并发 admin force-fail 抢先时跳过，不覆盖 failed
    const aggregation = aggregateScanRuns(runs, results)
    const { changed, persisted } = await persistBatchAggregation(batchRepo, batchRun, aggregation, runs)
    if (changed && !persisted) {
        // 条件写回被保护性跳过（库中状态已被并发改为终态）：以库中实际状态为准，避免响应与库不一致
        batchRun = await batchRepo.findOne({ where: { id } }) ?? batchRun
    }

    // 对外状态：failed 终态取存储值（聚合无法表达）；「零子项 + running」是终态未定
    // （async 正在建子项窗口 / 孤儿），保持 running 交由周期对账按阈值处理；其余取实时聚合值
    let effectiveStatus: string = aggregation.status
    if (isUndecidedZeroChildRunning(batchRun.status, runs.length)) {
        effectiveStatus = 'running'
    }
    if (batchRun.status === 'failed') {
        effectiveStatus = 'failed'
    }

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
