import { defineNitroPlugin } from 'nitropack/runtime'
import { getQueueService } from '#server/services/queue/queue.service'
import { logger } from '#server/utils/logger'
import { isQueueWorkerProcess } from '#server/utils/process-role'

/**
 * 队列消费者启动插件（双进程形态的 worker 侧必需）。
 *
 * 背景（2026-10-31 运维实测）：队列服务是**惰性单例**，唯一会主动初始化它的是 `stale-cleanup`
 * 插件；而该插件按进程角色在 worker 侧被跳过（platform.md §10.6）。结果是默认容器部署
 * （`DEPENDFIX_QUEUE_WORKER=1` + `QUEUE_ENABLED=true`）里 **worker 进程从不初始化队列服务**，
 * 消费端始终不存在：扫描 run 一直 `pending`，job 停在 Redis 的 `prioritized` 里，
 * 直到 stale-cleanup 宽限期（2 × 5 分钟）把 run 判成 `orphan_run`。
 *
 * 本插件把「当前进程消费队列」这件事在启动阶段显式化：
 * - `inProcessWorker=true`（双进程形态的 worker、或单进程形态的 HTTP 进程）→ 初始化队列服务，
 *   从而创建 in-process worker 消费者；
 * - `inProcessWorker=false`（双进程形态的 HTTP 主进程）→ 不做任何事（该进程只是 producer，
 *   其队列连接仍按需惰性创建）。
 *
 * 失败处理：启动失败直接抛出（Nitro 启动失败 → 容器退出 → 入口按退避重启 worker），
 * 而不是静默留下一个没有消费者的队列——后者正是本次要消灭的故障形态。
 */

/** 消费端启动所需的最小配置面（便于单测注入，避免依赖 Nuxt 运行时） */
export interface QueueConsumerRuntimeConfig {
    inProcessWorker?: boolean
}

/** 可注入依赖（单测用；默认取真实实现） */
export interface QueueConsumerDeps {
    getQueueService?: typeof getQueueService
    log?: Pick<typeof logger, 'info' | 'error'>
    isWorkerProcess?: typeof isQueueWorkerProcess
}

/**
 * 按配置启动队列消费者。
 *
 * @returns 是否真正启动了消费端（`true` = async 模式下 in-process worker 已创建）
 */
export const startQueueConsumer = async (
    config: QueueConsumerRuntimeConfig,
    deps: QueueConsumerDeps = {},
): Promise<boolean> => {
    const resolveQueueService = deps.getQueueService ?? getQueueService
    const log = deps.log ?? logger
    const isWorkerProcess = deps.isWorkerProcess ?? isQueueWorkerProcess

    if (!config.inProcessWorker) {
        // 角色=worker 却未启用 IN_PROCESS_WORKER：配置错误，本进程没有消费者（正是要消灭的静默形态）
        if (isWorkerProcess()) {
            log.error('[queue] 队列 worker 进程未启用 IN_PROCESS_WORKER：本进程没有消费者，队列任务将无人消费')
            throw new Error('queue worker process started with inProcessWorker=false')
        }
        // 双进程形态的 HTTP 主进程：只做 producer，消费由 worker 进程承担
        return false
    }

    try {
        const service = await resolveQueueService()
        if (service.mode === 'async') {
            log.info('[queue] 消费者已就绪（IN_PROCESS_WORKER=true，当前进程消费扫描队列）')
            return true
        }
        // sync 模式（Redis 不可用 / 显式关闭 / auto 降级）无需消费者：任务在请求内同步执行
        log.info(`[queue] 未启动队列消费者（queue mode=${service.mode}，任务按同步路径执行）`)
        return false
    } catch (error) {
        log.error('[queue] 消费者启动失败：队列任务将无人消费', { error })
        throw error
    }
}

export default defineNitroPlugin(() => {
    const config = useRuntimeConfig()
    // 不阻塞监听：启动失败走 catch 分支。消费者缺失等价于「所有扫描任务挂起」，
    // 因此承担消费的进程（worker / 单进程）启动失败时显式退出，由入口看护按退避重启（懒重启而非静默降级）。
    void startQueueConsumer(config).catch(() => {
        if (config.inProcessWorker || isQueueWorkerProcess()) {
            process.exit(1)
        }
    })
})
