import { z } from 'zod'
import { getAuth } from '#server/utils/auth'
import { requireAuth } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/** 解绑账号（第三方账号绑定管理；最后一个账号不可解绑由 better-auth 拦截） */
const unlinkSchema = z.object({
    providerId: z.string().trim().min(1, 'providerId 不能为空').max(64),
    accountId: z.string().trim().max(255).optional(),
})

/** POST /api/me/accounts/unlink：解绑账号（代理 better-auth unlinkAccount） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = unlinkSchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const auth = await getAuth()
    try {
        await auth.api.unlinkAccount({
            body: {
                providerId: parsed.data.providerId,
                accountId: parsed.data.accountId,
            },
            headers: event.headers,
        })
        return { unlinked: true }
    } catch (error) {
        rethrowAuthError(error)
    }
})
