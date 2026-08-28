import { Schedule } from '#server/entities/schedule'
import { ensureDatabaseInitialized } from '#server/database'
import { requireOrgResource, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { triggerSchedule } from '#server/services/scheduler/scheduler.service'

/**
 * POST /api/schedules/[id]/trigger：手动触发一次（测试用，不等待 cron 到点）。
 * 触发行为与到点相同：解析仓库列表 → 创建 BatchRun → 逐仓库入队（async）或同步串行（sync）。
 * disabled 计划也允许手动触发（验证配置有效），但调度器不会自动触发。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'SCHEDULE_ID_MISSING' })
    }

    const ds = await ensureDatabaseInitialized()
    const schedule = await ds.getRepository(Schedule).findOne({ where: { id } })
    if (!schedule) {
        throw createLocalizedError(event, { statusCode: 404, code: 'SCHEDULE_NOT_FOUND' })
    }
    await requireOrgResource(event, schedule.organizationId)

    return triggerSchedule(id)
})
