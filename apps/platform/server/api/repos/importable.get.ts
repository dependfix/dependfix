import type { H3Event } from 'h3'
import { Octokit } from '@octokit/rest'
import { Credential } from '#server/entities/credential'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { decryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireRole, requireOrgResource } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { cachedFetch } from '#server/utils/repos-cache'

/**
 * GET /api/repos/importable：批量导入对话框数据源（todo.md §M26.2 + backlog.md §C67）。
 *
 * 单端点 + include 路由设计（与 MCP discover_repos owner: string[] 同源）：
 * - `?credentialId=X&include=owners` → `{ owners: ResourceOwner[] }`，TTL=5min 缓存（key=`owners:${credentialId}`）
 * - `?credentialId=X&owner=Y` → `{ repos, total, cachedAt, fromCache }`，缓存 key=`repos:${credentialId}:${ownerLogin}`
 *
 * 向后兼容：
 * - `?affiliation=owner` 保留并标记 deprecated（行为不变，落到默认 personal owner）
 * - `?owner=X&affiliation=Y` 同时存在时 owner 胜出
 *
 * Resource owner 抽象：沿用 GitHub 官方 user/org 概念（ownerLogin 是 user login 或 org login）；
 * 与 MCP `discover_repos` `owner: string[]` 参数 + engine `fetchOwnerRepositories`
 * auto-detect user/org 模式天然一致。
 */

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_PAGES = 20

/** Resource owner（user 或 org；命名空间沿用 GitHub 官方语义） */
interface ResourceOwner {
    /** owner login（user login 或 org login） */
    login: string
    /** owner 类型 */
    type: 'User' | 'Organization'
    /** avatar URL（可选；GitHub API 默认返回） */
    avatarUrl?: string
}

/** GitHub repo 视图（转换后） */
interface RawRepo {
    id: number
    name: string
    full_name: string
    owner: { login: string }
    private: boolean
    fork: boolean
    archived: boolean
    default_branch?: string
    description: string | null
    permissions?: { push?: boolean }
}

export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const query = getQuery(event)
    const credentialId = query.credentialId as string | undefined
    if (!credentialId) {
        throw createLocalizedError(event, { statusCode: 400, code: 'IMPORTABLE_CREDENTIAL_ID_MISSING' })
    }

    // include 路由：owners vs repos
    const include = (query.include as string | undefined) ?? 'repos'
    if (include !== 'owners' && include !== 'repos') {
        throw createLocalizedError(event, { statusCode: 400, code: 'IMPORTABLE_AFFILIATION_INVALID' })
    }

    const fresh = query.fresh === 'true' || query.fresh === true

    const ds = await ensureDatabaseInitialized()
    const credentialRepo = ds.getRepository(Credential)
    const repoRepo = ds.getRepository(Repository)

    const credential = await credentialRepo.findOne({ where: { id: credentialId } })
    if (!credential) {
        throw createLocalizedError(event, { statusCode: 404, code: 'CREDENTIAL_NOT_FOUND' })
    }
    await requireOrgResource(event, credential.organizationId)
    const token = decryptToken(credential.encryptedToken, getEncryptionKey())

    const octokit = new Octokit({ auth: token })

    if (include === 'owners') {
        // 路由 1：返回 Resource owner 列表（personal + organizations）
        const cacheKey = `owners:${credentialId}`
        try {
            const { value: owners, cachedAt: ownersCachedAt, fromCache: ownersFromCache } = await cachedFetch<ResourceOwner[]>(
                cacheKey,
                CACHE_TTL_MS,
                () => discoverOwners(octokit, credential),
                { fresh },
            )
            return {
                owners,
                cachedAt: ownersCachedAt.toISOString(),
                fromCache: ownersFromCache,
            }
        } catch (error) {
            throw mapGitHubErrorInline(event, error as { status?: number, message?: string })
        }
    }

    // include=repos 路径：解析 owner
    // 优先级：query.owner > credential.ownerLogin > 兜底走 discoverOwners 取 personal owner
    const ownerFromQuery = query.owner as string | undefined
    let ownerLogin = ownerFromQuery ?? credential.ownerLogin ?? undefined
    if (!ownerLogin) {
        // 向后兼容：旧 affiliation 参数（默认 'owner' 行为）走 discoverOwners 取第一个 owner（personal）
        try {
            const owners = await discoverOwners(octokit, credential)
            ownerLogin = owners[0]?.login
        } catch {
            ownerLogin = undefined
        }
    }
    if (!ownerLogin) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'IMPORTABLE_AFFILIATION_INVALID',
            params: { message: '缺少 owner 参数（请通过 include=owners 端点获取可用 owner 列表）' },
        })
    }

    const existing = await repoRepo.find()
    const existingKeys = new Set(existing.map((r) => `${r.owner}/${r.name}`))

    const cacheKey = `repos:${credentialId}:${ownerLogin}`
    try {
        const { value: rawRepos, cachedAt, fromCache } = await cachedFetch(
            cacheKey,
            CACHE_TTL_MS,
            async () => {
                let pageCount = 0
                const data = await octokit.paginate(
                    octokit.repos.listForAuthenticatedUser,
                    { affiliation: 'owner', per_page: 100, sort: 'updated' },
                    (response, done) => {
                        pageCount++
                        if (pageCount >= MAX_PAGES) {
                            done()
                        }
                        return response.data
                    },
                )
                return data
            },
            { fresh },
        )

        const repos = (rawRepos as RawRepo[])
            .filter((repo) => !repo.private || repo.permissions?.push)
            .filter((repo) => !ownerFromQuery || repo.owner.login === ownerFromQuery)
            .map((repo) => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                owner: repo.owner.login,
                private: repo.private,
                fork: repo.fork,
                archived: repo.archived,
                defaultBranch: repo.default_branch ?? 'main',
                description: repo.description,
                imported: existingKeys.has(repo.full_name),
            }))

        return {
            repos,
            total: repos.length,
            cachedAt: cachedAt.toISOString(),
            fromCache,
        }
    } catch (error) {
        throw mapGitHubErrorInline(event, error as { status?: number, message?: string })
    }
})

/**
 * 解析凭据可访问的 Resource owner 列表（personal + organizations）。
 * - Classic PAT：GET /user 拿 personal owner + GET /user/orgs 拿所属组织 owner 列表（personal 永远排第一）
 * - Fine-grained PAT user-bound：GET /user 拿 personal owner（单值）；/user/orgs 大概率 403/404 忽略
 * - Fine-grained PAT org-bound：依赖凭据 ownerLogin 字段（运行时无法发现 → 仅返回该 owner 单值）
 * - GitHub App：installation.account 字段直接读取（无需运行时发现）
 */
async function discoverOwners(octokit: Octokit, credential: Credential): Promise<ResourceOwner[]> {
    const owners: ResourceOwner[] = []

    if (credential.type === 'github-app') {
        // GitHub App：直接从 installationId 读取 installation.account
        if (credential.installationId) {
            try {
                const installation = await octokit.apps.getInstallation({
                    installation_id: Number(credential.installationId),
                })
                const account = installation.data.account
                if (account) {
                    // GitHub App installation.account 是 user 或 organization（union 类型）
                    // User: login + avatar_url；Organization: slug + avatar_url（GitHub API 字段差异）
                    const isOrg = 'type' in account && account.type === 'Organization'
                    const login = isOrg
                        ? (account as unknown as { slug: string }).slug
                        : (account as unknown as { login: string }).login
                    owners.push({
                        login,
                        type: isOrg ? 'Organization' : 'User',
                        avatarUrl: account.avatar_url,
                    })
                }
            } catch {
                // installationId 无效 / 无权限 → 降级返回空列表（前端按空状态提示）
            }
        }
        return owners
    }

    // PAT 路径：先尝试 GET /user 拿 personal
    try {
        const user = await octokit.users.getAuthenticated()
        owners.push({
            login: user.data.login,
            type: 'User',
            avatarUrl: user.data.avatar_url,
        })
    } catch {
        // Fine-grained PAT org-bound 或 token 无 user scope → personal 不可达
    }

    // 再尝试 GET /user/orgs（Fine-grained PAT 大概率 403/404，吞错）
    try {
        const orgs = await octokit.orgs.listForAuthenticatedUser({ per_page: 100 })
        for (const org of orgs.data) {
            owners.push({
                login: org.login,
                type: 'Organization',
                avatarUrl: org.avatar_url,
            })
        }
    } catch {
        // Fine-grained PAT 仅 user-bound：忽略 orgs 403
    }

    // Fine-grained PAT org-bound：personal 不可达但 ownerLogin 有值 → 兜底返回单 owner
    if (owners.length === 0 && credential.ownerLogin) {
        owners.push({
            login: credential.ownerLogin,
            type: 'Organization',
        })
    }

    return owners
}

/**
 * GitHub API 错误映射（auth / fetch 失败 → 4xx/502）
 */
function mapGitHubErrorInline(event: H3Event, error: { status?: number, message?: string }): Error {
    const status = error?.status as number | undefined
    if (status === 401 || status === 403) {
        return createLocalizedError(event, {
            statusCode: status,
            code: 'GITHUB_API_AUTH_FAILED',
        })
    }
    return createLocalizedError(event, {
        statusCode: status && status >= 400 && status < 500 ? status : 502,
        code: 'GITHUB_API_FETCH_FAILED',
        params: { message: error?.message ?? '未知错误' },
    })
}
