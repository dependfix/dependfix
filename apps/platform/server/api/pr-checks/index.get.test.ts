import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import prChecksHandler from './index.get'
import { PRCheck } from '#server/entities/pr-check'
import { Repository } from '#server/entities/repository'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (url: string) => prChecksHandler(makeEvent('GET', url))

describe('GET /api/pr-checks', () => {
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const repo = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = repo.id

        const ds = await ensureDatabaseInitialized()
        const repoRepo = ds.getRepository(PRCheck)
        // 1 个 success PR
        await repoRepo.save(repoRepo.create({
            repositoryId,
            prNumber: 1,
            headSha: 'a'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'success',
            checkRunId: '100',
            detailsUrl: 'https://github.com/demo/app/pull/1',
            errorMessage: null,
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-01T00:00:00Z'),
        }))
        // 1 个 failure PR (firing=true)
        await repoRepo.save(repoRepo.create({
            repositoryId,
            prNumber: 2,
            headSha: 'b'.repeat(40),
            authorLogin: 'dependfix[bot]',
            conclusion: 'failure',
            checkRunId: '200',
            detailsUrl: 'https://github.com/demo/app/pull/2',
            errorMessage: 'TS2339: x missing',
            alertFiring: true,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-02T00:00:00Z'),
        }))
        // 1 个 pending PR
        await repoRepo.save(repoRepo.create({
            repositoryId,
            prNumber: 3,
            headSha: 'c'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'pending',
            checkRunId: null,
            detailsUrl: null,
            errorMessage: null,
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-03T00:00:00Z'),
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('返回全部 PRCheck（默认按 createdAt DESC；3 条 createdAt 接近，断言用 set）', async () => {
        const list = await call('/api/pr-checks') as Array<{ prNumber: number }>
        expect(list).toHaveLength(3)
        // 3 条 createdAt 接近，SQLite datetime 精度下顺序不稳定，仅断言 set 包含
        expect(new Set(list.map((r) => r.prNumber))).toEqual(new Set([1, 2, 3]))
    })

    it('repositoryId 过滤：限定仓库', async () => {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(Repository).save(ds.getRepository(Repository).create({
            organizationId: null,
            owner: 'other',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }))
        const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as Array<{ repositoryId: string }>
        expect(list.every((r) => r.repositoryId === repositoryId)).toBe(true)
    })

    it('conclusion 过滤：仅 failure', async () => {
        const list = await call('/api/pr-checks?conclusion=failure') as Array<{ conclusion: string }>
        expect(list).toHaveLength(1)
        expect(list[0]!.conclusion).toBe('failure')
    })

    it('alertFiring=true 仅返回 firing 的 PR', async () => {
        const list = await call('/api/pr-checks?alertFiring=true') as Array<{ alertFiring: boolean }>
        expect(list).toHaveLength(1)
        expect(list[0]!.alertFiring).toBe(true)
    })

    it('alertFiring=false 仅返回非 firing 的 PR', async () => {
        const list = await call('/api/pr-checks?alertFiring=false') as Array<{ alertFiring: boolean }>
        expect(list.length).toBeGreaterThan(0)
        expect(list.every((r) => r.alertFiring === false)).toBe(true)
    })
})

// 抑制 beforeEach 未使用警告（vitest 内置）
void beforeEach
