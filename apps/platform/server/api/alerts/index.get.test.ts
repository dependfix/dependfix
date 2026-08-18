import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import alertsHandler from './index.get'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (url: string) => alertsHandler(makeEvent('GET', url))

describe('GET /api/alerts', () => {
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
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: '原型污染',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.17.21',
            fixStatus: 'pending',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'code-scanning',
            severity: 'low',
            packageName: '',
            manifestPath: null,
            ruleId: 'eol-last',
            summary: '文件末尾缺少换行',
            fixable: true,
            fixStrategy: 'template',
            fixStatus: 'success',
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns all alerts with repository context', async () => {
        const list = await call('/api/alerts') as Record<string, unknown>[]
        expect(list).toHaveLength(2)
        expect(list[0]).toMatchObject({ repository: 'demo/app', severity: 'high', packageName: 'lodash' })
    })

    it('filters by severity', async () => {
        const list = await call('/api/alerts?severity=low') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ source: 'code-scanning' })
    })

    it('filters by source', async () => {
        const list = await call('/api/alerts?source=dependabot') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ packageName: 'lodash' })
    })

    it('filters by repositoryId', async () => {
        const list = await call(`/api/alerts?repositoryId=${repositoryId}`) as Record<string, unknown>[]
        expect(list).toHaveLength(2)
        const none = await call('/api/alerts?repositoryId=nonexistent') as Record<string, unknown>[]
        expect(none).toEqual([])
    })

    it('treats "all" query values as no filter', async () => {
        const list = await call('/api/alerts?severity=all&source=all&repositoryId=all') as Record<string, unknown>[]
        expect(list).toHaveLength(2)
    })
})
