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
    resolveRepositoryIdsMock,
    executeBatchRunMock,
} = vi.hoisted(() => ({
    scheduleMock: vi.fn(),
    destroyMock: vi.fn(),
    upsertMock: vi.fn(),
    removeSchedulerMock: vi.fn(),
    resolveRepositoryIdsMock: vi.fn(),
    executeBatchRunMock: vi.fn(),
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

vi.mock('#server/utils/organization', () => ({
    resolveOrganizationId: vi.fn(),
}))

vi.mock('../batch/batch-executor', () => ({
    executeBatchRun: executeBatchRunMock,
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
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

// ---------- mock 工厂 ----------
const mockQueueService = (mode: 'async' | 'sync') => {
    vi.mocked(getQueueService).mockResolvedValue({
        mode,
        queue: mode === 'async'
            ? {
                add: vi.fn(),
                upsertJobScheduler: upsertMock,
                removeJobScheduler: removeSchedulerMock,
                close: vi.fn(),
            }
            : null,
        close: vi.fn(),
    } as never)
}

/** 构建 mock DataSource：scheduler 只消费 Schedule repo（批量执行已委托 executeBatchRun） */
const mockDataSource = (scheduleRow: Partial<Schedule> | null) => {
    const scheduleRepo = {
        findOne: vi.fn(async () => scheduleRow ? makeSchedule(scheduleRow) : null),
        save: vi.fn(async (s: Schedule) => s),
        find: vi.fn(async () => []),
    }
    vi.mocked(ensureDatabaseInitialized).mockResolvedValue({
        getRepository: (entity: unknown) => {
            if (entity === Schedule) {
                return scheduleRepo
            }
            throw new Error(`unexpected entity: ${String(entity)}`)
        },
    } as never)
    return { scheduleRepo }
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
        vi.mocked(resolveOrganizationId).mockResolvedValue('org-a')
        executeBatchRunMock.mockImplementation(async (input: { repositoryIds: string[] }) => ({
            batchRunId: 'batch-1',
            repositoryCount: input.repositoryIds.length,
        }))
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
            mockDataSource(null)
            await expect(triggerSchedule('no-such')).rejects.toMatchObject({ statusCode: 404 })
        })

        it('解析仓库列表 → executeBatchRun（source=scheduled + 参数透传）→ 回填触发信息', async () => {
            mockQueueService('sync')
            resolveRepositoryIdsMock.mockResolvedValue(['repo-1', 'repo-2'])
            const { scheduleRepo } = mockDataSource({})

            const result = await triggerSchedule('schedule-1')

            expect(result).toEqual({ batchRunId: 'batch-1', repositoryCount: 2 })

            // 解析输入
            expect(resolveRepositoryIdsMock).toHaveBeenCalledTimes(1)
            expect(resolveRepositoryIdsMock.mock.calls[0]![1]).toEqual({
                kind: 'tag',
                data: { tag: 'frontend' },
                organizationId: 'org-a',
            })

            // executeBatchRun 委托（批量执行细节由 batch-executor 自测覆盖）
            expect(executeBatchRunMock).toHaveBeenCalledTimes(1)
            expect(executeBatchRunMock.mock.calls[0]![0]).toEqual({
                source: 'scheduled',
                scheduleId: 'schedule-1',
                repositoryIds: ['repo-1', 'repo-2'],
                request: { mode: 'report-only', severityThreshold: 'high' },
                organizationId: 'org-a',
            })

            // Schedule 回填
            expect(scheduleRepo.save).toHaveBeenCalled()
            const savedSchedule = scheduleRepo.save.mock.calls[0]![0] as Schedule
            expect(savedSchedule.lastBatchRunId).toBe('batch-1')
            expect(savedSchedule.lastTriggeredAt).not.toBeNull()
        })

        it('organizationId 缺失时经 resolveOrganizationId 兜底', async () => {
            mockQueueService('sync')
            resolveRepositoryIdsMock.mockResolvedValue([])
            mockDataSource({ organizationId: null })

            await triggerSchedule('schedule-1')

            expect(resolveOrganizationId).toHaveBeenCalledTimes(1)
            expect(executeBatchRunMock.mock.calls[0]![0].organizationId).toBe('org-a')
        })

        it('selectorJson 非法时容错为空对象（不抛错）', async () => {
            mockQueueService('sync')
            resolveRepositoryIdsMock.mockResolvedValue([])
            mockDataSource({ selectorJson: 'not-json' })
            await expect(triggerSchedule('schedule-1')).resolves.toMatchObject({ repositoryCount: 0 })
        })
    })
})
