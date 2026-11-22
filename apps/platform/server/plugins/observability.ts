import { defineNitroPlugin } from 'nitropack/runtime'
import { captureLifecycleError } from '#server/utils/observability'
import { shouldSkipHttpOnlyPlugin } from '#server/utils/process-role'
import { logger } from '#server/utils/logger'

/** 从异常对象解析 HTTP 状态码（h3 createError 带 statusCode；缺省按 500） */
const resolveStatusCode = (error: unknown): number => {
    if (error && typeof error === 'object') {
        const candidate = error as { statusCode?: unknown, status?: unknown }
        if (typeof candidate.statusCode === 'number') {
            return candidate.statusCode
        }
        if (typeof candidate.status === 'number') {
            return candidate.status
        }
    }
    return 500
}

/**
 * 可观测性接入：API 5xx 统一上报（Sentry）。
 *
 * 只挂 Nitro `error` 钩子——它接收未被路由 handler 捕获的异常（即 5xx）；
 * 4xx 由业务显式 `createError` 处理，不构成事故信号，不入 Sentry。
 * 上报前经 `captureLifecycleError` 统一脱敏（URL query / Cookie / OAuth 参数），
 * 并附带 route / method / statusCode 便于按路由聚合。
 *
 * 分类：HTTP-only 插件（worker 进程无 HTTP 错误面）。DSN 未配置时采集入口为 no-op。
 * 口径见 docs/design/governance/platform-observability.md §3。
 */
export default defineNitroPlugin((nitroApp) => {
    if (shouldSkipHttpOnlyPlugin('observability', process.env, logger)) {
        return
    }
    nitroApp.hooks.hook('error', (error, context) => {
        const event = context.event
        captureLifecycleError(error, {
            source: 'http',
            route: event?.path ?? 'unknown',
            method: event?.method ?? 'unknown',
            statusCode: resolveStatusCode(error),
        })
    })
})
