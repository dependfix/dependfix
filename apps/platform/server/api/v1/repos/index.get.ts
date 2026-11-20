import { z } from 'zod'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { requireV1Auth } from '#server/utils/api-key-guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { apiV1PaginationShape, toPage } from '#server/schemas/api-v1-fields'
import { toRepositoryV1View } from '#server/services/view/repos'

/**
 * GET /api/v1/repos：已纳管仓库（只读）。
 *
 * - `owner` / `name` 精确过滤（v1 新增服务端能力；内部 `/api/repos` 保持全量，视觉门禁依赖）
 * - 组织隔离：只返回当前组织仓库
 * - 分页对象 `{ items, total, page, pageSize }`，默认 100 / 最大 500（超限静默钳制）
 */
const querySchema = z.object({
    owner: z.string().min(1).max(100).optional(),
    name: z.string().min(1).max(100).optional(),
    ...apiV1PaginationShape,
})

export default defineEventHandler(async (event) => {
    const auth = await requireV1Auth(event, { requireScope: 'read' })

    const parsed = querySchema.safeParse(getQuery(event))
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'API_V1_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }
    const { owner, name, page, pageSize } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)

    const where = {
        organizationId: auth.organizationId,
        ...(owner ? { owner } : {}),
        ...(name ? { name } : {}),
    }
    const [repos, total] = await repo.findAndCount({
        where,
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * pageSize,
        take: pageSize,
    })

    return toPage(repos.map(toRepositoryV1View), total, page, pageSize)
})
