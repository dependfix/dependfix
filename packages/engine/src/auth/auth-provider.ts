import type { Octokit } from '@octokit/rest'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * GitHub 认证抽象层。
 *
 * 支持 PAT（classic / fine-grained）与 GitHub App installation token 两种认证路径。
 * 调用方通过 `getOctokit()` 获取已认证的 Octokit 实例；通过 `getGitCredential()`
 * 获取推送/clone 用的 Git 凭据；通过 `getCommitAuthor()` 获取 commit author 信息。
 *
 * `authProvider` 字段用于审计与调试（区分 PAT vs App 路径）。
 *
 * @example
 * ```typescript
 * // 推荐：从 fromPat / fromApp 工厂构造
 * const auth = fromPat('ghp_xxxx')
 * const octokit = auth.getOctokit()
 *
 * // git push 凭据
 * const { username, token } = auth.getGitCredential()
 *
 * // commit author（PAT 路径固定；App 路径动态）
 * const { name, email } = auth.getCommitAuthor()
 * ```
 */
export interface AuthProvider {
    /** 获取已认证的 Octokit 实例 */
    getOctokit(): Octokit

    /** 获取推送 / clone 用的 Git 凭据（用户名 + token） */
    getGitCredential(): { username: string, token: string }

    /**
     * 获取 commit author 信息。
     *
     * - PAT 路径：固定返回 `{ name: 'dependfix[bot]', email: 'dependfix[bot]@users.noreply.github.com' }`（保持现有行为零变化）
     * - GitHub App 路径：动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub App 协议要求）
     */
    getCommitAuthor(): { name: string, email: string }

    /** 认证路径标识（用于审计 + 调试） */
    readonly authProvider: 'pat' | 'github-app'
}

/** 工厂函数统一选项（与 OctokitClientOptions.retry 字段对齐） */
export interface AuthProviderOptions {
    /** API 限流 / 次要限流指数退避重试策略。默认 maxRetries=3。 */
    retry?: {
        maxRetries?: number
        baseDelayMs?: number
        maxBackoffMs?: number
    }
}

/** PAT 工厂参数（仅 token；retry 在 options 注入） */
export type FromPatParams = string

/** GitHub App 工厂参数 */
export interface FromAppParams {
    /** GitHub App ID */
    appId: string
    /** PEM 格式私钥 */
    privateKey: string
    /** Installation ID */
    installationId: string
    /** Bot 用户名（用于 commit author 动态生成；M18.1 commit 4 实施） */
    botLogin?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * PAT 路径固定 commit author（保持现有行为零变化）。
 *
 * 注：现有 PAT 路径硬编码 `dependfix[bot]@users.noreply.github.com`，虽非真实 bot 身份（字符串约定），
 * 但保持行为不变以确保 PAT 用户无感升级。已知缺陷由 C22 范围之外的后续阶段修复。
 */
export const PAT_COMMIT_AUTHOR = {
    name: 'dependfix[bot]',
    email: 'dependfix[bot]@users.noreply.github.com',
} as const

/** PAT 路径固定 Git 用户名（用于 git push 时的 Basic Auth） */
export const PAT_GIT_USERNAME = 'x-access-token'
