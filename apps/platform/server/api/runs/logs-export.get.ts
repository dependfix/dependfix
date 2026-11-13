import { z } from 'zod'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import { applyRunsWhere, isValidRunsRange, runsFilterShape, runsPaginationShape, runsSortShape, applyRunsOrder, type RunsFilterInput } from '#server/utils/runs-query'
import { parseLogEntries, formatLogEntries } from '#server/utils/memory-logger'

/**
 * 导出上限（硬上限 + 明确报错，不 OOM）：
 * - `MAX_EXPORT_RUNS`：**全量导出**（未传分页参数）的运行数上限（超出 → 413，提示缩小筛选或减少单次导出的运行数）
 * - `MAX_EXPORT_BYTES`：合并文本总字节上限（逐 run 追加时累计，超出即中止 → 413）
 *
 * 分页窗口导出（显式传 `page` / `pageSize`）不受 `MAX_EXPORT_RUNS` 约束：窗口自身由 `pageSize`
 * （≤ `RUNS_PAGE_SIZE_MAX`，与 `GET /api/runs` **同源**共用）界定，载荷保护由 `MAX_EXPORT_BYTES` 承担。
 * 若对窗口也套用运行数上限，会与列表允许的 `pageSize` 取值互相矛盾（列表可选值合法但导出 413）。
 */
export const MAX_EXPORT_RUNS = 100
export const MAX_EXPORT_BYTES = 5 * 1024 * 1024

const SEPARATOR = '='.repeat(80)

/**
 * 查询参数：共用筛选（`runsFilterShape`）+ 共用分页 / 排序片段（`runsPaginationShape` / `runsSortShape`）。
 *
 * 窗口激活条件由**原始查询串**判定（见 handler）：`default` 会把缺省值补齐，解析后的对象无法
 * 区分「显式传 `page=1`」与「未传」。
 */
const querySchema = z.object({
    ...runsFilterShape,
    ...runsPaginationShape,
    ...runsSortShape,
}).refine(isValidRunsRange, {
    message: 'from must be less than or equal to to',
    path: ['to'],
})

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
    if (filters.from) {
        lines.push(`# 筛选：from=${filters.from}`)
    }
    if (filters.to) {
        lines.push(`# 筛选：to=${filters.to}`)
    }
    return lines
}

/**
 * 描述本次导出的范围（写入文件头）：分页窗口导出标注页码窗口，全量导出标注筛选总量。
 * 归档追溯需要区分「这一页」与「全部命中」——两者运行数可能相同而覆盖面完全不同。
 */
export const describeExportScope = (
    scope: { page: number, pageSize: number, total: number } | { total: number },
): string => ('page' in scope
    ? `# 导出范围：第 ${scope.page} 页（每页 ${scope.pageSize} 条，共 ${scope.total} 条）`
    : `# 导出范围：全部筛选结果（共 ${scope.total} 条）`)

/**
 * 失败归因摘要（错误码 / 失败阶段与类别 / 资源信号）。
 *
 * 离线复盘曾因导出只有日志而无法区分 `orchestration_failed` / `push_failed`，
 * 无日志运行更只剩「（无执行日志）」；这些字段体积远小于日志正文，随小节标题输出。
 */
export const describeRunAttribution = (run: ScanRun): string | null => {
    const parts: string[] = []
    const error = parseJsonObject(run.errorJson)
    if (typeof error?.code === 'string' && error.code) {
        parts.push(`错误码：${error.code}`)
    }
    if (run.failureStage) {
        parts.push(`失败阶段：${run.failureStage}`)
    }
    if (run.failureKind) {
        parts.push(`失败类别：${run.failureKind}`)
    }
    if (run.oomKilled === true) {
        parts.push('OOM 终止：是')
    }
    if (typeof run.peakRssBytes === 'number' && run.peakRssBytes > 0) {
        parts.push(`峰值 RSS：${Math.round(run.peakRssBytes / 1024 / 1024)} MB`)
    }
    // 外联审计：违规数与最小化目标随导出可见（离线复盘需区分「验证通过」与「外联被拦」）
    const summary = parseJsonObject(run.summaryJson)
    const violations = typeof summary?.networkViolations === 'number' ? summary.networkViolations : 0
    if (violations > 0) {
        parts.push(`外联违规：${violations}`)
        const targets = Array.isArray(summary?.networkViolationTargets)
            ? summary.networkViolationTargets
                .flatMap((item) => {
                    if (!item || typeof item !== 'object') {
                        return []
                    }
                    const record = item as Record<string, unknown>
                    return typeof record.target === 'string' ? [record.target] : []
                })
                .slice(0, 5)
            : []
        if (targets.length > 0) {
            parts.push(`外联目标：${targets.join(', ')}`)
        }
    }
    return parts.length > 0 ? `# 失败归因：${parts.join(' | ')}` : null
}

/** 安全解析 JSON 对象列（缺失 / 非对象 / 解析失败回退 null，不抛错）。 */
const parseJsonObject = (value: string | null | undefined): Record<string, unknown> | null => {
    if (!value) {
        return null
    }
    try {
        const parsed: unknown = JSON.parse(value)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : null
    } catch {
        return null
    }
}

/** 单个 run 的导出小节（标题行含 runId / 仓库 / 状态 / 开始时间；无日志时附失败归因） */
export const buildRunSection = (run: ScanRun): string => {
    const entries = parseLogEntries(run.logsJson)
    const body = entries.length > 0 ? formatLogEntries(entries) : '（无执行日志）'
    const repo = run.repository ? `${run.repository.owner}/${run.repository.name}` : '—'
    const startedAt = run.startedAt ? run.startedAt.toISOString() : '—'
    const title = `# Run ${run.id} | ${repo} | ${run.status} | ${startedAt}`
    const attribution = describeRunAttribution(run)
    const header = attribution ? `${title}\n${attribution}` : title
    return `\n${SEPARATOR}\n${header}\n${SEPARATOR}\n${body}\n`
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
 * - 筛选口径与 `GET /api/runs` 完全一致（共用 `runsFilterShape` + `applyRunsWhere`，含组织隔离）
 * - **范围口径**：显式传 `page` / `pageSize` → 导出该分页窗口（与列表同页同序，`skip` / `take` 按列表口径）；
 *   两者皆缺省 → 导出全部命中（既有行为），此时运行数 > `MAX_EXPORT_RUNS` → 413
 * - 合并单文件（多 run 以分隔头区分），不引入 zip 依赖
 * - 硬上限：累计字节 > `MAX_EXPORT_BYTES` → 413 `RUN_LOGS_EXPORT_TOO_LARGE`
 * - 筛选无命中（或窗口越界）→ 404 `RUN_LOGS_NOT_FOUND`
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const rawQuery = getQuery(event)
    const parsed = querySchema.safeParse(rawQuery)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'RUNS_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const { page, pageSize, sortBy, sortOrder } = parsed.data
    // 窗口激活判定基于原始查询串：schema 的 default 会补齐缺省值，解析结果无法区分「未传」与「显式传」
    const isWindowExport = rawQuery.page !== undefined || rawQuery.pageSize !== undefined

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const runRepo = ds.getRepository(ScanRun)

    const baseQuery = () => {
        const qb = runRepo.createQueryBuilder('run')
            .leftJoinAndSelect('run.repository', 'repository')
        applyRunsWhere(qb, parsed.data, organizationId)
        applyRunsOrder(qb, { sortBy, sortOrder })
        return qb
    }

    const total = await baseQuery().getCount()
    if (total === 0) {
        throw createLocalizedError(event, { statusCode: 404, code: 'RUN_LOGS_NOT_FOUND' })
    }

    let runs: ScanRun[]
    let scopeLine: string
    if (isWindowExport) {
        runs = await baseQuery()
            .skip((page - 1) * pageSize)
            .take(pageSize)
            .getMany()
        if (runs.length === 0) {
            // 页码越界（筛选命中非零但窗口为空）：与「无日志可导出」同码，避免产出只有文件头的空附件
            throw createLocalizedError(event, { statusCode: 404, code: 'RUN_LOGS_NOT_FOUND' })
        }
        scopeLine = describeExportScope({ page, pageSize, total })
    } else {
        if (total > MAX_EXPORT_RUNS) {
            throw createLocalizedError(event, {
                statusCode: 413,
                code: 'RUN_LOGS_EXPORT_TOO_LARGE',
                data: { total, limit: MAX_EXPORT_RUNS },
            })
        }
        runs = await baseQuery().take(MAX_EXPORT_RUNS).getMany()
        scopeLine = describeExportScope({ total })
    }

    const header = [
        '# dependfix 执行日志导出',
        `# 生成时间：${new Date().toISOString()}`,
        `# 运行数：${runs.length}`,
        scopeLine,
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
