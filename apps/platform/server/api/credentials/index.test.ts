import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsHandler from './index'

// todo.md §M16.5 三角色鉴权：mock 改为可重写（默认 admin）
const { mockRequireAuth, mockRequireRole } = vi.hoisted(() => ({
    mockRequireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    mockRequireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))
vi.mock('#server/utils/guard', () => ({
    requireAuth: mockRequireAuth,
    requireRole: mockRequireRole,
}))

const call = (method: string, url: string, body?: unknown) => credentialsHandler(makeEvent(method, url, body))

const validBody = {
    name: 'github-pat',
    type: 'classic-pat',
    token: 'ghp_1234567890abcdef',
    note: '主凭据',
}

describe('GET /api/credentials', () => {
    beforeAll(() => {
        setupMemoryDatabase()
        process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
    })

    afterAll(() => {
        teardownMemoryDatabase()
        delete process.env.ENCRYPTION_KEY
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty list on fresh database', async () => {
        const result = await call('GET', '/api/credentials')
        expect(result).toEqual([])
    })

    it('creates credential with encrypted token and hides it from view', async () => {
        const created = await call('POST', '/api/credentials', validBody) as Record<string, unknown>
        expect(created).toMatchObject({ name: 'github-pat', type: 'classic-pat', hasToken: true })
        expect(JSON.stringify(created)).not.toContain('ghp_1234567890abcdef')
        expect(created.encryptedToken).toBeUndefined()

        const list = await call('GET', '/api/credentials') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({ name: 'github-pat', hasToken: true })
    })

    it('rejects invalid body with 400 (Zod validation)', async () => {
        await expectError(call('POST', '/api/credentials', { name: 'x' }), 400)
    })

    it('rejects unsupported method with 405', async () => {
        await expectError(call('PUT', '/api/credentials'), 405)
    })
})

/**
 * 三角色鉴权（todo.md §M16.5）：viewer 只读 / admin + org_admin 写
 * 注：与 repos 不同，凭据敏感字段（token 加密）需确保 viewer 不能读写
 */
describe('/api/credentials 三角色鉴权（todo.md §M16.5）', () => {
    beforeAll(() => {
        // encryptToken 需要 ENCRYPTION_KEY；父 describe beforeAll 已设置但 vi.clearAllMocks 会重置 mock state，
        // 这里补一遍 ensure key 设置
        process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('viewer 调 POST /api/credentials → 403 (写操作拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(call('POST', '/api/credentials', validBody))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('org_admin 调 POST /api/credentials → 200 (写权限放行)', async () => {
        mockRequireRole.mockResolvedValueOnce({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        const created = await call('POST', '/api/credentials', {
            ...validBody,
            name: 'orgadmin-cred',
        }) as { id: string, name: string, hasToken: boolean }
        expect(created.name).toBe('orgadmin-cred')
        expect(created.hasToken).toBe(true)
    })

    it('viewer 调 GET /api/credentials → 200 (只读放行 + token 脱敏)', async () => {
        mockRequireAuth.mockResolvedValueOnce({ user: { id: 'viewer-1', email: 'viewer@test.dev' } })
        const list = await call('GET', '/api/credentials') as Record<string, unknown>[]
        // 凭据列表不应含 token 字段；无论 viewer 还是 admin 一致脱敏
        for (const item of list) {
            expect(JSON.stringify(item)).not.toContain(validBody.token)
        }
    })

    it('未登录调 GET /api/credentials → 401', async () => {
        mockRequireAuth.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Unauthorized' })
        })
        await expect(call('GET', '/api/credentials')).rejects.toMatchObject({ statusCode: 401 })
    })
})
