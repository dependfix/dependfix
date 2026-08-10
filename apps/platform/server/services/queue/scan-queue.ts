/**
 * 扫描任务队列（BullMQ Queue 封装）。
 * 去重语义（BullMQ 6 实测）：jobId = scan:{repositoryId}。
 * - 等待/活跃/延迟中重复 add：返回已有 job，不重复执行（同仓库未完成扫描合并）
 * - completed/failed 终态 job：key 在 removeOnComplete(1h)/removeOnFail(24h) 清理前仍占用，
 *   add 会被幂等吞掉（不创建新 job）——本封装在 add 时检测终态并 remove 后重新入队，
 *   保证"扫描完成后可立即再次触发"
 * 重试：指数退避（默认 5s 起），attempts 可配（QUEUE_JOB_RETRIES）。
 * 优先级：手动 1 > webhook 5 > 定时 10（webhook/定时为后续调度任务预留，当前仅手动触发使用）。
 */
import { Queue } from 'bullmq'
import type { Redis } from 'ioredis'
import type { ScanRequest } from '../scan-orchestrator.service'
import { buildScanJobId, parseRetryConfig, SCAN_JOB_PRIORITY } from './queue-mode'

export const SCAN_QUEUE_NAME = 'scan'

export interface ScanJobData {
    repositoryId: string
    request: ScanRequest
}

/** 队列默认选项（纯函数便于单测：重试/backoff/清理策略） */
export const buildScanQueueOptions = (options: { retriesRaw?: string, backoffMsRaw?: string }) => {
    const retry = parseRetryConfig(options)
    return {
        defaultJobOptions: {
            attempts: retry.attempts,
            backoff: {
                type: 'exponential' as const,
                delay: retry.backoffMs,
            },
            // 清理策略：完成保留 1h / 失败保留 24h，避免队列无限增长
            // （终态 job key 在清理前仍占用 jobId——add 时检测并重建，见 createScanQueue.add）
            removeOnComplete: { age: 3_600, count: 1_000 },
            removeOnFail: { age: 86_400, count: 1_000 },
        },
    }
}

export interface ScanQueue {
    /** 入队（等待/活跃中合并；终态自动重建，保证可立即重新扫描） */
    add: (repositoryId: string, request: ScanRequest, options?: { priority?: number }) => Promise<string>
    close: () => Promise<void>
}

export const createScanQueue = (connection: Redis, options: { retriesRaw?: string, backoffMsRaw?: string }): ScanQueue => {
    const queue = new Queue<ScanJobData>(SCAN_QUEUE_NAME, {
        connection,
        ...buildScanQueueOptions(options),
    })

    return {
        add: async (repositoryId, request, opts) => {
            const jobId = buildScanJobId(repositoryId)
            // 终态 job 检测（BullMQ 6：EXISTS job key 即幂等返回，终态在清理前占用 jobId）
            const existing = await queue.getJob(jobId)
            if (existing) {
                const state = await existing.getState()
                if (state === 'completed' || state === 'failed') {
                    await existing.remove()
                }
                // 等待/活跃/延迟中：保留（去重合并，不重建）
            }
            await queue.add(SCAN_QUEUE_NAME, { repositoryId, request }, {
                jobId,
                priority: opts?.priority ?? SCAN_JOB_PRIORITY.manual,
            })
            return jobId
        },
        close: async () => {
            await queue.close()
        },
    }
}
