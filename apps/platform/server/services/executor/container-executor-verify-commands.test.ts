import 'reflect-metadata'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RunResult } from '@dependfix/core'
import type { ScanExecutorContext } from './types'

/**
 * 仓库级自定义验证命令（verifyCommands）从执行上下文透传到 DependfixApp（口径见 docs/standards/platform.md §3.8）。
 *
 * 独立成文件的原因：容器执行器主测试文件已接近 test 文件 max-lines 上限（1000），
 * 本组用例只需 mock `@dependfix/engine` 的 DependfixApp，无需 child_process / platform-delivery 全量脚手架。
 *
 * 断言口径：直接检查 `new DependfixApp(options)` 收到的 `options.commands`
 * （而非仅断言「未抛错」——避免下游默认链兜底掩盖未透传）。
 */
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

const makeCtx = (repository: ScanExecutorContext['repository']): ScanExecutorContext => ({
    runId: 'run-1',
    repository,
    config: baseConfig,
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-1',
})

let tempRoot: string

beforeEach(async () => {
    vi.clearAllMocks()
    dependfixAppMock.mockReset()
    dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn> }) {
        const result = {
            actions: [],
            summary: { alertsFound: 0, alertsFixed: 0, alertsFailed: 0 },
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
        } as unknown as RunResult
        this.run = vi.fn().mockResolvedValue({ result, exitCode: 0 })
    } as never)
    tempRoot = join(tmpdir(), `c76-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
})

/** 取 DependfixApp 构造参数（`new DependfixApp(options)` → mock.calls[0][0]） */
const appOptions = () => dependfixAppMock.mock.calls[0]![0] as { commands?: string[] }

describe('ContainerExecutor verifyCommands 透传', () => {
    it('passes repository verifyCommands to DependfixApp options.commands', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({
            owner: 'owner-a',
            name: 'repo-b',
            defaultBranch: 'main',
            verifyCommands: ['pnpm install --frozen-lockfile', 'pnpm test'],
        })

        await executor.execute(ctx)

        expect(dependfixAppMock).toHaveBeenCalledTimes(1)
        expect(appOptions().commands).toEqual(['pnpm install --frozen-lockfile', 'pnpm test'])
    })

    it('omits commands when repository has no verifyCommands (走引擎默认验证链)', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })

        await executor.execute(makeCtx({ owner: 'owner-a', name: 'repo-b', defaultBranch: 'main' }))

        expect(appOptions().commands).toBeUndefined()
    })

    it('treats empty verifyCommands array as absent (空数组 → 引擎默认验证链)', async () => {
        const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 10_000 })
        const ctx = makeCtx({
            owner: 'owner-a',
            name: 'repo-b',
            defaultBranch: 'main',
            verifyCommands: [],
        })

        await executor.execute(ctx)

        expect(appOptions().commands).toBeUndefined()
    })
})
