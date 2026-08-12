import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import batchImportHandler from './batch.post'
import reposIndexHandler from './index'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (body?: unknown) => batchImportHandler(makeEvent('POST', '/api/repos/batch', body))

const repoItem = (owner: string, name: string) => ({
    owner,
    name,
    platform: 'github',
    defaultBranch: 'main',
    packageManager: 'pnpm',
    executorKind: 'container',
})

describe('POST /api/repos/batch', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rejects invalid body with 400', async () => {
        await expectError(call({ repos: [{ owner: 'x' }] }), 400)
        await expectError(call({}), 400)
    })

    it('imports new repositories and skips duplicates', async () => {
        await reposIndexHandler(makeEvent('POST', '/api/repos', repoItem('demo', 'existing')))

        const result = await call({
            repos: [
                repoItem('demo', 'existing'),
                repoItem('demo', 'new-a'),
                repoItem('demo', 'new-b'),
            ],
        }) as Record<string, unknown>
        expect(result).toEqual({
            results: [
                { owner: 'demo', name: 'existing', imported: false, skipped: true },
                { owner: 'demo', name: 'new-a', imported: true, skipped: false },
                { owner: 'demo', name: 'new-b', imported: true, skipped: false },
            ],
            imported: 2,
            skipped: 1,
        })

        // 列表确认只新增 2 个
        const list = await reposIndexHandler(makeEvent('GET', '/api/repos')) as Array<Record<string, unknown>>
        expect(list).toHaveLength(3)
    })

    it('rejects empty repos array with 400 (at least one repository required)', async () => {
        await expectError(call({ repos: [] }), 400)
    })
})
