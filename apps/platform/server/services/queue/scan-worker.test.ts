import {
    afterEach,
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
        options: { connection: unknown, concurrency?: number, lockDuration?: number, lockRenewTime?: number }
        listeners: Map<string, (...args: never[]) => void>
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
        listeners = new Map<string, (...args: never[]) => void>()

        constructor(
            queueName: string,
            handler: (job: { name: string, data: unknown }) => Promise<unknown>,
            options: { connection: unknown, concurrency?: number, lockDuration?: number, lockRenewTime?: number },
        ) {
            workerInstances.push({ queueName, handler, options, listeners: this.listeners, close: this.close })
        }

        on = vi.fn((event: string, listener: (...args: never[]) => void) => {
            this.listeners.set(event, listener)
            return this
        })

        close = vi.fn(async () => undefined)
    },
}))

// ---------- 被测模块 ----------
import { DEFAULT_EXECUTION_TIMEOUT_MS, resolveExecutionTimeoutMs } from '../executor/container-executor'
import { SCHEDULED_JOB_NAME } from '../scheduler/scheduler.service'
import {
    createScanWorker,
    defaultProcessor,
    handleLockRenewalFailedEvent,
    handleStalledEvent,
    handleWorkerError,
    LOCK_RENEWAL_ERROR_PREFIX,
    SCAN_WORKER_LOCK_OPTIONS,
} from './scan-worker'

/** 从 console 调用的首参提取结构化日志载荷（形如 `[scan-worker] {json}`） */
const payloadOf = (call: unknown[]): Record<string, unknown> =>
    JSON.parse(String(call[0]).replace('[scan-worker] ', '')) as Record<string, unknown>

describe('scan-worker（job 分发 + worker 封装 + 锁观测）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        workerInstances.length = 0
        triggerScheduleMock.mockResolvedValue({ batchRunId: 'batch-1', repositoryCount: 1 })
        runScanMock.mockResolvedValue({ id: 'run-1' })
    })

    afterEach(() => {
        vi.restoreAllMocks()
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

        it('未知 job name：显式抛错（不静默按 scan 解构——undefined repositoryId 有误扫风险）', async () => {
            await expect(defaultProcessor({} as never, 'unknown-job')).rejects.toThrow('unknown job name: unknown-job')

            expect(runScanMock).not.toHaveBeenCalled()
            expect(triggerScheduleMock).not.toHaveBeenCalled()
        })
    })

    describe('锁参数（SCAN_WORKER_LOCK_OPTIONS）', () => {
        it('lockDuration 对齐执行超时解析器（EXECUTION_TIMEOUT_MS 联动），lockRenewTime 为其一半', () => {
            // 执行器超时口径（container-executor.ts resolveExecutionTimeoutMs）：默认 30 分钟，可经 EXECUTION_TIMEOUT_MS 覆盖
            expect(DEFAULT_EXECUTION_TIMEOUT_MS).toBe(30 * 60 * 1000)
            expect(SCAN_WORKER_LOCK_OPTIONS.lockDuration).toBe(resolveExecutionTimeoutMs())
            expect(SCAN_WORKER_LOCK_OPTIONS.lockRenewTime).toBe(Math.floor(resolveExecutionTimeoutMs() / 2))
        })

        it('createScanWorker 把锁参数透传给 BullMQ Worker（不再走隐式默认 30 秒）', () => {
            createScanWorker({} as never)

            const { options } = workerInstances[0]!
            expect(options).toMatchObject({
                lockDuration: SCAN_WORKER_LOCK_OPTIONS.lockDuration,
                lockRenewTime: SCAN_WORKER_LOCK_OPTIONS.lockRenewTime,
            })
            expect(options.lockDuration).toBeGreaterThan(30_000)
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

        it('注册 stalled / lockRenewalFailed / error 事件监听（锁问题可观测）', () => {
            createScanWorker({} as never)

            const { listeners } = workerInstances[0]!
            expect(listeners.has('stalled')).toBe(true)
            expect(listeners.has('lockRenewalFailed')).toBe(true)
            expect(listeners.has('error')).toBe(true)
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

    describe('事件处理（结构化日志）', () => {
        it('stalled：日志含 event / jobId / prev / runId（经注入 getJob 解析）', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            const getJob = vi.fn(async () => ({ data: { runId: 'run-9' } }))

            await handleStalledEvent(getJob, 'scan-repo-1', 'active')

            expect(warn).toHaveBeenCalledTimes(1)
            expect(payloadOf(warn.mock.calls[0]!)).toEqual({
                event: 'stalled',
                jobId: 'scan-repo-1',
                prev: 'active',
                runId: 'run-9',
            })
        })

        it('stalled：未注入 getJob / 查询抛错 → runId 降级 undefined（告警不丢失）', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            const failingLookup = vi.fn(async () => {
                throw new Error('redis down')
            })

            await handleStalledEvent(undefined, 'scan-repo-1', 'active')
            await handleStalledEvent(failingLookup, 'scan-repo-2', 'active')

            expect(warn).toHaveBeenCalledTimes(2)
            expect(payloadOf(warn.mock.calls[0]!)).toEqual({
                event: 'stalled', jobId: 'scan-repo-1', prev: 'active', runId: null,
            })
            expect(payloadOf(warn.mock.calls[1]!)).toEqual({
                event: 'stalled', jobId: 'scan-repo-2', prev: 'active', runId: null,
            })
        })

        it('lockRenewalFailed：日志含 jobIds 与已解析 runIds（未解析项被过滤）', async () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            const getJob = vi.fn(async (jobId: string) => jobId === 'scan-repo-1'
                ? { data: { runId: 'run-1' } }
                : undefined)

            await handleLockRenewalFailedEvent(getJob, ['scan-repo-1', 'scan-repo-2'])

            expect(payloadOf(warn.mock.calls[0]!)).toEqual({
                event: 'lockRenewalFailed',
                jobIds: ['scan-repo-1', 'scan-repo-2'],
                runIds: ['run-1'],
            })
        })

        it('error：普通错误记 message；续期失败错误标 duplicateOf（与 lockRenewalFailed 同根因去重）', () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

            handleWorkerError(new Error('redis connection lost'))
            handleWorkerError(new Error(`${LOCK_RENEWAL_ERROR_PREFIX}scan-repo-1`))

            expect(error).toHaveBeenCalledTimes(2)
            expect(payloadOf(error.mock.calls[0]!)).toEqual({ event: 'error', message: 'redis connection lost' })
            expect(payloadOf(error.mock.calls[1]!)).toEqual({
                event: 'error',
                message: `${LOCK_RENEWAL_ERROR_PREFIX}scan-repo-1`,
                duplicateOf: 'lockRenewalFailed',
            })
        })

        it('error：message 脱敏（内联凭据不落入日志）', () => {
            const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

            handleWorkerError(new Error('clone failed: https://x-access-token:secret-token@github.com/a/b.git'))

            const payload = payloadOf(error.mock.calls[0]!)
            expect(String(payload.message)).not.toContain('secret-token')
        })
    })
})
