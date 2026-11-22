import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    buildServerSentryOptions,
    captureLifecycleError,
    captureLifecycleEvent,
    configureObservability,
    createSentrySink,
    flushObservability,
    getObservabilityState,
    initializeServerObservability,
    isObservabilityEnabled,
    readObservabilityEnv,
    resetObservability,
    type ObservabilitySink,
} from './observability'
import {
    DEFAULT_ERROR_SAMPLE_RATE,
    DEFAULT_TRACES_SAMPLE_RATE,
    SENTRY_DATA_COLLECTION,
    resolveObservabilitySettings,
} from '#shared/observability'

/**
 * 可观测性运行时单测。
 *
 * 覆盖矩阵：
 * - env 解析（DSN 判据 / 采样率缺省 / 非法值收集）
 * - 初始化闸门（无 DSN → init 零调用、采集零出网）
 * - 有 DSN → init 选项字段（release / commit / 采样率 / PII 关闭）与 sink 登记
 * - API 500 / worker 异常各 1 条事件，含 release / commit（API 另含 route）
 * - 脱敏前置（上下文中的 token / OAuth 参数不进入 sink）
 * - sink 抛错不阻断业务；flush 语义
 * - createSentrySink 映射（tags.commit + extra）
 *
 * 真实 Sentry 网络传输不参与：sink / init 均为注入的 stub（零出网 / 事件字段两向）。
 */

const createStubSink = () => {
    const captureEvent = vi.fn()
    const captureException = vi.fn()
    const flush = vi.fn(async () => true)
    const sink: ObservabilitySink = { captureEvent, captureException, flush }
    return { sink, captureEvent, captureException, flush }
}

const baseEnv = (overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => ({
    SENTRY_DSN: 'https://public@o0.ingest.sentry.io/1',
    SENTRY_ENVIRONMENT: 'production',
    NUXT_BUILD_VERSION: '1.2.0',
    NUXT_BUILD_COMMIT: 'abc1234',
    ...overrides,
})

afterEach(() => {
    resetObservability()
    vi.restoreAllMocks()
})

describe('readObservabilityEnv', () => {
    it('DSN 为空 / 仅空白 → 关闭', () => {
        expect(readObservabilityEnv({}).settings.enabled).toBe(false)
        expect(readObservabilityEnv({ SENTRY_DSN: '   ' }).settings.enabled).toBe(false)
    })

    it('DSN 非空 → 启用，release / commit 取构建期版本戳', () => {
        const { settings, invalidSampleRates } = readObservabilityEnv(baseEnv())
        expect(settings).toMatchObject({
            enabled: true,
            dsn: 'https://public@o0.ingest.sentry.io/1',
            environment: 'production',
            release: '1.2.0',
            commit: 'abc1234',
            errorSampleRate: DEFAULT_ERROR_SAMPLE_RATE,
            tracesSampleRate: DEFAULT_TRACES_SAMPLE_RATE,
        })
        expect(invalidSampleRates).toEqual([])
    })

    it('environment 空串 / 缺省回退 NODE_ENV，再缺省 development', () => {
        expect(readObservabilityEnv({ SENTRY_DSN: 'https://x@example.com/1', NODE_ENV: 'staging' }).settings.environment)
            .toBe('staging')
        expect(readObservabilityEnv({ SENTRY_DSN: 'https://x@example.com/1', SENTRY_ENVIRONMENT: '  ', NODE_ENV: 'production' }).settings.environment)
            .toBe('production')
        expect(readObservabilityEnv({ SENTRY_DSN: 'https://x@example.com/1' }).settings.environment)
            .toBe('development')
    })

    it('非法采样率回退缺省值并回传原始值（不阻断启动）', () => {
        const { settings, invalidSampleRates } = readObservabilityEnv(baseEnv({
            SENTRY_ERRORS_SAMPLE_RATE: 'abc',
            SENTRY_TRACES_SAMPLE_RATE: '2',
        }))
        expect(settings.errorSampleRate).toBe(DEFAULT_ERROR_SAMPLE_RATE)
        expect(settings.tracesSampleRate).toBe(DEFAULT_TRACES_SAMPLE_RATE)
        expect(invalidSampleRates).toEqual(['abc', '2'])
    })

    it('合法采样率生效', () => {
        const { settings } = readObservabilityEnv(baseEnv({
            SENTRY_ERRORS_SAMPLE_RATE: '0.5',
            SENTRY_TRACES_SAMPLE_RATE: '0',
        }))
        expect(settings.errorSampleRate).toBe(0.5)
        expect(settings.tracesSampleRate).toBe(0)
    })
})

describe('initializeServerObservability', () => {
    it('未配置 DSN：SDK 零初始化，采集入口零出网（stub 收到 0 次）', () => {
        const { sink, captureEvent, captureException } = createStubSink()
        const init = vi.fn()
        const result = initializeServerObservability({ env: {}, init, sink })
        expect(result).toMatchObject({ enabled: false, initialized: false })
        expect(init).not.toHaveBeenCalled()
        expect(isObservabilityEnabled()).toBe(false)
        expect(captureLifecycleEvent('platform_started', 'info', { role: 'server' })).toBe(false)
        expect(captureLifecycleError(new Error('worker boom'), { source: 'queue_worker' })).toBe(false)
        expect(captureEvent).not.toHaveBeenCalled()
        expect(captureException).not.toHaveBeenCalled()
    })

    it('配置 DSN：init 一次且字段齐全（PII 关闭 / Nitro 自动 handler 关闭 / commit tag）', () => {
        const { sink } = createStubSink()
        const init = vi.fn()
        const result = initializeServerObservability({
            env: baseEnv({ SENTRY_ERRORS_SAMPLE_RATE: '0.25', SENTRY_TRACES_SAMPLE_RATE: '0.05' }),
            init,
            sink,
        })
        expect(result).toMatchObject({ enabled: true, initialized: true })
        expect(init).toHaveBeenCalledTimes(1)
        expect(init).toHaveBeenCalledWith(expect.objectContaining({
            dsn: 'https://public@o0.ingest.sentry.io/1',
            environment: 'production',
            release: '1.2.0',
            sampleRate: 0.25,
            tracesSampleRate: 0.05,
            dataCollection: SENTRY_DATA_COLLECTION,
            enableNitroErrorHandler: false,
            initialScope: { tags: { commit: 'abc1234' } },
        }))
        expect(SENTRY_DATA_COLLECTION).toMatchObject({
            userInfo: false,
            cookies: false,
            httpHeaders: false,
            httpBodies: [],
            urlQueryParams: false,
        })
        expect(getObservabilityState()).toMatchObject({
            enabled: true,
            release: '1.2.0',
            commit: 'abc1234',
            environment: 'production',
            sinkConfigured: true,
        })
    })

    it('非法采样率输出一次 warn', () => {
        const { sink } = createStubSink()
        const warn = vi.fn()
        initializeServerObservability({
            env: baseEnv({ SENTRY_ERRORS_SAMPLE_RATE: 'oops' }),
            init: vi.fn(),
            sink,
            warn,
        })
        expect(warn).toHaveBeenCalledTimes(1)
        expect(String(warn.mock.calls[0]![0])).toContain('oops')
    })

    it('Sentry 初始化抛错：降级为关闭且不阻断启动', () => {
        const { sink, captureEvent } = createStubSink()
        const warn = vi.fn()
        const result = initializeServerObservability({
            env: baseEnv(),
            init: () => {
                throw new Error('sdk boom')
            },
            sink,
            warn,
        })
        expect(result).toMatchObject({ enabled: false, initialized: false })
        expect(String(warn.mock.calls[0]![0])).toContain('sdk boom')
        expect(isObservabilityEnabled()).toBe(false)
        expect(captureLifecycleEvent('platform_started', 'info')).toBe(false)
        expect(captureEvent).not.toHaveBeenCalled()
    })

    it('同一 DSN 重复初始化：跳过 Sentry.init（dev 热重载不叠加集成）', () => {
        const { sink } = createStubSink()
        const init = vi.fn()
        initializeServerObservability({ env: baseEnv(), init, sink })
        const second = initializeServerObservability({ env: baseEnv(), init, sink })
        expect(init).toHaveBeenCalledTimes(1)
        expect(second).toMatchObject({ enabled: true, initialized: false })
    })

    it('buildServerSentryOptions 对未启用的设置拒绝构造（避免静默禁用）', () => {
        expect(() => buildServerSentryOptions(resolveObservabilitySettings({ dsn: '' })))
            .toThrow(/requires an enabled/)
    })
})

describe('生命周期事件转发', () => {
    const configure = (settingsOverrides: Record<string, unknown> = {}) => {
        const stub = createStubSink()
        configureObservability(
            resolveObservabilitySettings({
                dsn: 'https://public@o0.ingest.sentry.io/1',
                environment: 'production',
                release: '1.2.0',
                commit: 'abc1234',
                ...settingsOverrides,
            }),
            stub.sink,
        )
        return stub
    }

    it('API 500 与 worker 异常各产生 1 条事件，含 release / commit（API 含 route）', () => {
        const { captureEvent, captureException } = configure()
        const ok = captureLifecycleEvent('http_request_error', 'error', {
            source: 'http',
            route: '/api/repos/1',
            method: 'GET',
            statusCode: 500,
        })
        captureLifecycleError(new Error('worker boom'), { source: 'queue_worker', runId: 'run-1' })

        expect(ok).toBe(true)
        expect(captureEvent).toHaveBeenCalledTimes(1)
        expect(captureException).toHaveBeenCalledTimes(1)

        const eventPayload = captureEvent.mock.calls[0]![0]
        expect(eventPayload).toMatchObject({
            message: '[platform] http_request_error',
            level: 'error',
            context: {
                source: 'http',
                route: '/api/repos/1',
                method: 'GET',
                statusCode: 500,
                release: '1.2.0',
                commit: 'abc1234',
                environment: 'production',
            },
        })

        const [errorArg, errorContext] = captureException.mock.calls[0]!
        expect((errorArg as Error).message).toBe('worker boom')
        expect(errorContext).toMatchObject({
            source: 'queue_worker',
            runId: 'run-1',
            release: '1.2.0',
            commit: 'abc1234',
        })
    })

    it('上下文中的凭据进入 sink 前已脱敏（token / OAuth code·state / Cookie）', () => {
        const { captureEvent } = configure()
        captureLifecycleEvent('notification_delivery_failed', 'error', {
            channel: 'email',
            token: 'ghp_abcdefghijklmnopqrstuvwxyz0123',
            callback: 'https://app.example.com/cb?code=oauth-code-1&state=oauth-state-1',
            headers: { cookie: 'session=secret-cookie' },
        })
        const serialized = JSON.stringify(captureEvent.mock.calls[0]![0])
        expect(serialized).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123')
        expect(serialized).not.toContain('oauth-code-1')
        expect(serialized).not.toContain('oauth-state-1')
        expect(serialized).not.toContain('secret-cookie')
    })

    it('调用方不能覆盖 release / commit（运行时字段最后注入）', () => {
        const { captureEvent } = configure()
        captureLifecycleEvent('platform_started', 'info', { release: 'forged', commit: 'forged' })
        expect(captureEvent.mock.calls[0]![0].context).toMatchObject({ release: '1.2.0', commit: 'abc1234' })
    })

    it('sink 抛错不打断业务（返回 false）', () => {
        const throwingSink: ObservabilitySink = {
            captureEvent: () => {
                throw new Error('transport down')
            },
            captureException: () => {
                throw new Error('transport down')
            },
        }
        configureObservability(resolveObservabilitySettings({ dsn: 'https://x@example.com/1' }), throwingSink)
        expect(captureLifecycleEvent('platform_started', 'info')).toBe(false)
        expect(captureLifecycleError(new Error('boom'))).toBe(false)
    })

    it('flush：启用时委托 sink；关闭时直接返回 true', async () => {
        const { flush } = configure()
        await expect(flushObservability(1500)).resolves.toBe(true)
        expect(flush).toHaveBeenCalledWith(1500)

        resetObservability()
        await expect(flushObservability()).resolves.toBe(true)
    })
})

describe('createSentrySink', () => {
    it('captureEvent / captureException 映射到 Sentry，commit 进 tags、上下文进 extra', () => {
        const sentry = { captureEvent: vi.fn(), captureException: vi.fn(), flush: vi.fn(async () => true) }
        const sink = createSentrySink(sentry)
        sink.captureEvent({
            message: '[platform] scan_run_failed',
            level: 'error',
            context: { runId: 'run-1', commit: 'abc1234', release: '1.2.0' },
        })
        expect(sentry.captureEvent).toHaveBeenCalledWith({
            message: '[platform] scan_run_failed',
            level: 'error',
            extra: { runId: 'run-1', commit: 'abc1234', release: '1.2.0' },
            tags: { source: 'lifecycle', commit: 'abc1234' },
        })

        sink.captureException(new Error('boom'), { source: 'queue_worker', commit: 'abc1234' })
        expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
            extra: { source: 'queue_worker', commit: 'abc1234' },
            tags: { source: 'lifecycle', commit: 'abc1234' },
        })
    })

    it('commit 非字符串时 tags 回退 unknown（不产生 [object Object]）', () => {
        const sentry = { captureEvent: vi.fn() }
        createSentrySink(sentry).captureEvent({
            message: 'x',
            level: 'info',
            context: { commit: { nested: true } },
        })
        expect(sentry.captureEvent.mock.calls[0]![0].tags.commit).toBe('unknown')
    })

    it('Sentry 无 flush 实现时视为已冲刷', async () => {
        const sink = createSentrySink({})
        await expect(sink.flush?.(100)).resolves.toBe(true)
    })
})
