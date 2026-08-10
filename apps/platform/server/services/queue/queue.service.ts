/**
 * 队列服务单例（惰性初始化）。
 * 职责：Redis 探测 → 队列模式决策（async/sync 降级矩阵）→ 创建 ScanQueue（async 时）。
 * 入队失败 failover：上层 catch 后同步直调（可用性优先，见 scan.post.ts）。
 * in-process worker 接线点：IN_PROCESS_WORKER=true 且 async 模式时创建（单容器部署形态）。
 */
import type { Redis } from 'ioredis'
import { createRedisClient, probeRedis } from './redis'
import { createScanQueue, type ScanQueue } from './scan-queue'
import { createScanWorker, type ScanWorker } from './scan-worker'
import { parseQueueEnabled, resolveQueueMode, type QueueMode } from './queue-mode'

export interface QueueService {
    mode: QueueMode
    queue: ScanQueue | null
    close: () => Promise<void>
}

const GLOBAL_QUEUE_KEY = '__dependfix_queue_service__'

interface QueueGlobal {
    [GLOBAL_QUEUE_KEY]?: QueueService | null
}

const getGlobalScope = (): QueueGlobal => globalThis as QueueGlobal

/** 惰性单例：首次调用时探测 Redis 并决定模式（后续复用；探测连接与队列连接分离） */
export const getQueueService = async (): Promise<QueueService> => {
    const scope = getGlobalScope()
    if (scope[GLOBAL_QUEUE_KEY]) {
        return scope[GLOBAL_QUEUE_KEY]!
    }

    const config = useRuntimeConfig()
    const enabled = parseQueueEnabled(config.queueEnabled)

    // 探测专用连接（探测后断开，不污染队列连接）；探测含 BullMQ 版本要求校验（>= 5.0）
    const probeClient = createRedisClient(config.redisUrl, { maxRetries: 2 })
    const probe = await probeRedis(probeClient)
    const redisAvailable = probe.available
    const mode = resolveQueueMode({ enabled, redisAvailable })

    if (mode === 'sync') {
        console.info(`[queue] 同步模式（queueEnabled=${enabled}，Redis ${redisAvailable ? '可用' : '不可用'}${probe.reason === 'version_too_old' ? `，版本 ${probe.version} 低于 5.0` : ''}）`)
        if (enabled === 'true' && !redisAvailable) {
            console.warn(`[queue] QUEUE_ENABLED=true 但 Redis 不可用，降级同步执行（failover）：${probe.reason === 'version_too_old' ? `Redis 版本 ${probe.version} 低于 BullMQ 要求的 5.0` : probe.reason}`)
        } else if (probe.reason === 'version_too_old') {
            console.warn(`[queue] Redis 版本 ${probe.version} 低于 BullMQ 要求的 5.0，降级同步执行（可用性优先）`)
        }
        // 同步模式：不创建队列（探测连接已在 probeRedis 内断开）
        scope[GLOBAL_QUEUE_KEY] = {
            mode,
            queue: null,
            // 无队列/worker 资源，close 为 noop（保持 QueueService 接口一致）
            close: async () => {
                await Promise.resolve()
            },
        }
        return scope[GLOBAL_QUEUE_KEY]!
    }

    // async 模式：队列连接（与探测连接分离；BullMQ 自管重连）
    console.info(`[queue] 异步模式（queueEnabled=${enabled}，Redis ${probe.version ?? '未知版本'}）`)
    const queueConnection = createRedisClient(config.redisUrl)
    const queue = createScanQueue(queueConnection, {
        retriesRaw: config.queueJobRetries,
        backoffMsRaw: config.queueBackoffMs,
    })

    // in-process worker（单容器部署形态）：IN_PROCESS_WORKER=true 时同进程消费。
    // 注意：Worker 必须使用独立 Redis 连接——worker 的阻塞命令（BLPOP）与 Queue 共享
    // 连接会互相阻塞（BullMQ 官方要求 queue/worker 连接分离）。
    let worker: ScanWorker | null = null
    let workerConnection: Redis | null = null
    if (config.inProcessWorker) {
        workerConnection = createRedisClient(config.redisUrl)
        worker = createScanWorker(workerConnection)
        console.info('[queue] IN_PROCESS_WORKER=true，当前进程消费扫描队列')
    }

    scope[GLOBAL_QUEUE_KEY] = {
        mode,
        queue,
        close: async () => {
            await worker?.close()
            await queue.close()
            // worker.close() 不关闭外部传入连接，需显式断开
            workerConnection?.disconnect()
            queueConnection.disconnect()
        },
    }
    return scope[GLOBAL_QUEUE_KEY]!
}
