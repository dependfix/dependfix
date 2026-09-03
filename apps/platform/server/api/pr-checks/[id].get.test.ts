import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import idHandler from './[id].get'
import { PRCheck } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (id: string) => idHandler(makeEvent('GET', `/api/pr-checks/${id}`, undefined, {}, { id }))

describe('GET /api/pr-checks/[id]', () => {
    let prCheckId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const repo = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }

        const ds = await ensureDatabaseInitialized()
        const prRepo = ds.getRepository(PRCheck)
        const saved = await prRepo.save(prRepo.create({
            repositoryId: repo.id,
            prNumber: 42,
            headSha: 'a'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'failure',
            alertFiring: true,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-03T00:00:00Z'),
        }))
        prCheckId = saved.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('返回 PRCheck 详情', async () => {
        const row = await call(prCheckId) as { id: string, conclusion: string }
        expect(row.id).toBe(prCheckId)
        expect(row.conclusion).toBe('failure')
    })

    it('不存在的 id → 404 + PR_CHECK_NOT_FOUND', async () => {
        await expect(call('no-such-id')).rejects.toMatchObject({
            statusCode: 404,
            data: { code: 'PR_CHECK_NOT_FOUND' },
        })
    })

    it('缺 id → 400 + PR_CHECK_ID_MISSING', async () => {
        await expect(idHandler(makeEvent('GET', '/api/pr-checks/', undefined, {}))).rejects.toMatchObject({
            statusCode: 400,
            data: { code: 'PR_CHECK_ID_MISSING' },
        })
    })
})
