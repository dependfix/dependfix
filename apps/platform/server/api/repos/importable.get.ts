import { Octokit } from '@octokit/rest'
import { Credential } from '#server/entities/credential'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { decryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireRole, requireOrgResource } from '#server/utils/guard'
import { cachedFetch } from '#server/utils/repos-cache'

/**
 * GET /api/repos/importable：列出凭据可访问的 GitHub 仓库（批量添加候选）。
 * 权限：admin / org_admin（写操作）。
 * 查询参数：credentialId 必填；affiliation 可选（owner/collaborator/organization_member，默认 owner）；
 *          fresh 可选（true=强制刷新，跳过缓存，docs/plan/todo.md §PR3-2 C49）。
 *
 * PR3 修订（docs/plan/todo.md §PR3-2 C49 D3''）：
 * - octokit.paginate 一次拉完（per_page=100），前端 Paginator 切片显示
 * - maxPages=20 显式兜底（≥ 2000 仓库时主动终止，避免 pagination loop 失控）
 * - 进程内 LRU + TTL 缓存（key=`${credentialId}:${affiliation}`，TTL=5min），降低 GitHub API 调用次数
 * - 返回结构 `{ repos, total, cachedAt, fromCache }`，前端可提示缓存状态
 * - 返回字段新增 fork / archived，供前端三维过滤 UI 使用（docs/plan/todo.md §PR3-1 C46）
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_PAGES = 20

export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const query = getQuery(event)
    const credentialId = query.credentialId as string | undefined
    if (!credentialId) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少 credentialId' })
    }
    const affiliation = (query.affiliation as string | undefined) || 'owner'
    // 白名单校验（依赖 Octokit 422 兜底不够友好）
    if (!['owner', 'collaborator', 'organization_member'].includes(affiliation)) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'affiliation 仅支持 owner / collaborator / organization_member' })
    }
    const fresh = query.fresh === 'true' || query.fresh === true

    const ds = await ensureDatabaseInitialized()
    const credentialRepo = ds.getRepository(Credential)
    const repoRepo = ds.getRepository(Repository)

    const credential = await credentialRepo.findOne({ where: { id: credentialId } })
    if (!credential) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '凭据不存在' })
    }
    // 防御纵深：与 batch.post.ts C50 校验保持一致——凭据必须归属当前组织，
    // 否则跨组织访问 GitHub API 会泄露（与 docs/plan/todo.md §PR3-3 C50 同步）。
    // 单组织模型下凭据默认同组织，校验 no-op；多租户扩展点时此处拦截跨组织凭据。
    await requireOrgResource(event, credential.organizationId)
    const token = decryptToken(credential.encryptedToken, getEncryptionKey())

    // 已登记仓库（按 owner/name 去重）
    const existing = await repoRepo.find()
    const existingKeys = new Set(existing.map((r) => `${r.owner}/${r.name}`))

    const octokit = new Octokit({ auth: token })
    const cacheKey = `${credentialId}:${affiliation}`

    try {
        // octokit.paginate 一次拉完（maxPages 兜底），结果写缓存
        const { value: rawRepos, cachedAt, fromCache } = await cachedFetch(
            cacheKey,
            CACHE_TTL_MS,
            async () => {
                let pageCount = 0
                const data = await octokit.paginate(
                    octokit.repos.listForAuthenticatedUser,
                    { affiliation, per_page: 100, sort: 'updated' },
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

        const repos = rawRepos
            .filter((repo) => !repo.private || repo.permissions?.push)
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
    } catch (error: any) {
        // GitHub API 错误（如 token 权限不足）透传为 4xx
        const status = error?.status as number | undefined
        throw createError({
            statusCode: status && status >= 400 && status < 500 ? status : 502,
            statusMessage: 'Bad Gateway',
            message: status === 401 || status === 403
                ? 'GitHub Token 无权访问仓库列表（请检查凭据权限）'
                : `拉取 GitHub 仓库失败：${error?.message ?? '未知错误'}`,
        })
    }
})
