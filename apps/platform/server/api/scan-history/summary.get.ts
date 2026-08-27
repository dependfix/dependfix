import { In, IsNull, Not, type DataSource } from 'typeorm'
import { Repository } from '#server/entities/repository'
import { ScanResult } from '#server/entities/scan-result'
import { ScanRun, type ScanRunStatus } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'

/** 汇总窗口（最近 N 次 run 纳入统计；与服务端 pageSize 无关，单次聚合控制上限） */
const SUMMARY_RUN_LIMIT = 500

/** 状态分布键集（todo.md §M16.1 汇总卡片：byStatus） */
const SCAN_RUN_STATUS_KEYS: readonly ScanRunStatus[] = [
    'pending',
    'running',
    'completed',
    'failed',
    'dispatched',
    'degraded',
] as const

/** summaryJson 数值字段取值（防御：NaN/Infinity/非数字 → 0） */
const readNumber = (summary: Record<string, unknown>, key: string): number => {
    const value = summary[key]
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** summaryJson 解析返回的形状（防御性解析：解析失败视为零值，避免脏数据阻塞 summary 渲染） */
const safeParseSummary = (raw: string | null | undefined): Record<string, unknown> => {
    if (!raw) {
        return {}
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {}
    } catch {
        return {}
    }
}

interface RepositorySummary {
    repositoryId: string
    owner: string
    name: string
    runCount: number
    alertCount: number
    fixedCount: number
    lastRunAt: string | null
    lastStatus: ScanRunStatus | null
}

/**
 * 单组织范围内按仓库聚合 run 统计（应用层 reduce；SQLite 无窗口函数兼容路径，
 * 且单组织 run 量较小，reduce 性能可接受——若未来 run 量爆炸再考虑窗口函数）。
 */
const aggregateByRepository = (
    runs: (ScanRun & { repository?: Repository | null })[],
    resultsByRun: Map<string, ScanResult[]>,
): RepositorySummary[] => {
    const map = new Map<string, RepositorySummary>()
    for (const run of runs) {
        const repo = run.repository
        if (!repo) {
            // 没有关联 repository 的 run 跳过聚合（数据损坏/孤儿 run；既不影响总数也不入 repository 列表）
            continue
        }
        const existing = map.get(repo.id)
        const runResults = resultsByRun.get(run.id) ?? []
        const alertsTotal = runResults.length
        const alertsFixed = runResults.filter((r) => r.fixStatus === 'success').length
        if (!existing) {
            map.set(repo.id, {
                repositoryId: repo.id,
                owner: repo.owner,
                name: repo.name,
                runCount: 1,
                alertCount: alertsTotal,
                fixedCount: alertsFixed,
                lastRunAt: run.createdAt instanceof Date ? run.createdAt.toISOString() : String(run.createdAt),
                lastStatus: run.status,
            })
        } else {
            existing.runCount += 1
            existing.alertCount += alertsTotal
            existing.fixedCount += alertsFixed
            // 保留最近一次的 run 时间与状态
            const existingMs = existing.lastRunAt ? Date.parse(existing.lastRunAt) : 0
            const createdAtMs = run.createdAt instanceof Date ? run.createdAt.getTime() : Date.parse(String(run.createdAt))
            if (createdAtMs > existingMs) {
                existing.lastRunAt = run.createdAt instanceof Date ? run.createdAt.toISOString() : String(run.createdAt)
                existing.lastStatus = run.status
            }
        }
    }
    // 按 runCount DESC + lastRunAt DESC 排序（最活跃优先）
    return Array.from(map.values()).sort((a, b) => {
        if (b.runCount !== a.runCount) {
            return b.runCount - a.runCount
        }
        return Date.parse(b.lastRunAt ?? '0') - Date.parse(a.lastRunAt ?? '0')
    })
}

/**
 * GET /api/scan-history/summary：扫描历史汇总（按当前组织 + 可选 repositoryId 过滤）。
 *
 * 应用场景（todo.md §M16.1）：/scans 页面顶部 4 块汇总卡片 + 按仓库聚合列表。
 * 与 /api/runs 列表契约对齐：viewer 可见、organizationId 隐式注入、单组织模型下默认 `dependfix-default`。
 *
 * 数据来源：ScanRun（含 relations.repository）+ ScanResult 全量拉取（应用层 reduce）；
 * 窗口上限 SUMMARY_RUN_LIMIT = 500 —— 单组织量级够用，超出会强制收紧，待性能回归再决定是否引入 SQL 聚合。
 *
 * 返回形状：
 * - byStatus: { pending, running, completed, failed, dispatched, degraded } 全计数
 * - totals: { runs, totalAlerts, totalFixed } —— 与 byStatus 互补的总量统计
 * - repositories: 按仓库聚合列表（runCount/alertCount/fixedCount/lastRunAt/lastStatus）
 * - window: { start, end, included } —— 统计窗口（最近 N 条 run 的 createdAt 起止 + 实际纳入数）
 *
 * repositoryId query 参数：可选，按仓库过滤汇总（scans?repository=xxx 时调用）。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = typeof query.repositoryId === 'string' && query.repositoryId.length > 0
        ? query.repositoryId
        : undefined

    const ds: DataSource = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)

    const runRepo = ds.getRepository(ScanRun)
    const where: import('typeorm').FindOptionsWhere<ScanRun> = {
        repository: { organizationId },
        // 排除孤儿 run（repositoryId 为 NULL）—— repository relation 在 summary 中被消费，
        // 孤儿 run 不会进入 repositories 列表，但会污染 totals；repositoryId 必填入库约束。
        repositoryId: Not(IsNull()),
    }
    if (repositoryId) {
        where.repositoryId = repositoryId
    }
    const runs = await runRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: SUMMARY_RUN_LIMIT,
        relations: { repository: true },
    })

    // byStatus 全计数（即使无 run 也返回零值键集，前端渲染稳定）
    const byStatus = SCAN_RUN_STATUS_KEYS.reduce(
        (acc, key) => {
            acc[key] = 0
            return acc
        },
        {} as Record<ScanRunStatus, number>,
    )
    let totalAlerts = 0
    let totalFixed = 0
    for (const run of runs) {
        byStatus[run.status] = (byStatus[run.status] ?? 0) + 1
        const summary = safeParseSummary(run.summaryJson)
        totalAlerts += readNumber(summary, 'alertsFound')
        totalFixed += readNumber(summary, 'alertsFixed')
    }

    // 按仓库聚合（结果按 run 拉取，In(runs.map((r) => r.id))）
    const resultRepo = ds.getRepository(ScanResult)
    const resultsByRun = new Map<string, ScanResult[]>()
    if (runs.length > 0) {
        const results = await resultRepo.find({
            where: { scanRunId: In(runs.map((r) => r.id)) },
        })
        for (const r of results) {
            const list = resultsByRun.get(r.scanRunId)
            if (list) {
                list.push(r)
            } else {
                resultsByRun.set(r.scanRunId, [r])
            }
        }
    }

    const repositories = aggregateByRepository(runs as (ScanRun & { repository?: Repository | null })[], resultsByRun)

    const windowEnd = runs[0]?.createdAt ?? null
    const windowStart = runs[runs.length - 1]?.createdAt ?? null

    return {
        byStatus,
        totals: {
            runs: runs.length,
            totalAlerts,
            totalFixed,
        },
        repositories,
        window: {
            start: windowStart instanceof Date ? windowStart.toISOString() : windowStart,
            end: windowEnd instanceof Date ? windowEnd.toISOString() : windowEnd,
            included: runs.length,
            limit: SUMMARY_RUN_LIMIT,
        },
        filtered: {
            repositoryId: repositoryId ?? null,
        },
    }
})
