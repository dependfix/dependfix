/**
 * Redis 连接封装（BullMQ 基础设施）。
 * lazyConnect + maxRetriesPerRequest: null（BullMQ 要求，避免 worker 因连接重试卡死）。
 * pingRedis 用于队列模式探测（QUEUE_ENABLED=auto 时决定 async/sync 降级）。
 */
import Redis from 'ioredis'

/** BullMQ 兼容的 Redis 连接（lazyConnect：不自动重连风暴；maxRetriesPerRequest null 为 BullMQ 必需） */
export const createRedisClient = (url: string, options?: { maxRetries?: number }): Redis => {
    const client = new Redis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        // 连接失败快速失败（探测与 failover 需要及时返回，避免启动/入队长时间挂起）
        connectTimeout: 3_000,
        retryStrategy: (times) => {
            if (options?.maxRetries && times > options.maxRetries) {
                return null
            }
            return Math.min(times * 200, 2_000)
        },
    })
    // 注册 error 监听：无监听时 ioredis 在重试期间打印 Unhandled error 刷屏，
    // 且 Node EventEmitter 未处理 error 存在进程崩溃面（连接错误已由 retryStrategy 兜底）
    client.on('error', () => { /* 连接错误由 retryStrategy 处理，静默避免刷屏 */ })
    return client
}

const PING_TIMEOUT_MS = 5_000

/**
 * ping 探测：返回 Redis 是否可用。
 * 超时兜底（5s）：ioredis 默认 retryStrategy 无限重试时 ping 命令在 offline queue 排队
 * 不 resolve 不 reject——无超时则无 Redis 环境下探测永久挂起、降级失效。
 */
export const pingRedis = async (client: Redis): Promise<boolean> => {
    const timeout = new Promise<boolean>((resolve) => {
        setTimeout(() => {
            resolve(false)
        }, PING_TIMEOUT_MS)
    })
    try {
        const result = await Promise.race([
            client.ping(),
            timeout,
        ])
        return result === 'PONG'
    } catch {
        return false
    } finally {
        // 探测完成（含超时）：关闭连接，避免句柄泄漏与重连风暴
        client.disconnect()
    }
}
