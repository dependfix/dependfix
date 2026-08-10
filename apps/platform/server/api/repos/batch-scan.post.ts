import { In } from 'typeorm'
import { batchScanSchema } from '#server/schemas/schedule'
import { executeBatchRun } from '#server/services/batch/batch-executor'
import { requireRole } from '#server/utils/guard'
import { resolveOrganizationId } from '#server/utils/organization'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * POST /api/repos/batch-scan：手动批量扫描（勾选多个仓库一次触发）。
 * 权限：admin/org_admin。
 * 语义：repositoryIds 过滤为当前组织实际存在的仓库（跨组织/不存在 id 静默过滤，
 * 与 selector explicit 策略一致，权限隔离）；过滤后为空 → 400。
 * 执行：executeBatchRun（创建 BatchRun source=manual → 逐仓库 async 入队 priority=manual /
 * sync 串行），聚合进度在批量运行详情页轮询查看。
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const body = await readBody<Record<string, unknown>>(event)
    const parsed = batchScanSchema.safeParse(body)

    if (!parsed.success) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: parsed.error.issues.map((i) => i.message).join('；'),
        })
    }

    const ds = await ensureDatabaseInitialized()
    const organizationId = await resolveOrganizationId(ds)

    // 过滤为当前组织实际存在的仓库（跨组织/不存在 id 不参与本次批量，静默过滤）
    const repos = await ds.getRepository(Repository).find({
        where: { organizationId, id: In(parsed.data.repositoryIds) },
    })
    const repositoryIds = repos.map((r) => r.id)
    if (repositoryIds.length === 0) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Bad Request',
            message: '所选仓库不存在或不属于当前组织',
        })
    }

    const result = await executeBatchRun({
        source: 'manual',
        repositoryIds,
        request: {
            mode: parsed.data.mode,
            severityThreshold: parsed.data.severityThreshold,
        },
        organizationId,
    })

    return { batchRunId: result.batchRunId, repositoryCount: result.repositoryCount }
})
