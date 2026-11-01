import { describe, expect, it } from 'vitest'
import { hasOAuthCredentials } from './oauth-availability'

describe('hasOAuthCredentials（public 模式 OAuth 可用性）', () => {
    it('client id 与 secret 均非空 → true', () => {
        expect(hasOAuthCredentials('client-id', 'client-secret')).toBe(true)
    })

    it('任一缺失 / 空串 / undefined → false（不把半配置当成可用）', () => {
        expect(hasOAuthCredentials('client-id', '')).toBe(false)
        expect(hasOAuthCredentials('', 'client-secret')).toBe(false)
        expect(hasOAuthCredentials(undefined, 'client-secret')).toBe(false)
        expect(hasOAuthCredentials('client-id', undefined)).toBe(false)
    })
})
