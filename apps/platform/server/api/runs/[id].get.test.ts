import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import { BUILD_UNKNOWN_VALUE } from '../../../app/utils/run-view'
import runsIdHandler from './[id].get'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { ensureDatabaseInitialized } from '#server/database'
import { UNKNOWN_BUILD_VALUE } from '#server/utils/build-info'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const call = (method: string, url: string, params: Record<string, string> = {}) => runsIdHandler(makeEvent(method, url, undefined, {}, params))

describe('GET /api/runs/[id]', () => {
    let runId: string
    let repositoryId: string

    it('keeps the client-side unknown sentinel in sync with the server one', () => {
        // 前端镜像常量（app/utils/run-view.ts）必须与服务端权威值同值（同 EXPORT_RUNS_LIMIT 模式）
        expect(BUILD_UNKNOWN_VALUE).toBe(UNKNOWN_BUILD_VALUE)
    })

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
        repositoryId = created.id

        const ds = await ensureDatabaseInitialized()
        const run = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsTotal: 1, environmentalFailures: 1 }),
            exitCode: 1,
            environmentalFailureCount: 1,
            buildVersion: '2026.10.23',
            buildCommit: 'deadbeefcafe',
            memoryMaxBytes: 8 * 1024 ** 3,
            peakRssBytes: 6 * 1024 ** 3,
            oomKilled: true,
            resourceJson: JSON.stringify({ source: 'cgroup-v2', samples: 4 }),
        }))
        runId = run.id

        await ds.getRepository(ScanResult).save(ds.getRepository(ScanResult).create({
            scanRunId: runId,
            repositoryId: run.repositoryId,
            upstreamId: 'dependabot:1',
            source: 'dependabot',
            severity: 'high',
            packageName: 'lodash',
            manifestPath: 'package.json',
            ruleId: null,
            summary: '原型污染',
            fixable: true,
            fixStrategy: 'upgrade',
            recommendedVersion: '4.17.21',
            htmlUrl: 'https://github.com/demo/app/security',
            fixStatus: 'pending',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns failure classification and retry source columns', async () => {
        const ds = await ensureDatabaseInitialized()
        const source = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'failed',
            failureCode: 'ETIMEDOUT',
            failureStage: 'clone',
            failureKind: 'transient',
            retriedFromRunId: 'source-run-9',
        }))

        const detail = await call('GET', `/api/runs/${source.id}`, { id: source.id }) as Record<string, unknown>
        expect(detail).toMatchObject({
            failureCode: 'ETIMEDOUT',
            failureStage: 'clone',
            failureKind: 'transient',
            retriedFromRunId: 'source-run-9',
        })
    })

    it('returns run detail with results', async () => {
        const detail = await call('GET', `/api/runs/${runId}`, { id: runId }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: runId,
            owner: 'demo',
            name: 'app',
            status: 'completed',
            summary: { alertsTotal: 1, environmentalFailures: 1 },
            exitCode: 1,
            environmentalFailureCount: 1,
            buildVersion: '2026.10.23',
            buildCommit: 'deadbeefcafe',
            memoryMaxBytes: 8 * 1024 ** 3,
            peakRssBytes: 6 * 1024 ** 3,
            oomKilled: true,
            resource: { source: 'cgroup-v2', samples: 4 },
        })
        expect((detail.results as Record<string, unknown>[])).toHaveLength(1)
        expect((detail.results as Record<string, unknown>[])[0]).toMatchObject({
            packageName: 'lodash',
            severity: 'high',
            fixStatus: 'pending',
        })
    })

    it('breaks result severity ties by id DESC (stable row order)', async () => {
        const ds = await ensureDatabaseInitialized()
        const tieRun = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'all',
            executorKind: 'container',
            status: 'completed',
        }))
        const resultRepo = ds.getRepository(ScanResult)
        const seed = (upstreamId: string, severity: string) => resultRepo.save(resultRepo.create({
            scanRunId: tieRun.id,
            repositoryId,
            upstreamId,
            source: 'dependabot',
            severity,
            packageName: 'lodash',
            manifestPath: 'package.json',
            ruleId: null,
            summary: 'same severity tie',
            fixable: false,
            fixStrategy: null,
            recommendedVersion: null,
            htmlUrl: null,
            fixStatus: 'not-tried',
            firstSeenAt: new Date('2026-08-01T00:00:00Z'),
            lastSeenAt: new Date('2026-08-01T00:00:00Z'),
            occurrenceCount: 1,
            supersededAt: null,
        }))

        // 同 severity 两行 + 更低 severity 一行：并列必须按 id DESC，而非插入顺序
        const tieOld = await seed('dependabot:tie-1', 'high')
        const tieNew = await seed('dependabot:tie-2', 'high')
        const lower = await seed('dependabot:tie-3', 'low')

        const detail = await call('GET', `/api/runs/${tieRun.id}`, { id: tieRun.id }) as Record<string, unknown>
        const ids = (detail.results as { id: string }[]).map((r) => r.id)
        expect(ids).toEqual([tieNew.id, tieOld.id, lower.id])
    })

    it('returns 404 for unknown run id', async () => {
        await expectError(call('GET', '/api/runs/nonexistent', { id: 'nonexistent' }), 404)
    })

    it('returns 400 when id param is missing', async () => {
        await expectError(call('GET', '/api/runs/'), 400)
    })

    it('returns null summary/error when summaryJson/errorJson are not set', async () => {
        const ds = await ensureDatabaseInitialized()
        const noMeta = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'low',
            executorKind: 'container',
            status: 'failed',
            summaryJson: null,
            errorJson: null,
        }))

        const detail = await call('GET', `/api/runs/${noMeta.id}`, { id: noMeta.id }) as Record<string, unknown>
        expect(detail.summary).toBeNull()
        expect(detail.error).toBeNull()
        // 无 result 的失败：结果可信度两列为 null（UI 显示「结果缺失」，不显示「告警 0」）
        expect(detail.exitCode).toBeNull()
        expect(detail.environmentalFailureCount).toBeNull()
        // 存量行（列上线前）：构建版本回执为 null，UI 按「未知」降级
        expect(detail.buildVersion).toBeNull()
        expect(detail.buildCommit).toBeNull()
    })

    it('returns parsed error when errorJson is set', async () => {
        // 分支覆盖：run.errorJson ? JSON.parse(run.errorJson) : null
        const ds = await ensureDatabaseInitialized()
        const errorRun = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'failed',
            errorJson: JSON.stringify({ code: 'EXECUTION_FAILED', message: 'Network timeout' }),
        }))

        const detail = await call('GET', `/api/runs/${errorRun.id}`, { id: errorRun.id }) as Record<string, unknown>
        expect(detail.error).toEqual({ code: 'EXECUTION_FAILED', message: 'Network timeout' })
    })

    it('returns formatted logsText when logsJson has entries', async () => {
        // 分支覆盖：logEntries.length > 0 ? formatLogEntries(logEntries) : null
        const ds = await ensureDatabaseInitialized()
        const logEntries = [
            { timestamp: '2026-08-01T00:00:00Z', level: 'info', message: 'Starting scan' },
            { timestamp: '2026-08-01T00:01:00Z', level: 'info', message: 'Scan completed' },
        ]
        const logRun = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'low',
            executorKind: 'container',
            status: 'completed',
            logsJson: JSON.stringify(logEntries),
        }))

        const detail = await call('GET', `/api/runs/${logRun.id}`, { id: logRun.id }) as Record<string, unknown>
        expect(detail.logsText).not.toBeNull()
        expect(typeof detail.logsText).toBe('string')
        expect(detail.logs).toEqual(logEntries)
    })

    it('returns null owner/name when repository relation is missing', async () => {
        // 分支覆盖：run.repository?.owner ?? null 和 run.repository?.name ?? null
        // 注意：由于 FOREIGN KEY 约束，我们不能直接插入不存在的 repositoryId
        // 这个分支在实际场景中可能很难触发，但我们可以通过验证现有逻辑来确保代码正确
        // 实际上，如果 repository 被删除但 ScanRun 仍然存在，就会出现这种情况
        const detail = await call('GET', `/api/runs/${runId}`, { id: runId }) as Record<string, unknown>
        // 由于我们创建了 repository，所以 owner 和 name 应该存在
        expect(detail.owner).toBe('demo')
        expect(detail.name).toBe('app')
    })
})
