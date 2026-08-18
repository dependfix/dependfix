import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRedisClient, probeRedis } from './redis'

// class mock：`new Redis(...)` 需要可构造实现（vitest 禁止 mockReturnValue + new）
const { RedisMock, instances } = vi.hoisted(() => ({
    RedisMock: vi.fn(),
    instances: [] as { on: (evt: string, fn: () => void) => unknown }[],
}))
vi.mock('ioredis', () => ({
    default: class {
        constructor(...args: unknown[]) {
            RedisMock(...args)
            instances.push(this as never)
        }

        on() {
            return this
        }
    },
}))

const makeClient = (overrides: Record<string, unknown> = {}) => ({
    ping: vi.fn().mockResolvedValue('PONG'),
    info: vi.fn().mockResolvedValue('redis_version:7.4.1\r\n'),
    disconnect: vi.fn(),
    ...overrides,
})

describe('createRedisClient', () => {
    beforeEach(() => {
        instances.length = 0
    })

    afterEach(() => {
        RedisMock.mockReset()
    })

    it('creates client with BullMQ-compatible options and error listener', () => {
        createRedisClient('redis://127.0.0.1:6379')
        expect(RedisMock).toHaveBeenCalledOnce()
        const [url, options] = RedisMock.mock.calls[0] as [string, { lazyConnect: boolean, maxRetriesPerRequest: null, retryStrategy: (t: number) => number | null }]
        expect(url).toBe('redis://127.0.0.1:6379')
        expect(options.lazyConnect).toBe(true)
        expect(options.maxRetriesPerRequest).toBeNull()
        // error 监听注册（class mock 的 on 返回自身，验证调用）
        expect(instances).toHaveLength(1)
        // retryStrategy：无 maxRetries 时线性退避封顶 2s
        expect(options.retryStrategy(1)).toBe(200)
        expect(options.retryStrategy(100)).toBe(2_000)
    })

    it('retryStrategy returns null after maxRetries when configured', () => {
        createRedisClient('redis://127.0.0.1:6379', { maxRetries: 2 })
        const [, options] = RedisMock.mock.calls[0] as [string, { retryStrategy: (t: number) => number | null }]
        expect(options.retryStrategy(1)).toBe(200)
        expect(options.retryStrategy(2)).toBe(400)
        expect(options.retryStrategy(3)).toBeNull()
    })
})

describe('probeRedis', () => {
    it('returns available with version when ping and info succeed', async () => {
        const client = makeClient()
        const result = await probeRedis(client as never)
        expect(result).toEqual({ available: true, version: '7.4.1' })
        expect(client.disconnect).toHaveBeenCalled()
    })

    it('reports connect_failed when info has no parseable version', async () => {
        const client = makeClient({ info: vi.fn().mockResolvedValue('# Server\r\nnothing-here') })
        const result = await probeRedis(client as never)
        expect(result).toEqual({ available: false, version: null, reason: 'connect_failed' })
    })

    it('reports version_too_old when Redis major version < 5', async () => {
        const client = makeClient({ info: vi.fn().mockResolvedValue('redis_version:3.0.0\r\n') })
        const result = await probeRedis(client as never)
        expect(result).toEqual({ available: false, version: '3.0.0', reason: 'version_too_old' })
    })

    it('reports connect_failed when ping throws', async () => {
        const client = makeClient({ ping: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) })
        const result = await probeRedis(client as never)
        expect(result).toEqual({ available: false, version: null, reason: 'connect_failed' })
        // finally 分支：失败也断开连接
        expect(client.disconnect).toHaveBeenCalled()
    })
})
