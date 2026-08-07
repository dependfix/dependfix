import type { Ref } from 'vue'
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
 */
export function useSession(): SessionState {
    const { data, pending } = useAsyncData<SessionData | null>(
        'session',
        async () => {
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
