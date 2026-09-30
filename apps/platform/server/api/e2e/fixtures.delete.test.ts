import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import fixturesDeleteHandler from './fixtures.delete'
import fixturesPostHandler from './fixtures.post'
import { ensureDatabaseInitialized } from '#server/database'
import { PRCheck } from '#server/entities/pr-check'

/**
 * DELETE /api/e2e/fixtures 双门控（todo.md §M22.6 + docs/standards/platform.md §3.6）：
 * 与 POST /api/e2e/fixtures 同模式 —— E2E_TEST !== 'true' || !runtimeConfig.e2eFixturesAllowed → 404。
 *
 * 测试 200 路径用空 body `{}`：deleteBodySchema.repos .optional()，safeParse 成功后
 * repos.length=0 时 early return { deleted: { repos: 0, scanRuns: 0, scanResults: 0 } }，
 * 不调 ensureDatabaseInitialized；setupMemoryDatabase 仅用于环境隔离，不走 DataSource 建表。
 * runtimeConfig.e2eFixturesAllowed=true 通过 vi.stubGlobal stub。
 */
describe('DELETE /api/e2e/fixtures 双门控（todo.md §M22.6）', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('默认（E2E_TEST unset）→ 404', async () => {
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: false }))
        await expectError(fixturesDeleteHandler(makeEvent('DELETE', '/api/e2e/fixtures', {})), 404)
    })

    it('E2E_TEST=true + e2eFixturesAllowed=false → 404（双门控 runtimeConfig 兜底）', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: false }))
        await expectError(fixturesDeleteHandler(makeEvent('DELETE', '/api/e2e/fixtures', {})), 404)
    })

    it('E2E_TEST=true + e2eFixturesAllowed=true → 200（双门控放行）', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: true }))
        const result = await fixturesDeleteHandler(makeEvent('DELETE', '/api/e2e/fixtures', {})) as { deleted: { repos: number, scanRuns: number, scanResults: number, prChecks: number } }
        expect(result).toEqual({ deleted: { repos: 0, scanRuns: 0, scanResults: 0, prChecks: 0 } })
    })

    /**
     * prChecks 级联删除：视觉套件每次先 DELETE 再 seed，
     * 若 PRCheck 未纳入级联，重复运行会因复合唯一索引冲突 / 行数漂移破坏基线。
     */
    it('按 repos 级联删除 prChecks', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: true }))
        await fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {
            repos: [{ owner: 'delete-fixture', name: 'with-pr-check' }],
            prChecks: [{
                repositoryOwner: 'delete-fixture',
                repositoryName: 'with-pr-check',
                prNumber: 201,
                headSha: '9'.repeat(40),
                authorLogin: 'dependfix[bot]',
                conclusion: 'failure',
                lastPolledAt: '2026-08-28T02:00:00.000Z',
            }],
        }))

        const ds = await ensureDatabaseInitialized()
        expect(await ds.getRepository(PRCheck).count({ where: { prNumber: 201 } })).toBe(1)

        const result = await fixturesDeleteHandler(makeEvent('DELETE', '/api/e2e/fixtures', {
            repos: [{ owner: 'delete-fixture', name: 'with-pr-check' }],
        })) as { deleted: { repos: number, scanRuns: number, scanResults: number, prChecks: number } }
        expect(result.deleted.prChecks).toBe(1)
        expect(result.deleted.repos).toBe(1)
        expect(await ds.getRepository(PRCheck).count({ where: { prNumber: 201 } })).toBe(0)
    })
})
