import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIdHandler from './[id]'
import reposIndexHandler from './index'

// todo.md §M16.5 三角色鉴权：mock 改为可重写（默认 admin），三角色相关 case 用 mockRequireRole.mockImplementationOnce 切换
const { mockRequireAuth, mockRequireRole, mockRequireOrgResource } = vi.hoisted(() => ({
    mockRequireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    mockRequireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    mockRequireOrgResource: vi.fn(async () => undefined),
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
    requireOrgResource: mockRequireOrgResource,
}))

const callIndex = (method: string, url: string, body?: unknown) => reposIndexHandler(makeEvent(method, url, body))
const callId = (method: string, url: string, body?: unknown, params: Record<string, string> = {}) =>
    reposIdHandler(makeEvent(method, url, body, {}, params))

const basePayload = {
    owner: 'demo',
    name: 'app',
    platform: 'github',
    packageManager: 'pnpm',
    defaultBranch: 'main',
    executorKind: 'container',
}

describe('GET /api/repos/[id]', () => {
    let id: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await callIndex('POST', '/api/repos', basePayload) as { id: string }
        id = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns repository detail', async () => {
        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail).toMatchObject({ id, owner: 'demo', name: 'app', packageManager: 'pnpm', tags: [] })
        expect(detail.sandboxLimits).toBeUndefined()
    })

    it('returns 404 for unknown repository', async () => {
        await expectError(callId('GET', '/api/repos/nonexistent', undefined, { id: 'nonexistent' }), 404)
    })

    it('updates fields via PUT', async () => {
        const result = await callId('PUT', `/api/repos/${id}`, { note: '新备注', tags: ['prod'] }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.note).toBe('新备注')
        expect(detail.tags).toEqual(['prod'])
    })

    it('rejects owner/name conflict with 409', async () => {
        await callIndex('POST', '/api/repos', { ...basePayload, owner: 'other', name: 'repo' })
        await expectError(
            callId('PUT', `/api/repos/${id}`, { owner: 'other', name: 'repo' }, { id }),
            409,
        )
    })

    it('rejects invalid body with 400', async () => {
        await expectError(callId('PUT', `/api/repos/${id}`, { executorKind: 'nope' }, { id }), 400)
    })

    it('persists sandboxLimits JSON via PUT (M11 T1005-B)', async () => {
        // M11 T1005-B：仓库级 sandboxLimits 序列化 + 更新语义（undefined=不修改 / null 或 object=更新）
        const result = await callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 4096, cpu: 2.0 } }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxLimits).toEqual({ memoryMb: 4096, cpu: 2.0 })
    })

    it('clears sandboxLimits via PUT (null)', async () => {
        // 先设置 → 再清空 → 走平台 SANDBOX_DEFAULTS（detail.sandboxLimits === undefined）
        await callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 1024 } }, { id })
        const cleared = await callId('PUT', `/api/repos/${id}`, { sandboxLimits: null }, { id }) as { updated: boolean }
        expect(cleared).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/repos/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.sandboxLimits).toBeUndefined()
    })

    it('rejects PUT with sandboxLimits out of range (400)', async () => {
        await expectError(
            callId('PUT', `/api/repos/${id}`, { sandboxLimits: { memoryMb: 100000 } }, { id }),
            400,
        )
    })

    it('deletes repository via DELETE', async () => {
        const result = await callId('DELETE', `/api/repos/${id}`, undefined, { id }) as { deleted: boolean }
        expect(result).toEqual({ id, deleted: true })
        await expectError(callId('GET', `/api/repos/${id}`, undefined, { id }), 404)
    })

    it('rejects unsupported method with 405', async () => {
        await expectError(callId('PATCH', `/api/repos/${id}`, undefined, { id }), 405)
    })
})

/**
 * 三角色鉴权（todo.md §M16.5）：viewer 只读 / admin + org_admin 写 / 未登录 401
 * 同时验证 requireOrgResource 在跨组织时的兜底（403）。
 */
describe('/api/repos/[id] 三角色鉴权（todo.md §M16.5）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('viewer 调 PUT /api/repos/[id] → 403 (requireRole 拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('PUT', `/api/repos/any-id`, { name: 'x' }, { id: 'any-id' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('viewer 调 DELETE /api/repos/[id] → 403 (requireRole 拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('DELETE', `/api/repos/any-id`, undefined, { id: 'any-id' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('viewer 调 GET /api/repos/[id] → 200 (只读放行)', async () => {
        mockRequireAuth.mockResolvedValueOnce({ user: { id: 'viewer-1', email: 'viewer@test.dev' } })
        // GET /api/repos/nonexistent → 404（业务查找）而非 403，证明鉴权通过
        await expect(callId('GET', `/api/repos/nonexistent`, undefined, { id: 'nonexistent' }))
            .rejects.toMatchObject({ statusCode: 404 })
    })

    it('org_admin 调 PUT /api/repos/[id] → 走 requireOrgResource', async () => {
        // org_admin 角色通过 requireRole，但 requireOrgResource 抛 403 表示资源不在当前组织
        mockRequireRole.mockResolvedValueOnce({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        mockRequireOrgResource.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        // repo 不存在 → findOne 返回 null → 抛 404（实际业务先于 requireOrgResource）
        // 改为 repo 存在场景：直接 PUT 现有 repoId 让 requireOrgResource 先抛
        // 这里先 seed 一条 repo
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'orgadmin-target',
            name: 'repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        // 重置 mock：让 org_admin 通过 requireRole，但 requireOrgResource 抛
        mockRequireRole.mockResolvedValue({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        mockRequireOrgResource.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('PUT', `/api/repos/${created.id}`, { note: 'org-override' }, { id: created.id }))
            .rejects.toMatchObject({ statusCode: 403 })
    })
})
