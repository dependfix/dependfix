import { z } from 'zod'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { requireV1Auth } from '#server/utils/api-key-guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { apiV1PaginationShape, toPage } from '#server/schemas/api-v1-fields'
import { applyAlertFilters, applyAlertOrder, toAlertV1View } from '#server/services/view/alerts'

/**
 * GET /api/v1/alerts：告警列表（只读，read scope）。
 * 分页对象 `{ items, total, page, pageSize }`，默认 100 / 最大 500；自由文本经脱敏 + 路径归一。
 */
const querySchema = z.object({
    repositoryId: z.string().min(1).max(64).optional(),
    severity: z.string().max(32).optional(),
    source: z.string().max(32).optional(),
    groupBy: z.enum(['package', 'repository']).optional(),
    includeSuperseded: z.enum(['true', 'false']).optional(),
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
    const { repositoryId, severity, source, groupBy, includeSuperseded, page, pageSize } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const qb = ds.getRepository(ScanResult).createQueryBuilder('result')
        .leftJoinAndSelect('result.scanRun', 'scanRun')
        .leftJoinAndSelect('scanRun.repository', 'repository')
    // 组织隔离：通过 scanRun.repository 归属过滤
    qb.andWhere('repository.organizationId = :organizationId', { organizationId: auth.organizationId })
    applyAlertFilters(qb, { repositoryId, severity, source, includeSuperseded: includeSuperseded === 'true' })
    applyAlertOrder(qb, groupBy)

    const [rows, total] = await qb
        .skip((page - 1) * pageSize)
        .take(pageSize)
        .getManyAndCount()
    return toPage(rows.map(toAlertV1View), total, page, pageSize)
})
