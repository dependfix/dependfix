import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import reposIndexHandler from '../api/repos/index'
import { reconcileAlerts } from './scan-reconcile'
import { ensureDatabaseInitialized } from '#server/database'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'

// 复用 repos API 创建仓库数据：guard 走 mock（真实 getAuth 依赖 Nuxt useRuntimeConfig）
vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

/**
 * reconcileAlerts 单元测试（todo.md §M20.3）：
 * 覆盖 4 条 reconcile 规则 + 幂等性 + 防御性 TypeError。
 *
 * 每个用例使用独立 upstreamId（防止 M20.3 per-alert 模型下 reconcile 跨测试状态污染）。
 */

const alert = (overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert => ({
    id: 1,
    source: 'dependabot',
    repository: 'demo/app',
    defaultBranch: 'main',
    severity: 'high',
    packageEcosystem: 'npm',
    packageName: 'lodash',
    manifestPath: 'package.json',
    ruleId: '',
    summary: '原型污染',
    htmlUrl: 'https://github.com/demo/app/security',
    fixable: true,
    fixStrategy: 'upgrade',
    recommendedVersion: '4.17.21',
    upstreamId: 'dependabot:100',
    ...overrides,
})

describe('scan-reconcile', () => {
    let repositoryId: string
    let runId1: string
    let runId2: string

    beforeAll(async () => {
        setupMemoryDatabase()
        // 用 API 创建仓库（避免手动构造 FK：organizationId 自动绑定当前组织）
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'scan-reconcile-test',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id

        const ds = await ensureDatabaseInitialized()
        // 预创建两个 ScanRun（用于 reconcile 测试 scanRunId 切换）
        const run1 = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        runId1 = run1.id
        const run2 = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        runId2 = run2.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(async () => {
        // 每个用例前清理该 repository 的 ScanResult（测试隔离）
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ScanResult).delete({ repositoryId })
    })

    it('inserts new alerts (per-alert model)', async () => {
        const stats = await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [
                alert({ upstreamId: 'dependabot:200' }),
                alert({ upstreamId: 'pnpm-audit:lodash:<hash>' }),
            ],
        })

        expect(stats).toEqual({
            inserted: 2,
            refreshed: 0,
            superseded: 0,
            preservedSuccess: 0,
            unchanged: 0,
        })

        const ds = await ensureDatabaseInitialized()
        const rows = await ds.getRepository(ScanResult).find({ where: { repositoryId } })
        expect(rows).toHaveLength(2)
        expect(rows.every((r) => r.scanRunId === runId1)).toBe(true)
        expect(rows.every((r) => r.occurrenceCount === 1)).toBe(true)
        expect(rows.every((r) => r.firstSeenAt.getTime() === r.lastSeenAt.getTime())).toBe(true)
        expect(rows.every((r) => r.supersededAt === null)).toBe(true)
    })

    it('refreshes existing alerts (active: lastSeenAt + occurrenceCount++ + scanRunId + severity update)', async () => {
        const ds = await ensureDatabaseInitialized()
        const initialAlert = alert({ upstreamId: 'dependabot:300', severity: 'high' })
        await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [initialAlert],
        })
        const original = await ds.getRepository(ScanResult).findOne({ where: { upstreamId: 'dependabot:300' } })
        expect(original).toBeDefined()
        const originalFirstSeen = original!.firstSeenAt

        // 第二次扫描：上游还有该 alert，但 severity 升级 + scanRun 变化
        const updatedAlert = alert({ upstreamId: 'dependabot:300', severity: 'critical' })
        const stats = await reconcileAlerts({
            repositoryId,
            newRunId: runId2,
            newAlerts: [updatedAlert],
        })

        expect(stats).toEqual({
            inserted: 0,
            refreshed: 1,
            superseded: 0,
            preservedSuccess: 0,
            unchanged: 0,
        })

        const refreshed = await ds.getRepository(ScanResult).findOne({ where: { upstreamId: 'dependabot:300' } })
        expect(refreshed).toBeDefined()
        expect(refreshed!.scanRunId).toBe(runId2)
        expect(refreshed!.severity).toBe('critical')
        expect(refreshed!.occurrenceCount).toBe(2) // 1 → 2
        expect(refreshed!.firstSeenAt.getTime()).toBe(originalFirstSeen.getTime()) // firstSeenAt 不变
        expect(refreshed!.lastSeenAt.getTime()).toBeGreaterThan(originalFirstSeen.getTime()) // lastSeenAt 刷新
        expect(refreshed!.supersededAt).toBeNull()
    })

    it('supersedes alerts when upstream disappears (fixStatus ≠ success)', async () => {
        const ds = await ensureDatabaseInitialized()
        // 第一次扫描：插入 3 个 alert
        await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [
                alert({ upstreamId: 'dependabot:400' }),
                alert({ upstreamId: 'dependabot:401' }),
                alert({ upstreamId: 'dependabot:402' }),
            ],
        })

        // 第二次扫描：上游只剩 1 个（dependabot:400）
        // dependabot:401 / dependabot:402 应被 supersede（fixStatus=not-tried，非 success）
        const stats = await reconcileAlerts({
            repositoryId,
            newRunId: runId2,
            newAlerts: [
                alert({ upstreamId: 'dependabot:400' }),
            ],
        })

        expect(stats.superseded).toBe(2)
        expect(stats.unchanged).toBe(0)

        const rows = await ds.getRepository(ScanResult).find({ where: { repositoryId } })
        expect(rows).toHaveLength(3) // 3 行全部保留（supersededAt 不删除行）
        const superseded = rows.filter((r) => r.supersededAt !== null)
        expect(superseded.map((r) => r.upstreamId).sort()).toEqual(['dependabot:401', 'dependabot:402'])
        const active = rows.filter((r) => r.supersededAt === null)
        expect(active.map((r) => r.upstreamId)).toEqual(['dependabot:400'])
    })

    it('preserves fixStatus=success alerts even when upstream disappears (decision 1: 永不被 supersede)', async () => {
        const ds = await ensureDatabaseInitialized()
        // 第一次扫描：插入 2 个 alert
        await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [
                alert({ upstreamId: 'dependabot:500' }),
                alert({ upstreamId: 'dependabot:501' }),
            ],
        })
        // 手动把 dependabot:500 标记为 success（模拟 fix-and-pr 后的修复记录）
        await ds.getRepository(ScanResult).update(
            { upstreamId: 'dependabot:500' },
            { fixStatus: 'success' },
        )

        // 第二次扫描：上游 2 个都不见（所有 alert 都消失）
        const stats = await reconcileAlerts({
            repositoryId,
            newRunId: runId2,
            newAlerts: [],
        })

        // dependabot:500 fixStatus=success → preservedSuccess（不 supersede）
        // dependabot:501 fixStatus=not-tried → superseded
        expect(stats.preservedSuccess).toBe(1)
        expect(stats.superseded).toBe(1)

        const rows = await ds.getRepository(ScanResult).find({ where: { repositoryId } })
        const fixedRow = rows.find((r) => r.upstreamId === 'dependabot:500')
        expect(fixedRow?.fixStatus).toBe('success')
        expect(fixedRow?.supersededAt).toBeNull() // 永不被 supersede
        const normalRow = rows.find((r) => r.upstreamId === 'dependabot:501')
        expect(normalRow?.supersededAt).toBeDefined()
    })

    it('is idempotent: repeated scan of same alerts does not re-supersede or change counts unexpectedly', async () => {
        const ds = await ensureDatabaseInitialized()
        // 第一次扫描
        await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [
                alert({ upstreamId: 'dependabot:600' }),
                alert({ upstreamId: 'dependabot:601' }),
            ],
        })

        // 第二次扫描：同 2 个 alert（模拟同次扫描被重复执行）
        const stats2 = await reconcileAlerts({
            repositoryId,
            newRunId: runId2,
            newAlerts: [
                alert({ upstreamId: 'dependabot:600' }),
                alert({ upstreamId: 'dependabot:601' }),
            ],
        })

        // 同一批 alert 二次扫描：refreshed=2（occurrenceCount: 1→2 → 2→3）
        expect(stats2.refreshed).toBe(2)
        expect(stats2.inserted).toBe(0)
        expect(stats2.superseded).toBe(0)
        expect(stats2.preservedSuccess).toBe(0)
        expect(stats2.unchanged).toBe(0)

        // 第三次扫描：上游全消失（再次模拟）
        const stats3 = await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [],
        })

        expect(stats3.superseded).toBe(2)
        expect(stats3.preservedSuccess).toBe(0)

        // 第四次扫描：再次空告警（幂等：已 supersede 的行 supersededAt 非 NULL，被 IsNull() 过滤排除 → 不再处理）
        const stats4 = await reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            newAlerts: [],
        })

        // 幂等性：第四次扫描无操作（所有 0）—— 已 supersede 的行不在 IsNull() 查询范围
        expect(stats4).toEqual({
            inserted: 0,
            refreshed: 0,
            superseded: 0,
            preservedSuccess: 0,
            unchanged: 0,
        })

        const rows = await ds.getRepository(ScanResult).find({ where: { repositoryId } })
        expect(rows).toHaveLength(2)
        expect(rows.every((r) => r.supersededAt !== null)).toBe(true)
    })

    it('throws TypeError if upstreamId missing (defensive guard)', async () => {
        await expect(reconcileAlerts({
            repositoryId,
            newRunId: runId1,
            // @ts-expect-error 测试运行时防御：upstreamId 缺省时抛 TypeError
            newAlerts: [{ ...alert({ upstreamId: undefined as unknown as string }), upstreamId: undefined }],
        })).rejects.toThrow(/reconcileAlerts: alert missing upstreamId/)
    })
})
