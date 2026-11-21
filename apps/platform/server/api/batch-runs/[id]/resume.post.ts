/**
 * POST /api/batch-runs/[id]/resume：批次级「继续执行未完成项」。
 *
 * 权限：admin / org_admin（与批量触发同权限面）。只接受未完成 / transient 子项；
 * 原批次仍有进行中子项、已有进行中的续跑批次、无可续跑子项时返回 409。
 * 派生新批次并记录 `resumedFromBatchRunId`，原批次历史终态不变。
 */
import { BatchResumeError, resumeBatchRun } from '#server/services/batch/batch-resume'
import { requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import { ensureDatabaseInitialized } from '#server/database'

const REJECTION: Record<BatchResumeError['reason'], { statusCode: number, code: 'BATCH_RUN_NOT_FOUND' | 'BATCH_RUN_RESUME_IN_PROGRESS' | 'BATCH_RUN_RESUME_ALREADY_RESUMING' | 'BATCH_RUN_RESUME_NOTHING_TO_RESUME' }> = {
    'not-found': { statusCode: 404, code: 'BATCH_RUN_NOT_FOUND' },
    'in-progress': { statusCode: 409, code: 'BATCH_RUN_RESUME_IN_PROGRESS' },
    'already-resuming': { statusCode: 409, code: 'BATCH_RUN_RESUME_ALREADY_RESUMING' },
    'nothing-to-resume': { statusCode: 409, code: 'BATCH_RUN_RESUME_NOTHING_TO_RESUME' },
}

export default defineEventHandler(async (event) => {
    const { user } = await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'BATCH_RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)

    try {
        const result = await resumeBatchRun({ batchRunId: id, organizationId, triggeredByUserId: user.id })
        return result
    } catch (error) {
        if (error instanceof BatchResumeError) {
            throw createLocalizedError(event, REJECTION[error.reason])
        }
        throw error
    }
})
