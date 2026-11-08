import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import summaryHandler from './summary.get'
import { PRCheck } from '#server/entities/pr-check'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = () => summaryHandler(makeEvent('GET', '/api/pr-checks/summary'))

describe('GET /api/pr-checks/summary', () => {
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

        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(PRCheck)
        // 1 success
        await repo.save(repo.create({
            repositoryId: created.id,
            prNumber: 1,
            headSha: 'a'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'success',
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-01T00:00:00Z'),
        }))
        // 2 failure（1 firing + 1 ack 但未回归 success）
        await repo.save(repo.create({
            repositoryId: created.id,
            prNumber: 2,
            headSha: 'b'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'failure',
            alertFiring: true,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-02T00:00:00Z'),
        }))
        await repo.save(repo.create({
            repositoryId: created.id,
            prNumber: 3,
            headSha: 'c'.repeat(40),
            authorLogin: 'dependfix[bot]',
            conclusion: 'failure',
            alertFiring: false,
            acknowledgedAt: new Date('2026-09-03T00:00:00Z'),
            acknowledgedByUserId: 'u1',
            lastPolledAt: new Date('2026-09-03T00:00:00Z'),
        }))
        // 1 pending
        await repo.save(repo.create({
            repositoryId: created.id,
            prNumber: 4,
            headSha: 'd'.repeat(40),
            authorLogin: 'dependabot[bot]',
            conclusion: 'pending',
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-03T00:00:00Z'),
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('total = 4', async () => {
        const summary = await call() as { total: number, firing: number, acknowledged: number }
        expect(summary.total).toBe(4)
    })

    it('firing = 1（仅 alertFiring=true）', async () => {
        const summary = await call() as { firing: number }
        expect(summary.firing).toBe(1)
    })

    it('关闭 / 合并的 firing 行不计入 firing；unknown 保持 fail-open 计入', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(PRCheck)
        const repositoryId = (await repo.findOne({ where: { prNumber: 1 } }))!.repositoryId
        const rows = [
            { prNumber: 5, prState: 'closed' as const, acknowledgedAt: new Date('2026-09-05T00:00:00Z') },
            { prNumber: 6, prState: 'merged' as const, acknowledgedAt: new Date('2026-09-06T00:00:00Z') },
            { prNumber: 7, prState: 'unknown' as const, acknowledgedAt: null },
        ]
        for (const row of rows) {
            await repo.save(repo.create({
                repositoryId,
                prNumber: row.prNumber,
                headSha: String(row.prNumber).repeat(40).slice(0, 40),
                authorLogin: 'dependfix[bot]',
                conclusion: 'failure',
                prState: row.prState,
                alertFiring: true,
                acknowledgedAt: row.acknowledgedAt,
                acknowledgedByUserId: row.acknowledgedAt ? 'u1' : null,
                lastPolledAt: new Date('2026-09-04T00:00:00Z'),
            }))
        }

        try {
            const summary = await call() as { firing: number, acknowledged: number }
            // 原有 1 条 open firing + unknown 1 条；closed / merged 各 1 条被排除
            expect(summary.firing).toBe(2)
            // 已 ack 计数同样排除终态：closed / merged 行即使有 acknowledgedAt 也不计入
            expect(summary.acknowledged).toBe(1)
        } finally {
            for (const row of rows) {
                await repo.delete({ prNumber: row.prNumber })
            }
        }
    })

    it('acknowledged = 1（alertFiring=false 且 acknowledgedAt 非空）', async () => {
        const summary = await call() as { acknowledged: number }
        expect(summary.acknowledged).toBe(1)
    })

    it('byConclusion 按 conclusion 分组', async () => {
        const summary = await call() as { byConclusion: { conclusion: string, count: number }[] }
        const grouped = Object.fromEntries(summary.byConclusion.map((row) => [row.conclusion, row.count]))
        expect(grouped.success).toBe(1)
        expect(grouped.failure).toBe(2)
        expect(grouped.pending).toBe(1)
    })
})
