import { Octokit } from '@octokit/rest'
import { createAppAuth } from '@octokit/auth-app'
import type {
    AuthProvider,
    AuthProviderOptions,
    FromAppParams,
} from './auth-provider'

// ---------------------------------------------------------------------------
// AppAuthProvider - GitHub App installation token 认证实现
// ---------------------------------------------------------------------------

/**
 * GitHub App 工厂函数（**M18.1 commit 4 完整实施**）。
 *
 * 委托给 [`AppAuthProvider`] 类。
 *
 * @example
 * ```typescript
 * const auth = fromApp({
 *     appId: '123456',
 *     privateKey: '-----BEGIN RSA PRIVATE KEY-----\n...',
 *     installationId: '7890123',
 *     botLogin: 'dependfix-bot[bot]',
 * })
 * const octokit = auth.getOctokit()
 * ```
 */
export function fromApp(
    params: FromAppParams,
    options?: AuthProviderOptions,
): AuthProvider {
    return new AppAuthProvider(params, options)
}

/**
 * GitHub App 认证路径实现。
 *
 * 使用 [`@octokit/auth-app`](https://github.com/octokit/auth-app.js) 提供：
 * - JWT signing（App 身份认证）
 * - `getInstallationOctokit`（installation token 获取；库内置 59 分钟 LRU TTL 缓存）
 * - 自动 installation token 轮换
 *
 * 注意：
 * - `getGitCredential()` 返回的 `token` 字段为占位符（installation token 不能直接从 AppAuthProvider 获取；
 *   由 [`@octokit/auth-app`](https://github.com/octokit/auth-app.js) 内部管理）；调用方应通过 `getOctokit()`
 *   拿到的 Octokit 实例进行 API 调用
 * - `getCommitAuthor()` 按 GitHub App 协议动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`
 * - Octokit 实例缓存以避免重复构造
 *
 * @see [C22 PAT 无感升级评估 §4.2 AuthProvider 接口设计](../../../../docs/design/governance/c22-pat-backward-compat.md)
 */
export class AppAuthProvider implements AuthProvider {
    readonly authProvider = 'github-app' as const

    private readonly params: FromAppParams
    // retry 选项保留用于未来扩展（AppAuthProvider 当前不直接使用 retry；由 @octokit/auth-app 自管）
    private readonly _options?: AuthProviderOptions
    private cachedOctokit: Octokit | null = null

    constructor(params: FromAppParams, options?: AuthProviderOptions) {
        this.params = params
        this._options = options
    }

    /**
     * 获取已认证的 Octokit 实例。
     *
     * 首次调用时构造并缓存；后续调用复用同一实例。
     * installation token 由 `@octokit/auth-app` 内部管理（59 分钟 LRU TTL 缓存）。
     *
     * **构造方式**：使用 `authStrategy: createAppAuth` + `auth: {appId, privateKey, installationId}`
     * 双字段组合（`@octokit/auth-app` v8.x README 标准用法），**而非** `auth: createAppAuth(...)`
     * 单字段调用——后者被 `@octokit/core` 视作字符串 token 路径抛 `Token passed to createTokenAuth is not a string`，
     * 或被 `authStrategy` 字段调用后命中 `auth(state, authOptions)` 的 `default` 分支抛 `Invalid auth type: undefined`
     * （todo.md §M18.4 e2e 验证 + audit quick depth Reject 后补修发现）。
     *
     * @see [@octokit/auth-app README §installation authentication](https://github.com/octokit/auth-app.js#installation-authentication)
     */
    getOctokit(): Octokit {
        if (!this.cachedOctokit) {
            this.cachedOctokit = new Octokit({
                authStrategy: createAppAuth,
                auth: {
                    appId: this.params.appId,
                    privateKey: this.params.privateKey,
                    installationId: this.params.installationId,
                },
                baseUrl: 'https://api.github.com',
            })
        }
        return this.cachedOctokit
    }

    /**
     * 获取推送 / clone 用的 Git 凭据。
     *
     * 注意：installation token 由 `@octokit/auth-app` 内部管理，**不**能从 AppAuthProvider 直接获取；
     * 本方法返回的 `token` 字段为占位符（`'installation-token-managed-by-octokit-auth-app'`）。
     * 调用方应通过 `getOctokit()` 拿到的 Octokit 实例进行 API 调用（含 git push / clone 等写操作）。
     */
    getGitCredential(): { username: string, token: string } {
        return {
            username: 'x-access-token',
            token: 'installation-token-managed-by-octokit-auth-app',
        }
    }

    /**
     * 获取 commit author。
     *
     * 按 GitHub App 协议动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`：
     * - `name`：`{app_id}[bot]`（GitHub 自动识别 bot 身份）
     * - `email`：`{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub noreply email 格式）
     *
     * 当 `params.botLogin` 未提供时，使用 `dependfix[bot]` 作为 fallback（保持与 PAT 路径一致的格式）；
     * 但建议调用方显式提供 `botLogin` 以确保 commit author 真实 bot 身份归属。
     */
    getCommitAuthor(): { name: string, email: string } {
        const botLogin = this.params.botLogin ?? 'dependfix[bot]'
        const appId = this.params.appId
        return {
            name: `${appId}[bot]`,
            email: `${appId}+${botLogin}@users.noreply.github.com`,
        }
    }
}
