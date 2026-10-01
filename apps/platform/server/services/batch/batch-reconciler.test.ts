import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import { reconcileRunningBatchRuns } from './batch-reconciler'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun, type ScanRunStatus } from '#server/entities/scan-run'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(BatchRun).clear()
    await ds.getRepository(Repository).clear()
}

const backdateBatchRun = async (id: string, createdAt: Date): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(BatchRun).createQueryBuilder()
        .update(BatchRun)
        .set({ createdAt })
        .where('id = :id', { id })
        .execute()
}

/** 绕过 @UpdateDateColumn 自动覆盖，把 updated_at 拨回过去（用于验证写回推进 updatedAt） */
const backdateBatchUpdatedAt = async (id: string, updatedAt: Date): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(BatchRun).createQueryBuilder()
        .update(BatchRun)
        .set({ updatedAt })
        .where('id = :id', { id })
        .execute()
}

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

const createBatchRun = async (organizationId: string, status: 'running' | 'completed' | 'failed' = 'running', repositoryCount = 1): Promise<BatchRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(BatchRun)
    return repo.save(repo.create({
        organizationId, source: 'manual', mode: 'report-only',
        severityThreshold: 'high', repositoryCount, status,
    }))
}

const createScanRun = async (params: {
    repositoryId: string
    batchRunId: string
    status: ScanRunStatus
    finishedAt?: Date | null
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
        startedAt: new Date(),
        finishedAt: params.finishedAt ?? null,
    }))
}

describe('reconcileRunningBatchRuns', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        await clearAllTables()
    })

    it('空库：无对账动作', async () => {
        const result = await reconcileRunningBatchRuns()
        expect(result).toEqual({
            scanned: 0,
            completed: 0,
            progressUpdated: 0,
            orphaned: 0,
            checkedAt: expect.any(String),
        })
    })

    it('子项全部终态但父批次 running：终结为 completed，finishedAt = max(子项 finishedAt)', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        await createRepo('repo-b')
        const batch = await createBatchRun(organizationId, 'running', 2)
        const earlier = new Date('2026-09-04T03:00:00Z')
        const later = new Date('2026-09-04T04:00:00Z')
        await createScanRun({ repositoryId: 'repo-a', batchRunId: batch.id, status: 'completed', finishedAt: earlier })
        await createScanRun({ repositoryId: 'repo-b', batchRunId: batch.id, status: 'failed', finishedAt: later })

        const result = await reconcileRunningBatchRuns()
        expect(result.scanned).toBe(1)
        expect(result.completed).toBe(1)
        expect(result.progressUpdated).toBe(0)
        expect(result.orphaned).toBe(0)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('completed')
        expect(reloaded?.finishedCount).toBe(2)
        expect(reloaded?.failedCount).toBe(1)
        expect(reloaded?.pendingCount).toBe(0)
        // 真实完成时间 = 最晚子项 finishedAt，而非对账触发时刻
        expect(reloaded?.finishedAt?.toISOString()).toBe(later.toISOString())
    })

    it('子项仍有进行中：只写回进度，状态保持 running 且 finishedAt 为 null', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        await createRepo('repo-b')
        const batch = await createBatchRun(organizationId, 'running', 2)
        await createScanRun({ repositoryId: 'repo-a', batchRunId: batch.id, status: 'completed', finishedAt: new Date() })
        await createScanRun({ repositoryId: 'repo-b', batchRunId: batch.id, status: 'running', finishedAt: null })

        const result = await reconcileRunningBatchRuns()
        expect(result.completed).toBe(0)
        expect(result.progressUpdated).toBe(1)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('running')
        expect(reloaded?.finishedCount).toBe(1)
        expect(reloaded?.completedCount).toBe(1)
        expect(reloaded?.pendingCount).toBe(1)
        expect(reloaded?.finishedAt).toBeNull()
    })

    it('零子项 + 创建超阈值：判定为孤儿 failed', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batch = await createBatchRun(organizationId, 'running', 5)
        await backdateBatchRun(batch.id, new Date(Date.now() - 31 * 60 * 1000))

        const result = await reconcileRunningBatchRuns()
        expect(result.orphaned).toBe(1)
        expect(result.completed).toBe(0)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('failed')
        expect(reloaded?.finishedAt).toBeInstanceOf(Date)
        expect(reloaded?.summaryJson).toBeTruthy()
    })

    it('零子项 + 未超阈值（async 正在建子项）：保持不动', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batch = await createBatchRun(organizationId, 'running', 5)

        const result = await reconcileRunningBatchRuns()
        expect(result.orphaned).toBe(0)
        expect(result.scanned).toBe(1)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('running')
        expect(reloaded?.finishedAt).toBeNull()
    })

    it('已终态批次不在扫描范围内，不被改写', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batch = await createBatchRun(organizationId, 'completed', 1)
        await createRepo('repo-a')
        await createScanRun({ repositoryId: 'repo-a', batchRunId: batch.id, status: 'completed', finishedAt: new Date() })
        await backdateBatchRun(batch.id, new Date(Date.now() - 60 * 60 * 1000))

        const result = await reconcileRunningBatchRuns()
        expect(result.scanned).toBe(0)
        expect(result.completed).toBe(0)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('completed')
    })

    it('写回推进 updatedAt（驱动前端增量 reconcile）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        const batch = await createBatchRun(organizationId, 'running', 1)
        await createScanRun({ repositoryId: 'repo-a', batchRunId: batch.id, status: 'completed', finishedAt: new Date() })
        const past = new Date(Date.now() - 60 * 60 * 1000)
        await backdateBatchUpdatedAt(batch.id, past)

        await reconcileRunningBatchRuns()

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('completed')
        expect(reloaded?.updatedAt.getTime()).toBeGreaterThan(past.getTime())
    })

    it('自定义阈值：1ms 下零子项 running 立即被判孤儿', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batch = await createBatchRun(organizationId, 'running', 3)

        const result = await reconcileRunningBatchRuns({ batchRunTimeoutMs: 1 })
        expect(result.orphaned).toBe(1)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.status).toBe('failed')
    })
})
