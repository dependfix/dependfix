import { describe, expect, it } from 'vitest'
import { sanitizeString, sanitizeDeep } from './sanitize'

describe('sanitizeString', () => {
    it('脱敏 URL 内嵌凭据', () => {
        const input = 'https://x-access-token:ghp_abc123@github.com/owner/repo.git'
        const result = sanitizeString(input)
        expect(result).toBe('https://***@github.com/owner/repo.git')
    })

    it('脱敏 Authorization basic 头', () => {
        const input = 'Authorization: basic dXNlcjpwYXNz'
        const result = sanitizeString(input)
        expect(result).toBe('Authorization: basic ***')
    })

    it('脱敏 Authorization token 头', () => {
        const input = 'Authorization: token ghp_abc123'
        const result = sanitizeString(input)
        expect(result).toBe('Authorization: token ***')
    })

    it('脱敏 Authorization bearer 头', () => {
        const input = 'Authorization: bearer eyJhbGciOiJIUzI1NiJ9'
        const result = sanitizeString(input)
        expect(result).toBe('Authorization: bearer ***')
    })

    it('脱敏 ghp_ 前缀 token', () => {
        const input = 'token is ghp_abc123def456'
        const result = sanitizeString(input)
        expect(result).toBe('token is ghp_***')
    })

    it('脱敏 gho_ 前缀 token', () => {
        const input = 'token is gho_abc123'
        const result = sanitizeString(input)
        expect(result).toBe('token is gho_***')
    })

    it('脱敏 ghs_ 前缀 token', () => {
        const input = 'token is ghs_abc123'
        const result = sanitizeString(input)
        expect(result).toBe('token is ghs_***')
    })

    it('脱敏 ghr_ 前缀 token', () => {
        const input = 'token is ghr_abc123'
        const result = sanitizeString(input)
        expect(result).toBe('token is ghr_***')
    })

    it('不改变普通文本', () => {
        const input = 'This is a normal message'
        const result = sanitizeString(input)
        expect(result).toBe(input)
    })

    it('处理空字符串', () => {
        expect(sanitizeString('')).toBe('')
    })

    it('脱敏多个 URL 凭据', () => {
        const input = 'https://user:pass@host.com/path and https://token:x@other.com/'
        const result = sanitizeString(input)
        expect(result).toBe('https://***@host.com/path and https://***@other.com/')
    })

    it('脱敏 Authorization 大小写不敏感', () => {
        const input = 'AUTHORIZATION: TOKEN ghp_abc'
        const result = sanitizeString(input)
        expect(result).toBe('AUTHORIZATION: TOKEN ***')
    })
})

describe('sanitizeDeep', () => {
    it('字符串调用 sanitizeString', () => {
        const input = 'token is ghp_abc123'
        const result = sanitizeDeep(input)
        expect(result).toBe('token is ghp_***')
    })

    it('数组递归处理', () => {
        const input = ['normal', 'token is ghp_abc']
        const result = sanitizeDeep(input) as string[]
        expect(result).toEqual(['normal', 'token is ghp_***'])
    })

    it('对象递归处理', () => {
        const input = { message: 'token is ghp_abc', other: 'normal' }
        const result = sanitizeDeep(input) as Record<string, string>
        expect(result.message).toBe('token is ghp_***')
        expect(result.other).toBe('normal')
    })

    it('敏感字段名替换为 ***', () => {
        const input = { token: 'secret-value', password: 'my-password', secret: 'my-secret' }
        const result = sanitizeDeep(input) as Record<string, string>
        expect(result.token).toBe('***')
        expect(result.password).toBe('***')
        expect(result.secret).toBe('***')
    })

    it('authorization 字段名替换为 ***', () => {
        const input = { authorization: 'Bearer token' }
        const result = sanitizeDeep(input) as Record<string, string>
        expect(result.authorization).toBe('***')
    })

    it('credential 字段名替换为 ***', () => {
        const input = { credential: 'some-value' }
        const result = sanitizeDeep(input) as Record<string, string>
        expect(result.credential).toBe('***')
    })

    it('null 返回 null', () => {
        expect(sanitizeDeep(null)).toBeNull()
    })

    it('undefined 返回 undefined', () => {
        expect(sanitizeDeep(undefined)).toBeUndefined()
    })

    it('数字返回原值', () => {
        expect(sanitizeDeep(42)).toBe(42)
    })

    it('布尔值返回原值', () => {
        expect(sanitizeDeep(true)).toBe(true)
    })

    it('嵌套对象递归处理', () => {
        const input = {
            level1: {
                level2: {
                    token: 'secret',
                    message: 'normal',
                },
            },
        }
        const result = sanitizeDeep(input) as Record<string, unknown>
        const level1 = result.level1 as Record<string, unknown>
        const level2 = level1.level2 as Record<string, string>
        expect(level2.token).toBe('***')
        expect(level2.message).toBe('normal')
    })

    it('嵌套数组递归处理', () => {
        const input = [{ token: 'secret' }, { message: 'normal' }]
        const result = sanitizeDeep(input) as unknown[]
        expect((result[0] as Record<string, string>).token).toBe('***')
        expect((result[1] as Record<string, string>).message).toBe('normal')
    })

    it('混合类型数组', () => {
        const input = ['normal', 42, null, { token: 'secret' }]
        const result = sanitizeDeep(input) as unknown[]
        expect(result[0]).toBe('normal')
        expect(result[1]).toBe(42)
        expect(result[2]).toBeNull()
        expect((result[3] as Record<string, string>).token).toBe('***')
    })

    it('空对象返回空对象', () => {
        const result = sanitizeDeep({}) as Record<string, unknown>
        expect(result).toEqual({})
    })

    it('空数组返回空数组', () => {
        expect(sanitizeDeep([])).toEqual([])
    })
})
