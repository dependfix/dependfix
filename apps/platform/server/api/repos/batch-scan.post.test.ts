import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import batchScanHandler from './batch-scan.post'
import reposIndexHandler from './index'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

// 真实批量执行会跑引擎，mock 执行器（vi.hoisted：vi.mock factory 被提升，不能引用顶层变量）
const { executeBatchRun } = vi.hoisted(() => ({ executeBatchRun: vi.fn() }))
vi.mock('#server/services/batch/batch-executor', () => ({
    executeBatchRun,
}))

const call = (body?: unknown) => batchScanHandler(makeEvent('POST', '/api/repos/batch-scan', body))

describe('POST /api/repos/batch-scan', () => {
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
        executeBatchRun.mockReset()
        executeBatchRun.mockResolvedValue({ batchRunId: 'batch-1', repositoryCount: 1 })
    })

    it('rejects invalid body with 400', async () => {
        await expectError(call({ repositoryIds: 'not-array' }), 400)
    })

    it('rejects empty repository selection with 400', async () => {
        await expectError(call({ repositoryIds: [], mode: 'fix', severityThreshold: 'high' }), 400)
    })

    it('ignores repository ids outside current organization', async () => {
        await expectError(
            call({ repositoryIds: ['foreign-repo'], mode: 'fix', severityThreshold: 'high' }),
            400,
        )
    })

    it('executes batch scan and returns batchRunId', async () => {
        const result = await call({
            repositoryIds: [repositoryId],
            mode: 'fix',
            severityThreshold: 'high',
        }) as Record<string, unknown>
        expect(result).toEqual({ batchRunId: 'batch-1', repositoryCount: 1 })
        expect(executeBatchRun).toHaveBeenCalledWith(expect.objectContaining({
            source: 'manual',
            repositoryIds: [repositoryId],
            request: { mode: 'fix', severityThreshold: 'high' },
        }))
    })
})
