import { In } from 'typeorm'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth, requireRole, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { EMPTY_BATCH_SUMMARY } from '#server/services/batch/batch-aggregate'

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
        }
    }

    const now = new Date()

    // 把所有下属 running/pending ScanRun 标 failed
    const staleRuns = await scanRepo.find({
        where: {
            batchRunId: id,
            status: In(['running', 'pending']),
        },
    })
    for (const run of staleRuns) {
        run.status = 'failed'
        run.finishedAt = now
        run.errorJson = JSON.stringify({
            code: 'force_failed',
            message: 'admin 手动强制结束',
        })
    }
    if (staleRuns.length > 0) {
        await scanRepo.save(staleRuns)
    }

    // BatchRun 自身标 failed
    batchRun.status = 'failed'
    batchRun.finishedAt = now
    if (!batchRun.summaryJson) {
        batchRun.summaryJson = JSON.stringify(EMPTY_BATCH_SUMMARY)
    }
    await batchRepo.save(batchRun)

    return {
        batchRunId: batchRun.id,
        scanRunsFailed: staleRuns.length,
        alreadyTerminated: false,
        status: 'failed',
        finishedAt: batchRun.finishedAt,
    }
})
