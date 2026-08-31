import { createError, type H3Event } from 'h3'
// 单一权威来源：与前端 i18n locale 文件共用（apps/platform/i18n/locales/*.json）。
// 字典形状：`serverErrors.<CODE> = { "zh-CN": "...", "en": "..." }`，
// helper 消费时按事件 locale 取值；新增错误码需双语同步（前端 i18n 校验脚本会检测键集对称）。
// 整文件 import 体积代价约 ~50KB，nitor 服务端冷启动影响极小；权衡：
// 拆出独立 serverErrors.json 会破坏"单一来源"语义，故选择整文件 import。
import enUS from '../../i18n/locales/en-US.json'
import zhCN from '../../i18n/locales/zh-CN.json'

/**
 * 错误码（机器可读，恒为英文常量；前端按 code 路由分支判断）。
 * 与 apps/platform/i18n/locales/{en-US,zh-CN}.json `serverErrors` 段键集一一对应，
 * helper 启动时与 locales 文件实际键集交叉校验（apps/platform/server/utils/localized-error.test.ts）。
 */
export type ServerErrorCode =
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'RESOURCE_NOT_IN_ORG'
    | 'REPO_NOT_FOUND'
    | 'REPO_DUPLICATE'
    | 'REPO_ID_MISSING'
    | 'REPO_VALIDATION_FAILED'
    | 'SCAN_RUN_NOT_FOUND'
    | 'RUN_ID_MISSING'
    | 'RUNS_VALIDATION_FAILED'
    | 'REUSE_RUN_NOT_IN_REPO'
    | 'REUSE_RUN_RUNNING'
    | 'SCAN_PENDING_MERGED'
    | 'SCAN_ALREADY_COMPLETED'
    | 'CREDENTIAL_NOT_FOUND'
    | 'CREDENTIAL_ID_MISSING'
    | 'CREDENTIAL_VALIDATION_FAILED'
    | 'SCHEDULE_NOT_FOUND'
    | 'SCHEDULE_ID_MISSING'
    | 'SCHEDULE_VALIDATION_FAILED'
    | 'BATCH_RUN_ID_MISSING'
    | 'BATCH_RUN_NOT_FOUND'
    | 'REPOS_BATCH_VALIDATION_FAILED'
    | 'REPOS_BATCH_SCAN_VALIDATION_FAILED'
    | 'REPOS_BATCH_SCAN_NO_REPO'
    | 'IMPORTABLE_CREDENTIAL_ID_MISSING'
    | 'IMPORTABLE_AFFILIATION_INVALID'
    | 'GITHUB_API_AUTH_FAILED'
    | 'GITHUB_API_FETCH_FAILED'
    | 'METHOD_NOT_ALLOWED'
    | 'UNKNOWN'

/** locale 标记（与 apps/platform/i18n/nuxt-i18n-config.ts locales.code 对齐） */
export type ServerLocale = 'zh-CN' | 'en'

/** 单条双语字典条目形状（强类型锁住 zh-CN + en 两个键） */
type ServerErrorEntry = Record<ServerLocale, string>

/** 双语字典视图（仅取 serverErrors 段，避免整个 locales 文件污染 IDE auto-complete） */
const SERVER_ERRORS = (enUS as { serverErrors: Record<string, ServerErrorEntry> }).serverErrors
const SERVER_ERRORS_ZH = (zhCN as { serverErrors: Record<string, ServerErrorEntry> }).serverErrors

/**
 * 默认 locale（与 apps/platform/i18n/nuxt-i18n-config.ts defaultLocale 对齐，
 * URL 无前缀/cookie/Accept-Language 全失效时兜底）。
 */
const DEFAULT_LOCALE: ServerLocale = 'zh-CN'

/**
 * 检测事件 locale（与 apps/platform/i18n/localeDetector.ts 同源简化版）：
 * 优先级 URL query (?locale=en/zh-CN) > cookie(i18n_locale) > Accept-Language > 默认 zh-CN。
 *
 * @nuxtjs/i18n URL 前缀(/en)由路由层在 server 端通过 setLocale 注入到 event.context.locale，
 * 本 helper 不依赖路由层注入（保持独立性，避免 server/api 直接访问 #imports 内部状态），
 * 走 query + cookie + Accept-Language 兜底；浏览器侧 i18n_locale cookie 与切换器同步写入，足够覆盖 99% 场景。
 *
 * 简化版采用 tag 前缀匹配（zh* → zh-CN / en* → en），与 i18n-detect.resolveLocale 行为一致；
 * 不引入完整 BCP 47 解析库（over-engineering），未知 locale 走默认 zh-CN。
 *
 * 防御：单测场景（guard.test.ts）的 mock event 可能没有 event.node.req（仅构造 { headers }），
 * getHeader/getCookie 访问 event.node.req.headers 时会抛 TypeError；此处降级到默认 zh-CN，
 * 不影响单测断言 statusCode（locale 仅影响 message 字段）。
 *
 * @see [todo-archive.md §M16.3 audit suggest backlog S2](../../docs/plan/todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档) — 与 [localeDetector.ts:15]({@link ../i18n/localeDetector.ts}) `tryQueryLocale` 对齐
 */
export function detectServerLocale(event: H3Event): ServerLocale {
    // 防御：单测 mock event 可能不含 node.req（guard.test.ts 走最小 H3Event shape）
    const reqHeaders = event.node?.req?.headers as Record<string, string | string[] | undefined> | undefined
    const reqUrl = event.node?.req?.url as string | undefined
    if (!reqHeaders) {
        return DEFAULT_LOCALE
    }
    // 优先级：URL query (?locale=en/zh-CN) > cookie > Accept-Language > 默认（M18.x 治理批次 S2 — 与 localeDetector.ts:15 tryQueryLocale 对齐）
    // 注意：URL 前缀路由（/en/...）由 @nuxtjs/i18n 路由层处理，本 helper 只补 query 形式；
    // query 解析用 URLSearchParams（Node 22+ 内置，零依赖）
    if (reqUrl) {
        try {
            // reqUrl 可能含 query string，提取 search 部分解析
            const queryStart = reqUrl.indexOf('?')
            if (queryStart !== -1) {
                const queryString = reqUrl.slice(queryStart + 1)
                const params = new URLSearchParams(queryString)
                const rawQueryLocale = params.get('locale')?.trim()
                if (rawQueryLocale) {
                    // 大小写不敏感（BCP 47 language tag 规范）；归一化到 ServerLocale 枚举值
                    const normalized = rawQueryLocale.toLowerCase()
                    if (normalized === 'en' || normalized === 'en-us') {
                        return 'en'
                    }
                    if (normalized === 'zh-cn' || normalized === 'zh') {
                        return 'zh-CN'
                    }
                }
            }
        } catch {
            // 防御：URLSearchParams 解析失败（如 query 含不合法编码）→ 降级到下一优先级
        }
    }
    // 优先级 cookie > Accept-Language > 默认；与现有 i18n-detect 行为对齐
    const cookieHeader = reqHeaders.cookie
    if (typeof cookieHeader === 'string') {
        // 仅解析 i18n_locale（避免引入 cookie 解析库；regex 简化版覆盖单值/多值两种格式）
        const match = /(?:^|;\s*)i18n_locale=([^;]+)/.exec(cookieHeader)
        const rawValue = match?.[1]?.trim()
        if (rawValue) {
            // 大小写不敏感（与 query 路径一致）
            const normalized = rawValue.toLowerCase()
            if (normalized === 'en' || normalized === 'en-us') {
                return 'en'
            }
            if (normalized === 'zh-cn' || normalized === 'zh') {
                return 'zh-CN'
            }
        }
    }
    const acceptLanguageRaw = reqHeaders['accept-language']
    let acceptLanguage: string
    if (typeof acceptLanguageRaw === 'string') {
        acceptLanguage = acceptLanguageRaw
    } else if (Array.isArray(acceptLanguageRaw)) {
        acceptLanguage = acceptLanguageRaw.join(',')
    } else {
        acceptLanguage = ''
    }
    const tags = acceptLanguage
        .split(',')
        .map((s: string) => s.trim().split(';')[0]?.toLowerCase() ?? '')
    if (tags.some((tag: string) => tag.startsWith('en'))) {
        return 'en'
    }
    if (tags.some((tag: string) => tag.startsWith('zh'))) {
        return 'zh-CN'
    }
    return DEFAULT_LOCALE
}

/**
 * 按 code + locale 取 message（缺失时兜底 UNKNOWN 双语，避免响应 message 是空或 undefined）。
 * 回退链：en-US 字典 → zh-CN 字典 → en-US UNKNOWN → zh-CN UNKNOWN → 硬编码 'Unknown error'。
 */
function resolveMessage(code: ServerErrorCode, locale: ServerLocale, params?: Record<string, string | number>): string {
    const entry: ServerErrorEntry | undefined = SERVER_ERRORS[code]
        ?? SERVER_ERRORS_ZH[code]
        ?? SERVER_ERRORS.UNKNOWN
        ?? SERVER_ERRORS_ZH.UNKNOWN
    let message = entry?.[locale] ?? entry?.en ?? entry?.['zh-CN'] ?? 'Unknown error'
    if (params) {
        for (const [key, value] of Object.entries(params)) {
            message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
        }
    }
    return message
}

/** statusCode → 标准 statusMessage（HTTP/RFC 7231 子集，与 h3 createError 默认对齐） */
const STATUS_MESSAGES: Record<number, string> = {
    '400': 'Bad Request',
    '401': 'Unauthorized',
    '403': 'Forbidden',
    '404': 'Not Found',
    '405': 'Method Not Allowed',
    '409': 'Conflict',
    '500': 'Internal Server Error',
}

export interface LocalizedErrorOptions {
    /** HTTP 状态码（h3 createError 默认 statusMessage 自动从该字段推断） */
    statusCode: number
    /** 错误码（恒为英文常量；前端按 code 判断分支） */
    code: ServerErrorCode
    /** message 模板插值 `{key}` → params[key]，用于 RUN_ID_MISSING 等含动态值的场景 */
    params?: Record<string, string | number>
    /** 透传 data 字段（zod issues 等结构化详情；helper 会同时塞 code 到 data.code 双保险） */
    data?: Record<string, unknown>
}

/**
 * 创建按事件 locale 本地化的错误响应（todo.md §M16.3 C36）。
 *
 * 行为契约：
 * - `code` 恒为英文常量供客户端判断；
 * - `message` 按 cookie(i18n_locale) > Accept-Language > 默认 zh-CN 翻译；
 * - `code` 放在 `data.code`（h3 1.15 `createError` 不透传任意顶层字段，`sendError` 响应体仅含
 *   `statusCode/statusMessage/data/stack`——`message` 也只在 err.toJSON 路径序列化，h3 默认响应走 sendError），
 *   因此 code 必须走 `data.code` 强契约位置。客户端读 `err.data.code` 即可。
 *
 * @example
 * throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
 * throw createLocalizedError(event, { statusCode: 400, code: 'REPO_VALIDATION_FAILED', data: { issues } })
 */
export function createLocalizedError(event: H3Event, options: LocalizedErrorOptions): Error {
    const locale = detectServerLocale(event)
    const message = resolveMessage(options.code, locale, options.params)
    const statusMessage = STATUS_MESSAGES[options.statusCode] ?? 'Error'
    // data.code 强契约：客户端读取错误码的唯一稳定位置（h3 序列化保证 data 透传）
    const data = { ...options.data, code: options.code }
    return createError({
        statusCode: options.statusCode,
        statusMessage,
        message,
        data,
    })
}
