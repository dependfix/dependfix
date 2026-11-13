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
const { ContainerExecutorMock, SandboxExecutorMock, ActionTriggerExecutorMock, ActionResultFetcherMock, containerIsAvailable, containerExecute, sandboxIsAvailable, sandboxExecute, actionExecute, fetcherFetch, notifyEnvEvent } = vi.hoisted(() => ({
    ContainerExecutorMock: vi.fn(),
    SandboxExecutorMock: vi.fn(),
    ActionTriggerExecutorMock: vi.fn(),
    ActionResultFetcherMock: vi.fn(),
    containerIsAvailable: vi.fn(),
    containerExecute: vi.fn(),
    sandboxIsAvailable: vi.fn(),
    sandboxExecute: vi.fn(),
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

/** 复用 repos API 创建仓库（guard 走 mock）；放在 describe 外避免单测函数体超行数上限。 */
const createRepoForTest = async (credentialId: string, overrides: Record<string, unknown> = {}) => {
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

describe('scan-orchestrator.service', () => {
    let repositoryId: string
    let credentialId: string

    const createRepo = (overrides: Record<string, unknown> = {}) => createRepoForTest(credentialId, overrides)

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
        sandboxIsAvailable.mockReset()
        sandboxIsAvailable.mockResolvedValue(true)
        sandboxExecute.mockReset()
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

        it('persists triggeredByUserId for notification routing', async () => {
            const run = await createPendingScanRun(
                repositoryId,
                { mode: 'fix', severityThreshold: 'high' },
                { triggeredByUserId: 'user-1' },
            )
            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
            expect(persisted?.triggeredByUserId).toBe('user-1')
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

        it('stores sandbox for legacy data (public scan schema rejects new explicit sandbox)', async () => {
            const run = await createPendingScanRun(repositoryId, { mode: 'fix', severityThreshold: 'high', executorKind: 'sandbox' })
            expect(run.executorKind).toBe('sandbox')
        })

        // 「受约束重试入口」来源落库（口径见 docs/design/governance/run-failure-taxonomy.md §5.5）：
        // 断言到 DB 列，避免只钉住调用参数而漏掉「服务层是否真的写库」
        it('persists retriedFromRunId when provided', async () => {
            const run = await createPendingScanRun(
                repositoryId,
                { mode: 'fix', severityThreshold: 'high' },
                { retriedFromRunId: 'source-run-1' },
            )

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
            expect(persisted?.retriedFromRunId).toBe('source-run-1')
        })

        it('leaves retriedFromRunId null for non-retry triggers', async () => {
            const run = await createPendingScanRun(repositoryId, { mode: 'fix', severityThreshold: 'high' })

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
            expect(persisted?.retriedFromRunId ?? null).toBeNull()
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

        it('persists exitCode and environmental failure count as queryable outcome facts', async () => {
            containerExecute.mockResolvedValue({
                result: makeResult({ summary: { alertsFound: 3, alertsFixed: 1, environmentalFailures: 2 } }),
                error: undefined,
                exitCode: 1,
                resource: {
                    memoryMaxBytes: 8 * 1024 ** 3,
                    peakRssBytes: 6 * 1024 ** 3,
                    oomKilled: true,
                    source: 'cgroup-v2',
                    samples: 3,
                },
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(run.exitCode).toBe(1)
            expect(run.environmentalFailureCount).toBe(2)

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
            expect(persisted?.exitCode).toBe(1)
            expect(persisted?.environmentalFailureCount).toBe(2)
            expect(persisted).toMatchObject({
                memoryMaxBytes: 8 * 1024 ** 3,
                peakRssBytes: 6 * 1024 ** 3,
                oomKilled: true,
            })
            expect(JSON.parse(persisted?.resourceJson ?? '{}')).toMatchObject({ source: 'cgroup-v2', samples: 3 })
        })

        it('keeps outcome columns null for a failed run without result', async () => {
            containerExecute.mockResolvedValue({
                result: undefined,
                error: { code: 'execution_timeout', message: '执行超时' },
                // 真实执行器在无 result 的执行级失败时返回合成码 2；不得落库为引擎进程码
                exitCode: 2,
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.exitCode).toBeNull()
            expect(run.environmentalFailureCount).toBeNull()
            expect(run.memoryMaxBytes).toBeNull()
            expect(run.peakRssBytes).toBeNull()
            expect(run.oomKilled).toBeNull()
            expect(JSON.parse(run.resourceJson ?? '{}')).toMatchObject({
                source: 'none',
                degradedReason: 'container executor did not return resource usage',
            })
            // 超时分类保留（UI「结果缺失」不覆盖失败归因）
            expect(run.failureCode).toBe('execution_timeout')
            expect(run.failureStage).toBe('runtime')
        })

        it('clears outcome columns when reusing a terminal run for a new execution', async () => {
            containerExecute.mockResolvedValue({
                result: makeResult({ summary: { alertsFound: 1, environmentalFailures: 4 } }),
                error: undefined,
                exitCode: 1,
            })
            const first = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(first.environmentalFailureCount).toBe(4)

            const ds = await ensureDatabaseInitialized()
            const runRepo = ds.getRepository(ScanRun)
            const terminal = await runRepo.findOne({ where: { id: first.id } })
            expect(terminal).not.toBeNull()
            terminal!.status = 'completed'
            terminal!.finishedAt = new Date()
            await runRepo.save(terminal!)

            // 复用后、执行 outcome 写入前抛错 → 只有 reuse 分支的清空能让旧值不残留；
            // 若删掉清空逻辑，catch-all 保存会把上一次的 exitCode/count 带到新执行。
            containerExecute.mockRejectedValue(new Error('executor exploded'))
            const second = await runScanForRepository(
                repositoryId,
                { mode: 'fix', severityThreshold: 'high' },
                { runId: first.id, reuse: true },
            )
            expect(second.id).toBe(first.id)
            expect(second.status).toBe('failed')
            expect(second.exitCode).toBeNull()
            expect(second.environmentalFailureCount).toBeNull()
        })

        // 同步新建路径同样落「重试来源」；runId 续用（worker / 队列续跑）不得覆写历史来源
        it('persists retriedFromRunId on the synchronously created run', async () => {
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(
                repositoryId,
                { mode: 'fix', severityThreshold: 'high' },
                { retriedFromRunId: 'source-run-2' },
            )

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: run.id } })
            expect(persisted?.retriedFromRunId).toBe('source-run-2')
        })

        it('does not overwrite the existing retry source when continuing an existing run', async () => {
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })
            const created = await createPendingScanRun(
                repositoryId,
                { mode: 'fix', severityThreshold: 'high' },
                { retriedFromRunId: 'source-run-3' },
            )

            await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' }, { runId: created.id })

            const ds = await ensureDatabaseInitialized()
            const persisted = await ds.getRepository(ScanRun).findOne({ where: { id: created.id } })
            expect(persisted?.retriedFromRunId).toBe('source-run-3')
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
                    summary: { alertsFound: 5, alertsFixed: 3, alertsConverged: 1, alertsUnfixed: 2, environmentalFailures: 2 },
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
            // 失败未交付：未修复数按 found − converged 重算，不能沿用引擎内存值
            expect(summary.alertsUnfixed).toBe(4)
            // 环境性失败计数随 summary 快照保留（失败未交付也不丢可见性）
            expect(summary.environmentalFailures).toBe(2)
            // 仅快照：failed 分支不调用 reconcileAlerts，无告警明细写入
            const ds = await ensureDatabaseInitialized()
            const alerts = await ds.getRepository(ScanResult).find({ where: { scanRunId: run.id } })
            expect(alerts).toHaveLength(0)
        })

        it('persists summary snapshot when failed via exitCode=2 (no engine errors)', async () => {
            // 进程级兜底：exitCode=2 + result 存在且无 engine 交付失败 errors → failed
            containerExecute.mockResolvedValue({
                result: makeResult({ summary: { alertsFound: 2, alertsFixed: 1, alertsUnfixed: 1 } }),
                error: undefined,
                exitCode: 2,
            })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            const summary = JSON.parse(String(run.summaryJson ?? '{}')) as Record<string, number>
            expect(summary.alertsFound).toBe(2)
            expect(summary.alertsFixed).toBe(0)
            expect(summary.alertsUnfixed).toBe(2)
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
            expect(run.memoryMaxBytes).toBeNull()
            expect(run.peakRssBytes).toBeNull()
            expect(run.oomKilled).toBeNull()
            expect(JSON.parse(run.resourceJson ?? '{}')).toMatchObject({
                source: 'none',
                degradedReason: 'orchestration failed before resource snapshot',
            })
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

    describe('runScanForRepository (sandbox → container policy fallback)', () => {
        const sandboxRepo = async () => createRepo({ executorKind: 'sandbox' })

        it('report-only + sandbox available → executes sandbox and completes', async () => {
            const repoId = await sandboxRepo()
            sandboxExecute.mockResolvedValue({
                exitCode: 0,
                result: makeResult(),
                error: undefined,
                logsJson: JSON.stringify([{ timestamp: new Date().toISOString(), level: 'info', message: 'sandbox log line' }]),
            })

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(run.executorKind).toBe('sandbox')
            expect(run.summaryJson).toContain('alertsTotal')
            expect(run.logsJson).toContain('sandbox log line')
            expect(sandboxExecute).toHaveBeenCalledTimes(1)
            expect(containerExecute).not.toHaveBeenCalled()
        })
        it('report-only + sandbox unavailable → degraded sandbox_unavailable with container fallback', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
            expect(run.status).toBe('degraded')
            expect(run.errorJson).toContain('sandbox_unavailable')
            expect(run.errorJson).not.toContain('sandbox_entry_disabled')
            expect(run.summaryJson).toContain('alertsTotal')
            expect(containerExecute).toHaveBeenCalledTimes(1)
            expect(sandboxExecute).not.toHaveBeenCalled()
        })

        it('fix-and-pr + sandbox available → executes inside the sandbox (no container fallback)', async () => {
            const repoId = await sandboxRepo()
            sandboxExecute.mockResolvedValue({ exitCode: 0, result: makeResult() })

            const run = await runScanForRepository(repoId, { mode: 'fix-and-pr', severityThreshold: 'high' })
            expect(run.status).toBe('completed')
            expect(sandboxExecute).toHaveBeenCalledTimes(1)
            expect(containerExecute).not.toHaveBeenCalled()
        })
        it('fix + sandbox available but egress audit disabled → executor gate rejects (no fallback)', async () => {
            const repoId = await sandboxRepo()
            // 执行器第二道闸的返回形态（策略关闭时拒绝执行且不 clone）
            sandboxExecute.mockResolvedValue({
                exitCode: 2,
                error: { code: 'sandbox_fix_requires_egress_policy', message: 'egress policy missing' },
            })
            vi.stubEnv('DEPENDFIX_NETWORK_AUDIT', 'false')
            try {
                const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
                expect(run.status).toBe('failed')
                expect(run.errorJson).toContain('sandbox_fix_requires_egress_policy')
                expect(containerExecute).not.toHaveBeenCalled()
            } finally {
                vi.unstubAllEnvs()
            }
        })

        it('persists logsJson from container fallback in degraded state', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({
                result: makeResult(),
                error: undefined,
                logsJson: JSON.stringify({ logs: ['[container] fallback log line'] }),
            })

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
            expect(run.status).toBe('degraded')
            expect(run.logsJson).toContain('fallback log line')
            expect(containerExecute).toHaveBeenCalledTimes(1)
        })

        it('fails with container_unavailable when fallback target is unavailable', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerIsAvailable.mockResolvedValue(false)

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('container_unavailable')
            expect(containerExecute).not.toHaveBeenCalled()
        })

        it('sandbox runtime errno → failed sandbox_unavailable (no silent fallback)', async () => {
            const repoId = await sandboxRepo()
            sandboxExecute.mockResolvedValue({
                exitCode: 2,
                error: { code: 'sandbox_unavailable', message: 'docker daemon ECONNREFUSED' },
            })

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('sandbox_unavailable')
            expect(containerExecute).not.toHaveBeenCalled()
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
        const sandboxRepo = (): Promise<string> => createRepo({ executorKind: 'sandbox' })

        beforeEach(() => {
            notifyEnvEvent.mockResolvedValue(undefined)
        })

        it('fix 模式 sandbox 可用 → 不产生 sandbox_degraded 事件（不再降级 container）', async () => {
            const repoId = await sandboxRepo()
            sandboxExecute.mockResolvedValue({ exitCode: 0, result: makeResult() })

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('completed')

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({ where: { scanRunId: run.id } })
            expect(events).toHaveLength(0)
            expect(notifyEnvEvent).not.toHaveBeenCalled()
        })

        it('report-only sandbox 启动不可用 → audit_event sandbox_degraded + notify 触发', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
            expect(run.status).toBe('degraded')

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({ where: { scanRunId: run.id } })
            expect(events).toHaveLength(1)
            expect(events[0]?.type).toBe('sandbox_degraded')
            const payload = JSON.parse(events[0]?.payloadJson ?? '{}') as Record<string, unknown>
            expect(payload.degradedReason).toMatchObject({ code: 'sandbox_unavailable' })
            expect(payload.notificationSuppressed).toBe(false)
            expect(notifyEnvEvent).toHaveBeenCalledOnce()
        })

        it('降级目标 container 亦不可用 → audit_event container_unavailable 落库（不落 sandbox_degraded）', async () => {
            const repoId = await sandboxRepo()
            sandboxIsAvailable.mockResolvedValue(false)
            containerIsAvailable.mockResolvedValue(false)

            const run = await runScanForRepository(repoId, { mode: 'report-only', severityThreshold: 'high' })
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

            expect(notifyEnvEvent).toHaveBeenCalledOnce()
        })

        it('正常完成（无降级 / 无错误）不写 audit_event，不触发 notify', async () => {
            const repoId = await createRepo()
            containerExecute.mockResolvedValue({ result: makeResult(), error: undefined })

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
            const repoId = await createRepo()
            containerIsAvailable.mockResolvedValue(false)
            // 模拟 notify 抛出异常
            notifyEnvEvent.mockRejectedValue(new Error('notification service down'))

            const run = await runScanForRepository(repoId, { mode: 'fix', severityThreshold: 'high' })
            // 容器环境不可用 → failed；notify 失败仅日志，不影响落库
            expect(run.status).toBe('failed')

            const ds = await ensureDatabaseInitialized()
            const events = await ds.getRepository(AuditEvent).find({
                where: { scanRunId: run.id },
            })
            expect(events).toHaveLength(1)
            expect(events[0]?.type).toBe('container_unavailable')
        })
    })
})

describe('scan-orchestrator 出站策略拒绝的审计事件', () => {
    let repositoryId: string

    beforeAll(async () => {
        setupMemoryDatabase()
        const created = await reposIndexHandler(makeEvent('POST', '/api/repos', {
            owner: 'demo',
            name: `egress-blocked-${Math.random().toString(36).slice(2, 8)}`,
            platform: 'github',
            packageManager: 'pnpm',
            defaultBranch: 'main',
            executorKind: 'sandbox',
        })) as { id: string }
        repositoryId = created.id
    })

    afterAll(() => {
        teardownMemoryDatabase()
    })

    beforeEach(() => {
        vi.clearAllMocks()
        sandboxIsAvailable.mockResolvedValue(true)
        notifyEnvEvent.mockResolvedValue(undefined)
    })

    it('clone 基地址未命中白名单 → 同样落 sandbox_egress_blocked 且不通知', async () => {
        sandboxExecute.mockResolvedValue({
            exitCode: 2,
            error: { code: 'sandbox_clone_host_not_allowed', message: 'clone base not allowlisted' },
        })

        const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
        expect(run.status).toBe('failed')

        const ds = await ensureDatabaseInitialized()
        const events = await ds.getRepository(AuditEvent).find({ where: { scanRunId: run.id } })
        expect(events).toHaveLength(1)
        expect(events[0]?.type).toBe('sandbox_egress_blocked')
        const payload = JSON.parse(events[0]?.payloadJson ?? '{}') as Record<string, unknown>
        expect(payload).toMatchObject({
            code: 'sandbox_clone_host_not_allowed',
            fallback: 'none',
            notificationSuppressed: true,
        })
        expect(notifyEnvEvent).not.toHaveBeenCalled()
    })

    it('策略缺失（执行器拒绝）→ sandbox_egress_blocked 事件落库且不通知', async () => {
        sandboxExecute.mockResolvedValue({
            exitCode: 2,
            error: { code: 'sandbox_fix_requires_egress_policy', message: 'egress policy missing' },
        })

        const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
        expect(run.status).toBe('failed')

        const ds = await ensureDatabaseInitialized()
        const events = await ds.getRepository(AuditEvent).find({ where: { scanRunId: run.id } })
        expect(events).toHaveLength(1)
        expect(events[0]?.type).toBe('sandbox_egress_blocked')
        const payload = JSON.parse(events[0]?.payloadJson ?? '{}') as Record<string, unknown>
        expect(payload).toMatchObject({
            code: 'sandbox_fix_requires_egress_policy',
            fallback: 'none',
            notificationSuppressed: true,
        })
        expect(notifyEnvEvent).not.toHaveBeenCalled()
    })
})
