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
            const remaining = error.response?.headers['x-ratelimit-remaining']
            if (remaining !== undefined && String(remaining) === '0') {
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
