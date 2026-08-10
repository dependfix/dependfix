import { describe, expect, it } from 'vitest'
import { resolveSocialProviders } from './social-providers'

describe('resolveSocialProviders（登录页第三方登录方式决策）', () => {
    it('public + GitHub 配置：仅 github', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: true,
            googleAvailable: false,
            oidcAvailable: false,
        })).toEqual(['github'])
    })

    it('public + Google 配置：仅 google', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: false,
            googleAvailable: true,
            oidcAvailable: false,
        })).toEqual(['google'])
    })

    it('public + 双配置：github + google（不含 oidc）', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: true,
            googleAvailable: true,
            oidcAvailable: true,
        })).toEqual(['github', 'google'])
    })

    it('public + 未配置：空（不显示第三方登录区）', () => {
        expect(resolveSocialProviders({
            authMode: 'public',
            githubAvailable: false,
            googleAvailable: false,
            oidcAvailable: false,
        })).toEqual([])
    })

    it('enterprise + OIDC 配置：仅 oidc（不含 GitHub/Google）', () => {
        expect(resolveSocialProviders({
            authMode: 'enterprise',
            githubAvailable: true,
            googleAvailable: true,
            oidcAvailable: true,
        })).toEqual(['oidc'])
    })

    it('enterprise + 未配置 OIDC：空（不显示第三方登录区）', () => {
        expect(resolveSocialProviders({
            authMode: 'enterprise',
            githubAvailable: true,
            googleAvailable: true,
            oidcAvailable: false,
        })).toEqual([])
    })
})
