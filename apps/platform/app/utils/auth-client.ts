import { createAuthClient } from 'better-auth/vue'
import { adminClient, genericOAuthClient } from 'better-auth/client/plugins'

/**
 * better-auth Vue 客户端（服务端组件/客户端通用）。
 * baseURL 从环境推断（NUXT_PUBLIC_BETTER_AUTH_URL 或请求头）。
 * 注册 adminClient：用户管理端点（/api/auth/admin/*）经 createAuthClient
 * 自动映射为 authClient.admin.* 方法（listUsers/setRole/banUser/unbanUser/removeUser 等）。
 * 注册 genericOAuthClient：OIDC SSO 登录（providerId 'oidc'）的类型面与端点映射
 * （sign-in/oauth2、/oauth2/callback/oidc；未配置 OIDC 时插件注册无副作用）。
 * 个人界面操作（修改密码/邮箱/资料/绑定账号）为 better-auth 核心端点，
 * authClient 原生提供（changePassword/changeEmail/updateUser/listAccounts/unlinkAccount）。
 */
export const authClient = createAuthClient({
    plugins: [
        adminClient(),
        genericOAuthClient(),
    ],
})
