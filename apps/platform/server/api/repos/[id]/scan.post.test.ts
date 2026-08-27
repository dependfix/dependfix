import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import reposIndexHandler from '../index'
import scanHandler from './scan.post'
import { ensureDatabaseInitialized } from '#server/database'
import { ScanRun } from '#server/entities/scan-run'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

// 扫描执行链路 mock：不跑真实引擎 / 队列（vi.hoisted：vi.mock factory 被提升，不能引用顶层变量）
const { runScanForRepository, createPendingScanRun, getQueueService } = vi.hoisted(() => ({
    runScanForRepository: vi.fn(),
    createPendingScanRun: vi.fn(),
    getQueueService: vi.fn(),
}))
vi.mock('#server/services/scan-orchestrator.service', () => ({
    runScanForRepository,
    createPendingScanRun,
}))
vi.mock('#server/services/queue/queue.service', () => ({
    getQueueService,
}))

const call = (body?: unknown, params: Record<string, string> = {}) =>
    scanHandler(makeEvent('POST', '/api/repos/repo-1/scan', body, {}, params))

const mockRun = (overrides: Record<string, unknown> = {}) => ({
    id: 'run-1',
    repositoryId: 'repo-1',
    mode: 'fix',
    severityThreshold: 'high',
    executorKind: 'container',
    status: 'completed',
    startedAt: new Date('2026-08-12T00:00:00Z'),
    finishedAt: new Date('2026-08-12T00:01:00Z'),
    runUrl: null,
    summaryJson: JSON.stringify({ alertsTotal: 2 }),
    errorJson: null,
    ...overrides,
})

describe('POST /api/repos/[id]/scan', () => {
    let repositoryId: string

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
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        runScanForRepository.mockReset()
        createPendingScanRun.mockReset()
        getQueueService.mockReset()
        getQueueService.mockResolvedValue({ mode: 'sync', queue: null })
        runScanForRepository.mockResolvedValue(mockRun())
        createPendingScanRun.mockResolvedValue(mockRun({
            id: 'pending-1',
            status: 'pending',
            summaryJson: null,
        }))
    })

    it('rejects unknown repository with 404', async () => {
        await expectError(call({ mode: 'fix', severityThreshold: 'high' }, { id: 'nonexistent' }), 404)
    })

    it('rejects invalid body with 400', async () => {
        await expectError(call({ mode: 'bogus' }, { id: repositoryId }), 400)
    })

    it('runs scan synchronously when queue is in sync mode', async () => {
        const result = await call({ mode: 'fix', severityThreshold: 'high' }, { id: repositoryId }) as Record<string, unknown>
        expect(result).toMatchObject({ id: 'run-1', status: 'completed', summary: { alertsTotal: 2 } })
        expect(runScanForRepository).toHaveBeenCalledWith(repositoryId, { mode: 'fix', severityThreshold: 'high' })
        expect(createPendingScanRun).not.toHaveBeenCalled()
    })

    it('enqueues scan in async mode and returns pending run', async () => {
        const queue = { add: vi.fn().mockResolvedValue({ reused: false }) }
        getQueueService.mockResolvedValue({ mode: 'async', queue })
        createPendingScanRun.mockResolvedValue(mockRun({
            id: 'pending-1',
            status: 'pending',
            summaryJson: null,
        }))

        const result = await call({ mode: 'fix', severityThreshold: 'high' }, { id: repositoryId }) as Record<string, unknown>
        expect(result).toMatchObject({ id: 'pending-1', status: 'pending' })
        expect(createPendingScanRun).toHaveBeenCalledWith(repositoryId, { mode: 'fix', severityThreshold: 'high' })
        expect(queue.add).toHaveBeenCalledWith(repositoryId, { mode: 'fix', severityThreshold: 'high' }, expect.objectContaining({ priority: 1 }))
    })

    it('fails pending run with duplicate error when queue dedupes', async () => {
        const queue = { add: vi.fn().mockResolvedValue({ reused: true }) }
        getQueueService.mockResolvedValue({ mode: 'async', queue })
        // duplicate 分支会真实 save pending run：必须返回真实实体实例（plain object save 不触发 BeforeInsert）
        const ds = await ensureDatabaseInitialized()
        createPendingScanRun.mockResolvedValue(ds.getRepository(ScanRun).create({
            id: 'pending-2',
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'pending',
        }))

        const result = await call({ mode: 'fix', severityThreshold: 'high' }, { id: repositoryId }) as Record<string, unknown>
        expect(result).toMatchObject({ id: 'pending-2', status: 'failed' })
        expect(result.error).toMatchObject({ code: 'duplicate_scan' })
    })

    it('fails over to synchronous execution when queue add throws', async () => {
        const queue = { add: vi.fn().mockRejectedValue(new Error('queue down')) }
        getQueueService.mockResolvedValue({ mode: 'async', queue })
        createPendingScanRun.mockResolvedValue(mockRun({
            id: 'pending-3',
            status: 'pending',
            summaryJson: null,
        }))

        const result = await call({ mode: 'fix', severityThreshold: 'high' }, { id: repositoryId }) as Record<string, unknown>
        expect(result).toMatchObject({ id: 'run-1', status: 'completed' })
        expect(runScanForRepository).toHaveBeenCalledWith(repositoryId, { mode: 'fix', severityThreshold: 'high' }, { runId: 'pending-3' })
    })

    /**
     * todo.md §M16.2 C66-D：reuseScanRunId 复用既有 ScanRun 进入 fix 流程
     * 验收：
     * - 复用既有 completed run → 同步执行（sync 模式）→ runScanForRepository 收到 { runId }
     * - 不调用 createPendingScanRun（避免新建孤儿 run）
     * - 返回 run.id === reuseScanRunId（与既有记录保持一致，前端可继续按 id 关联）
     */
    it('reuses existing ScanRun via reuseScanRunId in sync mode', async () => {
        // 先 seed 一条 completed run 作为复用目标
        const ds = await ensureDatabaseInitialized()
        const existing = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsFound: 3, alertsFixed: 0 }),
        }))
        // mock 同步执行返回 reused run（orchestrator 应将其更新为 running/completed）
        runScanForRepository.mockResolvedValue(mockRun({ id: existing.id, status: 'completed' }))

        const result = await call({
            mode: 'fix',
            severityThreshold: 'high',
            reuseScanRunId: existing.id,
        }, { id: repositoryId }) as Record<string, unknown>

        expect(result).toMatchObject({ id: existing.id, status: 'completed' })
        expect(runScanForRepository).toHaveBeenCalledWith(
            repositoryId,
            { mode: 'fix', severityThreshold: 'high', reuseScanRunId: existing.id },
            { runId: existing.id, reuse: true },
        )
        expect(createPendingScanRun).not.toHaveBeenCalled()
    })

    it('reuses existing ScanRun via reuseScanRunId in async queue mode', async () => {
        const ds = await ensureDatabaseInitialized()
        const existing = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            summaryJson: JSON.stringify({ alertsFound: 2, alertsFixed: 0 }),
        }))
        const queue = { add: vi.fn().mockResolvedValue({ reused: false }) }
        getQueueService.mockResolvedValue({ mode: 'async', queue })

        const result = await call({
            mode: 'fix',
            severityThreshold: 'high',
            reuseScanRunId: existing.id,
        }, { id: repositoryId }) as Record<string, unknown>

        expect(result).toMatchObject({ id: existing.id })
        // 入队时使用复用 run.id（不是新建 pending run）+ 透传 reuse 让 worker 绕过终态校验
        expect(queue.add).toHaveBeenCalledWith(
            repositoryId,
            { mode: 'fix', severityThreshold: 'high', reuseScanRunId: existing.id },
            expect.objectContaining({ runId: existing.id, reuse: true }),
        )
        // 不应新建 pending run
        expect(createPendingScanRun).not.toHaveBeenCalled()
    })

    it('rejects reuseScanRunId with 404 when run does not exist', async () => {
        await expectError(call({
            mode: 'fix',
            severityThreshold: 'high',
            reuseScanRunId: 'nonexistent-run-id',
        }, { id: repositoryId }), 404)
    })

    it('rejects reuseScanRunId with 400 when run belongs to a different repository', async () => {
        // 创建另一个仓库并 seed run
        const otherRepo = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'other',
            name: 'svc',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        const ds = await ensureDatabaseInitialized()
        const foreignRun = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId: otherRepo.id,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))

        await expectError(call({
            mode: 'fix',
            severityThreshold: 'high',
            reuseScanRunId: foreignRun.id,
        }, { id: repositoryId }), 400)
    })

    it('rejects reuseScanRunId with 409 when run is currently running', async () => {
        const ds = await ensureDatabaseInitialized()
        const runningRun = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'running',
        }))

        await expectError(call({
            mode: 'fix',
            severityThreshold: 'high',
            reuseScanRunId: runningRun.id,
        }, { id: repositoryId }), 409)
    })

    it('pendingScanRun path still works when reuseScanRunId is absent', async () => {
        // 回归：未传 reuseScanRunId 时行为与既有路径一致
        const queue = { add: vi.fn().mockResolvedValue({ reused: false }) }
        getQueueService.mockResolvedValue({ mode: 'async', queue })
        createPendingScanRun.mockResolvedValue(mockRun({
            id: 'pending-fresh',
            status: 'pending',
            summaryJson: null,
        }))

        const result = await call({ mode: 'fix', severityThreshold: 'high' }, { id: repositoryId }) as Record<string, unknown>
        expect(result).toMatchObject({ id: 'pending-fresh', status: 'pending' })
        expect(createPendingScanRun).toHaveBeenCalled()
    })
})
