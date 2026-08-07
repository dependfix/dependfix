import { createAuthClient } from 'better-auth/vue'

/**
 * better-auth Vue 客户端（服务端组件/客户端通用）。
 * baseURL 从环境推断（NUXT_PUBLIC_BETTER_AUTH_URL 或请求头）。
 */
export const authClient = createAuthClient({})
