/**
 * 第三方登录方式决策（登录页按钮显隐）。
 * 纯函数便于单元测试；login.vue 从 runtimeConfig.public 读取配置后调用。
 * public 模式：GitHub/Google（凭据配置才可用）；enterprise 模式：OIDC SSO（配置才可用）。
 */

export type SocialAuthMode = 'public' | 'enterprise'

export interface SocialProviderConfig {
    authMode: SocialAuthMode
    githubAvailable: boolean
    googleAvailable: boolean
    oidcAvailable: boolean
}

export const resolveSocialProviders = (config: SocialProviderConfig): string[] => {
    const providers: string[] = []
    if (config.authMode === 'public') {
        if (config.githubAvailable) {
            providers.push('github')
        }
        if (config.googleAvailable) {
            providers.push('google')
        }
        return providers
    }
    // enterprise 模式：仅 OIDC SSO
    if (config.oidcAvailable) {
        providers.push('oidc')
    }
    return providers
}
