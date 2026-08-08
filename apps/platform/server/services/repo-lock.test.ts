import { describe, expect, it } from 'vitest'
import { withRepoLock } from './repo-lock'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('withRepoLock（同仓库互斥）', () => {
    it('serializes concurrent calls for the same repository', async () => {
        const order: string[] = []
        const fn = (id: string) => withRepoLock('repo-1', async () => {
            order.push(`start-${id}`)
            await sleep(30)
            order.push(`end-${id}`)
            return id
        })

        // 并发发起 3 个同仓库扫描
        await Promise.all([fn('a'), fn('b'), fn('c')])

        // 串行执行：start/end 成对且不交错
        expect(order).toEqual([
            'start-a', 'end-a',
            'start-b', 'end-b',
            'start-c', 'end-c',
        ])
    })

    it('allows concurrent calls for different repositories', async () => {
        let concurrent = 0
        let maxConcurrent = 0
        const fn = (repoId: string) => withRepoLock(repoId, async () => {
            concurrent += 1
            maxConcurrent = Math.max(maxConcurrent, concurrent)
            await sleep(20)
            concurrent -= 1
            return repoId
        })

        await Promise.all([fn('repo-a'), fn('repo-b'), fn('repo-c')])

        expect(maxConcurrent).toBeGreaterThan(1)
    })

    it('releases lock after completion (subsequent call not blocked)', async () => {
        await withRepoLock('repo-x', async () => {
            await sleep(10)
        })
        // 锁已清理：再次调用立即执行
        const start = Date.now()
        await withRepoLock('repo-x', async () => {
            await sleep(10)
        })
        expect(Date.now() - start).toBeLessThan(500)
    })
})
