import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../../api/repos/index'
import { ensureDatabaseInitialized } from '../index'
import { ScanRun } from '../../entities/scan-run'
import { ScanResult } from '../../entities/scan-result'
import {
    backfillScanResultsApply,
    backfillScanResultsDryRun,
    buildBackfillUpstreamId,
    computeBackfillPlan,
    formatStats,
} from './backfill-scan-result'

// 复用 repos API 创建仓库数据：guard 走 mock（真实 getAuth 依赖 Nuxt useRuntimeConfig）
vi.mock('../../utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

/**
 * M20.7 backfill 单元测试（todo.md §M20.7）：
 * 覆盖 5 条核心规则 + 幂等性 + 跨仓库隔离。
 *
 * 每个用例用独立 Repository / upstreamId / ScanRun，避免 per-alert 模型跨测试污染。
 */

describe('M20.7 backfill-scan-result', () => {
    let repositoryId: string
    let runId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'backfill-test',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        runId = run.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        // 每个用例前清空 ScanResult（保留 Repository / ScanRun）
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ScanResult).clear()
    })

    describe('buildBackfillUpstreamId 命名空间隔离', () => {
        it('合成格式 `${source}:backfill-${rowId}`', () => {
            const row = { source: 'dependabot', id: 'abc-123' } as Pick<ScanResult, 'source' | 'id'>
            expect(buildBackfillUpstreamId(row)).toBe('dependabot:backfill-abc-123')
        })

        it('不同 source 保持独立命名空间', () => {
            expect(buildBackfillUpstreamId({ source: 'pnpm-audit', id: 'x' } as never)).toBe('pnpm-audit:backfill-x')
            expect(buildBackfillUpstreamId({ source: 'code-scanning', id: 'y' } as never)).toBe('code-scanning:backfill-y')
        })
    })

    describe('computeBackfillPlan 聚合决策', () => {
        /**
         * Seed helper：构造指定聚合组的 ScanResult
         * 每个 seed 用独立 upstreamId（`seed-${groupKey}-${i}`）避免同 repo 唯一索引冲突；
         * upstreamId 用 `seed:` 前缀让 backfill 不会误判为真实 upstream（如果 backfill 替换了
         * `auto-` 前缀的占位符逻辑保持不变，但 seed 用 `seed:` 前缀避免被替换）
         */
        const seedGroup = async (
            groupKey: string,
            rows: { fixStatus: string, createdAtOffsetMs: number }[],
        ): Promise<void> => {
            const ds = await ensureDatabaseInitialized()
            const resultRepo = ds.getRepository(ScanResult)
            const now = Date.now()
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i]!
                await resultRepo.save(resultRepo.create({
                    scanRunId: runId,
                    repositoryId,
                    upstreamId: `dependabot:seed-${groupKey}-${i}`,
                    source: 'dependabot',
                    severity: 'high',
                    packageName: groupKey,
                    manifestPath: 'package.json',
                    ruleId: 'GHSA-test',
                    summary: null,
                    fixable: true,
                    fixStrategy: 'upgrade',
                    recommendedVersion: '4.0.0',
                    htmlUrl: null,
                    fixStatus: r.fixStatus,
                    errorMessage: null,
                    firstSeenAt: new Date(now + r.createdAtOffsetMs - 1000),
                    lastSeenAt: new Date(now + r.createdAtOffsetMs),
                    occurrenceCount: 1,
                    supersededAt: null,
                } as never))
            }
            // 显式覆盖 createdAt（BaseEntity 默认 datetime('now') 与测试期望的 createdAt ASC 不一致）
            await ds.query(
                `UPDATE dependfix_scan_result SET created_at = datetime(?, 'unixepoch') WHERE repository_id = ? AND package_name = ?`,
                [Math.floor(now / 1000), repositoryId, groupKey],
            )
        }

        it('决策 2：组内有 fixStatus="success" → 保留该行；其他 DELETE', async () => {
            await seedGroup('lodash', [
                { fixStatus: 'pending', createdAtOffsetMs: 1000 },
                { fixStatus: 'pending', createdAtOffsetMs: 2000 },
                { fixStatus: 'success', createdAtOffsetMs: 3000 },
                { fixStatus: 'pending', createdAtOffsetMs: 4000 },
            ])

            const ds = await ensureDatabaseInitialized()
            const plan = await computeBackfillPlan(ds)

            // 4 行 → 保留 1 行（success）
            expect(plan.totalBefore).toBe(4)
            expect(plan.toDelete.length).toBe(3)
            expect(plan.toUpdateUpstreamId.length).toBe(1)
            expect(plan.toSupersede.length).toBe(0) // success 行不被 supersede
            expect(plan.preservedSuccess).toBe(1)
            expect(plan.totalAfter).toBe(1)
        })

        it('决策 2：无 success 行 → 保留最早 createdAt 行', async () => {
            await seedGroup('axios', [
                { fixStatus: 'pending', createdAtOffsetMs: 1000 },
                { fixStatus: 'failed', createdAtOffsetMs: 2000 },
                { fixStatus: 'pending', createdAtOffsetMs: 3000 },
            ])

            const ds = await ensureDatabaseInitialized()
            const plan = await computeBackfillPlan(ds)

            expect(plan.totalBefore).toBe(3)
            expect(plan.toDelete.length).toBe(2)
            expect(plan.toUpdateUpstreamId.length).toBe(1) // 保留行需要填 upstreamId
            expect(plan.toSupersede.length).toBe(1) // 保留行非 success + supersededAt null → supersede
            expect(plan.preservedSuccess).toBe(0)
            expect(plan.totalAfter).toBe(1)
        })

        it('规则 3：ruleId 为 null 时所有 null 合并（同 source+packageName）', async () => {
            // ruleId 为 null 的 2 条 + ruleId 为 "rule-A" 的 1 条 → 应分为 2 组
            const ds = await ensureDatabaseInitialized()
            const resultRepo = ds.getRepository(ScanResult)
            const now = Date.now()
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId,
                upstreamId: `code-quality:seed-qa-1`, source: 'code-quality', severity: 'low',
                packageName: 'quality-A', ruleId: null, manifestPath: null, summary: null,
                fixable: false, fixStrategy: null, recommendedVersion: null, htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId,
                upstreamId: `code-quality:seed-qa-2`, source: 'code-quality', severity: 'medium',
                packageName: 'quality-A', ruleId: null, manifestPath: null, summary: null,
                fixable: false, fixStrategy: null, recommendedVersion: null, htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId,
                upstreamId: `code-quality:seed-qa-3`, source: 'code-quality', severity: 'high',
                packageName: 'quality-A', ruleId: 'rule-A', manifestPath: null, summary: null,
                fixable: false, fixStrategy: null, recommendedVersion: null, htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))

            const plan = await computeBackfillPlan(ds)

            // 3 行分 2 组：null 组 2 行（保留 1 + delete 1）+ rule-A 组 1 行（保留）
            expect(plan.totalBefore).toBe(3)
            expect(plan.toDelete.length).toBe(1)
            expect(plan.totalAfter).toBe(2)
        })
    })

    describe('幂等性', () => {
        it('第二次执行：所有操作 0 匹配（无副作用）', async () => {
            const ds = await ensureDatabaseInitialized()
            const resultRepo = ds.getRepository(ScanResult)
            const now = Date.now()
            // seed 3 条同 (source, packageName, ruleId) 不同 fixStatus
            for (let i = 0; i < 3; i++) {
                await resultRepo.save(resultRepo.create({
                    scanRunId: runId, repositoryId,
                    upstreamId: `pnpm-audit:idempotent-${i}`, source: 'pnpm-audit', severity: 'medium',
                    packageName: 'minimist', ruleId: 'GHSA-mini', manifestPath: null, summary: null,
                    fixable: true, fixStrategy: 'upgrade', recommendedVersion: '1.2.8', htmlUrl: null,
                    fixStatus: i === 0 ? 'success' : 'pending', errorMessage: null,
                    firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                    occurrenceCount: 1, supersededAt: null,
                } as never))
            }

            // 第一次 apply
            const stats1 = await backfillScanResultsApply()
            expect(stats1.deletedDuplicates).toBe(2)
            expect(stats1.preservedSuccess).toBe(1)
            expect(stats1.supersededAfterBackfill).toBe(0)

            // 第二次 apply：所有行已处理（success 保留 + 非 success 已 supersede）
            const stats2 = await backfillScanResultsApply()
            expect(stats2.totalBefore).toBe(1) // 处理后只剩 1 行
            expect(stats2.deletedDuplicates).toBe(0)
            expect(stats2.preservedSuccess).toBe(1) // 仍识别为 success
            expect(stats2.supersededAfterBackfill).toBe(0) // 无需再 supersede
        })
    })

    describe('跨仓库隔离', () => {
        it('repo A 的聚合不影响 repo B', async () => {
            // 创建第二个仓库
            const repoB = await reposIndexHandler(makeEvent('POST', '/api/repos', {
                owner: 'demo', name: 'backfill-test-b', platform: 'github',
                packageManager: 'pnpm', defaultBranch: 'main', executorKind: 'container',
            })) as { id: string }

            const ds = await ensureDatabaseInitialized()
            const resultRepo = ds.getRepository(ScanResult)
            const now = Date.now()
            // repo A：2 条相同 (lodash, GHSA)
            for (let i = 0; i < 2; i++) {
                await resultRepo.save(resultRepo.create({
                    scanRunId: runId, repositoryId,
                    upstreamId: `dependabot:cross-repo-A-${i}`, source: 'dependabot', severity: 'high',
                    packageName: 'lodash', ruleId: 'GHSA-A', manifestPath: null, summary: null,
                    fixable: true, fixStrategy: 'upgrade', recommendedVersion: '4.0.0', htmlUrl: null,
                    fixStatus: 'pending', errorMessage: null,
                    firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                    occurrenceCount: 1, supersededAt: null,
                } as never))
            }
            // repo B：1 条独立 (axios, GHSA-B)
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId: repoB.id,
                upstreamId: 'dependabot:cross-repo-B', source: 'dependabot', severity: 'high',
                packageName: 'axios', ruleId: 'GHSA-B', manifestPath: null, summary: null,
                fixable: true, fixStrategy: 'upgrade', recommendedVersion: '1.0.0', htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))

            const plan = await computeBackfillPlan(ds)
            // repo A：2 行 → 1 行（删 1）
            // repo B：1 行 → 1 行（保留）
            expect(plan.totalBefore).toBe(3)
            expect(plan.toDelete.length).toBe(1) // 只删 repo A 的 1 条重复
            expect(plan.totalAfter).toBe(2) // 2 个仓库各 1 行
        })
    })

    describe('dry-run 与 apply 一致性', () => {
        it('dry-run 输出与 apply 前的 plan 一致', async () => {
            const ds = await ensureDatabaseInitialized()
            const resultRepo = ds.getRepository(ScanResult)
            const now = Date.now()
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId,
                upstreamId: 'dependabot:dry-run-A', source: 'dependabot', severity: 'high',
                packageName: 'demo', ruleId: 'R1', manifestPath: null, summary: null,
                fixable: true, fixStrategy: 'upgrade', recommendedVersion: '1.0.0', htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId,
                upstreamId: 'dependabot:dry-run-B', source: 'dependabot', severity: 'high',
                packageName: 'demo', ruleId: 'R1', manifestPath: null, summary: null,
                fixable: true, fixStrategy: 'upgrade', recommendedVersion: '1.0.0', htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))

            const dryRunStats = await backfillScanResultsDryRun()
            expect(dryRunStats.dryRun).toBe(true)
            expect(dryRunStats.totalBefore).toBe(2)
            expect(dryRunStats.deletedDuplicates).toBe(1)
            expect(dryRunStats.totalAfter).toBe(1)
        })

        it('apply 后 dry-run 复跑：所有计数为 0', async () => {
            const ds = await ensureDatabaseInitialized()
            const resultRepo = ds.getRepository(ScanResult)
            const now = Date.now()
            await resultRepo.save(resultRepo.create({
                scanRunId: runId, repositoryId,
                upstreamId: 'dependabot:apply-apply', source: 'dependabot', severity: 'high',
                packageName: 'apply-test', ruleId: 'R2', manifestPath: null, summary: null,
                fixable: true, fixStrategy: 'upgrade', recommendedVersion: '1.0.0', htmlUrl: null,
                fixStatus: 'pending', errorMessage: null,
                firstSeenAt: new Date(now), lastSeenAt: new Date(now),
                occurrenceCount: 1, supersededAt: null,
            } as never))

            // 第一次 apply
            const firstApply = await backfillScanResultsApply()
            expect(firstApply.totalBefore).toBe(1)
            expect(firstApply.deletedDuplicates).toBe(0)
            expect(firstApply.supersededAfterBackfill).toBe(1)

            // 第二次 dry-run：已 supersede 的不计入
            const secondDryRun = await backfillScanResultsDryRun()
            expect(secondDryRun.totalBefore).toBe(1)
            expect(secondDryRun.deletedDuplicates).toBe(0)
            expect(secondDryRun.supersededAfterBackfill).toBe(0)
            expect(secondDryRun.preservedSuccess).toBe(0)
        })
    })

    describe('formatStats 输出格式', () => {
        it('dry-run 标记正确', () => {
            const output = formatStats({
                totalBefore: 100,
                deletedDuplicates: 80,
                preservedSuccess: 5,
                supersededAfterBackfill: 10,
                totalAfter: 20,
                reposProcessed: 3,
                dryRun: true,
            })
            expect(output).toContain('[DRY-RUN]')
            expect(output).toContain('100')
            expect(output).toContain('80')
            expect(output).toContain('20') // totalAfter
            expect(output).toContain('5') // preservedSuccess
            expect(output).toContain('10') // supersededAfterBackfill
        })

        it('apply 标记正确', () => {
            const output = formatStats({
                totalBefore: 50,
                deletedDuplicates: 30,
                preservedSuccess: 2,
                supersededAfterBackfill: 18,
                totalAfter: 20,
                reposProcessed: 1,
                dryRun: false,
            })
            expect(output).toContain('[APPLY]')
            expect(output).toContain('30')
            expect(output).toContain('2')
            expect(output).toContain('18')
        })
    })
})
