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
            topPackages: [],
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
            repositoryId: run.repositoryId,
            upstreamId: 'dependabot:1',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            summary: '原型污染',
            fixable: true,
            fixStatus: 'success',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
        }))
        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: run.id,
            repositoryId: run.repositoryId,
            upstreamId: 'dependabot:2',
            source: 'dependabot',
            severity: 'critical',
            packageName: 'axios',
            manifestPath: 'package.json',
            summary: 'SSRF',
            fixable: false,
            fixStatus: 'pending',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
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
            repositoryId: run.repositoryId,
            upstreamId: 'dependabot:1',
            source: 'dependabot',
            // 真实场景：severity 由上游数据源决定，未来扩展 'info'/'warning' 等类型
            severity: 'info',
            packageName: 'pkg',
            manifestPath: 'package.json',
            summary: 'info level',
            fixable: false,
            fixStatus: 'pending',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
        }))

        const stats = await call() as Record<string, unknown>
        // RG-W02 修复：未识别 severity 归入 unknown 段，避免 alertsTotal 与 severityCounts 总和不一致
        expect((stats.severityCounts as Record<string, number>)).toMatchObject({
            critical: 0, high: 0, medium: 0, low: 0, unknown: 1,
        })
        expect(stats.alertsTotal).toBe(1)
    })

    describe('topPackages aggregation', () => {
        /** 辅助：建一个仓库 + 一次扫描，返回 scanRunId 用于插入 ScanResult */
        const makeScanRun = async (repoName: string): Promise<string> => {
            const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
                owner: 'demo',
                name: repoName,
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'container',
            })) as { id: string }
            const ds = await ensureDatabaseInitialized()
            const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
                repositoryId: created.id,
                mode: 'report-only',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'completed',
            }))
            return run.id
        }

        /** 辅助：给 run 加一条 ScanResult（M20.3 unique index 强制不同 upstreamId → counter 单调递增） */
        let addResultCounter = 0
        const addResult = async (scanRunId: string, packageName: string, severity: string): Promise<void> => {
            addResultCounter++
            const ds = await ensureDatabaseInitialized()
            await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
                scanRunId,
                repositoryId: (await ds.getRepository(ScanRun).findOne({ where: { id: scanRunId } }))?.repositoryId ?? '',
                upstreamId: `dependabot:${addResultCounter}`,
                source: 'dependabot',
                severity,
                packageName,
                manifestPath: 'package.json',
                summary: 'test',
                fixable: true,
                fixStatus: 'pending',
                firstSeenAt: new Date('2026-08-01T00:00:00Z'),
                lastSeenAt: new Date('2026-08-01T00:00:00Z'),
                occurrenceCount: 1,
                supersededAt: null,
            }))
        }

        it('returns topPackages sorted by count DESC (single package multiple alerts)', async () => {
            const runId = await makeScanRun('top-single')
            await addResult(runId, 'lodash', 'high')
            await addResult(runId, 'lodash', 'critical')
            await addResult(runId, 'lodash', 'medium')

            const stats = await call() as Record<string, unknown>
            expect(stats.topPackages).toEqual([
                { packageName: 'lodash', count: 3 },
            ])
        })

        it('aggregates same packageName across multiple severities into one entry', async () => {
            const runId = await makeScanRun('top-aggregate')
            // 同包 4 条不同 severity → 应聚合为 1 个 entry count=4
            await addResult(runId, 'axios', 'critical')
            await addResult(runId, 'axios', 'high')
            await addResult(runId, 'axios', 'medium')
            await addResult(runId, 'axios', 'low')

            const stats = await call() as Record<string, unknown>
            expect(stats.topPackages).toEqual([
                { packageName: 'axios', count: 4 },
            ])
        })

        it('limits results to top 10 packages by count', async () => {
            const runId = await makeScanRun('top-limit')
            // 12 个不同包，每个包不同告警数；期望返回前 10
            // 包名 a-l，a 有 12 条，b 有 11 条，... l 有 1 条
            const counts: [string, number][] = [
                ['a', 12], ['b', 11], ['c', 10], ['d', 9], ['e', 8],
                ['f', 7], ['g', 6], ['h', 5], ['i', 4], ['j', 3],
                ['k', 2], ['l', 1],
            ]
            for (const [pkg, n] of counts) {
                for (let i = 0; i < n; i++) {
                    await addResult(runId, pkg, 'high')
                }
            }

            const stats = await call() as Record<string, unknown>
            const top = stats.topPackages as { packageName: string, count: number }[]
            expect(top).toHaveLength(10)
            // 前 10 按 count DESC：a(12), b(11), c(10), d(9), e(8), f(7), g(6), h(5), i(4), j(3)
            expect(top.map((p) => p.packageName)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'])
            expect(top.map((p) => p.count)).toEqual([12, 11, 10, 9, 8, 7, 6, 5, 4, 3])
            // k 与 l 被截断不返回
            expect(top.find((p) => p.packageName === 'k')).toBeUndefined()
            expect(top.find((p) => p.packageName === 'l')).toBeUndefined()
        })

        it('handles multiple packages with mixed counts (real-world shape)', async () => {
            const runId = await makeScanRun('top-mixed')
            await addResult(runId, 'lodash', 'high')
            await addResult(runId, 'lodash', 'high')
            await addResult(runId, 'axios', 'critical')
            await addResult(runId, 'react', 'low')
            // expected: lodash=2, axios=1, react=1

            const stats = await call() as Record<string, unknown>
            const top = stats.topPackages as { packageName: string, count: number }[]
            expect(top).toEqual([
                { packageName: 'lodash', count: 2 },
                { packageName: 'axios', count: 1 },
                { packageName: 'react', count: 1 },
            ])
        })
    })
})
