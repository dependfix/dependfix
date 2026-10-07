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
import { ScanResult } from '#server/entities/scan-result'
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
        update: vi.fn<(criteria?: unknown, partial?: unknown) => Promise<{ affected: number }>>(async () => ({ affected: 1 })),
    }
    const scanRunRepo = {
        save: vi.fn(async (run: ScanRun) => run),
        find: vi.fn(async () => [] as ScanRun[]),
    }
    const scanResultRepo = {
        find: vi.fn(async () => [] as ScanResult[]),
    }
    vi.mocked(ensureDatabaseInitialized).mockResolvedValue({
        getRepository: (entity: unknown) => {
            if (entity === BatchRun) {
                return batchRunRepo
            }
            if (entity === ScanRun) {
                return scanRunRepo
            }
            if (entity === ScanResult) {
                return scanResultRepo
            }
            throw new Error(`unexpected entity: ${String(entity)}`)
        },
    } as never)
    return { batchRunRepo, scanRunRepo, scanResultRepo, savedBatchRuns }
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
        expect(errorJson.code).toBe('SCAN_PENDING_MERGED')
        // 去重合并标记同样落分类（runtime + deterministic）
        expect(failedRun.failureStage).toBe('runtime')
        expect(failedRun.failureKind).toBe('deterministic')
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
        expect(failedRun.failureCode).toBe('enqueue_failed')
        expect(failedRun.failureStage).toBe('runtime')
        expect(failedRun.failureKind).toBe('transient')
        expect(savedBatchRuns[0]!.status).toBe('running')
    })

    it('async 全部入队失败：批次条件写回 failed 终态（避免永久 running）', async () => {
        mockQueueService('async')
        const { batchRunRepo, savedBatchRuns } = mockDataSource()
        createPendingRunMock.mockRejectedValue(new Error('队列不可用'))

        await expect(executeBatchRun(baseInput)).resolves.toMatchObject({ repositoryCount: 2 })

        // 条件写回（乐观锁 = 读取时 running）；payload 仅失败终态 + finishedAt，不含计数
        expect(batchRunRepo.update).toHaveBeenCalledWith(
            { id: 'batch-1', status: 'running' },
            expect.objectContaining({ status: 'failed', finishedAt: expect.any(Date) }),
        )
        const [, payload] = vi.mocked(batchRunRepo.update).mock.calls[0]!
        expect(payload).not.toHaveProperty('finishedCount')
        expect(payload).not.toHaveProperty('summaryJson')
        // 仅创建时整行 save；失败路径不再整行 save（避免覆盖并发聚合计数）
        expect(savedBatchRuns).toHaveLength(1)
        expect(batchRunRepo.save).toHaveBeenCalledTimes(1)
        expect(queueAddMock).not.toHaveBeenCalled()
    })

    it('async 全部入队失败 + 并发 force-fail 抢先（affected=0）：不追加整行 save 覆盖终态', async () => {
        mockQueueService('async')
        const { batchRunRepo, savedBatchRuns } = mockDataSource()
        createPendingRunMock.mockRejectedValue(new Error('队列不可用'))
        // 模拟条件写回条件不匹配（库中已被并发改为终态）
        batchRunRepo.update.mockResolvedValueOnce({ affected: 0 })

        await expect(executeBatchRun(baseInput)).resolves.toMatchObject({ repositoryCount: 2 })

        expect(batchRunRepo.update).toHaveBeenCalledTimes(1)
        // 失败路径全程无整行 save（仅最初的创建写入）
        expect(savedBatchRuns).toHaveLength(1)
        expect(batchRunRepo.save).toHaveBeenCalledTimes(1)
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

    it('sync：串行结束后立即聚合终态化，finishedAt = max(子项 finishedAt)', async () => {
        mockQueueService('sync')
        const { savedBatchRuns, scanRunRepo } = mockDataSource()
        const realFinishedAt = new Date('2026-09-04T04:00:00Z')
        scanRunRepo.find.mockResolvedValueOnce([
            { id: 'run-1', status: 'completed', finishedAt: realFinishedAt, batchRunId: 'batch-1', summaryJson: null } as ScanRun,
        ])

        await executeBatchRun(baseInput)

        expect(savedBatchRuns[0]!.status).toBe('completed')
        expect(savedBatchRuns[0]!.finishedAt?.toISOString()).toBe(realFinishedAt.toISOString())
    })

    it('sync：并发 force-fail 抢先（条件写回 affected=0）时不追加 save 覆盖终态', async () => {
        mockQueueService('sync')
        const { batchRunRepo, scanRunRepo } = mockDataSource()
        scanRunRepo.find.mockResolvedValueOnce([
            { id: 'run-1', status: 'completed', finishedAt: new Date('2026-09-04T04:00:00Z'), batchRunId: 'batch-1', summaryJson: null } as ScanRun,
        ])
        // 模拟条件写回条件不匹配（库中已被并发改为 failed）
        batchRunRepo.update.mockResolvedValueOnce({ affected: 0 })

        await executeBatchRun(baseInput)

        // 以读取时状态 running 为乐观锁条件，payload 写聚合终态 completed
        expect(batchRunRepo.update).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'batch-1', status: 'running' }),
            expect.objectContaining({ status: 'completed' }),
        )
        // affected=0 → 不追加 save 覆盖（仅创建时 1 次 save）
        expect(batchRunRepo.save).toHaveBeenCalledTimes(1)
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
