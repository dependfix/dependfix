import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import reposIndexHandler from '../api/repos/index'
import { runScanForRepository } from './scan-orchestrator.service'
import { ensureDatabaseInitialized } from '#server/database'
import { AuditEvent } from '#server/entities/audit-event'
import { ScanRun } from '#server/entities/scan-run'
import { logger } from '#server/utils/logger'

/**
 * 编排层终态写回的条件更新（并发守卫）。
 *
 * 场景：`runScanInternal` 执行期间，清理侧（`stale-cleanup` 孤儿回收 / 超时 / 手动 force-fail）
 * 已把同一 run 条件更新为 `failed`。迟到 worker 随后完成时**不得**用整行 `save` 覆盖终态。
 *
 * 口径见 [queue-stale-recovery.md §9](../../../../docs/design/governance/queue-stale-recovery.md)
 * 与 [development.md §5.1.36](../../../../docs/standards/development.md)。
 */

const { containerIsAvailable, containerExecute, sandboxIsAvailable } = vi.hoisted(() => ({
    containerIsAvailable: vi.fn(),
    containerExecute: vi.fn(),
    sandboxIsAvailable: vi.fn(),
}))

vi.mock('./executor/container-executor', () => ({
    ContainerExecutor: class {
        isAvailable = containerIsAvailable
        execute = containerExecute
    },
}))

// sandbox 路由：只用于「启动时不可用 → 降级 container → degraded」组合路径
vi.mock('./executor/sandbox-executor', () => ({
    SandboxExecutor: class {
        isAvailable = sandboxIsAvailable
        execute = vi.fn()
    },
}))

vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

const { notifyRunTerminal } = vi.hoisted(() => ({ notifyRunTerminal: vi.fn(() => Promise.resolve()) }))
vi.mock('./notification/run-notification.service', () => ({ notifyRunTerminal }))

// 收尾 reconcile 的失败注入点（post-completion 异常）：其余导出保持真实实现
const { reconcileAlertsMock } = vi.hoisted(() => ({ reconcileAlertsMock: vi.fn() }))
vi.mock('./scan-reconcile', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./scan-reconcile')>()
    reconcileAlertsMock.mockImplementation(actual.reconcileAlerts)
    return { ...actual, reconcileAlerts: reconcileAlertsMock }
})

let upstreamCounter = 0
const makeResult = () => {
    upstreamCounter++
    return {
        summary: { alertsTotal: 1, severityCounts: { critical: 0, high: 1 } },
        alerts: [{
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
            upstreamId: `dependabot:terminal-${upstreamCounter}`,
        }],
    }
}

describe('scan-orchestrator terminal write guard', () => {
    let repositoryId: string
    let sandboxRepositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'terminal-guard',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
        })) as { id: string }
        repositoryId = created.id
        const sandboxCreated = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: 'terminal-guard-sandbox',
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
        })) as { id: string }
        sandboxRepositoryId = sandboxCreated.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        containerIsAvailable.mockReset()
        containerIsAvailable.mockResolvedValue(true)
        containerExecute.mockReset()
        sandboxIsAvailable.mockReset()
        sandboxIsAvailable.mockResolvedValue(false)
    })

    /** 建一条 pending run（模拟队列预创建、由 worker 续用） */
    const createPendingRun = async (): Promise<ScanRun> => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(ScanRun)
        return repo.save(repo.create({
            repositoryId,
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'pending',
            startedAt: null,
        }))
    }

    /** 清理侧条件更新为 failed（与 stale-cleanup 同口径：仅 pending / running 可写） */
    const failRunAsCleanup = async (id: string, finishedAt: Date): Promise<void> => {
        const ds = await ensureDatabaseInitialized()
        await ds.getRepository(ScanRun).createQueryBuilder()
            .update(ScanRun)
            .set({
                status: 'failed',
                finishedAt,
                errorJson: JSON.stringify({ code: 'orphan_run', message: '超过上限未到达终态' }),
                failureCode: 'orphan_run',
                failureStage: 'unknown',
                failureKind: 'unknown',
            })
            .where('id = :id', { id })
            .andWhere('status IN (:...statuses)', { statuses: ['pending', 'running'] })
            .execute()
    }

    it('keeps the cleanup-written failed state when a late worker finishes', async () => {
        const pending = await createPendingRun()
        const cleanupFinishedAt = new Date('2026-05-01T00:00:00.000Z')
        const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue(undefined)
        try {
            containerExecute.mockImplementation(async () => {
                await failRunAsCleanup(pending.id, cleanupFinishedAt)
                return { result: makeResult(), error: undefined }
            })

            const run = await runScanForRepository(
                repositoryId,
                { mode: 'report-only', severityThreshold: 'high' },
                { runId: pending.id },
            )

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: pending.id } })
            // 清理侧的终态不得被迟到 worker 覆盖为 completed
            expect(persisted?.status).toBe('failed')
            expect(persisted?.failureCode).toBe('orphan_run')
            expect(persisted?.finishedAt?.toISOString()).toBe(cleanupFinishedAt.toISOString())
            // 本次执行的结果快照不得写回终态行
            expect(persisted?.summaryJson).toBeNull()
            // 返回值取库内终态行，供上层通知 / 回执与真实状态一致
            expect(run.status).toBe('failed')
            // 留审计痕迹（结构化告警含 attempted / observed 状态）
            expect(warnSpy).toHaveBeenCalledWith('[scan] run_terminal_write_skipped', expect.objectContaining({
                runId: pending.id,
                attemptedStatus: 'completed',
                observedStatus: 'failed',
            }))
            // 清理侧已就同一 run 发过失败通知：本次未写回时不得重复投递
            expect(notifyRunTerminal).not.toHaveBeenCalled()
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('keeps the cleanup-written terminal state when orchestration throws afterwards', async () => {
        const pending = await createPendingRun()
        const warnSpy = vi.spyOn(logger, 'warn').mockReturnValue(undefined)
        try {
            containerExecute.mockImplementation(async () => {
                await failRunAsCleanup(pending.id, new Date('2026-05-02T00:00:00.000Z'))
                throw new Error('executor blew up after cleanup')
            })

            const run = await runScanForRepository(
                repositoryId,
                { mode: 'report-only', severityThreshold: 'high' },
                { runId: pending.id },
            )

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: pending.id } })
            expect(persisted?.status).toBe('failed')
            // catch-all 的 orchestration_failed 不得覆盖清理侧的失败归因
            expect(persisted?.errorJson).toContain('orphan_run')
            expect(persisted?.errorJson).not.toContain('orchestration_failed')
            expect(run.status).toBe('failed')
        } finally {
            warnSpy.mockRestore()
        }
    })

    it('keeps the completed outcome when the post-completion reconcile throws', async () => {
        const pending = await createPendingRun()
        const errorSpy = vi.spyOn(logger, 'error').mockReturnValue(undefined)
        try {
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined, prNumber: 777 })
            // 收尾（告警明细 reconcile）抛错：业务结论已 completed，状态与交付字段必须保留
            reconcileAlertsMock.mockRejectedValueOnce(new Error('sqlite busy'))

            const run = await runScanForRepository(
                repositoryId,
                { mode: 'report-only', severityThreshold: 'high' },
                { runId: pending.id },
            )

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: pending.id } })
            expect(run.status).toBe('completed')
            expect(persisted?.status).toBe('completed')
            // 交付字段保留（有提交的运行不得被翻成 failed / orchestration_failed）
            expect(persisted?.errorJson).toBeNull()
            expect(persisted?.failureCode).toBeNull()
            expect(persisted?.summaryJson).toContain('alertsTotal')
            expect(persisted?.prNumber).toBe(777)
            expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('post-completion error'))
        } finally {
            errorSpy.mockRestore()
        }
    })

    it('keeps the degraded outcome (with its reason) when reconcile throws after a sandbox fallback', async () => {
        containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })
        reconcileAlertsMock.mockRejectedValueOnce(new Error('sqlite busy'))

        const run = await runScanForRepository(
            sandboxRepositoryId,
            { mode: 'report-only', severityThreshold: 'high' },
        )

        const ds = await ensureDatabaseInitialized()
        const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
        expect(run.status).toBe('degraded')
        expect(persisted?.status).toBe('degraded')
        // 降级原因必须随终态保留（completed 才清空 errorJson）
        expect(persisted?.errorJson).toContain('sandbox_unavailable')
        expect(persisted?.logsJson).toContain('post-completion error')
        // 降级审计事件不因收尾异常丢失
        const audits = await ds.getRepository(AuditEvent).find({ where: { scanRunId: run.id } })
        expect(audits.some((audit) => audit.type === 'sandbox_degraded')).toBe(true)
    })

    it('still writes the terminal state on the normal path (pending → completed)', async () => {
        const pending = await createPendingRun()
        containerExecute.mockResolvedValue({ result: makeResult(), error: undefined, prNumber: 501 })

        const run = await runScanForRepository(
            repositoryId,
            { mode: 'report-only', severityThreshold: 'high' },
            { runId: pending.id },
        )

        const ds = await ensureDatabaseInitialized()
        const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: pending.id } })
        expect(persisted?.status).toBe('completed')
        expect(persisted?.finishedAt).not.toBeNull()
        expect(persisted?.summaryJson).toContain('alertsTotal')
        // 终态写回列清单必须覆盖 prNumber（PR 回环观察态锚点，漏列不会被其它断言发现）
        expect(persisted?.prNumber).toBe(501)
        expect(run.status).toBe('completed')
        // 正常写回时终态通知只发一次
        expect(notifyRunTerminal).toHaveBeenCalledTimes(1)
    })

    it('reuses a terminal run as the carrier and persists the new outcome', async () => {
        const ds = await ensureDatabaseInitialized()
        const repo = ds.getRepository(ScanRun)
        const terminal = await repo.save(repo.create({
            repositoryId,
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: 'container',
            status: 'completed',
            finishedAt: new Date('2026-01-01T00:00:00.000Z'),
            summaryJson: JSON.stringify({ alertsTotal: 9 }),
            errorJson: JSON.stringify({ code: 'old_failure', message: '旧执行失败' }),
            failureCode: 'old_failure',
            failureStage: 'unknown',
            failureKind: 'unknown',
        }))
        containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

        const run = await runScanForRepository(
            repositoryId,
            { mode: 'report-only', severityThreshold: 'high' },
            { runId: terminal.id, reuse: true },
        )

        const persisted = await repo.findOne({ where: { id: terminal.id } })
        // 复用终态行后本轮写入必须生效（条件更新对 running 命中）
        expect(persisted?.status).toBe('completed')
        expect(persisted?.mode).toBe('report-only')
        expect(persisted?.summaryJson).toContain('alertsTotal')
        expect(persisted?.summaryJson).not.toContain('"alertsTotal":9')
        // 上一次执行的失败快照已被重置，不残留
        expect(persisted?.errorJson).toBeNull()
        expect(persisted?.failureCode).toBeNull()
        expect(run.id).toBe(terminal.id)
    })
})
