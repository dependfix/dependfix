import { z } from 'zod'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireV1Auth } from '#server/utils/api-key-guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { parseLogEntries } from '#server/utils/memory-logger'
import { digestLogEntries, paginateDigest, prepareRawLogEntries } from '#shared/log-digest'

/**
 * GET /api/v1/runs/{id}/logs：运行日志（只读，read scope）。
 *
 * - `view=grouped`（默认）按模板聚合，分页单位 = 组；`view=raw` 按条目分页
 * - 两种视图共用 `shared/log-digest` 的清洗通道（与 Web UI 聚合档同源）
 * - `pageSize` 默认 50 / 最大 200；`droppedBefore` 披露采集侧已丢弃条目
 */
const levelValues = ['debug', 'info', 'warn', 'error'] as const
const querySchema = z.object({
    view: z.enum(['grouped', 'raw']).default('grouped'),
    level: z.string().max(64).optional(),
    q: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).default(50).transform((value) => Math.min(value, 200)),
})

export default defineEventHandler(async (event) => {
    const auth = await requireV1Auth(event, { requireScope: 'read', rateLimitClass: 'log' })
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'RUN_ID_MISSING' })
    }
    const parsed = querySchema.safeParse(getQuery(event))
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'API_V1_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }
    const { view, level, q, page, pageSize } = parsed.data
    let levels: string[] | undefined
    if (level) {
        const parts = level.split(',').map((item) => item.trim()).filter(Boolean)
        if (parts.some((item) => !(levelValues as readonly string[]).includes(item))) {
            throw createLocalizedError(event, {
                statusCode: 400,
                code: 'API_V1_VALIDATION_FAILED',
                data: { issues: [{ path: ['level'], message: `level must be one of ${levelValues.join(', ')}` }] },
            })
        }
        levels = parts.length > 0 ? parts : undefined
    }

    const ds = await ensureDatabaseInitialized()
    const run = await ds.getRepository(ScanRun).findOne({
        where: { id },
        relations: { repository: true },
    })
    if (!run) {
        throw createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
    }
    if (run.repository?.organizationId !== auth.organizationId) {
        throw createLocalizedError(event, { statusCode: 403, code: 'RESOURCE_NOT_IN_ORG' })
    }

    const entries = parseLogEntries(run.logsJson)
    if (entries.length === 0) {
        throw createLocalizedError(event, { statusCode: 404, code: 'RUN_LOGS_NOT_FOUND' })
    }

    setHeader(event, 'Cache-Control', 'no-store')
    if (view === 'raw') {
        const result = prepareRawLogEntries(entries, {
            level: levels,
            query: q,
            page,
            pageSize,
            droppedBefore: run.logsDropped ?? null,
        })
        return { view, ...result }
    }
    const digest = digestLogEntries(entries, {
        level: levels,
        query: q,
        droppedBefore: run.logsDropped ?? null,
    })
    return { view, ...paginateDigest(digest, page, pageSize) }
})
