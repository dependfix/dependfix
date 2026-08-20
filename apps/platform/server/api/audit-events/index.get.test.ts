import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase, expectError } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import auditEventsHandler from './index.get'
import { ScanRun } from '#server/entities/scan-run'
import { AuditEvent } from '#server/entities/audit-event'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async (_event: unknown, roles: string[]) => {
        if (!roles.includes('admin') && !roles.includes('org_admin')) {
            throw new Error('forbidden')
        }
        return { user: { id: 'u1', email: 'admin@test.dev' } }
    }),
}))

const call = (url: string) => auditEventsHandler(makeEvent('GET', url))

describe('GET /api/audit-events', () => {
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'sandbox',
            status: 'degraded',
        }))

        await ds.getRepository(AuditEvent).save(ds.getRepository(AuditEvent).create({
            type: 'sandbox_unavailable',
            severity: 'error',
            repositoryId,
            scanRunId: run.id,
            payloadJson: JSON.stringify({ code: 'sandbox_unavailable', adapter: 'docker', errno: 'ENOENT' }),
            notified: false,
            notifiedVia: null,
        }))

        await ds.getRepository(AuditEvent).save(ds.getRepository(AuditEvent).create({
            type: 'sandbox_degraded',
            severity: 'warn',
            repositoryId,
            scanRunId: run.id,
            payloadJson: JSON.stringify({ degradedReason: { code: 'sandbox_unavailable', message: '降级' } }),
            notified: true,
            notifiedVia: 'email',
        }))

        await ds.getRepository(AuditEvent).save(ds.getRepository(AuditEvent).create({
            type: 'sandbox_degraded',
            severity: 'warn',
            payloadJson: null,
            notified: false,
            notifiedVia: null,
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        // 恢复默认 admin mock（每个 test 独立）
        const guard = await import('#server/utils/guard')
        vi.mocked(guard.requireRole).mockImplementation(
            async (_event: unknown, roles: string[]) => {
                if (!roles.includes('admin') && !roles.includes('org_admin')) {
                    throw new Error('forbidden')
                }
                return { user: { id: 'u1', email: 'admin@test.dev' } }
            },
        )
    })

    it('returns all events by default sorted by createdAt DESC', async () => {
        const list = await call('/api/audit-events') as Record<string, unknown>[]
        expect(list).toHaveLength(3)
        // createdAt 非递增（DESC 语义）；不验证具体顺序（同秒插入受 SQLite 精度影响）
        const times = list.map((e) => new Date(e.createdAt as string).getTime())
        for (let i = 1; i < times.length; i++) {
            expect(times[i] ?? 0).toBeLessThanOrEqual(times[i - 1] ?? 0)
        }
    })

    it('filters by type', async () => {
        const list = await call('/api/audit-events?type=sandbox_unavailable') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]?.severity).toBe('error')
    })

    it('filters by severity', async () => {
        const list = await call('/api/audit-events?severity=warn') as Record<string, unknown>[]
        expect(list).toHaveLength(2)
    })

    it('filters by notified=true', async () => {
        const list = await call('/api/audit-events?notified=true') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]?.notifiedVia).toBe('email')
    })

    it('filters by notified=false', async () => {
        const list = await call('/api/audit-events?notified=false') as Record<string, unknown>[]
        expect(list).toHaveLength(2)
    })

    it('filters by repositoryId', async () => {
        const list = await call(`/api/audit-events?repositoryId=${repositoryId}`) as Record<string, unknown>[]
        expect(list).toHaveLength(2)
        expect(list[0]?.repository).toBe('demo/app')
    })

    it('treats "all" query values as no filter', async () => {
        const list = await call('/api/audit-events?type=all&severity=all&notified=all&repositoryId=all') as Record<string, unknown>[]
        expect(list).toHaveLength(3)
    })

    it('filters by time range from/to', async () => {
        const past = '2020-01-01T00:00:00Z'
        const future = '2099-01-01T00:00:00Z'
        const inRange = await call(`/api/audit-events?from=${past}&to=${future}`) as Record<string, unknown>[]
        expect(inRange).toHaveLength(3)
        const onlyFuture = await call(`/api/audit-events?from=${future}`) as Record<string, unknown>[]
        expect(onlyFuture).toHaveLength(0)
    })

    // RG-B08：非法值必须 400（不再"忽略"）
    it('rejects invalid type with 400', async () => {
        await expectError(call('/api/audit-events?type=invalid'), 400)
    })

    it('rejects invalid severity with 400', async () => {
        await expectError(call('/api/audit-events?severity=invalid'), 400)
    })

    it('rejects invalid notified with 400', async () => {
        await expectError(call('/api/audit-events?notified=maybe'), 400)
    })

    it('rejects invalid from datetime with 400', async () => {
        await expectError(call('/api/audit-events?from=not-a-date'), 400)
    })

    it('rejects reversed time range (from > to) with 400', async () => {
        await expectError(call('/api/audit-events?from=2099-01-01T00:00:00Z&to=2020-01-01T00:00:00Z'), 400)
    })

    // RG-B05：viewer 必须 403
    it('rejects viewer role with 403', async () => {
        vi.mocked((await import('#server/utils/guard')).requireRole).mockImplementationOnce(
            async () => {
                throw new Error('forbidden')
            },
        )
        await expect(call('/api/audit-events')).rejects.toThrow()
    })

    it('rejects when requireRole throws (e.g. unauthenticated)', async () => {
        vi.mocked((await import('#server/utils/guard')).requireRole).mockImplementationOnce(
            async () => {
                throw new Error('unauthorized')
            },
        )
        await expect(call('/api/audit-events')).rejects.toThrow()
    })
})
