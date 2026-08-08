import { createGitHubClient, discoverRepositories, type RepoPolicy } from 'dependfix'

/** `discover_repos` 返回结构 */
export type DiscoverReposResult =
    | {
        ok: true
        count: number
        repositories: Array<{
            fullName: string
            defaultBranch: string
            topics: string[]
            hasDependabotConfig: boolean
        }>
    }
    | { ok: false, error: string }

/**
 * `discover_repos`：按 owner / org 自动发现仓库（复用 cli discoverRepositories，
 * 与 CLI `--owner` / `--repo-topics` / `--repo-include` / `--repo-exclude` 同源过滤链）。
 * 凭据从 GITHUB_TOKEN 环境变量读取。
 */
export const discoverRepos = async (input: {
    owner: string[]
    topics?: string[]
    include?: string[]
    exclude?: string[]
    probe_dependabot?: boolean
}): Promise<DiscoverReposResult> => {
    const token = process.env.GITHUB_TOKEN
    if (!token) {
        return { ok: false, error: 'GITHUB_TOKEN not set（请配置环境变量）' }
    }
    if (input.owner.length === 0) {
        return { ok: false, error: 'owner 必填（至少一个 owner/org）' }
    }

    try {
        const client = createGitHubClient({ token })
        const policy: RepoPolicy = {
            include: input.include && input.include.length > 0 ? input.include : undefined,
            exclude: input.exclude && input.exclude.length > 0 ? input.exclude : undefined,
        }
        const repos = await discoverRepositories({
            client,
            owners: input.owner,
            topics: input.topics,
            policy,
            probeDependabot: input.probe_dependabot ?? true,
        })
        return {
            ok: true,
            count: repos.length,
            repositories: repos.map((r) => ({
                fullName: r.fullName,
                defaultBranch: r.defaultBranch,
                topics: r.topics,
                hasDependabotConfig: r.hasDependabotConfig,
            })),
        }
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
