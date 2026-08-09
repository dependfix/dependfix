import type { Ref } from 'vue'
import { createAuthClient } from 'better-auth/vue'
import { adminClient } from 'better-auth/client/plugins'
import { authClient } from '~/utils/auth-client'

interface SessionUser {
    id: string
    email: string
    name?: string | null
    image?: string | null
    role?: string | null
}

interface SessionData {
    user?: SessionUser
    session: unknown
}

interface SessionState {
    session: Ref<SessionData | null | undefined>
    isPending: Ref<boolean>
}

/**
 * 会话 Hook：SSR 阶段通过 Nuxt fetch 携带 cookie 拉取会话，
 * 客户端 hydrated 后复用；登录/登出后自动刷新。
 * 返回 { session, isPending }，其中 session 为会话数据（null/undefined 表示未登录）。
 *
 * SSR cookie 转发（better-auth 官方 Approach B）：
 * - authClient 默认不在 SSR 转发 cookie，且服务端无 window.location，baseURL 无法推断
 * - 必须创建 request-scoped client：baseURL = useRequestURL().origin（createAuthClient
 *   内部 withPath 自动补 /api/auth 前缀）+ fetchOptions.headers 转发 cookie
 * - 直接在已有 client 的 fetchOptions 传 baseURL 不可行：per-request baseURL 不经
 *   withPath 补全，请求会落到 /get-session（404）而非 /api/auth/get-session
 */
export function useSession(): SessionState {
    const { data, pending } = useAsyncData<SessionData | null>(
        'session',
        async () => {
            if (import.meta.server) {
                // 服务端：request-scoped client（官方 Approach B）
                const url = useRequestURL()
                const headers = useRequestHeaders(['cookie'])
                const serverClient = createAuthClient({
                    baseURL: url.origin,
                    fetchOptions: { headers },
                    plugins: [adminClient()],
                })
                const { data: sessionData } = await serverClient.getSession()
                return sessionData as SessionData | null
            }
            // 客户端：复用全局 client（浏览器自动携带 cookie）
            const { data: sessionData } = await authClient.getSession()
            return sessionData as SessionData | null
        },
        {
            dedupe: 'defer',
            server: true,
        },
    )

    return {
        session: data,
        isPending: pending,
    }
}
