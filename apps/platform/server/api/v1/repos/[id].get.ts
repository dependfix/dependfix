import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { requireV1Auth } from '#server/utils/api-key-guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { toRepositoryV1View } from '#server/services/view/repos'

/** GET /api/v1/repos/{id}：单仓库详情（字段白名单 + 组织隔离）。 */
export default defineEventHandler(async (event) => {
    const auth = await requireV1Auth(event, { requireScope: 'read' })

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'REPO_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const found = await ds.getRepository(Repository).findOne({
        where: { id },
    })
    if (!found) {
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
    }
    if (found.organizationId !== auth.organizationId) {
        throw createLocalizedError(event, { statusCode: 403, code: 'RESOURCE_NOT_IN_ORG' })
    }

    return toRepositoryV1View(found)
})
