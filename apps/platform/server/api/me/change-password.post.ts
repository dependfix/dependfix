import { z } from 'zod'
import { getAuth } from '#server/utils/auth'
import { requireAuth } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/** 修改密码：需当前密码验证（min 8 对齐 better-auth minPasswordLength） */
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, '当前密码不能为空'),
    newPassword: z.string().min(8, '新密码至少 8 位').max(128),
})

/** POST /api/me/change-password：修改密码（代理 better-auth changePassword） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const auth = await getAuth()
    try {
        await auth.api.changePassword({
            body: {
                currentPassword: parsed.data.currentPassword,
                newPassword: parsed.data.newPassword,
                revokeOtherSessions: true,
            },
            headers: event.headers,
        })
        return { updated: true }
    } catch (error) {
        rethrowAuthError(error)
    }
})
