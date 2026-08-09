import { describe, expect, it } from 'vitest'
import { runWithConcurrency, isValidConcurrency, MAX_CONCURRENCY_LIMIT } from './scheduler'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('runWithConcurrency', () => {
    it('runs all items even when some tasks fail (failure isolation)', async () => {
        const completed: string[] = []
        const failures: string[] = []

        await runWithConcurrency({
            items: ['a', 'b', 'c'],
            concurrency: 1,
            task: async (item) => {
                if (item === 'b') {
                    throw new Error(`boom: ${item}`)
                }
                await sleep(1)
                completed.push(item)
            },
            onError: (item, error) => {
                failures.push(`${item}:${(error as Error).message}`)
            },
        })

        // 失败隔离：b 失败不影响 a/c 完成
        expect(completed.sort()).toEqual(['a', 'c'])
        expect(failures).toEqual(['b:boom: b'])
    })

    it('respects the concurrency window (peak concurrency <= limit)', async () => {
        let active = 0
        let peak = 0

        await runWithConcurrency({
            items: [1, 2, 3, 4, 5, 6],
            concurrency: 3,
            task: async () => {
                active += 1
                peak = Math.max(peak, active)
                await sleep(20)
                active -= 1
            },
        })

        expect(peak).toBeLessThanOrEqual(3)
        // 并发窗口实际生效（峰值 > 1 证明并行执行）
        expect(peak).toBeGreaterThan(1)
    })

    it('does nothing for an empty item list', async () => {
        let calls = 0
        await runWithConcurrency({
            items: [],
            concurrency: 2,
            task: async () => { calls += 1 },
        })
        expect(calls).toBe(0)
    })

    it('propagates onError without throwing (defense layer)', async () => {
        let failed = 0
        await runWithConcurrency({
            items: ['x'],
            concurrency: 1,
            task: async () => { throw new Error('unexpected') },
            onError: () => { failed += 1 },
        })
        expect(failed).toBe(1)
    })
})

describe('isValidConcurrency', () => {
    it('accepts 1..16 and rejects out-of-range / non-integer', () => {
        expect(isValidConcurrency(1)).toBe(true)
        expect(isValidConcurrency(16)).toBe(true)
        expect(isValidConcurrency(0)).toBe(false)
        expect(isValidConcurrency(17)).toBe(false)
        expect(isValidConcurrency(1.5)).toBe(false)
        expect(isValidConcurrency(Number.NaN)).toBe(false)
        expect(MAX_CONCURRENCY_LIMIT).toBe(16)
    })
})
