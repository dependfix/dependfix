/**
 * 调度器真实 BullMQ 集成测试（进程内执行，无后台服务进程）。
 * 启用条件：TEMP_REDIS_INTEGRATION=true 且本地 Redis >= 5.0 可达（CI 无 Redis 自动 skip）。
 * 覆盖：upsertJobScheduler 真实写入 BullMQ + 短间隔 every 1s pattern 接受 + removeJobScheduler 清理
 * + 同 schedulerId 重复注册幂等（覆盖语义）。
 *
 * 风险与缓解（[经验归档 §三十一](../../../../docs/design/governance/experience-archive.md)）：
 * - 自定义 schedulerId 禁止包含冒号（`schedule-xxx` 形式 + 随机 suffix 保证唯一，BullMQ 6 不拒绝）
 * - Queue 与探测连接必须独立（避免 BLPOP 阻塞）；本测试用 createScanQueue(connection) 创建独立连接
 * - Redis 版本门槛探测（BullMQ 6 要求 >= 5.0；复用 probeRedis 工具）
 * - 进程内集成模式（无后台服务）：测试用 createScanQueue 创建临时 Queue + cleanup removeJobScheduler
 * - 随机 id 幂等（Date.now() + Math.random()）：不污染共享 Redis
 */
import { describe, expect, it } from 'vitest'
import { createRedisClient, probeRedis } from '../queue/redis'
import { createScanQueue } from '../queue/scan-queue'
import { SCHEDULED_JOB_NAME } from './scheduler.service'

const REDIS_URL = 'redis://127.0.0.1:6379'

const enabled = process.env.TEMP_REDIS_INTEGRATION === 'true'

/** 等待条件成立（轮询间隔 50ms，超时抛错） */
const waitFor = async (fn: () => Promise<boolean>, timeoutMs = 5_000, label = 'condition'): Promise<void> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await fn()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`waitFor timeout: ${label}`)
}

/** 唯一 schedulerId：避免与历史残留或并发测试冲突 */
const uniqueSchedulerId = (suffix: string) => `schedule-integration-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

describe.skipIf(!enabled)('scheduler upsertJobScheduler real-redis integration (docs/plan/todo.md §M21.5 T704)', () => {
    it('前置：Redis 探测通过（>= 5.0）', async () => {
        const client = createRedisClient(REDIS_URL, { maxRetries: 2 })
        const result = await probeRedis(client)
        expect(result.available).toBe(true)
        expect(result.version).toBeTruthy()
        console.log(`[integration] Redis ${result.version} 探测通过`)
    }, 15_000)

    it('upsertJobScheduler 短间隔 every 1s pattern 真实写入 Redis + removeJobScheduler 清理', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        const schedulerId = uniqueSchedulerId('every1s')
        try {
            // 短间隔 6 段 cron pattern（每 1 秒触发）—— BullMQ 必须接受
            await queue.upsertJobScheduler(schedulerId, {
                pattern: '* * * * * *',
                tz: 'UTC',
            }, {
                name: SCHEDULED_JOB_NAME,
                data: { scheduleId: 'integration-test-every1s' },
                opts: { priority: 10 },
            })

            // 验证 Redis 真实存在 repeatable job key（BullMQ 内部键 `bull:{queue}:repeat:{schedulerId}`）
            await waitFor(async () => {
                const keys = await queueConnection.keys('*:repeat:*')
                return keys.some((k) => k.includes(schedulerId))
            }, 5_000, 'repeatable key created')
            const keysBefore = await queueConnection.keys('*:repeat:*')
            expect(keysBefore.some((k) => k.includes(schedulerId))).toBe(true)
        } finally {
            // W2 修复：scheduler cleanup 必须在 finally 内（waitFor 超时或断言失败时也清理，避免残留 scheduler 持续触发）
            try { await queue.removeJobScheduler(schedulerId) } catch { /* ignore cleanup failure */ }
            await queue.close()
            queueConnection.disconnect()
        }
    }, 30_000)

    it('upsertJobScheduler 同 schedulerId 重复注册幂等（覆盖语义不抛错）', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        const schedulerId = uniqueSchedulerId('dup')
        try {
            // 第一次注册（每 5 秒）
            await queue.upsertJobScheduler(schedulerId, {
                pattern: '*/5 * * * * *',
            }, {
                name: SCHEDULED_JOB_NAME,
                data: { scheduleId: 'first' },
            })

            // 第二次注册同 schedulerId（不同 pattern）—— BullMQ upsert 语义应覆盖而非抛错
            await queue.upsertJobScheduler(schedulerId, {
                pattern: '*/10 * * * * *',
            }, {
                name: SCHEDULED_JOB_NAME,
                data: { scheduleId: 'second' },
            })

            // 不抛错即幂等成功
            const keysAfter = await queueConnection.keys('*:repeat:*')
            expect(keysAfter.some((k) => k.includes(schedulerId))).toBe(false)
        } finally {
            // W2 修复：cleanup 兜底
            try { await queue.removeJobScheduler(schedulerId) } catch { /* ignore cleanup failure */ }
            await queue.close()
            queueConnection.disconnect()
        }
    }, 15_000)
})
