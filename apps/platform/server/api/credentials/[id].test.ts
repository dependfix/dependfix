import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import credentialsIdHandler from './[id]'
import credentialsHandler from './index'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'

// todo.md §M16.5 三角色鉴权：mock 改为可重写（默认 admin）
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

const callIndex = (method: string, url: string, body?: unknown) => credentialsHandler(makeEvent(method, url, body))
const callId = (method: string, url: string, body?: unknown, params: Record<string, string> = {}, headers: Record<string, string> = {}) =>
    credentialsIdHandler(makeEvent(method, url, body, headers, params))

describe('GET /api/credentials/[id]', () => {
    let id: string

    beforeAll(async () => {
        setupMemoryDatabase()
        // 注：删除 `process.env.ENCRYPTION_KEY` 死代码；
        // stub 默认值由 `apps/platform/tests/setup-nuxt-server.ts:26` 全局 useRuntimeConfig 提供
        const created = await callIndex('POST', '/api/credentials', {
            name: 'github-pat',
            type: 'classic-pat',
            token: 'ghp_secret-token-123',
        }) as { id: string }
        id = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
        // 注：删除 `delete process.env.ENCRYPTION_KEY` 死代码
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

/**
 * 三角色鉴权（todo.md §M16.5）：viewer 只读 / admin + org_admin 写
 * /api/credentials/[id] 三种 method 的角色矩阵。
 */
describe('/api/credentials/[id] 三角色鉴权（todo.md §M16.5）', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('viewer 调 PUT /api/credentials/[id] → 403 (写操作拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('PUT', `/api/credentials/any-id`, { name: 'x' }, { id: 'any-id' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('viewer 调 DELETE /api/credentials/[id] → 403 (写操作拒绝)', async () => {
        mockRequireRole.mockImplementationOnce(async () => {
            const { createError } = await import('h3')
            throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Forbidden' })
        })
        await expect(callId('DELETE', `/api/credentials/any-id`, undefined, { id: 'any-id' }))
            .rejects.toMatchObject({ statusCode: 403 })
    })

    it('viewer 调 GET /api/credentials/[id] → 404 (只读放行 + 业务查找不到)', async () => {
        mockRequireAuth.mockResolvedValueOnce({ user: { id: 'viewer-1', email: 'viewer@test.dev' } })
        await expectError(callId('GET', `/api/credentials/nonexistent`, undefined, { id: 'nonexistent' }), 404)
    })

    it('org_admin 调 DELETE /api/credentials/[id] → 200 (写权限放行)', async () => {
        mockRequireRole.mockResolvedValueOnce({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        // seed 一条 credential 走 admin 路径（默认 mock），然后 org_admin DELETE
        const created = await credentialsHandler(makeEvent('POST', '/api/credentials', {
            name: 'cred-orgadmin-del',
            type: 'classic-pat',
            token: 'ghp_seed',
        })) as { id: string }
        // 重置 mock 让 DELETE 走 org_admin
        mockRequireRole.mockResolvedValue({ user: { id: 'orgadmin-1', email: 'orgadmin@test.dev' } })
        const result = await callId('DELETE', `/api/credentials/${created.id}`, undefined, { id: created.id })
        expect(result).toEqual({ id: created.id, deleted: true })
    })
})

/**
 * 错误响应 i18n（todo.md §M17.2）：throw 改造使用 createLocalizedError，
 * message 按事件 locale 返回（cookie > Accept-Language > 默认 zh-CN），
 * 验证 CREDENTIAL_NOT_FOUND 双语对称。
 */
describe('/api/credentials/[id] 错误响应 i18n（todo.md §M17.2）', () => {
    beforeAll(() => {
        setupMemoryDatabase()
        // 注：删除 `process.env.ENCRYPTION_KEY` 死代码；
        // stub 默认值由 `apps/platform/tests/setup-nuxt-server.ts:26` 全局 useRuntimeConfig 提供
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('CREDENTIAL_NOT_FOUND 默认 zh-CN → 中文 message', async () => {
        await expect(callId('GET', '/api/credentials/nonexistent', undefined, { id: 'nonexistent' }))
            .rejects.toMatchObject({
                statusCode: 404,
                message: '凭据不存在',
                data: { code: 'CREDENTIAL_NOT_FOUND' },
            })
    })

    it('CREDENTIAL_NOT_FOUND Accept-Language=en-US → 英文 message（locale 切换验证）', async () => {
        await expect(callId(
            'GET',
            '/api/credentials/nonexistent',
            undefined,
            { id: 'nonexistent' },
            { 'accept-language': 'en-US,en;q=0.9' },
        )).rejects.toMatchObject({
            statusCode: 404,
            message: 'Credential not found',
            data: { code: 'CREDENTIAL_NOT_FOUND' },
        })
    })
})

/**
 * provider 日志富化凭据（vercel-token / cloudflare-token）写入审计：
 * 创建 / 更新 / 删除必须登记 `provider_log_credential_update`，payload 不含 token；
 * 其它凭据类型不产生该类事件（行为不变）。
 */
describe('provider 日志凭据写入审计', () => {
    const findProviderAudits = async (credentialId: string) => {
        const ds = await ensureDatabaseInitialized()
        const events = await ds.getRepository(AuditEvent).find({
            where: { type: 'provider_log_credential_update' },
            order: { createdAt: 'DESC' },
        })
        return events
            .map((event) => ({
                event,
                payload: JSON.parse(event.payloadJson ?? '{}') as Record<string, unknown>,
            }))
            .filter(({ payload }) => payload.credentialId === credentialId)
    }

    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('创建 vercel-token → action=created，payload 只含 action / credentialId / providerType', async () => {
        const created = await callIndex('POST', '/api/credentials', {
            name: 'vercel-readonly',
            type: 'vercel-token',
            token: 'vercel-secret-token-abc',
        }) as { id: string }

        const audits = await findProviderAudits(created.id)
        expect(audits).toHaveLength(1)
        expect(audits[0]!.payload).toEqual({
            action: 'created',
            credentialId: created.id,
            providerType: 'vercel-token',
        })
        expect(audits[0]!.event.severity).toBe('info')
        expect(audits[0]!.event.repositoryId).toBeNull()
        expect(audits[0]!.event.payloadJson).not.toContain('vercel-secret-token-abc')
    })

    it('GitHub 类型凭据不产生 provider 审计（行为不变）', async () => {
        const created = await callIndex('POST', '/api/credentials', {
            name: 'plain-pat',
            type: 'classic-pat',
            token: 'ghp_plain-token',
        }) as { id: string }

        expect(await findProviderAudits(created.id)).toHaveLength(0)
    })

    it('更新为 cloudflare-token（从 GitHub 类型）→ action=updated，providerType 取新类型', async () => {
        const created = await callIndex('POST', '/api/credentials', {
            name: 'switch-to-cloudflare',
            type: 'classic-pat',
            token: 'ghp_switch-token',
        }) as { id: string }

        // 跨类型切换必须同时提供新 token（禁止把旧 GitHub PAT 当作 provider 凭据继续使用）
        await expectError(
            callId('PUT', `/api/credentials/${created.id}`, { type: 'cloudflare-token' }, { id: created.id }),
            400,
        )
        await callId('PUT', `/api/credentials/${created.id}`, { type: 'cloudflare-token', token: 'cf-readonly-token' }, { id: created.id })

        const audits = await findProviderAudits(created.id)
        expect(audits).toHaveLength(1)
        expect(audits[0]!.payload).toEqual({
            action: 'updated',
            credentialId: created.id,
            providerType: 'cloudflare-token',
        })
    })

    it('切换为 provider 类型时携带 GitHub App / ownerLogin 字段 → 400', async () => {
        const created = await callIndex('POST', '/api/credentials', {
            name: 'switch-with-extra-fields',
            type: 'classic-pat',
            token: 'ghp_switch-token',
        }) as { id: string }

        await expectError(callId('PUT', `/api/credentials/${created.id}`, {
            type: 'vercel-token',
            token: 'vercel-readonly-token',
            ownerLogin: 'someone',
        }, { id: created.id }), 400)
    })

    it('删除 cloudflare-token → action=deleted', async () => {
        const created = await callIndex('POST', '/api/credentials', {
            name: 'cloudflare-delete',
            type: 'cloudflare-token',
            token: 'cf-secret-token',
        }) as { id: string }

        await callId('DELETE', `/api/credentials/${created.id}`, undefined, { id: created.id })

        const audits = await findProviderAudits(created.id)
        expect(audits.map(({ payload }) => payload.action)).toEqual(['deleted', 'created'])
    })
})

/**
 * GitHub App 类型凭据分支覆盖（todo.md §M20.5）
 * 覆盖 credentials/[id].ts 中 type === 'github-app' 的分支
 */
describe('/api/credentials/[id] GitHub App 类型分支覆盖', () => {
    let githubAppId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        // 创建一个 github-app 类型的凭据
        const created = await callIndex('POST', '/api/credentials', {
            name: 'github-app-cred',
            type: 'github-app',
            appId: '12345',
            installationId: '67890',
            botLogin: 'dependfix-bot',
            encryptedPrivateKey: '-----BEGIN RSA PRIVATE KEY-----\ntest-key\n-----END RSA PRIVATE KEY-----',
        }) as { id: string }
        githubAppId = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('GET returns github-app specific fields (appId, installationId, botLogin)', async () => {
        // 分支覆盖：found.type === 'github-app' && { appId, installationId, botLogin }
        const detail = await callId('GET', `/api/credentials/${githubAppId}`, undefined, { id: githubAppId }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: githubAppId,
            name: 'github-app-cred',
            type: 'github-app',
            hasToken: true,
            appId: '12345',
            installationId: '67890',
            botLogin: 'dependfix-bot',
        })
    })

    it('GET returns hasToken based on encryptedPrivateKey for github-app', async () => {
        // 分支覆盖：found.type === 'github-app' ? Boolean(found.encryptedPrivateKey) : Boolean(found.encryptedToken)
        const detail = await callId('GET', `/api/credentials/${githubAppId}`, undefined, { id: githubAppId }) as Record<string, unknown>
        expect(detail.hasToken).toBe(true)
    })

    it('PUT updates github-app specific fields', async () => {
        // 分支覆盖：parsed.data.appId !== undefined, parsed.data.installationId !== undefined, parsed.data.botLogin !== undefined
        const result = await callId('PUT', `/api/credentials/${githubAppId}`, {
            appId: '99999',
            installationId: '11111',
            botLogin: 'new-bot',
        }, { id: githubAppId }) as { updated: boolean }
        expect(result).toEqual({ id: githubAppId, updated: true })

        const detail = await callId('GET', `/api/credentials/${githubAppId}`, undefined, { id: githubAppId }) as Record<string, unknown>
        expect(detail.appId).toBe('99999')
        expect(detail.installationId).toBe('11111')
        expect(detail.botLogin).toBe('new-bot')
    })

    it('PUT updates encryptedPrivateKey for github-app', async () => {
        // 分支覆盖：parsed.data.encryptedPrivateKey !== undefined && parsed.data.encryptedPrivateKey !== ''
        const result = await callId('PUT', `/api/credentials/${githubAppId}`, {
            encryptedPrivateKey: '-----BEGIN RSA PRIVATE KEY-----\nnew-key\n-----END RSA PRIVATE KEY-----',
        }, { id: githubAppId }) as { updated: boolean }
        expect(result).toEqual({ id: githubAppId, updated: true })
    })

    it('PUT updates type field', async () => {
        // 分支覆盖：parsed.data.type !== undefined
        const result = await callId('PUT', `/api/credentials/${githubAppId}`, {
            type: 'fine-grained-pat',
            token: 'github_pat_new-type-token',
        }, { id: githubAppId }) as { updated: boolean }
        expect(result).toEqual({ id: githubAppId, updated: true })
    })

    it('PUT returns 404 for nonexistent credential', async () => {
        // 分支覆盖：!found in updateCredential
        await expectError(callId('PUT', '/api/credentials/nonexistent', { name: 'x' }, { id: 'nonexistent' }), 404)
    })

    it('DELETE returns 404 for nonexistent credential', async () => {
        // 分支覆盖：!found in deleteCredential
        await expectError(callId('DELETE', '/api/credentials/nonexistent', undefined, { id: 'nonexistent' }), 404)
    })

    it('returns 400 when id param is missing', async () => {
        // 分支覆盖：!id in main handler
        await expectError(callId('GET', '/api/credentials/'), 400)
    })
})
