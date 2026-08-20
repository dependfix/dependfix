import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposHandler from './index'

// 鉴权由 guard.test.ts 单独覆盖：API handler 测试 mock guard 层，聚焦业务逻辑
vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'user-1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'user-1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string, body?: unknown) => reposHandler(makeEvent(method, url, body))

describe('GET /api/repos', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('returns empty list on fresh database', async () => {
        const result = await call('GET', '/api/repos')
        expect(result).toEqual([])
    })

    it('returns created repository in list view (with null credentialName)', async () => {
        await call('POST', '/api/repos', {
            owner: 'dependfix',
            name: 'dependfix',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'master',
            executorKind: 'container',
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
            owner: 'dependfix',
            name: 'dependfix',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'master',
            credentialName: null,
            tags: [],
        })
        expect(list[0]!.id).toBeTruthy()
    })

    it('rejects invalid body with 400 (Zod validation)', async () => {
        await expect(call('POST', '/api/repos', { owner: 'x' })).rejects.toMatchObject({ statusCode: 400 })
    })

    it('rejects duplicate repository with 409', async () => {
        const payload = {
            owner: 'dup',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }
        await call('POST', '/api/repos', payload)
        await expect(call('POST', '/api/repos', payload)).rejects.toMatchObject({
            statusCode: 409,
            message: '该仓库已存在',
        })
    })

    it('persists tags array as JSON column and reads back', async () => {
        await call('POST', '/api/repos', {
            owner: 'tags',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
            tags: ['prod', 'core'],
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'tags')
        expect(item?.tags).toEqual(['prod', 'core'])
    })

    it('persists sandboxLimits object as JSON column and reads back (M11 T1005-B)', async () => {
        // M11 T1005-B：POST 路径序列化 sandboxLimits → toView 反序列化读取
        await call('POST', '/api/repos', {
            owner: 'sb-limits',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
            sandboxLimits: { memoryMb: 8192, cpu: 1.5 },
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'sb-limits')
        expect(item?.sandboxLimits).toEqual({ memoryMb: 8192, cpu: 1.5 })
    })

    it('omits sandboxLimits when not provided (走平台 SANDBOX_DEFAULTS)', async () => {
        await call('POST', '/api/repos', {
            owner: 'no-limits',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })
        const list = await call('GET', '/api/repos') as Record<string, unknown>[]
        const item = list.find((r) => r.owner === 'no-limits')
        expect(item?.sandboxLimits).toBeUndefined()
    })

    it('rejects unsupported method with 405', async () => {
        await expect(call('PUT', '/api/repos')).rejects.toMatchObject({ statusCode: 405 })
    })
})
