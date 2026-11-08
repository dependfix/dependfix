import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import { cleanupStaleRuns, findRecentOrphanedRuns, type CleanupOptions, type QueueJobProbe } from './stale-cleanup'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

/**
 * 本文件 fixture 以「31 分钟前」为 stale 边界，running 计入口径由 wrapper 关闭宽限期，
 * 保持既有断言聚焦（宽限期本身另设独立用例）。
 */
const runCleanup = (options: CleanupOptions = {}) => cleanupStaleRuns({ runningGraceMs: 0, ...options })

/** 清理 in-memory DB（每个测试独立）。Organization 表保留——resolveOrganizationId 依赖其存在。 */
const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(BatchRun).clear()
    await ds.getRepository(Repository).clear()
}

/** 绕过 @CreateDateColumn / @UpdateDateColumn 自动覆盖，直接 SQL update 字段为指定时间戳 */
const backdateScanRun = async (id: string, startedAt: Date, createdAt?: Date): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    const set: { startedAt?: Date, createdAt?: Date } = { startedAt }
    if (createdAt) {
        set.createdAt = createdAt
    }
    await ds.getRepository(ScanRun).createQueryBuilder()
        .update(ScanRun)
        .set(set)
        .where('id = :id', { id })
        .execute()
}

/** 仅回填 createdAt（不改 startedAt，用于 startedAt 为 NULL 的脏数据用例） */
const backdateScanRunCreatedAt = async (id: string, createdAt: Date): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).createQueryBuilder()
        .update(ScanRun)
        .set({ createdAt })
        .where('id = :id', { id })
        .execute()
}

const backdateBatchRun = async (id: string, createdAt: Date): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(BatchRun).createQueryBuilder()
        .update(BatchRun)
        .set({ createdAt })
        .where('id = :id', { id })
        .execute()
}

/** 创建最小 Repository 实体（满足 ScanRun.repository FK 约束） */
const createRepo = async (id: string): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    const repoRepo = ds.getRepository(Repository)
    await repoRepo.save(repoRepo.create({
        id,
        organizationId: null,
        owner: 'test-owner',
        name: `test-repo-${id}`,
        defaultBranch: 'main',
        packageManager: 'pnpm',
        executorKind: 'container',
    }))
}

/** 创建最小 BatchRun 实体 */
const createBatchRun = async (organizationId: string, status: 'running' | 'completed' | 'failed' = 'running', repositoryCount = 1): Promise<BatchRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(BatchRun)
    return repo.save(repo.create({
        organizationId, source: 'manual', mode: 'report-only',
        severityThreshold: 'high', repositoryCount, status,
    }))
}

/** 创建最小 ScanRun 实体 */
const createScanRun = async (params: {
    repositoryId: string
    batchRunId: string
    status: 'running' | 'pending' | 'completed' | 'failed' | 'dispatched'
    startedAt?: Date | null
    finishedAt?: Date | null
    errorJson?: string | null
    executionTimeoutMs?: number | null
}): Promise<ScanRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(ScanRun)
    return repo.save(repo.create({
        repositoryId: params.repositoryId,
        mode: 'report-only',
        severityThreshold: 'high',
        executorKind: 'container',
        batchRunId: params.batchRunId,
        status: params.status,
        startedAt: params.startedAt ?? null,
        finishedAt: params.finishedAt ?? null,
        errorJson: params.errorJson ?? null,
        executionTimeoutMs: params.executionTimeoutMs ?? null,
    }))
}

describe('cleanupStaleRuns', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        await clearAllTables()
    })

    it('空库：无清理动作', async () => {
        const result = await runCleanup()
        expect(result).toEqual({
            scanRunsFailed: 0,
            batchRunsFailed: 0,
            orphanedRuns: [],
            checkedAt: expect.any(String),
        })
    })

    it('running 按自身执行上限快照精判：60 分钟快照在 40 分钟时不算孤儿', async () => {
        // 查询下界用全局默认（30 分钟），但逐 run 精判应按快照（60 分钟）→ 不得误杀长预算运行
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-long')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({
            repositoryId: 'repo-long', batchRunId: batch.id, status: 'running',
            startedAt: new Date(), executionTimeoutMs: 60 * 60 * 1000,
        })
        await backdateScanRun(run.id, new Date(Date.now() - 40 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(0)
    })

    it('running 无快照时回退全局默认：40 分钟前启动仍判孤儿', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-legacy')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({
            repositoryId: 'repo-legacy', batchRunId: batch.id, status: 'running',
            startedAt: new Date(), executionTimeoutMs: null,
        })
        await backdateScanRun(run.id, new Date(Date.now() - 40 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(1)
    })

    it('orphanedRuns：返回被清理 run 的仓库 + runId（供按归属释放队列 job）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        const a = await createScanRun({ repositoryId: 'repo-x', batchRunId: batch.id, status: 'running', startedAt: new Date() })
        const b = await createScanRun({ repositoryId: 'repo-x', batchRunId: batch.id, status: 'running', startedAt: new Date() })
        await backdateScanRun(a.id, new Date(Date.now() - 31 * 60 * 1000))
        await backdateScanRun(b.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(2)
        expect(result.orphanedRuns).toHaveLength(2)
        expect(result.orphanedRuns).toEqual(expect.arrayContaining([
            { repositoryId: 'repo-x', runId: a.id },
            { repositoryId: 'repo-x', runId: b.id },
        ]))
    })

    it('isPendingOrphan=false：pending run 仍在队列中排队 → 跳过且不误杀 BatchRun', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        const scan = await createScanRun({ repositoryId: 'repo-x', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(scan.id, scan.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 31 * 60 * 1000))
        await backdateBatchRun(batch.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup({ isPendingOrphan: async () => false })
        expect(result.scanRunsFailed).toBe(0)
        expect(result.orphanedRuns).toEqual([])

        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: scan.id } })
        expect(reloaded?.status).toBe('pending') // 合法排队，未被误杀
        const reloadedBatch = await batchRepo.findOne({ where: { id: batch.id } })
        expect(reloadedBatch?.status).toBe('running') // 无 stale 子 run，批次不被终结
    })

    it('isPendingOrphan=true：pending run 无 live job → 按孤儿清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        const scan = await createScanRun({ repositoryId: 'repo-x', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(scan.id, scan.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup({ isPendingOrphan: async () => true })
        expect(result.scanRunsFailed).toBe(1)
        expect(result.orphanedRuns).toEqual([{ repositoryId: 'repo-x', runId: scan.id }])
        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: scan.id } })
        expect(reloaded?.status).toBe('failed')
    })

    it('isPendingOrphan 只作用于 pending：running 仍强制失败', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        const scan = await createScanRun({ repositoryId: 'repo-x', batchRunId: batch.id, status: 'running', startedAt: new Date() })
        await backdateScanRun(scan.id, new Date(Date.now() - 31 * 60 * 1000))
        const isPendingOrphan = vi.fn().mockResolvedValue(false)

        const result = await runCleanup({ isPendingOrphan })
        expect(result.scanRunsFailed).toBe(1)
        expect(isPendingOrphan).not.toHaveBeenCalled()
    })

    it('isPendingOrphan 抛错（队列抖动）：保守跳过 pending，且不中断整轮清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-pending')
        await createRepo('repo-running')
        const batch = await createBatchRun(organizationId, 'running', 2)
        const pendingRun = await createScanRun({ repositoryId: 'repo-pending', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(pendingRun.id, pendingRun.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 31 * 60 * 1000))
        const runningRun = await createScanRun({ repositoryId: 'repo-running', batchRunId: batch.id, status: 'running', startedAt: new Date() })
        await backdateScanRun(runningRun.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup({
            isPendingOrphan: async () => {
                throw new Error('redis unavailable')
            },
        })
        // 仅 running 被清理；pending 查询失败 → 保守跳过（不误杀）
        expect(result.scanRunsFailed).toBe(1)
        expect(result.orphanedRuns).toEqual([{ repositoryId: 'repo-running', runId: runningRun.id }])
        const reloadedPending = await ds.getRepository(ScanRun).findOne({ where: { id: pendingRun.id } })
        expect(reloadedPending?.status).toBe('pending')
    })

    it('stale ScanRun（running + startedAt >30min ago）：force failed + errorJson 标 orphan_run', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        const scan = await createScanRun({
            repositoryId: 'repo-x', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        // backdate startedAt 到 31 分钟前
        await backdateScanRun(scan.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(1)
        expect(result.batchRunsFailed).toBe(0)

        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: scan.id } })
        expect(reloaded?.status).toBe('failed')
        expect(reloaded?.finishedAt).toBeInstanceOf(Date)
        expect(JSON.parse(reloaded?.errorJson ?? '{}')).toMatchObject({ code: 'orphan_run' })
        // 孤儿清理是最常见的失败来源，同样落失败分类（runtime + transient，可重试）
        expect(reloaded?.failureCode).toBe('orphan_run')
        expect(reloaded?.failureStage).toBe('runtime')
        expect(reloaded?.failureKind).toBe('transient')
    })

    it('pending ScanRun（无 startedAt）+ createdAt backdated >30min：force failed', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        const scan = await createScanRun({
            repositoryId: 'repo-x', batchRunId: batch.id, status: 'pending', startedAt: null,
        })
        // backdate createdAt 到 31 分钟前
        await backdateScanRun(scan.id, scan.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(1)
        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: scan.id } })
        expect(reloaded?.status).toBe('failed')
    })

    it('BatchRun 下属有 stale scan：force failed + finishedAt', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        await createRepo('repo-stale')
        await createRepo('repo-fresh')
        const batch = await createBatchRun(organizationId, 'running', 2)
        // 子 run 1：stale running（应被清理）
        const stale = await createScanRun({
            repositoryId: 'repo-stale', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        await backdateScanRun(stale.id, new Date(Date.now() - 31 * 60 * 1000))
        // 子 run 2：合法的 running（startedAt 在阈值内）— 不应被影响
        const fresh = await createScanRun({
            repositoryId: 'repo-fresh', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        // batchRun 自身 backdate（确保超过 batchRunTimeoutMs）
        await backdateBatchRun(batch.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(1)
        expect(result.batchRunsFailed).toBe(1)

        const reloadedBatch = await batchRepo.findOne({ where: { id: batch.id } })
        expect(reloadedBatch?.status).toBe('failed')
        expect(reloadedBatch?.finishedAt).toBeInstanceOf(Date)

        const reloadedFresh = await ds.getRepository(ScanRun).findOne({ where: { id: fresh.id } })
        expect(reloadedFresh?.status).toBe('running') // 未被误杀
    })

    it('BatchRun 写回为条件更新（乐观锁 = 读取时 running），不再整行 save', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        await createRepo('repo-cond')
        const batch = await createBatchRun(organizationId, 'running', 1)
        const stale = await createScanRun({
            repositoryId: 'repo-cond', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        await backdateScanRun(stale.id, new Date(Date.now() - 31 * 60 * 1000))
        await backdateBatchRun(batch.id, new Date(Date.now() - 31 * 60 * 1000))

        const updateSpy = vi.spyOn(batchRepo, 'update')
        const saveSpy = vi.spyOn(batchRepo, 'save')
        const result = await runCleanup()

        expect(result.batchRunsFailed).toBe(1)
        // 条件写回：WHERE id + status='running'，payload 仅失败终态 + finishedAt + 空 summary 兜底
        expect(updateSpy).toHaveBeenCalledWith(
            { id: batch.id, status: 'running' },
            expect.objectContaining({ status: 'failed', finishedAt: expect.any(Date) }),
        )
        const [, payload] = updateSpy.mock.calls[0]!
        expect(payload).not.toHaveProperty('finishedCount')
        expect(payload).not.toHaveProperty('completedCount')
        // 失败路径不再整行 save（构造阶段之外的写库只走条件 update）
        expect(saveSpy).not.toHaveBeenCalled()

        updateSpy.mockRestore()
        saveSpy.mockRestore()
    })

    it('并发 force-fail 抢先（批次条件写回 affected=0）：batchRunsFailed 不计数，库保持并发终态', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        await createRepo('repo-race')
        const batch = await createBatchRun(organizationId, 'running', 1)
        const stale = await createScanRun({
            repositoryId: 'repo-race', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        await backdateScanRun(stale.id, new Date(Date.now() - 31 * 60 * 1000))
        await backdateBatchRun(batch.id, new Date(Date.now() - 31 * 60 * 1000))

        const concurrentAt = new Date('2026-10-08T00:00:00Z')
        const originalUpdate = batchRepo.update.bind(batchRepo)
        // 在批次条件写回落库前注入并发 admin force-fail（走 query builder，避免包裹自身递归）
        batchRepo.update = (async (criteria: unknown, partial: unknown) => {
            await batchRepo.createQueryBuilder()
                .update(BatchRun)
                .set({ status: 'failed', finishedAt: concurrentAt })
                .where('id = :id', { id: batch.id })
                .execute()
            return originalUpdate(criteria as never, partial as never)
        }) as typeof batchRepo.update

        try {
            const result = await runCleanup()
            expect(result.scanRunsFailed).toBe(1)
            // 条件不匹配 → 不计入 batchRunsFailed（不虚报），且不覆盖并发终态
            expect(result.batchRunsFailed).toBe(0)
            const reloaded = await batchRepo.findOne({ where: { id: batch.id } })
            expect(reloaded?.status).toBe('failed')
            expect(reloaded?.finishedAt?.toISOString()).toBe(concurrentAt.toISOString())
        } finally {
            batchRepo.update = originalUpdate
        }
    })

    it('BatchRun 下属都合法：BatchRun 不被 force fail（避免误杀慢批次）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        await createRepo('repo-x')
        const batch = await createBatchRun(organizationId)
        // createScanRun 返回值忽略：合法 run 的存在是关键（cleanupStaleRuns 通过 batchRunId 查找）
        await createScanRun({
            repositoryId: 'repo-x', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        await backdateBatchRun(batch.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await runCleanup()
        expect(result.batchRunsFailed).toBe(0) // 没有 stale 子 run，不应误杀

        const reloadedBatch = await batchRepo.findOne({ where: { id: batch.id } })
        expect(reloadedBatch?.status).toBe('running')
    })

    it('已完成 / 已失败的 run 不会被重复处理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-c')
        await createRepo('repo-f')
        const batch = await createBatchRun(organizationId, 'completed', 2)
        const completedRun = await createScanRun({
            repositoryId: 'repo-c', batchRunId: batch.id,
            status: 'completed', startedAt: new Date(), finishedAt: new Date(),
        })
        const failedRun = await createScanRun({
            repositoryId: 'repo-f', batchRunId: batch.id,
            status: 'failed', startedAt: new Date(), finishedAt: new Date(),
            errorJson: JSON.stringify({ code: 'execution_failed', message: 'test' }),
        })
        // backdate 都不影响（只有 running/pending 才会被处理）
        await backdateScanRun(completedRun.id, new Date(Date.now() - 60 * 60 * 1000))
        await backdateScanRun(failedRun.id, new Date(Date.now() - 60 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(0)
        expect(result.batchRunsFailed).toBe(0)
    })

    it('自定义阈值：1ms 阈值下所有 running run 都会被清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        await createRepo('repo-a')
        await createRepo('repo-b')
        const batch = await createBatchRun(organizationId, 'running', 2)
        const runs = await Promise.all([
            createScanRun({
                repositoryId: 'repo-a', batchRunId: batch.id, status: 'running', startedAt: new Date(),
            }),
            createScanRun({
                repositoryId: 'repo-b', batchRunId: batch.id, status: 'running', startedAt: new Date(),
            }),
        ])
        // 1ms 阈值需要把 run startedAt backdate 到足够早；同时 backdate batch
        await Promise.all(runs.map((r) => backdateScanRun(r.id, new Date(Date.now() - 1000))))
        await backdateBatchRun(batch.id, new Date(Date.now() - 1000))

        const result = await runCleanup({ scanRunTimeoutMs: 1, batchRunTimeoutMs: 1 })
        expect(result.scanRunsFailed).toBe(2)
        expect(result.batchRunsFailed).toBe(1)

        for (const r of runs) {
            const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: r.id } })
            expect(reloaded?.status).toBe('failed')
        }

        const reloadedBatch = await batchRepo.findOne({ where: { id: batch.id } })
        expect(reloadedBatch?.status).toBe('failed')
    })

    /** 构造队列探针：默认 job 归属当前 pending run、waiting、有消费者 */
    const makeProbe = (overrides: Partial<QueueJobProbe> = {}): QueueJobProbe => ({
        inspect: vi.fn().mockResolvedValue({
            jobId: 'scan-repo-pending',
            state: 'waiting',
            runId: null,
            runIdKey: '',
            ageMs: 60_000,
        }),
        hasConsumers: vi.fn().mockResolvedValue(true),
        ...overrides,
    })

    it('running + startedAt 为 NULL（脏数据）：按 createdAt 回退命中并清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-null')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-null', batchRunId: batch.id, status: 'running', startedAt: null })
        // startedAt 保持 NULL，仅 backdate createdAt
        await backdateScanRunCreatedAt(run.id, new Date(Date.now() - 36 * 60 * 1000))

        const result = await runCleanup()
        expect(result.scanRunsFailed).toBe(1)
        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
        expect(reloaded?.status).toBe('failed')
        expect(JSON.parse(reloaded?.errorJson ?? '{}')).toMatchObject({ code: 'orphan_run' })
    })

    it('pending + 队列无消费者：判孤儿并清理（不再被 waiting job 一票否决）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-pending')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-pending', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({
            inspect: vi.fn().mockResolvedValue({ jobId: 'scan-repo-pending', state: 'waiting', runId: run.id, ageMs: 10 * 60 * 1000 }),
            hasConsumers: vi.fn().mockResolvedValue(false),
        })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(1)
        expect(result.orphanedRuns).toEqual([{ repositoryId: 'repo-pending', runId: run.id }])
        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
        expect(reloaded?.status).toBe('failed')
    })

    it('pending + 无消费者但 job 年龄不足 2× 宽限：跳过（避免 worker 滚动重启误杀）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-young-job')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-young-job', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({
            // job 年龄 6 分钟 < 2× 5 分钟 → 即便无消费者也不判孤儿
            inspect: vi.fn().mockResolvedValue({ jobId: 'scan-repo-young-job', state: 'waiting', runId: run.id, runIdKey: run.id, ageMs: 6 * 60 * 1000 }),
            hasConsumers: vi.fn().mockResolvedValue(false),
        })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(0)
    })

    it('pending + 有消费者 + job 归属自身且 waiting：合法排队，跳过', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-queue')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-queue', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({
            inspect: vi.fn().mockResolvedValue({ jobId: 'scan-repo-queue', state: 'waiting', runId: run.id, ageMs: 10 * 60 * 1000 }),
            hasConsumers: vi.fn().mockResolvedValue(true),
        })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(0)
        const reloaded = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
        expect(reloaded?.status).toBe('pending')
    })

    it('pending + job 归属另一个已终态 run：判孤儿并清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-owner')
        const batch = await createBatchRun(organizationId)
        const owner = await createScanRun({
            repositoryId: 'repo-owner', batchRunId: batch.id, status: 'failed', startedAt: new Date(), finishedAt: new Date(),
        })
        const run = await createScanRun({ repositoryId: 'repo-owner', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({
            inspect: vi.fn().mockResolvedValue({ jobId: 'scan-repo-owner', state: 'waiting', runId: owner.id, ageMs: 60_000 }),
            hasConsumers: vi.fn().mockResolvedValue(true),
        })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(1)
    })

    it('pending + job 归属另一个非终态 run：保留（不抢占正在排队 / 执行的任务）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-other')
        const batch = await createBatchRun(organizationId)
        const owner = await createScanRun({
            repositoryId: 'repo-other', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        const run = await createScanRun({ repositoryId: 'repo-other', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({
            inspect: vi.fn().mockResolvedValue({ jobId: 'scan-repo-other', state: 'active', runId: owner.id, ageMs: 60_000 }),
            hasConsumers: vi.fn().mockResolvedValue(true),
        })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(0)
    })

    it('pending + job 已终态：判孤儿并清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-terminal')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-terminal', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({
            inspect: vi.fn().mockResolvedValue({ jobId: 'scan-repo-terminal', state: 'failed', runId: run.id, ageMs: 60_000 }),
        })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(1)
    })

    it('pending + job 不存在：判孤儿并清理', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-missing-job')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-missing-job', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({ inspect: vi.fn().mockResolvedValue(null) })

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(1)
    })

    it('pending + 探针抛错（Redis 抖动）：保守跳过，不误杀', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-probe-error')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-probe-error', batchRunId: batch.id, status: 'pending', startedAt: null })
        await backdateScanRun(run.id, run.startedAt as unknown as Date ?? new Date(), new Date(Date.now() - 10 * 60 * 1000))
        const probe = makeProbe({ inspect: vi.fn().mockRejectedValue(new Error('redis unavailable')) })
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(0)
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('并发完成抢先（ScanRun 条件更新 affected=0）：不计数且不覆盖 completed 终态', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const scanRepo = ds.getRepository(ScanRun)
        await createRepo('repo-scan-race')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({
            repositoryId: 'repo-scan-race', batchRunId: batch.id, status: 'running', startedAt: new Date(),
        })
        await backdateScanRun(run.id, new Date(Date.now() - 36 * 60 * 1000))

        const originalCreate = scanRepo.createQueryBuilder.bind(scanRepo)
        let injected = false
        scanRepo.createQueryBuilder = ((alias?: string) => {
            const qb = originalCreate(alias)
            const originalUpdate = qb.update.bind(qb)
            qb.update = ((entity: unknown) => {
                const updateQb = originalUpdate(entity as never)
                if (!injected) {
                    injected = true
                    const originalExecute = updateQb.execute.bind(updateQb)
                    // 在清理的条件 UPDATE 真正执行前，模拟 worker 完成写库
                    // （走 repository.update，避免递归 createQueryBuilder）
                    updateQb.execute = (async () => {
                        await scanRepo.update({ id: run.id }, { status: 'completed', finishedAt: new Date() })
                        return originalExecute()
                    }) as typeof updateQb.execute
                }
                return updateQb
            }) as typeof qb.update
            return qb
        }) as typeof scanRepo.createQueryBuilder

        try {
            const result = await runCleanup()
            expect(result.scanRunsFailed).toBe(0)

            const reloaded = await scanRepo.findOne({ where: { id: run.id } })
            expect(reloaded?.status).toBe('completed')
        } finally {
            scanRepo.createQueryBuilder = originalCreate
        }
    })

    it('findRecentOrphanedRuns：仅取窗口内 failureCode=orphan_run 的 failed run', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const scanRepo = ds.getRepository(ScanRun)
        await createRepo('repo-recent')
        const batch = await createBatchRun(organizationId)

        const recent = await createScanRun({ repositoryId: 'repo-recent', batchRunId: batch.id, status: 'failed', startedAt: new Date(), finishedAt: new Date() })
        await scanRepo.update({ id: recent.id }, { failureCode: 'orphan_run' })
        const wrongCode = await createScanRun({ repositoryId: 'repo-recent', batchRunId: batch.id, status: 'failed', startedAt: new Date(), finishedAt: new Date() })
        await scanRepo.update({ id: wrongCode.id }, { failureCode: 'execution_failed' })
        const tooOld = await createScanRun({ repositoryId: 'repo-recent', batchRunId: batch.id, status: 'failed', startedAt: new Date(), finishedAt: new Date() })
        await scanRepo.update({ id: tooOld.id }, { failureCode: 'orphan_run', finishedAt: new Date(Date.now() - 3 * 60 * 60 * 1000) })
        await createScanRun({ repositoryId: 'repo-recent', batchRunId: batch.id, status: 'running', startedAt: new Date() })

        const result = await findRecentOrphanedRuns()
        expect(result).toEqual([{ repositoryId: 'repo-recent', runId: recent.id }])
    })

    it('running run 不查询队列探针（超时语义与消费者无关）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-running-only')
        const batch = await createBatchRun(organizationId)
        const run = await createScanRun({ repositoryId: 'repo-running-only', batchRunId: batch.id, status: 'running', startedAt: new Date() })
        await backdateScanRun(run.id, new Date(Date.now() - 36 * 60 * 1000))
        const probe = makeProbe()

        const result = await runCleanup({ queueJobProbe: probe })
        expect(result.scanRunsFailed).toBe(1)
        expect(probe.inspect).not.toHaveBeenCalled()
        expect(probe.hasConsumers).not.toHaveBeenCalled()
    })
})
