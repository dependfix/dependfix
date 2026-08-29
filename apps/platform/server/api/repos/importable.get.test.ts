import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsIndexHandler from '../credentials/index'
import { __resetReposCacheForTesting } from '../../utils/repos-cache'
import importableHandler from './importable.get'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => { /* 单组织模型下 no-op；多租户扩展时此处抛 403 */ }),
}))

// GitHub API 调用统一 mock（真实网络不可用；vi.hoisted：vi.mock factory 被提升）。
// docs/plan/todo.md §PR3-2 C49 修订：octokit.paginate 现在被 importable.get.ts 调用，需要同时 mock paginate 方法。
// mapFn 模式下 paginate 调一次 endpoint 然后交给 mapFn，mapFn 返回数组被合并。
const { listForAuthenticatedUser } = vi.hoisted(() => ({
    listForAuthenticatedUser: vi.fn(),
}))
vi.mock('@octokit/rest', () => ({
    Octokit: class {
        repos = { listForAuthenticatedUser }
        // paginate mock：单页（mock 数据无 Link header），mapFn 接收 response 返回 response.data
        async paginate(endpoint: (opts: unknown) => Promise<{ data: unknown[] }>, options: unknown, mapFn?: (response: { data: unknown[] }, done: () => void) => unknown[]) {
            const response = await endpoint(options)
            if (!mapFn) {
                return response.data
            }
            let stopped = false
            const result = mapFn(response, () => {
                stopped = true
            })
            return stopped ? [] : (result ?? response.data)
        }
    },
}))

const call = (url: string) => importableHandler(makeEvent('GET', url))

interface ImportableResponse {
    repos: Record<string, unknown>[]
    total: number
    cachedAt: string
    fromCache: boolean
}

const sampleRepos = () => ({
    data: [
        {
            id: 1,
            name: 'alpha',
            full_name: 'demo/alpha',
            owner: { login: 'demo' },
            private: false,
            fork: false,
            archived: false,
            default_branch: 'main',
            description: '首个仓库',
        },
        {
            id: 2,
            name: 'private-repo',
            full_name: 'demo/private-repo',
            owner: { login: 'demo' },
            private: true,
            fork: false,
            archived: false,
            permissions: { push: true },
            default_branch: 'main',
            description: null,
        },
    ],
})

describe('GET /api/repos/importable', () => {
    let credentialId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        // 注：M18.x 治理批次 S-5 — 删除 `process.env.ENCRYPTION_KEY` 死代码；
        // stub 默认值由 `apps/platform/tests/setup-nuxt-server.ts:26` 全局 useRuntimeConfig 提供
        const created = await credentialsIndexHandler(makeEvent('POST', '/api/credentials', {
            name: 'github-pat',
            type: 'classic-pat',
            token: 'ghp_importable-test-token',
        })) as { id: string }
        credentialId = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
        // 注：M18.x 治理批次 S-5 — 删除 `delete process.env.ENCRYPTION_KEY` 死代码
    })

    beforeEach(() => {
        __resetReposCacheForTesting()
        vi.clearAllMocks()
        listForAuthenticatedUser.mockReset()
        listForAuthenticatedUser.mockResolvedValue(sampleRepos())
    })

    it('rejects missing credentialId with 400', async () => {
        await expectError(call('/api/repos/importable'), 400)
    })

    it('rejects invalid affiliation with 400', async () => {
        await expectError(call(`/api/repos/importable?credentialId=${credentialId}&affiliation=bogus`), 400)
    })

    it('returns 404 for unknown credential', async () => {
        await expectError(call('/api/repos/importable?credentialId=nonexistent'), 404)
    })

    it('lists accessible repositories from GitHub with new response shape', async () => {
        const result = await call(`/api/repos/importable?credentialId=${credentialId}`) as ImportableResponse
        // 新响应结构（docs/plan/todo.md §PR3-2 C49）：{ repos, total, cachedAt, fromCache }
        expect(Array.isArray(result.repos)).toBe(true)
        expect(result.total).toBe(2)
        expect(result.fromCache).toBe(false)
        expect(typeof result.cachedAt).toBe('string')
        expect(result.repos).toHaveLength(2)
        expect(result.repos[0]).toMatchObject({
            fullName: 'demo/alpha',
            owner: 'demo',
            private: false,
            fork: false,
            archived: false,
            defaultBranch: 'main',
            imported: false,
        })
        // private + push 权限也可见
        expect(result.repos[1]).toMatchObject({ fullName: 'demo/private-repo', private: true })
    })

    it('marks already imported repositories', async () => {
        // 预置一个已登记仓库（demo/alpha）
        const reposIndex = await import('../repos/index').then((m) => m.default)
        await reposIndex(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'alpha',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }))

        const result = await call(`/api/repos/importable?credentialId=${credentialId}`) as ImportableResponse
        expect(result.repos.find((r) => r.fullName === 'demo/alpha')).toMatchObject({ imported: true })
    })

    it('serves cached result on second call within TTL (docs/plan/todo.md §PR3-2 C49)', async () => {
        // 第一次请求：fromCache=false，loader 被调一次
        const first = await call(`/api/repos/importable?credentialId=${credentialId}`) as ImportableResponse
        expect(first.fromCache).toBe(false)
        expect(listForAuthenticatedUser).toHaveBeenCalledTimes(1)

        // 第二次请求：fromCache=true，loader 不再被调
        const second = await call(`/api/repos/importable?credentialId=${credentialId}`) as ImportableResponse
        expect(second.fromCache).toBe(true)
        expect(second.repos).toHaveLength(2)
        expect(listForAuthenticatedUser).toHaveBeenCalledTimes(1)
    })

    it('forces refresh when ?fresh=true even with valid cache (docs/plan/todo.md §PR3-2 C49)', async () => {
        // 预热缓存
        await call(`/api/repos/importable?credentialId=${credentialId}`)
        expect(listForAuthenticatedUser).toHaveBeenCalledTimes(1)

        // 强制刷新：跳过缓存读取，但新值写回缓存
        const fresh = await call(`/api/repos/importable?credentialId=${credentialId}&fresh=true`) as ImportableResponse
        expect(fresh.fromCache).toBe(false)
        expect(listForAuthenticatedUser).toHaveBeenCalledTimes(2)

        // 后续非 fresh 请求仍命中刷新后的缓存
        const next = await call(`/api/repos/importable?credentialId=${credentialId}`) as ImportableResponse
        expect(next.fromCache).toBe(true)
        expect(listForAuthenticatedUser).toHaveBeenCalledTimes(2)
    })

    it('propagates GitHub 401 as token permission error', async () => {
        listForAuthenticatedUser.mockRejectedValue({ status: 401, message: 'Bad credentials' })
        const err = await expectError(call(`/api/repos/importable?credentialId=${credentialId}`), 401)
        expect(err.data?.code).toBe('GITHUB_API_AUTH_FAILED')
    })

    it('wraps unknown GitHub errors as 502', async () => {
        listForAuthenticatedUser.mockRejectedValue({ status: 503, message: 'unavailable' })
        const err = await expectError(call(`/api/repos/importable?credentialId=${credentialId}`), 502)
        expect(err.data?.code).toBe('GITHUB_API_FETCH_FAILED')
    })
})
