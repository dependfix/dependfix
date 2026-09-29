import { AppError, toErrorMessage, type GitHubErrorCode } from '@dependfix/core'
import { RequestError } from '@octokit/request-error'

/**
 * 将 Octokit 请求错误映射为 `AppError`。
 *
 * @param error   - 原始错误（`RequestError` 或网络异常）
 * @param context - 调用上下文描述（如 `'fetch repo info for foo/bar'`），会附加到错误消息中
 */
export function mapGitHubError(error: unknown, context: string): AppError {
    if (error instanceof RequestError) {
        const code: GitHubErrorCode = resolveErrorCode(error)
        const details = collectErrorDetails(error)

        return new AppError(code, `${context}: ${error.message}`, { cause: error, details })
    }

    // 网络 / DNS 等非 RequestError 异常
    if (error instanceof Error) {
        return new AppError('NETWORK_ERROR', `${context}: ${error.message}`, { cause: error })
    }

    return new AppError('NETWORK_ERROR', `${context}: unknown error`, { details: { raw: toErrorMessage(error) } })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveErrorCode(error: RequestError): GitHubErrorCode {
    switch (error.status) {
        case 401:
            return 'AUTHENTICATION_FAILED'
        case 403: {
            // 安全功能未启用（非文档化行为，message 匹配为主信号）。
            // 与 PERMISSION_DENIED 区分：未启用是仓库设置问题，不是 token 权限不足。
            // 匹配失败时退回 PERMISSION_DENIED（不误判为「未启用」）。
            if (isFeatureDisabledMessage(error.message)) {
                return 'ALERTS_DISABLED'
            }
            const remaining = error.response?.headers['x-ratelimit-remaining']
            if (remaining !== undefined && remaining === '0') {
                return 'RATE_LIMITED'
            }
            return 'PERMISSION_DENIED'
        }
        case 404:
            return 'REPO_NOT_FOUND'
        default:
            return 'GITHUB_API_ERROR'
    }
}

/**
 * Dependabot alerts 未启用时的固定文案（实测精确匹配；非文档化行为，未来可能变动——
 * 匹配失败退回 PERMISSION_DENIED）。
 */
const DEPENDABOT_DISABLED_MESSAGE = 'Dependabot alerts are disabled for this repository'

/**
 * 判定 403 message 是否为「对应安全功能未启用」。
 *
 * 两条判定路径（均要求 403 状态码，由调用方保证）：
 * 1. **Dependabot alerts**：精确文案（`Dependabot alerts are disabled for this repository`，实测）。
 * 2. **GitHub Advanced Security（Code Scanning / Code Quality）**：官方文档只描述 403 语义
 *    （"Response if GitHub Advanced Security is not enabled for this repository"），**未给出响应文案**，
 *    故采用「两个片段同时命中」的容忍匹配——产品名片段（`advanced security` 或新称 `code security`）
 *    + 启用状态否定词（`must be enabled` / `not enabled` / `is disabled`，大小写不敏感）——避免单片段误判。
 *
 * 匹配失败一律返回 false → 退回 `PERMISSION_DENIED`（不把未知 403 误判为「未启用」）。
 */
function isFeatureDisabledMessage(message: string | undefined): boolean {
    if (typeof message !== 'string') {
        return false
    }
    if (message.includes(DEPENDABOT_DISABLED_MESSAGE)) {
        return true
    }
    const normalized = message.toLowerCase()
    const mentionsSecurityProduct = normalized.includes('advanced security') || normalized.includes('code security')
    return mentionsSecurityProduct
        && (normalized.includes('must be enabled')
            || normalized.includes('not enabled')
            || normalized.includes('is disabled'))
}

function collectErrorDetails(error: RequestError): Record<string, unknown> {
    const details: Record<string, unknown> = {
        status: error.status,
        requestUrl: error.request?.url,
        requestMethod: error.request?.method,
    }

    // 限流时附带重置时间
    const resetAt = error.response?.headers['x-ratelimit-reset']
    if (resetAt) {
        details.rateLimitReset = resetAt
    }

    return details
}
