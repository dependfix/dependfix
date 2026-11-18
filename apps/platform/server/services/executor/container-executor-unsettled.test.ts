/**
 * ContainerExecutor 取消未落定诊断（`container-executor.execute` 的宽限期分支）。
 *
 * 覆盖点：
 * - 宽限期结束仍未落定时，诊断句必须带「诊断分类」并与运行期句柄净增同源；
 * - 句柄基线取在**引擎启动之前**（只计新增的语义前提，基线漂移到诊断处会让分类恒为 unknown）；
 * - 基线等于当前快照（无新增句柄）时不得判成「未 settle 句柄」。
 *
 * report-only 路径不 clone / 不推送，故只需 mock `@dependfix/engine` 的 `DependfixApp`；
 * 句柄探针用 `vi.spyOn(process, 'getActiveResourcesInfo')` 按调用序桩值。
 */
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dependfixAppMock = vi.hoisted(() => vi.fn())

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        DependfixApp: dependfixAppMock,
    }
})

import { ContainerExecutor } from './container-executor'
import type { ScanExecutorContext } from './types'

const baseConfig = {
    mode: 'report-only' as const,
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

const makeCtx = (runId: string): ScanExecutorContext => ({
    runId,
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
    },
    config: baseConfig,
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/unused',
})

let tempRoot: string

beforeEach(async () => {
    vi.clearAllMocks()
    dependfixAppMock.mockReset()
    tempRoot = join(tmpdir(), `c-exec-unsettled-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    await mkdir(tempRoot, { recursive: true })
})

afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true })
})

/** 引擎永不落定（超时后宽限期结束仍未 settle）。 */
function mockNeverSettlingApp(): void {
    dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn>, abort: ReturnType<typeof vi.fn> }) {
        this.abort = vi.fn()
        this.run = vi.fn().mockImplementation(() => new Promise(() => { /* never settles */ }))
    } as never)
}

describe('ContainerExecutor.execute - 取消未落定诊断', () => {
    it('classifies runtime handle growth as unsettled handles', async () => {
        mockNeverSettlingApp()
        // 运行起点无新增 → 宽限期结束时多出一条管道句柄（子进程已停但 stdio 未关闭）
        const resources = vi.spyOn(process, 'getActiveResourcesInfo')
            .mockReturnValueOnce([])
            .mockReturnValueOnce(['PipeWrap'])
        try {
            const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 30, abortGraceMs: 20 })
            const result = await executor.execute(makeCtx('run-unsettled-pipe'))

            expect(result.error?.code).toBe('execution_timeout')
            expect(result.logsJson).toContain('未在 20ms 宽限期内落定')
            expect(result.logsJson).toContain('诊断分类：未 settle 句柄（无在管的受管子进程）')
            expect(result.logsJson).toContain('净增 PipeWrap×1')
        } finally {
            resources.mockRestore()
        }
    })

    it('captures the handle baseline before the engine starts', async () => {
        let probeCallsAtRunStart = -1
        const resources = vi.spyOn(process, 'getActiveResourcesInfo').mockReturnValue([])
        dependfixAppMock.mockImplementation(function (this: { run: ReturnType<typeof vi.fn>, abort: ReturnType<typeof vi.fn> }) {
            this.abort = vi.fn()
            this.run = vi.fn().mockImplementation(() => {
                // 基线漂移到诊断处时这里读到 0（只计新增的语义随之失效）
                probeCallsAtRunStart = resources.mock.calls.length
                return new Promise(() => { /* never settles */ })
            })
        } as never)
        try {
            const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 30, abortGraceMs: 20 })
            await executor.execute(makeCtx('run-unsettled-baseline'))

            expect(probeCallsAtRunStart).toBe(1)
        } finally {
            resources.mockRestore()
        }
    })

    it('does not report unsettled handles when the delta is empty', async () => {
        mockNeverSettlingApp()
        // 基线与宽限期结束读数一致 → 无新增句柄，分类必须落到「无法归类」而非句柄泄漏
        const resources = vi.spyOn(process, 'getActiveResourcesInfo').mockReturnValue([])
        try {
            const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 30, abortGraceMs: 20 })
            const result = await executor.execute(makeCtx('run-unsettled-empty-delta'))

            expect(result.logsJson).toContain('诊断分类：无法归类（无在管的受管子进程、无运行期句柄净增')
            expect(result.logsJson).not.toContain('诊断分类：未 settle 句柄')
        } finally {
            resources.mockRestore()
        }
    })

    it('flags an unavailable probe instead of inferring handle growth', async () => {
        mockNeverSettlingApp()
        // 基线采集抛错 → 不得与「当前全量快照」相减伪造成新增（`?? {}` 之类的合并会在此变红）
        const resources = vi.spyOn(process, 'getActiveResourcesInfo')
            .mockImplementationOnce(() => {
                throw new Error('probe unavailable')
            })
            .mockReturnValue(['PipeWrap'])
        try {
            const executor = new ContainerExecutor({ workRoot: tempRoot, timeoutMs: 30, abortGraceMs: 20 })
            const result = await executor.execute(makeCtx('run-unsettled-probe-down'))

            expect(result.logsJson).toContain('诊断分类：无法归类（句柄采集不可用）')
            expect(result.logsJson).toContain('运行期句柄：采集不可用')
            expect(result.logsJson).not.toContain('诊断分类：未 settle 句柄')
        } finally {
            resources.mockRestore()
        }
    })
})
