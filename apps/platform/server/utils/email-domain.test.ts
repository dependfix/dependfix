import { describe, expect, it } from 'vitest'
import {
    extractDomain,
    isEmailDomainAllowed,
    parseDomainList,
} from './email-domain'

describe('email-domain utils', () => {
    describe('parseDomainList', () => {
        it('空输入返回空数组', () => {
            expect(parseDomainList(undefined)).toEqual([])
            expect(parseDomainList(null)).toEqual([])
            expect(parseDomainList('')).toEqual([])
            expect(parseDomainList('  ')).toEqual([])
        })

        it('逗号分隔解析为数组（trim + 小写 + 去空）', () => {
            expect(parseDomainList('Example.com,  CORP.example.org , temp-mail.org'))
                .toEqual(['example.com', 'corp.example.org', 'temp-mail.org'])
        })

        it('全空白项被过滤', () => {
            expect(parseDomainList('example.com,,,temp-mail.org,')).toEqual(['example.com', 'temp-mail.org'])
        })
    })

    describe('extractDomain', () => {
        it('正常邮箱提取域名（小写）', () => {
            expect(extractDomain('user@Example.com')).toBe('example.com')
            expect(extractDomain('USER@corp.example.org')).toBe('corp.example.org')
        })

        it('无效邮箱返回 null', () => {
            expect(extractDomain(undefined)).toBeNull()
            expect(extractDomain(null)).toBeNull()
            expect(extractDomain('')).toBeNull()
            expect(extractDomain('no-at-sign')).toBeNull()
            expect(extractDomain('@example.com')).toBeNull()
            expect(extractDomain('user@')).toBeNull()
            expect(extractDomain('user@   ')).toBeNull()
        })

        it('本地部分可含 @ 时取最后分隔符（邮箱合法性与语义由注册方保证）', () => {
            expect(extractDomain('user+tag@example.com')).toBe('example.com')
        })
    })

    describe('isEmailDomainAllowed', () => {
        const base = {
            mode: 'public' as const,
            allowedDomains: [] as string[],
            blockedDomains: [] as string[],
        }

        it('email 缺失/无效 fail-closed（拒绝开通）', () => {
            expect(isEmailDomainAllowed({ ...base, email: undefined })).toBe(false)
            expect(isEmailDomainAllowed({ ...base, email: null })).toBe(false)
            expect(isEmailDomainAllowed({ ...base, email: '' })).toBe(false)
            expect(isEmailDomainAllowed({ ...base, email: 'not-an-email' })).toBe(false)
        })

        it('public：黑名单命中拒绝，未命中放行', () => {
            const ctx = { ...base, blockedDomains: ['mailinator.com'] }
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@mailinator.com' })).toBe(false)
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@gmail.com' })).toBe(true)
        })

        it('public：黑名单为空 = 开放注册（全部放行）', () => {
            expect(isEmailDomainAllowed({ ...base, email: 'user@anywhere.com' })).toBe(true)
        })

        it('public：黑名单精确匹配，子域不继承', () => {
            const ctx = { ...base, blockedDomains: ['mailinator.com'] }
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@sub.mailinator.com' })).toBe(true)
        })

        it('enterprise：白名单命中放行，未命中拒绝', () => {
            const ctx = { ...base, mode: 'enterprise' as const, allowedDomains: ['example.com'] }
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@example.com' })).toBe(true)
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@other.com' })).toBe(false)
        })

        it('enterprise：白名单为空 = 完全关闭自动开通（全部拒绝，决策点 6 修订）', () => {
            const ctx = { ...base, mode: 'enterprise' as const, allowedDomains: [] }
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@example.com' })).toBe(false)
        })

        it('enterprise：白名单精确匹配，子域不继承（fail-closed 方向）', () => {
            const ctx = { ...base, mode: 'enterprise' as const, allowedDomains: ['example.com'] }
            expect(isEmailDomainAllowed({ ...ctx, email: 'user@sub.example.com' })).toBe(false)
        })
    })
})
