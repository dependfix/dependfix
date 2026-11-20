import { z } from 'zod'
import { PRCheck, PR_CHECK_CONCLUSIONS } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'
import { requireV1Auth } from '#server/utils/api-key-guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { apiV1PaginationShape, toPage } from '#server/schemas/api-v1-fields'
import { applyPRCheckFilters, applyPRCheckOrder, toPRCheckV1View } from '#server/services/view/pr-checks'

/** GET /api/v1/pr-checks：PR Check 列表（只读，read scope；分页默认 100 / 最大 500）。 */
const conclusionSchema = z.enum(PR_CHECK_CONCLUSIONS as unknown as [string, ...string[]]).optional()
const querySchema = z.object({
    repositoryId: z.string().min(1).max(64).optional(),
    conclusion: conclusionSchema,
    alertFiring: z.enum(['true', 'false']).optional(),
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
    const { repositoryId, conclusion, alertFiring, page, pageSize } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const qb = ds.getRepository(PRCheck).createQueryBuilder('prCheck')
        .leftJoinAndSelect('prCheck.repository', 'repository')
    qb.andWhere('repository.organizationId = :organizationId', { organizationId: auth.organizationId })
    applyPRCheckFilters(qb, {
        repositoryId,
        conclusion,
        alertFiring: alertFiring === undefined ? undefined : alertFiring === 'true',
    })
    applyPRCheckOrder(qb)

    const [rows, total] = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount()
    return toPage(rows.map(toPRCheckV1View), total, page, pageSize)
})
