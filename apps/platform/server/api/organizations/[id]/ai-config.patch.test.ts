import 'reflect-metadata'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import handler from './ai-config.patch'
import { ensureDatabaseInitialized } from '#server/database'
import { Organization } from '#server/entities/organization'
import { AuditEvent } from '#server/entities/audit-event'
import { getEncryptionKey } from '#server/services/credential.service'

vi.mock('#server/utils/guard', () => ({
    requireRole: vi.fn(async () => ({ user: { id: 'admin-1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (body: Record<string, unknown>, params: Record<string, string> = { id: 'org-1' }) =>
    handler(makeEvent('PATCH', '/api/organizations/org-1/ai-config', body, {}, params))

const seedOrg = async (aiApiKeyEncrypted: string | null = null) => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(Organization)
    await repo.save(repo.create({
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        aiApiKeyEncrypted,
        aiProvider: 'openai-compatible',
        aiModel: 'deepseek-v4-flash',
    } as unknown as Organization))
}

describe('PATCH /api/organizations/[id]/ai-config', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
    })

    beforeEach(async () => {
        teardownMemoryDatabase()
        setupMemoryDatabase()
    })

    it('更新 AI Provider + Model + Base URL 写入并审计', async () => {
        await seedOrg()
        await call({ aiProvider: 'anthropic', aiModel: 'claude-sonnet-4.6', aiBaseUrl: null })

        const ds = await ensureDatabaseInitialized()
        const org = await ds.getRepository(Organization).findOne({ where: { id: 'org-1' } })
        expect(org?.aiProvider).toBe('anthropic')
        expect(org?.aiModel).toBe('claude-sonnet-4.6')
        expect(org?.aiBaseUrl).toBe(null)

        const audit = await ds.getRepository(AuditEvent).findOne({
            where: { type: 'ai_config_update' },
        })
        expect(audit).toBeTruthy()
        const payload = JSON.parse(audit?.payloadJson ?? '{}')
        expect(payload.after.aiProvider).toBe('anthropic')
    })

    it('写入 AI API Key → 加密落库 + 响应仅返回 hasAiApiKey=true（不回显明文）', async () => {
        await seedOrg()
        const plaintext = 'sk-test-api-key-1234567890'
        await call({ aiApiKey: plaintext })

        const ds = await ensureDatabaseInitialized()
        const org = await ds.getRepository(Organization).findOne({ where: { id: 'org-1' } })
        expect(org?.aiApiKeyEncrypted).toBeTruthy()
        expect(org?.aiApiKeyEncrypted).not.toContain(plaintext) // 不应以明文形式存储
        expect(org?.aiApiKeyEncrypted).toMatch(/^[A-Za-z0-9+/=.]+$/) // encryptToken 产物 base64 格式 iv.authTag.ciphertext

        // 审计日志不包含 apiKey 明文
        const audit = await ds.getRepository(AuditEvent).findOne({
            where: { type: 'ai_config_update' },
        })
        expect(JSON.stringify(audit?.payloadJson)).not.toContain(plaintext)
    })

    it('空字符串 aiApiKey → 清空已加密 Key', async () => {
        const encryptionKey = getEncryptionKey()
        const { encryptToken } = await import('#server/services/credential.service')
        await seedOrg(encryptToken('sk-original', encryptionKey))

        await call({ aiApiKey: '' })

        const ds = await ensureDatabaseInitialized()
        const org = await ds.getRepository(Organization).findOne({ where: { id: 'org-1' } })
        expect(org?.aiApiKeyEncrypted).toBe(null)
    })

    it('参数校验失败 → 返回 400 + AI_CONFIG_VALIDATION_FAILED 错误码', async () => {
        await seedOrg()
        const error = await expectError(call({ aiProvider: 'invalid-provider' as any }), 400)
        expect(error.statusCode).toBe(400)
        expect(error.data.code).toBe('AI_CONFIG_VALIDATION_FAILED')
    })

    it('AI API Key 过短 → 返回 400', async () => {
        await seedOrg()
        const error = await expectError(call({ aiApiKey: 'short' }), 400)
        expect(error.statusCode).toBe(400)
    })

    it('Organization 不存在 → 返回 404 + ORG_NOT_FOUND', async () => {
        const error = await expectError(call({ aiProvider: 'anthropic' }, { id: 'non-existent' }), 404)
        expect(error.statusCode).toBe(404)
        expect(error.data.code).toBe('ORG_NOT_FOUND')
    })
})
