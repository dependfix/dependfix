import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import batchRunsHandler from './index.get'
import { BatchRun } from '#server/entities/batch-run'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string) => batchRunsHandler(makeEvent(method, url))

describe('GET /api/batch-runs', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty list on fresh database', async () => {
        expect(await call('GET', '/api/batch-runs')).toEqual([])
    })

    it('lists batch runs of current organization', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 2,
            status: 'running',
            summaryJson: JSON.stringify({ alertsTotal: 3 }),
        }))

        const list = await call('GET', '/api/batch-runs') as Array<Record<string, unknown>>
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
            source: 'manual',
            status: 'running',
            repositoryCount: 2,
            summary: { alertsTotal: 3 },
        })
    })
})
