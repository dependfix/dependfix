import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../../tests/api-helper'
import reposIndexHandler from '../../repos/index'
import retryHandler from './retry.post'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'

/**
 * POST /api/runs/[id]/retry 守卫与派生矩阵（口径见 docs/design/governance/run-failure-taxonomy.md §5.5）。
 *
 * 触发路径本体（入队 / 去重合并 / 降级同步）在 `services/scan-trigger.service` 由既有
 * `scan.post.test.ts` 覆盖；本文件只锁定**端点侧约束**：归属 / 终态 / 仅 transient / 参数派生 / 来源写入。
 */
const triggerMock = vi.hoisted(() => ({
    triggerScanForRepository: vi.fn(),
}))

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

vi.mock('#server/services/scan-trigger.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('#server/services/scan-trigger.service')>()
    return { ...actual, triggerScanForRepository: triggerMock.triggerScanForRepository }
})

const call = (runId: string, method = 'POST') =>
    retryHandler(makeEvent(method, `/api/runs/${runId}/retry`, undefined, {}, { id: runId }))

const makeRun = async (overrides: Record<string, unknown> = {}): Promise<ScanRun> => {
    const ds = await ensureDatabaseInitialized()
    return ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
        repositoryId: repositoryId!,
        mode: 'fix',
        severityThreshold: 'high',
        executorKind: 'container',
        status: 'failed',
        failureCode: 'ETIMEDOUT',
        failureStage: 'clone',
        failureKind: 'transient',
        ...overrides,
    }))
}

let repositoryId: string | undefined

describe('POST /api/runs/[id]/retry', () => {
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
        triggerMock.triggerScanForRepository.mockResolvedValue({
            run: {
                id: 'retry-run-1',
                repositoryId,
                mode: 'fix',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'pending',
                startedAt: null,
                finishedAt: null,
                runUrl: null,
                summaryJson: null,
                errorJson: null,
                retriedFromRunId: 'source-run',
            },
        })
    })

    it('404 when the run does not exist', async () => {
        const err = await expectError(call('missing-run'), 404)
        expect(err.data?.code).toBe('SCAN_RUN_NOT_FOUND')
    })

    it('400 when the route param is missing', async () => {
        const err = await expectError(
            retryHandler(makeEvent('POST', '/api/runs//retry', undefined, {}, {})),
            400,
        )
        expect(err.data?.code).toBe('RUN_ID_MISSING')
    })

    it('409 RUN_RETRY_SOURCE_RUNNING when the source run has not finished', async () => {
        const running = await makeRun({ status: 'running', failureKind: null, startedAt: new Date() })
        const err = await expectError(call(running.id), 409)
        expect(err.data?.code).toBe('RUN_RETRY_SOURCE_RUNNING')
        expect(triggerMock.triggerScanForRepository).not.toHaveBeenCalled()
    })

    it('409 RUN_RETRY_NOT_ALLOWED for deterministic / unknown / success runs', async () => {
        for (const overrides of [
            { failureKind: 'deterministic' },
            { failureKind: 'unknown' },
            { failureKind: null, status: 'completed' },
        ]) {
            const run = await makeRun(overrides)
            const err = await expectError(call(run.id), 409)
            expect(err.data?.code, JSON.stringify(overrides)).toBe('RUN_RETRY_NOT_ALLOWED')
        }
        expect(triggerMock.triggerScanForRepository).not.toHaveBeenCalled()
    })

    it('409 RUN_RETRY_PARAMS_INVALID when stored params cannot be reused', async () => {
        const run = await makeRun({ mode: 'legacy-mode' })
        const err = await expectError(call(run.id), 409)
        expect(err.data?.code).toBe('RUN_RETRY_PARAMS_INVALID')
        expect(triggerMock.triggerScanForRepository).not.toHaveBeenCalled()
    })

    it('derives params from the source run and records the retry source', async () => {
        const run = await makeRun()
        const response = await call(run.id) as Record<string, unknown>

        expect(triggerMock.triggerScanForRepository).toHaveBeenCalledWith(
            repositoryId,
            { mode: 'fix', severityThreshold: 'high', executorKind: 'container' },
            { retriedFromRunId: run.id, triggeredByUserId: 'u1' },
        )
        expect(response).toMatchObject({ id: 'retry-run-1', retriedFromRunId: 'source-run' })
    })

    it('preserves sandbox executorKind on retry (entry restored; fix degrades in orchestrator)', async () => {
        const run = await makeRun({ executorKind: 'sandbox' })
        await call(run.id)

        expect(triggerMock.triggerScanForRepository).toHaveBeenCalledWith(
            repositoryId,
            { mode: 'fix', severityThreshold: 'high', executorKind: 'sandbox' },
            { retriedFromRunId: run.id, triggeredByUserId: 'u1' },
        )
    })

    it('passes through the de-dup merge notice (merged → 提示且不跳转)', async () => {
        const run = await makeRun()
        triggerMock.triggerScanForRepository.mockResolvedValue({
            run: {
                id: 'retry-run-2',
                repositoryId,
                mode: 'fix',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'failed',
                startedAt: null,
                finishedAt: null,
                runUrl: null,
                summaryJson: null,
                errorJson: JSON.stringify({ code: 'SCAN_PENDING_MERGED', message: 'merged' }),
                retriedFromRunId: run.id,
            },
            merged: { code: 'SCAN_PENDING_MERGED', message: '该仓库已有进行中的扫描任务，本次触发已合并' },
        })

        const response = await call(run.id) as Record<string, unknown>
        expect(response.merged).toMatchObject({ code: 'SCAN_PENDING_MERGED' })
    })

    it('409 SCAN_ALREADY_COMPLETED when the trigger reports a terminal conflict', async () => {
        const run = await makeRun()
        const { ScanAlreadyCompletedError } = await import('#server/services/scan-trigger.service')
        triggerMock.triggerScanForRepository.mockRejectedValue(new ScanAlreadyCompletedError('已处于终态'))

        const err = await expectError(call(run.id), 409)
        expect(err.data?.code).toBe('SCAN_ALREADY_COMPLETED')
    })
})
