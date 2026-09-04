import type { H3Event } from 'h3'
import { IsNull, Not, type DataSource } from 'typeorm'
import { PRCheck } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/pr-checks/summary：dashboard 概览（详见 docs/plan/todo.md §M24.1）。
 *
 * 输出：
 * - `total`：当前组织 PRCheck 总数（per-PR-head 模型；不含历史已 superseded 行——MVP 不做）
 * - `firing`：alertFiring=true 的失败 PR 数（前端 dashboard 红色徽标）
 * - `acknowledged`：已 ack 但仍未回归 success 的 PR 数（alertFiring=false + acknowledgedAt 非空）
 * - `byConclusion`：按结论分组统计（success / failure / pending / ...）
 *
 * 性能：走 QueryBuilder 聚合查询（COUNT + GROUP BY），单次往返返回全量统计，
 * 前端 dashboard 无需多次拉取列表再应用层聚合。
 *
 * 注意：与 alerts dashboard 共享 UI 视觉模式（alerts-rowgroup），但数据源独立（PRCheck
 * 与 ScanResult 互不影响），前端通过 kind 字段区分显示。
 */
interface PrCheckSummary {
    firing: number
    acknowledged: number
    total: number
    byConclusion: { conclusion: string, count: number }[]
}

const summarize = async (ds: DataSource): Promise<PrCheckSummary> => {
    // 总数
    const total = await ds.getRepository(PRCheck).count()

    // firing 数（alertFiring=true 即失败未 ack）
    const firing = await ds.getRepository(PRCheck).count({ where: { alertFiring: true } })

    // acknowledged 数（已 ack 但未回归 success；alertFiring=false 且 acknowledgedAt 非空）
    const acknowledged = await ds.getRepository(PRCheck).count({
        where: { alertFiring: false, acknowledgedAt: Not(IsNull()) },
    })

    // 按 conclusion 分组（GROUP BY）
    const grouped = await ds
        .getRepository(PRCheck)
        .createQueryBuilder('prCheck')
        .select('prCheck.conclusion', 'conclusion')
        .addSelect('COUNT(*)', 'count')
        .groupBy('prCheck.conclusion')
        .getRawMany<{ conclusion: string, count: string }>()

    return {
        total,
        firing,
        acknowledged,
        byConclusion: grouped.map((row) => ({
            conclusion: row.conclusion,
            count: Number(row.count),
        })),
    }
}

const summaryHandler = async (event: H3Event) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    return summarize(ds)
}

export default defineEventHandler(summaryHandler)
