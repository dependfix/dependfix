import { ensureDatabaseInitialized } from '#server/database'
import { requireRole } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'
import { ApiKey } from '#server/entities/api-key'
import { readApiKeyScopes } from '#server/utils/api-key'

/**
 * GET /api/v1/keys：当前组织的 API key 列表（会话 + admin / org_admin）。
 *
 * 只返回前缀与元数据，不返回明文或哈希；明文仅在创建响应出现一次。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const rows = await ds.getRepository(ApiKey).find({
        where: { referenceId: organizationId },
        order: { createdAt: 'DESC', id: 'DESC' },
    })

    return {
        items: rows.map((key) => ({
            id: key.id,
            name: key.name,
            prefix: key.prefix,
            start: key.start,
            enabled: key.enabled,
            scopes: readApiKeyScopes(key.metadata),
            createdAt: key.createdAt,
            expiresAt: key.expiresAt,
            lastRequest: key.lastRequest,
        })),
        total: rows.length,
    }
})
