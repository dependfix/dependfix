/**
 * Sentry 浏览器端初始化（由 `@sentry/nuxt/module` 注入客户端插件并在 app 创建前执行）。
 *
 * DSN / 采样率来自 `runtimeConfig.public`（构建期烘焙 + 运行时 `NUXT_PUBLIC_*` 覆盖）：
 * 浏览器端无法读取服务端私有 env，因此只看 public 通道。未配置 DSN 时不调用 `Sentry.init`
 * （零初始化、零出网），与服务端同一判据（见 `shared/observability.ts`）。
 *
 * Web Vitals：由模块内置的浏览器插件按 `tracesSampleRate` 采集；错误事件按 `sampleRate`。
 */
import * as Sentry from '@sentry/nuxt'
import { buildSentryBaseOptions, resolveObservabilitySettings } from './shared/observability'
import { sanitizeSentryEvent } from './shared/sentry-sanitize'
import { useRuntimeConfig } from '#imports'

const runtimeConfig = useRuntimeConfig()
const settings = resolveObservabilitySettings({
    dsn: runtimeConfig.public.sentryDsn,
    environment: runtimeConfig.public.sentryEnvironment,
    release: runtimeConfig.public._sentryRelease,
    commit: runtimeConfig.public.sentryCommit,
    errorSampleRate: runtimeConfig.public.sentryErrorsSampleRate,
    tracesSampleRate: runtimeConfig.public.sentryTracesSampleRate,
})

if (settings.enabled) {
    Sentry.init({
        ...buildSentryBaseOptions(settings),
        beforeSend: (event) => sanitizeSentryEvent(event),
        beforeSendSpan: (span) => sanitizeSentryEvent(span),
    })
}
