import { scanRequestSchema } from '#server/schemas/scan'
import { runScanForRepository } from '#server/services/scan-orchestrator.service'
import { requireOrgResource, requireRole } from '#server/utils/guard'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'

/** POST /api/repos/[id]/scan：触发单仓库扫描（同步执行，请求内完成；写操作限 admin/org_admin） */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: '缺少仓库 id' })
    }

    // 扫描目标仓库必须存在且归属当前组织
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)
    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createError({ statusCode: 404, statusMessage: 'Not Found', message: '仓库不存在' })
    }
    await requireOrgResource(event, found.organizationId)

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = scanRequestSchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    // 同步执行：请求内完成扫描（Q2 决策）；前端 loading
    const run = await runScanForRepository(id, parsed.data)

    // 返回视图（不含敏感字段）
    return {
        id: run.id,
        repositoryId: run.repositoryId,
        mode: run.mode,
        severityThreshold: run.severityThreshold,
        executorKind: run.executorKind,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        runUrl: run.runUrl,
        summary: run.summaryJson ? JSON.parse(run.summaryJson) as Record<string, unknown> : null,
        error: run.errorJson ? JSON.parse(run.errorJson) as { code: string, message: string } : null,
    }
})
