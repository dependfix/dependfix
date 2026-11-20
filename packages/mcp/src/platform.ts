/**
 * 平台 remote 后端选择与 HTTP 客户端（设计稿 §7）。
 *
 * - `DEPENDFIX_MCP_BACKEND=local|remote|auto`（默认 auto）
 * - auto：`DEPENDFIX_PLATFORM_URL` + `DEPENDFIX_PLATFORM_API_KEY` 齐备 → remote，否则 local
 * - 401 / 403 / 404 / 429 / 5xx 统一抛 `PlatformHttpError`，由各 tool 转成结构化错误；
 *   **不静默降级到 local**（数据源切换会造成口径混淆）
 */

export type McpBackend = 'local' | 'remote'

export interface PlatformConfig {
    url: string
    apiKey: string
}

export class PlatformHttpError extends Error {
    readonly status: number
    readonly code: string | null
    readonly retryAfter: string | null

    constructor(message: string, status: number, code: string | null = null, retryAfter: string | null = null) {
        super(message)
        this.name = 'PlatformHttpError'
        this.status = status
        this.code = code
        this.retryAfter = retryAfter
    }
}

export const resolveBackend = (env: NodeJS.ProcessEnv = process.env): McpBackend => {
    const explicit = env.DEPENDFIX_MCP_BACKEND?.trim().toLowerCase()
    if (explicit === 'local') {
        return 'local'
    }
    if (explicit === 'remote') {
        return 'remote'
    }
    return env.DEPENDFIX_PLATFORM_URL && env.DEPENDFIX_PLATFORM_API_KEY ? 'remote' : 'local'
}

export const getPlatformConfig = (env: NodeJS.ProcessEnv = process.env): PlatformConfig => {
    const url = env.DEPENDFIX_PLATFORM_URL?.trim()
    const apiKey = env.DEPENDFIX_PLATFORM_API_KEY?.trim()
    if (!url || !apiKey) {
        throw new PlatformHttpError('remote 后端缺少 DEPENDFIX_PLATFORM_URL / DEPENDFIX_PLATFORM_API_KEY', 0, 'CONFIG_MISSING')
    }
    return { url: url.replace(/\/+$/, ''), apiKey }
}

const buildUrl = (config: PlatformConfig, path: string, query?: Record<string, string | number | undefined>): string => {
    const url = new URL(`${config.url}${path.startsWith('/') ? path : `/${path}`}`)
    for (const [key, value] of Object.entries(query ?? {})) {
        if (value !== undefined && value !== '') {
            url.searchParams.set(key, String(value))
        }
    }
    return url.toString()
}

/** 平台 GET 请求（Bearer key；非 2xx 抛结构化错误，含 data.code 与 Retry-After） */
export const platformGet = async <T>(
    path: string,
    query?: Record<string, string | number | undefined>,
    deps: { config?: PlatformConfig, fetchImpl?: typeof fetch } = {},
): Promise<T> => {
    const config = deps.config ?? getPlatformConfig()
    const fetchImpl = deps.fetchImpl ?? fetch
    const timeoutMs = Number.parseInt(process.env.DEPENDFIX_MCP_PLATFORM_TIMEOUT_MS ?? '10000', 10) || 10000
    const response = await fetchImpl(buildUrl(config, path, query), {
        headers: {
            authorization: `Bearer ${config.apiKey}`,
            accept: 'application/json',
        },
        signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    let body: unknown = null
    try {
        body = text ? JSON.parse(text) : null
    } catch {
        body = null
    }
    if (!response.ok) {
        const data = body as { data?: { code?: string }, message?: string } | null
        const code = data?.data?.code ?? null
        const message = data?.message ?? `平台返回 HTTP ${response.status}`
        throw new PlatformHttpError(message, response.status, code, response.headers.get('retry-after'))
    }
    if (body === null) {
        throw new PlatformHttpError('平台返回空响应（预期 JSON）', 502, 'BAD_RESPONSE')
    }
    return body as T
}

/** 统一平台错误文案：401 / 403 / 404 / 429 / 5xx 各自明确，不静默降级 */
export const platformErrorToTool = (error: unknown): { ok: false, error: string } => {
    if (error instanceof PlatformHttpError) {
        if (error.status === 401) {
            return { ok: false, error: `平台 key 无效或已过期（${error.code ?? 'UNAUTHORIZED'}）` }
        }
        if (error.status === 403) {
            return { ok: false, error: `平台拒绝访问：key 缺少 read scope 或资源不在当前组织（${error.code ?? 'FORBIDDEN'}）` }
        }
        if (error.status === 404) {
            return { ok: false, error: `平台资源不存在：${error.message}` }
        }
        if (error.status === 429) {
            return { ok: false, error: error.retryAfter ? `平台限流：请 ${error.retryAfter} 秒后重试` : '平台限流：请稍后重试' }
        }
        if (error.status >= 500) {
            return { ok: false, error: `平台服务异常（HTTP ${error.status}）：${error.message}` }
        }
        return { ok: false, error: error.message }
    }
    if (error instanceof Error && (error.name === 'TimeoutError' || /aborted|timed? ?out/i.test(error.message))) {
        return { ok: false, error: `平台请求超时：${error.message}` }
    }
    if (error instanceof TypeError || (error instanceof Error && /fetch failed|network|ECONN/i.test(error.message))) {
        return { ok: false, error: `平台不可达：${error instanceof Error ? error.message : String(error)}` }
    }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

export interface PlatformRepo {
    id: string
    owner: string
    name: string
    defaultBranch: string
    tags: string[]
}

/** 精确解析 owner/name → 平台仓库；未纳管时返回 null */
export const resolvePlatformRepo = async (owner: string, name: string): Promise<PlatformRepo | null> => {
    const page = await platformGet<{ items: PlatformRepo[], total: number }>('/api/v1/repos', {
        owner,
        name,
        pageSize: 1,
    })
    return page.items[0] ?? null
}
