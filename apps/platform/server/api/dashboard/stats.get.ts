import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { loadDashboardStats } from '#server/services/view/dashboard'
import { resolveOrganizationId } from '#server/utils/organization'

/** GET / getDashboardStats：仪表板统计（仓库数/告警数按严重级别/已修复数/最近扫描/Top-10 包告警）
 *
 * M20.5 调整（todo.md §M20.5）：
 * - `alertsTotal` 数活跃告警（`supersededAt IS NULL`）—— 不再统计已关闭告警
 * - `severityCounts` 数活跃告警的严重级别分布
 * - `fixedCount` 数 `fixStatus='success'`（决策 1：fixStatus='success' 永不被 supersede，
 *   所以"已修复"行 supersededAt 永远是 NULL，等价于数活跃告警中 success 的数量）
 *
 * 设计要点：
 * - topPackages 仍统计全量（不区分活跃 vs superseded）—— 历史语义保留：
 *   "Top 10 包告警"展示仓库整体告警热点，含已关闭告警反映仓库历史风险
 * - 业务上若要 topPackages 也数活跃，需 M20.7 backfill 阶段统一处理
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)
    const ds = await ensureDatabaseInitialized()
    return loadDashboardStats(ds, await resolveOrganizationId(ds))
})
