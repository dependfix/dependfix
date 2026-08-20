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

// 外部执行器 mock（真实执行会跑引擎/触发 GitHub Action）
// class 实例的 execute/fetch 字段指向共享 mock（实例在 runScanForRepository 执行时才创建，
// 测试须在调用前即可设置行为）
const { ContainerExecutorMock, SandboxExecutorMock, ActionTriggerExecutorMock, ActionResultFetcherMock, containerExecute, sandboxExecute, sandboxIsAvailable, actionExecute, fetcherFetch } = vi.hoisted(() => ({
    ContainerExecutorMock: vi.fn(),
    SandboxExecutorMock: vi.fn(),
    ActionTriggerExecutorMock: vi.fn(),
    ActionResultFetcherMock: vi.fn(),
    containerExecute: vi.fn(),
    sandboxExecute: vi.fn(),
    sandboxIsAvailable: vi.fn(),
    actionExecute: vi.fn(),
    fetcherFetch: vi.fn(),
}))
vi.mock('./executor/container-executor', () => ({
    ContainerExecutor: class {
        constructor(...args: unknown[]) {
            ContainerExecutorMock(...args)
        }

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
    requireOrgResource: vi.fn(async () => undefined),
}))

const makeResult = (overrides: Record<string, unknown> = {}) => ({
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
    }],
    ...overrides,
})

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
        process.env.ENCRYPTION_KEY = 'test-encryption-key-32-bytes!!'
        const ds = await ensureDatabaseInitialized()
        const cred = await ds.getRepository(Credential).save(ds.getRepository(Credential).create({
            name: 'github-pat',
            type: 'classic-pat',
            encryptedToken: encryptToken('ghp_test-token', process.env.ENCRYPTION_KEY),
        }))
        credentialId = cred.id
        repositoryId = await createRepo()
    })

    afterAll(() => {
        teardownMemoryDatabase()
        delete process.env.ENCRYPTION_KEY
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // 共享 mock 需重置实现，防止新用例漏设时静默复用上一用例行为
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

            // 结果明细落库
            const ds = await ensureDatabaseInitialized()
            const results = await ds.getRepository(ScanResult).find({ where: { scanRunId: run.id } })
            expect(results).toHaveLength(1)
            expect(results[0]?.packageName).toBe('lodash')

            const repo = await ds.getRepository(Repository).findOne({ where: { id: repositoryId } })
            expect(repo?.lastScanAt).toBeTruthy()
        })

        it('marks run failed when executor returns error', async () => {
            containerExecute.mockResolvedValue({ result: undefined, error: { code: 'exec_failed', message: '容器执行失败' } })

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('exec_failed')
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
        })

        it('marks run failed with orchestration error when executor throws', async () => {
            containerExecute.mockRejectedValue(new Error('disk full'))

            const run = await runScanForRepository(repositoryId, { mode: 'fix', severityThreshold: 'high' })
            expect(run.status).toBe('failed')
            expect(run.errorJson).toContain('orchestration_failed')
            expect(run.errorJson).toContain('disk full')
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

        it('passes repository.sandboxLimits to SandboxExecutor (M11 T1005-B 透传)', async () => {
            // M11 T1005-B：仓库级 sandboxLimits 透传到 SandboxExecutor 实例化选项
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
            // M11 T1005-B：仓库级 sandboxLimits 缺省 → parseSandboxLimits 返回 undefined
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
})
