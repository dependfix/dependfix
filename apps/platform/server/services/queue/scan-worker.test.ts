import {
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'

// ---------- mock 依赖 ----------
const { triggerScheduleMock, runScanMock, workerInstances } = vi.hoisted(() => ({
    triggerScheduleMock: vi.fn(),
    runScanMock: vi.fn(),
    workerInstances: [] as {
        queueName: string
        handler: (job: { name: string, data: unknown }) => Promise<unknown>
        options: { connection: unknown, concurrency?: number }
        close: () => Promise<void>
    }[],
}))

vi.mock('../scheduler/scheduler.service', () => ({
    SCHEDULED_JOB_NAME: 'scheduled-scan',
    triggerSchedule: triggerScheduleMock,
}))

vi.mock('../scan-orchestrator.service', () => ({
    runScanForRepository: runScanMock,
}))

vi.mock('bullmq', () => ({
    // class 可被 new 调用；实例记录到 hoisted 数组供断言（vi.fn 泛型与 class 构造签名不兼容，不走 mockImplementation）
    Worker: class {
        constructor(
            queueName: string,
            handler: (job: { name: string, data: unknown }) => Promise<unknown>,
            options: { connection: unknown, concurrency?: number },
        ) {
            workerInstances.push({ queueName, handler, options, close: this.close })
        }

        close = vi.fn(async () => undefined)
    },
}))

// ---------- 被测模块 ----------
import { SCHEDULED_JOB_NAME } from '../scheduler/scheduler.service'
import { defaultProcessor, createScanWorker } from './scan-worker'

describe('scan-worker（job 分发 + worker 封装）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        workerInstances.length = 0
        triggerScheduleMock.mockResolvedValue({ batchRunId: 'batch-1', repositoryCount: 1 })
        runScanMock.mockResolvedValue({ id: 'run-1' })
    })

    describe('defaultProcessor', () => {
        it('scheduled-scan job → triggerSchedule(scheduleId)（定时批量触发闭环）', async () => {
            await defaultProcessor({ scheduleId: 'schedule-1' }, SCHEDULED_JOB_NAME)

            expect(triggerScheduleMock).toHaveBeenCalledTimes(1)
            expect(triggerScheduleMock).toHaveBeenCalledWith('schedule-1')
            expect(runScanMock).not.toHaveBeenCalled()
        })

        it('scan job → runScanForRepository（续用 API 预创建的 pending run）', async () => {
            await defaultProcessor({
                repositoryId: 'repo-1',
                request: { mode: 'report-only', severityThreshold: 'high' },
                runId: 'run-1',
            }, 'scan')

            expect(runScanMock).toHaveBeenCalledTimes(1)
            expect(runScanMock.mock.calls[0]![0]).toBe('repo-1')
            expect(runScanMock.mock.calls[0]![2]).toEqual({ runId: 'run-1' })
            expect(triggerScheduleMock).not.toHaveBeenCalled()
        })

        it('scan job 无 runId（同步降级兜底形态）：不传续用选项', async () => {
            await defaultProcessor({
                repositoryId: 'repo-1',
                request: { mode: 'report-only', severityThreshold: 'high' },
                runId: '',
            }, 'scan')

            expect(runScanMock).toHaveBeenCalledTimes(1)
            expect(runScanMock.mock.calls[0]![2]).toBeUndefined()
        })
    })

    describe('createScanWorker', () => {
        it('创建 BullMQ Worker（队列名 + 处理函数 + concurrency 可配）', () => {
            const connection = {} as never
            const worker = createScanWorker(connection, { concurrency: 2 })

            expect(workerInstances).toHaveLength(1)
            const instance = workerInstances[0]!
            expect(instance.queueName).toBe('scan')
            expect(instance.options).toMatchObject({ connection, concurrency: 2 })
            expect(worker.close).toBeDefined()
        })

        it('消费时按 job.name 分发（scheduled-scan → triggerSchedule）', async () => {
            const connection = {} as never
            const worker = createScanWorker(connection)
            const { handler, close } = workerInstances[0]!

            // 模拟 worker 消费：scheduled-scan job → 分发 triggerSchedule
            await handler({ name: 'scheduled-scan', data: { scheduleId: 'schedule-2' } })
            expect(triggerScheduleMock).toHaveBeenCalledWith('schedule-2')

            await worker.close()
            expect(close).toHaveBeenCalled()
        })
    })
})
