import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import batchRunsIdHandler from './[id].get'
import { BatchRun } from '#server/entities/batch-run'
import { ScanRun } from '#server/entities/scan-run'
import { ensureDatabaseInitialized } from '#server/database'
import { resolveOrganizationId } from '#server/utils/organization'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const call = (method: string, url: string, params: Record<string, string> = {}, headers: Record<string, string> = {}) =>
    batchRunsIdHandler(makeEvent(method, url, undefined, headers, params))

describe('GET /api/batch-runs/[id]', () => {
    let batchRunId: string
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

        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const batch = await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 1,
            status: 'running',
        }))
        batchRunId = batch.id

        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            batchRunId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns batch run detail with aggregated statistics and write-back', async () => {
        const detail = await call('GET', `/api/batch-runs/${batchRunId}`, { id: batchRunId }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: batchRunId,
            status: 'completed',
            completedCount: 1,
            finishedCount: 1,
            runs: [{ status: 'completed' }],
        })
        // 聚合统计已写回 BatchRun（查询时更新策略）
        const ds = await ensureDatabaseInitialized()
        const persisted = await ds.getRepository(BatchRun).findOne({ where: { id: batchRunId } })
        expect(persisted?.status).toBe('completed')
        expect(persisted?.finishedCount).toBe(1)
        expect(persisted?.finishedAt).toBeTruthy()
    })

    it('returns 404 for unknown batch run', async () => {
        await expectError(call('GET', '/api/batch-runs/nonexistent', { id: 'nonexistent' }), 404)
    })

    /**
     * 空 batchRun（无下属 ScanRun）：初始 status='completed' + 0 scanRuns → 聚合恒等值
     * （counts 全 0、status='completed' 无 pending）。shouldWriteBackStatus('completed','completed')=false
     * 且 OR 链各条件全 false（counts 全 0 === counts 全 0）→ 写回块整段跳过。
     * 覆盖：`runs.length > 0` false 分支（line 36）+ 整段 OR false 分支（line 45-49）。
     */
    it('returns empty batch run with aggregated zero counts (no write-back)', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const emptyBatch = await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 0,
            status: 'completed',
        }))
        const detail = await call('GET', `/api/batch-runs/${emptyBatch.id}`, { id: emptyBatch.id }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: emptyBatch.id,
            status: 'completed',
            finishedCount: 0,
            completedCount: 0,
            failedCount: 0,
            pendingCount: 0,
            runs: [],
        })
        // 写回块未触发：BatchRun 字段保持初始值
        const persisted = await ds.getRepository(BatchRun).findOne({ where: { id: emptyBatch.id } })
        expect(persisted?.status).toBe('completed')
        expect(persisted?.finishedCount).toBe(0)
        expect(persisted?.finishedAt).toBeNull()
    })

    /**
     * failed 终态保护：batchRun.status='failed' + 下属 1 completed run。
     * shouldWriteBackStatus('failed', 'completed')=false（storedStatus !== 'running'），
     * 但 counts 不同 → 进入写回块；`if (statusWriteBack)` false 分支 → status 不更新（保留 failed），
     * 但 counts/summaryJson/finishedAt 仍按聚合更新。effectiveStatus = 'failed'（true 分支）。
     */
    it('preserves failed terminal status when aggregation reports completed', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const failedBatch = await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 1,
            status: 'failed',
        }))
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            batchRunId: failedBatch.id,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
        }))
        const detail = await call('GET', `/api/batch-runs/${failedBatch.id}`, { id: failedBatch.id }) as Record<string, unknown>
        // 对外状态保留 failed 终态（effectiveStatus true 分支）
        expect(detail.status).toBe('failed')
        expect(detail.completedCount).toBe(1)
        expect(detail.finishedCount).toBe(1)
        // 存储状态仍为 failed（shouldWriteBackStatus=false 未覆盖）；counts 已对齐聚合值
        const persisted = await ds.getRepository(BatchRun).findOne({ where: { id: failedBatch.id } })
        expect(persisted?.status).toBe('failed')
        expect(persisted?.completedCount).toBe(1)
        expect(persisted?.finishedCount).toBe(1)
    })

    /**
     * running + 1 running scanRun：aggregation.status='running'（pendingCount !== 0），
     * shouldWriteBackStatus('running', 'running')=false 但 aggregation.pendingCount(1) !== stored(0)
     * → OR 链 true 进入写回块，`if (statusWriteBack)` false 分支跳过 status 更新；
     * counts 仍按聚合对齐；aggregation.status !== 'completed' → 不进入 finishedAt 赋值块。
     */
    it('updates counts without status change when aggregation matches stored status', async () => {
        const ds = await ensureDatabaseInitialized()
        const organizationId = await resolveOrganizationId(ds)
        const runningBatch = await ds.getRepository(BatchRun).save(ds.getRepository(BatchRun).create({
            organizationId,
            source: 'manual',
            mode: 'fix',
            severityThreshold: 'high',
            repositoryCount: 1,
            status: 'running',
        }))
        await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
            repositoryId,
            batchRunId: runningBatch.id,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'running',
        }))
        const detail = await call('GET', `/api/batch-runs/${runningBatch.id}`, { id: runningBatch.id }) as Record<string, unknown>
        expect(detail).toMatchObject({
            id: runningBatch.id,
            status: 'running',
            finishedCount: 0,
            completedCount: 0,
            pendingCount: 1,
        })
        // 写回块触发但 statusWriteBack=false：status 保持 running；counts 按聚合对齐到 1/0/0/0/1；
        // finishedAt 保持 null（aggregation.status !== 'completed'，不进入赋值块）。
        const persisted = await ds.getRepository(BatchRun).findOne({ where: { id: runningBatch.id } })
        expect(persisted?.status).toBe('running')
        expect(persisted?.pendingCount).toBe(1)
        expect(persisted?.finishedAt).toBeNull()
    })
})

/**
 * 错误响应 i18n（todo.md §M17.4）：throw 改造使用 createLocalizedError，
 * message 按事件 locale 返回（cookie > Accept-Language > 默认 zh-CN），
 * 验证 BATCH_RUN_NOT_FOUND 双语对称。
 */
describe('GET /api/batch-runs/[id] 错误响应 i18n（todo.md §M17.4）', () => {
    beforeAll(() => {
        setupMemoryDatabase()
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    it('BATCH_RUN_NOT_FOUND 默认 zh-CN → 中文 message', async () => {
        await expect(call('GET', '/api/batch-runs/nonexistent', { id: 'nonexistent' }))
            .rejects.toMatchObject({
                statusCode: 404,
                message: '批量运行不存在',
                data: { code: 'BATCH_RUN_NOT_FOUND' },
            })
    })

    it('BATCH_RUN_NOT_FOUND Accept-Language=en-US → 英文 message（locale 切换验证）', async () => {
        await expect(call(
            'GET',
            '/api/batch-runs/nonexistent',
            { id: 'nonexistent' },
            { 'accept-language': 'en-US,en;q=0.9' },
        )).rejects.toMatchObject({
            statusCode: 404,
            message: 'Batch run not found',
            data: { code: 'BATCH_RUN_NOT_FOUND' },
        })
    })
})
