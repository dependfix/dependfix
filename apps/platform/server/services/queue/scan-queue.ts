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
    /** 队列模式：API 预创建的 pending run（worker 续用）；同步降级不产生 job */
    runId: string
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
    /** 入队结果：jobId 供状态关联；reused=true 表示命中同仓库进行中任务（去重合并，未新建 job） */
    add: (repositoryId: string, request: ScanRequest, options?: { priority?: number, runId?: string }) => Promise<{ jobId: string, reused: boolean }>
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
            const existing = await queue.getJob(jobId)
            if (existing) {
                const state = await existing.getState()
                if (state === 'completed' || state === 'failed') {
                    // 终态 job（BullMQ 6：EXISTS job key 即幂等返回，终态在清理前占用 jobId）：
                    // 先移除再重建，保证"扫描完成后可立即再次触发"
                    await existing.remove()
                } else {
                    // 等待/活跃/延迟中：去重合并（不新建 job），告知调用方复用
                    return { jobId, reused: true }
                }
            }
            await queue.add(SCAN_QUEUE_NAME, { repositoryId, request, runId: opts?.runId ?? '' }, {
                jobId,
                priority: opts?.priority ?? SCAN_JOB_PRIORITY.manual,
            })
            return { jobId, reused: false }
        },
        close: async () => {
            await queue.close()
        },
    }
}
