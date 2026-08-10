/**
 * Redis 连接封装（BullMQ 基础设施）。
 * lazyConnect + maxRetriesPerRequest: null（BullMQ 要求，避免 worker 因连接重试卡死）。
 * probeRedis 用于队列模式探测（ping + 版本校验，QUEUE_ENABLED=auto 时决定 async/sync 降级）。
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

/** BullMQ 6 最低 Redis 版本要求（旧版本 add 会挂起而非报错） */
const MIN_REDIS_VERSION = 5.0

export interface RedisProbeResult {
    /** Redis 可用且版本满足 BullMQ 要求（>= 5.0） */
    available: boolean
    /** 探测到的 Redis 版本（INFO server 解析；不可用时 null） */
    version: string | null
    /** 不可用原因（版本不足 / 连接失败 / 超时），供 warn 日志 */
    reason?: 'version_too_old' | 'connect_failed' | 'timeout'
}

/**
 * Redis 探测：ping + 版本校验。
 * BullMQ 6 要求 Redis >= 5.0：仅 ping 通过但版本过低时，queue.add 会挂起而非报错
 * （版本检查在 add 路径内）——探测必须一并校验版本，不满足即判不可用（降级 sync）。
 * 超时兜底（5s）：ioredis 默认 retryStrategy 无限重试时 ping 命令在 offline queue 排队
 * 不 resolve 不 reject——无超时则无 Redis 环境下探测永久挂起、降级失效。
 */
export const probeRedis = async (client: Redis): Promise<RedisProbeResult> => {
    const timeout = new Promise<RedisProbeResult>((resolve) => {
        setTimeout(() => {
            resolve({ available: false, version: null, reason: 'timeout' })
        }, PING_TIMEOUT_MS)
    })
    try {
        const result = await Promise.race([
            (async () => {
                await client.ping()
                // INFO server 解析 redis_version（旧命令 ping 通过但版本可能不满足 BullMQ）
                const info = await client.info('server')
                const match = /redis_version:([0-9.]+)/.exec(info)
                const version = match?.[1] ?? null
                if (!version) {
                    return { available: false, version: null, reason: 'connect_failed' as const }
                }
                const major = Number(version.split('.')[0])
                if (Number.isNaN(major) || major < MIN_REDIS_VERSION) {
                    return { available: false, version, reason: 'version_too_old' as const }
                }
                return { available: true, version }
            })(),
            timeout,
        ])
        return result
    } catch {
        return { available: false, version: null, reason: 'connect_failed' }
    } finally {
        // 探测完成（含超时）：关闭连接，避免句柄泄漏与重连风暴
        client.disconnect()
    }
}
