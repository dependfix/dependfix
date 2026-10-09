import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import { buildRunsWhere, runsFilterSchema, type RunsFilterInput } from '#server/utils/runs-query'
import { parseLogEntries, formatLogEntries } from '#server/utils/memory-logger'

/**
 * 批量日志导出上限（硬上限 + 明确报错，不 OOM）：
 * - `MAX_EXPORT_RUNS`：单次导出的运行数上限（超出 → 413，提示缩小筛选）
 * - `MAX_EXPORT_BYTES`：合并文本总字节上限（逐 run 追加时累计，超出即中止 → 413）
 */
export const MAX_EXPORT_RUNS = 100
export const MAX_EXPORT_BYTES = 5 * 1024 * 1024

const SEPARATOR = '='.repeat(80)

/** 描述本次导出实际生效的筛选（写入文件头，便于归档追溯） */
const describeFilters = (filters: RunsFilterInput): string[] => {
    const lines: string[] = []
    if (filters.repositoryId) {
        lines.push(`# 筛选：repositoryId=${filters.repositoryId}`)
    }
    if (filters.status) {
        lines.push(`# 筛选：status=${filters.status.join(',')}`)
    }
    if (filters.failureStage) {
        lines.push(`# 筛选：failureStage=${filters.failureStage.join(',')}`)
    }
    if (filters.failureKind) {
        lines.push(`# 筛选：failureKind=${filters.failureKind.join(',')}`)
    }
    return lines
}

/** 单个 run 的导出小节（标题行含 runId / 仓库 / 状态 / 开始时间；无日志给占位说明） */
export const buildRunSection = (run: ScanRun): string => {
    const entries = parseLogEntries(run.logsJson)
    const body = entries.length > 0 ? formatLogEntries(entries) : '（无执行日志）'
    const repo = run.repository ? `${run.repository.owner}/${run.repository.name}` : '—'
    const startedAt = run.startedAt ? run.startedAt.toISOString() : '—'
    const title = `# Run ${run.id} | ${repo} | ${run.status} | ${startedAt}`
    return `\n${SEPARATOR}\n${title}\n${SEPARATOR}\n${body}\n`
}

/** 附件名时间戳（`runs-logs-YYYYMMDD-HHmmss.txt`） */
const buildFilename = (now = new Date()): string => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    return `runs-logs-${stamp}.txt`
}

/**
 * GET /api/runs/logs-export：按当前筛选条件批量导出执行日志（合并为单个 `text/plain` 附件）。
 *
 * - 筛选口径与 `GET /api/runs` 完全一致（共用 `runsFilterSchema` + `buildRunsWhere`，含组织隔离）
 * - 合并单文件（多 run 以分隔头区分），不引入 zip 依赖
 * - 硬上限：运行数 > `MAX_EXPORT_RUNS` 或累计字节 > `MAX_EXPORT_BYTES` → 413 `RUN_LOGS_EXPORT_TOO_LARGE`
 * - 筛选无命中 → 404 `RUN_LOGS_NOT_FOUND`
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const parsed = runsFilterSchema.safeParse(query)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'RUNS_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const runRepo = ds.getRepository(ScanRun)
    const where = buildRunsWhere(parsed.data, organizationId)

    const total = await runRepo.count({ where })
    if (total === 0) {
        throw createLocalizedError(event, { statusCode: 404, code: 'RUN_LOGS_NOT_FOUND' })
    }
    if (total > MAX_EXPORT_RUNS) {
        throw createLocalizedError(event, {
            statusCode: 413,
            code: 'RUN_LOGS_EXPORT_TOO_LARGE',
            data: { total, limit: MAX_EXPORT_RUNS },
        })
    }

    const runs = await runRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: MAX_EXPORT_RUNS,
        relations: { repository: true },
    })

    const header = [
        '# dependfix 执行日志导出',
        `# 生成时间：${new Date().toISOString()}`,
        `# 运行数：${runs.length}`,
        ...describeFilters(parsed.data),
        '',
    ].join('\n')

    let bytes = Buffer.byteLength(header, 'utf8')
    const sections: string[] = []
    for (const run of runs) {
        const section = buildRunSection(run)
        bytes += Buffer.byteLength(section, 'utf8')
        if (bytes > MAX_EXPORT_BYTES) {
            throw createLocalizedError(event, {
                statusCode: 413,
                code: 'RUN_LOGS_EXPORT_TOO_LARGE',
                data: { limitBytes: MAX_EXPORT_BYTES },
            })
        }
        sections.push(section)
    }

    const filename = buildFilename()
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    setHeader(event, 'Content-Disposition', `attachment; filename="${filename}"`)
    return header + sections.join('')
})
