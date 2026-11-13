import { In, type Repository as TypeOrmRepository } from 'typeorm'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth, requireRole, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { EMPTY_BATCH_SUMMARY } from '#server/services/batch/batch-aggregate'
import { getQueueService } from '#server/services/queue/queue.service'
import { releaseOrphanQueueJobs } from '#server/services/queue/orphan-job-release'
import { classifyRunFailure } from '#server/services/run-failure-classify'
import { logger } from '#server/utils/logger'

/**
 * POST /api/batch-runs/[id]/force-fail：手动强制结束批量运行。
 *
 * 场景：自动化 stale-cleanup 未触发（或间隔太长）时，admin 主动介入把卡住的 BatchRun
 * 及其下属 running/pending ScanRun 强制标记为 failed。
 *
 * 权限：admin 角色（与 Cron 兜底自动化形成互补——自动化覆盖 30 分钟+ 阈值，
 * 手动覆盖"30 分钟内但已确认卡死"的边缘场景）。
 *
 * 幂等：已终态的 BatchRun 直接返回，不重复写库；只有 status=running 时才执行转换。
 */

/**
 * 单个 run 的条件强制失败：只写 `running` / `pending` 行，返回是否真正写回。
 *
 * 抽成独立函数便于单测 `affected = 0`（并发终结）分支：HTTP 层不再整行 `save`，
 * 读-写间隙内被其它路径置终态的 run 不会被复活或重复改写。
 */
export async function forceFailScanRun(
    scanRepo: TypeOrmRepository<ScanRun>,
    runId: string,
    now: Date,
): Promise<boolean> {
    const forceFailure = { code: 'force_failed', message: 'admin 手动强制结束' }
    const classification = classifyRunFailure({ status: 'failed', error: forceFailure })
    const update = await scanRepo.createQueryBuilder()
        .update(ScanRun)
        .set({
            status: 'failed',
            finishedAt: now,
            errorJson: JSON.stringify(forceFailure),
            failureCode: classification.code,
            failureStage: classification.stage,
            failureKind: classification.kind,
        })
        .where('id = :id', { id: runId })
        .andWhere('status IN (:...startable)', { startable: ['running', 'pending'] })
        .execute()
    const written = (update.affected ?? 1) > 0
    if (!written) {
        logger.warn('[batch-runs] force_fail_write_skipped', { runId, reason: 'already_terminal' })
    }
    return written
}

export default defineEventHandler(async (event) => {
    await requireAuth(event)
    await requireRole(event, ['admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'BATCH_RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const batchRepo = ds.getRepository(BatchRun)
    const scanRepo = ds.getRepository(ScanRun)

    const batchRun = await batchRepo.findOne({ where: { id } })
    if (!batchRun) {
        throw createLocalizedError(event, { statusCode: 404, code: 'BATCH_RUN_NOT_FOUND' })
    }
    await requireOrgResource(event, batchRun.organizationId)

    // 幂等：已终态直接返回（不重复写库）
    if (batchRun.status !== 'running') {
        return {
            batchRunId: batchRun.id,
            scanRunsFailed: 0,
            alreadyTerminated: true,
            status: batchRun.status,
            finishedAt: batchRun.finishedAt,
            // 已终态批次不触碰队列；与主路径的 null 语义对齐
            queueReleased: null,
        }
    }

    const now = new Date()
    const staleRuns = await scanRepo.find({
        where: { batchRunId: id, status: In(['running', 'pending']) },
    })

    // 把所有下属 running/pending ScanRun 条件置 failed（已终态的并发改写不更新，见 queue-stale-recovery §9）
    const failedRuns: { id: string, repositoryId: string }[] = []
    for (const run of staleRuns) {
        if (await forceFailScanRun(scanRepo, run.id, now)) {
            failedRuns.push({ id: run.id, repositoryId: run.repositoryId })
        }
    }

    // 同步释放队列去重键：只改 DB 不释放 job 时，新触发仍会被 SCAN_PENDING_MERGED 合并
    // （手动"强制完成"后仍无法重新执行的实测根因）。队列不可用 / 同步模式仅记录告警，不阻断。
    let queueReleased: { removed: number, skipped: number } | null = null
    if (failedRuns.length > 0) {
        try {
            const queueService = await getQueueService()
            if (queueService.mode === 'async' && queueService.queue) {
                queueReleased = await releaseOrphanQueueJobs(
                    queueService.queue,
                    failedRuns.map((run) => ({ repositoryId: run.repositoryId, runId: run.id })),
                )
            }
        } catch (error) {
            console.warn(`[batch-runs] force-fail 释放队列 job 失败（不影响批次终态）:`, error)
        }
    }

    // BatchRun 自身条件置 failed：并发路径已终结时保留库内状态（不覆盖）
    const batchUpdate = await batchRepo.createQueryBuilder()
        .update(BatchRun)
        .set({
            status: 'failed',
            finishedAt: now,
            ...(batchRun.summaryJson ? {} : { summaryJson: JSON.stringify(EMPTY_BATCH_SUMMARY) }),
        })
        .where('id = :id', { id })
        .andWhere('status = :running', { running: 'running' })
        .execute()
    const batchWritten = (batchUpdate.affected ?? 1) > 0
    if (!batchWritten) {
        const current = await batchRepo.findOne({ where: { id } })
        logger.warn('[batch-runs] force-fail skipped (batch already terminal)', {
            batchRunId: id,
            currentStatus: current?.status ?? 'missing',
        })
        // 批次已被并发终结：已写回的 run 与队列释放结果如实返回（不丢计数与去重键释放）
        return {
            batchRunId: id,
            scanRunsFailed: failedRuns.length,
            alreadyTerminated: true,
            status: current?.status ?? 'unknown',
            finishedAt: current?.finishedAt ?? null,
            queueReleased,
        }
    }

    return {
        batchRunId: batchRun.id,
        scanRunsFailed: failedRuns.length,
        alreadyTerminated: false,
        status: 'failed',
        finishedAt: now,
        // null = 同步模式 / 队列不可用 / 无待释放 run；否则为实际释放统计
        queueReleased,
    }
})
