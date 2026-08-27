import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import runsHandler from './index.get'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { ensureDefaultOrganization } from '#server/utils/organization'

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

    /**
     * todo.md §M16.1 组织隔离：当前 /api/runs 隐式按当前组织过滤（单组织模型下默认 `dependfix-default`），
     * 验证：跨组织的 ScanRun 不会出现在响应中。
     * 隔离机制：handler 内部通过 where.repository.organizationId 加入组织维度过滤；
     * 显式注入 foreign-org ScanRun（绕过 reposIndexHandler 写入组织隔离），断言 GET /api/runs 不返回该行。
     */
    it('organizationId isolation: excludes ScanRuns from a foreign organization', async () => {
        const ds = await ensureDatabaseInitialized()
        // ensureDefaultOrganization：Repository.organizationId 是 FK，FK 约束要求默认 org 已存在
        await ensureDefaultOrganization(ds)
        // 创建 foreign org + foreign repo（绕过 repos handler 注入默认组织）以模拟跨组织数据
        const orgRepo = ds.getRepository(Organization)
        const foreignOrg = await orgRepo.save(orgRepo.create({
            id: 'foreign-org-not-current',
            name: 'Foreign',
        }))
        const repoRepo = ds.getRepository(Repository)
        const foreignRepo = await repoRepo.save(repoRepo.create({
            organizationId: foreignOrg.id,
            owner: 'foreign',
            name: 'leak',
            platform: 'github',
            defaultBranch: 'main',
            packageManager: 'pnpm',
            executorKind: 'container',
            credentialId: null,
            actionWorkflowFile: null,
            note: null,
            tags: null,
            sandboxLimits: null,
            lastScanAt: null,
        }))
        const runRepo = ds.getRepository(ScanRun)
        const foreignRun = await runRepo.save(runRepo.create({
            repositoryId: foreignRepo.id,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: null,
        }))

        const res = await call('GET', '/api/runs') as PaginatedRunsResponse
        const ids = res.items.map((r) => r.id as string)
        expect(ids).not.toContain(foreignRun.id)
        // 反向断言：当前组织的 run 应仍然可见（不会因为新插入 foreign-org 影响总数计算）
        const sameRes = await call('GET', '/api/runs') as PaginatedRunsResponse
        expect(res.total).toBe(sameRes.total)
    })
})
