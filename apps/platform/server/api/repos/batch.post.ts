import { Repository } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { ensureDatabaseInitialized } from '#server/database'
import { requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import { batchImportSchema } from '#server/schemas/batch-import'

/**
 * 批量添加仓库：从 GitHub 导入候选（GET /api/repos/importable 结果）中选中多个，
 * 逐个创建 Repository 记录（幂等：已存在的跳过；并发唯一约束冲突同样按跳过处理）。
 * 权限：admin / org_admin（写操作）。
 * body：{ repos: Array<仓库字段>, defaultCredentialId?: string }——
 *       项校验复用 repositorySchema（owner/name 正则、github-action→actionWorkflowFile
 *       交叉校验与单个添加入口保持一致）；
 *       顶层 defaultCredentialId（docs/plan/todo.md §PR3 C50）由 handler 前置校验
 *       存在性 + 同组织，防跨组织误关联（schema 仅做格式校验）。
 */

export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = batchImportSchema.safeParse(body)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'REPOS_BATCH_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const credentialRepo = ds.getRepository(Credential)
    const organizationId = await resolveOrganizationId(ds)

    // 前置校验（docs/plan/todo.md §PR3-3 C50）：defaultCredentialId 存在性 + 同组织（防跨组织误关联 FK 悬空）
    let defaultCredentialId: string | null = null
    if (parsed.data.defaultCredentialId) {
        const credential = await credentialRepo.findOne({ where: { id: parsed.data.defaultCredentialId } })
        if (!credential) {
            throw createLocalizedError(event, {
                statusCode: 400,
                code: 'CREDENTIAL_NOT_FOUND',
                data: { field: 'defaultCredentialId' },
            })
        }
        if (credential.organizationId !== organizationId) {
            throw createLocalizedError(event, {
                statusCode: 403,
                code: 'RESOURCE_NOT_IN_ORG',
                data: { resource: 'credential', field: 'defaultCredentialId' },
            })
        }
        defaultCredentialId = credential.id
    }

    const results: { owner: string, name: string, imported: boolean, skipped: boolean }[] = []
    for (const item of parsed.data.repos) {
        const existing = await repoRepo.findOne({
            where: { owner: item.owner, name: item.name, platform: 'github' },
        })
        if (existing) {
            results.push({ owner: item.owner, name: item.name, imported: false, skipped: true })
            continue
        }
        const entity = repoRepo.create({
            organizationId,
            owner: item.owner,
            name: item.name,
            platform: 'github',
            defaultBranch: item.defaultBranch,
            packageManager: item.packageManager,
            executorKind: item.executorKind,
            actionWorkflowFile: item.actionWorkflowFile ?? null,
            note: item.note ?? null,
            // 默认关联凭据（docs/plan/todo.md §PR3-3 C50：非空时透传到所有新建仓库；空时 null 保持兼容）
            credentialId: defaultCredentialId,
        })
        try {
            await repoRepo.save(entity)
            results.push({ owner: item.owner, name: item.name, imported: true, skipped: false })
        } catch (error) {
            // 并发重复导入：唯一索引（owner+name+platform）冲突视为跳过，不整体失败
            // 方言覆盖：SQLite（UNIQUE constraint failed）/ MySQL（Duplicate entry）/ PostgreSQL（duplicate key value）
            const message = error instanceof Error ? error.message : String(error)
            const isUniqueConflict = message.includes('UNIQUE constraint failed')
                || message.includes('Duplicate entry')
                || message.includes('duplicate key value')
            if (isUniqueConflict) {
                results.push({ owner: item.owner, name: item.name, imported: false, skipped: true })
            } else {
                throw error
            }
        }
    }

    return {
        results,
        imported: results.filter((r) => r.imported).length,
        skipped: results.filter((r) => r.skipped).length,
    }
})
