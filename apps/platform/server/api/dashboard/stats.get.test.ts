import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import statsHandler from './stats.get'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = () => statsHandler(makeEvent('GET', '/api/dashboard/stats'))

/** 清理 in-memory DB（每个测试独立，保证断言不被前序测试影响） */
const clearAllTables = async (): Promise<void> => {
    const ds = await ensureDatabaseInitialized()
    // 反向依赖顺序：子表 → 父表（verification / session / account 暂未涉及）
    await ds.getRepository(ScanResult).clear()
    await ds.getRepository(ScanRun).clear()
    await ds.getRepository(Repository).clear()
}

describe('GET /api/dashboard/stats', () => {
    beforeAll(async () => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        await clearAllTables()
    })

    it('returns zeroed stats on fresh database', async () => {
        const stats = await call() as Record<string, unknown>
        expect(stats).toEqual({
            repositoryCount: 0,
            alertsTotal: 0,
            severityCounts: { critical: 0, high: 0, medium: 0, low: 0, unknown: 0 },
            fixedCount: 0,
            latestRun: null,
        })
    })

    it('aggregates repositories, alerts and latest run', async () => {
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: created.id,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: '原型污染',
            fixable: true,
            fixStatus: 'success',
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            severity: 'critical',
            packageName: 'axios',
            manifestPath: 'package.json',
            summary: 'SSRF',
            fixable: false,
            fixStatus: 'pending',
        }))

        const stats = await call() as Record<string, unknown>
        expect(stats).toMatchObject({
            repositoryCount: 1,
            alertsTotal: 2,
            severityCounts: { critical: 1, high: 1, medium: 0, low: 0, unknown: 0 },
            fixedCount: 1,
        })
        expect((stats.latestRun as Record<string, unknown>)).toMatchObject({
            repository: 'demo/app',
            status: 'completed',
        })
    })

    it('handles unknown severity values not in initial counts map (covers ?? fallback)', async () => {
        // 分支覆盖：severityCounts[r.severity] ?? 0 —— 当 severity 不在预定义 5 类时走 ?? 0 fallback
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'app2',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: created.id,
            mode: 'report-only',
            severityThreshold: 'low',
            executorKind: 'container',
            status: 'completed',
        }))
        // 用一个预定义 5 类之外的 severity 触发 ?? fallback 分支
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            source: 'dependabot',
            // 真实场景：severity 由上游数据源决定，未来扩展 'info'/'warning' 等类型
            severity: 'info',
            packageName: 'pkg',
            manifestPath: 'package.json',
            summary: 'info level',
            fixable: false,
            fixStatus: 'pending',
        }))

        const stats = await call() as Record<string, unknown>
        // severityCounts 5 个预定义键保持 0；info 这类计入 alertsTotal 但不显式
        expect((stats.severityCounts as Record<string, number>)).toMatchObject({
            critical: 0, high: 0, medium: 0, low: 0, unknown: 0,
        })
        expect(stats.alertsTotal).toBe(1)
    })
})
