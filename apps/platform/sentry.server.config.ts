/**
 * Sentry 服务端初始化（由 `@sentry/nuxt/module` 打包进 Nitro server 并在启动时执行）。
 *
 * 口径见 docs/design/governance/platform-observability.md：
 * - 未配置 `SENTRY_DSN` → 不调用 `Sentry.init`（零初始化、零出网）
 * - 配置后 → 错误全量、事务按采样率；`beforeSend` 统一脱敏（URL query / Cookie / OAuth 参数）
 * - 关闭 SDK 自带 Nitro error handler：API 5xx 由 `server/plugins/observability.ts` 统一上报，
 *   避免同一异常在 SDK 自动采集与生命周期事件里出现两条
 */
import * as Sentry from '@sentry/nuxt'
import { createSentrySink, initializeServerObservability } from './server/utils/observability'
import { sanitizeSentryEvent } from './shared/sentry-sanitize'

initializeServerObservability({
    env: process.env,
    sink: createSentrySink({
        captureEvent: (event) => Sentry.captureEvent({
            message: event.message,
            level: event.level,
            extra: event.extra,
            tags: event.tags,
        }),
        captureException: (error, context) => Sentry.captureException(error, {
            extra: context.extra,
            tags: context.tags,
        }),
        flush: (timeoutMs) => Sentry.flush(timeoutMs),
    }),
    init: (options) => Sentry.init({
        ...options,
        beforeSend: (event) => sanitizeSentryEvent(event),
        // 事务 / span 不走 beforeSend；SDK 默认 span streaming，用 beforeSendSpan 覆盖
        beforeSendSpan: (span) => sanitizeSentryEvent(span),
    }),
})
