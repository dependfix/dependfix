import type { H3Event } from 'h3'
import { Schedule } from '#server/entities/schedule'
import { ensureDatabaseInitialized } from '#server/database'
import { scheduleSchema } from '#server/schemas/schedule'
import { requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { resolveOrganizationId } from '#server/utils/organization'
import { registerSchedule } from '#server/services/scheduler/scheduler.service'

/** Schedule 视图（与实体字段对齐；日期经 Nuxt 序列化为 ISO 字符串） */
const toView = (s: Schedule) => ({
    id: s.id,
    name: s.name,
    cron: s.cron,
    timezone: s.timezone,
    selectorKind: s.selectorKind,
    selectorJson: s.selectorJson,
    mode: s.mode,
    severityThreshold: s.severityThreshold,
    enabled: s.enabled,
    lastTriggeredAt: s.lastTriggeredAt,
    lastBatchRunId: s.lastBatchRunId,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
})

/** GET /api/schedules：定时计划列表（当前组织，写权限角色可见） */
const listSchedules = async (event: H3Event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const rows = await ds.getRepository(Schedule).find({
        where: { organizationId },
        order: { createdAt: 'DESC' },
    })
    return rows.map(toView)
}

/** POST /api/schedules：新建定时计划（保存后同步注册调度） */
const createSchedule = async (event: H3Event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = scheduleSchema.safeParse(body)

    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'SCHEDULE_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const repo = ds.getRepository(Schedule)
    const saved = await repo.save(repo.create({
        organizationId,
        name: parsed.data.name,
        cron: parsed.data.cron,
        // 空串归一化为 null（空 = 服务器本地时区契约；node-cron 对空 timezone 抛 Invalid timezone）
        timezone: parsed.data.timezone || null,
        selectorKind: parsed.data.selectorKind,
        selectorJson: parsed.data.selectorJson ?? null,
        mode: parsed.data.mode,
        severityThreshold: parsed.data.severityThreshold,
        enabled: parsed.data.enabled,
    }))

    // 调度注册同步（async 用 BullMQ scheduler / sync 用 node-cron）
    if (saved.enabled) {
        await registerSchedule(saved)
    }
    return toView(saved)
}

export default defineEventHandler(async (event) => {
    switch (event.method) {
        case 'GET':
            return listSchedules(event)
        case 'POST':
            return createSchedule(event)
        default:
            throw createLocalizedError(event, { statusCode: 405, code: 'METHOD_NOT_ALLOWED' })
    }
})
