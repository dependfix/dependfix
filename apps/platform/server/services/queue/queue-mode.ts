/**
 * 队列模式决策（渐进式降级，决策见 docs/plan/todo.md §T702 实现决策 D2/D3）。
 *
 * 降级矩阵（含消费者维度）：
 * - async：Redis 可用且存在消费者 → BullMQ 队列异步执行。消费者有两种形态：进程内 worker
 *   （IN_PROCESS_WORKER=true，单进程部署）或独立 worker 进程（容器部署经 DEPENDFIX_QUEUE_WORKER=1
 *   由入口启动，见 docs/standards/platform.md §10.6）。
 * - sync：Redis 不可用 / QUEUE_ENABLED=false / auto 且本进程不消费队列 →
 *   直调 runScanForRepository（既有同步模型）。
 *
 * 语义：
 * - QUEUE_ENABLED=auto（默认）：Redis 可用且本进程消费队列才异步；否则同步——含「无消费者自动降级」，
 *   避免「入队后无人消费」的静默挂起（job 永远 waiting → 30 分钟后被判孤儿）。
 * - QUEUE_ENABLED=true：显式强制异步（为多容器外部 worker 拓扑预留）；Redis 不可用时降级同步 + warn。
 * - QUEUE_ENABLED=false：强制同步。
 */

import { parseDurationMs } from '@dependfix/core'

export type QueueMode = 'async' | 'sync'

export type QueueEnabled = 'auto' | 'true' | 'false'

export interface QueueModeInput {
    /** QUEUE_ENABLED env 值（auto 缺省） */
    enabled: QueueEnabled
    /** Redis ping 探测结果 */
    redisAvailable: boolean
    /**
     * 本进程是否消费队列（IN_PROCESS_WORKER=true → 创建进程内 worker）。
     * auto 模式下作为「消费者可用性」判据：无消费者时降级 sync，避免 async 队列无人消费的静默挂起。
     * 消费者形态：进程内 worker（单进程部署）或独立 worker 进程（DEPENDFIX_QUEUE_WORKER=1，见 platform.md §10.6）。
     */
    inProcessWorker: boolean
}

export const resolveQueueMode = (input: QueueModeInput): QueueMode => {
    if (input.enabled === 'false') {
        return 'sync'
    }
    // Redis 不可用：无论 auto / 显式 true 一律降级同步（可用性优先；显式 true 由上层额外 warn）
    if (!input.redisAvailable) {
        return 'sync'
    }
    // Redis 可用：auto 仅在本进程消费队列时异步；无消费者时降级同步
    // （否则入队后无人消费 → job 永远 waiting → 静默挂起）
    if (input.enabled === 'auto' && !input.inProcessWorker) {
        return 'sync'
    }
    return 'async'
}

/**
 * QUEUE_ENABLED env 解析（非法值回退 auto）。
 * 注意：runtimeConfig 运行时覆盖（NUXT_QUEUE_ENABLED）经 destr 解析为布尔值，
 * 与构建期烘焙的字符串形态并存——必须同时处理 string 与 boolean（e2e 批量扫描
 * 闭环时暴露：只认字符串时布尔 false 掉进默认分支 → 强制同步失效 → 本地 Redis 可达时走 async 挂起）。
 */
export const parseQueueEnabled = (raw: string | boolean | undefined): QueueEnabled => {
    if (raw === true) {
        return 'true'
    }
    if (raw === false) {
        return 'false'
    }
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

/** 环境值归一：NUXT_ 运行时覆盖可能把纯数字解析成 number，统一转回字符串再解析。 */
const normalizeRaw = (value: string | number | undefined): string | undefined =>
    typeof value === 'number' ? String(value) : value?.trim()

export const parseRetryConfig = (options: {
    retriesRaw?: string | number
    backoffMsRaw?: string | number
}): RetryConfig => {
    // 空串/空白（env 未设置常见形态）回退默认：Number('') === 0 陷阱（会被误解析为"不重试"）
    const retriesRaw = normalizeRaw(options.retriesRaw)
    const backoffMsRaw = normalizeRaw(options.backoffMsRaw)
    const retries = Number(retriesRaw)
    return {
        attempts: retriesRaw && Number.isInteger(retries) && retries >= 0 ? retries : 3,
        // 时长支持 5000 / 5s / 1m；非法 / 非正数回退 5 秒
        backoffMs: parseDurationMs(backoffMsRaw, { defaultUnit: 'ms' }) ?? 5_000,
    }
}
