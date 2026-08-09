import { Octokit } from '@octokit/rest'
import { Credential } from '#server/entities/credential'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { decryptToken, getEncryptionKey } from '#server/services/credential.service'
import { requireRole } from '#server/utils/guard'

/**
 * GET /api/repos/importable：列出凭据可访问的 GitHub 仓库（批量添加候选）。
 * 权限：admin / org_admin（写操作）。
 * 查询参数：credentialId 必填；affiliation 可选（owner/collaborator/organization_member，默认 owner）。
 * 排除已在平台登记的仓库（避免重复添加）。
 */
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

    const ds = await ensureDatabaseInitialized()
    const credentialRepo = ds.getRepository(Credential)
    const repoRepo = ds.getRepository(Repository)

    const credential = await credentialRepo.findOne({ where: { id: credentialId } })
    if (!credential) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '凭据不存在' })
    }
    const token = decryptToken(credential.encryptedToken, getEncryptionKey())

    // 已登记仓库（按 owner/name 去重）
    const existing = await repoRepo.find()
    const existingKeys = new Set(existing.map((r) => `${r.owner}/${r.name}`))

    const octokit = new Octokit({ auth: token })
    try {
        const { data } = await octokit.repos.listForAuthenticatedUser({
            affiliation,
            per_page: 100,
            sort: 'updated',
        })
        return data
            .filter((repo) => !repo.private || repo.permissions?.push)
            .map((repo) => ({
                id: repo.id,
                name: repo.name,
                fullName: repo.full_name,
                owner: repo.owner.login,
                private: repo.private,
                defaultBranch: repo.default_branch ?? 'main',
                description: repo.description,
                imported: existingKeys.has(repo.full_name),
            }))
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
