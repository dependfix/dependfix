import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposHandler from './index'

// 鉴权由 guard.test.ts 单独覆盖：API handler 测试 mock guard 层，聚焦业务逻辑；
// 但 todo.md §M16.5 T701-e2e 补强要求 API handler 测试也覆盖三角色鉴权——
// 这里把 mock 改为可重写（默认 admin），三角色相关 case 用 mockRequireRole.mockResolvedValueOnce 切换
const { mockRequireAuth, mockRequireRole } = vi.hoisted(() => ({
    mockRequireAuth: vi.fn(async () => ({ user: { id: 'user-1', email: 'admin@test.dev' } })),
    mockRequireRole: vi.fn(async () => ({ user: { id: 'user-1', email: 'admin@test.dev' } })),
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
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

    it('rejects duplicate repository with 409 (localized message + data.code, todo.md §M16.3)', async () => {
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
            // 默认 zh-CN locale（无 cookie / Accept-Language）→ 中文 message
            message: '该仓库已存在',
            // 错误码强契约位置：客户端通过 data.code 路由分支判断（h3 序列化保留 data）
            data: { code: 'REPO_DUPLICATE' },
        })
    })

    it('rejects invalid body with 400 + data.code: REPO_VALIDATION_FAILED + data.issues 透传', async () => {
        await expect(call('POST', '/api/repos', { owner: 'x' })).rejects.toMatchObject({
            statusCode: 400,
            message: '参数校验失败',
            data: {
                code: 'REPO_VALIDATION_FAILED',
                issues: expect.any(Array),
            },
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

/**
 * 三角色鉴权验证（todo.md §M16.5 T701-e2e）：
 * viewer 只读 / admin + org_admin 写操作 / 未登录 401
 *
 * 默认 mock 为 admin 通过；以下 case 用 mockRequireRole.mockImplementationOnce / mockRequireAuth.mockImplementationOnce
 * 让 guard 抛 401/403 模拟角色权限拦截。
 *
 * 角色语义：
 * - viewer：只能 GET（只读）；POST / PUT / DELETE 应被 403 拦截
 * - org_admin：可写（与 admin 同等权限），POST / PUT / DELETE 通过
 * - admin：默认全权限
 * - 未登录：GET 也应被 401 拦截
 */
describe('/api/repos 三角色鉴权（todo.md §M16.5）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('viewer 调 POST /api/repos → 403 (requireRole 拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(call('POST', '/api/repos', {
            owner: 'viewer-blocked',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })).rejects.toMatchObject({ statusCode: 403 })
    })

    it('org_admin 调 POST /api/repos → 200 (write 权限放行)', async () => {
        mockRequireRole.mockResolvedValueOnce({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        const created = await call('POST', '/api/repos', {
            owner: 'orgadmin-success',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }) as { id: string, owner: string }
        expect(created.owner).toBe('orgadmin-success')
        expect(created.id).toBeTruthy()
    })

    it('viewer 调 GET /api/repos → 200 (只读放行)', async () => {
        mockRequireAuth.mockResolvedValueOnce({ user: { id: 'viewer-1', email: 'viewer@test.dev' } })
        const list = await call('GET', '/api/repos')
        expect(Array.isArray(list)).toBe(true)
    })

    it('未登录调 GET /api/repos → 401 (requireAuth 拒绝)', async () => {
        mockRequireAuth.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Unauthorized' })
        })
        await expect(call('GET', '/api/repos')).rejects.toMatchObject({ statusCode: 401 })
    })
})
