// repo-fix-baseline.test.ts — 零告警仓库跳过修复前基线采样（成本）与归因口径不退化。
//
// 口径（见 docs/design/modules/dependency-fixer-records.md 验证链章节）：
// - 基线采样的实质作用只有一条——命令行级「修复前即红」集合 → 修复后验证的 preExisting 豁免；
// - 零告警仓库无任何写操作（无依赖告警 / 无 Code Scanning 告警）→ 工作区仍是 pristine，
//   修复后验证与「若采样的基线」同命令同工作区 ⇒ 「失败即既有失败」，故可跳过采样（省一条验证链）；
// - 修复后验证链保留：其 verificationPassed 是零告警仓库唯一的「处理成功」信号（出口码判定依赖它）。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import type { CommandResult } from '../runners/verification-runner'
import type { AppContext } from './helpers'
import { processRepoFix, type RepoFixCtx } from './repo-fix'
import { ensureVerificationBaseline } from './repo-fix-finalize'
import { computeExitCode } from './result-assembly'
import { findInstallBaselineFailure } from './verify-project'

const {
    mockFetchRepoAlerts,
    mockFetchDefaultBranch,
    mockRunCodeScanningFixes,
    mockTryLockfileRepair,
    mockSampleVerificationBaseline,
    mockRunVerification,
} = vi.hoisted(() => ({
    mockFetchRepoAlerts: vi.fn(),
    mockFetchDefaultBranch: vi.fn(),
    mockRunCodeScanningFixes: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
    mockSampleVerificationBaseline: vi.fn(),
    mockRunVerification: vi.fn(),
}))

vi.mock('./repo-alerts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./repo-alerts')>()
    return { ...actual, fetchRepoAlerts: mockFetchRepoAlerts, fetchDefaultBranch: mockFetchDefaultBranch }
})

vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return { ...actual, tryLockfileRepair: mockTryLockfileRepair, runCodeScanningFixes: mockRunCodeScanningFixes }
})

// 保留真实 verifyProject（归因逻辑是本批被测面），仅替身基线采样
vi.mock('./verify-project', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./verify-project')>()
    return { ...actual, sampleVerificationBaseline: mockSampleVerificationBaseline }
})

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: mockRunVerification }
})

function makeAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
    return {
        id: 1,
        source: 'dependabot',
        repository: 'foo/bar',
        defaultBranch: 'main',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName: 'lodash',
        manifestPath: 'package.json',
        ruleId: 'GHSA-test',
        summary: 'test advisory',
        htmlUrl: 'https://github.com/foo/bar/security/dependabot/1',
        // 不可修复（fixStrategy null）→ 升级链路不产生动作，聚焦「基线采样面」本身
        fixable: false,
        fixStrategy: null,
        recommendedVersion: '',
        upstreamId: 'dependabot:1',
        ...overrides,
    }
}

/** 跨 major 未授权的 lockfile 告警（不得否决其他可写工作）。 */
function makeCrossMajorLockfileAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
    return makeAlert({
        packageName: 'lodash',
        manifestPath: 'pnpm-lock.yaml',
        fixable: true,
        fixStrategy: 'upgrade',
        recommendedVersion: '4.17.21',
        ...overrides,
    })
}

/** 可自动修复的 Code Scanning 告警：有写盘可能（触发基线采样），模板修复本身由 mock 承担。 */
function makeAutoFixableCodeScanningAlert(overrides: Partial<NormalizedSecurityAlert> = {}): NormalizedSecurityAlert {
    return makeAlert({
        source: 'code-scanning',
        ruleId: 'js/sql-injection',
        manifestPath: 'src/db.ts',
        alertClass: 'auto-fixable',
        fixable: false,
        ...overrides,
    })
}

function makeCtx(workDir: string): RepoFixCtx {
    return {
        config: {
            mode: 'fix',
            dryRun: false,
            severityThreshold: 'all',
            maxAlertsPerRepository: 100,
        } as AppContext['config'],
        workDir,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as never,
        runId: 'run-1',
        allAlerts: [],
        allActions: [],
        allErrors: [],
        alertsDisabled: [],
        repoResults: [],
        summary: {
            alertsFound: 0,
            alertsFixable: 0,
            alertsFixed: 0,
            alertsUnfixed: 0,
            alertsFailed: 0,
            alertsSkipped: 0,
            alertsSkippedByReason: {},
            alertsConverged: 0,
            environmentalFailures: 0,
            alertsTruncated: 0,
            alertsTruncatedBySeverity: {},
            lockfileRepairs: 0,
            verificationsPassed: 0,
            verificationsFailed: 0,
            repositoriesScanned: 0,
            reposWithAlertsDisabled: 0,
        } as never,
        startedAt: '2026-10-16T00:00:00Z',
        finishedAt: '',
        aiUsageRef: { aggregate: undefined },
        // 运行级基线持有器（生产由 index.ts 创建；未提供 ⇒ 不采样，退回全量归因）
        verificationBaseline: {},
    }
}

const successResults = (commands: string[]): CommandResult[] =>
    commands.map((command) => ({ command, exitCode: 0, durationMs: 1, stdout: '', stderr: '' }))

/** 模拟真实 runner 的「首个失败即停」前缀截断形态（否则上游命令继续返回成功会产出误导证据） */
const failingResults = (commands: string[], failingCommand: string): CommandResult[] => {
    const results: CommandResult[] = []
    for (const command of commands) {
        if (command === failingCommand) {
            results.push({ command, exitCode: 1, durationMs: 1, stdout: '', stderr: 'boom' })
            return results
        }
        results.push({ command, exitCode: 0, durationMs: 1, stdout: '', stderr: '' })
    }
    return results
}

describe('processRepoFix 修复前基线采样面', () => {
    let workDir: string

    beforeEach(() => {
        vi.clearAllMocks()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-baseline-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'x',
            version: '1.0.0',
            scripts: { lint: 'eslint .', build: 'tsc', typecheck: 'tsc --noEmit', test: 'vitest run' },
        }, null, 2))
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
        mockFetchDefaultBranch.mockResolvedValue('main')
        mockRunCodeScanningFixes.mockResolvedValue({ fixed: 0, failed: 0 })
        mockTryLockfileRepair.mockReturnValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            noOp: true,
            durationMs: 1,
        })
        mockRunVerification.mockImplementation(async ({ commands }: { commands: string[] }) => ({
            success: true,
            commandResults: successResults(commands),
        }))
        // 基线替身委托 runVerification：若基线阶段被执行，runVerification 计数必然增加
        // （否则「零告警仓库基线阶段 0 次」断言会因替身不产生调用而空转）
        mockSampleVerificationBaseline.mockImplementation(async (ctx: RepoFixCtx) => {
            const result = await mockRunVerification({ workDir: ctx.workDir, commands: ['baseline-probe'] })
            return result.commandResults
        })
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('零告警仓库：基线阶段验证链 0 次，修复后验证链保留', async () => {
        mockFetchRepoAlerts.mockResolvedValue([])
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        // 基线阶段不采样（等价于 runVerification 在基线阶段调用 0 次）
        expect(mockSampleVerificationBaseline).not.toHaveBeenCalled()
        // 仅修复后验证链跑了一次
        expect(mockRunVerification).toHaveBeenCalledTimes(1)
        expect(ctx.repoResults[0].verificationPassed).toBe(true)
        expect(ctx.repoResults[0].verificationBlocking).toBe(false)
    })

    it('有可写工作的仓库：采样一次基线；无实际写入时跳过终验', async () => {
        // 自动修复模板告警 ⇒ 有写盘可能 → 采样基线；mock 修复计数为 0 ⇒ 终验无对象
        mockFetchRepoAlerts.mockResolvedValue([makeAutoFixableCodeScanningAlert()])
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        expect(mockSampleVerificationBaseline).toHaveBeenCalledTimes(1)
        expect(mockRunVerification).toHaveBeenCalledTimes(1)
        expect(ctx.repoResults[0].verificationSkipped).toBe('no-write')
    })

    it('有告警但全部不可修复：不采样基线、也不跑终验（0 写入）', async () => {
        mockFetchRepoAlerts.mockResolvedValue([makeAlert()])
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        expect(mockSampleVerificationBaseline).not.toHaveBeenCalled()
        expect(mockRunVerification).not.toHaveBeenCalled()
        expect(ctx.repoResults[0].verificationSkipped).toBe('no-write')
    })

    it('跨 major 未授权的 lockfile 告警不得否决其他可写工作：仍采样基线且归因生效', async () => {
        // pnpm-lock 中 lodash 3.x → 推荐 4.x：跨 major 未授权 ⇒ lockfile 这一贡献被否决；
        // 但自动修复模板告警会写盘 ⇒ 必须采样基线，终验失败必须归因本次改动
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), [
            'lockfileVersion: \'9.0\'',
            '',
            '  lodash@3.10.1:',
            '    resolution: {integrity: sha512-a}',
            '',
        ].join('\n'))
        mockFetchRepoAlerts.mockResolvedValue([makeCrossMajorLockfileAlert(), makeAutoFixableCodeScanningAlert()])
        mockRunCodeScanningFixes.mockResolvedValue({ fixed: 1, failed: 0 })
        let call = 0
        mockRunVerification.mockImplementation(async ({ commands }: { commands: string[] }) => {
            call += 1
            // ① 基线（绿）② 修复后终验（红 = 本次引入）
            return call === 2
                ? { success: false, commandResults: failingResults(commands, 'pnpm test') }
                : { success: true, commandResults: successResults(commands) }
        })
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        expect(mockSampleVerificationBaseline).toHaveBeenCalledTimes(1)
        expect(ctx.repoResults[0].verificationBlocking).toBe(true)
    })

    it('多仓共享 workDir：零告警仓库先处理不采样，有可写工作的仓库采样一次（运行级首采复用不变）', async () => {
        mockFetchRepoAlerts
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([makeAutoFixableCodeScanningAlert()])
            .mockResolvedValueOnce([makeAutoFixableCodeScanningAlert({ id: 2 })])
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/zero')
        expect(mockSampleVerificationBaseline).not.toHaveBeenCalled()

        await processRepoFix(ctx, null, 'foo/alerts')
        await processRepoFix(ctx, null, 'foo/alerts-2')

        // 采样发生在「首个有可写工作的仓库」，且整个运行只发生一次（后续仓库复用）
        expect(mockSampleVerificationBaseline).toHaveBeenCalledTimes(1)
        expect(mockSampleVerificationBaseline.mock.calls[0]![1]).toBe('foo/alerts')
        // zero 仓修复后 1 次 + 首个 alerts 仓基线 1 次（两个 alerts 仓均无实际写入 → 终验跳过）
        expect(mockRunVerification).toHaveBeenCalledTimes(2)
    })

    it('零告警 + 既有失败：按既有失败豁免（不归因本次），出口码保持 0', async () => {
        mockFetchRepoAlerts.mockResolvedValue([])
        mockRunVerification.mockImplementation(async ({ commands }: { commands: string[] }) => ({
            success: false,
            commandResults: failingResults(commands, 'pnpm test'),
        }))
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        // 原始口径（全绿信号）不变；归因口径豁免——门禁不据此回滚
        expect(ctx.repoResults[0].verificationPassed).toBe(false)
        expect(ctx.repoResults[0].verificationBlocking).toBe(false)
        expect(ctx.allActions.find((a) => a.type === 'verification' && a.target === 'pnpm test')?.preExisting).toBe(true)
        // 报告口径：类别与既有基线失败一致（出口码 / 门禁谓词零退化），文案标明来源
        expect(ctx.allErrors).toEqual([
            expect.objectContaining({ category: 'PRE_EXISTING_FAILURE', target: 'pnpm test' }),
        ])
        expect(ctx.allErrors[0]!.message).toContain('no alerts or pending fixes')
        // 同族不变量（零告警 + 既有失败若无其它失败 ⇒ exit 0，不得退化为 2）：口径见
        // docs/design/modules/dependency-fixer-records.md 验证链章节「零告警仓库按需跳过修复前基线采样」
        expect(computeExitCode(ctx)).toBe(0)
    })

    it('混合形态：健康零告警仓库 + 有写盘仓库真实失败 → exit 1（不得退化为 2）', async () => {
        mockFetchRepoAlerts.mockResolvedValueOnce([]).mockResolvedValueOnce([makeAutoFixableCodeScanningAlert()])
        mockRunCodeScanningFixes.mockResolvedValue({ fixed: 1, failed: 0 })
        let call = 0
        mockRunVerification.mockImplementation(async ({ commands }: { commands: string[] }) => {
            call += 1
            // 调用序：① 零告警仓修复后（绿）② 有告警仓基线（绿）③ 有告警仓修复后（红 = 本次引入）
            return call === 3
                ? { success: false, commandResults: failingResults(commands, 'pnpm test') }
                : { success: true, commandResults: successResults(commands) }
        })
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/zero')
        await processRepoFix(ctx, null, 'foo/alerts')

        expect(ctx.repoResults[0].verificationPassed).toBe(true)
        expect(ctx.repoResults[1].verificationPassed).toBe(false)
        expect(ctx.repoResults[1].verificationBlocking).toBe(true)
        expect(computeExitCode(ctx)).toBe(1)
    })
})

describe('ensureVerificationBaseline 仓库归属', () => {
    const installFailure: CommandResult = {
        command: 'pnpm install --frozen-lockfile',
        exitCode: 1,
        durationMs: 1,
        stdout: 'gyp ERR! find Python',
        stderr: '',
    }

    it('A 仓的基线不用于 B 仓的快速失败', async () => {
        const ctx = makeCtx(process.cwd())
        ctx.verificationBaseline = { repo: 'foo/a', value: [installFailure] }

        const result = await ensureVerificationBaseline(ctx, 'foo/b', { hasWork: true })

        expect(result.baseline).toBeUndefined()
        expect(result.exemptAttribution).toBe(false)
    })

    it('采样仓库自身可取回基线', async () => {
        const ctx = makeCtx(process.cwd())
        ctx.verificationBaseline = { repo: 'foo/a', value: [installFailure] }

        const result = await ensureVerificationBaseline(ctx, 'foo/a', { hasWork: true })

        expect(result.baseline).toEqual([installFailure])
    })
})

describe('findInstallBaselineFailure', () => {
    it('命中默认链的 pnpm install 失败', () => {
        const failure = findInstallBaselineFailure([
            { command: 'pnpm install --frozen-lockfile', exitCode: 1, durationMs: 1, stdout: 'gyp ERR! find Python', stderr: '' },
            { command: 'pnpm lint', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
        ])

        expect(failure?.command).toBe('pnpm install --frozen-lockfile')
    })

    it('命中 corepack 版本绑定的 install 超时', () => {
        const failure = findInstallBaselineFailure([
            { command: 'corepack pnpm@11.18.0 install --frozen-lockfile', exitCode: -1, durationMs: 1, timedOut: true, stdout: '', stderr: '' },
        ])

        expect(failure?.command).toContain('corepack pnpm@11.18.0 install')
    })

    it('不把 lint / build / test 的既有失败当成安装失败', () => {
        const failure = findInstallBaselineFailure([
            { command: 'pnpm install --frozen-lockfile', exitCode: 0, durationMs: 1, stdout: '', stderr: '' },
            { command: 'pnpm lint', exitCode: 1, durationMs: 1, stdout: '', stderr: 'lint failed' },
        ])

        expect(failure).toBeUndefined()
    })
})
