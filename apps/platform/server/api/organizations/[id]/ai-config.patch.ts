import { organizationAiConfigSchema } from '#server/schemas/ai-config'
import { createLocalizedError } from '#server/utils/localized-error'
import { requireRole, requireOrgResource } from '#server/utils/guard'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'

/**
 * PATCH /api/organizations/[id]/ai-config —— todo.md §M26.1 应用层 / [platform-ai-integration.md §6.2](../design/governance/platform-ai-integration.md)。
 *
 * 权限：admin / org_admin。
 * 行为：更新 Organization.ai* 字段；aiApiKey 明文传输落库前调用 encryptToken AES-256-GCM 加密（与 Credential.encryptedToken 同源）；
 * 响应不回显 apiKey 明文（仅返回 hasAiApiKey 布尔）。
 *
 * 审计：写操作登记 AuditEvent（resourceType='organization' / action='update_ai_config'），含变更前后字段 diff；
 * aiApiKey 不写入 AuditEvent.data（避免审计日志泄露，仅记录 hasAiApiKey 变化）。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'ORG_ID_MISSING' })
    }

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = organizationAiConfigSchema.safeParse(body)
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'AI_CONFIG_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const orgRepo = ds.getRepository(Organization)
    const repoRepo = ds.getRepository(Repository)
    const auditRepo = ds.getRepository(AuditEvent)

    const org = await orgRepo.findOne({ where: { id } })
    if (!org) {
        throw createLocalizedError(event, { statusCode: 404, code: 'ORG_NOT_FOUND' })
    }
    // 凭据归属校验：admin 必须属于该 organizationId
    await requireOrgResource(event, org.id)

    // 快照变更前字段（用于审计 diff + 校验 hasRepositories）
    const before = {
        hasAiApiKey: !!org.aiApiKeyEncrypted,
        aiProvider: org.aiProvider,
        aiModel: org.aiModel,
        aiBaseUrl: org.aiBaseUrl,
        aiApiUrl: org.aiApiUrl,
    }

    // 字段更新：只覆盖请求中实际传入的字段（partial update 语义）
    const data = parsed.data
    if (data.aiProvider !== undefined) {
        org.aiProvider = data.aiProvider
    }
    if (data.aiModel !== undefined) {
        org.aiModel = data.aiModel
    }
    if (data.aiBaseUrl !== undefined) {
        org.aiBaseUrl = data.aiBaseUrl
    }
    if (data.aiApiUrl !== undefined) {
        org.aiApiUrl = data.aiApiUrl
    }

    if (data.aiApiKey !== undefined) {
        if (data.aiApiKey.length === 0) {
            // 空字符串 = 清空 Key（与 organizations.patch.ts 凭据清空语义一致）
            org.aiApiKeyEncrypted = null
        } else {
            const encryptionKey = getEncryptionKey()
            org.aiApiKeyEncrypted = encryptToken(data.aiApiKey, encryptionKey)
        }
    }

    await orgRepo.save(org)

    // 审计：写操作登记 AuditEvent（不含 apiKey 明文）
    const auditData: Record<string, unknown> = {
        before,
        after: {
            hasAiApiKey: !!org.aiApiKeyEncrypted,
            aiProvider: org.aiProvider,
            aiModel: org.aiModel,
            aiBaseUrl: org.aiBaseUrl,
            aiApiUrl: org.aiApiUrl,
        },
    }
    await auditRepo.save(auditRepo.create({
        type: 'ai_config_update',
        severity: 'info',
        repositoryId: null,
        scanRunId: null,
        payloadJson: JSON.stringify({
            scope: 'organization',
            organizationId: org.id,
            ...auditData,
        }),
        notified: false,
        notifiedVia: null,
    } as AuditEvent))

    // 触发该 Organization 下所有 Repository 的 aiEnabled 默认值重算（业务可选：通知前端 reload）
    const affectedRepos = await repoRepo.count({ where: { organizationId: org.id } })

    return {
        organization: {
            id: org.id,
            hasAiApiKey: !!org.aiApiKeyEncrypted,
            aiProvider: org.aiProvider,
            aiModel: org.aiModel,
            aiBaseUrl: org.aiBaseUrl,
            aiApiUrl: org.aiApiUrl,
            affectedRepos,
        },
    }
})
