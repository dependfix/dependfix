import { Octokit } from '@octokit/rest'

export interface OctokitClientOptions {
    /** GitHub Personal Access Token */
    token: string
    /**
     * API 基地址。
     * 默认 `https://api.github.com`。
     * 测试时指向 nock 拦截的同一地址。
     */
    baseUrl?: string
}

/**
 * 创建已认证的 Octokit 实例。
 *
 * 调用方直接使用 `octokit.rest.*` 访问所有已类型化的 GitHub REST API。
 * 分页使用 `octokit.paginate()` 自动合并多页结果。
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
    return new Octokit({
        auth: options.token,
        baseUrl: options.baseUrl ?? 'https://api.github.com',
    })
}
