import { describe, expect, it } from 'vitest'
import { resolveSocialProviders } from './social-providers'

describe('resolveSocialProviders（登录页第三方登录方式决策）', () => {
    it('public + GitHub 配置：仅 github', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: true,
            googleAvailable: false,
        })).toEqual(['github'])
    })

    it('public + Google 配置：仅 google', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: false,
            googleAvailable: true,
        })).toEqual(['google'])
    })

    it('public + 双配置：github + google', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: true,
            googleAvailable: true,
        })).toEqual(['github', 'google'])
    })

    it('public + 未配置：空（不显示第三方登录区）', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: false,
            googleAvailable: false,
        })).toEqual([])
    })

    it('enterprise 模式：不显示 GitHub/Google（OIDC 子任务填充）', () => {
        expect(resolveSocialProviders({
            authMode: 'enterprise',
            githubAvailable: true,
            googleAvailable: true,
        })).toEqual([])
    })
})
