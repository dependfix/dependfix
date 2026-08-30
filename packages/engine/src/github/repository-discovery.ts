import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import { mapGitHubError } from './errors'
import { matchesRepoExclude, matchesRepoInclude, matchesTopicsExclude, type RepoPolicy } from './repo-policy'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RepositoryDiscoveryOptions {
    /** 已认证的 Octokit 实例 */
    client: Octokit
    /** owner / org 列表（分别拉取后合并） */
    owners: string[]
    /**
     * topic 白名单（AND 语义）：仓库必须包含**全部**指定 topics 才保留。
     * 为空时不按 topic 过滤。
     */
    topics?: string[]
    /**
     * 名单策略（include / exclude / topicsExclude）：
     * 在基础过滤与 topic 过滤之后、dependabot.yml 探测**之前**应用——
     * 被策略排除的仓库不触达 contents API（探测请求数量受控）。
     * include 与 exclude 冲突时 exclude 胜出。
     */
    policy?: RepoPolicy
    /**
     * 是否探测 `.github/dependabot.yml` 存在性（默认 true）。
     * 仅对候选仓库触达 contents API；404 视为不支持（false），不剔除仓库。
     */
    probeDependabot?: boolean
    /** dependabot.yml 探测并发上限（默认 5，避免一次性打爆 API） */
    probeConcurrency?: number
    /**
     * 发现规模上限：最多保留的仓库数（按 fullName 字典序排序后截断）。
     * 默认 100；设为 0 或负数表示不限制。
     * 大 org 场景下防止一次性全量发现导致 API 配额不可控消耗和超时。
     */
    maxRepos?: number
}

export interface DiscoveredRepository {
    /** `owner/repo` 格式 */
    fullName: string
    defaultBranch: string
    topics: string[]
    /** 默认分支存在 `.github/dependabot.yml`（contents API 探测，404=false） */
    hasDependabotConfig: boolean
}

type RepoListItem = RestEndpointMethodTypes['repos']['listForUser']['response']['data'][number]

const DEPENDABOT_CONFIG_PATH = '.github/dependabot.yml'

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * 按 owner / org 自动发现仓库，产出稳定处理清单。
 *
 * 过滤链（按顺序）：
 * 1. 基础过滤：archived / disabled / fork 剔除，默认分支缺失剔除
 * 2. topic 过滤（`--repo-topics`，AND 语义）
 * 3. 名单策略过滤（include / exclude / topicsExclude，探测前应用）
 * 4. dependabot.yml 探测（仅候选仓库触达 contents API；404 视为不支持，不剔除）
 * 5. 规模上限截断（`maxRepos`，按 fullName 字典序排序后截断）
 *
 * 结果按 `fullName` 字典序排序，保证同输入多次运行结果一致
 * （runId / 指纹稳定性前提）。
 *
 * @throws AppError（mapGitHubError 转换；token 权限、网络等全局性问题 fail-fast）
 */
export async function discoverRepositories(
    options: RepositoryDiscoveryOptions,
): Promise<DiscoveredRepository[]> {
    const { client, owners, topics = [], policy, probeDependabot = true, probeConcurrency = 5, maxRepos } = options

    const discovered: DiscoveredRepository[] = []

    for (const owner of owners) {
        const repos = await fetchOwnerRepositories(client, owner)

        for (const repo of repos) {
            if (!repo.full_name) {
                continue
            }
            // 1. 基础过滤
            if (repo.archived) {
                continue
            }
            if (repo.disabled) {
                continue
            }
            if (repo.fork) {
                continue
            }
            const defaultBranch = repo.default_branch
            if (!defaultBranch) {
                continue
            }

            // 2. topic 过滤（AND：仓库必须包含全部指定 topics；大小写归一化）
            const repoTopics = repo.topics ?? []
            if (topics.length > 0) {
                const repoTopicsLower = repoTopics.map((t) => t.toLowerCase())
                if (!topics.every((t) => repoTopicsLower.includes(t.toLowerCase()))) {
                    continue
                }
            }

            // 3. 名单策略（探测前应用：被排除仓库不触达 contents API）
            if (policy) {
                if (!matchesRepoInclude(policy, repo.full_name)) {
                    continue
                }
                if (matchesRepoExclude(policy, repo.full_name)) {
                    continue
                }
                if (matchesTopicsExclude(policy, repoTopics)) {
                    continue
                }
            }

            discovered.push({
                fullName: repo.full_name,
                defaultBranch,
                topics: repoTopics,
                hasDependabotConfig: false,
            })
        }
    }

    // 4. dependabot.yml 探测（仅候选仓库；并发受限）
    if (probeDependabot) {
        await probeDependabotConfigs(client, discovered, probeConcurrency)
    }

    // 排序确定性：字典序（同输入多次运行结果一致）
    discovered.sort((a, b) => a.fullName.localeCompare(b.fullName))

    // 5. 规模上限截断（按 fullName 字典序排序后截断，保证确定性）
    const effectiveMaxRepos = maxRepos ?? 100
    if (effectiveMaxRepos > 0 && discovered.length > effectiveMaxRepos) {
        return discovered.slice(0, effectiveMaxRepos)
    }

    return discovered
}

/**
 * 合并显式仓库列表与发现结果：
 * - 显式优先：显式列表保持原顺序且在前
 * - 发现结果仅补充未出现的项（去重；大小写不敏感——GitHub full_name 恒小写，
 *   显式 `Owner/Repo` 与发现 `owner/repo` 视为同一仓库）
 */
export function mergeRepositories(explicit: string[], discovered: string[]): string[] {
    const seen = new Set(explicit.map((r) => r.toLowerCase()))
    const merged = [...explicit]
    for (const repo of discovered) {
        const key = repo.toLowerCase()
        if (!seen.has(key)) {
            seen.add(key)
            merged.push(repo)
        }
    }
    return merged
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 拉取单个 owner / org 的全部仓库。
 * 先通过 `GET /users/{owner}` 判断主体类型（User / Organization），
 * 再选择对应分页端点（listForUser / listForOrg），避免试探性调用。
 * `type: 'all'` 拉取包含 fork 的全部仓库，fork 剔除由过滤链负责。
 */
async function fetchOwnerRepositories(client: Octokit, owner: string): Promise<RepoListItem[]> {
    let kind: 'user' | 'org'

    try {
        const { data: subject } = await client.rest.users.getByUsername({ username: owner })
        kind = subject.type === 'Organization' ? 'org' : 'user'
    } catch (error: unknown) {
        throw mapGitHubError(error, `fetch owner info for ${owner}`)
    }

    try {
        if (kind === 'org') {
            return await client.paginate(
                client.rest.repos.listForOrg,
                { org: owner, type: 'all', per_page: 100 },
            )
        }
        return await client.paginate(
            client.rest.repos.listForUser,
            { username: owner, type: 'all', per_page: 100 },
        )
    } catch (error: unknown) {
        throw mapGitHubError(error, `fetch repositories for ${owner}`)
    }
}

/** 并发受限地探测各候选仓库的 dependabot.yml 存在性（404 视为不支持）。 */
async function probeDependabotConfigs(
    client: Octokit,
    repos: DiscoveredRepository[],
    concurrency: number,
): Promise<void> {
    if (repos.length === 0) {
        return
    }

    let index = 0
    const worker = async (): Promise<void> => {
        while (index < repos.length) {
            const current = repos[index]
            index += 1
            const [owner, name] = current.fullName.split('/')
            current.hasDependabotConfig = await probeDependabotConfig(client, owner, name)
        }
    }

    const workers = Array.from(
        { length: Math.min(concurrency, repos.length) },
        () => worker(),
    )
    await Promise.all(workers)
}

/**
 * 探测单个仓库默认分支上的 `.github/dependabot.yml`。
 * 404（Repository 不存在或文件不存在）→ false；
 * 其他错误（权限、网络等）→ 抛 AppError（全局性问题的 fail-fast）。
 */
async function probeDependabotConfig(
    client: Octokit,
    owner: string,
    repo: string,
): Promise<boolean> {
    try {
        await client.rest.repos.getContent({
            owner,
            repo,
            path: DEPENDABOT_CONFIG_PATH,
        })
        return true
    } catch (error: unknown) {
        const requestError = error as { status?: number }
        if (requestError.status === 404) {
            return false
        }
        throw mapGitHubError(error, `probe dependabot config for ${owner}/${repo}`)
    }
}
