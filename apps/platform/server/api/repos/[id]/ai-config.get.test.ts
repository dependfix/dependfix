import 'reflect-metadata'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import handler from './ai-config.get'
import { ensureDatabaseInitialized } from '#server/database'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'

vi.mock('#server/utils/guard', () => ({
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (params: Record<string, string> = { id: 'repo-1' }) =>
    handler(makeEvent('GET', '/api/repos/repo-1/ai-config', undefined, {}, params))

const seedRepoAndOrg = async (overrides: {
    orgKey?: string | null
    repoEnabled?: boolean
    repoTrigger?: 'failure' | 'major' | 'both'
} = {}) => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(Organization).save(ds.getRepository(Organization).create({
        id: 'org-1',
        name: 'Test Org',
        slug: 'test-org',
        aiApiKeyEncrypted: overrides.orgKey ?? null,
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
        aiEnabled: overrides.repoEnabled ?? false,
        aiTrigger: overrides.repoTrigger ?? 'both',
    } as unknown as Repository))
}

describe('GET /api/repos/[id]/ai-config', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
    })

    beforeEach(async () => {
        teardownMemoryDatabase()
        setupMemoryDatabase()
    })

    it('返回 repository + organization + effective 三段配置 + 不返回 apiKey 明文', async () => {
        await seedRepoAndOrg({ orgKey: 'encrypted-key-stub', repoEnabled: true, repoTrigger: 'major' })
        const result = await call() as any

        expect(result.repository).toEqual({ aiEnabled: true, aiTrigger: 'major' })
        expect(result.organization.hasAiApiKey).toBe(true)
        expect(result.organization.aiProvider).toBe('openai-compatible')
        expect(result.effective.aiEnabled).toBe(true)
        expect(result.effective.aiTrigger).toBe('major')
        expect(result.effective.hasApiKey).toBe(true)

        // 凭据最小化：响应不应包含 apiKeyEncrypted / apiKey 明文
        expect(JSON.stringify(result)).not.toContain('encrypted-key-stub')
        expect(JSON.stringify(result)).not.toMatch(/aiApiKeyEncrypted/)
        expect(JSON.stringify(result)).not.toMatch(/"aiApiKey"/)
    })

    it('Organization 未配 Key → hasAiApiKey=false 且 effective.hasApiKey=false', async () => {
        await seedRepoAndOrg({ repoEnabled: true })
        const result = await call() as any

        expect(result.organization.hasAiApiKey).toBe(false)
        expect(result.effective.hasApiKey).toBe(false)
        expect(result.effective.aiEnabled).toBe(true) // 仓库启用状态如实返回
    })

    it('Repository 不存在 → 404 + REPO_NOT_FOUND', async () => {
        const error = await expectError(call({ id: 'non-existent' }), 404)
        expect(error.statusCode).toBe(404)
        expect(error.data.code).toBe('REPO_NOT_FOUND')
    })
})
