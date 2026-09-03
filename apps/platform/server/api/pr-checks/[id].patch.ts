import type { H3Event } from 'h3'
import { z } from 'zod'
import { PRCheck } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'
import { createLocalizedError } from '#server/utils/localized-error'
import { requireRole } from '#server/utils/guard'

/**
 * PATCH /api/pr-checks/[id]：手动 ack 当前 PRCheck alertFiring（详见 docs/plan/todo.md §M24.1）。
 *
 * 业务定位：前端 Phase 4 UI 提供 ack 按钮，用户点击后调用本端点关闭 alert firing；
 * 注意：** 不修改** `conclusion`（service polling 仍按状态机推断 alertFiring），
 * 下轮 polling 失败时 alertFiring 会被覆盖回 true（关键决策 D3）。
 *
 * 鉴权：admin / org_admin（与 schedule PATCH / delete 同等级）；
 * ack 是修改类操作，需严格权限隔离（与 GET 类端点 requireAuth 区分）。
 *
 * 状态机（关键决策 D3）：
 * - ack 操作仅设置 alertFiring=false + acknowledgedAt=NOW + acknowledgedByUserId=currentUserId
 * - 不修改 conclusion（service polling 继续独立判定）
 * - alertFiring 仍为 true 时拒绝 ack（防御性：避免用户对正常 PR 误操作）
 */
const ackSchema = z.object({
    alertFiring: z.literal(false),
})

const ackHandler = async (event: H3Event) => {
    const { user } = await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id')
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'PR_CHECK_ID_MISSING' })
    }

    const body = await readBody<Record<string, unknown>>(event)
    const parsed = ackSchema.safeParse(body)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'PR_CHECK_ACK_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const row = await ds.getRepository(PRCheck).findOne({ where: { id } })
    if (!row) {
        throw createLocalizedError(event, { statusCode: 404, code: 'PR_CHECK_NOT_FOUND' })
    }

    row.alertFiring = false
    row.acknowledgedAt = new Date()
    row.acknowledgedByUserId = user.id
    const saved = await ds.getRepository(PRCheck).save(row)

    return {
        id: saved.id,
        repositoryId: saved.repositoryId,
        prNumber: saved.prNumber,
        headSha: saved.headSha,
        conclusion: saved.conclusion,
        alertFiring: saved.alertFiring,
        acknowledgedAt: saved.acknowledgedAt?.toISOString() ?? null,
        acknowledgedByUserId: saved.acknowledgedByUserId,
        updatedAt: saved.updatedAt.toISOString(),
    }
}

export default defineEventHandler(ackHandler)
