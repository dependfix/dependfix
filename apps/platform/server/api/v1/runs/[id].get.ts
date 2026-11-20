import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { toRunV1DetailView } from '#server/services/view/runs'

/**
 * GET /api/v1/runs/{id}：单次运行详情（只读）。
 *
 * 响应**不含** `logs` / `logsText`（日志由 `/api/v1/runs/{id}/logs` digest 契约提供，本期未交付）；
 * 结果行自由文本经 `sanitizeString` 清洗，组织隔离与内部端点一致。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const run = await ds.getRepository(ScanRun).findOne({
        where: { id },
        relations: { repository: true },
    })
    if (!run) {
        throw createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
    }
    await requireOrgResource(event, run.repository?.organizationId)

    const results = await ds.getRepository(ScanResult).find({
        where: { scanRunId: run.id },
        order: { severity: 'ASC', id: 'DESC' },
    })

    return toRunV1DetailView(run, results)
})
