import 'reflect-metadata'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import handler from './ai-config.post'
import { ensureDatabaseInitialized } from '#server/database'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { AuditEvent } from '#server/entities/audit-event'
import { encryptToken, getEncryptionKey } from '#server/services/credential.service'

vi.mock('#server/utils/guard', () => ({
    requireRole: vi.fn(async () => ({ user: { id: 'admin-1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (body: Record<string, unknown>, params: Record<string, string> = { id: 'repo-1' }) =>
    handler(makeEvent('POST', '/api/repos/repo-1/ai-config', body, {}, params))

const seed = async (orgHasKey = true, repoEnabled = false) => {
    const ds = await ensureDatabaseInitialized()
    const encryptionKey = getEncryptionKey()
    await ds.getRepository(Organization).save(ds.getRepository(Organization).create({
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        aiApiKeyEncrypted: orgHasKey ? encryptToken('sk-test', encryptionKey) : null,
        aiProvider: 'openai-compatible',
        aiModel: 'deepseek-v4-flash',
    } as unknown as Organization))
    await ds.getRepository(Repository).save(ds.getRepository(Repository).create({
        id: 'repo-1',
        organizationId: 'org-1',
        name: 'test-repo',
        fullName: 'org-1/test-repo',
        owner: 'org-1',
        platform: 'github',
        defaultBranch: 'main',
        packageManager: 'pnpm',
        aiEnabled: repoEnabled,
        aiTrigger: 'both',
    } as unknown as Repository))
}

describe('POST /api/repos/[id]/ai-config', () => {
    beforeAll(async () => {
        await setupMemoryDatabase()
    })

    beforeEach(async () => {
        await teardownMemoryDatabase()
        await setupMemoryDatabase()
    })

    it('更新 aiEnabled + aiTrigger 写入 + 审计', async () => {
        await seed(true, false)
        const result = await call({ aiEnabled: true, aiTrigger: 'major' }) as any

        expect(result.repository).toEqual({ id: 'repo-1', aiEnabled: true, aiTrigger: 'major' })

        const ds = await ensureDatabaseInitialized()
        const repo = await ds.getRepository(Repository).findOne({ where: { id: 'repo-1' } })
        expect(repo?.aiEnabled).toBe(true)
        expect(repo?.aiTrigger).toBe('major')

        const audit = await ds.getRepository(AuditEvent).findOne({
            where: { type: 'ai_config_update' },
        })
        expect(audit).toBeTruthy()
        const payload = JSON.parse(audit?.payloadJson ?? '{}')
        expect(payload.after).toEqual({ aiEnabled: true, aiTrigger: 'major' })
    })

    it('aiEnabled=true 但 Organization 未配 Key → 400 + AI_KEY_REQUIRED', async () => {
        await seed(false, false)
        const error = await expectError(call({ aiEnabled: true }), 400)
        expect(error.statusCode).toBe(400)
        expect(error.data.code).toBe('AI_KEY_REQUIRED')
    })

    it('aiEnabled=false 时无需校验 Organization Key（关掉不要求已配置）', async () => {
        await seed(false, true)
        const result = await call({ aiEnabled: false }) as any
        expect(result.repository.aiEnabled).toBe(false)
    })

    it('aiTrigger 非法值 → 400 + AI_CONFIG_VALIDATION_FAILED', async () => {
        await seed(true)
        const error = await expectError(call({ aiTrigger: 'invalid' as any }), 400)
        expect(error.statusCode).toBe(400)
        expect(error.data.code).toBe('AI_CONFIG_VALIDATION_FAILED')
    })

    it('Repository 不存在 → 404 + REPO_NOT_FOUND', async () => {
        await seed(true)
        const error = await expectError(call({ aiEnabled: true }, { id: 'non-existent' }), 404)
        expect(error.statusCode).toBe(404)
        expect(error.data.code).toBe('REPO_NOT_FOUND')
    })
})
