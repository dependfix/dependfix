import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import { BatchRun } from '../../entities/batch-run'
import { ScanRun } from '../../entities/scan-run'
import { Repository } from '../../entities/repository'
import { ensureDatabaseInitialized } from '../index'
import { resolveOrganizationId } from '../../utils/organization'
import { applyBatchFinishedAtFixes, computeBatchFinishedAtFixes } from './backfill-batch-finished-at'

const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(BatchRun).clear()
    await ds.getRepository(Repository).clear()
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

const createBatch = async (organizationId: string, finishedAt: Date | null, status: 'completed' | 'failed' | 'running' = 'completed'): Promise<BatchRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(BatchRun)
    return repo.save(repo.create({
        organizationId, source: 'manual', mode: 'report-only',
        severityThreshold: 'high', repositoryCount: 1, status,
        finishedAt,
    }))
}

describe('backfill-batch-finished-at', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        await clearAllTables()
    })

    it('有子项且 finishedAt 与 max(子项) 不一致：可订正', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        const polluted = new Date('2026-10-01T16:39:42Z')
        const real = new Date('2026-09-04T04:04:09Z')
        const batch = await createBatch(organizationId, polluted)
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: 'repo-a', batchRunId: batch.id, mode: 'report-only',
            severityThreshold: 'high', executorKind: 'container', status: 'completed', finishedAt: real,
        }))

        const stats = await computeBatchFinishedAtFixes(ds)
        expect(stats.fixable).toBe(1)
        expect(stats.fixes[0]?.newFinishedAt).toBe(real.toISOString())
    })

    it('无子项：跳过（不伪造完成时间）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createBatch(organizationId, new Date('2026-10-01T16:39:42Z'))

        const stats = await computeBatchFinishedAtFixes(ds)
        expect(stats.fixable).toBe(0)
        expect(stats.skippedNoChild).toBe(1)
    })

    it('多子项：取最晚 finishedAt', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        await createRepo('repo-b')
        const batch = await createBatch(organizationId, new Date('2026-10-01T16:39:42Z'))
        const runs = ds.getRepository(ScanRun)
        await runs.save(runs.create({
            repositoryId: 'repo-a', batchRunId: batch.id, mode: 'report-only',
            severityThreshold: 'high', executorKind: 'container', status: 'failed', finishedAt: new Date('2026-09-04T03:00:00Z'),
        }))
        await runs.save(runs.create({
            repositoryId: 'repo-b', batchRunId: batch.id, mode: 'report-only',
            severityThreshold: 'high', executorKind: 'container', status: 'completed', finishedAt: new Date('2026-09-04T05:00:00Z'),
        }))

        const stats = await computeBatchFinishedAtFixes(ds)
        expect(stats.fixable).toBe(1)
        expect(stats.fixes[0]?.newFinishedAt).toBe('2026-09-04T05:00:00.000Z')
    })

    it('running 批次：跳过（终态未定，交由周期对账）', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        const batch = await createBatch(organizationId, null, 'running')
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: 'repo-a', batchRunId: batch.id, mode: 'report-only',
            severityThreshold: 'high', executorKind: 'container', status: 'completed', finishedAt: new Date('2026-09-04T05:00:00Z'),
        }))

        const stats = await computeBatchFinishedAtFixes(ds)
        expect(stats.fixable).toBe(0)
        expect(stats.skippedRunning).toBe(1)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.finishedAt).toBeNull()
    })

    it('已一致：不重复订正', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        const real = new Date('2026-09-04T04:04:09Z')
        const batch = await createBatch(organizationId, real)
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: 'repo-a', batchRunId: batch.id, mode: 'report-only',
            severityThreshold: 'high', executorKind: 'container', status: 'completed', finishedAt: real,
        }))

        const stats = await computeBatchFinishedAtFixes(ds)
        expect(stats.fixable).toBe(0)
    })

    it('apply：写回 max(子项 finishedAt)', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await createRepo('repo-a')
        const real = new Date('2026-09-04T04:04:09Z')
        const batch = await createBatch(organizationId, new Date('2026-10-01T16:39:42Z'))
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: 'repo-a', batchRunId: batch.id, mode: 'report-only',
            severityThreshold: 'high', executorKind: 'container', status: 'completed', finishedAt: real,
        }))

        const stats = await applyBatchFinishedAtFixes(ds)
        expect(stats.dryRun).toBe(false)

        const reloaded = await ds.getRepository(BatchRun).findOne({ where: { id: batch.id } })
        expect(reloaded?.finishedAt?.toISOString()).toBe(real.toISOString())
    })
})
