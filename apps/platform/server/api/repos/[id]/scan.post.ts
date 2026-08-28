import { scanRequestSchema } from '#server/schemas/scan'
import { createPendingScanRun, runScanForRepository } from '#server/services/scan-orchestrator.service'
import { getQueueService } from '#server/services/queue/queue.service'
import { SCAN_JOB_PRIORITY } from '#server/services/queue/queue-mode'
import { requireOrgResource, requireRole } from '#server/utils/guard'
import { createLocalizedError } from '#server/utils/localized-error'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * POST /api/repos/[id]/scan：触发单仓库扫描（写操作限 admin/org_admin）。
 * 执行模式（渐进式降级）：
 * - async（Redis 可用）：预创建 pending run + 入队，立即返回（前端轮询状态）；
 *   入队失败 failover 同步执行（续用 pending run，任务不丢失）
 * - sync（无 Redis / QUEUE_ENABLED=false）：请求内同步完成（既有行为）
 *
 * reuseScanRunId（todo.md §M16.2 C66-D）：
 * - alerts 视图 "立即修复此仓库" 入口触发复用既有 ScanRun（report-only run 的结果作为输入）
 * - 跳过 createPendingScanRun，复用 run_id 直接入队 / 同步执行；扫描结果不变更 run_id，
 *   历史与告警可继续按 id 关联
 * - 校验归属（repositoryId 必须等于 [id]）+ 校验不与进行中任务冲突（running → 409）
 */
export default defineEventHandler(async (event) => {
    await requireRole(event, ['admin', 'org_admin'])

    const id = getRouterParam(event, 'id') as string
    if (!id) {
        throw createLocalizedError(event, { statusCode: 400, code: 'REPO_ID_MISSING' })
    }

    // 扫描目标仓库必须存在且归属当前组织
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)
    const found = await repo.findOne({ where: { id } })
    if (!found) {
        throw createLocalizedError(event, { statusCode: 404, code: 'REPO_NOT_FOUND' })
    }
    await requireOrgResource(event, found.organizationId)

    const body = await readBody<Record<string, unknown>>(event).catch(() => ({}))
    const parsed = scanRequestSchema.safeParse(body)

    if (!parsed.success) {
        throw createLocalizedError(event, {
            statusCode: 400,
            code: 'REPO_VALIDATION_FAILED',
            data: { issues: parsed.error.issues },
        })
    }

    // reuseScanRunId 校验：存在 / 归属 / 非 running
    // —— running 状态拒绝复用（与同仓库互斥锁 withRepoLock 冲突，会出现两个 worker 写同一 workDir）
    let reuseExisting: ScanRun | null = null
    if (parsed.data.reuseScanRunId) {
        const runRepo = ds.getRepository(ScanRun)
        const existing = await runRepo.findOne({ where: { id: parsed.data.reuseScanRunId } })
        if (!existing) {
            throw createLocalizedError(event, { statusCode: 404, code: 'SCAN_RUN_NOT_FOUND' })
        }
        if (existing.repositoryId !== id) {
            throw createLocalizedError(event, {
                statusCode: 400,
                code: 'REUSE_RUN_NOT_IN_REPO',
            })
        }
        if (existing.status === 'running') {
            throw createLocalizedError(event, {
                statusCode: 409,
                code: 'REUSE_RUN_RUNNING',
            })
        }
        reuseExisting = existing
    }

    // 队列模式：pending + 入队立即返回（异步；前端轮询 GET /api/runs/[id]）
    const queueService = await getQueueService()
    if (queueService.mode === 'async' && queueService.queue) {
        // reuse 路径：复用既有 run.id；新建路径：createPendingScanRun 返回实体
        const pendingRun: ScanRun = reuseExisting
            ?? await createPendingScanRun(id, parsed.data)
        try {
            const { reused } = await queueService.queue.add(id, parsed.data, {
                priority: SCAN_JOB_PRIORITY.manual,
                runId: pendingRun.id,
                reuse: !!reuseExisting, // 用户主动复用：worker 端透传 reuse=true 绕过终态校验
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
                throw createLocalizedError(event, { statusCode: 409, code: 'SCAN_ALREADY_COMPLETED' })
            }
            console.warn(`[scan] 入队失败，降级同步执行：${message}`)
            const run = await runScanForRepository(id, parsed.data, { runId: pendingRun.id })
            return serializeRun(run)
        }
        return serializeRun(pendingRun)
    }

    // 同步降级：请求内完成扫描（既有行为；reuse 路径传 runId + reuse:true 让 orchestrator
    // 绕过终态校验并重置既有 record 的 finishedAt / errorJson / summaryJson）
    const run = reuseExisting
        ? await runScanForRepository(id, parsed.data, { runId: reuseExisting.id, reuse: true })
        : await runScanForRepository(id, parsed.data)
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
