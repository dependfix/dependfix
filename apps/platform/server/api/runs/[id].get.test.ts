import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import runsIdHandler from './[id].get'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string, params: Record<string, string> = {}) => runsIdHandler(makeEvent(method, url, undefined, {}, params))

describe('GET /api/runs/[id]', () => {
    let runId: string
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
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsTotal: 1 }),
        }))
        runId = run.id

        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: runId,
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            ruleId: null,
            summary: '原型污染',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.17.21',
            htmlUrl: 'https://github.com/demo/app/security',
            fixStatus: 'pending',
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns run detail with results', async () => {
        const detail = await call('GET', `/api/runs/${runId}`, { id: runId }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: runId,
            owner: 'demo',
            name: 'app',
            status: 'completed',
            summary: { alertsTotal: 1 },
        })
        expect((detail.results as Array<Record<string, unknown>>)).toHaveLength(1)
        expect((detail.results as Array<Record<string, unknown>>)[0]).toMatchObject({
            packageName: 'lodash',
            severity: 'high',
            fixStatus: 'pending',
        })
    })

    it('returns 404 for unknown run id', async () => {
        await expectError(call('GET', '/api/runs/nonexistent', { id: 'nonexistent' }), 404)
    })
})
