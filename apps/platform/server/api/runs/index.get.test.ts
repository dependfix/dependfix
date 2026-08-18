import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import runsHandler from './index.get'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string) => runsHandler(makeEvent(method, url))

const createRepo = async () => {
    const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
        owner: 'demo',
        name: 'app',
        platform: 'github',
        packageManager: 'pnpm',
        defaultBranch: 'main',
        executorKind: 'container',
    })) as { id: string }
    return created.id
}

describe('GET /api/runs', () => {
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        repositoryId = await createRepo()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty list on fresh database', async () => {
        expect(await call('GET', '/api/runs')).toEqual([])
    })

    it('lists scan runs with repository relation', async () => {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsTotal: 2 }),
        }))

        const list = await call('GET', '/api/runs') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
            owner: 'demo',
            name: 'app',
            status: 'completed',
            summary: { alertsTotal: 2 },
        })
    })

    it('filters by repositoryId query', async () => {
        const all = await call('GET', '/api/runs') as Record<string, unknown>[]
        const filtered = await call('GET', `/api/runs?repositoryId=${repositoryId}`) as Record<string, unknown>[]
        expect(filtered).toHaveLength(all.length)

        const none = await call('GET', '/api/runs?repositoryId=nonexistent') as Record<string, unknown>[]
        expect(none).toEqual([])
    })
})
