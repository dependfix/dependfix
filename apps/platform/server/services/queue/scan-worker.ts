/**
 * 扫描任务 Worker（BullMQ Worker 封装）。
 * processor 复用 runScanForRepository（同步模型执行主体，队列化后由 worker 消费）。
 * 并发控制：同仓库由 jobId 去重保证（同一仓库同时一个 job）；不同仓库按 concurrency 并发
 * （默认 1 保守——容器执行器按 runId 隔离 workDir，跨仓库并发安全；env 可调）。
 */
import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { runScanForRepository } from '../scan-orchestrator.service'
import { SCAN_QUEUE_NAME, type ScanJobData } from './scan-queue'

export interface ScanWorker {
    close: () => Promise<void>
}

export const createScanWorker = (connection: Redis, options?: { concurrency?: number }): ScanWorker => {
    const worker = new Worker<ScanJobData>(SCAN_QUEUE_NAME, async (job) => {
        const { repositoryId, request, runId } = job.data
        // 续用 API 预创建的 pending run（runId 非空时）；同步降级路径不经过 worker
        return runScanForRepository(repositoryId, request, runId ? { runId } : undefined)
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
