import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../../tests/api-helper'
import reposIndexHandler from '../repos/index'
// 前端镜像常量：断言两侧等值，避免「服务端上限调整、前端预判不跟随」的静默漂移
import { EXPORT_RUNS_LIMIT } from '../../../app/utils/run-view'
import logsGetHandler from './[id]/logs.get'
import logsExportHandler, { MAX_EXPORT_RUNS } from './logs-export.get'
import { RUNS_PAGE_SIZE_MAX } from '#server/utils/runs-query'
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

    it('按 startedAt 排序导出（与列表同源）并在文件头记录 from / to', async () => {
        const sortRepoId = await createRepo('logs-sort')
        const late = await seedRun(sortRepoId, {
            startedAt: new Date('2026-10-03T00:00:00Z'),
            logsJson: JSON.stringify([{ timestamp: '2026-10-03T00:00:00.000Z', level: 'info', message: 'LATE-MARKER' }]),
        })
        const early = await seedRun(sortRepoId, {
            startedAt: new Date('2026-10-01T00:00:00Z'),
            logsJson: JSON.stringify([{ timestamp: '2026-10-01T00:00:00.000Z', level: 'info', message: 'EARLY-MARKER' }]),
        })
        const middle = await seedRun(sortRepoId, {
            startedAt: new Date('2026-10-02T00:00:00Z'),
            logsJson: JSON.stringify([{ timestamp: '2026-10-02T00:00:00.000Z', level: 'info', message: 'MIDDLE-MARKER' }]),
        })
        const from = encodeURIComponent('2026-10-01T00:00:00.000Z')
        const to = encodeURIComponent('2026-10-03T00:00:00.000Z')

        const body = await callExport(
            `?repositoryId=${sortRepoId}&sortBy=startedAt&sortOrder=asc&from=${from}&to=${to}`,
        ).promise as string

        expect(body).toContain(`# 筛选：from=2026-10-01T00:00:00.000Z`)
        expect(body).toContain(`# 筛选：to=2026-10-03T00:00:00.000Z`)
        const order = [early.id, middle.id, late.id].map((id) => body.indexOf(`# Run ${id}`))
        expect(order.every((index) => index >= 0)).toBe(true)
        expect(order).toEqual([...order].sort((a, b) => a - b))
    })

    it('分页窗口导出与列表同序（startedAt asc 逐页不重不漏）', async () => {
        const pageRepoId = await createRepo('logs-sort-page')
        const runs = [
            await seedRun(pageRepoId, { startedAt: new Date('2026-11-01T00:00:00Z') }),
            await seedRun(pageRepoId, { startedAt: new Date('2026-11-02T00:00:00Z') }),
            await seedRun(pageRepoId, { startedAt: new Date('2026-11-03T00:00:00Z') }),
        ]

        const page1 = await callExport(
            `?repositoryId=${pageRepoId}&sortBy=startedAt&sortOrder=asc&page=1&pageSize=1`,
        ).promise as string
        const page2 = await callExport(
            `?repositoryId=${pageRepoId}&sortBy=startedAt&sortOrder=asc&page=2&pageSize=1`,
        ).promise as string
        expect(page1).toContain(`# Run ${runs[0]!.id}`)
        expect(page2).toContain(`# Run ${runs[1]!.id}`)
        expect(page1).not.toContain(`# Run ${runs[1]!.id}`)
        expect(page2).not.toContain(`# Run ${runs[0]!.id}`)
    })

    it('from > to → 400 RUNS_VALIDATION_FAILED', async () => {
        const err = await expectError(callExport(
            `?from=${encodeURIComponent('2026-10-03T00:00:00.000Z')}&to=${encodeURIComponent('2026-10-01T00:00:00.000Z')}`,
        ).promise, 400)
        expect(err.data.code).toBe('RUNS_VALIDATION_FAILED')
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

        // 不带 repositoryId 的导出：foreign-org run 只能由 applyRunsWhere 的 repository.organizationId 排除
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

    it('分页窗口导出：逐页不重不漏 + 文件头标注窗口范围', async () => {
        const pageRepoId = await createRepo('logs-page')
        const seededIds = [
            (await seedRun(pageRepoId)).id,
            (await seedRun(pageRepoId)).id,
            (await seedRun(pageRepoId)).id,
        ]

        // 同毫秒插入时 createdAt 可能并列 → 不锁定「哪一条在第 1 页」，只锁定窗口划分语义
        const page1 = await callExport(`?repositoryId=${pageRepoId}&page=1&pageSize=2`).promise as string
        const page2 = await callExport(`?repositoryId=${pageRepoId}&page=2&pageSize=2`).promise as string

        expect(page1).toContain('# 运行数：2')
        expect(page1).toContain('# 导出范围：第 1 页（每页 2 条，共 3 条）')
        expect(page2).toContain('# 运行数：1')
        expect(page2).toContain('# 导出范围：第 2 页（每页 2 条，共 3 条）')

        const exportedIds = [...page1.matchAll(/# Run (\S+)/g), ...page2.matchAll(/# Run (\S+)/g)]
            .map((match) => match[1])
            .sort()
        expect(exportedIds).toEqual([...seededIds].sort())
    })

    it('分页窗口越界 → 404 RUN_LOGS_NOT_FOUND', async () => {
        const repoId = await createRepo('logs-page-out-of-range')
        await seedRun(repoId, {})

        const err = await expectError(callExport(`?repositoryId=${repoId}&page=9&pageSize=10`).promise, 404)
        expect(err.data.code).toBe('RUN_LOGS_NOT_FOUND')
    })

    it('分页窗口每页条数超上限 → 静默钳制到共享上限（与列表同源）', async () => {
        const repoId = await createRepo('logs-page-size-clamp')
        await seedRun(repoId, {})

        // 只传 pageSize（page 缺省 1）+ 请求值 500 > RUNS_PAGE_SIZE_MAX → 文件头体现钳制后的页宽
        const body = await callExport(`?repositoryId=${repoId}&pageSize=500`).promise as string
        expect(body).toContain(`# 导出范围：第 1 页（每页 ${RUNS_PAGE_SIZE_MAX} 条，共 1 条）`)
    })

    it('分页窗口不受全量运行数上限约束（上限只约束全量导出）', async () => {
        const windowRepoId = await createRepo('logs-window-over-cap')
        for (let i = 0; i <= MAX_EXPORT_RUNS; i += 1) {
            await seedRun(windowRepoId)
        }

        // 全量导出仍按上限拒绝
        await expectError(callExport(`?repositoryId=${windowRepoId}`).promise, 413)
        // 窗口导出取该页全部（页大小 150 > MAX_EXPORT_RUNS，未被运行数上限拦截）
        const body = await callExport(`?repositoryId=${windowRepoId}&page=1&pageSize=150`).promise as string
        expect(body).toContain(`# 运行数：${MAX_EXPORT_RUNS + 1}`)
        expect(body).toContain(`# 导出范围：第 1 页（每页 150 条，共 ${MAX_EXPORT_RUNS + 1} 条）`)
    })

    it('前端镜像的全量导出上限与服务端常量一致（防口径漂移）', () => {
        expect(EXPORT_RUNS_LIMIT).toBe(MAX_EXPORT_RUNS)
    })
})
