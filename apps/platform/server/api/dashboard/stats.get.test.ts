import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import statsHandler from './stats.get'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = () => statsHandler(makeEvent('GET', '/api/dashboard/stats'))

describe('GET /api/dashboard/stats', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns zeroed stats on fresh database', async () => {
        const stats = await call() as Record<string, unknown>
        expect(stats).toEqual({
            repositoryCount: 0,
            alertsTotal: 0,
            severityCounts: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
            fixedCount: 0,
            latestRun: null,
        })
    })

    it('aggregates repositories, alerts and latest run', async () => {
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: created.id,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: '原型污染',
            fixable: true,
            fixStatus: 'success',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            severity: 'critical',
            packageName: 'axios',
            manifestPath: 'package.json',
            summary: 'SSRF',
            fixable: false,
            fixStatus: 'pending',
        }))

        const stats = await call() as Record<string, unknown>
        expect(stats).toMatchObject({
            repositoryCount: 1,
            alertsTotal: 2,
            severityCounts: { critical: 1, high: 1, medium: 0, low: 0, unknown: 0 },
            fixedCount: 1,
        })
        expect((stats.latestRun as Record<string, unknown>)).toMatchObject({
            repository: 'demo/app',
            status: 'completed',
        })
    })
})
