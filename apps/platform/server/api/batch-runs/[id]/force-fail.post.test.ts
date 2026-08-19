import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { setupMemoryDatabase, teardownMemoryDatabase, makeEvent } from '../../../../tests/api-helper'
import forceFailHandler from './force-fail.post'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (id: string) => forceFailHandler(makeEvent('POST', `/api/batch-runs/${id}/force-fail`, undefined, {}, { id }))

const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(BatchRun).clear()
    await ds.getRepository(Repository).clear()
}

const createRepo = async (id: string): Promise<void> => {
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

describe('POST /api/batch-runs/[id]/force-fail', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        await clearAllTables()
    })

    it('空 id：400 Bad Request', async () => {
        await expect(forceFailHandler(makeEvent('POST', '/api/batch-runs//force-fail', undefined, {}, {}))).rejects.toMatchObject({ statusCode: 400 })
    })

    it('BatchRun 不存在：404 Not Found', async () => {
        await expect(call('non-existent')).rejects.toMatchObject({ statusCode: 404 })
    })

    it('running BatchRun + 子 run：force failed + 子 run failed', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)
        const scanRepo = ds.getRepository(ScanRun)
        await createRepo('repo-running')
        await createRepo('repo-pending')
        await createRepo('repo-done')

        const batch = await batchRepo.save(batchRepo.create({
            organizationId, source: 'manual', mode: 'report-only',
            severityThreshold: 'high', repositoryCount: 2, status: 'running',
        }))
        const runningRun = await scanRepo.save(scanRepo.create({
            repositoryId: 'repo-running',
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            batchRunId: batch.id,
            status: 'running',
            startedAt: new Date(),
        }))
        const pendingRun = await scanRepo.save(scanRepo.create({
            repositoryId: 'repo-pending',
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            batchRunId: batch.id,
            status: 'pending',
            startedAt: null,
        }))
        const completedRun = await scanRepo.save(scanRepo.create({
            repositoryId: 'repo-done',
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            batchRunId: batch.id,
            status: 'completed',
            startedAt: new Date(),
            finishedAt: new Date(),
        }))

        const result = await call(batch.id) as Record<string, unknown>
        expect(result).toMatchObject({
            batchRunId: batch.id,
            scanRunsFailed: 2, // 仅 running + pending
            alreadyTerminated: false,
            status: 'failed',
        })
        expect(result.finishedAt).not.toBeNull()

        const reloadedBatch = await batchRepo.findOne({ where: { id: batch.id } })
        expect(reloadedBatch?.status).toBe('failed')
        expect(reloadedBatch?.finishedAt).toBeInstanceOf(Date)

        const r1 = await scanRepo.findOne({ where: { id: runningRun.id } })
        expect(r1?.status).toBe('failed')
        expect(JSON.parse(r1?.errorJson ?? '{}')).toMatchObject({ code: 'force_failed' })

        const r2 = await scanRepo.findOne({ where: { id: pendingRun.id } })
        expect(r2?.status).toBe('failed')

        // 已 completed 的 run 不被影响
        const r3 = await scanRepo.findOne({ where: { id: completedRun.id } })
        expect(r3?.status).toBe('completed')
    })

    it('已终态 BatchRun（completed）：幂等返回 alreadyTerminated=true，不重写', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)

        const finishedAt = new Date('2026-08-19T00:00:00.000Z')
        const batch = await batchRepo.save(batchRepo.create({
            organizationId, source: 'manual', mode: 'report-only',
            severityThreshold: 'high', repositoryCount: 1, status: 'completed',
            finishedAt,
        }))

        const result = await call(batch.id) as Record<string, unknown>
        expect(result).toMatchObject({
            batchRunId: batch.id,
            scanRunsFailed: 0,
            alreadyTerminated: true,
            status: 'completed',
        })
        expect((result.finishedAt as Date).toISOString()).toBe(finishedAt.toISOString())

        // finishedAt 未被改写
        const reloaded = await batchRepo.findOne({ where: { id: batch.id } })
        expect(reloaded?.finishedAt?.toISOString()).toBe(finishedAt.toISOString())
    })

    it('已失败 BatchRun（failed）：幂等返回 alreadyTerminated=true', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batchRepo = ds.getRepository(BatchRun)

        const batch = await batchRepo.save(batchRepo.create({
            organizationId, source: 'manual', mode: 'report-only',
            severityThreshold: 'high', repositoryCount: 1, status: 'failed',
            finishedAt: new Date(),
        }))

        const result = await call(batch.id) as Record<string, unknown>
        expect(result).toMatchObject({
            scanRunsFailed: 0,
            alreadyTerminated: true,
            status: 'failed',
        })
    })
})
