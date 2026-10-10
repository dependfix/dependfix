import 'reflect-metadata'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { expectError, makeEvent, setupMemoryDatabase, teardownMemoryDatabase } from '../../tests/api-helper'
import reposIndexHandler from '../api/repos/index'
import { encryptToken } from './credential.service'
import { createPendingScanRun, runScanForRepository } from './scan-orchestrator.service'
import { ensureDatabaseInitialized } from '#server/database'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { Repository } from '#server/entities/repository'
import { Credential } from '#server/entities/credential'
import { AuditEvent } from '#server/entities/audit-event'

// 外部执行器 mock（真实执行会跑引擎/触发 GitHub Action）
// class 实例的 execute/fetch 字段指向共享 mock（实例在 runScanForRepository 执行时才创建，
// 测试须在调用前即可设置行为）
const { ContainerExecutorMock, SandboxExecutorMock, ActionTriggerExecutorMock, ActionResultFetcherMock, containerIsAvailable, containerExecute, sandboxExecute, sandboxIsAvailable, actionExecute, fetcherFetch, notifyEnvEvent } = vi.hoisted(() => ({
    ContainerExecutorMock: vi.fn(),
    SandboxExecutorMock: vi.fn(),
    ActionTriggerExecutorMock: vi.fn(),
    ActionResultFetcherMock: vi.fn(),
    containerIsAvailable: vi.fn(),
    containerExecute: vi.fn(),
    sandboxExecute: vi.fn(),
    sandboxIsAvailable: vi.fn(),
    actionExecute: vi.fn(),
    fetcherFetch: vi.fn(),
    notifyEnvEvent: vi.fn(),
}))
vi.mock('./executor/container-executor', () => ({
    ContainerExecutor: class {
        constructor(...args: unknown[]) {
            ContainerExecutorMock(...args)
        }

        isAvailable = containerIsAvailable
        execute = containerExecute
    },
}))
vi.mock('./executor/sandbox-executor', () => ({
    SandboxExecutor: class {
        constructor(...args: unknown[]) {
            SandboxExecutorMock(...args)
        }

        isAvailable = sandboxIsAvailable
        execute = sandboxExecute
    },
}))
vi.mock('./executor/action-trigger-executor', () => ({
    ActionTriggerExecutor: class {
        constructor(...args: unknown[]) {
            ActionTriggerExecutorMock(...args)
        }

        execute = actionExecute
    },
}))
vi.mock('./executor/action-result-fetcher', () => ({
    ActionResultFetcher: class {
        constructor(...args: unknown[]) {
            ActionResultFetcherMock(...args)
        }

        fetch = fetcherFetch
    },
}))

// 复用 repos API 创建仓库数据：guard 走 mock（真实 getAuth 依赖 Nuxt useRuntimeConfig）
vi.mock('#server/utils/guard', () => ({
    requireAuth: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
    requireRole: vi.fn(async () => ({ user: { id: 'u1', email: 'admin@test.dev' } })),
}))

vi.mock('./notification', () => ({
    notifyEnvEvent: (...args: unknown[]) => notifyEnvEvent(...args),
}))

// 引擎侧注入 upstreamId 字段；测试 fixtures 必须同步（否则 reconcileAlerts 防御性 TypeError）
// reconcile 模型下，upstreamId 跨测试持久化（in-memory DB 共享 beforeAll/afterAll），
// 使用 random 唯一化避免 occurrenceCount 跨测试污染（前面测试 INSERT 后本测试 reconcile 会 UPDATE）
let upstreamCounter = 0
const makeResult = (overrides: Record<string, unknown> = {}) => {
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
            upstreamId: `dependabot:${42 + upstreamCounter}`,
        }],
        ...overrides,
    }
}

describe('scan-orchestrator.service', () => {
    let repositoryId: string
    let credentialId: string

    const createRepo = async (overrides: Record<string, unknown> = {}) => {
        const suffix = Math.random().toString(36).slice(2, 8)
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: `app-${suffix}`,
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'container',
            credentialId,
            ...overrides,
        })) as { id: string }
        return created.id
    }

    beforeAll(async () => {
        setupMemoryDatabase()
        // 注：删除 `process.env.ENCRYPTION_KEY` 死代码；
        // stub 默认值由 `apps/platform/tests/setup-nuxt-server.ts:26` 全局 useRuntimeConfig 提供
        const ds = await ensureDatabaseInitialized()
        const cred = await ds.getRepository(Credential).save(ds.getRepository(Credential).create({
            name: 'github-pat',
            type: 'classic-pat',
            // encryptToken 参数用 stub 默认值（与 setup-nuxt-server.ts 一致），不再依赖 process.env
            encryptedToken: encryptToken('ghp_test-token', 'test-encryption-key-32-bytes!!'),
        }))
        credentialId = cred.id
        repositoryId = await createRepo()
    })

    afterAll(() => {
        teardownMemoryDatabase()
        // 注：删除 `delete process.env.ENCRYPTION_KEY` 死代码
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // 共享 mock 需重置实现，防止新用例漏设时静默复用上一用例行为
        // container.isAvailable 默认 true（多数用例关注 execute；环境不可用场景显式设 false）
        containerIsAvailable.mockReset()
        containerIsAvailable.mockResolvedValue(true)
        containerExecute.mockReset()
        sandboxExecute.mockReset()
        sandboxIsAvailable.mockReset()
        actionExecute.mockReset()
        fetcherFetch.mockReset()
        ContainerExecutorMock.mockReset()
        SandboxExecutorMock.mockReset()
        ActionTriggerExecutorMock.mockReset()
        ActionResultFetcherMock.mockReset()
    })

    describe('createPendingScanRun', () => {
        it('throws 404 when repository does not exist', async () => {
            await expectError(createPendingScanRun('nonexistent', { mode: 'fix', severityThreshold: 'high' }), 404)
        })

        it('creates pending run with resolved executor kind', async () => {
            const run = await createPendingScanRun(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run).toMatchObject({ status: 'pending', executorKind: 'container', startedAt: null })
            expect(run.id).toBeTruthy()
        })

        it('resolves github-action executor from explicit request', async () => {
            const run = await createPendingScanRun(repositoryId, { mode: 'report-only', severityThreshold: 'all', executorKind: 'github-action' })
            expect(run.executorKind).toBe('github-action')
        })

        it('resolves github-action from actionWorkflowFile automatically', async () => {
            const withAction = await createRepo({ actionWorkflowFile: '.github/workflows/fix.yml' })
            const run = await createPendingScanRun(withAction, { mode: 'report-only', severityThreshold: 'all' })
            expect(run.executorKind).toBe('github-action')
        })

        it('resolves sandbox executor from explicit request', async () => {
            const run = await createPendingScanRun(repositoryId, { mode: 'fix', severityThreshold: 'high', executorKind: 'sandbox' })
            expect(run.executorKind).toBe('sandbox')
        })
    })

    describe('runScanForRepository (container executor)', () => {
        it('throws 404 when repository does not exist', async () => {
            await expectError(
                runScanForRepository('nonexistent', { mode: 'fix', severityThreshold: 'high' }),
                404,
            )
        })

        it('completes with results and refreshes lastScanAt', async () => {
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(run.summaryJson).toContain('alertsTotal')
            expect(run.finishedAt).toBeTruthy()
            // 非失败终态不写失败分类三列
            expect(run.failureCode).toBeNull()
            expect(run.failureStage).toBeNull()
            expect(run.failureKind).toBeNull()

            // 结果明细落库
            const ds = await ensureDatabaseInitialized()
            const results = await ds.getRepository(ScanResult).find({ where: { scanRunId: run.id } })
            expect(results).toHaveLength(1)
            expect(results[0]?.packageName).toBe('lodash')

            const repo = await ds.getRepository(Repository).findOne({ where: { id: repositoryId } })
            expect(repo?.lastScanAt).toBeTruthy()
        })

        it('passes repository verifyCommands into executor context', async () => {
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })
            const withCommands = await createRepo({ verifyCommands: ['pnpm install --frozen-lockfile', 'pnpm test'] })

            await runScanForRepository(withCommands, { mode: 'fix', severityThreshold: 'high' })

            const ctx = containerExecute.mock.calls[0]![0] as { repository: { verifyCommands?: string[] } }
            expect(ctx.repository.verifyCommands).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
        })

        it('defaults repository verifyCommands to empty array when not configured', async () => {
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })

            const ctx = containerExecute.mock.calls[0]![0] as { repository: { verifyCommands?: string[] } }
            expect(ctx.repository.verifyCommands).toEqual([])
        })

        it('marks run failed when executor returns error', async () => {
            containerExecute.mockResolvedValue({ result: undefined, error: { code: 'exec_failed', message: '容器执行失败' } })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('exec_failed')
            // 失败分类落库：未映射码保留 code，阶段 / 处置建议归 unknown
            expect(run.failureCode).toBe('exec_failed')
            expect(run.failureStage).toBe('unknown')
            expect(run.failureKind).toBe('unknown')
        })

        it('persists partial summary snapshot when failed with engine result (alertsFound 如实 / alertsFixed 归零)', async () => {
            // engine_delivery_failed（COMMIT_FAILED）：result 存在但交付失败 → failed
            containerExecute.mockResolvedValue({
                result: makeResult({
                    summary: { alertsFound: 5, alertsFixed: 3 },
                    errors: [{ repository: 'demo/app', stage: 'fix', category: 'COMMIT_FAILED', message: 'git commit failed' }],
                }),
                error: undefined,
                exitCode: 2,
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            const summary = JSON.parse(String(run.summaryJson ?? '{}')) as Record<string, number>
            // 失败前已扫到的告警数如实落库；已修复归零（失败未交付，fixStatus 不可信）
            expect(summary.alertsFound).toBe(5)
            expect(summary.alertsFixed).toBe(0)
            // 仅快照：failed 分支不调用 reconcileAlerts，无告警明细写入
            const ds = await ensureDatabaseInitialized()
            const alerts = await ds.getRepository(ScanResult).find({ where: { scanRunId: run.id } })
            expect(alerts).toHaveLength(0)
        })

        it('persists summary snapshot when failed via exitCode=2 (no engine errors)', async () => {
            // 进程级兜底：exitCode=2 + result 存在且无 engine 交付失败 errors → failed
            containerExecute.mockResolvedValue({
                result: makeResult({ summary: { alertsFound: 2, alertsFixed: 1 } }),
                error: undefined,
                exitCode: 2,
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            const summary = JSON.parse(String(run.summaryJson ?? '{}')) as Record<string, number>
            expect(summary.alertsFound).toBe(2)
            expect(summary.alertsFixed).toBe(0)
        })

        it('captures runUrl from container executor (fix mode push succeed)', async () => {
            containerExecute.mockResolvedValue({
                result: makeResult(),
                error: undefined,
                runUrl: 'https://github.com/demo/app/tree/dependfix/auto-fix-abc12345',
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(run.runUrl).toBe('https://github.com/demo/app/tree/dependfix/auto-fix-abc12345')
        })

        it('captures push_failed error from container executor (no runUrl)', async () => {
            containerExecute.mockResolvedValue({
                result: undefined,
                error: { code: 'push_failed', message: '推送修复分支失败：Authentication failed' },
                runUrl: undefined,
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('push_failed')
            expect(run.runUrl).toBeNull()
            // push_failed 细分需看 message（网络 vs 权限），保守归 deliver + unknown
            expect(run.failureCode).toBe('push_failed')
            expect(run.failureStage).toBe('deliver')
            expect(run.failureKind).toBe('unknown')
        })

        it('marks dispatched when container pr_creation_failed (branch pushed, PR failed)', async () => {
            // A 模式 push 成功 + PR 失败 → dispatched + runUrl 兜底为 branch URL
            containerExecute.mockResolvedValue({
                result: undefined,
                error: { code: 'pr_creation_failed', message: '创建 PR 失败（分支已推送）：Validation Failed' },
                runUrl: 'https://github.com/demo/app/tree/dependfix/auto-fix-abc12345',
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('dispatched')
            expect(run.runUrl).toBe('https://github.com/demo/app/tree/dependfix/auto-fix-abc12345')
            expect(run.errorJson).toContain('pr_creation_failed')
            // dispatched（分支已推、PR 未建）计入失败分类：deliver + deterministic
            expect(run.failureStage).toBe('deliver')
            expect(run.failureKind).toBe('deterministic')
        })

        it('marks run failed with orchestration error when executor throws', async () => {
            containerExecute.mockRejectedValue(new Error('disk full'))

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('orchestration_failed')
            expect(run.errorJson).toContain('disk full')
            // 编排 catch-all 失败同样落分类：runtime + unknown
            expect(run.failureCode).toBe('orchestration_failed')
            expect(run.failureStage).toBe('runtime')
            expect(run.failureKind).toBe('unknown')
        })

        it('throws 404 when runId references missing run', async () => {
            await expectError(
                runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' }, { runId: 'missing-run' }),
                404,
            )
        })

        it('refuses to resume a run in terminal state', async () => {
            const ds = await ensureDatabaseInitialized()
            const terminal = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
                repositoryId,
                mode: 'fix',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'completed',
            }))
            await expect(
                runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' }, { runId: terminal.id }),
            ).rejects.toThrow(/已处于终态/)
        })

        /**
         * todo.md §M16.2 C66-D：reuse=true 时允许复用终态 run（用户主动复用，例如 report-only → fix）
         * 复用语义：reset finishedAt / errorJson / summaryJson / runUrl + 更新 mode / severityThreshold
         */
        it('reuses terminal run when reuse=true (report-only → fix)', async () => {
            const ds = await ensureDatabaseInitialized()
            const terminal = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
                repositoryId,
                mode: 'report-only',
                severityThreshold: 'medium',
                executorKind: 'container',
                status: 'completed',
                finishedAt: new Date('2026-08-12T00:01:00Z'),
                summaryJson: JSON.stringify({ alertsFound: 3 }),
                errorJson: null,
                runUrl: null,
                // 上次执行残留的失败分类（reuse 时应被清空）
                failureCode: 'VERIFICATION_FAILED',
                failureStage: 'verify',
                failureKind: 'deterministic',
            }))
            // seed 旧 ScanResult 模拟 report-only 模式留下的告警（per-alert 模型：
            // repositoryId / upstreamId / firstSeenAt / lastSeenAt / occurrenceCount 必填）
            const seededNow = new Date('2026-08-12T00:01:00Z')
            await ds.getRepository(ScanResult).save([
                ds.getRepository(ScanResult).create({
                    scanRunId: terminal.id,
                    repositoryId: terminal.repositoryId,
                    upstreamId: 'dependabot:1001',
                    source: 'dependabot',
                    severity: 'high',
                    packageName: 'lodash',
                    manifestPath: 'package.json',
                    ruleId: null,
                    summary: 'old report-only alert',
                    fixable: true,
                    fixStrategy: 'upgrade',
                    recommendedVersion: '4.18.0',
                    htmlUrl: null,
                    fixStatus: 'pending',
                    firstSeenAt: seededNow,
                    lastSeenAt: seededNow,
                    occurrenceCount: 1,
                    supersededAt: null,
                }),
                ds.getRepository(ScanResult).create({
                    scanRunId: terminal.id,
                    repositoryId: terminal.repositoryId,
                    upstreamId: 'dependabot:1002',
                    source: 'dependabot',
                    severity: 'critical',
                    packageName: 'axios',
                    manifestPath: 'package.json',
                    ruleId: null,
                    summary: 'old report-only alert 2',
                    fixable: true,
                    fixStrategy: 'upgrade',
                    recommendedVersion: '1.0.0',
                    htmlUrl: null,
                    fixStatus: 'pending',
                    firstSeenAt: seededNow,
                    lastSeenAt: seededNow,
                    occurrenceCount: 1,
                    supersededAt: null,
                }),
            ])
            // reuse 前旧 ScanResult 行数 = 2
            const beforeCount = await ds.getRepository(ScanResult).count({ where: { scanRunId: terminal.id } })
            expect(beforeCount).toBe(2)

            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })
            const result = await runScanForRepository(
                repositoryId,
                { mode: 'fix', severityThreshold: 'high' },
                { runId: terminal.id, reuse: true },
            )
            // 既有 record 续用，id 不变；status 升级为 completed（mock executor）；finishedAt 重置
            expect(result.id).toBe(terminal.id)
            expect(result.status).toBe('completed')
            expect(result.finishedAt).not.toEqual(terminal.finishedAt)
            // mode / severityThreshold 更新为本次请求
            expect(result.mode).toBe('fix')
            expect(result.severityThreshold).toBe('high')
            // summaryJson 由 executor 重写（已有 alertsFound=3 被覆盖为 mock 输出的 alertsTotal=1）
            const summary = JSON.parse(String(result.summaryJson ?? '{}')) as Record<string, unknown>
            expect(summary.alertsTotal).toBe(1)
            // errorJson 重置为 null
            expect(result.errorJson).toBeNull()
            // 失败分类三列随复用清空（不残留上次执行的 stage / kind）
            expect(result.failureCode).toBeNull()
            expect(result.failureStage).toBeNull()
            expect(result.failureKind).toBeNull()
            // M20.3 reconcile 行为（todo.md §M20.3 决策 1-4）：
            // - 新 alert（mock executor 输出 dependabot:<counter>）→ INSERT（scanRunId=terminal.id, occurrenceCount=1）
            // - 旧 2 条 alert（fixStatus=pending，未在新告警列表中）→ supersededAt=NOW()（仍保留行，scanRunId 仍指向 terminal）
            // 因此 scanRunId=terminal.id 的 ScanResult = 1 新 INSERT + 2 旧 superseded = 3 行
            const afterRows = await ds.getRepository(ScanResult).find({ where: { scanRunId: terminal.id } })
            expect(afterRows).toHaveLength(3)
            // 旧 alert "dependabot:1001" / "dependabot:1002" 已被 supersede（fixStatus=pending ≠ success，符合决策 1 语义）
            const supersededRows = afterRows.filter((r) => r.supersededAt !== null)
            expect(supersededRows.map((r) => r.upstreamId).sort()).toEqual(['dependabot:1001', 'dependabot:1002'])
            // 新 alert "dependabot:<counter>" 已 INSERT 且未被 supersede
            const expectedUpstreamId = `dependabot:${42 + upstreamCounter}`
            const newRow = afterRows.find((r) => r.upstreamId === expectedUpstreamId)
            expect(newRow).toBeDefined()
            expect(newRow?.fixStatus).toBe('not-tried')
            expect(newRow?.occurrenceCount).toBe(1)
            expect(newRow?.supersededAt).toBeNull()
        })

        it('resumes pending run by marking it running', async () => {
            const ds = await ensureDatabaseInitialized()
            const pending = await ds.getRepository(ScanRun).save(ds.getRepository(ScanRun).create({
                repositoryId,
                mode: 'fix',
                severityThreshold: 'high',
                executorKind: 'container',
                status: 'pending',
                startedAt: null,
            }))
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' }, { runId: pending.id })
            expect(run.id).toBe(pending.id)
            expect(run.status).toBe('completed')
        })
    })

    describe('runScanForRepository (sandbox executor)', () => {
        const sandboxRepo = async () => createRepo({ executorKind: 'sandbox' })

        it('runs sandbox executor when isAvailable() returns true', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(sandboxIsAvailable).toHaveBeenCalledTimes(1)
            expect(sandboxExecute).toHaveBeenCalledTimes(1)
            expect(containerExecute).not.toHaveBeenCalled()
        })

        it('marks degraded when sandbox isAvailable() returns false and ContainerExecutor fallback succeeds (A 场景)', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            // 避免降级路径上 sandbox 真实 isAvailable 探测抛错
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静默降级 warn */ })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            // T1005-C：启动时降级 → degraded（业务完整 + 路径偏离；区别于 B 场景运行时失败→failed）
            expect(run.status).toBe('degraded')
            expect(run.errorJson).toContain('sandbox_unavailable')
            expect(run.summaryJson).toContain('alertsTotal')
            expect(run.finishedAt).toBeTruthy()
            expect(sandboxIsAvailable).toHaveBeenCalledTimes(1)
            expect(sandboxExecute).not.toHaveBeenCalled()
            expect(containerExecute).toHaveBeenCalledTimes(1)
            expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[sandbox]'))
            expect(warnSpy.mock.calls[0]?.[0]).toContain('daemon unavailable')
            expect(warnSpy.mock.calls[0]?.[0]).toContain('falling back to container')

            warnSpy.mockRestore()
        })

        it('preserves runUrl from ContainerExecutor fallback in degraded state (fix mode push succeed)', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({
                result: makeResult(),
                error: undefined,
                runUrl: 'https://github.com/demo/app/tree/dependfix/auto-fix-abc12345',
            })

            vi.spyOn(console, 'warn').mockImplementation(() => { /* 静默 */ })

            const run = await runScanForRepository(repoId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('degraded')
            expect(run.runUrl).toBe('https://github.com/demo/app/tree/dependfix/auto-fix-abc12345')
            expect(run.errorJson).toContain('sandbox_unavailable')
        })

        it('persists logsJson from ContainerExecutor fallback in degraded state (回退路径可见执行日志)', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({
                result: makeResult(),
                error: undefined,
                logsJson: JSON.stringify({ logs: ['[container] fallback log line'] }),
            })

            vi.spyOn(console, 'warn').mockImplementation(() => { /* 静默降级 warn */ })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('degraded')
            // 回退路径与 container 主路由同口径落 logsJson，degraded run 在「运行日志」入口可见
            expect(run.logsJson).toContain('fallback log line')
            expect(containerExecute).toHaveBeenCalledTimes(1)
        })

        it('propagates sandbox_unavailable error from sandbox.execute (runtime failure, no fallback)', async () => {
            // 运行时偶发故障：isAvailable() 通过 → sandbox.execute() 失败（sandbox_unavailable）
            // 此场景不静默降级（避免掩盖真实错误）—— 标记 failed
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({
                result: undefined,
                error: { code: 'sandbox_unavailable', message: 'docker daemon stopped during scan' },
            })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('sandbox_unavailable')
            expect(containerExecute).not.toHaveBeenCalled()
        })

        it('passes repository.sandboxLimits to SandboxExecutor (透传)', async () => {
            // 仓库级 sandboxLimits 透传到 SandboxExecutor 实例化选项
            // 限额优先级：仓库级 > 沙箱级 > 平台默认（sandbox-executor.ts:107）
            const repoId = await createRepo({
                executorKind: 'sandbox',
                sandboxLimits: { memoryMb: 4096, cpu: 2.0 },
            })
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            // SandboxExecutor 构造函数收到的第二参数应包含 sandboxLimits
            expect(SandboxExecutorMock).toHaveBeenCalledTimes(1)
            const options = SandboxExecutorMock.mock.calls[0]?.[0] as { workRoot?: string, sandboxLimits?: { memoryMb?: number, cpu?: number } }
            expect(options.sandboxLimits).toEqual({ memoryMb: 4096, cpu: 2.0 })
        })

        it('passes undefined sandboxLimits when repository has none (走平台 SANDBOX_DEFAULTS)', async () => {
            // 仓库级 sandboxLimits 缺省 → parseSandboxLimits 返回 undefined
            // SandboxExecutor 收到 undefined → 走 sandbox-executor.ts:61 `?? {}` → 内部 spec 不带限额
            // runtime-adapter.ts:180 走 `?? SANDBOX_DEFAULTS.memoryMb` 平台默认
            const repoId = await createRepo({
                executorKind: 'sandbox',
                // 不带 sandboxLimits 字段
            })
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(SandboxExecutorMock).toHaveBeenCalledTimes(1)
            const options = SandboxExecutorMock.mock.calls[0]?.[0] as { sandboxLimits?: unknown }
            expect(options.sandboxLimits).toBeUndefined()
        })

        it('passes partial sandboxLimits (only memoryMb)', async () => {
            // 部分字段：cpu 缺省 → parseSandboxLimits 返回 { memoryMb: 4096 }（仅 memoryMb）
            // SandboxExecutor 收到 options 后 buildSpec 时 cpu=undefined → runtime-adapter 走 SANDBOX_DEFAULTS.cpu
            const repoId = await createRepo({
                executorKind: 'sandbox',
                sandboxLimits: { memoryMb: 8192 },
            })
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            const options = SandboxExecutorMock.mock.calls[0]?.[0] as { sandboxLimits?: { memoryMb?: number, cpu?: number } }
            expect(options.sandboxLimits).toEqual({ memoryMb: 8192 })
            expect(options.sandboxLimits?.cpu).toBeUndefined()
        })
    })

    describe('runScanForRepository (github-action executor)', () => {
        const actionRepo = async () => createRepo({
            executorKind: 'github-action',
            actionWorkflowFile: '.github/workflows/fix.yml',
        })

        it('marks failed when action trigger fails', async () => {
            const repoId = await actionRepo()
            actionExecute.mockResolvedValue({ result: undefined, error: { code: 'workflow_missing', message: '无 workflow' }, runId: null, runUrl: null })

            const run = await runScanForRepository(repoId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('workflow_missing')
        })

        it('marks dispatched when trigger succeeds but result fetch fails', async () => {
            const repoId = await actionRepo()
            actionExecute.mockResolvedValue({ result: undefined, error: undefined, runId: 'run-123', runUrl: 'https://github.com/demo/app/actions/runs/123' })
            fetcherFetch.mockRejectedValue(new Error('fetch timeout'))

            const run = await runScanForRepository(repoId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('dispatched')
            expect(run.runUrl).toBe('https://github.com/demo/app/actions/runs/123')
            expect(run.errorJson).toContain('result_fetch_failed')
        })

        it('completes with fetched results when action run finishes', async () => {
            const repoId = await actionRepo()
            actionExecute.mockResolvedValue({ result: undefined, error: undefined, runId: 'run-456', runUrl: null })
            fetcherFetch.mockResolvedValue(makeResult())

            const run = await runScanForRepository(repoId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(run.summaryJson).toContain('alertsTotal')
        })
    })

    // 跨模块集成测试——scan A/B 场景 → audit_event 落库 + notify 触发
    describe('scan → audit_event + notify 集成', () => {
        // sandboxRepo 每次返回新 name（避免 Repository 列级复合 unique 索引 bug 导致第二次 insert 冲突）
        let sandboxCounter = 0
        const sandboxRepo = async (): Promise<string> => {
            sandboxCounter += 1
            const ds = await ensureDatabaseInitialized()
            const repo = ds.getRepository(Repository).create({
                owner: 'demo',
                name: `sandbox-app-${sandboxCounter}`,
                platform: 'github',
                packageManager: 'pnpm',
                defaultBranch: 'main',
                executorKind: 'sandbox',
            })
            await ds.getRepository(Repository).save(repo)
            return repo.id
        }

        beforeEach(() => {
            notifyEnvEvent.mockResolvedValue(undefined)
        })

        it('A 场景 sandbox.isAvailable()=false → audit_event sandbox_degraded 落库 + notify 触发', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined, runUrl: 'https://github.com/demo/sandbox-app/tree/dependfix-fix-xxx' })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('degraded')

            // 验证 audit_event 落库
            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({
                where: { scanRunId: run.id },
            })
            expect(events).toHaveLength(1)
            expect(events[0]?.type).toBe('sandbox_degraded')
            expect(events[0]?.severity).toBe('warn')
            expect(events[0]?.notified).toBe(false) // notify 触发后由 channel 异步更新
            // payload 应包含 degradedReason + fallback
            const payload = JSON.parse(events[0]?.payloadJson ?? '{}') as Record<string, unknown>
            expect(payload.degradedReason).toMatchObject({ code: 'sandbox_unavailable' })
            expect(payload.fallback).toBe('container')

            // 验证 notify 触发（fire-and-forget，所以 .catch 不抛错就视为触发）
            expect(notifyEnvEvent).toHaveBeenCalledOnce()
        })

        it('B 场景 sandbox.execute 抛 sandbox_unavailable → audit_event sandbox_unavailable 落库 + notify 触发', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({
                result: undefined,
                error: { code: 'sandbox_unavailable', message: 'docker daemon stopped during scan' },
            })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')

            // 验证 audit_event 落库（B 场景）
            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({
                where: { scanRunId: run.id },
            })
            expect(events).toHaveLength(1)
            expect(events[0]?.type).toBe('sandbox_unavailable')
            expect(events[0]?.severity).toBe('error')
            const payload = JSON.parse(events[0]?.payloadJson ?? '{}') as Record<string, unknown>
            // payload 应包含 errno + message（B 场景补 code/adapter）
            expect(payload.errno).toBe('sandbox_unavailable')
            expect(payload.message).toContain('docker daemon')

            // 验证 notify 触发
            expect(notifyEnvEvent).toHaveBeenCalledOnce()
        })

        it('A 场景降级目标 container 亦不可用 → audit_event container_unavailable 落库（不落 sandbox_degraded）', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerIsAvailable.mockResolvedValue(false)

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('container_unavailable')
            // 降级目标环境不可用 → 不进入 execute
            expect(containerExecute).not.toHaveBeenCalled()

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({ where: { scanRunId: run.id } })
            expect(events).toHaveLength(1)
            // 根因为 container 环境不可用（而非 sandbox 降级）
            expect(events[0]?.type).toBe('container_unavailable')
            expect(events[0]?.severity).toBe('error')
            expect(notifyEnvEvent).toHaveBeenCalledOnce()
        })

        it('C 场景 container.isAvailable()=false → audit_event container_unavailable 落库 + notify 触发 + run failed', async () => {
            const repoId = await createRepo()
            containerIsAvailable.mockResolvedValue(false)

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('container_unavailable')
            // 环境不可用 → 不进入 execute（避免以 execution_failed 掩盖环境根因）
            expect(containerExecute).not.toHaveBeenCalled()
            // 失败分类落 runtime / transient
            expect(run.failureCode).toBe('container_unavailable')
            expect(run.failureStage).toBe('runtime')
            expect(run.failureKind).toBe('transient')

            // 验证 audit_event 落库（C 场景）
            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({
                where: { scanRunId: run.id },
            })
            expect(events).toHaveLength(1)
            expect(events[0]?.type).toBe('container_unavailable')
            expect(events[0]?.severity).toBe('error')
            const payload = JSON.parse(events[0]?.payloadJson ?? '{}') as Record<string, unknown>
            expect(payload.code).toBe('container_unavailable')
            expect(payload.executor).toBe('container')
            expect(String(payload.message)).toContain('工作根')

            // 验证 notify 触发
            expect(notifyEnvEvent).toHaveBeenCalledOnce()
        })

        it('正常完成（无降级 / 无错误）不写 audit_event，不触发 notify', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(true)
            sandboxExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('completed')

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({
                where: { scanRunId: run.id },
            })
            expect(events).toHaveLength(0)
            expect(notifyEnvEvent).not.toHaveBeenCalled()
        })

        it('notifyEnvEvent 失败不阻塞扫描主流程（fire-and-forget）', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })
            // 模拟 notify 抛出异常
            notifyEnvEvent.mockRejectedValue(new Error('notification service down'))

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            // 扫描仍正常完成（degraded 状态，notify 失败仅日志）
            expect(run.status).toBe('degraded')

            // 验证 audit_event 仍落库（即使 notify 失败）
            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({
                where: { scanRunId: run.id },
            })
            expect(events).toHaveLength(1)
            expect(events[0]?.type).toBe('sandbox_degraded')
        })
    })
})
