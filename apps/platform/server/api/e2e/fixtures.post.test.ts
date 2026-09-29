import 'reflect-metadata'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import fixturesPostHandler from './fixtures.post'
import { ensureDatabaseInitialized } from '#server/database'
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
        const result = await fixturesPostHandler(makeEvent('POST', '/api/e2e/fixtures', {})) as { repos: unknown[], scanRuns: unknown[], scanResults: unknown[] }
        expect(result).toEqual({ repos: [], scanRuns: [], scanResults: [] })
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
})
