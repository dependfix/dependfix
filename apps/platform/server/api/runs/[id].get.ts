import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { parseLogEntries, formatLogEntries } from '#server/utils/memory-logger'
import { toRunDetailView } from '#server/services/view/runs'

/** GET /api/runs/[id]：扫描详情（含结果明细 + 执行日志） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'RUN_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const runRepo = ds.getRepository(ScanRun)
    const resultRepo = ds.getRepository(ScanResult)

    const run = await runRepo.findOne({
        where: { id },
        relations: { repository: true },
    })
    if (!run) {
        throw createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
    }

    const results = await resultRepo.find({
        where: { scanRunId: run.id },
        // 同 severity 并列时按主键 DESC 兜底（api.md §4 排序确定性），避免结果明细行序抖动
        order: { severity: 'ASC', id: 'DESC' },
    })

    // 解析执行日志
    const logEntries = parseLogEntries(run.logsJson)
    const logsText = logEntries.length > 0 ? formatLogEntries(logEntries) : null

    return toRunDetailView({ run, results, logs: logEntries, logsText })
})
