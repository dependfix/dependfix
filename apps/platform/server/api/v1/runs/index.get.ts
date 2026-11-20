import { z } from 'zod'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import {
    applyRunsOrder,
    applyRunsWhere,
    isValidRunsRange,
    runsFilterShape,
    runsPaginationShape,
    runsSortShape,
} from '#server/utils/runs-query'
import { toPage } from '#server/schemas/api-v1-fields'
import { toRunV1View } from '#server/services/view/runs'

/**
 * GET /api/v1/runs：扫描运行列表（只读）。
 *
 * 复用内部 `runs-query` 的筛选 / 排序 / 分页片段（单一事实源），返回
 * `{ items, total, page, pageSize }`；`pageSize` 上限沿用 200（runs 既有契约）。
 */
const querySchema = z.object({
    ...runsFilterShape,
    ...runsPaginationShape,
    ...runsSortShape,
}).refine(isValidRunsRange, {
    message: 'from must be less than or equal to to',
    path: ['to'],
})

export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const parsed = querySchema.safeParse(getQuery(event))
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'API_V1_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }
    const { repositoryId, status, failureStage, failureKind, from, to, page, pageSize, sortBy, sortOrder } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)

    const qb = ds.getRepository(ScanRun).createQueryBuilder('run')
        .leftJoinAndSelect('run.repository', 'repository')
    applyRunsWhere(qb, { repositoryId, status, failureStage, failureKind, from, to }, organizationId)
    applyRunsOrder(qb, { sortBy, sortOrder })
    const [runs, total] = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount()

    return toPage(runs.map(toRunV1View), total, page, pageSize)
})
