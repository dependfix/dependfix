import { z } from 'zod'
import { getAuth } from '#server/utils/auth'
import { requireAuth } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/** 个人资料更新（仅 name / image；role/email 走专用接口） */
const mePatchSchema = z.object({
    name: z.string().trim().min(1, '姓名不能为空').max(100).optional(),
    image: z.string().trim().max(500).nullable().optional(),
}).refine((data) => data.name !== undefined || data.image !== undefined, {
    message: '必须提供 name 或 image 之一',
})

/** PATCH /api/me：更新个人资料（代理 better-auth updateUser） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = mePatchSchema.safeParse(body)
    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const auth = await getAuth()
    try {
        await auth.api.updateUser({
            body: {
                name: parsed.data.name,
                image: parsed.data.image === undefined ? undefined : parsed.data.image,
            },
            headers: event.headers,
        })
        return { updated: true }
    } catch (error) {
        rethrowAuthError(error)
    }
})
