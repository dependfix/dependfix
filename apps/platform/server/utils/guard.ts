import { createError, type H3Event } from 'h3'
import { getAuth, type AuthInstance } from '#server/utils/auth'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

/** 角色模型（三角色；repo_admin 登记 backlog） */
export type Role = 'admin' | 'org_admin' | 'viewer'

/**
 * API 认证守卫：要求已登录会话。
 * 用法：`const { user, session } = await requireAuth(event)`（未登录抛 401）。
 * 设计：不主动 401 — 由各 API handler 显式调用守卫（对齐 security.md 约定）。
 * 返回完整 session 供角色守卫复用，避免重复查询会话。
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
 * API 角色守卫：要求会话角色命中允许列表。
 * 用法：`await requireRole(event, ['admin', 'org_admin'])`（角色不匹配抛 403）。
 */
export const requireRole = async (event: H3Event, roles: Role[]): Promise<{ user: { id: string, email: string } }> => {
    const { user, session } = await requireAuth(event)

    const userRole = session?.user?.role
    if (!userRole || !roles.includes(userRole as Role)) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden',
            message: '没有权限执行该操作',
        })
    }

    return { user }
}

/**
 * API 管理员守卫：要求管理员角色（单用户部署时首注册用户自动为 admin）。
 * 用法：`await requireAdmin(event)`（非管理员抛 403）。
 * 实现：requireRole 的别名，向后兼容（存量 API 仅改门槛时可逐点替换为 requireRole）。
 */
export const requireAdmin = async (event: H3Event): Promise<{ user: { id: string, email: string } }> => requireRole(event, ['admin'])

/**
 * API 组织资源守卫：校验资源归属当前组织。
 * 单组织模型下即校验 organizationId === 默认组织 id（当前全部资源归属默认组织）；
 * 多租户（多组织）成为真实需求时此处为扩展点（event 预留组织上下文消费位）。
 * 注意：每次调用会执行默认组织幂等确认（含存量 organization_id 填充副作用），写路径调用频率下可接受。
 * 用法：写入/删除路径先查资源再校验（资源 organizationId 不匹配抛 403）。
 */
export const requireOrgResource = async (event: H3Event, resourceOrganizationId: string | null | undefined): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    const currentOrganizationId = await resolveOrganizationId(ds)

    if (resourceOrganizationId !== currentOrganizationId) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden',
            message: '资源不属于当前组织',
        })
    }
}
