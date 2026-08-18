import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsHandler from './index'

// 鉴权由 guard.test.ts 单独覆盖：API handler 测试 mock guard 层
vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
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
