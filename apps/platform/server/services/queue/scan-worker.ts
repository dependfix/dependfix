/**
 * 扫描任务 Worker（BullMQ Worker 封装）。
 * 默认 processor 按 job.name 分发：
 * - 'scan'（SCAN_QUEUE_NAME）：单仓库扫描，复用 runScanForRepository（续用 API 预创建的 pending run）
 * - 'scheduled-scan'（SCHEDULED_JOB_NAME）：定时计划到点（BullMQ job scheduler 产生）→ triggerSchedule
 *   （解析仓库列表 → 创建 BatchRun → 逐仓库入队），async 窗口期闭环
 * 并发控制：同仓库由 jobId 去重保证（同一仓库同时一个 job）；不同仓库按 concurrency 并发
 * （默认 1 保守——容器执行器按 runId 隔离 workDir，跨仓库并发安全；env 可调）。
 * 锁参数与事件观测：显式 lockDuration / lockRenewTime（见 SCAN_WORKER_LOCK_OPTIONS），并注册
 * stalled / lockRenewalFailed / error 事件输出结构化日志——把「静默锁过期」变为可告警事件
 * （口径见 docs/standards/platform.md §10.5）。
 */
import { Worker } from 'bullmq'
import type { Redis } from 'ioredis'
import { DEFAULT_EXECUTION_TIMEOUT_MS } from '../executor/container-executor'
import { runScanForRepository } from '../scan-orchestrator.service'
import { SCHEDULED_JOB_NAME, triggerSchedule } from '../scheduler/scheduler.service'
import { SCAN_QUEUE_NAME, type ScanJobData } from './scan-queue'
import { sanitizeString } from '#server/utils/sanitize'

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

/**
 * Worker 锁参数（显式化 BullMQ 隐式默认，见 docs/standards/platform.md §10.5）。
 *
 * - `lockDuration`：BullMQ 默认 30 秒 → 提升至容器执行器默认单次执行超时
 *   （`DEFAULT_EXECUTION_TIMEOUT_MS`，30 分钟），使锁在整个执行窗口内不因主线程
 *   event loop 被引擎同步子进程调用占满（续期定时器延后）而过期。
 * - `lockRenewTime`：保持 lockDuration 的一半（BullMQ 官方推荐值）；LockManager 以
 *   `lockRenewTime / 2` 为周期扫描并续期。
 *
 * **已知边界**：真崩溃 / 容器重启时 stalled 检测窗口由 30 秒拉长至 30 分钟（恢复变慢）；
 * 若仓库级执行超时被配置为超过该默认值，锁可能在执行完成前过期——须同步调整本值。
 */
export const SCAN_WORKER_LOCK_OPTIONS = {
    lockDuration: DEFAULT_EXECUTION_TIMEOUT_MS,
    lockRenewTime: DEFAULT_EXECUTION_TIMEOUT_MS / 2,
} as const

/** job 查询签名（补全 runId 用）：Worker 不暴露 getJob，由 queue.service 注入 queue.getJob */
export type ScanWorkerJobLookup = (jobId: string) => Promise<{ data?: { runId?: string } } | undefined>

/** 事件日志载荷（结构化输出，便于日志聚合按 `event` 分类与去重） */
export interface ScanWorkerEventLog {
    event: 'stalled' | 'lockRenewalFailed' | 'error'
    jobId?: string
    /** 已解析的 runId；`null` = 已尝试解析但未得（无 getJob / 查询失败 / job 无 runId） */
    runId?: string | null
    prev?: string
    jobIds?: string[]
    /** 已解析到 runId 的子集（查询失败 / 无 runId 的项被过滤） */
    runIds?: string[]
    message?: string
    /** 同根因去重标记：续期失败 error 与 lockRenewalFailed 为同一事件的两条信号 */
    duplicateOf?: 'lockRenewalFailed'
}

/** 续期失败 error 的 message 前缀（BullMQ LockManager 固定格式，见 bullmq lock-manager.js） */
export const LOCK_RENEWAL_ERROR_PREFIX = 'could not renew lock for job '

/**
 * 由 jobId 解析 runId。
 * 查询失败 / 未注入 getJob / job 无 runId 一律降级 undefined——事件日志优先于 runId 补全，
 * 不得因查询异常吞掉告警。
 */
const resolveRunId = async (
    getJob: ScanWorkerJobLookup | undefined,
    jobId: string,
): Promise<string | undefined> => {
    if (!getJob) {
        return undefined
    }
    try {
        const job = await getJob(jobId)
        return job?.data?.runId || undefined
    } catch {
        return undefined
    }
}

/** stalled 事件处理（导出便于单测）：job 被移回 waiting，存在重复执行风险 */
export const handleStalledEvent = async (
    getJob: ScanWorkerJobLookup | undefined,
    jobId: string,
    prev: string,
): Promise<void> => {
    const runId = await resolveRunId(getJob, jobId)
    // runId 未解析时显式 null（而非省略字段）：区分「已尝试解析但未得」与「无此字段」
    const payload: ScanWorkerEventLog = { event: 'stalled', jobId, prev, runId: runId ?? null }
    console.warn(`[scan-worker] ${JSON.stringify(payload)}`)
}

/** lockRenewalFailed 事件处理（导出便于单测）：`could not renew lock` 的精确结构化信号 */
export const handleLockRenewalFailedEvent = async (
    getJob: ScanWorkerJobLookup | undefined,
    jobIds: string[],
): Promise<void> => {
    const resolved = await Promise.all(jobIds.map(async (jobId) => await resolveRunId(getJob, jobId)))
    const payload: ScanWorkerEventLog = {
        event: 'lockRenewalFailed',
        jobIds,
        runIds: resolved.filter((runId): runId is string => Boolean(runId)),
    }
    console.warn(`[scan-worker] ${JSON.stringify(payload)}`)
}

/**
 * error 事件处理（导出便于单测）。
 *
 * 注意：BullMQ LockManager 续期失败时**同时** emit `lockRenewalFailed` 与 `error`
 * （message 形如 `could not renew lock for job <jobId>`）——同一根因两条信号。
 * 此处对续期类 error 标注 `duplicateOf`，供日志聚合去重，不丢失原始信息。
 */
export const handleWorkerError = (error: Error): void => {
    const isLockRenewalError = error.message.startsWith(LOCK_RENEWAL_ERROR_PREFIX)
    const payload: ScanWorkerEventLog = {
        event: 'error',
        message: sanitizeString(error.message),
        ...(isLockRenewalError ? { duplicateOf: 'lockRenewalFailed' as const } : {}),
    }
    console.error(`[scan-worker] ${JSON.stringify(payload)}`)
}

export interface ScanWorkerOptions {
    concurrency?: number
    processor?: ScanJobProcessor
    /** stalled / lockRenewalFailed 事件补全 runId 的 job 查询（缺省时日志的 runId 为 undefined） */
    getJob?: ScanWorkerJobLookup
}

export const createScanWorker = (
    connection: Redis,
    options?: ScanWorkerOptions,
): ScanWorker => {
    const worker = new Worker<ScanWorkerJobData>(SCAN_QUEUE_NAME, async (job) => {
        const processor = options?.processor ?? defaultProcessor
        return processor(job.data, job.name)
    }, {
        connection,
        concurrency: options?.concurrency ?? 1,
        ...SCAN_WORKER_LOCK_OPTIONS,
    })

    // 锁问题可观测性：静默锁过期 / 续期失败 → 结构化告警事件（口径见 platform.md §10.5）
    worker.on('stalled', (jobId, prev) => {
        void handleStalledEvent(options?.getJob, jobId, prev)
    })
    worker.on('lockRenewalFailed', (jobIds) => {
        void handleLockRenewalFailedEvent(options?.getJob, jobIds)
    })
    worker.on('error', (error) => {
        handleWorkerError(error)
    })

    return {
        close: async () => {
            await worker.close()
        },
    }
}
