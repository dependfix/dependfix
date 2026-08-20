import { z } from 'zod'
import { AuditEvent, AUDIT_EVENT_TYPES, AUDIT_EVENT_SEVERITIES } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { requireRole } from '#server/utils/guard'

/**
 * GET /api/audit-events：环境/容器审计事件列表（env-events 视图数据源）。
 *
 * 过滤维度：type / severity / notified / repositoryId / from / to（ISO 时间）。
 * 排序：createdAt DESC（最新事件优先）。
 * 上限：take 500（与 alerts.get.ts 一致，避免一次性返回过多数据）。
 *
 * 权限：admin / org_admin 角色（环境事件涉及系统信号，不对 viewer 开放）。
 *
 * Zod 输入边界：
 * - type / severity 仅允许枚举值（含 'all'）；非法值抛 ZodError → handler 转 400
 * - notified 仅允许 'true' / 'false' / 'all'；非法值抛 400
 * - from / to 可选 ISO 时间字符串；非法格式抛 400；反向时间范围（from > to）拒绝 400
 * - repositoryId 自由字符串（UUID 格式由下游 Entity 校验；空串视为 'all'）
 */
const TYPE_VALUES = ['all', ...AUDIT_EVENT_TYPES] as const
const SEVERITY_VALUES = ['all', ...AUDIT_EVENT_SEVERITIES] as const
const NOTIFIED_VALUES = ['all', 'true', 'false'] as const

const querySchema = z.object({
    type: z.enum(TYPE_VALUES).optional(),
    severity: z.enum(SEVERITY_VALUES).optional(),
    notified: z.enum(NOTIFIED_VALUES).optional(),
    repositoryId: z.string().optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
}).refine((v) => {
    // 时间范围反向（from > to）拒绝（业务上无意义）
    if (v.from && v.to) {
        return new Date(v.from).getTime() <= new Date(v.to).getTime()
    }
    return true
}, { message: 'from must be <= to', path: ['from'] })

export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const raw = getQuery(event)
    const parsed = querySchema.safeParse(raw)
    if (!parsed.success) {
        const issue = parsed.error.issues[0]
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: issue?.message ?? 'Invalid query parameters',
        })
    }
    const { type, severity, notified, repositoryId, from, to } = parsed.data

    const ds = await ensureDatabaseInitialized()
    const eventRepo = ds.getRepository(AuditEvent)

    // 使用 QueryBuilder 处理时间范围（TypeORM where.createdAt 直接传 Date 对象参数化失败）
    const qb = eventRepo.createQueryBuilder('e').leftJoinAndSelect('e.repository', 'r').orderBy('e.createdAt', 'DESC').take(500)
    if (type && type !== 'all') {
        qb.andWhere('e.type = :type', { type })
    }
    if (severity && severity !== 'all') {
        qb.andWhere('e.severity = :severity', { severity })
    }
    if (notified === 'true') {
        qb.andWhere('e.notified = :notified', { notified: true })
    } else if (notified === 'false') {
        qb.andWhere('e.notified = :notified', { notified: false })
    }
    if (repositoryId && repositoryId !== 'all') {
        qb.andWhere('e.repositoryId = :repositoryId', { repositoryId })
    }
    if (from) {
        qb.andWhere('e.createdAt >= :from', { from: new Date(from) })
    }
    if (to) {
        qb.andWhere('e.createdAt <= :to', { to: new Date(to) })
    }

    const events = await qb.getMany()

    return events.map((e) => ({
        id: e.id,
        type: e.type,
        severity: e.severity,
        repository: e.repository ? `${e.repository.owner}/${e.repository.name}` : null,
        scanRunId: e.scanRunId,
        payloadJson: e.payloadJson,
        notified: e.notified,
        notifiedVia: e.notifiedVia,
        createdAt: e.createdAt,
    }))
})
