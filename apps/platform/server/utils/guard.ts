import type { H3Event } from 'h3'
import { getAuth, type AuthInstance } from '../utils/auth'

/**
 * API 认证守卫：要求已登录会话。
 * 用法：`const { user, session } = await requireAuth(event)`（未登录抛 401）。
 * 设计：不主动 401 — 由各 API handler 显式调用守卫（对齐 security.md 约定）。
 * 返回完整 session 供 requireAdmin 复用，避免重复查询会话。
 */
export const requireAuth = async (event: H3Event): Promise<{
    user: { id: string, email: string }
    session: NonNullable<Awaited<ReturnType<AuthInstance['api']['getSession']>>>
}> => {
    const auth = await getAuth()
    const session = await auth.api.getSession({ headers: event.headers })

    if (!session?.user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized',
            message: '未登录或会话已过期',
        })
    }

    return {
        user: {
            id: session.user.id,
            email: session.user.email,
        },
        session,
    }
}

/**
 * API 管理员守卫：要求管理员角色（单用户部署时首注册用户自动为 admin）。
 * 用法：`await requireAdmin(event)`（非管理员抛 403）。
 */
export const requireAdmin = async (event: H3Event): Promise<{ user: { id: string, email: string } }> => {
    const { user, session } = await requireAuth(event)

    if (session?.user?.role !== 'admin') {
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden',
            message: '需要管理员权限',
        })
    }

    return { user }
}
