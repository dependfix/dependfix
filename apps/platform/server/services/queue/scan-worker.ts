/**
 * 扫描任务 Worker（BullMQ Worker 封装）。
 * 默认 processor 按 job.name 分发：
 * - 'scan'（SCAN_QUEUE_NAME）：单仓库扫描，复用 runScanForRepository（续用 API 预创建的 pending run）
 * - 'scheduled-scan'（SCHEDULED_JOB_NAME）：定时计划到点（BullMQ job scheduler 产生）→ triggerSchedule
 *   （解析仓库列表 → 创建 BatchRun → 逐仓库入队），async 窗口期闭环
 * 并发控制：同仓库由 jobId 去重保证（同一仓库同时一个 job）；不同仓库按 concurrency 并发
 * （默认 1 保守——容器执行器按 runId 隔离 workDir，跨仓库并发安全；env 可调）。
 */
import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { runScanForRepository } from '../scan-orchestrator.service'
import { SCHEDULED_JOB_NAME, triggerSchedule } from '../scheduler/scheduler.service'
import { SCAN_QUEUE_NAME, type ScanJobData } from './scan-queue'

/** scheduled-scan job 数据（BullMQ job scheduler 模板，见 scheduler.service registerSchedule） */
export interface ScheduledScanJobData {
    scheduleId: string
}

/** worker 可消费的 job 数据联合（scan / scheduled-scan 两种形状） */
export type ScanWorkerJobData = ScanJobData | ScheduledScanJobData

export interface ScanWorker {
    close: () => Promise<void>
}

/** job 处理器签名（测试可注入 mock；默认 processor 按 job.name 分发） */
export type ScanJobProcessor = (data: ScanWorkerJobData, jobName: string) => Promise<unknown>

/** 默认处理器：按 job.name 分发（导出便于单测） */
export const defaultProcessor: ScanJobProcessor = async (data, jobName) => {
    if (jobName === SCHEDULED_JOB_NAME) {
        const { scheduleId } = data as ScheduledScanJobData
        return triggerSchedule(scheduleId)
    }
    if (jobName === SCAN_QUEUE_NAME) {
        const { repositoryId, request, runId, reuse } = data as ScanJobData
        // 续用 API 预创建的 pending run（runId 非空时）；同步降级路径不经过 worker
        if (!runId) {
            return runScanForRepository(repositoryId, request)
        }
        const options = reuse ? { runId, reuse: true } : { runId }
        return runScanForRepository(repositoryId, request, options)
    }
    // 未知 job name：显式抛错（而不是静默按 scan 解构——repositoryId 可能为 undefined，
    // TypeORM where 会跳过 undefined 条件，存在对错误仓库执行扫描的风险）
    throw new Error(`unknown job name: ${jobName}`)
}


export const createScanWorker = (
    connection: Redis,
    options?: { concurrency?: number, processor?: ScanJobProcessor },
): ScanWorker => {
    const worker = new Worker<ScanWorkerJobData>(SCAN_QUEUE_NAME, async (job) => {
        const processor = options?.processor ?? defaultProcessor
        return processor(job.data, job.name)
    }, {
        connection,
        concurrency: options?.concurrency ?? 1,
    })

    return {
        close: async () => {
            await worker.close()
        },
    }
}
