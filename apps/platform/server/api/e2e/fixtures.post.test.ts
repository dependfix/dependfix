import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import fixturesPostHandler from './fixtures.post'
import { ensureDatabaseInitialized } from '#server/database'
import { PRCheck } from '#server/entities/pr-check'
import { Repository } from '#server/entities/repository'

/**
 * POST /api/e2e/fixtures 双门控（todo.md §M22.6 + docs/standards/platform.md §3.6）：
 * E2E_TEST !== 'true' || !runtimeConfig.e2eFixturesAllowed → 404
 * 单一 E2E_TEST 门控风险：生产环境误设 E2E_TEST=true 即暴露端点；叠加
 * runtimeConfig.e2eFixturesAllowed（通过 NUXT_E2E_FIXTURES_ALLOWED 运行时覆盖）兜底后，
 * 生产构建默认 false，仅 e2e webServer 启动时显式开启才能调通。
 *
 * 不能用 process.env.NODE_ENV 作第二门控：Nitro/esbuild 构建期把 process.env.NODE_ENV
 * 静态替换为构建时值，prod build 表达式折叠后永远 404（详见 platform.md §3.6 陷阱段）。
 *
 * 测试 200 路径用空 body `{}`：fixturesBodySchema 所有字段 .optional()，safeParse 成功后
 * repos/scanRuns/scanResults 三个 if 块都跳过 → return { repos: [], scanRuns: [], scanResults: [] }，
 * 走完 ensureDatabaseInitialized 真实路径（setupMemoryDatabase stub DATABASE_SYNCHRONIZE=true
 * 让 DataSource.initialize 建表）。runtimeConfig.e2eFixturesAllowed=true 通过 vi.stubGlobal stub。
 */
describe('POST /api/e2e/fixtures 双门控（todo.md §M22.6）', () => {
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
        // setup-nuxt-server.ts 默认 stub e2eFixturesAllowed: false，确保 stub 未污染
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: false }))
        await expectError(fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {})), 404)
    })

    it('E2E_TEST=true + e2eFixturesAllowed=false → 404（双门控 runtimeConfig 兜底）', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: false }))
        await expectError(fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {})), 404)
    })

    it('E2E_TEST=true + e2eFixturesAllowed=true → 200（双门控放行）', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: true }))
        const result = await fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {})) as { repos: unknown[], scanRuns: unknown[], scanResults: unknown[], prChecks: unknown[] }
        expect(result).toEqual({ repos: [], scanRuns: [], scanResults: [], prChecks: [] })
    })

    /**
     * repos[].tags：视觉回归基线需要确定性的标签列渲染（apps/platform/tests/visual/），
     * 故 fixtures 端点支持可选标签。写入口径与 POST /api/repos 一致（JSON 字符串存储；
     * 缺省 / 空数组写 null）。
     */
    it('repos[].tags 落库为 JSON 字符串，缺省 / 空数组写 null', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: true }))
        await fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {
            repos: [
                { owner: 'visual-fixture', name: 'with-tags', tags: ['frontend', 'critical'] },
                { owner: 'visual-fixture', name: 'without-tags' },
                { owner: 'visual-fixture', name: 'empty-tags', tags: [] },
            ],
        }))

        const ds = await ensureDatabaseInitialized()
        const repoRepo = ds.getRepository(Repository)
        const withTags = await repoRepo.findOneByOrFail({ owner: 'visual-fixture', name: 'with-tags' })
        expect(withTags.tags).toBe(JSON.stringify(['frontend', 'critical']))
        const withoutTags = await repoRepo.findOneByOrFail({ owner: 'visual-fixture', name: 'without-tags' })
        expect(withoutTags.tags).toBeNull()
        const emptyTags = await repoRepo.findOneByOrFail({ owner: 'visual-fixture', name: 'empty-tags' })
        expect(emptyTags.tags).toBeNull()
    })

    /**
     * prChecks：视觉回归 pr-checks 页行级基线依赖该写入路径。
     * 幂等键 = 实体复合唯一索引 `(repositoryId, prNumber, headSha)`。
     */
    it('prChecks 落库，重复注入按复合唯一索引幂等复用', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: true }))
        const payload = {
            repos: [{ owner: 'visual-fixture', name: 'pr-check-repo' }],
            prChecks: [{
                repositoryOwner: 'visual-fixture',
                repositoryName: 'pr-check-repo',
                prNumber: 101,
                headSha: '1'.repeat(40),
                authorLogin: 'dependfix[bot]',
                conclusion: 'failure',
                alertFiring: true,
                lastPolledAt: '2026-08-28T02:00:00.000Z',
            }],
        }

        const first = await fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', payload)) as { prChecks: { created: boolean, id: string }[] }
        expect(first.prChecks).toHaveLength(1)
        expect(first.prChecks[0]!.created).toBe(true)

        const second = await fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', payload)) as { prChecks: { created: boolean, id: string }[] }
        expect(second.prChecks[0]!.created).toBe(false)
        expect(second.prChecks[0]!.id).toBe(first.prChecks[0]!.id)

        const ds = await ensureDatabaseInitialized()
        const rows = await ds.getRepository(PRCheck).find({ where: { prNumber: 101 } })
        expect(rows).toHaveLength(1)
        expect(rows[0]!.conclusion).toBe('failure')
        expect(rows[0]!.alertFiring).toBe(true)
        expect(rows[0]!.lastPolledAt.toISOString()).toBe('2026-08-28T02:00:00.000Z')
    })

    it('prChecks 引用未在 repos 载荷中的仓库 → 400', async () => {
        vi.stubEnv('E2E_TEST', 'true')
        vi.stubGlobal('useRuntimeConfig', () => ({ encryptionKey: 'test-encryption-key-32-bytes!!', e2eFixturesAllowed: true }))
        await expectError(fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {
            prChecks: [{
                repositoryOwner: 'visual-fixture',
                repositoryName: 'missing-repo',
                prNumber: 102,
                headSha: '2'.repeat(40),
                authorLogin: 'dependfix[bot]',
                lastPolledAt: '2026-08-28T02:00:00.000Z',
            }],
        })), 400)
    })
})
