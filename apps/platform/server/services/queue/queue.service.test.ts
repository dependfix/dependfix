import 'reflect-metadata'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getQueueService } from './queue.service'

// 外部依赖 mock（真实 Redis/BullMQ 不可控）
const { createRedisClient, probeRedis, createScanQueue, createScanWorker } = vi.hoisted(() => ({
    createRedisClient: vi.fn(),
    probeRedis: vi.fn(),
    createScanQueue: vi.fn(),
    createScanWorker: vi.fn(),
}))
vi.mock('./redis', () => ({ createRedisClient, probeRedis }))
vi.mock('./scan-queue', () => ({ createScanQueue }))
vi.mock('./scan-worker', () => ({ createScanWorker }))

const QUEUE_GLOBAL_KEY = '__dependfix_queue_service__'

// Nuxt runtime config 注入
const stubConfig = (overrides: Record<string, unknown> = {}) => {
    vi.stubGlobal('useRuntimeConfig', () => ({
        queueEnabled: 'auto',
        redisUrl: 'redis://127.0.0.1:6379',
        queueJobRetries: undefined,
        queueBackoffMs: undefined,
        inProcessWorker: false,
        ...overrides,
    }))
}

// 清理 globalThis 单例（跨用例隔离）
const resetSingleton = () => {
    delete (globalThis as Record<string, unknown>)[QUEUE_GLOBAL_KEY]
}

describe('getQueueService', () => {
    beforeEach(() => {
        resetSingleton()
        vi.clearAllMocks()
        createRedisClient.mockReturnValue({ disconnect: vi.fn() })
        createScanQueue.mockReturnValue({ close: vi.fn(), add: vi.fn() })
        createScanWorker.mockReturnValue({ close: vi.fn() })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        resetSingleton()
    })

    it('caches the service instance across calls (singleton)', async () => {
        stubConfig({ queueEnabled: 'false' })
        probeRedis.mockResolvedValue({ available: false, reason: 'unreachable', version: null })
        const first = await getQueueService()
        const second = await getQueueService()
        expect(second).toBe(first)
    })

    it('falls back to sync mode without queue when Redis is unavailable', async () => {
        stubConfig({ queueEnabled: 'auto' })
        probeRedis.mockResolvedValue({ available: false, reason: 'unreachable', version: null })
        const service = await getQueueService()
        expect(service.mode).toBe('sync')
        expect(service.queue).toBeNull()
        expect(createScanQueue).not.toHaveBeenCalled()
        // close 为 noop，不触碰任何连接
        await expect(service.close()).resolves.toBeUndefined()
    })

    it('warns about failover when QUEUE_ENABLED=true but Redis is down', async () => {
        stubConfig({ queueEnabled: 'true' })
        probeRedis.mockResolvedValue({ available: false, reason: 'unreachable', version: null })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const service = await getQueueService()
        expect(service.mode).toBe('sync')
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('QUEUE_ENABLED=true'))
    })

    it('warns when Redis version is too old for BullMQ (>= 5.0)', async () => {
        stubConfig({ queueEnabled: 'auto' })
        probeRedis.mockResolvedValue({ available: false, reason: 'version_too_old', version: '3.0.0' })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const service = await getQueueService()
        expect(service.mode).toBe('sync')
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Redis 版本 3.0.0 低于 BullMQ'))
    })

    it('creates async queue without worker when in-process worker disabled', async () => {
        stubConfig({ queueEnabled: 'auto' })
        probeRedis.mockResolvedValue({ available: true, reason: null, version: '7.4.1' })
        const service = await getQueueService()
        expect(service.mode).toBe('async')
        expect(service.queue).not.toBeNull()
        expect(createScanQueue).toHaveBeenCalledWith(expect.anything(), { retriesRaw: undefined, backoffMsRaw: undefined })
        expect(createScanWorker).not.toHaveBeenCalled()
    })

    it('starts in-process worker when IN_PROCESS_WORKER=true', async () => {
        stubConfig({ queueEnabled: 'auto', inProcessWorker: true })
        probeRedis.mockResolvedValue({ available: true, reason: null, version: '7.4.1' })
        const service = await getQueueService()
        expect(service.mode).toBe('async')
        expect(createScanWorker).toHaveBeenCalledOnce()
    })

    it('close cleans up queue, worker and connections', async () => {
        stubConfig({ queueEnabled: 'auto', inProcessWorker: true })
        probeRedis.mockResolvedValue({ available: true, reason: null, version: '7.4.1' })
        const service = await getQueueService()
        await service.close()
        expect(createScanWorker.mock.results[0]?.value.close).toHaveBeenCalled()
        expect(createScanQueue.mock.results[0]?.value.close).toHaveBeenCalled()
    })
})
