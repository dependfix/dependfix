import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import batchRunsHandler from './index.get'
import { BatchRun } from '#server/entities/batch-run'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string) => batchRunsHandler(makeEvent(method, url))

/** 清理 BatchRun 表（每个测试独立，保证断言不被前序测试影响）。
 * 注：故意保留 Organization 表——resolveOrganizationId 依赖其存在。 */
const clearBatchRuns = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    await ds.getRepository(BatchRun).clear()
}

describe('GET /api/batch-runs', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        await clearBatchRuns()
    })

    it('returns empty list on fresh database', async () => {
        expect(await call('GET', '/api/batch-runs')).toEqual([])
    })

    it('lists batch runs of current organization', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 2,
            status: 'running',
            summaryJson: JSON.stringify({ alertsTotal: 3 }),
        }))

        const list = await call('GET', '/api/batch-runs') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        expect(list[0]).toMatchObject({
            source: 'manual',
            status: 'running',
            repositoryCount: 2,
            summary: { alertsTotal: 3 },
        })
    })

    it('returns updatedAt for incremental reconcile', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'report-only',
            severityThreshold: 'all',
            repositoryCount: 1,
            status: 'running',
        }))

        const list = await call('GET', '/api/batch-runs') as Record<string, unknown>[]
        expect(list).toHaveLength(1)
        // updatedAt 由 BaseEntity.@UpdateDateColumn 自动维护
        // 注：测试直接调用 handler 不走 Nuxt JSON 序列化，updatedAt 仍是 Date 对象；
        // 真实 HTTP 响应时会被序列化为 ISO 字符串（前端拿到的就是字符串）
        const updatedAt = list[0]!.updatedAt
        expect(updatedAt).toBeDefined()
        const ts = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt as string).getTime()
        expect(Number.isFinite(ts) && ts > 0).toBe(true)
    })
})
