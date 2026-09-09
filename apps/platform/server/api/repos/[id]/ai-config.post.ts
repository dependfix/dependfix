import { repositoryAiConfigSchema } from '#server/schemas/ai-config'
import { createLocalizedError } from '#server/utils/localized-error'
import { requireRole, requireOrgResource } from '#server/utils/guard'
import { Repository } from '#server/entities/repository'
import { Organization } from '#server/entities/organization'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * POST /api/repos/[id]/ai-config —— todo.md §M26.1 应用层 / [platform-ai-integration.md §6.4](../design/governance/platform-ai-integration.md)。
 *
 * 权限：admin / org_admin。
 * 行为：单仓库级 aiEnabled / aiTrigger 覆盖（Organization.aiApiKey 不变，由 Organization.ai-config.patch 端点管理）；
 * aiEnabled=true 时校验 Organization 已配置 Key（避免"启用但跑不出来"的沉默失败）。
 *
 * 审计：写操作登记 AuditEvent（resourceType='repository' / action='update_ai_config'）。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'REPO_ID_MISSING' })
    }

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = repositoryAiConfigSchema.safeParse(body)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'AI_CONFIG_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    const auditRepo = ds.getRepository(AuditEvent)

    const repo = await repoRepo.findOne({ where: { id } })
    if (!repo) {
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
    }
    await requireOrgResource(event, repo.organizationId)

    const before = {
        aiEnabled: repo.aiEnabled,
        aiTrigger: repo.aiTrigger,
    }

    const data = parsed.data
    if (data.aiEnabled !== undefined) {
        repo.aiEnabled = data.aiEnabled
    }
    if (data.aiTrigger !== undefined) {
        repo.aiTrigger = data.aiTrigger
    }

    // 启用 AI 研判时校验 Organization 已配 Key（避免启用后跑不出来的沉默失败）
    if (repo.aiEnabled) {
        if (!repo.organizationId) {
            throw createLocalizedError(event, { statusCode: 500, code: 'ORG_NOT_FOUND' })
        }
        const orgRepo = ds.getRepository(Organization)
        const org = await orgRepo.findOne({ where: { id: repo.organizationId } })
        if (org && !org.aiApiKeyEncrypted) {
            throw createLocalizedError(event, {
                statusCode: 400,
                code: 'AI_KEY_REQUIRED',
            })
        }
    }

    await repoRepo.save(repo)

    await auditRepo.save(auditRepo.create({
        type: 'ai_config_update',
        severity: 'info',
        repositoryId: repo.id,
        scanRunId: null,
        payloadJson: JSON.stringify({
            scope: 'repository',
            repositoryId: repo.id,
            before,
            after: { aiEnabled: repo.aiEnabled, aiTrigger: repo.aiTrigger },
        }),
        notified: false,
        notifiedVia: null,
    } as AuditEvent))

    return {
        repository: {
            id: repo.id,
            aiEnabled: repo.aiEnabled,
            aiTrigger: repo.aiTrigger,
        },
    }
})
