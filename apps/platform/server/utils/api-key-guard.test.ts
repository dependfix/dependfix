import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import { getAuthInstance } from './auth'
import { hashApiKey } from './api-key'
import { requireV1Auth, resetApiKeyRateLimit } from './api-key-guard'
import { ensureDatabaseInitialized } from '#server/database'
import { ApiRequestLog } from '#server/entities/api-request-log'
import { resolveOrganizationId } from '#server/utils/organization'
import { ApiKey } from '#server/entities/api-key'

/**
 * API key 守卫（自建存储，内存 SQLite + 真实 TypeORM 适配器）。
 * 覆盖：创建 / 校验 / 吊销、scope 缺失 403 + 访问日志、限流 429 + Retry-After、无凭据 401。
 */
describe('api-key guard', () => {
    let organizationId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const ds = await ensureDatabaseInitialized()
        organizationId = await resolveOrganizationId(ds)
        // 会话回退用例需要可用的 better-auth 实例（AUTH_MODE 由 runtimeConfig 提供）
        const auth = await getAuthInstance({
            authSecret: 'test-secret-not-default',
            smtpHost: '',
            registrationDisabled: false,
            authMode: 'public',
            allowedEmailDomains: [],
            blockedEmailDomains: [],
        })
        ;(globalThis as Record<string, unknown>).__dependfix_auth_instance__ = auth

    })

    afterAll(() => teardownMemoryDatabase())

    beforeEach(() => {
        resetApiKeyRateLimit()
        vi.unstubAllEnvs()
    })

    let keySequence = 0
    const createKey = async (scopes: string[], name = 'test') => {
        const ds = await ensureDatabaseInitialized()
        keySequence += 1
        const key = `dfk_testkey${keySequence}abcdefghijklmnopqrstuvwxyz0123456789`
        const saved = await ds.getRepository(ApiKey).save(ds.getRepository(ApiKey).create({
            name,
            start: key.slice(0, 8),
            referenceId: organizationId,
            prefix: 'dfk_',
            key: hashApiKey(key),
            enabled: true,
            requestCount: 0,
            metadata: JSON.stringify({ scopes }),
        }))
        return { id: saved.id, key }
    }

    it('creates a dfk_ key, verifies it and exposes organization/scopes', async () => {
        const created = await createKey(['read'])
        expect(created.key.startsWith('dfk_')).toBe(true)

        const event = makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${created.key}` })
        const auth = await requireV1Auth(event, { requireScope: 'read' })
        expect(auth.kind).toBe('api-key')
        expect(auth.organizationId).toBe(organizationId)
        expect(auth.scopes).toEqual(['read'])

        const ds = await ensureDatabaseInitialized()
        const logs = await ds.getRepository(ApiRequestLog).find()
        expect(logs.some((log) => log.apiKeyId === created.id && log.statusCode === 200)).toBe(true)
    })

    it('rejects a key without read scope with 403 and writes an access log', async () => {
        const created = await createKey([], 'no-scope')
        const event = makeEvent('GET', '/api/v1/runs', undefined, { authorization: `Bearer ${created.key}` })

        await expect(requireV1Auth(event, { requireScope: 'read' })).rejects.toMatchObject({ statusCode: 403 })

        const ds = await ensureDatabaseInitialized()
        const logs = await ds.getRepository(ApiRequestLog).find({ where: { statusCode: 403 } })
        expect(logs.some((log) => log.apiKeyId === created.id)).toBe(true)
    })

    it('rejects missing credentials with 401', async () => {
        await expect(requireV1Auth(makeEvent('GET', '/api/v1/repos'), { requireScope: 'read' }))
            .rejects.toMatchObject({ statusCode: 401 })
    })

    it('enforces the regular rate limit and sets Retry-After', async () => {
        vi.stubEnv('API_KEY_RATE_LIMIT_REGULAR_MAX', '1')
        const created = await createKey(['read'], 'rate-limited')

        const first = makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${created.key}` })
        await expect(requireV1Auth(first, { requireScope: 'read' })).resolves.toMatchObject({ kind: 'api-key' })

        const second = makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${created.key}` })
        await expect(requireV1Auth(second, { requireScope: 'read' })).rejects.toMatchObject({ statusCode: 429 })
        const header = second.node.res.getHeader('Retry-After')
        expect(Number(header)).toBeGreaterThan(0)
    })

    it('rejects expired and disabled keys with 401', async () => {
        const expired = await createKey(['read'], 'expired')
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ApiKey).update({ id: expired.id }, { expiresAt: new Date(Date.now() - 1000) })
        await expect(requireV1Auth(
            makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${expired.key}` }),
            { requireScope: 'read' },
        )).rejects.toMatchObject({ statusCode: 401 })

        const disabled = await createKey(['read'], 'disabled')
        await ds.getRepository(ApiKey).update({ id: disabled.id }, { enabled: false })
        await expect(requireV1Auth(
            makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${disabled.key}` }),
            { requireScope: 'read' },
        )).rejects.toMatchObject({ statusCode: 401 })
    })

    it('enforces the log-endpoint rate limit tier separately', async () => {
        vi.stubEnv('API_KEY_RATE_LIMIT_LOG_MAX', '1')
        const created = await createKey(['read'], 'log-tier')
        const first = makeEvent('GET', '/api/v1/runs/x/logs', undefined, { authorization: `Bearer ${created.key}` })
        await expect(requireV1Auth(first, { rateLimitClass: 'log', requireScope: 'read' })).resolves.toMatchObject({ kind: 'api-key' })
        const second = makeEvent('GET', '/api/v1/runs/x/logs', undefined, { authorization: `Bearer ${created.key}` })
        await expect(requireV1Auth(second, { rateLimitClass: 'log', requireScope: 'read' })).rejects.toMatchObject({ statusCode: 429 })
    })

    it('updates lastRequest / requestCount on successful use', async () => {
        const created = await createKey(['read'], 'usage')
        await requireV1Auth(
            makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${created.key}` }),
            { requireScope: 'read' },
        )
        const ds = await ensureDatabaseInitialized()
        const stored = await ds.getRepository(ApiKey).findOneOrFail({ where: { id: created.id } })
        expect(stored.lastRequest).not.toBeNull()
        expect(stored.requestCount).toBe(1)
    })

    it('rejects a revoked key immediately', async () => {
        const created = await createKey(['read'], 'revoked')
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ApiKey).delete({ id: created.id })

        const event = makeEvent('GET', '/api/v1/repos', undefined, { authorization: `Bearer ${created.key}` })
        await expect(requireV1Auth(event, { requireScope: 'read' })).rejects.toMatchObject({ statusCode: 401 })
    })
})
