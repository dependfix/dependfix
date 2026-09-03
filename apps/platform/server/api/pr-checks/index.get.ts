import type { H3Event } from 'h3'
import { z } from 'zod'
import { PRCheck, PR_CHECK_CONCLUSIONS } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/pr-checks：依赖更新 PR check 状态监测列表（详见 docs/plan/todo.md §M24.1）。
 *
 * 业务定位：监测 dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR
 * （author=`dependabot[bot]`）最新 `Test` check 状态，让"发出去"的修复 PR 在 CI
 * 跑挂时通过 alerts 系统 firing 并提供 ack UI。Phase 3 仅暴露 API 层；UI 在 Phase 4。
 *
 * 数据模型：PRCheck 是 per-PR-head 模型（同一 PR HEAD 只存最新一行；service polling
 * INSERT/UPDATE 时按 (repositoryId, prNumber, headSha) 复合唯一索引幂等）。
 *
 * 过滤参数：
 * - `repositoryId`（可选）：限定仓库 id
 * - `conclusion`（可选）：限定 check 结论（success / failure / pending 等）
 * - `alertFiring`（可选）：true = 仅 alert firing 的失败 PR；false = 仅 ack 后的 / 其他
 * - 不传 / 非法：返回当前组织全部 PRCheck（默认按 createdAt DESC 排序）
 *
 * 注意：PRCheck 表已天然 per-PR-head 去重（复合唯一索引），无需应用层 fingerprint 聚合。
 * 与 ScanResult 的查询路径互不影响——两条链路共用 alerts-rowgroup UI 视觉但不共享数据源。
 */
const conclusionSchema = z.enum(PR_CHECK_CONCLUSIONS as unknown as [string, ...string[]]).optional()
const alertFiringSchema = z.enum(['true', 'false']).optional()

/** PRCheck 视图（API 序列化层；与 entities/pr-check 字段一一对应） */
const toView = (row: PRCheck) => ({
    id: row.id,
    repositoryId: row.repositoryId,
    prNumber: row.prNumber,
    headSha: row.headSha,
    authorLogin: row.authorLogin,
    conclusion: row.conclusion,
    checkRunId: row.checkRunId,
    detailsUrl: row.detailsUrl,
    errorMessage: row.errorMessage,
    alertFiring: row.alertFiring,
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByUserId: row.acknowledgedByUserId,
    lastPolledAt: row.lastPolledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
})

const listHandler = async (event: H3Event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = typeof query.repositoryId === 'string' ? query.repositoryId : undefined
    const conclusionParsed = conclusionSchema.safeParse(query.conclusion)
    // zod .optional() 接受 undefined 为合法值（data=undefined）；下方 if (conclusion) 已过滤 falsy
    const conclusion = conclusionParsed.success ? conclusionParsed.data : undefined
    const alertFiringParsed = alertFiringSchema.safeParse(query.alertFiring)
    // alertFiring 是 boolean，需显式 !== undefined 区分「未传」与「false」
    const alertFiring = alertFiringParsed.success && alertFiringParsed.data !== undefined
        ? alertFiringParsed.data === 'true'
        : undefined

    const ds = await ensureDatabaseInitialized()
    const qb = ds.getRepository(PRCheck).createQueryBuilder('prCheck')
        .orderBy('prCheck.createdAt', 'DESC')
        .take(500)

    if (repositoryId && repositoryId !== 'all') {
        qb.andWhere('prCheck.repositoryId = :repositoryId', { repositoryId })
    }
    if (conclusion) {
        qb.andWhere('prCheck.conclusion = :conclusion', { conclusion })
    }
    if (alertFiring !== undefined) {
        qb.andWhere('prCheck.alertFiring = :alertFiring', { alertFiring })
    }

    const rows = await qb.getMany()
    return rows.map(toView)
}

export default defineEventHandler(listHandler)
