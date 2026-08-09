import { z } from 'zod'
import { getAuth } from '#server/utils/auth'
import { requireRole } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/**
 * 用户更新操作（admin only，代理 admin 插件 set-role / ban / unban）。
 * body 二选一（严格互斥）：
 * - { role: 'admin' | 'org_admin' | 'viewer' }：分配角色（set-role）
 * - { banned: true }：禁用（ban，会话全失效）；{ banned: false }：启用（unban）
 */
const userPatchSchema = z.object({
    role: z.enum(['admin', 'org_admin', 'viewer']).optional(),
    banned: z.boolean().optional(),
}).refine((data) => (data.role !== undefined) !== (data.banned !== undefined), {
    message: 'role 与 banned 必须且只能提供其一',
})

/** PATCH /api/users/[id]：角色分配 / 启用禁用 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少用户 id' })
    }

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = userPatchSchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const auth = await getAuth()
    try {
        if (parsed.data.role !== undefined) {
            const result = await auth.api.setRole({
                body: { userId: id, role: parsed.data.role },
                headers: event.headers,
            })
            return { id, updated: true, user: result.user }
        }
        if (parsed.data.banned === true) {
            await auth.api.banUser({
                body: { userId: id },
                headers: event.headers,
            })
            return { id, updated: true, banned: true }
        }
        await auth.api.unbanUser({
            body: { userId: id },
            headers: event.headers,
        })
        return { id, updated: true, banned: false }
    } catch (error) {
        rethrowAuthError(error)
    }
})
