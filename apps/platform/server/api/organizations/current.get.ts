import { createLocalizedError } from '#server/utils/localized-error'
import { requireAuth } from '#server/utils/guard'
import { ensureDatabaseInitialized } from '#server/database'
import { Organization } from '#server/entities/organization'
import { resolveOrganizationId } from '#server/utils/organization'

/**
 * GET /api/organizations/current —— todo.md §M26.1 应用层 / M26.x commit 7 引入。
 *
 * 单组织模型下返回当前 Organization 概览（含 AI Key 状态）。
 * 多租户（多组织 + activeOrganizationId）成为真实需求时，此处扩展为基于 session 推断 active org。
 *
 * 响应结构：
 * - id / name：Organization 标识
 * - hasAiApiKey：是否已配置 AI Key（前端 scan-config-dialog AI override 面板禁用判定）
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const org = await ds.getRepository(Organization).findOne({ where: { id: organizationId } })

    if (!org) {
        throw createLocalizedError(event, {
            statusCode: 500,
            code: 'ORG_NOT_FOUND',
        })
    }

    return {
        id: org.id,
        name: org.name,
        hasAiApiKey: !!org.aiApiKeyEncrypted,
    }
})
