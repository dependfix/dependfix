import { Schedule } from '#server/entities/schedule'
import { ensureDatabaseInitialized } from '#server/database'
import { requireOrgResource, requireRole } from '#server/utils/guard'
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
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少计划 id' })
    }

    const ds = await ensureDatabaseInitialized()
    const schedule = await ds.getRepository(Schedule).findOne({ where: { id } })
    if (!schedule) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '定时计划不存在' })
    }
    await requireOrgResource(event, schedule.organizationId)

    return triggerSchedule(id)
})
