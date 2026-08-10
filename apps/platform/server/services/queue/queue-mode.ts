/**
 * 队列模式决策（渐进式降级，决策见 docs/plan/todo.md §T702 实现决策 D2/D3）。
 *
 * 降级矩阵：
 * - async：Redis 可用 → BullMQ 队列异步执行（worker 独立进程或 in-process）
 * - sync：Redis 不可用 / QUEUE_ENABLED=false → 直调 runScanForRepository（既有同步模型）
 *
 * 语义：QUEUE_ENABLED=auto（默认）时 Redis 可用即异步；显式 true 但 Redis 不可用时
 * 降级同步 + warn（可用性优先，failover 而非抛错）；显式 false 强制同步。
 */

export type QueueMode = 'async' | 'sync'

export type QueueEnabled = 'auto' | 'true' | 'false'

export interface QueueModeInput {
    /** QUEUE_ENABLED env 值（auto 缺省） */
    enabled: QueueEnabled
    /** Redis ping 探测结果 */
    redisAvailable: boolean
}

export const resolveQueueMode = (input: QueueModeInput): QueueMode => {
    if (input.enabled === 'false') {
        return 'sync'
    }
    if (input.enabled === 'true' && !input.redisAvailable) {
        // 显式启用但 Redis 不可用：降级同步（可用性优先），上层负责 warn
        return 'sync'
    }
    return input.redisAvailable ? 'async' : 'sync'
}

/** QUEUE_ENABLED env 解析（非法值回退 auto） */
export const parseQueueEnabled = (raw: string | undefined): QueueEnabled => {
    if (raw === 'true' || raw === 'false' || raw === 'auto') {
        return raw
    }
    return 'auto'
}

/**
 * 入队参数 → jobId（去重键）：同仓库同时只有一个未完成扫描任务。
 * 注意：BullMQ 6 自定义 jobId 禁止包含冒号（Redis key 分隔符）——使用 `scan-` 前缀而非 `scan:`。
 */
export const buildScanJobId = (repositoryId: string): string => `scan-${repositoryId}`

/** 扫描任务优先级（手动 > webhook > 定时；webhook/定时为后续调度任务预留） */
export const SCAN_JOB_PRIORITY = {
    manual: 1,
    webhook: 5,
    scheduled: 10,
} as const

/** 重试配置解析（env 可配；指数退避默认 5s 起，最多 30s） */
export interface RetryConfig {
    attempts: number
    backoffMs: number
}

export const parseRetryConfig = (options: {
    retriesRaw?: string
    backoffMsRaw?: string
}): RetryConfig => {
    // 空串/空白（env 未设置常见形态）回退默认：Number('') === 0 陷阱（会被误解析为"不重试"）
    const retriesRaw = options.retriesRaw?.trim()
    const backoffMsRaw = options.backoffMsRaw?.trim()
    const retries = Number(retriesRaw)
    const backoffMs = Number(backoffMsRaw)
    return {
        attempts: retriesRaw && Number.isInteger(retries) && retries >= 0 ? retries : 3,
        backoffMs: backoffMsRaw && Number.isInteger(backoffMs) && backoffMs > 0 ? backoffMs : 5_000,
    }
}
