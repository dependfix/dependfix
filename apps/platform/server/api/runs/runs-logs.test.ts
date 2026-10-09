import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
import logsGetHandler from './[id]/logs.get'
import logsExportHandler, { MAX_EXPORT_RUNS } from './logs-export.get'
import { ScanRun, type ScanRunStatus } from '#server/entities/scan-run'
import { Repository } from '#server/entities/repository'
import { Organization } from '#server/entities/organization'
import { ensureDatabaseInitialized } from '#server/database'
import { requireOrgResource } from '#server/utils/guard'

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireOrgResource: vi.fn(async () => undefined),
}))

const callLogs = (id: string | undefined, params: Record<string, string> = {}) => {
    const event = makeEvent('GET', `/api/runs/${id ?? ''}/logs`, undefined, {}, params)
    return { event, promise: logsGetHandler(event) }
}
const callExport = (query = '') => {
    const event = makeEvent('GET', `/api/runs/logs-export${query}`)
    return { event, promise: logsExportHandler(event) }
}

const createRepo = async (name: string) => {
    const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
        owner: 'demo',
        name,
        platform: 'github',
        packageManager: 'pnpm',
        defaultBranch: 'main',
        executorKind: 'container',
    })) as { id: string }
    return created.id
}

const seedRun = async (repositoryId: string, overrides: {
    status?: ScanRunStatus
    logsJson?: string | null
    startedAt?: Date
} = {}): Promise<ScanRun> => {
    const ds = await ensureDatabaseInitialized()
    const repo = ds.getRepository(ScanRun)
    const entity = repo.create({
        repositoryId,
        mode: 'report-only',
        severityThreshold: 'high',
        executorKind: 'container',
        status: overrides.status ?? 'completed',
        startedAt: overrides.startedAt ?? new Date('2026-10-01T00:00:00Z'),
        logsJson: overrides.logsJson === undefined
            ? JSON.stringify([{ timestamp: '2026-10-01T00:00:00.000Z', level: 'info', message: 'hello' }])
            : overrides.logsJson,
    })
    return repo.save(entity)
}

describe('GET /api/runs/[id]/logs（单 run 日志导出）', () => {
    let repositoryId: string
    let repositoryOrgId: string
    let runId: string
    let emptyRunId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        repositoryId = await createRepo('logs-single')
        const ds = await ensureDatabaseInitialized()
        const repoRow = await ds.getRepository(Repository).findOne({ where: { id: repositoryId } })
        repositoryOrgId = repoRow?.organizationId ?? ''
        runId = (await seedRun(repositoryId)).id
        emptyRunId = (await seedRun(repositoryId, { logsJson: null })).id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('返回 txt 附件（附件名含 runId）+ 内容与 formatLogEntries 同源', async () => {
        const { event, promise } = callLogs(runId, { id: runId })
        const body = await promise

        expect(body).toBe('[2026-10-01T00:00:00.000Z] INFO  hello')
        expect(String(event.node.res.getHeader('content-disposition'))).toContain(`run-${runId}.txt`)
        expect(String(event.node.res.getHeader('content-type'))).toContain('text/plain')
        // 组织隔离守卫按 run 所属组织调用（第二参 = 该 run 所属仓库 organizationId）
        expect(requireOrgResource).toHaveBeenCalledWith(expect.anything(), repositoryOrgId)
    })

    it('跨组织（守卫抛 403）→ 透传 403', async () => {
        vi.mocked(requireOrgResource).mockRejectedValueOnce(createError({ statusCode: 403, statusMessage: 'Forbidden' }))
        await expectError(callLogs(runId, { id: runId }).promise, 403)
    })

    it('缺少 id → 400', async () => {
        await expectError(callLogs(undefined, {}).promise, 400)
    })

    it('run 不存在 → 404 SCAN_RUN_NOT_FOUND', async () => {
        const err = await expectError(callLogs('nonexistent', { id: 'nonexistent' }).promise, 404)
        expect(err.data.code).toBe('SCAN_RUN_NOT_FOUND')
    })

    it('run 无日志 → 404 RUN_LOGS_NOT_FOUND', async () => {
        const err = await expectError(callLogs(emptyRunId, { id: emptyRunId }).promise, 404)
        expect(err.data.code).toBe('RUN_LOGS_NOT_FOUND')
    })
})

describe('GET /api/runs/logs-export（批量日志导出）', () => {
    let repositoryId: string
    let failedRunId: string
    let completedRunId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        repositoryId = await createRepo('logs-batch')
        failedRunId = (await seedRun(repositoryId, {
            status: 'failed',
            logsJson: JSON.stringify([{ timestamp: '2026-10-01T00:00:00.000Z', level: 'error', message: 'BOOM-MARKER' }]),
        })).id
        completedRunId = (await seedRun(repositoryId, {
            status: 'completed',
            logsJson: JSON.stringify([{ timestamp: '2026-10-01T00:00:01.000Z', level: 'info', message: 'OK-MARKER' }]),
        })).id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('合并所选仓库的多个 run（文件头计数 + 分隔头含 runId）', async () => {
        const { event, promise } = callExport(`?repositoryId=${repositoryId}`)
        const body = await promise as string

        expect(body).toContain('# 运行数：2')
        expect(body).toContain(`# Run ${failedRunId}`)
        expect(body).toContain(`# Run ${completedRunId}`)
        expect(body).toContain('BOOM-MARKER')
        expect(body).toContain('OK-MARKER')
        expect(body).toContain(`# 筛选：repositoryId=${repositoryId}`)
        expect(String(event.node.res.getHeader('content-disposition'))).toContain('runs-logs-')
        expect(String(event.node.res.getHeader('content-disposition'))).toContain('.txt')
    })

    it('按状态筛选只导出命中 run', async () => {
        const body = await callExport(`?repositoryId=${repositoryId}&status=failed`).promise as string
        expect(body).toContain('# 运行数：1')
        expect(body).toContain('BOOM-MARKER')
        expect(body).not.toContain('OK-MARKER')
        expect(body).toContain('# 筛选：status=failed')
    })

    it('无命中 → 404 RUN_LOGS_NOT_FOUND', async () => {
        const err = await expectError(callExport(`?repositoryId=${repositoryId}&status=running`).promise, 404)
        expect(err.data.code).toBe('RUN_LOGS_NOT_FOUND')
    })

    it('非法筛选值 → 400 RUNS_VALIDATION_FAILED', async () => {
        const err = await expectError(callExport('?status=bogus').promise, 400)
        expect(err.data.code).toBe('RUNS_VALIDATION_FAILED')
    })

    it('组织隔离：其它组织的 run 不出现在导出中', async () => {
        const ds = await ensureDatabaseInitialized()
        const orgRepo = ds.getRepository(Organization)
        const otherOrg = await orgRepo.save(orgRepo.create({ name: 'Other Org' }))
        const repo = ds.getRepository(Repository)
        const other = await repo.save(repo.create({
            organizationId: otherOrg.id,
            owner: 'demo',
            name: 'other-org-repo',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        }))
        await seedRun(other.id, {
            logsJson: JSON.stringify([{ timestamp: '2026-10-01T00:00:02.000Z', level: 'info', message: 'OTHER-ORG-MARKER' }]),
        })

        // 不带 repositoryId 的导出：foreign-org run 只能由 buildRunsWhere 的 repository.organizationId 排除
        const body = await callExport('').promise as string
        expect(body).not.toContain('OTHER-ORG-MARKER')
        expect(body).toContain('BOOM-MARKER')
    })

    it('运行数超上限 → 413 RUN_LOGS_EXPORT_TOO_LARGE', async () => {
        const capRepoId = await createRepo('logs-cap')
        for (let i = 0; i <= MAX_EXPORT_RUNS; i += 1) {
            await seedRun(capRepoId)
        }
        const err = await expectError(callExport(`?repositoryId=${capRepoId}`).promise, 413)
        expect(err.data.code).toBe('RUN_LOGS_EXPORT_TOO_LARGE')
    })

    it('总字节超上限 → 413 RUN_LOGS_EXPORT_TOO_LARGE', async () => {
        const bigRepoId = await createRepo('logs-big')
        const huge = 'x'.repeat(6 * 1024 * 1024)
        await seedRun(bigRepoId, {
            logsJson: JSON.stringify([{ timestamp: '2026-10-01T00:00:03.000Z', level: 'info', message: huge }]),
        })
        const err = await expectError(callExport(`?repositoryId=${bigRepoId}`).promise, 413)
        expect(err.data.code).toBe('RUN_LOGS_EXPORT_TOO_LARGE')
    })
})
