/**
 * Sentry 事件脱敏（App 与 server 共享）。
 *
 * 与 `shared/sanitize.ts` 的分工：本模块是**事件级**清洗，负责 Sentry 事件信封里
 * 高风险采集面的裁剪（URL query、请求体、Cookie、User）、请求头白名单与 OAuth 参数擦除，
 * 具体字符串规则仍复用 `sanitizeString` / `sanitizeDeep`，不另立一套脱敏口径。
 *
 * 为什么必须独立于 logger：Sentry 事件包含 SDK 自动采集的 request / breadcrumbs / user，
 * 这些字段不经过平台日志通道；只靠日志脱敏无法覆盖「一个带 `?code=` 的回调 URL 被当作
 * breadcrumb 上报」这类泄漏面（口径见 docs/design/governance/platform-observability.md §4）。
 */
import { CIRCULAR_PLACEHOLDER, sanitizeDeep, sanitizeString } from './sanitize'

/**
 * URL / 查询串中的 OAuth 与凭据参数（键名精确匹配，避免误伤 `encoding` 之类包含 code 的键）。
 * 覆盖：授权码、state、各类 token、密码、api key。
 */
const URL_SECRET_PARAM_PATTERN = /(^|[?&#])((?:code|state|access_token|id_token|refresh_token|token|password|api[-_]?key)=)[^&#\s]*/gi

/** 事件中保留的请求头白名单（其余一律丢弃：Cookie / Authorization / X-* 凭据头不上报） */
const REQUEST_HEADER_ALLOWLIST = new Set([
    'accept',
    'accept-language',
    'content-type',
    'referer',
    'user-agent',
])

/** 擦除 URL / 查询串中的 OAuth 与凭据参数值（保留键名，便于定位泄漏来源） */
export function scrubUrlSecrets(value: string): string {
    return value.replace(URL_SECRET_PARAM_PATTERN, '$1$2***')
}

/**
 * 去掉 URL 的查询串与锚点（只保留路径部分）。
 * Sentry 的 `request.url` 允许包含 query，OAuth 回调与分享链接的凭据常在 query 里；
 * 事件里保留路径已足够定位路由，不需要参数。
 */
export function stripUrlQuery(value: string): string {
    const queryIndex = value.indexOf('?')
    const withoutQuery = queryIndex === -1 ? value : value.slice(0, queryIndex)
    const hashIndex = withoutQuery.indexOf('#')
    return hashIndex === -1 ? withoutQuery : withoutQuery.slice(0, hashIndex)
}

/** 递归擦除字符串里的 OAuth 参数（`sanitizeDeep` 之后执行，保留其对象 / 环 / Error 处理） */
const scrubStrings = (value: unknown, seen: WeakSet<object> = new WeakSet<object>()): unknown => {
    if (typeof value === 'string') {
        return scrubUrlSecrets(value)
    }
    if (Array.isArray(value)) {
        if (seen.has(value)) {
            return CIRCULAR_PLACEHOLDER
        }
        seen.add(value)
        try {
            return value.map((item) => scrubStrings(item, seen))
        } finally {
            seen.delete(value)
        }
    }
    if (value && typeof value === 'object') {
        if (seen.has(value)) {
            return CIRCULAR_PLACEHOLDER
        }
        seen.add(value)
        try {
            const result: Record<string, unknown> = {}
            for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
                result[key] = scrubStrings(item, seen)
            }
            return result
        } finally {
            seen.delete(value)
        }
    }
    return value
}

/** 请求头白名单过滤（值同样过 `sanitizeString`） */
const filterRequestHeaders = (headers: unknown): Record<string, string> | undefined => {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
        return undefined
    }
    const filtered: Record<string, string> = {}
    for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
        if (!REQUEST_HEADER_ALLOWLIST.has(key.toLowerCase()) || typeof value !== 'string') {
            continue
        }
        filtered[key] = scrubUrlSecrets(sanitizeString(value))
    }
    return Object.keys(filtered).length > 0 ? filtered : undefined
}

type SentryEventRecord = Record<string, unknown>

/** 清洗 request 段：丢 query / body / Cookie / env，URL 去 query，请求头走白名单 */
const sanitizeRequest = (request: unknown): unknown => {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
        return request
    }
    const record = { ...(request as SentryEventRecord) }
    delete record.query_string
    delete record.data
    delete record.cookies
    delete record.env
    if (typeof record.url === 'string') {
        record.url = scrubUrlSecrets(stripUrlQuery(record.url))
    }
    const headers = filterRequestHeaders(record.headers)
    if (headers) {
        record.headers = headers
    } else {
        delete record.headers
    }
    return record
}

/** 清洗 breadcrumb：`data.url` 去 query（导航类 breadcrumb 的 URL 是 query 泄漏的主要来源） */
const sanitizeBreadcrumbs = (breadcrumbs: unknown): unknown => {
    if (!Array.isArray(breadcrumbs)) {
        return breadcrumbs
    }
    return breadcrumbs.map((breadcrumb) => {
        if (!breadcrumb || typeof breadcrumb !== 'object') {
            return breadcrumb
        }
        const record = { ...(breadcrumb as SentryEventRecord) }
        const data = record.data
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            const dataRecord = { ...(data as SentryEventRecord) }
            if (typeof dataRecord.url === 'string') {
                dataRecord.url = scrubUrlSecrets(stripUrlQuery(dataRecord.url))
            }
            record.data = dataRecord
        }
        return record
    })
}

/** 清洗 user 段：只保留 id（邮箱 / IP / 用户名等 PII 不上报，sendDefaultPii 亦为 false） */
const sanitizeUser = (user: unknown): unknown => {
    if (!user || typeof user !== 'object' || Array.isArray(user)) {
        return undefined
    }
    const id = (user as SentryEventRecord).id
    return typeof id === 'string' || typeof id === 'number' ? { id } : undefined
}

/**
 * 事件级脱敏（Sentry `beforeSend` 的唯一入口，服务端与浏览器端共用）。
 *
 * 顺序：`sanitizeDeep`（字符串规则 + Error / 环处理）→ 字符串 OAuth 擦除 → 高风险段裁剪。
 * 返回新对象，不修改入参（Sentry 会把事件继续交给下一个 beforeSend / 传输层）。
 */
export function sanitizeSentryEvent<T>(event: T): T {
    if (!event || typeof event !== 'object') {
        return event
    }
    const scrubbed = scrubStrings(sanitizeDeep(event)) as SentryEventRecord
    if ('request' in scrubbed) {
        const request = sanitizeRequest(scrubbed.request)
        if (request === undefined) {
            delete scrubbed.request
        } else {
            scrubbed.request = request
        }
    }
    if ('breadcrumbs' in scrubbed) {
        scrubbed.breadcrumbs = sanitizeBreadcrumbs(scrubbed.breadcrumbs)
    }
    if ('user' in scrubbed) {
        const user = sanitizeUser(scrubbed.user)
        if (user === undefined) {
            delete scrubbed.user
        } else {
            scrubbed.user = user
        }
    }
    return scrubbed as T
}
