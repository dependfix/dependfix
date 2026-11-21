import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase, makeEvent } from '../../../../tests/api-helper'
import resumeHandler from './resume.post'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { Repository } from '#server/entities/repository'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const { executeBatchRunMock } = vi.hoisted(() => ({ executeBatchRunMock: vi.fn() }))
vi.mock('#server/services/batch/batch-executor', () => ({ executeBatchRun: executeBatchRunMock }))

const call = (id: string) => resumeHandler(makeEvent('POST', `/api/batch-runs/${id}/resume`, undefined, {}, { id }))

const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(BatchRun).clear()
    await ds.getRepository(Repository).clear()
}

const ensureRepo = async (id: string): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Repository)
    await repo.save(repo.create({
        id,
        organizationId: null,
        owner: 'test-owner',
        name: `test-repo-${id}`,
        defaultBranch: 'main',
        packageManager: 'pnpm',
        executorKind: 'container',
    }))
}

const makeBatch = async (overrides: Partial<BatchRun> = {}): Promise<BatchRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(BatchRun)
    const organizationId = await resolveOrganizationId(ds)
    return repo.save(repo.create({
        organizationId,
        source: 'manual',
        mode: 'fix',
        severityThreshold: 'high',
        repositoryCount: 2,
        status: 'failed',
        finishedAt: new Date(),
        ...overrides,
    }))
}

const makeRun = async (batchId: string, repositoryId: string, overrides: Partial<ScanRun> = {}): Promise<ScanRun> => {
    await ensureRepo(repositoryId)
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(ScanRun)
    return repo.save(repo.create({
        repositoryId,
        mode: 'fix',
        severityThreshold: 'high',
        executorKind: 'container',
        batchRunId: batchId,
        status: 'failed',
        startedAt: new Date(),
        finishedAt: new Date(),
        failureKind: 'transient',
        ...overrides,
    }))
}

describe('POST /api/batch-runs/[id]/resume', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        executeBatchRunMock.mockResolvedValue({ batchRunId: 'resumed-batch', repositoryCount: 1 })
        await clearAllTables()
    })

    it('缺少 id：400', async () => {
        await expect(resumeHandler(makeEvent('POST', '/api/batch-runs//resume', undefined, {}, {}))).rejects.toMatchObject({ statusCode: 400 })
    })

    it('批次不存在：404', async () => {
        await expect(call('missing')).rejects.toMatchObject({ statusCode: 404 })
    })

    it('仍有进行中子项：409 且不派发新批次', async () => {
        const batch = await makeBatch()
        await makeRun(batch.id, 'repo-a', { status: 'running', finishedAt: null })
        await expect(call(batch.id)).rejects.toMatchObject({ statusCode: 409, data: { code: 'BATCH_RUN_RESUME_IN_PROGRESS' } })
        expect(executeBatchRunMock).not.toHaveBeenCalled()
    })

    it('没有 transient 子项：409', async () => {
        const batch = await makeBatch()
        await makeRun(batch.id, 'repo-a', { failureKind: 'deterministic' })
        await makeRun(batch.id, 'repo-b', { status: 'completed', failureKind: null })
        await expect(call(batch.id)).rejects.toMatchObject({ statusCode: 409, data: { code: 'BATCH_RUN_RESUME_NOTHING_TO_RESUME' } })
        expect(executeBatchRunMock).not.toHaveBeenCalled()
    })

    it('已有进行中的续跑批次：409（批次级互斥）', async () => {
        const batch = await makeBatch()
        await makeRun(batch.id, 'repo-a')
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(BatchRun)
        await repo.save(repo.create({
            organizationId: batch.organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 1,
            status: 'running',
            resumedFromBatchRunId: batch.id,
        }))
        await expect(call(batch.id)).rejects.toMatchObject({ statusCode: 409, data: { code: 'BATCH_RUN_RESUME_ALREADY_RESUMING' } })
    })

    it('只派发 transient 失败子项并记录来源批次', async () => {
        const batch = await makeBatch()
        await makeRun(batch.id, 'repo-a', { failureKind: 'transient' })
        await makeRun(batch.id, 'repo-b', { failureKind: 'deterministic' })
        await makeRun(batch.id, 'repo-c', { failureKind: 'transient' })

        const result = await call(batch.id) as { batchRunId: string, repositoryCount: number, skippedCount: number }
        expect(result).toMatchObject({ batchRunId: 'resumed-batch', repositoryCount: 1, skippedCount: 1 })
        expect(executeBatchRunMock).toHaveBeenCalledWith(expect.objectContaining({
            source: 'manual',
            repositoryIds: ['repo-a', 'repo-c'],
            resumedFromBatchRunId: batch.id,
            triggeredByUserId: 'u1',
            request: { mode: 'fix', severityThreshold: 'high' },
        }))
        const ds = await ensureDatabaseInitialized()
        const audit = await ds.getRepository(AuditEvent).findOne({ where: { type: 'batch_run_resumed' } })
        expect(audit).toBeTruthy()
        expect(JSON.parse(audit?.payloadJson ?? '{}')).toMatchObject({
            sourceBatchRunId: batch.id,
            batchRunId: 'resumed-batch',
            repositoryIds: ['repo-a', 'repo-c'],
        })
    })
})
