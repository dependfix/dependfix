/**
 * 第三方登录方式决策（登录页按钮显隐）。
 * 纯函数便于单元测试；login.vue 从 runtimeConfig.public 读取配置后调用。
 * public 模式：GitHub/Google（凭据配置才可用）；enterprise 模式由 OIDC 子任务填充。
 */

export type SocialAuthMode = 'public' | 'enterprise'

export interface SocialProviderConfig {
    authMode: SocialAuthMode
    githubAvailable: boolean
    googleAvailable: boolean
}

export const resolveSocialProviders = (config: SocialProviderConfig): string[] => {
    if (config.authMode !== 'public') {
        return []
    }
    const providers: string[] = []
    if (config.githubAvailable) {
        providers.push('github')
    }
    if (config.googleAvailable) {
        providers.push('google')
    }
    return providers
}
