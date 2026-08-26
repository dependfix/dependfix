import { createAuthClient } from 'better-auth/vue'
import { adminClient } from 'better-auth/client/plugins'

/**
 * better-auth Vue 客户端（服务端组件/客户端通用）。
 * baseURL 从环境推断（NUXT_PUBLIC_BETTER_AUTH_URL 或请求头）。
 * 注册 adminClient：用户管理端点（/api/auth/admin/*）经 createAuthClient
 * 自动映射为 authClient.admin.* 方法（listUsers/setRole/banUser/unbanUser/removeUser 等）。
 * OIDC SSO 登录（better-auth 1.7+）：genericOAuth providers 已升级为 first-class
 * social provider，调用走标准 `authClient.signIn.social({ provider: 'oidc' })`，
 * 无需客户端插件注册（plugin-specific 端点删除，见 better-auth 1.7 release notes）。
 * 个人界面操作（修改密码/邮箱/资料/绑定账号）为 better-auth 核心端点，
 * authClient 原生提供（changePassword/changeEmail/updateUser/listAccounts/unlinkAccount）。
 */
export const authClient = createAuthClient({
    plugins: [
        adminClient(),
    ],
})
