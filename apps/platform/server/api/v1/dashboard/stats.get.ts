import { ensureDatabaseInitialized } from '#server/database'
import { requireV1Auth } from '#server/utils/api-key-guard'
import { loadDashboardStats } from '#server/services/view/dashboard'

/** GET /api/v1/dashboard/stats：仪表板汇总（只读，read scope）。 */
export default defineEventHandler(async (event) => {
    const auth = await requireV1Auth(event, { requireScope: 'read' })
    const ds = await ensureDatabaseInitialized()
    return loadDashboardStats(ds, auth.organizationId)
})
