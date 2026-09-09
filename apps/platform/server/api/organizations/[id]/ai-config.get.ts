import { createLocalizedError } from '#server/utils/localized-error'
import { requireAuth, requireOrgResource } from '#server/utils/guard'
import { Organization } from '#server/entities/organization'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * GET /api/organizations/[id]/ai-config —— todo.md §M26.1 应用层（re-audit fix B1）/ [platform-ai-integration.md §6.3](../design/governance/platform-ai-integration.md)。
 *
 * 权限：viewable（任何组织成员可读）；凭据最小化（响应不回显 aiApiKeyEncrypted 明文，仅返回 hasAiApiKey 布尔）。
 *
 * 响应结构：
 * - id：Organization id
 * - aiProvider / aiModel / aiBaseUrl / aiApiUrl：Organization.ai* 字段
 * - hasAiApiKey：布尔，标识 Organization.aiApiKeyEncrypted 是否非空（前端 ai-config-form 用于渲染"已配置" Badge）
 *
 * 404：Organization 不存在
 * 403：跨组织访问（requireOrgResource fail-fast）
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'ORG_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const orgRepo = ds.getRepository(Organization)

    const org = await orgRepo.findOne({ where: { id } })
    if (!org) {
        throw createLocalizedError(event, { statusCode: 404, code: 'ORG_NOT_FOUND' })
    }
    // 凭据归属校验：viewer 只能看自己 org 的 AI 配置；多租户扩展时此处拦截跨组织
    await requireOrgResource(event, org.id)

    return {
        id: org.id,
        aiProvider: org.aiProvider,
        aiModel: org.aiModel,
        aiBaseUrl: org.aiBaseUrl,
        aiApiUrl: org.aiApiUrl,
        hasAiApiKey: !!org.aiApiKeyEncrypted,
    }
})
