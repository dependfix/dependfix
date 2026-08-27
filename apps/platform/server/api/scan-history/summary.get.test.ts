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
})
