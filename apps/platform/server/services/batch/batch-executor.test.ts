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
    queueAddMock,
    createPendingRunMock,
    runSyncMock,
} = vi.hoisted(() => ({
    queueAddMock: vi.fn(),
    createPendingRunMock: vi.fn(),
    runSyncMock: vi.fn(),
}))

vi.mock('../queue/queue.service', () => ({
    getQueueService: vi.fn(),
}))

vi.mock('../scan-orchestrator.service', () => ({
    createPendingScanRun: createPendingRunMock,
    runScanForRepository: runSyncMock,
}))

vi.mock('#server/database', () => ({
    ensureDatabaseInitialized: vi.fn(),
}))

// ---------- 被测模块 ----------
import { getQueueService } from '../queue/queue.service'
import { executeBatchRun } from './batch-executor'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

const mockQueueService = (mode: 'async' | 'sync') => {
    vi.mocked(getQueueService).mockResolvedValue({
        mode,
        queue: mode === 'async'
            ? { add: queueAddMock, upsertJobScheduler: vi.fn(), removeJobScheduler: vi.fn(), close: vi.fn() }
            : null,
        close: vi.fn(),
    } as never)
}

/** 构建 mock DataSource：BatchRun/ScanRun 按实体分发；返回 savedBatchRuns 供断言 */
const mockDataSource = () => {
    const savedBatchRuns: Partial<BatchRun>[] = []
    const batchRunRepo = {
        create: vi.fn((data: Partial<BatchRun>) => data),
        save: vi.fn(async (data: Partial<BatchRun>) => {
            const saved = { ...data, id: `batch-${savedBatchRuns.length + 1}` } as BatchRun
            savedBatchRuns.push(saved)
            return saved
        }),
    }
    const scanRunRepo = {
        save: vi.fn(async (run: ScanRun) => run),
    }
    vi.mocked(ensureDatabaseInitialized).mockResolvedValue({
        getRepository: (entity: unknown) => {
            if (entity === BatchRun) {
                return batchRunRepo
            }
            if (entity === ScanRun) {
                return scanRunRepo
            }
            throw new Error(`unexpected entity: ${String(entity)}`)
        },
    } as never)
    return { batchRunRepo, scanRunRepo, savedBatchRuns }
}

const baseInput = {
    source: 'manual' as const,
    scheduleId: null,
    repositoryIds: ['repo-1', 'repo-2'],
    request: { mode: 'report-only' as const, severityThreshold: 'high' },
    organizationId: 'org-a',
}

describe('executeBatchRun（批量执行服务）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        queueAddMock.mockResolvedValue({ jobId: 'scan-x', reused: false })
        createPendingRunMock.mockImplementation(async (repositoryId: string) => ({ id: `run-${repositoryId}` }))
        runSyncMock.mockImplementation(async (repositoryId: string) => ({ id: `run-${repositoryId}` }))
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('async：创建 BatchRun（source=manual）→ 逐仓库预创建 pending run + 入队（priority=manual=1）', async () => {
        mockQueueService('async')
        const { savedBatchRuns } = mockDataSource()

        const result = await executeBatchRun(baseInput)

        expect(result.batchRunId).toBe('batch-1')
        expect(result.repositoryCount).toBe(2)

        expect(savedBatchRuns[0]).toMatchObject({
            source: 'manual',
            scheduleId: null,
            mode: 'report-only',
            severityThreshold: 'high',
            repositoryCount: 2,
            status: 'running',
            organizationId: 'org-a',
        })

        expect(createPendingRunMock).toHaveBeenCalledTimes(2)
        expect(createPendingRunMock.mock.calls[0]![0]).toBe('repo-1')
        expect(createPendingRunMock.mock.calls[0]![2]).toEqual({ batchRunId: 'batch-1' })

        expect(queueAddMock).toHaveBeenCalledTimes(2)
        const [repoId, , opts] = queueAddMock.mock.calls[0]!
        expect(repoId).toBe('repo-1')
        expect(opts.priority).toBe(1)
        expect(opts.runId).toBe('run-repo-1')
        expect(runSyncMock).not.toHaveBeenCalled()
    })

    it('async scheduled：priority=scheduled=10（定时计划触发）', async () => {
        mockQueueService('async')
        const { savedBatchRuns } = mockDataSource()

        await executeBatchRun({
            ...baseInput,
            source: 'scheduled',
            scheduleId: 'schedule-1',
        })

        expect(queueAddMock).toHaveBeenCalledTimes(2)
        for (const call of queueAddMock.mock.calls) {
            expect(call[2]!.priority).toBe(10)
        }
        expect(savedBatchRuns[0]).toMatchObject({
            source: 'scheduled',
            scheduleId: 'schedule-1',
        })
    })

    it('async reused（同仓库进行中任务合并）：孤儿 pending run 置 failed + duplicate 标记', async () => {
        mockQueueService('async')
        const { scanRunRepo } = mockDataSource()
        queueAddMock.mockResolvedValueOnce({ jobId: 'scan-1', reused: true })
        queueAddMock.mockResolvedValueOnce({ jobId: 'scan-2', reused: false })

        await executeBatchRun(baseInput)

        // 第一个仓库 reused：预创建的 run 置 failed（终态收敛）；第二个正常入队
        expect(scanRunRepo.save).toHaveBeenCalledTimes(1)
        const failedRun = scanRunRepo.save.mock.calls[0]![0] as ScanRun
        expect(failedRun.status).toBe('failed')
        expect(failedRun.finishedAt).not.toBeNull()
        const errorJson = JSON.parse(failedRun.errorJson ?? '{}') as { code: string }
        expect(errorJson.code).toBe('duplicate_scan')
    })

    it('async 单仓库入队失败：跳过继续（其余仓库正常入队，批次不中断）', async () => {
        mockQueueService('async')
        const { savedBatchRuns } = mockDataSource()
        // createPendingScanRun 对 repo-2 抛错（如仓库并发删除）
        createPendingRunMock.mockImplementationOnce(async (repositoryId: string) => ({ id: `run-${repositoryId}` }))
        createPendingRunMock.mockRejectedValueOnce(new Error('仓库不存在'))

        await expect(executeBatchRun(baseInput)).resolves.toMatchObject({ repositoryCount: 2 })

        expect(queueAddMock).toHaveBeenCalledTimes(1)
        expect(queueAddMock.mock.calls[0]![0]).toBe('repo-1')
        // 批次保持 running（轮询聚合后续收敛终态）
        const batch = savedBatchRuns[0]!
        expect(batch.status).toBe('running')
    })

    it('async 单仓库入队失败（pending run 已创建，queue.add 抛错）：run 置 failed + enqueue_failed，避免孤儿 run', async () => {
        mockQueueService('async')
        const { savedBatchRuns, scanRunRepo } = mockDataSource()
        // repo-1 入队抛错（Redis 抖动等）；repo-2 正常
        queueAddMock.mockRejectedValueOnce(new Error('Redis connection lost'))
        queueAddMock.mockResolvedValueOnce({ jobId: 'scan-2', reused: false })

        await expect(executeBatchRun(baseInput)).resolves.toMatchObject({ repositoryCount: 2 })

        expect(queueAddMock).toHaveBeenCalledTimes(2)
        // 已创建但入队失败的 pending run 被回收为 failed（聚合可收敛，批次不会永久 running）
        expect(scanRunRepo.save).toHaveBeenCalledTimes(1)
        const failedRun = scanRunRepo.save.mock.calls[0]![0] as ScanRun
        expect(failedRun.status).toBe('failed')
        expect(failedRun.finishedAt).not.toBeNull()
        const errorJson = JSON.parse(failedRun.errorJson ?? '{}') as { code: string }
        expect(errorJson.code).toBe('enqueue_failed')
        expect(savedBatchRuns[0]!.status).toBe('running')
    })

    it('async 全部入队失败：批次直接 failed 终态（避免永久 running）', async () => {
        mockQueueService('async')
        const { savedBatchRuns } = mockDataSource()
        createPendingRunMock.mockRejectedValue(new Error('队列不可用'))

        await expect(executeBatchRun(baseInput)).resolves.toMatchObject({ repositoryCount: 2 })

        const batch = savedBatchRuns[0]!
        expect(batch.status).toBe('failed')
        expect(batch.finishedAt).not.toBeNull()
        expect(queueAddMock).not.toHaveBeenCalled()
    })

    it('sync：逐仓库串行 runScanForRepository（带 batchRunId 关联），不创建 pending run', async () => {
        mockQueueService('sync')
        mockDataSource()

        const result = await executeBatchRun(baseInput)

        expect(result.repositoryCount).toBe(2)
        expect(runSyncMock).toHaveBeenCalledTimes(2)
        expect(runSyncMock.mock.calls[0]![0]).toBe('repo-1')
        expect(runSyncMock.mock.calls[0]![2]).toEqual({ batchRunId: 'batch-1' })
        expect(runSyncMock.mock.calls[1]![0]).toBe('repo-2')
        expect(createPendingRunMock).not.toHaveBeenCalled()
        expect(queueAddMock).not.toHaveBeenCalled()
    })

    it('空批次：立即 completed + 零值 summary（终态兜底，避免永久 running）', async () => {
        mockQueueService('async')
        const { savedBatchRuns } = mockDataSource()

        const result = await executeBatchRun({ ...baseInput, repositoryIds: [] })

        expect(result).toEqual({ batchRunId: 'batch-1', repositoryCount: 0 })
        const batch = savedBatchRuns[0]!
        expect(batch.status).toBe('completed')
        expect(batch.finishedAt).not.toBeNull()
        expect(JSON.parse(batch.summaryJson ?? '{}')).toEqual({
            alertsTotal: 0,
            severityCounts: {},
            fixedCount: 0,
        })
        expect(createPendingRunMock).not.toHaveBeenCalled()
        expect(queueAddMock).not.toHaveBeenCalled()
        expect(runSyncMock).not.toHaveBeenCalled()
    })

    it('sync 空批次：同样立即 completed（双模一致）', async () => {
        mockQueueService('sync')
        const { savedBatchRuns } = mockDataSource()

        await executeBatchRun({ ...baseInput, repositoryIds: [] })

        expect(savedBatchRuns[0]!.status).toBe('completed')
        expect(runSyncMock).not.toHaveBeenCalled()
    })
})
