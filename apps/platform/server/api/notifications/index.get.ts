import { z } from 'zod'
import { requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { ensureDatabaseInitialized } from '#server/database'
import { NotificationLog } from '#server/entities/notification-log'

const querySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    category: z.string().max(32).optional(),
    status: z.string().max(32).optional(),
})

/** GET /api/notifications：投递记录（admin / org_admin，分页 + 类别 / 状态筛选）。 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const parsed = querySchema.safeParse(getQuery(event))
    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'NOTIFICATION_QUERY_INVALID',
            data: { issues: parsed.error.issues },
        })
    }
    const { page, pageSize, category, status } = parsed.data
    const ds = await ensureDatabaseInitialized()
    // 同毫秒并列时按主键 DESC 兜底，翻页不重不漏（api.md §4 排序确定性）
    const qb = ds.getRepository(NotificationLog).createQueryBuilder('n')
        .orderBy('n.createdAt', 'DESC')
        .addOrderBy('n.id', 'DESC')
    if (category) {
        qb.andWhere('n.category = :category', { category })
    }
    if (status) {
        qb.andWhere('n.status = :status', { status })
    }
    const [rows, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount()
    return {
        items: rows.map((row) => ({
            id: row.id,
            deliveryKey: row.deliveryKey,
            category: row.category,
            scopeType: row.scopeType,
            scopeId: row.scopeId,
            channel: row.channel,
            fingerprint: row.fingerprint,
            recipients: (() => {
                try {
                    return JSON.parse(row.recipientsJson) as string[]
                } catch {
                    return []
                }
            })(),
            status: row.status,
            errorMessage: row.errorMessage,
            sentAt: row.sentAt,
            createdAt: row.createdAt,
        })),
        total,
        page,
        pageSize,
    }
})
