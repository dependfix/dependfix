import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

// ---------- mock 依赖（vi.hoisted：factory 被 hoist，顶层变量不可引用） ----------
const {
    scheduleMock,
    destroyMock,
    upsertMock,
    removeSchedulerMock,
    queueAddMock,
    resolveRepositoryIdsMock,
    createPendingRunMock,
    runSyncMock,
} = vi.hoisted(() => ({
    scheduleMock: vi.fn(),
    destroyMock: vi.fn(),
    upsertMock: vi.fn(),
    removeSchedulerMock: vi.fn(),
    queueAddMock: vi.fn(),
    resolveRepositoryIdsMock: vi.fn(),
    createPendingRunMock: vi.fn(),
    runSyncMock: vi.fn(),
}))

vi.mock('node-cron', () => ({
    default: {
        schedule: (...args: unknown[]) => {
            scheduleMock(...args)
            return { id: 'task-1', destroy: destroyMock, stop: vi.fn(), start: vi.fn() }
        },
    },
}))

vi.mock('../queue/queue.service', () => ({
    getQueueService: vi.fn(),
}))

vi.mock('../scan-orchestrator.service', () => ({
    createPendingScanRun: createPendingRunMock,
    runScanForRepository: runSyncMock,
}))

vi.mock('./selector', () => ({
    resolveRepositoryIds: resolveRepositoryIdsMock,
}))

vi.mock('#server/database', () => ({
    ensureDatabaseInitialized: vi.fn(),
}))

// ---------- 被测模块 ----------
import { getQueueService } from '../queue/queue.service'
import {
    buildSchedulerId,
    registerSchedule,
    shutdownScheduler,
    triggerSchedule,
    unregisterSchedule,
} from './scheduler.service'
import { Schedule } from '#server/entities/schedule'
import { BatchRun } from '#server/entities/batch-run'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'

// ---------- mock 工厂 ----------
const mockQueueService = (mode: 'async' | 'sync') => {
    vi.mocked(getQueueService).mockResolvedValue({
        mode,
        queue: mode === 'async'
            ? {
                add: queueAddMock,
                upsertJobScheduler: upsertMock,
                removeJobScheduler: removeSchedulerMock,
                close: vi.fn(),
            }
            : null,
        close: vi.fn(),
    } as never)
}

/** 构建 mock DataSource：getRepository 按实体返回对应 repo mock；返回各 repo 引用供断言 */
const mockDataSource = (overrides: {
    schedule?: Partial<Schedule> | null
    onBatchRunSave?: (data: Partial<BatchRun>) => void
} = {}) => {
    const scheduleRow = overrides.schedule === undefined ? null : overrides.schedule
    const savedBatchRuns: BatchRun[] = []
    const scheduleRepo = {
        findOne: vi.fn(async () => scheduleRow ? makeSchedule(scheduleRow) : null),
        save: vi.fn(async (s: Schedule) => s),
        find: vi.fn(async () => []),
    }
    const batchRunRepo = {
        create: vi.fn((data: Partial<BatchRun>) => data),
        save: vi.fn(async (data: Partial<BatchRun>) => {
            const saved = { ...data, id: `batch-${savedBatchRuns.length + 1}` } as BatchRun
            savedBatchRuns.push(saved)
            overrides.onBatchRunSave?.(data)
            return saved
        }),
        findOne: vi.fn(async ({ where }: { where: { id: string } }) =>
            savedBatchRuns.find((b) => b.id === where.id) ?? null),
    }
    const repositoryRepo = { find: vi.fn(async () => []), findOne: vi.fn() }
    vi.mocked(ensureDatabaseInitialized).mockResolvedValue({
        getRepository: (entity: unknown) => {
            if (entity === Schedule) {
                return scheduleRepo
            }
            if (entity === BatchRun) {
                return batchRunRepo
            }
            if (entity === Repository) {
                return repositoryRepo
            }
            throw new Error(`unexpected entity: ${String(entity)}`)
        },
    } as never)
    return { scheduleRepo, batchRunRepo, repositoryRepo, savedBatchRuns }
}

const makeSchedule = (overrides: Partial<Schedule> = {}): Schedule => Object.assign({
    id: 'schedule-1',
    name: '测试计划',
    cron: '0 2 * * 1',
    timezone: null,
    selectorKind: 'tag',
    selectorJson: JSON.stringify({ tag: 'frontend' }),
    mode: 'report-only',
    severityThreshold: 'high',
    enabled: true,
    lastTriggeredAt: null,
    lastBatchRunId: null,
    organizationId: 'org-a',
    createdAt: new Date(),
    updatedAt: new Date(),
}, overrides) as Schedule

describe('scheduler.service（双模调度注册/注销/触发）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resolveRepositoryIdsMock.mockResolvedValue([])
        queueAddMock.mockResolvedValue({ jobId: 'scan-x', reused: false })
        createPendingRunMock.mockImplementation(async (repositoryId: string) => ({ id: `run-${repositoryId}` }))
        runSyncMock.mockImplementation(async (repositoryId: string) => ({ id: `run-${repositoryId}` }))
    })

    afterEach(() => {
        shutdownScheduler()
    })

    describe('buildSchedulerId', () => {
        it('schedule 前缀且无冒号（BullMQ jobId 规范）', () => {
            expect(buildSchedulerId('abc-123')).toBe('schedule-abc-123')
            expect(buildSchedulerId('abc-123')).not.toContain(':')
        })
    })

    describe('registerSchedule（async 模式）', () => {
        it('调用 BullMQ upsertJobScheduler（pattern/tz/name/priority=scheduled=10）', async () => {
            mockQueueService('async')
            upsertMock.mockResolvedValue(undefined)

            await registerSchedule(makeSchedule())

            expect(upsertMock).toHaveBeenCalledTimes(1)
            const [schedulerId, repeatOpts, template] = upsertMock.mock.calls[0]!
            expect(schedulerId).toBe('schedule-schedule-1')
            expect(repeatOpts).toEqual({ pattern: '0 2 * * 1', tz: undefined })
            expect(template.name).toBe('scheduled-scan')
            expect(template.data).toEqual({ scheduleId: 'schedule-1' })
            expect(template.opts.priority).toBe(10)
            expect(scheduleMock).not.toHaveBeenCalled()
        })

        it('timezone 非空时透传 tz', async () => {
            mockQueueService('async')
            upsertMock.mockResolvedValue(undefined)
            await registerSchedule(makeSchedule({ timezone: 'Asia/Shanghai' }))
            expect(upsertMock.mock.calls[0]![1]).toEqual({ pattern: '0 2 * * 1', tz: 'Asia/Shanghai' })
        })
    })

    describe('registerSchedule（sync 降级模式）', () => {
        it('注册 node-cron 任务（expression/timezone/name）', async () => {
            mockQueueService('sync')
            await registerSchedule(makeSchedule({ timezone: 'Asia/Shanghai' }))

            expect(scheduleMock).toHaveBeenCalledTimes(1)
            const [expression, , options] = scheduleMock.mock.calls[0]!
            expect(expression).toBe('0 2 * * 1')
            expect(options).toEqual({ timezone: 'Asia/Shanghai', name: 'schedule-schedule-1' })
            expect(upsertMock).not.toHaveBeenCalled()
        })

        it('重复注册同 id 幂等：旧任务先销毁再注册', async () => {
            mockQueueService('sync')
            await registerSchedule(makeSchedule())
            expect(destroyMock).not.toHaveBeenCalled()

            await registerSchedule(makeSchedule({ cron: '0 3 * * 2' }))
            expect(destroyMock).toHaveBeenCalledTimes(1)
            expect(scheduleMock).toHaveBeenCalledTimes(2)
            const [expression] = scheduleMock.mock.calls[1]!
            expect(expression).toBe('0 3 * * 2')
        })
    })

    describe('unregisterSchedule', () => {
        it('async：调用 removeJobScheduler', async () => {
            mockQueueService('async')
            removeSchedulerMock.mockResolvedValue(undefined)
            await unregisterSchedule('schedule-1')
            expect(removeSchedulerMock).toHaveBeenCalledWith('schedule-schedule-1')
        })

        it('sync：销毁 node-cron 任务并移除注册表', async () => {
            mockQueueService('sync')
            await registerSchedule(makeSchedule())
            expect(destroyMock).not.toHaveBeenCalled()

            await unregisterSchedule('schedule-1')
            expect(destroyMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('triggerSchedule', () => {
        it('不存在计划抛 404', async () => {
            mockQueueService('sync')
            mockDataSource({ schedule: null })
            await expect(triggerSchedule('no-such')).rejects.toMatchObject({ statusCode: 404 })
        })

        it('sync：创建 BatchRun → 逐仓库串行 runScanForRepository（带 batchRunId）→ 回填触发信息', async () => {
            mockQueueService('sync')
            resolveRepositoryIdsMock.mockResolvedValue(['repo-1', 'repo-2'])
            const { scheduleRepo, savedBatchRuns } = mockDataSource({ schedule: {} })

            const result = await triggerSchedule('schedule-1')

            expect(result.batchRunId).toBe('batch-1')
            expect(result.repositoryCount).toBe(2)

            // BatchRun 创建参数
            expect(savedBatchRuns).toHaveLength(1)
            expect(savedBatchRuns[0]).toMatchObject({
                source: 'scheduled',
                scheduleId: 'schedule-1',
                mode: 'report-only',
                severityThreshold: 'high',
                repositoryCount: 2,
                status: 'running',
                organizationId: 'org-a',
            })

            // 逐仓库同步串行（batchRunId 关联）
            expect(runSyncMock).toHaveBeenCalledTimes(2)
            expect(runSyncMock.mock.calls[0]![0]).toBe('repo-1')
            expect(runSyncMock.mock.calls[0]![2]).toEqual({ batchRunId: 'batch-1' })
            expect(runSyncMock.mock.calls[1]![0]).toBe('repo-2')
            expect(runSyncMock.mock.calls[1]![2]).toEqual({ batchRunId: 'batch-1' })
            expect(createPendingRunMock).not.toHaveBeenCalled()
            expect(queueAddMock).not.toHaveBeenCalled()

            // Schedule 回填
            expect(scheduleRepo.save).toHaveBeenCalled()
            const savedSchedule = scheduleRepo.save.mock.calls[0]![0] as Schedule
            expect(savedSchedule.lastBatchRunId).toBe('batch-1')
            expect(savedSchedule.lastTriggeredAt).not.toBeNull()
        })

        it('async：预创建 pending run + 逐仓库入队（priority=scheduled=10）', async () => {
            mockQueueService('async')
            resolveRepositoryIdsMock.mockResolvedValue(['repo-1'])
            mockDataSource({ schedule: {} })

            const result = await triggerSchedule('schedule-1')

            expect(result.repositoryCount).toBe(1)
            expect(createPendingRunMock).toHaveBeenCalledTimes(1)
            expect(createPendingRunMock.mock.calls[0]![0]).toBe('repo-1')
            expect(createPendingRunMock.mock.calls[0]![2]).toEqual({ batchRunId: 'batch-1' })
            expect(queueAddMock).toHaveBeenCalledTimes(1)
            const [repoId, , opts] = queueAddMock.mock.calls[0]!
            expect(repoId).toBe('repo-1')
            expect(opts.priority).toBe(10)
            expect(runSyncMock).not.toHaveBeenCalled()
        })

        it('selectorJson 非法时容错为空对象（不抛错）', async () => {
            mockQueueService('sync')
            resolveRepositoryIdsMock.mockResolvedValue([])
            mockDataSource({ schedule: { selectorJson: 'not-json' } })
            await expect(triggerSchedule('schedule-1')).resolves.toMatchObject({ repositoryCount: 0 })
        })
    })
})
