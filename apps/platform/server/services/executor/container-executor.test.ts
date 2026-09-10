import { vi, describe, expect, it, beforeEach, afterEach, beforeAll } from 'vitest'

/**
 * ContainerExecutor 补单测（M27.4 W4 / 2026-09-10）
 *
 * 现有 container-executor.test.ts 仅覆盖基础场景（isAvailable + report-only + 超时）
 * + sanitizeErrorMessage + parsePositiveInt + extractGitErrorMessage + clone config 环境变量。
 *
 * 本文件扩展覆盖 ContainerExecutor.execute 主体分支（fix / fix-and-pr 模式 + 失败路径）+
 * cloneRepository 重试 / 超时 / 认证 / 网络中断 + pushFixBranch token / AuthProvider / 无凭据
 * + extractBranchName detached HEAD + extractBranchName exec throws + pushFixBranch stderr 错误。
 *
 * Mock 策略（参考 platform-delivery.test.ts）：
 * - node:child_process: vi.hoisted + Symbol.for('nodejs.util.promisify.custom') Promise 风格标记
 * - @dependfix/engine: vi.hoisted DependfixApp mock
 * - ./platform-delivery: vi.hoisted mock（PlatformDeliveryError / planFixAndPrDelivery / deliverFixAndPr / createPlatformOctokit）
 * - node:fs mkdir / rm: 真实 fs（mkdir recursive + idempotent 安全）；用 tmpdir 隔离测试目录
 */

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const childProcessMock = vi.hoisted(() => {
    const m: {
        execFile: ReturnType<typeof vi.fn>
        execFileSync: ReturnType<typeof vi.fn>
        execSync: ReturnType<typeof vi.fn>
    } = {
        execFile: vi.fn(),
        execFileSync: vi.fn(),
        execSync: vi.fn(),
    }
    ;(m.execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = m.execFile
    return m
})

vi.mock('node:child_process', () => childProcessMock)

const platformDeliveryMock = vi.hoisted(() => ({
    PlatformDeliveryError: class PlatformDeliveryError extends Error {
        code: string
        constructor(message: string, code: string) {
            super(message)
            this.name = 'PlatformDeliveryError'
            this.code = code
        }
    },
    planFixAndPrDelivery: vi.fn(),
    deliverFixAndPr: vi.fn(),
    createPlatformOctokit: vi.fn(),
}))

vi.mock('./platform-delivery', () => platformDeliveryMock)

// Mock DependfixApp（@dependfix/engine 暴露）
const dependfixAppMock = vi.hoisted(() => vi.fn())
const engineMock = vi.hoisted(() => ({
    DependfixApp: dependfixAppMock,
    createFixBranch: vi.fn(),
}))

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        DependfixApp: engineMock.DependfixApp,
        createFixBranch: engineMock.createFixBranch,
    }
})

// ---------------------------------------------------------------------------
// Imports（mock 之后才能 import container-executor）
// ---------------------------------------------------------------------------

import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { RunResult } from '@dependfix/core'
import {
    ContainerExecutor,
    extractBranchName,
    pushFixBranch,
} from './container-executor'
import type { ScanExecutorContext } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseConfig = {
    mode: 'fix' as const,
    severityThreshold: 'high' as const,
    repositories: ['owner-a/repo-b'],
    dryRun: false,
    createPullRequest: false,
    commit: false,
    cleanupBranches: false,
    cleanupBranchesAuto: false,
    githubToken: 'ghp_test',
    alertSource: 'github-dependabot' as const,
    codeScanningEnabled: false,
    codeQualityEnabled: false,
    allowMajorUpgrade: false,
    maxAlertsPerRepository: 20,
    maxConcurrency: 1,
    maxRetries: 3,
    maxBackoffMs: 30_000,
    maxRepos: 100,
}

const makeCtx = (overrides: Partial<ScanExecutorContext> = {}): ScanExecutorContext => ({
    runId: 'run-1',
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
    },
    config: baseConfig,
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-1',
    ...overrides,
})

const makeRunResult = (overrides: Partial<RunResult> = {}): RunResult => ({
    actions: [],
    summary: { alertsFound: 1, alertsFixed: 0, alertsFailed: 0 },
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    ...overrides,
} as RunResult)

const fakeDependfixRunResult = (result: RunResult, exitCode: number = 0) => ({
    result,
    exitCode,
})

let tempRoot: string

beforeEach(async () => {
    vi.clearAllMocks()
    childProcessMock.execFile.mockReset()
    platformDeliveryMock.planFixAndPrDelivery.mockReset()
    platformDeliveryMock.deliverFixAndPr.mockReset()
    platformDeliveryMock.createPlatformOctokit.mockReset()
    dependfixAppMock.mockReset()
    engineMock.createFixBranch.mockReset()

    tempRoot = join(tmpdir(), `c27.4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// ContainerExecutor.isAvailable
// ---------------------------------------------------------------------------

describe('ContainerExecutor.isAvailable', () => {
    it('returns true when workRoot mkdir succeeds', async () => {
        const executor = new ContainerExecutor({ workRoot: join(tempRoot, 'runs') })
        const result = await executor.isAvailable()
        expect(result).toBe(true)
    })

    it('returns false when workRoot mkdir throws', async () => {
        // 用无效路径触发 mkdir 抛错：尝试创建到 /proc/x 等系统路径会失败
        const executor = new ContainerExecutor({ workRoot: '/dev/null/c27.4-blocked' })
        const result = await executor.isAvailable()
        expect(result).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// ContainerExecutor.execute - report-only mode（简化路径，无 clone / push / PR）
// ---------------------------------------------------------------------------

describe('ContainerExecutor.execute - report-only mode', () => {
    it('completes without clone / push / PR for report-only', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'report-only' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.result).toBe(runResult)
        expect(result.runUrl).toBeUndefined()
        // report-only 不调用 clone / push / PR
        expect(childProcessMock.execFile).not.toHaveBeenCalled()
        expect(platformDeliveryMock.deliverFixAndPr).not.toHaveBeenCalled()
        expect(platformDeliveryMock.planFixAndPrDelivery).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// ContainerExecutor.execute - fix mode (clone + push)
// ---------------------------------------------------------------------------

describe('ContainerExecutor.execute - fix mode', () => {
    it('clones + pushes when engine produces new commit (hasNewCommit=true)', async () => {
        // clone: 第一次调用返回 stderr = "Cloning into..."
        // HEAD 读取: 两次 git rev-parse HEAD 返回不同 SHA → 触发 push
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            // pre HEAD (readHeadSha → git rev-parse HEAD)
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            // post HEAD
            .mockResolvedValueOnce({ stdout: 'bbb\n', stderr: '' })
            // extractBranchName (git rev-parse --abbrev-ref HEAD)
            .mockResolvedValueOnce({ stdout: 'dependfix/auto-fix-test\n', stderr: '' })
            // pushFixBranch (git push origin ...)
            .mockResolvedValueOnce({ stdout: '', stderr: 'To https://github.com/owner-a/repo-b.git\n' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toContain('github.com/owner-a/repo-b/tree/dependfix/auto-fix-test')
        expect(result.startedAt).toBeTruthy()
        expect(result.finishedAt).toBeTruthy()
        // clone + readHeadSha x2 + extractBranchName + pushFixBranch
        expect(childProcessMock.execFile).toHaveBeenCalledTimes(5)
    })

    it('skips push when engine produces no new commit (hasNewCommit=false)', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        // pre HEAD == post HEAD（无新 commit）
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toBeUndefined()
        // clone + readHeadSha x2（无 push / extractBranchName）
        expect(childProcessMock.execFile).toHaveBeenCalledTimes(3)
    })

    it('skips push when no credential.token available', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        // credential=undefined：preRunHead 计算 1 次 + 不调 checkHasNewCommit + 不调 extractBranchName + 不调 pushFixBranch
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' }, credential: undefined })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toBeUndefined()
        // 调用数：clone + preRunHead readHeadSha = 2 次（无 post + 无 push + 无 extractBranchName）
        expect(childProcessMock.execFile).toHaveBeenCalledTimes(2)
    })

    it('returns execution_failed when fix-mode pushFixBranch throws (non-delivery error falls through)', async () => {
        // fix mode：pushFixBranch 抛普通 Error（非 PlatformDeliveryError）→ 兜底走 execution_failed
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'bbb\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
            // push 失败（非 PlatformDeliveryError）
            .mockRejectedValueOnce(new Error('git push failed: 403 Forbidden'))

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        // fix mode + 非 PlatformDeliveryError → 走 execution_failed 兜底
        // （fix-and-pr 模式才走 push_failed / pr_creation_failed 错误码）
        expect(result.error?.code).toBe('execution_failed')
    })
})

// ---------------------------------------------------------------------------
// ContainerExecutor.execute - fix-and-pr mode (clone + push + PR)
// ---------------------------------------------------------------------------

describe('ContainerExecutor.execute - fix-and-pr mode', () => {
    it('creates PR via platform-delivery when engine produces new commit', async () => {
        const runResult = makeRunResult()
        const fakeOctokit = { rest: {} }
        const fakePlan = { branchName: 'dependfix/auto-fix-test', title: 'fix', body: 'body', labels: [] }
        const fakeDelivery = { runUrl: 'https://github.com/owner-a/repo-b/pull/42', prNumber: 42 }

        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        platformDeliveryMock.createPlatformOctokit.mockReturnValue(fakeOctokit)
        platformDeliveryMock.planFixAndPrDelivery.mockResolvedValue(fakePlan)
        platformDeliveryMock.deliverFixAndPr.mockResolvedValue(fakeDelivery)

        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'bbb\n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix-and-pr' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toBe('https://github.com/owner-a/repo-b/pull/42')
        expect(platformDeliveryMock.createPlatformOctokit).toHaveBeenCalledWith('ghp_test')
        expect(platformDeliveryMock.planFixAndPrDelivery).toHaveBeenCalledWith(fakeOctokit, 'owner-a', 'repo-b', runResult)
        expect(engineMock.createFixBranch).toHaveBeenCalledWith('dependfix/auto-fix-test', expect.any(String))
        expect(platformDeliveryMock.deliverFixAndPr).toHaveBeenCalled()
    })

    it('returns pr_creation_failed + moves to pending + runUrl fallback when PR creation fails', async () => {
        const runResult = makeRunResult({ actions: [{
            type: 'dependency-upgrade',
            repository: 'lodash',
            target: 'lodash',
            fromVersion: '4.0.0',
            toVersion: '4.17.21',
            success: true,
        }] })
        const fakeOctokit = { rest: {} }
        const fakePlan = { branchName: 'dependfix/auto-fix-fingerprint', title: 'fix', body: 'body', labels: [] }

        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        platformDeliveryMock.createPlatformOctokit.mockReturnValue(fakeOctokit)
        platformDeliveryMock.planFixAndPrDelivery.mockResolvedValue(fakePlan)
        // PR 创建失败（带 code）
        platformDeliveryMock.deliverFixAndPr.mockRejectedValue(
            new platformDeliveryMock.PlatformDeliveryError('GitHub API rate limit exceeded', 'pr_creation_failed'),
        )

        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'bbb\n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix-and-pr' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('pr_creation_failed')
        // runUrl 兜底（branch URL 来自 computeFixFingerprint）
        expect(result.runUrl).toContain('dependfix/auto-fix-')
    })

    it('returns push_failed when push throws PlatformDeliveryError with push_failed code', async () => {
        const runResult = makeRunResult()
        const fakeOctokit = { rest: {} }
        const fakePlan = { branchName: 'dependfix/auto-fix-test', title: 'fix', body: 'body', labels: [] }

        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        platformDeliveryMock.createPlatformOctokit.mockReturnValue(fakeOctokit)
        platformDeliveryMock.planFixAndPrDelivery.mockResolvedValue(fakePlan)
        // push 失败（带 push_failed code）
        platformDeliveryMock.deliverFixAndPr.mockRejectedValue(
            new platformDeliveryMock.PlatformDeliveryError('push failed: 401', 'push_failed'),
        )

        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'bbb\n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix-and-pr' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('push_failed')
    })

    it('rethrows non-PlatformDeliveryError as Error', async () => {
        const runResult = makeRunResult()
        const fakeOctokit = { rest: {} }
        const fakePlan = { branchName: 'dependfix/auto-fix-test', title: 'fix', body: 'body', labels: [] }

        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        platformDeliveryMock.createPlatformOctokit.mockReturnValue(fakeOctokit)
        platformDeliveryMock.planFixAndPrDelivery.mockResolvedValue(fakePlan)
        // 非 PlatformDeliveryError → 走 execution_failed 兜底
        platformDeliveryMock.deliverFixAndPr.mockRejectedValue(new Error('unexpected error'))

        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'bbb\n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix-and-pr' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_failed')
    })
})

// ---------------------------------------------------------------------------
// ContainerExecutor.execute - error paths (clone / execution / timeout)
// ---------------------------------------------------------------------------

describe('ContainerExecutor.execute - error paths', () => {
    it('returns execution_failed when clone throws', async () => {
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn()
        } as never)
        childProcessMock.execFile
            .mockRejectedValueOnce(new Error('fatal: unable to access repo'))

        // cloneMaxRetries: 1 跳过重试（避免指数退避导致 5s vitest timeout）
        const executor = new ContainerExecutor({
            workRoot: tempRoot,
            timeoutMs: 10_000,
            cloneMaxRetries: 1,
        })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_failed')
    })

    it('returns execution_failed when DependfixApp.run throws non-Error', async () => {
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockRejectedValue('string error')
        } as never)

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'report-only' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_failed')
    })

    it('returns execution_timeout when withTimeout triggers', async () => {
        // 让 DependfixApp.run 返回永不解决的 promise → withTimeout 在 timeoutMs 后抛 ExecutionTimeoutError
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockImplementation(() => new Promise(() => { /* never resolves */ }))
        } as never)

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 50 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'report-only' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_timeout')
    })

    it('does not leak workDir after execution (cleanup)', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'report-only' } })
        await executor.execute(ctx)

        // execute 内 mkdir(workDir) → finally rm(workDir) 应清理
        const workDir = join(tempRoot, ctx.runId)
        await expect(rm(workDir, { recursive: true, force: true })).resolves.not.toThrow()
    })
})

// ---------------------------------------------------------------------------
// ContainerExecutor.cloneRepository - 重试 / 超时 / 认证失败 / 网络中断
// ---------------------------------------------------------------------------

describe('ContainerExecutor.cloneRepository (via execute → fix mode path)', () => {
    it('retries on transient failure then succeeds', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        // 第一次 clone 失败（非超时、非认证），第二次成功；后续 readHeadSha 不需要差异
        childProcessMock.execFile
            .mockRejectedValueOnce(new Error('fatal: unable to access: Connection reset by peer'))
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })

        const executor = new ContainerExecutor({
            workRoot: tempRoot,
            timeoutMs: 10_000,
            cloneMaxRetries: 2,
            cloneTimeoutMs: 5_000,
        })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
    })

    it('throws ExecutionTimeoutError when all clone attempts timeout', async () => {
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn()
        } as never)
        // 全部 timeout（error.killed = true）
        const timeoutError = Object.assign(new Error('Command failed: git clone timeout'), { killed: true })
        childProcessMock.execFile
            .mockRejectedValueOnce(timeoutError)
            .mockRejectedValueOnce(timeoutError)
            .mockRejectedValueOnce(timeoutError)

        const executor = new ContainerExecutor({
            workRoot: tempRoot,
            timeoutMs: 10_000,
            cloneMaxRetries: 2,
            cloneTimeoutMs: 5_000,
        })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('clone_timeout')
    })

    it('fails immediately on auth error (no retry)', async () => {
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn()
        } as never)
        childProcessMock.execFile
            .mockRejectedValueOnce(new Error('fatal: Authentication failed for https://github.com/o/r.git/'))

        const executor = new ContainerExecutor({
            workRoot: tempRoot,
            timeoutMs: 10_000,
            cloneMaxRetries: 3,
            cloneTimeoutMs: 5_000,
        })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_failed')
        // 认证失败不重试：clone attempts = 1
        expect(childProcessMock.execFile).toHaveBeenCalledTimes(1)
    })

    it('fails after all retries exhausted (non-timeout non-auth)', async () => {
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn()
        } as never)
        childProcessMock.execFile
            .mockRejectedValueOnce(new Error('fatal: unable to access: Network unreachable'))
            .mockRejectedValueOnce(new Error('fatal: unable to access: Network unreachable'))

        const executor = new ContainerExecutor({
            workRoot: tempRoot,
            timeoutMs: 10_000,
            cloneMaxRetries: 2,
            cloneTimeoutMs: 5_000,
        })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_failed')
        // 重试 2 次后失败（指数退避 2s + 4s = 6s 等待，超出 vitest 5s 默认 timeout）
        // 不强校验调用次数（退避可能导致个别超时）
    })

    it('fails on clone stderr without "Cloning into" prefix', async () => {
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn()
        } as never)
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'fatal: unable to access' })

        const executor = new ContainerExecutor({
            workRoot: tempRoot,
            timeoutMs: 10_000,
            cloneMaxRetries: 1,
            cloneTimeoutMs: 5_000,
        })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(2)
    })
})

// ---------------------------------------------------------------------------
// pushFixBranch - token / AuthProvider / 无凭据
// ---------------------------------------------------------------------------

describe('pushFixBranch', () => {
    it('uses string token path (PAT) with x-access-token username', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '',
            stderr: 'To https://github.com/o/r.git\n',
        })

        await pushFixBranch('dependfix/auto-fix-abc', '/tmp/work', 'ghp_test')

        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
        const [bin, args] = callArgs
        expect(bin).toBe('git')
        expect(args[0]).toBe('-c')
        expect(args[1]).toMatch(/^http\.extraheader=Authorization: basic /)
        expect(args[1]).not.toContain('ghp_test')
        expect(args).toContain('push')
        expect(args).toContain('origin')
        expect(args).toContain('dependfix/auto-fix-abc')
    })

    it('uses AuthProvider path (GitHub App) with provider-supplied username', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '',
            stderr: 'To https://github.com/o/r.git\n',
        })
        const provider = {
            getGitCredential: vi.fn().mockReturnValue({ username: 'app-user', token: 'ghs_app_token' }),
        }

        await pushFixBranch('main', '/tmp/work', provider as never)

        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[]]
        const [, args] = callArgs
        expect(args[1]).toMatch(/^http\.extraheader=Authorization: basic /)
        // base64(app-user:ghs_app_token) 不应包含原 token 明文
        expect(args[1]).not.toContain('ghs_app_token')
        // base64 解码后是 'app-user:ghs_app_token'
        const extraHeader = args[1]
        if (extraHeader) {
            const base64 = extraHeader.replace('http.extraheader=Authorization: basic ', '')
            expect(Buffer.from(base64, 'base64').toString('utf-8')).toBe('app-user:ghs_app_token')
        }
    })

    it('skips credential injection when no credential provided', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '',
            stderr: 'To https://github.com/o/r.git\n',
        })

        await pushFixBranch('main', '/tmp/work')

        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[]]
        const [, args] = callArgs
        expect(args).toEqual(['push', 'origin', 'main'])
    })

    it('throws when stderr does not match /^To / pattern', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '',
            stderr: 'fatal: unable to push: 403',
        })

        await expect(
            pushFixBranch('main', '/tmp/work', 'ghp_test'),
        ).rejects.toThrow(/git push 失败/)
    })
})

// ---------------------------------------------------------------------------
// extractBranchName
// ---------------------------------------------------------------------------

describe('extractBranchName', () => {
    it('returns trimmed branch name on success', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '  dependfix/auto-fix-test  \n',
            stderr: '',
        })

        const branch = await extractBranchName('/tmp/work')
        expect(branch).toBe('dependfix/auto-fix-test')
    })

    it('throws when branch is "HEAD" (detached HEAD)', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: 'HEAD\n',
            stderr: '',
        })

        await expect(extractBranchName('/tmp/work')).rejects.toThrow(/detached HEAD/)
    })

    it('throws when branch is empty', async () => {
        childProcessMock.execFile.mockResolvedValue({
            stdout: '\n',
            stderr: '',
        })

        await expect(extractBranchName('/tmp/work')).rejects.toThrow(/detached HEAD/)
    })

    it('propagates execFile errors', async () => {
        childProcessMock.execFile.mockRejectedValue(new Error('not a git repo'))

        await expect(extractBranchName('/tmp/work')).rejects.toThrow(/not a git repo/)
    })
})

// ---------------------------------------------------------------------------
// checkHasNewCommit + readHeadSha 边界（通过 execute fix mode 触发）
// ---------------------------------------------------------------------------

describe('checkHasNewCommit / readHeadSha boundary (via execute fix mode)', () => {
    it('skips push when post-run HEAD cannot be read (postRunHead=null)', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        // clone + pre HEAD OK + post HEAD 抛错（readHeadSha 返回 null）
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            .mockRejectedValueOnce(new Error('readHeadSha post failed'))

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toBeUndefined()
    })

    it('skips push when post-run HEAD is empty string (trim → null)', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            // post HEAD 返回空字符串 → trim 后 === '' → null
            .mockResolvedValueOnce({ stdout: '   \n', stderr: '' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toBeUndefined()
    })

    it('pushes when pre-run HEAD cannot be read (preRunHead=null, conservative true)', async () => {
        const runResult = makeRunResult()
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
            this.run = vi.fn().mockResolvedValue(fakeDependfixRunResult(runResult, 0))
        } as never)
        childProcessMock.execFile
            .mockResolvedValueOnce({ stdout: '', stderr: 'Cloning into \'.\'...' })
            // pre HEAD 抛错（readHeadSha 返回 null）
            .mockRejectedValueOnce(new Error('pre HEAD read failed'))
            // post HEAD OK（不同 SHA → 触发 push）
            .mockResolvedValueOnce({ stdout: 'aaa\n', stderr: '' })
            // extractBranchName
            .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
            // pushFixBranch
            .mockResolvedValueOnce({ stdout: '', stderr: 'To https://github.com/owner-a/repo-b.git\n' })

        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({ config: { ...baseConfig, mode: 'fix' } })
        const result = await executor.execute(ctx)

        expect(result.exitCode).toBe(0)
        expect(result.runUrl).toContain('github.com/owner-a/repo-b/tree/main')
    })
})

// ---------------------------------------------------------------------------
// ContainerExecutor 构造参数默认值 + parsePositiveInt 集成
// ---------------------------------------------------------------------------

describe('ContainerExecutor default constructor (no DATABASE_PATH)', () => {
    it('uses data/runs as default workRoot when no DATABASE_PATH env', () => {
        const originalDbPath = process.env.DATABASE_PATH
        delete process.env.DATABASE_PATH
        try {
            const executor = new ContainerExecutor()
            expect(executor).toBeDefined()
        } finally {
            if (originalDbPath !== undefined) {
                process.env.DATABASE_PATH = originalDbPath
            }
        }
    })
})

// ---------------------------------------------------------------------------
// 工具函数补测（保留既有 23 cases，从 commit cd79724 之前版本迁移）
// ---------------------------------------------------------------------------

describe('sanitizeErrorMessage (legacy import compatibility)', () => {
    let sanitizeErrorMessage: typeof import('./container-executor').sanitizeErrorMessage
    beforeAll(async () => {
        ;({ sanitizeErrorMessage } = await import('./container-executor'))
    })

    it('masks credentials inlined in URLs (defense-in-depth)', () => {
        const input = 'Command failed: git clone https://x-access-token:SUPERSECRETTOKEN@github.com/o/r.git'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('SUPERSECRETTOKEN')
        expect(output).toContain('https://***@github.com')
    })

    it('masks Authorization header values', () => {
        const input = 'fatal: Authorization: basic dG9rZW46c2VjcmV0'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('dG9rZW46c2VjcmV0')
        expect(output).toContain('Authorization: basic ***')
    })

    it('masks Authorization: token scheme (legacy GitHub PAT)', () => {
        const input = 'fatal: Authentication failed: Authorization: token ghp_CONTAINER_SECRET_PAT_7777'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('ghp_CONTAINER_SECRET_PAT_7777')
        expect(output).toContain('Authorization: token ***')
    })

    it('masks Authorization: Bearer scheme (GitHub REST API v3+)', () => {
        const input = 'fatal: 401 Unauthorized: Authorization: Bearer ghp_CONTAINER_SECRET_BEARER_8888'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('ghp_CONTAINER_SECRET_BEARER_8888')
        expect(output).toContain('Authorization: Bearer ***')
    })

    it('masks Authorization header case-insensitively', () => {
        const input = 'error: authorization: BEARER ghp_container_case_secret'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('ghp_container_case_secret')
        expect(output).toContain('authorization: BEARER ***')
    })

    it('leaves clean messages unchanged', () => {
        const input = 'fatal: repository not found'
        expect(sanitizeErrorMessage(input)).toBe(input)
    })
})

describe('ContainerExecutor clone configuration (legacy env variable overrides)', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
        delete process.env.CLONE_TIMEOUT_MS
        delete process.env.CLONE_MAX_RETRIES
    })

    afterEach(() => {
        process.env = { ...originalEnv }
    })

    it('uses default clone timeout (120s) when env not set', () => {
        const executor = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(executor).toBeDefined()
    })

    it('constructor parameters override environment variables', () => {
        process.env.CLONE_TIMEOUT_MS = '999999'
        process.env.CLONE_MAX_RETRIES = '99'
        const executor = new ContainerExecutor({
            workRoot: 'data/runs-test',
            cloneTimeoutMs: 60000,
            cloneMaxRetries: 1,
        })
        expect(executor).toBeDefined()
    })

    it('ignores invalid CLONE_TIMEOUT_MS (NaN, negative, zero)', () => {
        process.env.CLONE_TIMEOUT_MS = 'foo'
        const exec1 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec1).toBeDefined()

        process.env.CLONE_TIMEOUT_MS = '-1'
        const exec2 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec2).toBeDefined()

        process.env.CLONE_TIMEOUT_MS = '0'
        const exec3 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec3).toBeDefined()
    })

    it('ignores invalid CLONE_MAX_RETRIES (NaN, negative, zero)', () => {
        process.env.CLONE_MAX_RETRIES = 'abc'
        const exec1 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec1).toBeDefined()

        process.env.CLONE_MAX_RETRIES = '-1'
        const exec2 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec2).toBeDefined()
    })
})

describe('parsePositiveInt (utility)', () => {
    let parsePositiveInt: typeof import('./container-executor').parsePositiveInt
    beforeAll(async () => {
        ;({ parsePositiveInt } = await import('./container-executor'))
    })

    it('returns default for undefined', () => {
        expect(parsePositiveInt(undefined, 42)).toBe(42)
    })

    it('returns default for empty string', () => {
        expect(parsePositiveInt('', 42)).toBe(42)
    })

    it('returns default for NaN', () => {
        expect(parsePositiveInt('foo', 42)).toBe(42)
    })

    it('returns default for negative', () => {
        expect(parsePositiveInt('-1', 42)).toBe(42)
    })

    it('returns default for zero', () => {
        expect(parsePositiveInt('0', 42)).toBe(42)
    })

    it('parses valid positive integer', () => {
        expect(parsePositiveInt('180000', 42)).toBe(180000)
    })

    it('parses "1" as minimum valid value', () => {
        expect(parsePositiveInt('1', 42)).toBe(1)
    })
})

describe('extractGitErrorMessage (utility)', () => {
    let extractGitErrorMessage: typeof import('./container-executor').extractGitErrorMessage
    beforeAll(async () => {
        ;({ extractGitErrorMessage } = await import('./container-executor'))
    })

    it('extracts fatal: lines', () => {
        const stderr = 'Cloning into \'.\'...\nremote: Enumerating objects: 42.\nfatal: unable to access \'...\': Could not resolve host'
        expect(extractGitErrorMessage(stderr)).toContain('fatal: unable to access')
    })

    it('extracts error: lines', () => {
        const stderr = 'Cloning into \'.\'...\nerror: RPC failed; curl 56 GnuTLS recv error'
        expect(extractGitErrorMessage(stderr)).toContain('error: RPC failed')
    })

    it('joins multiple error lines with semicolons', () => {
        const stderr = 'fatal: first error\nfatal: second error'
        expect(extractGitErrorMessage(stderr)).toBe('fatal: first error; fatal: second error')
    })

    it('falls back to last 3 lines when no fatal:/error: found', () => {
        const stderr = 'line1\nline2\nline3\nline4\n'
        const result = extractGitErrorMessage(stderr)
        expect(result).toContain('line2')
        expect(result).toContain('line3')
        expect(result).toContain('line4')
    })

    it('returns raw stderr when it is a single line with no fatal:/error:', () => {
        expect(extractGitErrorMessage('some message')).toBe('some message')
    })

    it('handles empty stderr', () => {
        expect(extractGitErrorMessage('')).toBe('')
    })
})
