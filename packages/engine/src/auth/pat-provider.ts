import { Octokit } from '@octokit/rest'
import { createGitHubClient } from '../github/client'
import {
    PAT_COMMIT_AUTHOR,
    PAT_GIT_USERNAME,
    type AuthProvider,
    type AuthProviderOptions,
    type FromPatParams,
} from './auth-provider'

/**
 * PAT 工厂函数。委托给 `PatAuthProvider` 类。
 *
 * 保留 `fromPat` 命名习惯便于与 `fromApp` 对齐（统一工厂语义）。
 *
 * @example
 * ```typescript
 * const auth = fromPat('ghp_xxxx')
 * const octokit = auth.getOctokit()
 * const { username, token } = auth.getGitCredential()
 * ```
 */
export function fromPat(token: FromPatParams, options?: AuthProviderOptions): AuthProvider {
    return new PatAuthProvider(token, options)
}

/**
 * PAT 认证路径实现。
 *
 * `getOctokit()` 委托给 [`createGitHubClient`](../github/client.ts) 以复用现有 retry policy 与限流重试实现；
 * Octokit 实例缓存以避免重复构造（每次 `new Octokit()` + `hook.wrap()` 都有开销）。
 *
 * 行为与原 `createGitHubClient({ token })` 等价：
 * - `getOctokit()` 返回通过 PAT 认证的 Octokit 实例（含限流重试 hook）
 * - `getGitCredential()` 返回推送用的 Basic Auth（username = `'x-access-token'`）
 * - `getCommitAuthor()` 返回固定 `dependfix[bot]`（PAT 路径用户行为零变化）
 *
 * @example
 * ```typescript
 * const auth = new PatAuthProvider('ghp_xxxx', { retry: { maxRetries: 3 } })
 * const octokit = auth.getOctokit()
 * ```
 */
export class PatAuthProvider implements AuthProvider {
    readonly authProvider = 'pat' as const

    private readonly token: FromPatParams
    private readonly retry?: AuthProviderOptions['retry']
    private cachedOctokit: Octokit | null = null

    constructor(token: FromPatParams, options?: AuthProviderOptions) {
        this.token = token
        this.retry = options?.retry
    }

    /**
     * 获取已认证的 Octokit 实例（首次调用构造并缓存）。
     */
    getOctokit(): Octokit {
        if (!this.cachedOctokit) {
            this.cachedOctokit = createGitHubClient({ token: this.token, retry: this.retry })
        }
        return this.cachedOctokit
    }

    /** 获取推送 / clone 用的 Git 凭据（username = `'x-access-token'`，token = PAT） */
    getGitCredential(): { username: string, token: string } {
        return { username: PAT_GIT_USERNAME, token: this.token }
    }

    /** 获取 commit author（PAT 路径固定 `dependfix[bot]`） */
    getCommitAuthor(): { name: string, email: string } {
        return { ...PAT_COMMIT_AUTHOR }
    }
}
