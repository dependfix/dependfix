import type { H3Event } from 'h3'
import { PRCheck } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'
import { createLocalizedError } from '#server/utils/localized-error'
import { requireAuth } from '#server/utils/guard'

/**
 * GET /api/pr-checks/[id]：单条 PRCheck 详情（详见 docs/plan/todo.md §M24.1）。
 *
 * 业务定位：前端 PRCheck 详情面板使用（Phase 4 UI 提供）。[id] 为 PRCheck 实体 id
 * （雪花 ID，与 BaseEntity 对齐），不是 (repositoryId, prNumber, headSha) 复合键。
 *
 * 单 PR 时间线视图说明：
 * - 单一 PRCheck 行 = 单个 PR HEAD 的最新 check 状态（per-PR-head 模型）
 * - 同一 PR 跨多个 HEAD 的"时间线"由前端用 `GET /api/pr-checks?repositoryId=X&prNumber=Y`
 *   按 (repositoryId, prNumber) 过滤组合出（前端自行做时间线渲染，避免单端点暴露
 *   (repositoryId, prNumber) 复合 query 语义导致 API 表面膨胀）
 *
 * 鉴权：read 类端点用 requireAuth 即可（与 alerts 列表 / schedules GET 一致）；
 * 修改类（PATCH /api/pr-checks/[id]）必须 admin / org_admin。
 */
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

const getHandler = async (event: H3Event) => {
    await requireAuth(event)
    const id = getRouterParam(event, 'id')
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'PR_CHECK_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const row = await ds.getRepository(PRCheck).findOne({ where: { id } })
    if (!row) {
        throw createLocalizedError(event, { statusCode: 404, code: 'PR_CHECK_NOT_FOUND' })
    }
    return toView(row)
}

export default defineEventHandler(getHandler)
