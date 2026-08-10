import type { H3Event } from 'h3'
import { Schedule } from '#server/entities/schedule'
import { ensureDatabaseInitialized } from '#server/database'
import { scheduleUpdateSchema } from '#server/schemas/schedule'
import { requireOrgResource, requireRole } from '#server/utils/guard'
import { registerSchedule, unregisterSchedule } from '#server/services/scheduler/scheduler.service'

/** Schedule 视图（与 /api/schedules 列表同构） */
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

/** GET /api/schedules/[id]：定时计划详情 */
const getSchedule = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const found = await ds.getRepository(Schedule).findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '定时计划不存在' })
    }
    await requireOrgResource(event, found.organizationId)
    return toView(found)
}

/**
 * PATCH /api/schedules/[id]：更新定时计划（部分字段）。
 * 调度同步策略：先注销再按最新 enabled 注册（幂等，避免判断哪些字段影响调度的状态机复杂度）。
 */
const updateSchedule = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const body = await readBody<Record<string, unknown>>(event)
    const parsed = scheduleUpdateSchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Schedule)
    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '定时计划不存在' })
    }
    await requireOrgResource(event, found.organizationId)

    Object.assign(found, {
        name: parsed.data.name ?? found.name,
        cron: parsed.data.cron ?? found.cron,
        // 空串归一化为 null（空 = 服务器本地时区契约；node-cron 对空 timezone 抛 Invalid timezone）
        timezone: parsed.data.timezone !== undefined ? parsed.data.timezone || null : found.timezone,
        selectorKind: parsed.data.selectorKind ?? found.selectorKind,
        selectorJson: parsed.data.selectorJson !== undefined ? parsed.data.selectorJson ?? null : found.selectorJson,
        mode: parsed.data.mode ?? found.mode,
        severityThreshold: parsed.data.severityThreshold ?? found.severityThreshold,
        enabled: parsed.data.enabled ?? found.enabled,
    })
    const saved = await repo.save(found)

    // 调度同步（无条件注销后按 enabled 注册）
    await unregisterSchedule(saved.id)
    if (saved.enabled) {
        await registerSchedule(saved)
    }
    return toView(saved)
}

/** DELETE /api/schedules/[id]：删除定时计划（先注销调度） */
const deleteSchedule = async (event: H3Event, id: string) => {
    await requireRole(event, ['admin', 'org_admin'])
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Schedule)
    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '定时计划不存在' })
    }
    await requireOrgResource(event, found.organizationId)

    await unregisterSchedule(found.id)
    await repo.remove(found)
    return { id, deleted: true }
}

export default defineEventHandler(async (event) => {
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少计划 id' })
    }
    switch (event.method) {
        case 'GET':
            return getSchedule(event, id)
        case 'PATCH':
            return updateSchedule(event, id)
        case 'DELETE':
            return deleteSchedule(event, id)
        default:
            throw createError({ statusCode: 405, statusMessage: 'Method Not Allowed' })
    }
})
