import { describe, expect, it } from 'vitest'
import {
    sanitizeSentryEvent,
    scrubUrlSecrets,
    stripUrlQuery,
} from '#shared/sentry-sanitize'

/**
 * Sentry 事件脱敏单测（六类样例逐类断言）。
 *
 * 六类样例逐类断言（token / Cookie / URL query / OAuth code / OAuth state / 请求体密码），
 * 另覆盖请求头白名单、user 降级、breadcrumb URL 与循环引用。
 */

const GITHUB_TOKEN = 'ghp_abcdefghijklmnopqrstuvwxyz0123'
const OAUTH_CODE = 'oauth-code-6f2c1a'
const OAUTH_STATE = 'oauth-state-9b7d3e'
const COOKIE_VALUE = 'session=super-secret-cookie'
const BODY_PASSWORD = 'hunter2-plaintext'

/** 递归收集事件内的所有字符串（含键名之外的值），用于「明文不存在」断言 */
const collectStrings = (value: unknown, bucket: string[] = []): string[] => {
    if (typeof value === 'string') {
        bucket.push(value)
        return bucket
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectStrings(item, bucket))
        return bucket
    }
    if (value && typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((item) => collectStrings(item, bucket))
    }
    return bucket
}

describe('scrubUrlSecrets / stripUrlQuery', () => {
    it('擦除 OAuth 与凭据参数值，保留键名', () => {
        const scrubbed = scrubUrlSecrets(
            'https://app.example.com/cb?code=abc&state=def&access_token=ghp_1#frag',
        )
        expect(scrubbed).toBe('https://app.example.com/cb?code=***&state=***&access_token=***#frag')
    })

    it('query-only 形态（无前导 ?）也擦除首参', () => {
        expect(scrubUrlSecrets('code=abc&state=def&next=/home')).toBe('code=***&state=***&next=/home')
    })

    it('不误伤包含 code 子串的普通参数', () => {
        expect(scrubUrlSecrets('https://example.com/?encoding=utf-8&unicode=true'))
            .toBe('https://example.com/?encoding=utf-8&unicode=true')
    })

    it('stripUrlQuery 只保留路径', () => {
        expect(stripUrlQuery('https://example.com/a/b?code=x#y')).toBe('https://example.com/a/b')
        expect(stripUrlQuery('/api/health')).toBe('/api/health')
    })
})

describe('sanitizeSentryEvent', () => {
    it('六类样例均不出现在事件中（逐类断言）', () => {
        const event = {
            message: `回调失败 token=${GITHUB_TOKEN}`,
            request: {
                url: `https://app.example.com/oauth/callback?code=${OAUTH_CODE}&state=${OAUTH_STATE}&access_token=${GITHUB_TOKEN}`,
                query_string: `code=${OAUTH_CODE}&state=${OAUTH_STATE}`,
                data: { password: BODY_PASSWORD },
                cookies: { session: COOKIE_VALUE },
                headers: {
                    Cookie: COOKIE_VALUE,
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'User-Agent': 'Mozilla/5.0',
                },
            },
            breadcrumbs: [
                { category: 'navigation', data: { url: `https://app.example.com/cb?code=${OAUTH_CODE}` } },
            ],
            extra: {
                callback: `https://app.example.com/cb?state=${OAUTH_STATE}`,
                password: BODY_PASSWORD,
            },
        }
        const sanitized = sanitizeSentryEvent(event)
        const strings = collectStrings(sanitized).join('\n')

        expect(strings).not.toContain(GITHUB_TOKEN)
        expect(strings).not.toContain(COOKIE_VALUE)
        expect(strings).not.toContain(OAUTH_CODE)
        expect(strings).not.toContain(OAUTH_STATE)
        expect(strings).not.toContain(BODY_PASSWORD)
        // URL query 与请求体整体不进入事件
        expect(JSON.stringify(sanitized)).not.toContain('query_string')
        expect((sanitized.request as Record<string, unknown>).data).toBeUndefined()
        expect((sanitized.request as Record<string, unknown>).cookies).toBeUndefined()
    })

    it('request：URL 去 query，请求头只保留白名单', () => {
        const sanitized = sanitizeSentryEvent({
            request: {
                url: 'https://app.example.com/api/runs?token=abc#frag',
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    Accept: 'application/json',
                    Cookie: 'session=x',
                    'X-Api-Key': 'dfk_secret',
                },
            },
        }) as { request: { url: string, headers: Record<string, string> } }

        expect(sanitized.request.url).toBe('https://app.example.com/api/runs')
        expect(sanitized.request.headers).toEqual({
            'User-Agent': 'Mozilla/5.0',
            Accept: 'application/json',
        })
    })

    it('user 只保留 id（邮箱 / IP / 用户名丢弃）', () => {
        const sanitized = sanitizeSentryEvent({
            user: { id: 'usr_1', email: 'a@example.com', ip_address: '1.2.3.4', username: 'alice' },
        }) as { user: Record<string, unknown> }
        expect(sanitized.user).toEqual({ id: 'usr_1' })

        const withoutId = sanitizeSentryEvent({ user: { email: 'a@example.com' } }) as Record<string, unknown>
        expect(withoutId.user).toBeUndefined()
    })

    it('breadcrumb 的 data.url 去 query', () => {
        const sanitized = sanitizeSentryEvent({
            breadcrumbs: [{ data: { url: 'https://app.example.com/cb?code=abc' } }],
        }) as { breadcrumbs: { data: { url: string } }[] }
        expect(sanitized.breadcrumbs[0]!.data.url).toBe('https://app.example.com/cb')
    })

    it('深度脱敏：嵌套敏感键替换为 ***', () => {
        const sanitized = sanitizeSentryEvent({
            extra: { nested: { clientSecret: 'top-secret', apiKey: 'dfk_123' } },
        }) as { extra: { nested: Record<string, string> } }
        expect(sanitized.extra.nested.clientSecret).toBe('***')
        expect(sanitized.extra.nested.apiKey).toBe('***')
    })

    it('循环引用不爆栈', () => {
        const event: Record<string, unknown> = { extra: {} }
        ;(event.extra as Record<string, unknown>).self = event
        expect(() => sanitizeSentryEvent(event)).not.toThrow()
    })

    it('非对象输入原样返回（null / 字符串）', () => {
        expect(sanitizeSentryEvent(null)).toBeNull()
        expect(sanitizeSentryEvent('plain')).toBe('plain')
    })
})
