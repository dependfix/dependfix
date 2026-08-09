import { z } from 'zod'
import { getAuth } from '#server/utils/auth'
import { requireAuth } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/** 修改邮箱：新邮箱（SMTP 未配置时直接生效；已配置时发确认邮件） */
const changeEmailSchema = z.object({
    newEmail: z.email('邮箱格式不正确').max(255),
})

/** POST /api/me/change-email：修改邮箱（代理 better-auth changeEmail） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = changeEmailSchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const auth = await getAuth()
    try {
        await auth.api.changeEmail({
            body: { newEmail: parsed.data.newEmail },
            headers: event.headers,
        })
        return { updated: true }
    } catch (error) {
        rethrowAuthError(error)
    }
})
