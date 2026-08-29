import { Octokit } from '@octokit/rest'
import type {
    AuthProvider,
    AuthProviderOptions,
    FromAppParams,
} from './auth-provider'

// ---------------------------------------------------------------------------
// AppAuthProvider - 占位 stub（M18.1 commit 4 完整实施）
// ---------------------------------------------------------------------------

/**
 * GitHub App 工厂函数（**M18.1 commit 4 完整实施**；当前为占位 stub）。
 *
 * 当前状态：调用 `fromApp()` 抛 NotImplementedError。
 *
 * 完整实施范围（含 [`installation-token-cache.ts`](./installation-token-cache.ts) 1h 滑窗 + 5min 提前刷新）：
 * - JWT signing（[`@octokit/auth-app`](https://github.com/octokit/auth-app.js) App authentication）
 * - `getInstallationOctokit`（installation token 获取）
 * - installation-token-cache 缓存层（worker 内存 1h 滑窗 + 提前 5min 刷新 + 失败重试）
 *
 * @throws 调用任意方法时抛出 NotImplementedError
 *
 * @example
 * ```typescript
 * // 当前会抛 NotImplementedError
 * const auth = fromApp({ appId: '123', privateKey: '...', installationId: '456' })
 * ```
 */
export function fromApp(
    _params: FromAppParams,
    _options?: AuthProviderOptions,
): AuthProvider {
    throw new Error(
        'fromApp: not implemented yet (M18.1 commit 4 实施；当前 fromApp 为占位 stub)',
    )
}

/**
 * GitHub App 认证路径实现（**M18.1 commit 4 完整实施**；当前为占位 stub）。
 *
 * 当前状态：所有方法均抛 NotImplementedError。
 */
export class AppAuthProvider implements AuthProvider {
    readonly authProvider = 'github-app' as const

    constructor(_params: FromAppParams, _options?: AuthProviderOptions) {
        throw new Error(
            'AppAuthProvider: not implemented yet (M18.1 commit 4 实施；当前为占位 stub)',
        )
    }

    getOctokit(): Octokit {
        throw new Error('AppAuthProvider.getOctokit: not implemented yet')
    }

    getGitCredential(): { username: string, token: string } {
        throw new Error('AppAuthProvider.getGitCredential: not implemented yet')
    }

    getCommitAuthor(): { name: string, email: string } {
        throw new Error('AppAuthProvider.getCommitAuthor: not implemented yet')
    }
}
