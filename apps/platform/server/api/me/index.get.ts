import { requireAuth } from '#server/utils/guard'

/** GET /api/me：当前登录用户资料（个人界面数据源） */
export default defineEventHandler(async (event) => {
    const { session } = await requireAuth(event)
    const user = session.user

    return {
        id: user.id,
        email: user.email,
        name: user.name ?? null,
        image: user.image ?? null,
        emailVerified: user.emailVerified,
        role: user.role ?? null,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
    }
})
