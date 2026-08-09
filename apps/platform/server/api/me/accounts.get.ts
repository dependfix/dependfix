import { getAuth } from '#server/utils/auth'
import { requireAuth } from '#server/utils/guard'
import { rethrowAuthError } from '#server/utils/better-auth-error'

/**
 * GET /api/me/accounts：当前用户的绑定账号列表（第三方账号绑定状态展示）。
 * 代理 better-auth listUserAccounts；providerId 区分凭证/社交/OIDC 账号。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const auth = await getAuth()
    try {
        const accounts = await auth.api.listUserAccounts({
            headers: event.headers,
        })
        return {
            accounts: accounts.map((a) => ({
                id: a.id,
                providerId: a.providerId,
                accountId: a.accountId,
                createdAt: a.createdAt,
                updatedAt: a.updatedAt,
            })),
        }
    } catch (error) {
        rethrowAuthError(error)
    }
})
