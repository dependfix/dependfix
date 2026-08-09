import { getAuth } from '#server/utils/auth'
import { requireRole } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/**
 * DELETE /api/users/[id]：删除用户（admin only，代理 admin 插件 remove-user）。
 * better-auth 级联删除用户 + 其会话与账号关联（管理员不可删除自己，插件内置拦截）。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少用户 id' })
    }

    const auth = await getAuth()
    try {
        await auth.api.removeUser({
            body: { userId: id },
            headers: event.headers,
        })
        return { id, deleted: true }
    } catch (error) {
        rethrowAuthError(error)
    }
})
