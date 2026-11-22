import { describe, expect, it } from 'vitest'
import { CIRCULAR_PLACEHOLDER, sanitizeString, sanitizeDeep } from './sanitize'

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

    it('脱敏 github_pat_ 前缀 token（fine-grained）', () => {
        const input = 'fine-grained is github_pat_11ABCDEFG0abcdefghijklmnop'
        expect(sanitizeString(input)).toBe('fine-grained is github_pat_***')
    })

    it('脱敏非 http scheme 的 URL 内嵌凭据（postgres / redis / mysql）', () => {
        expect(sanitizeString('postgres://user:pa55@db.internal:5432/app'))
            .toBe('postgres://***@db.internal:5432/app')
        expect(sanitizeString('redis://:secret@redis:6379/0')).toBe('redis://***@redis:6379/0')
        expect(sanitizeString('mysql://root:pa55@127.0.0.1:3306/db')).toBe('mysql://***@127.0.0.1:3306/db')
    })

    it('脱敏 PEM 私钥块（多行整体替换）', () => {
        const input = 'key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----\ndone'
        const result = sanitizeString(input)
        expect(result).toContain('[redacted-private-key]')
        expect(result).not.toContain('MIIEow')
        expect(result).toContain('done')
    })

    it('脱敏 ghu_ 前缀 token', () => {
        expect(sanitizeString('token is ghu_abc123')).toBe('token is ghu_***')
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

    it('cookie 字段名替换为 ***（会话凭据）', () => {
        expect(sanitizeDeep({ Cookie: 'session=abc', headers: { cookie: 'session=abc' } }))
            .toEqual({ Cookie: '***', headers: { cookie: '***' } })
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

    it('保留 Error 的 code / cause（排障必需），并同样脱敏', () => {
        const error = Object.assign(new Error('fs failed'), { code: 'EACCES' })
        error.cause = new Error('postgres://user:pa55@db/app')
        const result = sanitizeDeep(error) as { code?: string, cause?: { message: string } }
        expect(result.code).toBe('EACCES')
        expect(result.cause?.message).toBe('postgres://***@db/app')
    })

    it('敏感字段名覆盖 apiKey / privateKey / connectionString / passwd / accessKey', () => {
        const result = sanitizeDeep({
            apiKey: 'a',
            privateKey: 'b',
            connectionString: 'c',
            passwd: 'd',
            accessKey: 'e',
            api_key: 'f',
        }) as Record<string, string>
        for (const value of Object.values(result)) {
            expect(value).toBe('***')
        }
    })

    it('Error 实例展开为 name / message / stack（非可枚举属性不丢）', () => {
        const error = new TypeError('boom')
        const result = sanitizeDeep(error) as { name: string, message: string, stack?: string }
        expect(result.name).toBe('TypeError')
        expect(result.message).toBe('boom')
        expect(result.stack).toContain('TypeError: boom')
    })

    it('Error message 与 stack 中的凭据同样脱敏', () => {
        const error = new Error('fetch https://x-access-token:ghp_abc123@github.com/o/r failed')
        const result = sanitizeDeep(error) as { message: string, stack: string }
        expect(result.message).not.toContain('ghp_abc123')
        expect(result.stack).not.toContain('ghp_abc123')
    })

    it('环状 Error.cause 不爆栈（自引用 / 互为 cause）', () => {
        const self = new Error('self')
        self.cause = self
        const sanitizedSelf = sanitizeDeep(self) as { cause: unknown }
        expect(sanitizedSelf.cause).toBe(CIRCULAR_PLACEHOLDER)

        const a = new Error('a')
        const b = new Error('b')
        a.cause = b
        b.cause = a
        const sanitizedA = sanitizeDeep(a) as { cause: { cause: unknown } }
        expect(sanitizedA.cause.cause).toBe(CIRCULAR_PLACEHOLDER)
    })

    it('抛错 getter 单字段降级为占位（不拖垮整条日志）', () => {
        const poison = {}
        Object.defineProperty(poison, 'boom', {
            enumerable: true,
            get: () => {
                throw new Error('getter exploded')
            },
        })
        const result = sanitizeDeep({ safe: 'value', poison }) as Record<string, unknown>
        expect(result.safe).toBe('value')
        expect((result.poison as Record<string, unknown>).boom).toBe('[unserializable]')
    })

    it('循环引用替换为占位符（不爆栈）', () => {
        const circular: Record<string, unknown> = { token: 'secret' }
        circular.self = circular
        const result = sanitizeDeep(circular) as Record<string, unknown>
        expect(result.token).toBe('***')
        expect(result.self).toBe(CIRCULAR_PLACEHOLDER)
    })

    it('循环数组同样安全', () => {
        const list: unknown[] = ['normal']
        list.push(list)
        const result = sanitizeDeep(list) as unknown[]
        expect(result[0]).toBe('normal')
        expect(result[1]).toBe(CIRCULAR_PLACEHOLDER)
    })
})
