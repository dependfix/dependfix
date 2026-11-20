import { ensureDatabaseInitialized } from '#server/database'
import { requireRole } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'
import { createLocalizedError } from '#server/utils/localized-error'
import { ApiKey } from '#server/entities/api-key'

/**
 * DELETE /api/v1/keys/{id}：吊销当前组织的 API key（会话 + admin / org_admin）。
 *
 * 跨组织 key 按不存在处理（404），避免枚举他人 key；吊销后下一次校验立即失效。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'API_V1_VALIDATION_FAILED' })
    }

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const repo = ds.getRepository(ApiKey)
    const target = await repo.findOne({ where: { id, referenceId: organizationId } })
    if (!target) {
        throw createLocalizedError(event, { statusCode: 404, code: 'API_KEY_NOT_FOUND' })
    }

    await repo.delete({ id })
    return { deleted: true }
})
