import { z } from 'zod'
import { fetchCloudflareLogTail } from './cloudflare'
import { fetchVercelLogTail } from './vercel'

/**
 * PR Check provider 原生日志富化（Layer 5）契约与调度。
 *
 * 设计依据：docs/design/governance/pr-build-deploy-signals.md §3.12。
 *
 * 边界（硬约束）：
 * - 只读：调用方只传 provider 只读 token；本模块不发写请求、不改 PR 状态；
 * - 未配置 token / 不支持的 provider / URL 缺标识 → 返回「不可用 + 原因」，**零请求**；
 * - 拉取失败（401 / 429 / 超时 / 5xx）只降级为不可用，绝不抛错给调用方；
 * - 单条日志尾部硬上限（默认 8 KB），并用真实生成值取样脱敏（token / Cookie / URL 凭据）。
 */

/** 支持的 provider（signal.provider 归一化后） */
export const PROVIDER_LOG_PROVIDERS = ['vercel', 'cloudflare'] as const

export type ProviderLogProvider = (typeof PROVIDER_LOG_PROVIDERS)[number]

/** 单条日志尾部默认上限（8 KB，按 UTF-8 字节截尾） */
export const PROVIDER_LOG_MAX_BYTES = 8 * 1024

/** 单次 provider 请求超时（毫秒） */
export const PROVIDER_LOG_TIMEOUT_MS = 8_000

/** 不可用原因（稳定枚举，UI 直接映射文案） */
export const PROVIDER_LOG_UNAVAILABLE_REASONS = [
    'token_missing',
    'invalid_request',
    'unsupported_provider',
    'unsupported_target',
    'not_found',
    'unauthorized',
    'rate_limited',
    'timeout',
    'http_error',
    'unsupported_response',
    'empty',
] as const

export type ProviderLogUnavailableReason = (typeof PROVIDER_LOG_UNAVAILABLE_REASONS)[number]

/**
 * 请求契约（Zod 校验；平台侧在调用前解析 DB / 凭据得出）。
 * `targets` 来自仓库级 provider 目标配置（Repository 列），不是用户请求体。
 */
export const providerLogRequestSchema = z.object({
    provider: z.string().trim().min(1, 'provider 不能为空').max(64),
    token: z.string().trim().min(1, 'token 不能为空').max(10000),
    headSha: z.string().trim().min(7, 'headSha 至少 7 位').max(64),
    targets: z.object({
        vercelProjectId: z.string().trim().min(1).max(64).optional(),
        cloudflareAccountId: z.string().trim().min(1).max(64).optional(),
        cloudflareWorkerTag: z.string().trim().min(1).max(128).optional(),
    }).strict(),
    maxBytes: z.number().int().min(1).max(PROVIDER_LOG_MAX_BYTES).optional(),
})

export type ProviderLogRequest = z.infer<typeof providerLogRequestSchema>

/** 可用结果：`tail` 已脱敏、已按上限截尾 */
export interface ProviderLogAvailable {
    available: true
    provider: ProviderLogProvider
    tail: string
    truncated: boolean
}

/** 不可用结果：`reason` 稳定枚举，`status` 仅 HTTP 失败时填写 */
export interface ProviderLogUnavailable {
    available: false
    provider: string
    reason: ProviderLogUnavailableReason
    status?: number
}

export type ProviderLogResult = ProviderLogAvailable | ProviderLogUnavailable

/** fetch 依赖（单测注入；默认全局 fetch） */
export type ProviderLogFetch = (input: string, init?: RequestInit) => Promise<Response>

export interface ProviderLogDeps {
    fetch?: ProviderLogFetch
    timeoutMs?: number
}

/** provider 名归一化：去空白 / 小写 / 去 `[bot]` 后缀与 `<安装号>+` 前缀 */
export const normalizeProviderName = (provider: string): string => {
    const trimmed = provider.trim().toLowerCase()
    const withoutPrefix = trimmed.includes('+') ? trimmed.slice(trimmed.lastIndexOf('+') + 1) : trimmed
    return withoutPrefix.replace(/\[bot\]$/, '')
}

/**
 * provider 别名（GitHub 上实际的 app.slug / context 与 adapter 名不一致）。
 * Cloudflare 的 check run app.slug 为 `cloudflare-workers-and-pages`（2026-11-23 实测）。
 */
const PROVIDER_ALIASES: Readonly<Record<string, ProviderLogProvider>> = {
    'cloudflare-workers-and-pages': 'cloudflare',
    'cloudflare-workers-builds': 'cloudflare',
}

/** provider 名 → 支持的 adapter（不支持返回 null） */
export const resolveProviderLogProvider = (provider: string): ProviderLogProvider | null => {
    const normalized = normalizeProviderName(provider)
    if ((PROVIDER_LOG_PROVIDERS as readonly string[]).includes(normalized)) {
        return normalized as ProviderLogProvider
    }
    return PROVIDER_ALIASES[normalized] ?? null
}

// ---------------------------------------------------------------------------
// 脱敏与截尾
// ---------------------------------------------------------------------------

/** 常见凭据形态（真实生成值取样覆盖：ghp_ / dfk_ / Bearer / URL 内嵌凭据 / Cookie） */
const SECRET_PATTERNS: readonly [RegExp, string][] = [
    [/(github_pat_|gh[pousr]_|dfk_)[\w-]+/g, '$1***'],
    [/(authorization:\s*(?:basic|token|bearer)\s+)\S+/gi, '$1***'],
    [/([a-z][a-z\d+.-]*:\/\/)[^/\s]+@/gi, '$1***@'],
    [/((?:^|\s)(?:cookie|set-cookie):\s*)[^\r\n]+/gi, '$1***'],
    [/(["']?(?:password|passwd|secret|token|api[-_]?key|access[-_]?token)["']?\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s&,;]+)/gi, '$1***'],
]

/** 脱敏日志文本（先替换调用方 token 原文，再按形态兜底） */
export const redactProviderLog = (text: string, token?: string): string => {
    let output = text
    if (token && token.length >= 8) {
        output = output.split(token).join('***')
    }
    for (const [pattern, replacement] of SECRET_PATTERNS) {
        output = output.replace(pattern, replacement)
    }
    return output
}

/**
 * 取文本尾部（按 UTF-8 字节上限）。
 * 从字节边界向前裁，避免切出半个多字节字符（裁完若以 replacement char 开头则再前移）。
 */
export const tailByBytes = (text: string, maxBytes: number): { tail: string, truncated: boolean } => {
    const buffer = Buffer.from(text, 'utf8')
    if (buffer.byteLength <= maxBytes) {
        return { tail: text, truncated: false }
    }
    let start = buffer.byteLength - maxBytes
    // 0b10xxxxxx 是 UTF-8 续字节：前移到字符起始位置
    while (start < buffer.byteLength && (buffer[start] & 0b1100_0000) === 0b1000_0000) {
        start += 1
    }
    return { tail: buffer.subarray(start).toString('utf8'), truncated: true }
}

/** 把多行 / 事件数组拼成纯文本（去空行，保留原始顺序） */
export const joinLogLines = (lines: readonly (string | null | undefined)[]): string =>
    lines.filter((line): line is string => typeof line === 'string' && line.trim() !== '').join('\n')

/** HTTP 状态码 → 不可用原因 */
export const mapHttpFailure = (status: number): ProviderLogUnavailableReason => {
    if (status === 401 || status === 403) {
        return 'unauthorized'
    }
    if (status === 404) {
        return 'not_found'
    }
    if (status === 429) {
        return 'rate_limited'
    }
    return 'http_error'
}

/** 安全 JSON 解析（响应体非法时返回 null，不抛错） */
export const parseJsonSafe = async (response: Response): Promise<unknown> => {
    try {
        return await response.json()
    } catch {
        return null
    }
}

/** 构造带超时的 fetch（默认 8s；调用方传入 signal 时不覆盖） */
export const requestWithTimeout = async (
    url: string,
    token: string,
    deps: ProviderLogDeps,
    headers: Record<string, string> = {},
): Promise<Response> => {
    const fetchImpl = deps.fetch ?? fetch
    const timeoutMs = deps.timeoutMs ?? PROVIDER_LOG_TIMEOUT_MS
    return await fetchImpl(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, ...headers },
        signal: AbortSignal.timeout(timeoutMs),
    })
}

const isTimeoutError = (error: unknown): boolean =>
    error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')

/** 统一异常 → 不可用结果（超时与网络错误都降级，不抛错） */
export const toFailure = (
    provider: string,
    error: unknown,
): ProviderLogUnavailable => ({
    available: false,
    provider,
    reason: isTimeoutError(error) ? 'timeout' : 'http_error',
})

/** 统一成功结果：截尾 + 脱敏 */
export const toAvailable = (
    provider: ProviderLogProvider,
    text: string,
    request: ProviderLogRequest,
): ProviderLogResult => {
    // 契约层已限制 ≤ 8KB；运行时再夹取一次，防止绕过 schema 的调用
    const maxBytes = Math.min(request.maxBytes ?? PROVIDER_LOG_MAX_BYTES, PROVIDER_LOG_MAX_BYTES)
    const { tail, truncated } = tailByBytes(redactProviderLog(text, request.token), maxBytes)
    if (tail.trim() === '') {
        return { available: false, provider, reason: 'empty' }
    }
    return { available: true, provider, tail, truncated }
}

// ---------------------------------------------------------------------------
// 调度
// ---------------------------------------------------------------------------

/**
 * 拉取某条失败信号的 provider 原生日志尾部。
 *
 * - provider 不支持 / token 缺失 / 缺目标配置 → 直接返回不可用（**零请求**，满足 AC1 的「未配置零出网」）；
 * - adapter 内部异常与 HTTP 失败均由各 adapter 降级，不向调用方抛错；
 * - 结果 `tail` 已脱敏并按字节上限截尾。
 */
export const fetchProviderLog = async (
    rawRequest: ProviderLogRequest,
    deps: ProviderLogDeps = {},
): Promise<ProviderLogResult> => {
    const provider = resolveProviderLogProvider(rawRequest.provider)
    if (!provider) {
        return { available: false, provider: rawRequest.provider, reason: 'unsupported_provider' }
    }
    const parsed = providerLogRequestSchema.safeParse({ ...rawRequest, provider })
    if (!parsed.success) {
        // token 为空与其它契约错误分开：前者是「未配置」，后者是实现/调用方错误
        const tokenMissing = typeof rawRequest.token !== 'string' || rawRequest.token.trim() === ''
        return { available: false, provider, reason: tokenMissing ? 'token_missing' : 'invalid_request' }
    }
    return provider === 'vercel'
        ? fetchVercelLogTail(parsed.data, deps)
        : fetchCloudflareLogTail(parsed.data, deps)
}
