/**
 * 批量执行服务：创建 BatchRun + 逐仓库触发扫描（async 入队 / sync 串行）。
 * 触发源统一入口——定时计划 triggerSchedule 与手动批量 API（POST /api/repos/batch-scan）共用，
 * 见 docs/design/governance/platform-scheduled-batch.md §5.1。
 *
 * 终态兜底（本服务内收敛）：
 * - 空批次（无目标仓库）：立即 completed + 零值 summary，避免永久 running
 * - async 全部入队失败：直接 failed（轮询聚合只产出 completed，需在此兜底 failed）
 * - 单仓库入队失败：跳过继续（不中断批次），终态由轮询聚合收敛
 * - 其余终态：由轮询聚合（GET /api/batch-runs/[id] 实时聚合写回）收敛
 */
import { getQueueService } from '../queue/queue.service'
import { SCAN_JOB_PRIORITY } from '../queue/queue-mode'
import { createPendingScanRun, runScanForRepository, type ScanRequest } from '../scan-orchestrator.service'
import { EMPTY_BATCH_SUMMARY } from './batch-aggregate'
import { ScanRun } from '#server/entities/scan-run'
import { BatchRun, type BatchRunSource } from '#server/entities/batch-run'
import { ensureDatabaseInitialized } from '#server/database'

export interface ExecuteBatchInput {
    /** 触发来源（scheduled=定时计划 / manual=手动批量） */
    source: BatchRunSource
    /** 关联的定时计划 id（source=scheduled 时传；manual 为 null） */
    scheduleId?: string | null
    /** 目标仓库 id 列表（调用方已按当前组织过滤） */
    repositoryIds: string[]
    /** 扫描参数（mode / severityThreshold） */
    request: ScanRequest
    /** 当前组织 id（BatchRun 归属；权限隔离由调用方守卫） */
    organizationId: string
}

export interface ExecuteBatchResult {
    batchRunId: string
    repositoryCount: number
}

export const executeBatchRun = async (input: ExecuteBatchInput): Promise<ExecuteBatchResult> => {
    const ds = await ensureDatabaseInitialized()
    const batchRepo = ds.getRepository(BatchRun)

    const batchRun = await batchRepo.save(batchRepo.create({
        source: input.source,
        scheduleId: input.scheduleId ?? null,
        mode: input.request.mode,
        severityThreshold: input.request.severityThreshold,
        repositoryCount: input.repositoryIds.length,
        status: 'running',
        organizationId: input.organizationId,
    }))

    // 空批次终态兜底：无目标仓库（如 tag 策略无匹配仓库）→ 立即 completed，避免永久 running
    if (input.repositoryIds.length === 0) {
        batchRun.status = 'completed'
        batchRun.finishedAt = new Date()
        batchRun.summaryJson = JSON.stringify(EMPTY_BATCH_SUMMARY)
        await batchRepo.save(batchRun)
        return { batchRunId: batchRun.id, repositoryCount: 0 }
    }

    const queueService = await getQueueService()
    // 优先级：定时批量 10（与 BullMQ scheduler 模板一致）/ 手动批量 1
    const priority = input.source === 'scheduled' ? SCAN_JOB_PRIORITY.scheduled : SCAN_JOB_PRIORITY.manual

    if (queueService.mode === 'async' && queueService.queue) {
        let enqueued = 0
        for (const repositoryId of input.repositoryIds) {
            let run: ScanRun | null = null
            try {
                run = await createPendingScanRun(repositoryId, input.request, { batchRunId: batchRun.id })
                const { reused } = await queueService.queue.add(repositoryId, input.request, { priority, runId: run.id })
                if (reused) {
                    // 同仓库已有进行中任务（jobId 去重合并）：本次预创建的 pending run 不会被 worker 消费，
                    // 置 failed + duplicate 标记，保证聚合终态收敛（与单仓库 scan.post.ts 语义一致）
                    run.status = 'failed'
                    run.finishedAt = new Date()
                    run.errorJson = JSON.stringify({
                        code: 'SCAN_PENDING_MERGED', // M18.x 治理批次 S1：与 ServerErrorCode 联合类型对齐
                        message: '该仓库已有进行中的扫描任务，本次触发已合并',
                    })
                    await ds.getRepository(ScanRun).save(run)
                } else {
                    enqueued++
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                if (run) {
                    // 已创建 pending run 但入队失败（Redis 抖动等）：run 置 failed + enqueue_failed，
                    // 避免孤儿 pending run 无法被 worker 消费 → 聚合永远 pending → 批次永久 running
                    run.status = 'failed'
                    run.finishedAt = new Date()
                    run.errorJson = JSON.stringify({ code: 'enqueue_failed', message })
                    await ds.getRepository(ScanRun).save(run)
                } else {
                    // pending run 创建失败（如仓库并发删除）：无残留，跳过继续（不中断批次）
                    console.warn(`[batch] 仓库 ${repositoryId} 入队失败（跳过）：${message}`)
                }
            }
        }
        // 全部入队失败 → 批次直接 failed 终态（避免永久 running）
        if (enqueued === 0) {
            batchRun.status = 'failed'
            batchRun.finishedAt = new Date()
            await batchRepo.save(batchRun)
        }
    } else {
        // sync 降级：逐仓库同步串行（runScanForRepository 内部兜底失败为 failed run，不抛错中断批次）
        for (const repositoryId of input.repositoryIds) {
            await runScanForRepository(repositoryId, input.request, { batchRunId: batchRun.id })
        }
    }

    return { batchRunId: batchRun.id, repositoryCount: input.repositoryIds.length }
}
