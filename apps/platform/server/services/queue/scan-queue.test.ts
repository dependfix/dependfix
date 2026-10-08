import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildScanQueueOptions, createScanQueue } from './scan-queue'

// class mock：`new Queue(...)` 需要可构造实现；实例方法由测试逐用例替换
interface QueueInstance {
    getJob: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    upsertJobScheduler: ReturnType<typeof vi.fn>
    removeJobScheduler: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
}

const { QueueMock, instances } = vi.hoisted(() => ({
    QueueMock: vi.fn(),
    instances: [] as QueueInstance[],
}))
vi.mock('bullmq', () => ({
    Queue: class {
        constructor(...args: unknown[]) {
            QueueMock(...args)
            const instance: QueueInstance = {
                getJob: vi.fn(),
                add: vi.fn(),
                upsertJobScheduler: vi.fn(),
                removeJobScheduler: vi.fn(),
                close: vi.fn(),
            }
            instances.push(instance)
            return instance
        }
    },
}))

const currentInstance = (): QueueInstance => {
    const instance = instances.at(-1)
    if (!instance) {
        throw new Error('Queue instance not created')
    }
    return instance
}

const makeConnection = () => ({}) as never

describe('buildScanQueueOptions', () => {
    it('uses default retry/backoff when options are empty', () => {
        const options = buildScanQueueOptions({})
        // parseRetryConfig 默认：attempts=3（retriesRaw 缺省回退）、backoff 5s
        expect(options.defaultJobOptions.attempts).toBe(3)
        expect(options.defaultJobOptions.backoff.type).toBe('exponential')
        expect(options.defaultJobOptions.backoff.delay).toBe(5_000)
        expect(options.defaultJobOptions.removeOnComplete).toEqual({ age: 3_600, count: 1_000 })
        expect(options.defaultJobOptions.removeOnFail).toEqual({ age: 86_400, count: 1_000 })
    })

    it('applies custom retries and backoff from raw strings', () => {
        const options = buildScanQueueOptions({ retriesRaw: '3', backoffMsRaw: '10000' })
        expect(options.defaultJobOptions.attempts).toBe(3)
        expect(options.defaultJobOptions.backoff.delay).toBe(10_000)
    })
})

describe('createScanQueue', () => {
    beforeEach(() => {
        instances.length = 0
        QueueMock.mockReset()
    })

    it('adds new job when no existing job with same id', async () => {
        const queue = createScanQueue(makeConnection(), {})
        const instance = currentInstance()
        instance.getJob.mockResolvedValue(null)
        const result = await queue.add('repo-1', { mode: 'fix', severityThreshold: 'high' }, { runId: 'run-1' })
        expect(result).toEqual({ jobId: 'scan-repo-1', reused: false })
        expect(instance.add).toHaveBeenCalledWith(
            'scan',
            { repositoryId: 'repo-1', request: { mode: 'fix', severityThreshold: 'high' }, runId: 'run-1' },
            { jobId: 'scan-repo-1', priority: 1 },
        )
    })

    it('dedupes and reports reused when existing job is active', async () => {
        const existing = { getState: vi.fn().mockResolvedValue('active') }
        const queue = createScanQueue(makeConnection(), {})
        currentInstance().getJob.mockResolvedValue(existing)
        const result = await queue.add('repo-1', { mode: 'fix', severityThreshold: 'high' })
        expect(result).toEqual({ jobId: 'scan-repo-1', reused: true })
        expect(existing.getState).toHaveBeenCalled()
        expect(currentInstance().add).not.toHaveBeenCalled()
    })

    it('removes completed job and re-enqueues (immediate re-trigger)', async () => {
        const existing = {
            getState: vi.fn().mockResolvedValue('completed'),
            remove: vi.fn(),
        }
        const queue = createScanQueue(makeConnection(), {})
        const instance = currentInstance()
        instance.getJob.mockResolvedValue(existing)
        const result = await queue.add('repo-1', { mode: 'report-only', severityThreshold: 'low' }, { priority: 5 })
        expect(existing.remove).toHaveBeenCalled()
        expect(result.reused).toBe(false)
        expect(instance.add).toHaveBeenCalledWith(
            'scan',
            { repositoryId: 'repo-1', request: { mode: 'report-only', severityThreshold: 'low' }, runId: '' },
            { jobId: 'scan-repo-1', priority: 5 },
        )
    })

    describe('remove（孤儿 run 释放去重键）', () => {
        it('job 不存在 → removed=false', async () => {
            const queue = createScanQueue(makeConnection(), {})
            const instance = currentInstance()
            instance.getJob.mockResolvedValue(null)
            await expect(queue.remove('repo-1')).resolves.toEqual({ removed: false })
            expect(instance.getJob).toHaveBeenCalledWith('scan-repo-1')
        })

        it('waiting job 可移除（无归属校验）→ removed=true', async () => {
            const existing = {
                data: { runId: 'run-1' },
                getState: vi.fn().mockResolvedValue('waiting'),
                remove: vi.fn().mockResolvedValue(undefined),
            }
            const queue = createScanQueue(makeConnection(), {})
            currentInstance().getJob.mockResolvedValue(existing)
            await expect(queue.remove('repo-1')).resolves.toEqual({ removed: true })
            expect(existing.remove).toHaveBeenCalled()
        })

        it('expectedRunId 匹配 → removed=true', async () => {
            const existing = {
                data: { runId: 'run-1' },
                getState: vi.fn().mockResolvedValue('waiting'),
                remove: vi.fn().mockResolvedValue(undefined),
            }
            const queue = createScanQueue(makeConnection(), {})
            currentInstance().getJob.mockResolvedValue(existing)
            await expect(queue.remove('repo-1', 'run-1')).resolves.toEqual({ removed: true })
            expect(existing.remove).toHaveBeenCalled()
        })

        it('expectedRunId 不匹配（job 归属用户重新触发的新 run）→ 跳过，不误删', async () => {
            const existing = {
                data: { runId: 'run-2' },
                getState: vi.fn().mockResolvedValue('waiting'),
                remove: vi.fn().mockResolvedValue(undefined),
            }
            const queue = createScanQueue(makeConnection(), {})
            currentInstance().getJob.mockResolvedValue(existing)
            await expect(queue.remove('repo-1', 'run-1')).resolves.toEqual({ removed: false })
            expect(existing.remove).not.toHaveBeenCalled()
        })

        it('expectedRunId 不匹配但 job 归属其它 run 且已终态 → 仍跳过（归属优先）', async () => {
            const existing = {
                data: { runId: 'run-2' },
                getState: vi.fn().mockResolvedValue('completed'),
                remove: vi.fn().mockResolvedValue(undefined),
            }
            const queue = createScanQueue(makeConnection(), {})
            currentInstance().getJob.mockResolvedValue(existing)
            await expect(queue.remove('repo-1', 'run-1')).resolves.toEqual({ removed: false })
            expect(existing.remove).not.toHaveBeenCalled()
        })

        it('active 且被 worker 锁定 → remove 抛错被吞，removed=false', async () => {
            const existing = {
                data: { runId: 'run-1' },
                getState: vi.fn().mockResolvedValue('active'),
                remove: vi.fn().mockRejectedValue(new Error('Job scan-repo-1 could not be removed because it is locked by another worker')),
            }
            const queue = createScanQueue(makeConnection(), {})
            currentInstance().getJob.mockResolvedValue(existing)
            await expect(queue.remove('repo-1', 'run-1')).resolves.toEqual({ removed: false })
            expect(existing.remove).toHaveBeenCalled()
        })
    })

    describe('hasLiveJob（pending 孤儿判定）', () => {
        it('job 不存在 → false', async () => {
            const queue = createScanQueue(makeConnection(), {})
            currentInstance().getJob.mockResolvedValue(null)
            await expect(queue.hasLiveJob('repo-1')).resolves.toBe(false)
        })

        it('终态（completed / failed）→ false', async () => {
            const queue = createScanQueue(makeConnection(), {})
            const instance = currentInstance()
            instance.getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('completed') })
            await expect(queue.hasLiveJob('repo-1')).resolves.toBe(false)
            instance.getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed') })
            await expect(queue.hasLiveJob('repo-1')).resolves.toBe(false)
        })

        it('非终态（waiting / active / delayed / prioritized / unknown）→ true', async () => {
            const queue = createScanQueue(makeConnection(), {})
            const instance = currentInstance()
            for (const state of ['waiting', 'active', 'delayed', 'prioritized', 'unknown']) {
                instance.getJob.mockResolvedValue({ getState: vi.fn().mockResolvedValue(state) })
                await expect(queue.hasLiveJob('repo-1')).resolves.toBe(true)
            }
        })
    })

    describe('getJob（事件观测补全 runId）', () => {
        it('命中返回精简 { data }；不存在返回 undefined', async () => {
            const queue = createScanQueue(makeConnection(), {})
            const instance = currentInstance()

            const data = { repositoryId: 'repo-1', request: { mode: 'fix' as const, severityThreshold: 'high' as const }, runId: 'run-1' }
            instance.getJob.mockResolvedValueOnce({ data })
            await expect(queue.getJob('scan-repo-1')).resolves.toEqual({ data })

            instance.getJob.mockResolvedValueOnce(undefined)
            await expect(queue.getJob('scan-repo-2')).resolves.toBeUndefined()
        })
    })

    it('passes through scheduler and close operations', async () => {
        const queue = createScanQueue(makeConnection(), {})
        const instance = currentInstance()
        await queue.upsertJobScheduler('sched-1', { pattern: '0 2 * * *', tz: 'UTC' }, { name: 'scheduled-scan' })
        expect(instance.upsertJobScheduler).toHaveBeenCalledWith('sched-1', { pattern: '0 2 * * *', tz: 'UTC' }, expect.anything())

        await queue.removeJobScheduler('sched-1')
        expect(instance.removeJobScheduler).toHaveBeenCalledWith('sched-1')

        await queue.close()
        expect(instance.close).toHaveBeenCalled()
    })
})
