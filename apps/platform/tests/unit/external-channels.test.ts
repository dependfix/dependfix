import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    PROVIDER_LOG_MAX_BYTES,
    fetchProviderLog,
    redactProviderLog,
} from '@dependfix/engine'
import {
    SENTRY_DATA_COLLECTION,
    resolveObservabilitySettings,
} from '#shared/observability'
import { sanitizeSentryEvent } from '#shared/sentry-sanitize'
import {
    captureLifecycleEvent,
    initializeServerObservability,
    resetObservability,
    type ObservabilitySink,
} from '#server/utils/observability'
import { setSchemaStatus } from '#server/database/schema-drift'
import { toHealthView } from '#server/services/view/health'
import { toReadinessView } from '#server/services/view/readiness'

/**
 * 外部通道测试矩阵（Sentry / uptime / provider 日志）：
 * 每条通道都必须同时具备「未配置 = 零出网」与「已配置 = 必脱敏」两向守卫。
 * 脱敏样例使用真实生成值形态（≥3 类 × 多例），不只手写单例。
 */
/**
 * 真实生成值批量取样（每类 5 例，真实长度；payload 显式含 `-` / `_` 判别样本）。
 * 手写单例或短 payload 会让「正则退化」类 mutation 存活，因此逐例断言 payload 子串不出现，
 * 并断言占位符仍在（只遮前缀 / 只遮前 5 位都会判红）。
 */
const makePayload = (length: number, seed: string): string => {
    const random = randomBytes(40).toString('base64url')
    // `-` / `_` 放在前部，保证任何截断长度都保留判别字符
    const raw = `${seed}-${seed}_${random}`
    const payload = raw.slice(0, length)
    if (!payload.includes('-') || !payload.includes('_')) {
        throw new Error('sample payload must include - and _ for mutation sensitivity')
    }
    return payload
}

const generated = {
    github: Array.from({ length: 5 }, (_, i) => {
        const payload = makePayload(32, `g${i}`)
        return { token: `ghp_${payload}`, payload, placeholder: 'ghp_***' }
    }),
    dependfix: Array.from({ length: 5 }, (_, i) => {
        const payload = makePayload(48, `d${i}`)
        return { token: `dfk_${payload}`, payload, placeholder: 'dfk_***' }
    }),
    bearer: Array.from({ length: 5 }, (_, i) => {
        const payload = makePayload(32, `b${i}`)
        return { token: payload, line: `Authorization: Bearer ${payload}` }
    }),
    url: Array.from({ length: 5 }, (_, i) => {
        const payload = makePayload(24, `u${i}`)
        return { password: payload, line: `postgres://user:${payload}@db.example.com:5432/app` }
    }),
    cookie: Array.from({ length: 5 }, (_, i) => {
        const payload = makePayload(24, `c${i}`)
        return { value: payload, line: `Cookie: session=${payload}` }
    }),
}

const createSink = () => {
    const captureEvent = vi.fn()
    const captureException = vi.fn()
    const sink: ObservabilitySink = { captureEvent, captureException, flush: vi.fn(async () => true) }
    return { sink, captureEvent, captureException }
}

afterEach(() => {
    resetObservability()
    setSchemaStatus('unknown')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('Sentry 通道', () => {
    it('未配置 DSN：SDK 零初始化、采集零出网', () => {
        const { sink, captureEvent } = createSink()
        const init = vi.fn()
        initializeServerObservability({ env: {}, init, sink })
        expect(init).not.toHaveBeenCalled()
        expect(captureLifecycleEvent('platform_started', 'info')).toBe(false)
        expect(captureEvent).not.toHaveBeenCalled()
    })

    it('已配置：自动采集面全关（dataCollection 全键）', () => {
        expect(Object.keys(SENTRY_DATA_COLLECTION).sort()).toEqual([
            'cookies', 'databaseQueryData', 'frameContextLines', 'genAI', 'graphQL',
            'httpBodies', 'httpHeaders', 'mcp', 'queues', 'stackFrameVariables', 'urlQueryParams', 'userInfo',
        ])
        expect(SENTRY_DATA_COLLECTION.genAI).toEqual({ inputs: false, outputs: false })
        expect(SENTRY_DATA_COLLECTION.mcp).toEqual({ inputs: false, outputs: false })
        expect(SENTRY_DATA_COLLECTION).toMatchObject({
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
            graphQL: { document: false, variables: false },
            databaseQueryData: false,
            queues: false,
            stackFrameVariables: false,
            frameContextLines: 0,
        })
    })

    it('已配置：事件信封六类样例均被脱敏', () => {
        for (const sample of generated.github) {
            const redacted = JSON.stringify(sanitizeSentryEvent({ message: sample.token }))
            expect(redacted).not.toContain(sample.payload)
            // 只遮前缀的 mutation 会残留 payload 尾部，单独断言随机尾段
            expect(redacted).not.toContain(sample.payload.slice(-12))
            expect(redacted).toContain(sample.placeholder)
        }
        for (const sample of generated.dependfix) {
            const redacted = JSON.stringify(sanitizeSentryEvent({ message: sample.token }))
            expect(redacted).not.toContain(sample.payload)
            expect(redacted).not.toContain(sample.payload.slice(-12))
            expect(redacted).toContain(sample.placeholder)
        }
        for (const sample of generated.bearer) {
            const redacted = JSON.stringify(sanitizeSentryEvent({ message: sample.line }))
            expect(redacted).not.toContain(sample.token)
            expect(redacted).not.toContain(sample.token.slice(-12))
        }
        for (const sample of generated.cookie) {
            // Cookie 头只在 request.headers 采集面出现（该面整体丢弃，保留白名单头）
            const redacted = JSON.stringify(sanitizeSentryEvent({ request: { headers: { Cookie: sample.line } } }))
            expect(redacted).not.toContain(sample.value)
            expect(redacted).not.toContain(sample.value.slice(-12))
        }
        for (const sample of generated.url) {
            const redacted = JSON.stringify(sanitizeSentryEvent({ message: sample.line }))
            expect(redacted).not.toContain(sample.password)
            expect(redacted).not.toContain(sample.password.slice(-12))
        }
        const event = sanitizeSentryEvent({
            request: {
                url: 'https://app.example.com/cb?code=oauth-code&state=oauth-state',
                data: { password: 'hunter2' },
            },
        })
        const serialized = JSON.stringify(event)
        expect(serialized).not.toContain('oauth-code')
        expect(serialized).not.toContain('oauth-state')
        expect(serialized).not.toContain('hunter2')
    })

    it('已配置：事务 / span 走 beforeSendSpan 同一脱敏函数', () => {
        const span = sanitizeSentryEvent({ attributes: { 'url.query': 'code=oauth-code&state=oauth-state' } }) as {
            attributes: Record<string, string>
        }
        expect(span.attributes['url.query']).toBe('code=***&state=***')
    })
})

describe('uptime 通道', () => {
    it('liveness 只返回四个字段白名单', () => {
        vi.stubGlobal('useRuntimeConfig', () => ({ buildVersion: '1.2.0', buildCommit: 'abc1234' }))
        const view = toHealthView()
        expect(Object.keys(view).sort()).toEqual(['commit', 'schema', 'startedAt', 'version'])
    })

    it('readiness 只返回 status / schema，不含数据库明细', async () => {
        setSchemaStatus('ok')
        const view = await toReadinessView({ ensureDataSource: async () => ({ query: async () => [{ '1': 1 }] }) })
        expect(Object.keys(view).sort()).toEqual(['schema', 'status'])
        expect(JSON.stringify(view)).not.toMatch(/sqlite|postgres|mysql|path/i)
    })

    it('readiness 数据库不可读 → not_ready（liveness 不受影响）', async () => {
        const view = await toReadinessView({
            ensureDataSource: async () => {
                throw new Error('no such table')
            },
        })
        expect(view.status).toBe('not_ready')
        vi.stubGlobal('useRuntimeConfig', () => ({}))
        expect(toHealthView().version).toBe('unknown')
    })
})

describe('provider 日志通道', () => {
    const request = {
        provider: 'vercel',
        token: generated.dependfix[0]!.token,
        headSha: 'abcdef0123456789abcdef0123456789abcdef01',
        targets: { vercelProjectId: 'prj_1' },
    }

    it('未配置 token / 目标 → 零请求', async () => {
        const fetchSpy = vi.fn()
        await fetchProviderLog({ ...request, token: '' }, { fetch: fetchSpy })
        await fetchProviderLog({ ...request, targets: {} }, { fetch: fetchSpy })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('不支持的 provider → 零请求', async () => {
        const fetchSpy = vi.fn()
        const result = await fetchProviderLog({ ...request, provider: 'netlify' }, { fetch: fetchSpy })
        expect(result).toMatchObject({ available: false, reason: 'unsupported_provider' })
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('已配置：日志尾部按 8 KB 截断', async () => {
        const fetchImpl = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ deployments: [{ uid: 'dpl_1' }] }), { status: 200 }))
            .mockResolvedValueOnce(new Response(JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ text: `line-${i}-${'x'.repeat(40)}` }))), { status: 200 }))
        const result = await fetchProviderLog(request, { fetch: fetchImpl })
        expect(result.available).toBe(true)
        if (result.available) {
            expect(Buffer.byteLength(result.tail, 'utf8')).toBeLessThanOrEqual(PROVIDER_LOG_MAX_BYTES)
            expect(result.truncated).toBe(true)
        }
    })

    it('已配置：日志中的真实生成值样例全部脱敏（逐例 payload 断言）', () => {
        const samples = [
            ...generated.github.map((item) => ({ line: item.token, secret: item.payload, placeholder: item.placeholder })),
            ...generated.dependfix.map((item) => ({ line: item.token, secret: item.payload, placeholder: item.placeholder })),
            ...generated.bearer.map((item) => ({ line: item.line, secret: item.token, placeholder: '***' })),
            ...generated.url.map((item) => ({ line: item.line, secret: item.password, placeholder: '***' })),
            ...generated.cookie.map((item) => ({ line: item.line, secret: item.value, placeholder: '***' })),
        ]
        const redacted = redactProviderLog(samples.map((item) => item.line).join('\n'), generated.dependfix[0]!.token)
        for (const sample of samples) {
            expect(redacted).not.toContain(sample.secret)
            // 只遮前缀 / 只遮前 N 位会残留尾段
            expect(redacted).not.toContain(sample.secret.slice(-12))
            expect(redacted).toContain(sample.placeholder)
        }
    })

    it('401 / 429 降级为不可用（不改调用方状态）', async () => {
        const unauthorized = await fetchProviderLog(request, {
            fetch: vi.fn(async () => new Response('{}', { status: 401 })),
        })
        const limited = await fetchProviderLog(request, {
            fetch: vi.fn(async () => new Response('{}', { status: 429 })),
        })
        expect(unauthorized).toMatchObject({ available: false, reason: 'unauthorized', status: 401 })
        expect(limited).toMatchObject({ available: false, reason: 'rate_limited', status: 429 })
    })
})

describe('通道开关判定', () => {
    it('DSN 为空即关闭（不因采样率 / 环境名而启用）', () => {
        expect(resolveObservabilitySettings({ dsn: '', errorSampleRate: '1' }).enabled).toBe(false)
        expect(resolveObservabilitySettings({ dsn: 'https://x@example.com/1' }).enabled).toBe(true)
    })
})
