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
            // Dependabot alerts 未启用（非文档化行为，message 匹配为主信号）。
            // 与 PERMISSION_DENIED 区分：未启用是仓库设置问题，不是 token 权限不足。
            // 匹配失败时退回 PERMISSION_DENIED（不误判为「未启用」）。
            if (isAlertsDisabledMessage(error.message)) {
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
 * 判定 403 message 是否为「alerts 功能未启用」。
 *
 * GitHub API 在 Dependabot alerts 未启用时返回 403 + 固定文案
 * `Dependabot alerts are disabled for this repository.`（非文档化行为，未来可能变动）。
 * 以 message 包含匹配为主信号（`includes` 刻意容忍尾标点 / 措辞漂移）；
 * 匹配失败退回 PERMISSION_DENIED，不误判为「未启用」。
 */
function isAlertsDisabledMessage(message: string | undefined): boolean {
    return typeof message === 'string'
        && message.includes('Dependabot alerts are disabled for this repository')
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
