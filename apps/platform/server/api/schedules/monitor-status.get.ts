import { requireRole } from '#server/utils/guard'
import { isActionStatusMonitorEnabled } from '#server/services/scheduler/scheduler.service'

/**
 * GET /api/schedules/monitor-status：PR Check 状态监测总开关状态。
 *
 * 总开关为进程级 env（`ACTION_STATUS_MONITOR_ENABLED`，默认 false），不可热更。
 * 前端据此在存在 `kind='pr-check'` 计划但总开关未启用时给出可观测提示
 * （避免「计划已配置但触发被静默跳过」）。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])
    return { actionStatusMonitorEnabled: isActionStatusMonitorEnabled() }
})
