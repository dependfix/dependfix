import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
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
        const list = await call('/api/pr-checks') as { prNumber: number }[]
        expect(list).toHaveLength(3)
        // 3 条 createdAt 接近，SQLite datetime 精度下顺序不稳定，仅断言 set 包含
        expect(new Set(list.map((r) => r.prNumber))).toEqual(new Set([1, 2, 3]))
    })

    it('视图包含服务端解析的仓库标签 owner/name（列表行内辨识跨仓库同号 PR）', async () => {
        const list = await call('/api/pr-checks') as { repository: string | null }[]
        expect(list).toHaveLength(3)
        expect(list.every((r) => r.repository === 'demo/app')).toBe(true)
    })

    it('视图暴露 prState（存量行默认 unknown）', async () => {
        const list = await call('/api/pr-checks') as { prNumber: number, prState: string }[]
        const target = list.find((r) => r.prNumber === 1)!
        expect(target.prState).toBe('unknown')
    })

    it('非法 conclusion → 400（不再静默退回全量）', async () => {
        await expect(call('/api/pr-checks?conclusion=not-a-conclusion')).rejects.toMatchObject({
            statusCode: 400,
        })
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
        const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as { repositoryId: string }[]
        expect(list.every((r) => r.repositoryId === repositoryId)).toBe(true)
    })

    it('conclusion 过滤：仅 failure', async () => {
        const list = await call('/api/pr-checks?conclusion=failure') as { conclusion: string }[]
        expect(list).toHaveLength(1)
        expect(list[0]!.conclusion).toBe('failure')
    })

    it('alertFiring=true 仅返回 firing 的 PR', async () => {
        const list = await call('/api/pr-checks?alertFiring=true') as { alertFiring: boolean }[]
        expect(list).toHaveLength(1)
        expect(list[0]!.alertFiring).toBe(true)
    })

    it('视图暴露三源聚合字段（overallStatus / signals / failureSources）', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(PRCheck)
        await repo.save(repo.create({
            repositoryId,
            prNumber: 9,
            headSha: 'd'.repeat(40),
            authorLogin: 'dependfix[bot]',
            conclusion: 'failure',
            signalsJson: JSON.stringify([{
                kind: 'deployment',
                provider: 'vercel',
                name: 'Preview',
                state: 'failure',
                rawState: 'failure',
                sourceId: '5001',
                targetUrl: null,
                logUrl: 'https://vercel.com/logs',
                summary: 'Deployment failed',
                observedAt: '2026-09-04T00:00:00.000Z',
            }]),
            overallStatus: 'failure',
            failureSourcesJson: JSON.stringify([{ provider: 'vercel', name: 'Preview', kind: 'deployment' }]),
            alertFiring: true,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-04T00:00:00Z'),
        }))

        const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as {
            prNumber: number
            overallStatus: string | null
            signals: unknown[] | null
            failureSources: unknown[] | null
        }[]
        const target = list.find((r) => r.prNumber === 9)!
        expect(target.overallStatus).toBe('failure')
        expect(target.signals).toHaveLength(1)
        expect((target.signals?.[0] as { provider: string }).provider).toBe('vercel')
        expect(target.failureSources).toEqual([{ provider: 'vercel', name: 'Preview', kind: 'deployment' }])
    })

    it('未配置关注集：focusConfigured=false 且所有信号 focused=true（现状不变）', async () => {
        const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as {
            prNumber: number
            focusConfigured: boolean
            signals: { focused: boolean }[] | null
        }[]
        const target = list.find((r) => r.prNumber === 9)!
        expect(target.focusConfigured).toBe(false)
        expect(target.signals?.every((signal) => signal.focused)).toBe(true)
    })

    it('已配置关注集：未命中的信号仍返回并标注 focused=false（审计面）', async () => {
        const ds = await ensureDatabaseInitialized()
        const repositoryRepo = ds.getRepository(Repository)
        const repoRow = await repositoryRepo.findOne({ where: { id: repositoryId } })
        expect(repoRow).not.toBeNull()
        repoRow!.prCheckFocus = JSON.stringify({ names: ['Test'] })
        await repositoryRepo.save(repoRow!)

        try {
            const prRepo = ds.getRepository(PRCheck)
            await prRepo.save(prRepo.create({
                repositoryId,
                prNumber: 12,
                headSha: '0'.repeat(40),
                authorLogin: 'dependfix[bot]',
                conclusion: 'success',
                signalsJson: JSON.stringify([
                    {
                        kind: 'check',
                        provider: 'github-actions',
                        name: 'Test',
                        state: 'success',
                        rawState: 'success',
                        sourceId: '7001',
                        targetUrl: null,
                        logUrl: null,
                        summary: null,
                        observedAt: '2026-09-07T00:00:00.000Z',
                    },
                    {
                        kind: 'check',
                        provider: 'github-actions',
                        name: 'Lint',
                        state: 'failure',
                        rawState: 'failure',
                        sourceId: '7002',
                        targetUrl: null,
                        logUrl: null,
                        summary: 'lint failed',
                        observedAt: '2026-09-07T00:00:00.000Z',
                    },
                ]),
                overallStatus: 'success',
                failureSourcesJson: '[]',
                alertFiring: false,
                acknowledgedAt: null,
                acknowledgedByUserId: null,
                lastPolledAt: new Date('2026-09-07T00:00:00Z'),
            }))

            const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as {
                prNumber: number
                focusConfigured: boolean
                signals: { name: string, focused: boolean }[] | null
            }[]
            const target = list.find((r) => r.prNumber === 12)!
            expect(target.focusConfigured).toBe(true)
            expect(target.signals).toEqual([
                expect.objectContaining({ name: 'Test', focused: true }),
                expect.objectContaining({ name: 'Lint', focused: false }),
            ])
        } finally {
            repoRow!.prCheckFocus = null
            await repositoryRepo.save(repoRow!)
        }
    })

    it('signals 合法数组含脏元素：丢弃非对象元素，字段缺失元素按未关注处理且不抛错', async () => {
        const ds = await ensureDatabaseInitialized()
        const repositoryRepo = ds.getRepository(Repository)
        const repoRow = await repositoryRepo.findOne({ where: { id: repositoryId } })
        repoRow!.prCheckFocus = JSON.stringify({ names: ['Test'] })
        await repositoryRepo.save(repoRow!)

        try {
            const prRepo = ds.getRepository(PRCheck)
            await prRepo.save(prRepo.create({
                repositoryId,
                prNumber: 13,
                headSha: '1'.repeat(40),
                authorLogin: 'dependfix[bot]',
                conclusion: 'success',
                // 第 2 项为非对象脏元素（应丢弃）；第 3 项缺 name / provider（按未关注处理）
                signalsJson: JSON.stringify([
                    {
                        kind: 'check',
                        provider: 'github-actions',
                        name: 'Test',
                        state: 'success',
                        rawState: 'success',
                        sourceId: '7003',
                        targetUrl: null,
                        logUrl: null,
                        summary: null,
                        observedAt: '2026-09-08T00:00:00.000Z',
                    },
                    null,
                    { kind: 'check' },
                ]),
                overallStatus: 'success',
                failureSourcesJson: '[]',
                alertFiring: false,
                acknowledgedAt: null,
                acknowledgedByUserId: null,
                lastPolledAt: new Date('2026-09-08T00:00:00Z'),
            }))

            const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as {
                prNumber: number
                signals: { name?: string, focused: boolean }[] | null
            }[]
            const target = list.find((r) => r.prNumber === 13)!
            expect(target.signals).toHaveLength(2)
            expect(target.signals?.[0]).toEqual(expect.objectContaining({ name: 'Test', focused: true }))
            expect(target.signals?.[1]).toEqual(expect.objectContaining({ focused: false }))
        } finally {
            repoRow!.prCheckFocus = null
            await repositoryRepo.save(repoRow!)
        }
    })

    it('JSON 列损坏 / 缺失时回退 null（不抛错）', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(PRCheck)
        await repo.save(repo.create({
            repositoryId,
            prNumber: 10,
            headSha: 'e'.repeat(40),
            authorLogin: 'dependfix[bot]',
            conclusion: 'pending',
            signalsJson: '{not-json',
            overallStatus: null,
            failureSourcesJson: null,
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-05T00:00:00Z'),
        }))

        const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as {
            prNumber: number
            overallStatus: string | null
            signals: unknown[] | null
            failureSources: unknown[] | null
        }[]
        const target = list.find((r) => r.prNumber === 10)!
        expect(target.overallStatus).toBeNull()
        expect(target.signals).toBeNull()
        expect(target.failureSources).toBeNull()
    })

    it('JSON 列合法但非数组（如对象）时回退 null（运行时形态守卫）', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(PRCheck)
        await repo.save(repo.create({
            repositoryId,
            prNumber: 11,
            headSha: 'f'.repeat(40),
            authorLogin: 'dependfix[bot]',
            conclusion: 'success',
            signalsJson: '{}',
            overallStatus: 'success',
            failureSourcesJson: '42',
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: new Date('2026-09-06T00:00:00Z'),
        }))

        const list = await call(`/api/pr-checks?repositoryId=${repositoryId}`) as {
            prNumber: number
            signals: unknown[] | null
            failureSources: unknown[] | null
        }[]
        const target = list.find((r) => r.prNumber === 11)!
        expect(target.signals).toBeNull()
        expect(target.failureSources).toBeNull()
    })

    it('alertFiring=false 仅返回非 firing 的 PR', async () => {
        const list = await call('/api/pr-checks?alertFiring=false') as { alertFiring: boolean }[]
        expect(list.length).toBeGreaterThan(0)
        expect(list.every((r) => !r.alertFiring)).toBe(true)
    })

    it('同毫秒并列按 id DESC 稳定，take(500) 窗口可复算', async () => {
        const ds = await ensureDatabaseInitialized()
        const repoRepo = ds.getRepository(PRCheck)
        const tieTime = new Date('2020-06-01T00:00:00.000Z')
        const seedTie = (prNumber: number, headSha: string) => repoRepo.save(repoRepo.create({
            repositoryId,
            prNumber,
            headSha,
            authorLogin: 'dependabot[bot]',
            conclusion: 'success',
            checkRunId: null,
            detailsUrl: null,
            errorMessage: null,
            alertFiring: false,
            acknowledgedAt: null,
            acknowledgedByUserId: null,
            lastPolledAt: tieTime,
            createdAt: tieTime,
        }))
        const older = await seedTie(901, '9'.repeat(40))
        const newer = await seedTie(902, '8'.repeat(40))
        try {
            const ids = (await call('/api/pr-checks') as { id: string }[]).map((r) => r.id)
            // 两行 createdAt 完全同毫秒，且早于其它用例数据 → 落在列表末尾且按主键倒序
            expect(ids.slice(-2)).toEqual([newer.id, older.id])

            const again = (await call('/api/pr-checks') as { id: string }[]).map((r) => r.id)
            expect(again).toEqual(ids)
        } finally {
            // 本用例自建行不污染其它用例的计数断言
            await repoRepo.delete([older.id, newer.id])
        }
    })
})
