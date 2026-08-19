import { BatchRun } from '#server/entities/batch-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'

/** BatchRun 视图（列表/详情共用；日期经 Nuxt 序列化为 ISO 字符串）。
 * 列表附带 updatedAt 便于前端做增量 reconcile（避免整表替换导致 PrimeVue DataTable 屏闪）。 */
const toView = (b: BatchRun) => ({
    id: b.id,
    source: b.source,
    scheduleId: b.scheduleId,
    mode: b.mode,
    severityThreshold: b.severityThreshold,
    repositoryCount: b.repositoryCount,
    finishedCount: b.finishedCount,
    completedCount: b.completedCount,
    failedCount: b.failedCount,
    pendingCount: b.pendingCount,
    summary: b.summaryJson ? JSON.parse(b.summaryJson) as Record<string, unknown> : null,
    status: b.status,
    finishedAt: b.finishedAt,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
})

/**
 * GET /api/batch-runs：批量运行列表（当前组织，按时间倒序）。
 * 只读角色可见（viewer 可查进度与聚合结果）；计数/状态为存储值，
 * 实时聚合在详情 GET（/api/batch-runs/[id]）时计算并写回（轮询更新策略，见设计 §5.2）。
 */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)
    const rows = await ds.getRepository(BatchRun).find({
        where: { organizationId },
        order: { createdAt: 'DESC' },
        take: 50,
    })
    return rows.map(toView)
})
