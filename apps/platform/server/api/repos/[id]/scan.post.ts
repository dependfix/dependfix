import { scanRequestSchema } from '#server/schemas/scan'
import { createPendingScanRun, runScanForRepository } from '#server/services/scan-orchestrator.service'
import { getQueueService } from '#server/services/queue/queue.service'
import { SCAN_JOB_PRIORITY } from '#server/services/queue/queue-mode'
import { requireOrgResource, requireRole } from '#server/utils/guard'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * POST /api/repos/[id]/scan：触发单仓库扫描（写操作限 admin/org_admin）。
 * 执行模式（渐进式降级）：
 * - async（Redis 可用）：预创建 pending run + 入队，立即返回（前端轮询状态）；
 *   入队失败 failover 同步执行（续用 pending run，任务不丢失）
 * - sync（无 Redis / QUEUE_ENABLED=false）：请求内同步完成（既有行为）
 */
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

    // 队列模式：pending + 入队立即返回（异步；前端轮询 GET /api/runs/[id]）
    const queueService = await getQueueService()
    if (queueService.mode === 'async' && queueService.queue) {
        const pendingRun = await createPendingScanRun(id, parsed.data)
        try {
            const { reused } = await queueService.queue.add(id, parsed.data, {
                priority: SCAN_JOB_PRIORITY.manual,
                runId: pendingRun.id,
            })
            if (reused) {
                // 同仓库已有进行中任务（去重合并）：孤儿 pending run 置 failed + duplicate 提示，
                // 避免前端轮询 10 分钟后误报"扫描仍在进行"
                pendingRun.status = 'failed'
                pendingRun.finishedAt = new Date()
                pendingRun.errorJson = JSON.stringify({
                    code: 'duplicate_scan',
                    message: '该仓库已有进行中的扫描任务，本次触发已合并',
                })
                await ds.getRepository(ScanRun).save(pendingRun)
            }
        } catch (error) {
            // 入队失败 failover：同步执行（续用 pending run），保证任务不丢失
            const message = error instanceof Error ? error.message : String(error)
            if (message.includes('已处于终态')) {
                // 终态冲突（入队半成功且 worker 已抢先完成）：409 提示而非 500 裸错误
                throw createError({ statusCode: 409, statusMessage: 'Conflict', message: '扫描已完成，请在扫描历史中查看' })
            }
            console.warn(`[scan] 入队失败，降级同步执行：${message}`)
            const run = await runScanForRepository(id, parsed.data, { runId: pendingRun.id })
            return serializeRun(run)
        }
        return serializeRun(pendingRun)
    }

    // 同步降级：请求内完成扫描（既有行为）
    const run = await runScanForRepository(id, parsed.data)
    return serializeRun(run)
})

/** 返回视图（不含敏感字段） */
const serializeRun = (run: Awaited<ReturnType<typeof runScanForRepository>>): Record<string, unknown> => ({
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
})
