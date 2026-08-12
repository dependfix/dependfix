import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsIndexHandler from '../credentials/index'
import importableHandler from './importable.get'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

// GitHub API 调用统一 mock（真实网络不可用；vi.hoisted：vi.mock factory 被提升；
// Octokit 用 class mock——箭头函数不可被 new 构造）
const { listForAuthenticatedUser } = vi.hoisted(() => ({ listForAuthenticatedUser: vi.fn() }))
vi.mock('@octokit/rest', () => ({
    Octokit: class {
        repos = { listForAuthenticatedUser }
    },
}))

const call = (url: string) => importableHandler(makeEvent('GET', url))

describe('GET /api/repos/importable', () => {
    let credentialId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
        const created = await credentialsIndexHandler(makeEvent('POST', '/api/credentials', {
            name: 'github-pat',
            type: 'classic-pat',
            token: 'ghp_importable-test-token',
        })) as { id: string }
        credentialId = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
        delete process.env.ENCRYPTION_KEY
    })

    beforeEach(() => {
        vi.clearAllMocks()
        listForAuthenticatedUser.mockReset()
        listForAuthenticatedUser.mockResolvedValue({
            data: [
                {
                    id: 1,
                    name: 'alpha',
                    full_name: 'demo/alpha',
                    owner: { login: 'demo' },
                    private: false,
                    default_branch: 'main',
                    description: '首个仓库',
                },
                {
                    id: 2,
                    name: 'private-repo',
                    full_name: 'demo/private-repo',
                    owner: { login: 'demo' },
                    private: true,
                    permissions: { push: true },
                    default_branch: 'main',
                    description: null,
                },
            ],
        })
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

    it('lists accessible repositories from GitHub', async () => {
        const result = await call(`/api/repos/importable?credentialId=${credentialId}`) as Array<Record<string, unknown>>
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({
            fullName: 'demo/alpha',
            owner: 'demo',
            private: false,
            defaultBranch: 'main',
            imported: false,
        })
        // private + push 权限也可见
        expect(result[1]).toMatchObject({ fullName: 'demo/private-repo', private: true })
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

        const result = await call(`/api/repos/importable?credentialId=${credentialId}`) as Array<Record<string, unknown>>
        expect(result.find((r) => r.fullName === 'demo/alpha')).toMatchObject({ imported: true })
    })

    it('propagates GitHub 401 as token permission error', async () => {
        listForAuthenticatedUser.mockRejectedValue({ status: 401, message: 'Bad credentials' })
        const err = await expectError(call(`/api/repos/importable?credentialId=${credentialId}`), 401)
        expect(err.message).toContain('GitHub Token 无权访问仓库列表')
    })

    it('wraps unknown GitHub errors as 502', async () => {
        listForAuthenticatedUser.mockRejectedValue({ status: 503, message: 'unavailable' })
        const err = await expectError(call(`/api/repos/importable?credentialId=${credentialId}`), 502)
        expect(err.message).toContain('拉取 GitHub 仓库失败')
    })
})
