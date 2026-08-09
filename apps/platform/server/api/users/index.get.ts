import { z } from 'zod'
import { getAuth } from '#server/utils/auth'
import { requireRole } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/**
 * 用户列表查询参数（代理 better-auth admin 插件 listUsers）。
 * limit/offset 透传分页；searchValue 全文搜索（默认 email/name 匹配）。
 */
const listUsersQuerySchema = z.object({
    searchValue: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    sortBy: z.enum(['email', 'name', 'createdAt']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
})

/** GET /api/users：用户列表（admin only，代理 admin 插件 listUsers） */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin'])

    const query = getQuery(event)
    const parsed = listUsersQuerySchema.safeParse(query)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const auth = await getAuth()
    try {
        const result = await auth.api.listUsers({
            query: {
                searchValue: parsed.data.searchValue,
                limit: parsed.data.limit,
                offset: parsed.data.offset,
                sortBy: parsed.data.sortBy,
                sortDirection: parsed.data.sortDirection,
            },
            headers: event.headers,
        })
        return {
            users: result.users.map((u) => ({
                id: u.id,
                email: u.email,
                name: u.name ?? null,
                image: u.image ?? null,
                role: u.role ?? null,
                banned: u.banned,
                banReason: u.banReason ?? null,
                emailVerified: u.emailVerified,
                createdAt: u.createdAt,
                updatedAt: u.updatedAt,
            })),
            total: result.total,
        }
    } catch (error) {
        rethrowAuthError(error)
    }
})
