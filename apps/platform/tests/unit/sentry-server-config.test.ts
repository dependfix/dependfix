import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * `sentry.server.config.ts` 入口单测：初始化闸门 + beforeSend / beforeSendSpan 脱敏接线。
 *
 * 用 stub 替换 `@sentry/nuxt`（零网络），通过 `vi.stubEnv` 控制 DSN，
 * 断言「未配置 DSN 不调用 init」与「配置后 init 选项与脱敏回调生效」。
 */
const sentryMock = vi.hoisted(() => ({
    init: vi.fn(),
    captureEvent: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn(async () => true),
}))

vi.mock('@sentry/nuxt', () => sentryMock)

import { captureLifecycleEvent, isObservabilityEnabled, resetObservability } from '#server/utils/observability'

/** 让模块级初始化重新执行（每个用例独立的 env 与模块状态） */
const loadServerConfig = async (): Promise<void> => {
    vi.resetModules()
    await import('../../sentry.server.config')
}

afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
    resetObservability()
})

describe('sentry.server.config', () => {
    it('未配置 SENTRY_DSN：不调用 Sentry.init，采集保持关闭（零出网）', async () => {
        vi.stubEnv('SENTRY_DSN', '')
        await loadServerConfig()

        expect(sentryMock.init).not.toHaveBeenCalled()
        expect(isObservabilityEnabled()).toBe(false)
        expect(captureLifecycleEvent('platform_started', 'info')).toBe(false)
        expect(sentryMock.captureEvent).not.toHaveBeenCalled()
    })

    it('配置 DSN：init 选项含 release / commit / dataCollection，并接线 beforeSend / beforeSendSpan', async () => {
        vi.stubEnv('SENTRY_DSN', 'https://public@o0.ingest.sentry.io/1')
        vi.stubEnv('SENTRY_ENVIRONMENT', 'production')
        vi.stubEnv('NUXT_BUILD_VERSION', '1.2.0')
        vi.stubEnv('NUXT_BUILD_COMMIT', 'abc1234')
        await loadServerConfig()

        expect(sentryMock.init).toHaveBeenCalledTimes(1)
        const options = sentryMock.init.mock.calls[0]![0] as {
            dsn: string
            release: string
            dataCollection: { urlQueryParams: boolean, cookies: boolean, httpBodies: unknown[] }
            initialScope: { tags: Record<string, string> }
            beforeSend: (event: unknown) => unknown
            beforeSendSpan: (span: unknown) => unknown
        }
        expect(options).toMatchObject({
            dsn: 'https://public@o0.ingest.sentry.io/1',
            release: '1.2.0',
            dataCollection: { urlQueryParams: false, cookies: false, httpBodies: [] },
            initialScope: { tags: { commit: 'abc1234' } },
        })

        const event = options.beforeSend({
            message: 'token=ghp_abcdefghijklmnopqrstuvwxyz0123',
            request: { url: 'https://app.example.com/cb?code=oauth-code&state=oauth-state' },
        }) as { message: string, request: { url: string } }
        expect(event.message).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123')
        expect(event.request.url).toBe('https://app.example.com/cb')

        const span = options.beforeSendSpan({ attributes: { 'url.query': 'code=oauth-code&state=oauth-state' } }) as {
            attributes: Record<string, string>
        }
        expect(span.attributes['url.query']).toBe('code=***&state=***')

        // sink 已登记：采集入口进入 stub（不触网）
        expect(captureLifecycleEvent('platform_started', 'info', { role: 'server' })).toBe(true)
        expect(sentryMock.captureEvent).toHaveBeenCalledTimes(1)
    })
})
