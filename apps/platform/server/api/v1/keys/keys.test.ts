import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import listHandler from './index.get'
import createHandler, { resetApiKeyCreateLimit } from './index.post'
import deleteHandler from './[id].delete'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'
import { ApiKey } from '#server/entities/api-key'
import { ApiRequestLog } from '#server/entities/api-request-log'
import { AuditEvent } from '#server/entities/audit-event'
import { Organization } from '#server/entities/organization'
import { hashApiKey, readApiKeyScopes, verifyApiKeyHash } from '#server/utils/api-key'

vi.mock('#server/utils/guard', () => ({
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

let sequence = 0
const seedKey = async (organizationId: string, scopes: string[] = ['read'], overrides: Record<string, unknown> = {}) => {
    sequence += 1
    const ds = await ensureDatabaseInitialized()
    const plaintext = `dfk_test${sequence}plaintext`
    return ds.getRepository(ApiKey).save(ds.getRepository(ApiKey).create({
        name: `key ${sequence}`,
        prefix: 'dfk_',
        start: plaintext.slice(0, 8),
        referenceId: organizationId,
        key: hashApiKey(plaintext),
        enabled: true,
        requestCount: 0,
        expiresAt: new Date('2027-02-18T00:00:00Z'),
        metadata: JSON.stringify({ scopes }),
        ...overrides,
    }))
}

describe('/api/v1/keys key 管理', () => {
    let organizationId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const ds = await ensureDatabaseInitialized()
        organizationId = await resolveOrganizationId(ds)
    })

    afterAll(() => teardownMemoryDatabase())

    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllEnvs()
        resetApiKeyCreateLimit()
    })

    it('列表只返回前缀与元数据，不返回明文 / 哈希', async () => {
        const seeded = await seedKey(organizationId)
        const body = await listHandler(makeEvent('GET', '/api/v1/keys')) as {
            items: Record<string, unknown>[]
            total: number
        }
        const row = body.items.find((item) => item.id === seeded.id)
        expect(row).toBeTruthy()
        expect(row).toMatchObject({ id: seeded.id, prefix: 'dfk_', scopes: ['read'] })
        expect(row).not.toHaveProperty('key')
        expect(row).not.toHaveProperty('referenceId')
    })

    it('创建返回一次性明文、90 天 TTL 与 read scope，且存储的是哈希', async () => {
        const body = await createHandler(makeEvent('POST', '/api/v1/keys', { name: 'ci' })) as {
            id: string
            key: string
            expiresAt: Date
        }
        expect(body.key.startsWith('dfk_')).toBe(true)
        const ttlDays = (body.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        expect(ttlDays).toBeGreaterThan(89)
        expect(ttlDays).toBeLessThan(91)

        const ds = await ensureDatabaseInitialized()
        const stored = await ds.getRepository(ApiKey).findOneOrFail({ where: { id: body.id } })
        expect(stored.key).not.toBe(body.key)
        expect(verifyApiKeyHash(body.key, stored.key)).toBe(true)
        expect(readApiKeyScopes(stored.metadata)).toEqual(['read'])

        const logs = await ds.getRepository(ApiRequestLog).find({ where: { apiKeyId: body.id } })
        expect(logs.some((log) => log.statusCode === 200)).toBe(true)

        const audit = await ds.getRepository(AuditEvent).find({ where: { type: 'api_key_created' } })
        const createdEvents = audit.filter((event) => (event.payloadJson ?? '').includes(body.id))
        expect(createdEvents).toHaveLength(1)
        const created = createdEvents[0]!
        expect(created.severity).toBe('info')
        expect(JSON.parse(created.payloadJson!)).toMatchObject({ action: 'created', keyId: body.id })
        expect(created.payloadJson).not.toContain(body.key)
        expect(created.payloadJson).not.toContain(stored.key)
    })

    it('创建接口限流：超限返回 429 且写访问日志', async () => {
        vi.stubEnv('API_KEY_CREATE_RATE_LIMIT_MAX', '1')
        await createHandler(makeEvent('POST', '/api/v1/keys', { name: 'rate-1' }))
        const ds = await ensureDatabaseInitialized()
        await expect(createHandler(makeEvent('POST', '/api/v1/keys', { name: 'rate-2' })))
            .rejects.toMatchObject({ statusCode: 429 })
        const logs = await ds.getRepository(ApiRequestLog).find({ where: { statusCode: 429 } })
        expect(logs.length).toBeGreaterThan(0)
    })

    it('每组织 10 把上限：第 11 把返回 409', async () => {
        for (let index = 0; index < 10; index += 1) {
            await seedKey(organizationId, ['read'], { name: `limit ${index}` })
        }
        await expect(createHandler(makeEvent('POST', '/api/v1/keys', { name: 'overflow' })))
            .rejects.toMatchObject({ statusCode: 409 })
    })

    it('吊销仅限当前组织：跨组织 key 按不存在处理且不删除', async () => {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(Organization).save(ds.getRepository(Organization).create({ id: 'other-org-key-org', name: 'Other' }))
        const otherKey = await seedKey('other-org-key-org', ['read'])

        await expect(deleteHandler(makeEvent('DELETE', `/api/v1/keys/${otherKey.id}`, undefined, {}, { id: otherKey.id })))
            .rejects.toMatchObject({ statusCode: 404 })
        expect(await ds.getRepository(ApiKey).findOne({ where: { id: otherKey.id } })).not.toBeNull()
    })

    it('吊销本组织 key 后返回 deleted 且记录消失', async () => {
        const seeded = await seedKey(organizationId)
        const body = await deleteHandler(makeEvent('DELETE', `/api/v1/keys/${seeded.id}`, undefined, {}, { id: seeded.id })) as Record<string, unknown>
        expect(body).toEqual({ deleted: true })
        const ds = await ensureDatabaseInitialized()
        const audit = await ds.getRepository(AuditEvent).find({ where: { type: 'api_key_deleted' } })
        const deleted = audit.filter((event) => (event.payloadJson ?? '').includes(seeded.id))
        expect(deleted).toHaveLength(1)
        expect(JSON.parse(deleted[0]!.payloadJson!)).toMatchObject({ action: 'deleted', keyId: seeded.id })
        expect(await ds.getRepository(ApiKey).findOne({ where: { id: seeded.id } })).toBeNull()
    })

    it('名称缺失或超长返回 400', async () => {
        await expect(createHandler(makeEvent('POST', '/api/v1/keys', { name: '' }))).rejects.toMatchObject({ statusCode: 400 })
        await expect(createHandler(makeEvent('POST', '/api/v1/keys', { name: 'x'.repeat(40) }))).rejects.toMatchObject({ statusCode: 400 })
    })
})
