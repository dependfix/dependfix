import 'reflect-metadata'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunResult } from '@dependfix/core'
import type { ScanExecutorContext } from './types'

/**
 * ContainerExecutor → 引擎 RuntimeConfig 覆写口径。
 *
 * 独立成文件的原因：容器执行器主测试文件已接近 test 文件 max-lines 上限（1000），
 * 与该文件内的 verifyCommands 透传用例同一处理方式。
 *
 * 断言口径：直接检查 `new DependfixApp(options)` 收到的 `options.config`（而非仅断言「未抛错」
 * 或「未调用 git」）——模式 / commit 覆写与 clone 判定必须同源，二者错配是本组用例守护的对象。
 *
 * 回归背景（2026-10-11 生产实证）：report-only 扫描按原始模式不 clone（needsClone=false），
 * 但引擎 config 被**无条件**覆写为 `mode:'fix' + commit:true` → 引擎在空 workDir 上执行
 * `git config user.name` → `fatal: not in a git directory` → `COMMIT_FAILED` → 平台
 * `engine_delivery_failed` 误标整次运行失败。口径见 [executor-sandbox-implementation.md §8.5]。
 */
const childProcessMock = vi.hoisted(() => {
    const execFile = vi.fn()
    ;(execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = execFile
    return { execFile, execFileSync: vi.fn(), execSync: vi.fn() }
})

vi.mock('node:child_process', () => childProcessMock)

const dependfixAppMock = vi.hoisted(() => vi.fn())

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        DependfixApp: dependfixAppMock,
    }
})

import { ContainerExecutor } from './container-executor'

const baseConfig: ScanExecutorContext['config'] = {
    mode: 'report-only',
    severityThreshold: 'high',
    repositories: ['owner-a/repo-b'],
    dryRun: false,
    createPullRequest: false,
    commit: false,
    cleanupBranches: false,
    cleanupBranchesAuto: false,
    githubToken: 'ghp_test',
    alertSource: 'github-dependabot',
    codeScanningEnabled: false,
    codeQualityEnabled: false,
    allowMajorUpgrade: false,
    maxAlertsPerRepository: 20,
    maxConcurrency: 1,
    maxRetries: 3,
    maxBackoffMs: 30_000,
    maxRepos: 100,
}

const makeCtx = (mode: ScanExecutorContext['config']['mode']): ScanExecutorContext => ({
    runId: 'run-1',
    repository: { owner: 'owner-a', name: 'repo-b', defaultBranch: 'main', packageManager: 'pnpm' },
    config: { ...baseConfig, mode },
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-1',
})

let tempRoot: string

beforeEach(async () => {
    vi.clearAllMocks()
    dependfixAppMock.mockReset()
    dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
        const result = {
            alerts: [],
            actions: [],
            summary: { alertsFound: 0, alertsFixed: 0, alertsFailed: 0 },
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
        } as unknown as RunResult
        this.run = vi.fn().mockResolvedValue({ result, exitCode: 0 })
    } as never)
    // clone（stderr 前缀 "Cloning into" = 成功）+ 前后 HEAD 相同（无新 commit → 不走 push / PR）
    childProcessMock.execFile.mockResolvedValue({ stdout: 'aaa\n', stderr: 'Cloning into \'.\'...' })
    tempRoot = join(tmpdir(), `c-exec-cfg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
})

/** 取 DependfixApp 构造参数里的引擎 config */
const engineConfig = () => (dependfixAppMock.mock.calls[0]![0] as {
    config: {
        mode: string
        commit: boolean
        createPullRequest: boolean
        onBaselineRed?: string
        deliveryOwner?: string
        deadlineAt?: number
    }
}).config

describe('ContainerExecutor 引擎 config 覆写口径', () => {
    it('report-only：不 clone 且引擎保持只读模式（mode / commit 不得被降级）', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })

        await executor.execute(makeCtx('report-only'))

        expect(childProcessMock.execFile).not.toHaveBeenCalled()
        expect(engineConfig().mode).toBe('report-only')
        expect(engineConfig().commit).toBe(false)
    })

    it('fix：clone 且引擎降级为 fix + commit:true（平台接管 push / PR）', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })

        await executor.execute(makeCtx('fix'))

        // clone + readHeadSha（前 / 后各一次）
        expect(childProcessMock.execFile).toHaveBeenCalledTimes(3)
        expect(engineConfig().mode).toBe('fix')
        expect(engineConfig().commit).toBe(true)
        expect(engineConfig().createPullRequest).toBe(false)
        // 默认 skip + 平台接管交付（draft 档才允许继续提交）
        expect(engineConfig().onBaselineRed).toBe('skip')
        expect(engineConfig().deliveryOwner).toBe('platform')
    })

    it('passes repository baselineRedCarrier as engine onBaselineRed', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx('fix')
        ;(ctx.repository as { baselineRedCarrier?: string }).baselineRedCarrier = 'draft'

        await executor.execute(ctx)

        expect(engineConfig().onBaselineRed).toBe('draft')
        expect(engineConfig().deliveryOwner).toBe('platform')
    })

    it('fix-and-pr：clone 且引擎降级为 fix + commit:true（PR 由平台 delivery 创建）', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })

        await executor.execute(makeCtx('fix-and-pr'))

        expect(childProcessMock.execFile).toHaveBeenCalledTimes(3)
        expect(engineConfig().mode).toBe('fix')
        expect(engineConfig().commit).toBe(true)
        expect(engineConfig().createPullRequest).toBe(false)
    })
})

describe('ContainerExecutor → 引擎预算截止时间', () => {
    it('透传 deadlineAt ≈ 开始时刻 + timeoutMs（上层计算，引擎只消费）', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 60_000 })
        const before = Date.now()

        await executor.execute(makeCtx('fix'))

        const deadlineAt = engineConfig().deadlineAt
        expect(typeof deadlineAt).toBe('number')
        expect(deadlineAt).toBeGreaterThanOrEqual(before + 60_000)
        expect(deadlineAt).toBeLessThanOrEqual(Date.now() + 60_000)
    })
})
