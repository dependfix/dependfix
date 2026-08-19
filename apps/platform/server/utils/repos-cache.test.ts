import { afterEach, describe, expect, it, vi } from 'vitest'
import { cachedFetch, __resetReposCacheForTesting } from './repos-cache'

/**
 * 缓存工具单测（docs/plan/todo.md §PR3 D3'' 修订）。
 * 覆盖 5 路径：
 * - hit：cache 未过期时直接返回 fromCache=true
 * - miss：cache 不存在 / 已过期时调 loader，fromCache=false
 * - in-flight 并发去重：同 key 多个同时请求只调一次 loader
 * - expiry：TTL 过期后再次请求触发 loader
 * - fresh：?fresh=true 跳过读取但仍写回新值
 *
 * 错误语义：loader throw 时向上抛，缓存不被写入，inflight 释放。
 */

describe('cachedFetch（docs/plan/todo.md §PR3-2 C49 缓存工具）', () => {
    afterEach(() => {
        __resetReposCacheForTesting()
        vi.useRealTimers()
    })

    it('miss：首次调用调 loader，结果写回缓存，fromCache=false', async () => {
        const loader = vi.fn().mockResolvedValue({ data: 'first' })
        const result = await cachedFetch('k1', 60_000, loader)
        expect(loader).toHaveBeenCalledTimes(1)
        expect(result.value).toEqual({ data: 'first' })
        expect(result.fromCache).toBe(false)
        expect(result.cachedAt).toBeInstanceOf(Date)
    })

    it('hit：TTL 内二次调用直接返回 fromCache=true，不再调 loader', async () => {
        const loader = vi.fn().mockResolvedValue('v')
        await cachedFetch('k2', 60_000, loader)
        const second = await cachedFetch('k2', 60_000, loader)
        expect(loader).toHaveBeenCalledTimes(1)
        expect(second.value).toBe('v')
        expect(second.fromCache).toBe(true)
    })

    it('expiry：TTL 过期后再次调用重新调 loader', async () => {
        vi.useFakeTimers()
        const loader = vi.fn()
            .mockResolvedValueOnce('first')
            .mockResolvedValueOnce('second')

        const first = await cachedFetch('k3', 60_000, loader)
        expect(first.value).toBe('first')
        expect(first.fromCache).toBe(false)

        // 推进时间过 TTL
        vi.advanceTimersByTime(61_000)

        const after = await cachedFetch('k3', 60_000, loader)
        expect(after.value).toBe('second')
        expect(after.fromCache).toBe(false)
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('fresh：fresh=true 跳过 cache 读取但仍写回新值', async () => {
        const loader = vi.fn()
            .mockResolvedValueOnce('v1')
            .mockResolvedValueOnce('v2')

        const first = await cachedFetch('k4', 60_000, loader)
        expect(first.value).toBe('v1')

        // 强制刷新
        const fresh = await cachedFetch('k4', 60_000, loader, { fresh: true })
        expect(fresh.value).toBe('v2')
        expect(fresh.fromCache).toBe(false)

        // 后续非 fresh 请求命中刷新后的缓存
        const next = await cachedFetch('k4', 60_000, loader)
        expect(next.value).toBe('v2')
        expect(next.fromCache).toBe(true)
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('in-flight 并发去重：同 key 同时发起 10 个请求只调 1 次 loader', async () => {
        let resolveLoader: (v: string) => void
        const loaderPromise = new Promise<string>((resolve) => {
            resolveLoader = resolve
        })
        const loader = vi.fn().mockReturnValue(loaderPromise)

        // 10 个并发请求
        const requests = Array.from({ length: 10 }, () => cachedFetch('k5', 60_000, loader))
        // 触发 loader 执行
        resolveLoader!('shared')

        const results = await Promise.all(requests)
        expect(loader).toHaveBeenCalledTimes(1)
        // 第 1 个发起请求的 fromCache=false（自身发起的 loader 写入缓存）；
        // 其余 9 个复用 inflight promise，fromCache=true
        expect(results[0]?.fromCache).toBe(false)
        expect(results.slice(1).every((r) => r.fromCache)).toBe(true)
        // 所有请求都拿到 shared（并发去重）
        results.forEach((r) => {
            expect(r.value).toBe('shared')
        })
    })

    it('loader 抛出错误时不写缓存，错误向上抛', async () => {
        const loader = vi.fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce('recovered')

        await expect(cachedFetch('k6', 60_000, loader)).rejects.toThrow('boom')

        // 第二次请求应能正常加载（缓存未污染）
        const result = await cachedFetch('k6', 60_000, loader)
        expect(result.value).toBe('recovered')
        expect(loader).toHaveBeenCalledTimes(2)
    })

    it('不同 key 互不影响，各自独立缓存', async () => {
        const loader = vi.fn().mockImplementation((k: string) => Promise.resolve(`val-${k}`))

        const r1 = await cachedFetch('a', 60_000, () => loader('a'))
        const r2 = await cachedFetch('b', 60_000, () => loader('b'))
        expect(r1.value).toBe('val-a')
        expect(r2.value).toBe('val-b')
        expect(loader).toHaveBeenCalledTimes(2)

        // 各自再调用一次都命中缓存
        const r1b = await cachedFetch('a', 60_000, () => loader('a'))
        const r2b = await cachedFetch('b', 60_000, () => loader('b'))
        expect(r1b.fromCache).toBe(true)
        expect(r2b.fromCache).toBe(true)
        expect(loader).toHaveBeenCalledTimes(2)
    })
})
