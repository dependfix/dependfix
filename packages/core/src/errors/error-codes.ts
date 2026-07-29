/**
 * GitHub API 相关错误码。
 * 由 `packages/core/src/errors/app-error.ts` 的 `AppError.code` 使用。
 */
export const GITHUB_ERROR_CODES = [
    'AUTHENTICATION_FAILED',
    'PERMISSION_DENIED',
    'RATE_LIMITED',
    'REPO_NOT_FOUND',
    'GITHUB_API_ERROR',
    'NETWORK_ERROR',
] as const

/** GitHub 相关错误码联合类型 */
export type GitHubErrorCode = typeof GITHUB_ERROR_CODES[number]
