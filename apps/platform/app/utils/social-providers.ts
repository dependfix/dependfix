/**
 * 第三方登录方式决策（登录页按钮显隐）。
 * 纯函数便于单元测试；login.vue 从 runtimeConfig.public 读取配置后调用。
 * public 模式：GitHub/Google（凭据配置才可用）；enterprise 模式：OIDC SSO（配置才可用）。
 */

export type SocialAuthMode = 'public' | 'enterprise'

/** 登录页可展示的第三方登录方式（与 better-auth provider id 一致）。 */
export type SocialProvider = 'github' | 'google' | 'oidc'

export interface SocialProviderConfig {
    authMode: SocialAuthMode
    githubAvailable: boolean
    googleAvailable: boolean
    oidcAvailable: boolean
}

/** 品牌展示名：按钮文案使用目标平台的官方大小写（github → GitHub），不直接回显 provider id。 */
const SOCIAL_PROVIDER_NAMES: Record<SocialProvider, string> = {
    github: 'GitHub',
    google: 'Google',
    oidc: 'SSO',
}

export const resolveSocialProviderName = (provider: SocialProvider): string => SOCIAL_PROVIDER_NAMES[provider]

export const resolveSocialProviders = (config: SocialProviderConfig): SocialProvider[] => {
    const providers: SocialProvider[] = []
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
