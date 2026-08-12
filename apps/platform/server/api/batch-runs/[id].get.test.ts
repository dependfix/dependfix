import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import batchRunsIdHandler from './[id].get'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (method: string, url: string, params: Record<string, string> = {}) => batchRunsIdHandler(makeEvent(method, url, undefined, {}, params))

describe('GET /api/batch-runs/[id]', () => {
    let batchRunId: string
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id

        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batch = await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 1,
            status: 'running',
        }))
        batchRunId = batch.id

        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            batchRunId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns batch run detail with aggregated statistics and write-back', async () => {
        const detail = await call('GET', `/api/batch-runs/${batchRunId}`, { id: batchRunId }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: batchRunId,
            status: 'completed',
            completedCount: 1,
            finishedCount: 1,
            runs: [{ status: 'completed' }],
        })
        // 聚合统计已写回 BatchRun（查询时更新策略）
        const ds = await ensureDatabaseInitialized()
        const persisted = await ds.getRepository(BatchRun).findOne({ where: { id: batchRunId } })
        expect(persisted?.status).toBe('completed')
        expect(persisted?.finishedCount).toBe(1)
        expect(persisted?.finishedAt).toBeTruthy()
    })

    it('returns 404 for unknown batch run', async () => {
        await expectError(call('GET', '/api/batch-runs/nonexistent', { id: 'nonexistent' }), 404)
    })
})
