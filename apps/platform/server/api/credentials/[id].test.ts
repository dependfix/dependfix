import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsIdHandler from './[id]'
import credentialsHandler from './index'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const callIndex = (method: string, url: string, body?: unknown) => credentialsHandler(makeEvent(method, url, body))
const callId = (method: string, url: string, body?: unknown, params: Record<string, string> = {}) =>
    credentialsIdHandler(makeEvent(method, url, body, {}, params))

describe('GET /api/credentials/[id]', () => {
    let id: string

    beforeAll(async () => {
        setupMemoryDatabase()
        process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
        const created = await callIndex('POST', '/api/credentials', {
            name: 'github-pat',
            type: 'classic-pat',
            token: 'ghp_secret-token-123',
        }) as { id: string }
        id = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
        delete process.env.ENCRYPTION_KEY
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns credential detail without token', async () => {
        const detail = await callId('GET', `/api/credentials/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail).toMatchObject({ id, name: 'github-pat', hasToken: true })
        expect(JSON.stringify(detail)).not.toContain('ghp_secret-token-123')
    })

    it('returns 404 for unknown credential', async () => {
        await expectError(callId('GET', '/api/credentials/nonexistent', undefined, { id: 'nonexistent' }), 404)
    })

    it('updates name and token via PUT', async () => {
        const result = await callId('PUT', `/api/credentials/${id}`, { name: 'renamed', token: 'ghp_new-token' }, { id }) as { updated: boolean }
        expect(result).toEqual({ id, updated: true })

        const detail = await callId('GET', `/api/credentials/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.name).toBe('renamed')
        expect(JSON.stringify(detail)).not.toContain('ghp_new-token')
    })

    it('keeps existing token when PUT body omits token', async () => {
        await callId('PUT', `/api/credentials/${id}`, { note: '新备注' }, { id })
        const detail = await callId('GET', `/api/credentials/${id}`, undefined, { id }) as Record<string, unknown>
        expect(detail.hasToken).toBe(true)
    })

    it('deletes credential via DELETE', async () => {
        const result = await callId('DELETE', `/api/credentials/${id}`, undefined, { id }) as { deleted: boolean }
        expect(result).toEqual({ id, deleted: true })
        await expectError(callId('GET', `/api/credentials/${id}`, undefined, { id }), 404)
    })

    it('rejects invalid body with 400', async () => {
        await expectError(callId('PUT', `/api/credentials/${id}`, { name: 123 }, { id }), 400)
    })

    it('rejects unsupported method with 405', async () => {
        await expectError(callId('PATCH', `/api/credentials/${id}`, undefined, { id }), 405)
    })
})
