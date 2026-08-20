import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIdHandler from './[id]'
import reposIndexHandler from './index'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
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
