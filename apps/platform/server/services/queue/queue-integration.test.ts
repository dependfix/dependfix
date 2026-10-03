/**
 * 扫描队列真实 Redis 集成测试（进程内执行，无后台服务进程）。
 * 启用条件：TEMP_REDIS_INTEGRATION=true 且本地 Redis >= 5.0 可达（CI 无 Redis 自动 skip）。
 * 覆盖队列验收项：入队 → worker 消费闭环、jobId 去重、终态重建、无冒号限制。
 */
import { describe, expect, it } from 'vitest'
import { Queue } from 'bullmq'
import { createRedisClient, probeRedis } from './redis'
import { createScanQueue, SCAN_QUEUE_NAME } from './scan-queue'
import { createScanWorker } from './scan-worker'

const REDIS_URL = 'redis://127.0.0.1:6379'

const enabled = process.env.TEMP_REDIS_INTEGRATION === 'true'

/** 等待条件成立（轮询间隔 50ms，超时抛错） */
const waitFor = async (fn: () => Promise<boolean>, timeoutMs = 10_000, label = 'condition'): Promise<void> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
        if (await fn()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, 50))
    }
    throw new Error(`waitFor timeout: ${label}`)
}

describe.skipIf(!enabled)('scan queue real-redis integration', () => {
    it('前置：Redis 探测通过（>= 5.0）', async () => {
        const client = createRedisClient(REDIS_URL, { maxRetries: 2 })
        const result = await probeRedis(client)
        expect(result.available).toBe(true)
        expect(result.version).toBeTruthy()
        console.log(`[integration] Redis ${result.version} 探测通过`)
    }, 15_000)

    it('入队 → worker 消费闭环（mock processor 收到 job 数据）', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const workerConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        const received: unknown[] = []
        const worker = createScanWorker(workerConnection, {
            processor: async (data) => {
                received.push(data)
                return { ok: true }
            },
        })

        const result = await queue.add('integration-repo-1', {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: 'integration-run-1' })
        expect(result.reused).toBe(false)
        expect(result.jobId).toBe('scan-integration-repo-1')
        expect(result.jobId).not.toContain(':')

        // worker 应消费 job 并调用 processor
        await waitFor(() => Promise.resolve(received.length === 1), 10_000, 'processor invoked')

        expect(received[0]).toMatchObject({
            repositoryId: 'integration-repo-1',
            runId: 'integration-run-1',
        })

        await worker.close()
        await queue.close()
        queueConnection.disconnect()
        workerConnection.disconnect()
    }, 20_000)

    it('jobId 去重：同仓库等待中重复入队返回 reused', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        // 随机 repoId：避免重复运行测试时命中上次残留 waiting job（幂等，e2e 同款设计）
        const repoId = `integration-repo-2-${Date.now()}`
        // 第一个 job 入队（无 worker 消费，保持 waiting）
        const first = await queue.add(repoId, {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: `integration-run-2-${Date.now()}` })
        expect(first.reused).toBe(false)

        // 第二次入队：等待中 → 去重合并
        const second = await queue.add(repoId, {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: `integration-run-2b-${Date.now()}` })
        expect(second.reused).toBe(true)

        await queue.close()
        queueConnection.disconnect()
    }, 15_000)

    it('孤儿 job 释放：remove 按归属校验后释放去重键，hasLiveJob 状态同步', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        const repoId = `integration-repo-4-${Date.now()}`
        const firstRunId = `integration-run-4-${Date.now()}`
        // 无 worker 消费 → job 保持 waiting（模拟孤儿占用去重键）
        const first = await queue.add(repoId, {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: firstRunId })
        expect(first.reused).toBe(false)
        expect(await queue.hasLiveJob(repoId)).toBe(true)

        // 归属校验：expectedRunId 不匹配（同仓库已换成新 run 的 job）→ 不误删
        await expect(queue.remove(repoId, 'other-run-id')).resolves.toEqual({ removed: false })
        expect(await queue.hasLiveJob(repoId)).toBe(true)

        // 归属匹配 → 释放去重键，重新触发可创建新 job（不再被 SCAN_PENDING_MERGED 合并）
        await expect(queue.remove(repoId, firstRunId)).resolves.toEqual({ removed: true })
        expect(await queue.hasLiveJob(repoId)).toBe(false)
        const secondRunId = `integration-run-4b-${Date.now()}`
        const second = await queue.add(repoId, {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: secondRunId })
        expect(second.reused).toBe(false)

        await queue.remove(repoId, secondRunId)
        await queue.close()
        queueConnection.disconnect()
    }, 15_000)

    it('active job 被 worker 锁定 → remove 返回 removed=false（不抛错，交由 worker 收尾）', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const workerConnection = createRedisClient(REDIS_URL)
        const inspectorConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        const inspector = new Queue(SCAN_QUEUE_NAME, { connection: inspectorConnection })
        const repoId = `integration-repo-5-${Date.now()}`
        let releaseGate!: () => void
        const gate = new Promise<void>((resolve) => {
            releaseGate = resolve
        })
        const worker = createScanWorker(workerConnection, {
            processor: async (data) => {
                // 仅阻塞本用例的 job；前面用例可能残留 waiting job，避免被 gate 卡住
                if ('repositoryId' in data && data.repositoryId === repoId) {
                    await gate
                }
                return { ok: true }
            },
        })

        try {
            const result = await queue.add(repoId, {
                mode: 'report-only',
                severityThreshold: 'high',
            }, { runId: `integration-run-5-${Date.now()}` })
            expect(result.reused).toBe(false)

            // 等 worker 真正拿到锁（active）
            await waitFor(async () => {
                const job = await inspector.getJob(result.jobId)
                return (await job?.getState()) === 'active'
            }, 10_000, 'job active')
            expect(await queue.hasLiveJob(repoId)).toBe(true)

            // active 且锁定 → BullMQ 拒绝 remove，wrapper 吞错返回 removed=false
            await expect(queue.remove(repoId)).resolves.toEqual({ removed: false })
        } finally {
            // 无论断言成败都释放 processor 并关闭连接，避免残留 active job 污染后续运行
            releaseGate()
            await worker.close()
            await inspector.close()
            await queue.close()
            queueConnection.disconnect()
            workerConnection.disconnect()
            inspectorConnection.disconnect()
        }
    }, 20_000)

    it('终态重建：完成后再次触发返回新 job（reused=false，可立即重新扫描）', async () => {
        const queueConnection = createRedisClient(REDIS_URL)
        const workerConnection = createRedisClient(REDIS_URL)
        const queue = createScanQueue(queueConnection, {})
        const worker = createScanWorker(workerConnection, {
            processor: async () => ({ ok: true }),
        })

        const first = await queue.add('integration-repo-3', {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: 'integration-run-3' })
        expect(first.reused).toBe(false)

        // 等 worker 消费完成（job 进入 completed；add 内部 getJob 检测终态需要 job 状态落盘）
        await new Promise((resolve) => setTimeout(resolve, 1_000))

        // 终态后再次触发 → 检测终态 → remove 重建 → reused=false（可立即重新扫描）
        const second = await queue.add('integration-repo-3', {
            mode: 'report-only',
            severityThreshold: 'high',
        }, { runId: 'integration-run-3b' })
        expect(second.reused).toBe(false)

        await worker.close()
        await queue.close()
        queueConnection.disconnect()
        workerConnection.disconnect()
    }, 20_000)
})
