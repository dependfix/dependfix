import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { parseLogEntries, formatLogEntries } from '#server/utils/memory-logger'

/**
 * GET /api/runs/[id]/logs：下载单个 run 的执行日志（`text/plain` 附件）。
 *
 * - 鉴权与组织隔离：`requireAuth`（未登录 401）+ `requireOrgResource`（跨组织 403）。
 *   注：`requireOrgResource` 较既有 `/api/runs/[id]`（仅 `requireAuth`）更严，属防御性加强（单组织模型下无实际差异）。
 * - 附件名含 runId（`run-<id>.txt`），内容与 `GET /api/runs/[id]` 的 `logsText` 同源
 *   （同一 `parseLogEntries` / `formatLogEntries`）
 * - 无日志 → 404 `RUN_LOGS_NOT_FOUND`（前端下载入口在无日志时隐藏）
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

    const entries = parseLogEntries(run.logsJson)
    if (entries.length === 0) {
        throw createLocalizedError(event, { statusCode: 404, code: 'RUN_LOGS_NOT_FOUND' })
    }

    const filename = `run-${run.id}.txt`
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    return formatLogEntries(entries)
})
