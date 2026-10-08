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
    /**
     * 用户主动复用既有 ScanRun（todo.md §M16.2 C66-D）：异步队列路径下传递 reuse 选项
     * 到 worker，worker 调 runScanForRepository 时透传，绕过"终态不可续用"校验。
     * 默认 false（向后兼容既有 queue-mode continuation）。
     */
    reuse?: boolean
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

/** BullMQ job scheduler 模板（data 形状与 scan job 不同，封装层独立声明） */
export interface ScheduledJobTemplate {
    name: string
    data?: unknown
    opts?: { priority?: number }
}

export interface ScanQueue {
    /** 入队结果：jobId 供状态关联；reused=true 表示命中同仓库进行中任务（去重合并，未新建 job） */
    add: (repositoryId: string, request: ScanRequest, options?: { priority?: number, runId?: string, reuse?: boolean }) => Promise<{ jobId: string, reused: boolean }>
    /**
     * 释放指定仓库的去重键（孤儿 run 收尾用）：移除 `scan-<repositoryId>` 的 job。
     * - job 不存在 → removed=false
     * - 传入 `expectedRunId` 且 job 归属其它 run（如用户已重新触发的新 run）→ 跳过（removed=false）
     * - job 被 worker 锁定（active 且锁未过期）→ BullMQ 拒绝移除，removed=false（不抛错）
     */
    remove: (repositoryId: string, expectedRunId?: string) => Promise<{ removed: boolean }>
    /**
     * 是否存在同仓库的非终态 job（waiting/active/delayed 等）：
     * pending run 的孤儿判定依据——真正排队 / 执行中的 run 不应被 stale cleanup 误杀。
     */
    hasLiveJob: (repositoryId: string) => Promise<boolean>
    /**
     * job 查询（stalled / lockRenewalFailed 事件补全 runId 用）：
     * 不存在 → undefined；只暴露 `data`（不泄漏 BullMQ Job 实例）。
     */
    getJob: (jobId: string) => Promise<{ data?: ScanJobData } | undefined>
    /** BullMQ job scheduler 透传：注册/更新定时调度（定时扫描能力） */
    upsertJobScheduler: (
        schedulerId: string,
        repeatOpts: { pattern: string, tz?: string },
        template: ScheduledJobTemplate,
    ) => Promise<void>
    /** BullMQ job scheduler 透传：注销定时调度 */
    removeJobScheduler: (schedulerId: string) => Promise<void>
    close: () => Promise<void>
}

/** BullMQ job 是否已达终态：仅 completed / failed 释放去重键（其余状态视为进行中） */
const isTerminalJobState = (state: string): boolean => state === 'completed' || state === 'failed'

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
                if (isTerminalJobState(state)) {
                    // 终态 job（BullMQ 6：EXISTS job key 即幂等返回，终态在清理前占用 jobId）：
                    // 先移除再重建，保证"扫描完成后可立即再次触发"
                    await existing.remove()
                } else {
                    // 等待/活跃/延迟中：去重合并（不新建 job），告知调用方复用
                    return { jobId, reused: true }
                }
            }
            await queue.add(SCAN_QUEUE_NAME, {
                repositoryId,
                request,
                runId: opts?.runId ?? '',
                reuse: opts?.reuse,
            }, {
                jobId,
                priority: opts?.priority ?? SCAN_JOB_PRIORITY.manual,
            })
            return { jobId, reused: false }
        },
        remove: async (repositoryId, expectedRunId) => {
            const existing = await queue.getJob(buildScanJobId(repositoryId))
            if (!existing) {
                return { removed: false }
            }
            // 归属收敛：job 可能已被用户重新触发替换为新 run 的 job（终态 job 在 add 时 remove 重建），
            // 仅释放归属本次孤儿 run 的 job，避免误删新触发任务的去重键
            if (expectedRunId && existing.data?.runId !== expectedRunId) {
                return { removed: false }
            }
            try {
                await existing.remove()
                return { removed: true }
            } catch (error) {
                // active 且被 worker 锁定：BullMQ removeJob 对 locked job 返回 0（remove() 抛错）。
                // 此时无法释放（worker 仍持有锁），交由 worker 正常收尾或锁过期后的下一轮处理。
                console.warn(`[scan-queue] 释放仓库 ${repositoryId} 队列 job 失败（可能被 worker 锁定）:`, error)
                return { removed: false }
            }
        },
        hasLiveJob: async (repositoryId) => {
            const existing = await queue.getJob(buildScanJobId(repositoryId))
            if (!existing) {
                return false
            }
            return !isTerminalJobState(await existing.getState())
        },
        getJob: async (jobId) => {
            const job = await queue.getJob(jobId)
            return job ? { data: job.data } : undefined
        },
        upsertJobScheduler: async (schedulerId, repeatOpts, template) => {
            // 模板 data 形状与 scan job 不同（scheduleId 而非 repositoryId），断言透传
            await queue.upsertJobScheduler(schedulerId, repeatOpts, template as never)
        },
        removeJobScheduler: async (schedulerId) => {
            await queue.removeJobScheduler(schedulerId)
        },
        close: async () => {
            await queue.close()
        },
    }
}
