import 'reflect-metadata'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import handler from './ai-config.get'
import { ensureDatabaseInitialized } from '#server/database'
import { Organization } from '#server/entities/organization'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'admin-1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (params: Record<string, string> = { id: 'org-1' }) =>
    handler(makeEvent('GET', `/api/organizations/${params.id}/ai-config`, undefined, {}, params))

const seedOrg = async (overrides: { aiApiKeyEncrypted?: string | null } = {}) => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Organization)
    await repo.save(repo.create({
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        aiApiKeyEncrypted: overrides.aiApiKeyEncrypted ?? null,
        aiProvider: 'openai-compatible',
        aiModel: 'deepseek-v4-flash',
        aiBaseUrl: 'https://api.deepseek.com',
        aiApiUrl: null,
    } as unknown as Organization))
}

describe('GET /api/organizations/[id]/ai-config（M26.1 re-audit fix B1）', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    beforeEach(() => {
        teardownMemoryDatabase()
        setupMemoryDatabase()
    })

    it('缺少 org id → 400 + ORG_ID_MISSING', async () => {
        const error = await expectError(call({}), 400)
        expect(error.data?.code).toBe('ORG_ID_MISSING')
    })

    it('Organization 不存在 → 404 + ORG_NOT_FOUND', async () => {
        const error = await expectError(call({ id: 'non-existent' }), 404)
        expect(error.data?.code).toBe('ORG_NOT_FOUND')
    })

    it('返回 Organization.ai* 5 字段 + hasAiApiKey=false（未配置 Key）', async () => {
        await seedOrg()
        const result = await call() as {
            id: string
            aiProvider: string
            aiModel: string
            aiBaseUrl: string | null
            aiApiUrl: string | null
            hasAiApiKey: boolean
        }

        expect(result.id).toBe('org-1')
        expect(result.aiProvider).toBe('openai-compatible')
        expect(result.aiModel).toBe('deepseek-v4-flash')
        expect(result.aiBaseUrl).toBe('https://api.deepseek.com')
        expect(result.aiApiUrl).toBe(null)
        expect(result.hasAiApiKey).toBe(false)
    })

    it('hasAiApiKey=true（已配置 Key）但不回显 apiKey 明文', async () => {
        const encryptionKey = getEncryptionKey()
        const encrypted = encryptToken('sk-test-key', encryptionKey)
        await seedOrg({ aiApiKeyEncrypted: encrypted })

        const result = await call() as { hasAiApiKey: boolean }

        expect(result.hasAiApiKey).toBe(true)
        // 凭据最小化：响应不应含 apiKeyEncrypted / apiKey 明文
        expect(JSON.stringify(result)).not.toContain('sk-test-key')
        expect(JSON.stringify(result)).not.toMatch(/aiApiKeyEncrypted/)
    })

    it('anthropic provider + Anthropic URL 透传', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(Organization)
        await repo.save(repo.create({
            id: 'org-2',
            name: 'Org 2',
            slug: 'org-2',
            aiApiKeyEncrypted: null,
            aiProvider: 'anthropic',
            aiModel: 'claude-sonnet-4.6',
            aiBaseUrl: null,
            aiApiUrl: 'https://api.anthropic.com',
        } as unknown as Organization))

        const result = await handler(makeEvent('GET', '/api/organizations/org-2/ai-config', undefined, {}, { id: 'org-2' })) as {
            aiProvider: string
            aiModel: string
            aiApiUrl: string | null
            hasAiApiKey: boolean
        }

        expect(result.aiProvider).toBe('anthropic')
        expect(result.aiModel).toBe('claude-sonnet-4.6')
        expect(result.aiApiUrl).toBe('https://api.anthropic.com')
        expect(result.hasAiApiKey).toBe(false)
    })
})
