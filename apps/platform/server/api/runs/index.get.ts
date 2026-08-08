import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { requireAuth } from '#server/utils/guard'

const toView = (r: ScanRun) => ({
    id: r.id,
    repositoryId: r.repositoryId,
    owner: r.repository?.owner ?? null,
    name: r.repository?.name ?? null,
    mode: r.mode,
    severityThreshold: r.severityThreshold,
    executorKind: r.executorKind,
    status: r.status,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    runUrl: r.runUrl,
    summary: r.summaryJson ? JSON.parse(r.summaryJson) as Record<string, unknown> : null,
    error: r.errorJson ? JSON.parse(r.errorJson) as { code: string, message: string } : null,
})

/** GET /api/runs：扫描历史列表（可按仓库过滤） */
export default defineEventHandler(async (event) => {
    await requireAuth(event)

    const query = getQuery(event)
    const repositoryId = query.repositoryId as string | undefined

    const ds = await ensureDatabaseInitialized()
    const runRepo = ds.getRepository(ScanRun)

    const where = repositoryId ? { repositoryId } : {}
    const runs = await runRepo.find({
        where,
        order: { createdAt: 'DESC' },
        take: 100,
        relations: { repository: true },
    })
    return runs.map(toView)
})
