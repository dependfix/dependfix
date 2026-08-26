import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import runsHandler from './index.get'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string) => runsHandler(makeEvent(method, url))

const createRepo = async () => {
    const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
        owner: 'demo',
        name: 'app',
        platform: 'github',
        packageManager: 'pnpm',
        defaultBranch: 'main',
        executorKind: 'container',
    })) as { id: string }
    return created.id
}

interface PaginatedRunsResponse {
    items: Record<string, unknown>[]
    total: number
    page: number
    pageSize: number
}

const seedRun = async (repositoryId: string, overrides: {
    mode?: string
    severityThreshold?: string
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'dispatched' | 'degraded'
    summaryJson?: string | null
} = {}) => {
    const ds = await ensureDatabaseInitialized()
    const entity = ds.getRepository(ScanRun).create({
        repositoryId,
        mode: overrides.mode ?? 'fix',
        severityThreshold: overrides.severityThreshold ?? 'high',
        executorKind: 'container',
        status: overrides.status ?? 'completed',
        summaryJson: overrides.summaryJson ?? JSON.stringify({ alertsTotal: 2 }),
    })
    const saved = await ds.getRepository(ScanRun).save(entity)
    // TypeORM save 返回 Entity | Entity[]；单条保存断言为 ScanRun
    return Array.isArray(saved) ? saved[0] : saved
}

describe('GET /api/runs', () => {
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        repositoryId = await createRepo()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns empty paginated response on fresh database', async () => {
        // 注意：必须在任何 seed 之前；测试间共享内存 DB，本 case 期望 total=0
        const res = await call('GET', '/api/runs') as PaginatedRunsResponse
        expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 100 })
    })

    it('lists scan runs with repository relation (default pageSize=100)', async () => {
        const seeded = await seedRun(repositoryId, { summaryJson: JSON.stringify({ alertsTotal: 2 }) })

        const res = await call('GET', '/api/runs') as PaginatedRunsResponse
        expect(res.items.length).toBeGreaterThan(0)
        expect(res.total).toBeGreaterThan(0)
        expect(res.page).toBe(1)
        expect(res.pageSize).toBe(100)
        // 不依赖 items[0]（共享 DB 顺序不可控）；按 id 查找刚 seed 的
        const target = res.items.find((r) => r.id === seeded.id)
        expect(target).toMatchObject({
            owner: 'demo',
            name: 'app',
            status: 'completed',
            summary: { alertsTotal: 2 },
        })
    })

    it('filters by repositoryId query', async () => {
        const all = await call('GET', '/api/runs') as PaginatedRunsResponse
        const filtered = await call('GET', `/api/runs?repositoryId=${repositoryId}`) as PaginatedRunsResponse
        expect(filtered.total).toBe(all.total)

        const none = await call('GET', '/api/runs?repositoryId=nonexistent') as PaginatedRunsResponse
        expect(none).toEqual({ items: [], total: 0, page: 1, pageSize: 100 })
    })

    it('filters by ids query (alerts.vue openRunSidebar 修复)', async () => {
        // seed 多条 run，挑选其中两条 id 过滤
        const a = await seedRun(repositoryId, { status: 'completed' })
        const b = await seedRun(repositoryId, { status: 'failed' })
        const c = await seedRun(repositoryId, { status: 'dispatched' })

        const res = await call('GET', `/api/runs?ids=${a.id},${c.id}`) as PaginatedRunsResponse
        expect(res.total).toBe(2)
        const ids = res.items.map((r) => r.id as string).sort()
        expect(ids).toEqual([a.id, c.id].sort())
        // 顺序按 createdAt DESC；先后顺序不影响 this assertion
        expect(res.items.find((r) => r.id === b.id)).toBeUndefined()
    })

    it('respects custom page and pageSize', async () => {
        // seed 5 条以支持分页
        const seeded = await Promise.all(
            Array.from({ length: 5 }, () => seedRun(repositoryId, { status: 'completed' })),
        )
        const beforeCount = (await call('GET', '/api/runs') as PaginatedRunsResponse).total

        const page2 = await call('GET', '/api/runs?page=2&pageSize=2') as PaginatedRunsResponse
        expect(page2.total).toBe(beforeCount)
        expect(page2.page).toBe(2)
        expect(page2.pageSize).toBe(2)
        expect(page2.items).toHaveLength(Math.min(2, Math.max(0, beforeCount - 2)))
        expect(seeded).toHaveLength(5)
    })

    it('clamps pageSize to PAGE_SIZE_MAX (200)', async () => {
        const res = await call('GET', '/api/runs?pageSize=500') as PaginatedRunsResponse
        expect(res.pageSize).toBe(200)
    })

    it('clamps pageSize to PAGE_SIZE_MAX (silently, no error)', async () => {
        // 上限钳制是静默的：pageSize=300 → 200，page/total 仍正常返回
        const res = await call('GET', '/api/runs?pageSize=300&page=1') as PaginatedRunsResponse
        expect(res.pageSize).toBe(200)
        expect(res.page).toBe(1)
    })

    it('throws 400 on invalid page (<1)', async () => {
        await expect(call('GET', '/api/runs?page=0')).rejects.toMatchObject({ statusCode: 400 })
        await expect(call('GET', '/api/runs?page=-1')).rejects.toMatchObject({ statusCode: 400 })
    })

    it('throws 400 on invalid pageSize (<1)', async () => {
        await expect(call('GET', '/api/runs?pageSize=0')).rejects.toMatchObject({ statusCode: 400 })
    })
})
