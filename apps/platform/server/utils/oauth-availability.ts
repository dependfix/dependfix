/**
 * OAuth 凭据齐备性判定（public 模式登录方式可用性）。
 *
 * `nuxt.config.ts` 的 `public.githubAvailable` / `public.googleAvailable` 以「client id + client secret
 * 均非空」为启用条件；抽成纯函数让构建期布尔可被单测锁定。服务端 better-auth 的 `socialProviders`
 * 使用同一判定语义（见 `server/utils/auth.ts`），两边都改了才算口径变更。
 */
export const hasOAuthCredentials = (
    clientId: string | undefined,
    clientSecret: string | undefined,
): boolean => Boolean(clientId && clientSecret)
