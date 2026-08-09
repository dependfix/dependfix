import { Octokit } from '@octokit/rest'
import { RequestError } from '@octokit/request-error'

export interface RetryPolicyOptions {
    /** 最大重试次数（默认 3；0 = 不重试） */
    maxRetries?: number
    /** 指数退避基数毫秒（默认 1000；测试时可调小） */
    baseDelayMs?: number
    /**
     * 指数退避单次等待上限毫秒（默认 30000），防止长时间空转。
     * Retry-After / x-ratelimit-reset 指定的等待同样受此上限约束。
     */
    maxBackoffMs?: number
}

export interface OctokitClientOptions {
    /** GitHub Personal Access Token */
    token: string
    /**
     * API 基地址。
     * 默认 `https://api.github.com`。
     * 测试时指向 nock 拦截的同一地址。
     */
    baseUrl?: string
    /**
     * API 限流 / 次要限流（secondary rate limit）指数退避重试策略。
     * 默认 maxRetries=3。对 429、primary rate limit（403 + x-ratelimit-remaining: 0）、
     * secondary rate limit（403/429 带 secondary/abuse/retry 特征）自动退避重试；
     * 权限类 403 不重试。
     */
    retry?: RetryPolicyOptions
}

/**
 * 创建已认证的 Octokit 实例。
 *
 * 调用方直接使用 `octokit.rest.*` 访问所有已类型化的 GitHub REST API。
 * 分页使用 `octokit.paginate()` 自动合并多页结果。
 *
 * 配置 `retry` 时通过 `hook.wrap('request')` 统一包装所有请求
 * （含 paginate 内部请求），对限流响应做指数退避重试。
 *
 * @example
 * ```typescript
 * const octokit = createGitHubClient({ token: 'ghp_xxxx' })
 *
 * // 仓库信息
 * const { data: repo } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })
 *
 * // Dependabot 告警（自动分页）
 * const alerts = await octokit.paginate(
 *     octokit.rest.dependabot.listAlertsForRepo,
 *     { owner: 'foo', repo: 'bar', state: 'open', per_page: 100 },
 * )
 * ```
 */
export function createGitHubClient(options: OctokitClientOptions): Octokit {
    const client = new Octokit({
        auth: options.token,
        baseUrl: options.baseUrl ?? 'https://api.github.com',
    })

    const maxRetries = options.retry?.maxRetries ?? 3
    if (maxRetries > 0) {
        applyRetryPolicy(client, {
            maxRetries,
            baseDelayMs: options.retry?.baseDelayMs ?? 1000,
            maxBackoffMs: options.retry?.maxBackoffMs ?? MAX_BACKOFF_MS_DEFAULT,
        })
    }

    return client
}

// ---------------------------------------------------------------------------
// Retry policy（统一 hook 包装，对全部请求生效）
// ---------------------------------------------------------------------------

const SECONDARY_RATE_LIMIT_RE = /secondary rate limit|abuse|retry later|retry-after/i
/** 指数退避单次等待默认上限（30s），防止长时间空转（可经 retry.maxBackoffMs 覆盖） */
const MAX_BACKOFF_MS_DEFAULT = 30_000

function applyRetryPolicy(client: Octokit, retry: RetryPolicyOptions): void {
    const maxRetries = retry.maxRetries ?? 3
    const baseDelayMs = retry.baseDelayMs ?? 1000
    const maxBackoffMs = retry.maxBackoffMs ?? MAX_BACKOFF_MS_DEFAULT

    client.hook.wrap('request', async (request, options) => {
        // 写请求（POST/PATCH/PUT/DELETE）不做限流重试——非幂等操作避免重放；
        // 限流重试仅适用于只读 GET/HEAD（GitHub 限流检查在请求执行前，写请求重放风险虽低仍应规避）
        const method = (options.method ?? 'GET').toUpperCase()
        if (method !== 'GET' && method !== 'HEAD') {
            return request(options)
        }

        let attempt = 0
        for (;;) {
            try {
                return await request(options)
            } catch (error: unknown) {
                const delayMs = computeRetryDelayMs(error, attempt, baseDelayMs, maxBackoffMs)
                if (delayMs === null || attempt >= maxRetries) {
                    throw error
                }
                attempt += 1
                await sleep(delayMs)
            }
        }
    })
}

/**
 * 计算限流重试等待时间（纯函数，可单测）。
 *
 * 可重试（返回等待毫秒）：
 * - 429（Too Many Requests / secondary rate limit）
 * - 403 + `x-ratelimit-remaining: 0`（primary rate limit）
 * - 403/429 + message 含 secondary rate limit / abuse / retry 特征
 *
 * 等待策略（Retry-After 优先）：
 * 1. `retry-after` 头（秒）→ 等待其秒数（受 maxBackoffMs 上限约束）
 * 2. `x-ratelimit-reset`（unix 秒）→ 等待到 reset + 1s 缓冲
 * 3. 否则 → 指数退避 `baseDelayMs * 2^attempt`
 * 所有等待均受 maxBackoffMs 上限约束（默认 30s）。
 *
 * 不重试（返回 null）：
 * - 非 RequestError（网络错误等由上层 AppError 语义处理）
 * - 权限类 403（无限流特征）
 * - 其他状态码
 */
export function computeRetryDelayMs(
    error: unknown,
    attempt: number,
    baseDelayMs = 1000,
    maxBackoffMs = MAX_BACKOFF_MS_DEFAULT,
): number | null {
    if (!(error instanceof RequestError)) {
        return null
    }

    const status = error.status
    const headers = error.response?.headers ?? {}
    const remaining = headers['x-ratelimit-remaining']
    const message = error.message

    let retryable = false
    if (status === 429) {
        retryable = true
    } else if (status === 403) {
        if (remaining !== undefined && remaining === '0') {
            retryable = true // primary rate limit
        } else if (SECONDARY_RATE_LIMIT_RE.test(message)) {
            retryable = true // secondary rate limit（403 形态）
        }
    }

    if (!retryable) {
        return null
    }

    // Retry-After 头优先（GitHub secondary rate limit 常返回，秒为单位）
    const retryAfter = headers['retry-after']
    if (retryAfter !== undefined) {
        const seconds = Number(retryAfter)
        if (Number.isFinite(seconds) && seconds > 0) {
            return Math.min(seconds * 1000, maxBackoffMs)
        }
    }

    // 其次等待到限流重置时刻（primary rate limit 标准行为）
    const reset = headers['x-ratelimit-reset']
    if (reset !== undefined) {
        const resetMs = Number(reset) * 1000
        if (Number.isFinite(resetMs) && resetMs > 0) {
            const waitMs = resetMs - Date.now() + 1000
            if (waitMs > 0) {
                return Math.min(waitMs, maxBackoffMs)
            }
        }
    }

    // 指数退避兜底
    return Math.min(baseDelayMs * 2 ** attempt, maxBackoffMs)
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}
