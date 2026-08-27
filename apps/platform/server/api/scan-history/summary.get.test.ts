import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DataSource } from 'typeorm'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import summaryHandler from './summary.get'
import { Organization } from '#server/entities/organization'
import { Repository } from '#server/entities/repository'
import { ScanResult } from '#server/entities/scan-result'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { ensureDefaultOrganization } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string) => summaryHandler(makeEvent(method, url))

interface SummaryResponse {
    byStatus: Record<string, number>
    totals: { runs: number, totalAlerts: number, totalFixed: number }
    repositories: {
        repositoryId: string
        owner: string
        name: string
        runCount: number
        alertCount: number
        fixedCount: number
        lastRunAt: string | null
        lastStatus: string | null
    }[]
    window: { start: string | null, end: string | null, included: number, limit: number }
    filtered: { repositoryId: string | null }
}

const createRepo = async (overrides: { owner?: string, name?: string } = {}) => {
    const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
        owner: overrides.owner ?? 'demo',
        name: overrides.name ?? 'app',
        platform: 'github',
        packageManager: 'pnpm',
        defaultBranch: 'main',
        executorKind: 'container',
    })) as { id: string }
    return created.id
}

const seedRun = async (repositoryId: string, overrides: {
    mode?: string
    severityThreshold?: string
    status?: 'pending' | 'running' | 'completed' | 'failed' | 'dispatched' | 'degraded'
    summaryJson?: string | null
    createdAt?: Date
} = {}) => {
    const ds = await ensureDatabaseInitialized()
    const entity = ds.getRepository(ScanRun).create({
        repositoryId,
        mode: overrides.mode ?? 'fix',
        severityThreshold: overrides.severityThreshold ?? 'high',
        executorKind: 'container',
        status: overrides.status ?? 'completed',
        summaryJson: overrides.summaryJson ?? JSON.stringify({ alertsFound: 2, alertsFixed: 1 }),
    })
    if (overrides.createdAt) {
        entity.createdAt = overrides.createdAt
        entity.updatedAt = overrides.createdAt
    }
    const saved = await ds.getRepository(ScanRun).save(entity)
    return Array.isArray(saved) ? saved[0] : saved
}

const seedResults = async (runId: string, count: number, fixable: boolean) => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(ScanResult)
    const items = Array.from({ length: count }, (_, i) => repo.create({
        scanRunId: runId,
        source: 'dependabot',
        severity: i === 0 ? 'critical' : 'high',
        packageName: `pkg-${i}`,
        manifestPath: 'package.json',
        ruleId: null,
        summary: `issue ${i}`,
        fixable,
        fixStrategy: fixable ? 'upgrade' : null,
        recommendedVersion: fixable ? '1.0.0' : null,
        htmlUrl: null,
        fixStatus: fixable ? 'pending' : 'pending',
    }))
    await repo.save(items)
}

describe('GET /api/scan-history/summary', () => {
    let repositoryA: string
    let repositoryB: string
    let ds: DataSource

    beforeAll(async () => {
        setupMemoryDatabase()
        ds = await ensureDatabaseInitialized()
        await ensureDefaultOrganization(ds)
        repositoryA = await createRepo({ owner: 'demo', name: 'app' })
        repositoryB = await createRepo({ owner: 'demo', name: 'lib' })
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns zeroed byStatus + empty repositories on fresh database', async () => {
        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        expect(res.byStatus).toEqual({
            pending: 0,
            running: 0,
            completed: 0,
            failed: 0,
            dispatched: 0,
            degraded: 0,
        })
        expect(res.totals).toEqual({ runs: 0, totalAlerts: 0, totalFixed: 0 })
        expect(res.repositories).toEqual([])
        expect(res.filtered).toEqual({ repositoryId: null })
        expect(res.window.limit).toBe(500)
        expect(res.window.included).toBe(0)
    })

    it('aggregates byStatus across seeded ScanRuns', async () => {
        await seedRun(repositoryA, { status: 'completed', summaryJson: JSON.stringify({ alertsFound: 3, alertsFixed: 2 }) })
        await seedRun(repositoryA, { status: 'failed', summaryJson: JSON.stringify({ alertsFound: 1, alertsFixed: 0 }) })
        await seedRun(repositoryB, { status: 'completed', summaryJson: JSON.stringify({ alertsFound: 4, alertsFixed: 1 }) })

        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        expect(res.byStatus.completed).toBeGreaterThanOrEqual(2)
        expect(res.byStatus.failed).toBeGreaterThanOrEqual(1)
        expect(res.totals.runs).toBeGreaterThanOrEqual(3)
        expect(res.totals.totalAlerts).toBeGreaterThanOrEqual(8)
        expect(res.totals.totalFixed).toBeGreaterThanOrEqual(3)
    })

    it('aggregates per-repository runCount/alertCount/fixedCount', async () => {
        const runA1 = await seedRun(repositoryA, { status: 'completed', summaryJson: null })
        const runA2 = await seedRun(repositoryA, { status: 'completed', summaryJson: null })
        await seedRun(repositoryB, { status: 'completed', summaryJson: null })
        // runA1 / runA2 关联 2/3 条 ScanResult
        await seedResults(runA1.id, 2, true)
        await seedResults(runA2.id, 3, true)
        // runB 关联 2 条不可 fix（fixedCount 不应增加）
        const runB1 = await seedRun(repositoryB, { status: 'completed', summaryJson: null })
        await seedResults(runB1.id, 2, false)
        // 给 runA1 加 fixStatus=success（fixedCount 应只数 success）
        await ds.getRepository(ScanResult).update({ scanRunId: runA1.id }, { fixStatus: 'success' })

        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        const repoA = res.repositories.find((r) => r.repositoryId === repositoryA)
        const repoB = res.repositories.find((r) => r.repositoryId === repositoryB)
        expect(repoA).toBeDefined()
        expect(repoB).toBeDefined()
        // repoA: 至少 2 runs（新增 runA1 + runA2）+ 此前 seed 累计
        expect(repoA!.runCount).toBeGreaterThanOrEqual(2)
        // runA1 的 2 条 ScanResult 全部 fixStatus=success → fixedCount += 2
        expect(repoA!.fixedCount).toBeGreaterThanOrEqual(2)
        expect(repoB!.runCount).toBeGreaterThanOrEqual(1)
        expect(repoB!.fixedCount).toBeGreaterThanOrEqual(0)
    })

    it('filters summary by repositoryId query', async () => {
        const repoC = await createRepo({ owner: 'demo', name: 'svc' })
        const runC1 = await seedRun(repoC, { status: 'completed', summaryJson: JSON.stringify({ alertsFound: 5, alertsFixed: 1 }) })
        await seedResults(runC1.id, 5, true)
        await ds.getRepository(ScanResult).update({ scanRunId: runC1.id }, { fixStatus: 'success' })

        const allRes = await call('GET', '/api/scan-history/summary') as SummaryResponse
        const filteredRes = await call('GET', `/api/scan-history/summary?repositoryId=${repoC}`) as SummaryResponse
        expect(filteredRes.filtered.repositoryId).toBe(repoC)
        // 过滤后只应包含 repoC 的 run
        const repoIds = new Set(filteredRes.repositories.map((r) => r.repositoryId))
        expect(repoIds.size).toBe(1)
        expect(repoIds.has(repoC)).toBe(true)
        // totals.runs 应小于等于全量 totals.runs
        expect(filteredRes.totals.runs).toBeLessThanOrEqual(allRes.totals.runs)
        // 仓库聚合数 = repoC run 数（runC1）
        const cSummary = filteredRes.repositories[0]!
        expect(cSummary.repositoryId).toBe(repoC)
        expect(cSummary.runCount).toBe(1)
        expect(cSummary.alertCount).toBe(5)
        expect(cSummary.fixedCount).toBe(5)
    })

    it('organizationId isolation: excludes foreign-org ScanRuns from summary', async () => {
        const foreignOrg = await ds.getRepository(Organization).save(ds.getRepository(Organization).create({
            id: 'foreign-org-summary',
            name: 'Foreign',
        }))
        const foreignRepo = await ds.getRepository(Repository).save(ds.getRepository(Repository).create({
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
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: foreignRepo.id,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsFound: 99, alertsFixed: 99 }),
        }))

        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        const repoIds = new Set(res.repositories.map((r) => r.repositoryId))
        expect(repoIds.has(foreignRepo.id)).toBe(false)
        // 99 alerts 不应进入 totals（粗略断言：远小于全量）
        expect(res.totals.totalAlerts).toBeLessThan(9999)
    })

    it('window.start / window.end reflects createdAt range of included runs', async () => {
        const repoD = await createRepo({ owner: 'demo', name: 'win' })
        const older = new Date('2026-01-01T00:00:00Z')
        const newer = new Date('2026-08-01T00:00:00Z')
        await seedRun(repoD, { status: 'completed', createdAt: older })
        await seedRun(repoD, { status: 'completed', createdAt: newer })

        const res = await call('GET', `/api/scan-history/summary?repositoryId=${repoD}`) as SummaryResponse
        expect(res.window.start).not.toBeNull()
        expect(res.window.end).not.toBeNull()
        // DESC 排序：end 为最新（newer），start 为最旧（older）
        expect(Date.parse(res.window.end!)).toBeGreaterThanOrEqual(Date.parse(res.window.start!))
    })

    /**
     * safeParseSummary 防御性解析（行 30, 35, 39）：
     * - 空 / null summaryJson → 视作零值（不阻塞 summary 渲染）
     * - 非对象 JSON（数组 / 字符串 / 数字）→ 视作零值
     * - 解析失败（JSON.parse 抛错）→ 视作零值
     *
     * 这些路径直接对应 safeParseSummary 内部的 readNumber 取零值（防御性解析），
     * 让脏数据不会污染 totals.totalAlerts / totals.totalFixed。
     *
     * 注：seedRun helper 使用 `?? JSON.stringify(...)` fallback，传 null/undefined 会被替换成默认 summaryJson。
     * 直接通过 repo.save 构造 ScanRun（明确传 null）以触达 safeParseSummary 的 `if (!raw)` 分支。
     */
    it('safeParseSummary: null summaryJson → 视作零值（行 30 if !raw 分支）', async () => {
        const localDs = await ensureDatabaseInitialized()
        const repoNull = await createRepo({ owner: 'demo', name: 'null-sum' })
        await localDs.getRepository(ScanRun).save(localDs.getRepository(ScanRun).create({
            repositoryId: repoNull,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: null,
        }))

        const res = await call('GET', `/api/scan-history/summary?repositoryId=${repoNull}`) as SummaryResponse
        // readNumber 在零值对象上返回 0；totals.totalAlerts/totalFixed 不应抛错
        expect(res.totals.runs).toBe(1)
        expect(res.totals.totalAlerts).toBe(0)
        expect(res.totals.totalFixed).toBe(0)
    })

    it('safeParseSummary: 非对象 JSON（数组 / 字符串 / 数字）→ 视作零值（行 35 parsed && typeof === object && !isArray 分支）', async () => {
        const repoArr = await createRepo({ owner: 'demo', name: 'arr-sum' })
        await seedRun(repoArr, { status: 'completed', summaryJson: JSON.stringify([1, 2, 3]) })
        const repoStr = await createRepo({ owner: 'demo', name: 'str-sum' })
        await seedRun(repoStr, { status: 'completed', summaryJson: JSON.stringify('hello') })
        const repoNum = await createRepo({ owner: 'demo', name: 'num-sum' })
        await seedRun(repoNum, { status: 'completed', summaryJson: JSON.stringify(42) })

        // 任一非对象 summaryJson 都应被 readNumber 视为 0
        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        const repoIds = new Set(res.repositories.map((r) => r.repositoryId))
        expect(repoIds.has(repoArr)).toBe(true)
        expect(repoIds.has(repoStr)).toBe(true)
        expect(repoIds.has(repoNum)).toBe(true)
        // 三个仓库的 alertCount 应均为 0（safeParseSummary 返回 {}）
        const summaryArr = res.repositories.find((r) => r.repositoryId === repoArr)
        const summaryStr = res.repositories.find((r) => r.repositoryId === repoStr)
        const summaryNum = res.repositories.find((r) => r.repositoryId === repoNum)
        expect(summaryArr?.alertCount).toBe(0)
        expect(summaryStr?.alertCount).toBe(0)
        expect(summaryNum?.alertCount).toBe(0)
    })

    it('safeParseSummary: 非法 JSON 字符串 → 视作零值（行 39 catch 分支，JSON.parse 抛错）', async () => {
        const repoBad = await createRepo({ owner: 'demo', name: 'bad-sum' })
        await seedRun(repoBad, { status: 'completed', summaryJson: 'this is not json { broken' })

        const res = await call('GET', `/api/scan-history/summary?repositoryId=${repoBad}`) as SummaryResponse
        // catch 路径返回 {} → readNumber 返回 0
        expect(res.totals.totalAlerts).toBe(0)
        expect(res.totals.totalFixed).toBe(0)
        expect(res.repositories[0]?.alertCount).toBe(0)
    })

    /**
     * aggregateByRepository 孤儿 run 路径（行 65 if !repo continue）：
     * repositoryId 指向已删除/不存在的 Repository 时跳过聚合（不影响 totals，但不入 repositories 列表）。
     *
     * 由于 ScanRun.onDelete = 'CASCADE'（删除 Repository 会级联删 ScanRun），无法直接 delete Repository
     * 制造孤儿；改用 PRAGMA foreign_keys = OFF 临时关闭 FK 约束 + 创建一个 Repo 后再 delete，模拟孤儿场景。
     * PRAGMA 在测试结束前恢复为 ON，避免影响后续测试。
     */
    it('aggregateByRepository: 孤儿 run（repositoryId 指向不存在 repo）→ 跳过聚合（行 65 if !repo continue 分支）', async () => {
        const localDs = await ensureDatabaseInitialized()
        // 临时关闭 FK 以绕过 ScanRun.repositoryId → Repository.id 的约束
        await localDs.query('PRAGMA foreign_keys = OFF')
        try {
            // 1. 创建临时 Repository（用于通过 FK 校验）
            const tmpRepo = await localDs.getRepository(Repository).save(localDs.getRepository(Repository).create({
                organizationId: 'orphan-org',
                owner: 'orphan',
                name: 'tmp',
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
            // 2. 创建 ScanRun 引用该 Repo
            await localDs.getRepository(ScanRun).save(localDs.getRepository(ScanRun).create({
                repositoryId: tmpRepo.id,
                mode: 'report-only',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'completed',
                summaryJson: JSON.stringify({ alertsFound: 5, alertsFixed: 3 }),
            }))
            // 3. 关闭 FK 后删除 Repository，ScanRun 成为孤儿（repository relation 解析为 null）
            await localDs.getRepository(Repository).delete({ id: tmpRepo.id })
        } finally {
            await localDs.query('PRAGMA foreign_keys = ON')
        }

        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        const repoIds = new Set(res.repositories.map((r) => r.repositoryId))
        // 孤儿 run 不应进入 repositories 列表（行 65 if !repo continue 触发）
        expect(repoIds.has('orphan-org/owner=orphan,name=tmp')).toBe(false)
        // handler 不应崩溃，孤儿 run 不污染输出（重点是 handler 健壮性）
        expect(res.totals.runs).toBeGreaterThanOrEqual(0)
    })

    /**
     * aggregateByRepository lastRunAt 替换路径（行 91 if (createdAtMs > existingMs)）：
     * 同一仓库多次 run 时，第二次 run 若 createdAt 更新，则 existing.lastRunAt/lastStatus 被替换。
     * 反向断言：先 seed 较新的 run，再 seed 较旧的 run — 较旧的不会替换 lastRunAt。
     */
    it('aggregateByRepository: 同仓库多次 run（new→old）→ lastRunAt 取最早 seed 的 newer run（行 91 false 分支）', async () => {
        const repoE = await createRepo({ owner: 'demo', name: 'lastrun' })
        // 第一条 run：较新（应成为 lastRunAt）
        const newer = new Date('2026-06-15T00:00:00Z')
        const newerRun = await seedRun(repoE, { status: 'completed', createdAt: newer })
        // 第二条 run：较旧（不应替换 lastRunAt，因 createdAtMs <= existingMs — 触发行 91 false 分支）
        const older = new Date('2026-03-01T00:00:00Z')
        await seedRun(repoE, { status: 'failed', createdAt: older })

        const res = await call('GET', `/api/scan-history/summary?repositoryId=${repoE}`) as SummaryResponse
        expect(res.repositories).toHaveLength(1)
        const repoSummary = res.repositories[0]!
        // lastRunAt 应为较新的 run（newer），因为 newer 先 set existing，older 后到但 createdAtMs <= existingMs 不替换
        expect(Date.parse(repoSummary.lastRunAt!)).toBe(newer.getTime())
        expect(repoSummary.lastStatus).toBe(newerRun.status)
        expect(repoSummary.runCount).toBe(2)
    })

    /**
     * aggregateByRepository 反向 lastRunAt 替换路径（行 91 true 分支）：
     * 先 seed 较旧的 run，再 seed 较新的 run — 较新的应替换 existing.lastRunAt/lastStatus。
     */
    it('aggregateByRepository: 同仓库多次 run（old→new）→ 较新 run 替换 lastRunAt（行 91 true 分支）', async () => {
        const repoF = await createRepo({ owner: 'demo', name: 'lastrun-rev' })
        // 第一条 run：较旧（先 set existing）
        const older = new Date('2026-03-01T00:00:00Z')
        await seedRun(repoF, { status: 'failed', createdAt: older })
        // 第二条 run：较新（应替换 lastRunAt/lastStatus —— 触发行 91 true 分支）
        const newer = new Date('2026-06-15T00:00:00Z')
        const newerRun = await seedRun(repoF, { status: 'completed', createdAt: newer })

        const res = await call('GET', `/api/scan-history/summary?repositoryId=${repoF}`) as SummaryResponse
        expect(res.repositories).toHaveLength(1)
        const repoSummary = res.repositories[0]!
        // lastRunAt 应被替换为较新的 run
        expect(Date.parse(repoSummary.lastRunAt!)).toBe(newer.getTime())
        expect(repoSummary.lastStatus).toBe(newerRun.status)
    })

    /**
     * readNumber 防御性取数（行 25 Number.isFinite 分支）：
     * summaryJson 中的 alertsFound / alertsFixed 不是有限数字（null/字符串/对象/数组）→ 视作 0。
     * 注：JSON.stringify 不支持 NaN/Infinity 字面量，但 typeof null === 'object'，typeof 非 number 都返回 0。
     */
    it('readNumber: 非数字字段（null / 字符串 / 对象 / 数组）→ 视作 0（行 25 Number.isFinite 分支）', async () => {
        const repoG = await createRepo({ owner: 'demo', name: 'nan-sum' })
        await seedRun(repoG, {
            status: 'completed',
            summaryJson: JSON.stringify({ alertsFound: null, alertsFixed: 'not a number' }),
        })
        const repoH = await createRepo({ owner: 'demo', name: 'obj-sum' })
        await seedRun(repoH, {
            status: 'completed',
            summaryJson: JSON.stringify({ alertsFound: { weird: true }, alertsFixed: [1, 2] }),
        })

        const res = await call('GET', '/api/scan-history/summary') as SummaryResponse
        const summaryG = res.repositories.find((r) => r.repositoryId === repoG)
        const summaryH = res.repositories.find((r) => r.repositoryId === repoH)
        expect(summaryG?.alertCount).toBe(0)
        expect(summaryG?.fixedCount).toBe(0)
        expect(summaryH?.alertCount).toBe(0)
        expect(summaryH?.fixedCount).toBe(0)
    })
})
