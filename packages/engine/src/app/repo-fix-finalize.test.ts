// repo-fix-finalize.test.ts — processRepoFix 收尾步骤的零告警 / 0 写入守卫。
//
// 背景：finalizeRepoFix 的 lockfile repair 对零告警仓库无对象（无升级改动），且环境性安装失败
// 会在此产生非预期失败动作（2026-10-11 生产误归因）。本用例锁定三类行为：
// - 零告警 → 仅跳过 lockfile repair，**保留**修复后验证链（verificationPassed 是多仓库运行
//   出口码判定的成功信号，跳过会退化成功判定 → 整体 exit 2 误归因）
// - 有告警但 0 写入 → 跳过 lockfile repair 与后验证，记 verificationSkipped='no-write'
// - 有写入（fixed>0 或 lockfile repair 真改文件）→ 正常收尾并验证
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import type { AppContext } from './helpers'
import { processRepoFix, type RepoFixCtx, type RepoFixProgress } from './repo-fix'
import { finalizeRepoFix, isLockfileBaselineFailure } from './repo-fix-finalize'

const {
    mockFetchRepoAlerts,
    mockFetchDefaultBranch,
    mockRunCodeScanningFixes,
    mockTryLockfileRepair,
    mockVerifyProject,
} = vi.hoisted(() => ({
    mockFetchRepoAlerts: vi.fn(),
    mockFetchDefaultBranch: vi.fn(),
    mockRunCodeScanningFixes: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
    mockVerifyProject: vi.fn(),
}))

vi.mock('./repo-alerts', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./repo-alerts')>()
    return { ...actual, fetchRepoAlerts: mockFetchRepoAlerts, fetchDefaultBranch: mockFetchDefaultBranch }
})

vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return { ...actual, tryLockfileRepair: mockTryLockfileRepair, runCodeScanningFixes: mockRunCodeScanningFixes }
})

vi.mock('./verify-project', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./verify-project')>()
    return { ...actual, verifyProject: mockVerifyProject }
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
        // 不可修复（fixStrategy null）→ 分组升级不产生动作，聚焦收尾守卫本身
        fixable: false,
        fixStrategy: null,
        recommendedVersion: '',
        upstreamId: 'dependabot:1',
        ...overrides,
    }
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
            verificationsSkipped: 0,
            verificationSkippedByReason: {},
            repositoriesScanned: 0,
            reposWithAlertsDisabled: 0,
        } as never,
        // 真实运行由 index 创建运行级基线持有器；有它才会走「无工作即豁免」判定
        verificationBaseline: { value: undefined } as never,
        startedAt: '2026-10-13T00:00:00Z',
        finishedAt: '',
        aiUsageRef: { aggregate: undefined },
    }
}

describe('processRepoFix 收尾守卫（零告警跳过）', () => {
    let workDir: string

    beforeEach(() => {
        vi.clearAllMocks()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-repo-fix-'))
        writeFileSync(join(workDir, 'package.json'), '{"name":"x","version":"1.0.0"}\n')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: 9.0\n')
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('skips lockfile repair but keeps verification when the repo has no alerts', async () => {
        mockFetchRepoAlerts.mockResolvedValue([])
        mockFetchDefaultBranch.mockResolvedValue('main')
        mockRunCodeScanningFixes.mockResolvedValue({ fixed: 0, failed: 0 })
        mockVerifyProject.mockResolvedValue([])
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        expect(ctx.allErrors).toHaveLength(0)
        // 零告警：无升级改动 → 跳过 lockfile repair（环境性失败不再产生非预期失败动作）
        expect(mockTryLockfileRepair).not.toHaveBeenCalled()
        // 但验证链保留——verificationPassed 是零告警仓库唯一的「处理成功」信号
        // （跳过它会让多仓库运行的成功判定退化 → 整体 exit 2 误归因）
        expect(mockVerifyProject).toHaveBeenCalledTimes(1)
        expect(ctx.repoResults).toHaveLength(1)
        expect(ctx.repoResults[0].alertsCount).toBe(0)
        expect(ctx.repoResults[0].lockfileRepaired).toBe(false)
        expect(ctx.repoResults[0].verificationPassed).toBe(true)
    })

    it('skips lockfile repair and post-fix verification when alerts exist but no writes are possible', async () => {
        // 不可修复告警：hasWork=false（有告警但 0 写入）→ 工作区保持 pristine，后验证无对象
        mockFetchRepoAlerts.mockResolvedValue([makeAlert()])
        mockFetchDefaultBranch.mockResolvedValue('main')
        mockRunCodeScanningFixes.mockResolvedValue({ fixed: 0, failed: 0 })
        mockTryLockfileRepair.mockResolvedValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            noOp: true,
            durationMs: 1,
        })
        const ctx = makeCtx(workDir)

        await processRepoFix(ctx, null, 'foo/bar')

        expect(ctx.repoResults[0].alertsCount).toBe(1)
        // 全部不可修复 ⇒ 无可写工作：基线采样与 lockfile repair 都不付，后验证也无对象
        expect(mockTryLockfileRepair).not.toHaveBeenCalled()
        expect(mockVerifyProject).not.toHaveBeenCalled()
        expect(ctx.repoResults[0]).toMatchObject({
            verificationSkipped: 'no-write',
            verificationBlocking: false,
            verificationPassed: undefined,
        })
    })

    it('keeps verification when only the lockfile repair actually changed files', async () => {
        const ctx = makeCtx(workDir)
        mockTryLockfileRepair.mockResolvedValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            noOp: true,
            durationMs: 1,
        })
        mockVerifyProject.mockResolvedValue([])
        const progress: RepoFixProgress = {
            alertsCount: 1,
            fixable: 1,
            fixed: 0,
            failed: 0,
            lockfileRepaired: true,
            verificationPassed: undefined,
            verificationBlocking: undefined,
            defaultBranch: 'main',
        }

        await finalizeRepoFix(ctx, 'foo/bar', progress)

        // repair 真改过文件 ⇒ 有写入，不许被 0 写入判定吞掉
        expect(mockVerifyProject).toHaveBeenCalledTimes(1)
        expect(progress.verificationSkipped).toBeUndefined()
    })

    it('runs verification when the repository has executable work', async () => {
        const ctx = makeCtx(workDir)
        mockTryLockfileRepair.mockResolvedValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            noOp: true,
            durationMs: 1,
        })
        mockVerifyProject.mockResolvedValue([])
        const progress: RepoFixProgress = {
            alertsCount: 1,
            fixable: 1,
            fixed: 1,
            failed: 0,
            lockfileRepaired: false,
            verificationPassed: undefined,
            verificationBlocking: undefined,
            defaultBranch: 'main',
        }

        await finalizeRepoFix(ctx, 'foo/bar', progress)

        expect(mockVerifyProject).toHaveBeenCalledTimes(1)
        expect(progress.verificationPassed).toBe(true)
        expect(progress.verificationSkipped).toBeUndefined()
    })

    it('does not mark lockfileRepaired when the repair was a no-op', async () => {
        const ctx = makeCtx(workDir)
        mockTryLockfileRepair.mockResolvedValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            noOp: true,
            durationMs: 1,
        })
        mockVerifyProject.mockResolvedValue([])
        const progress: RepoFixProgress = {
            alertsCount: 1,
            fixable: 1,
            fixed: 1,
            failed: 0,
            lockfileRepaired: false,
            verificationPassed: undefined,
            verificationBlocking: undefined,
            defaultBranch: 'main',
        }

        await finalizeRepoFix(ctx, 'foo/bar', progress)

        expect(mockTryLockfileRepair).toHaveBeenCalledTimes(1)
        expect(progress.lockfileRepaired).toBe(false)
    })
})

describe('isLockfileBaselineFailure', () => {
    const base = { command: 'pnpm install --frozen-lockfile', exitCode: 1, durationMs: 10, stdout: '' }

    it('recognizes lockfile-specific diagnostics', () => {
        expect(isLockfileBaselineFailure({
            ...base,
            stderr: 'ERR_PNPM_BROKEN_LOCKFILE: duplicated mapping key "packages"',
        })).toBe(true)
        expect(isLockfileBaselineFailure({ ...base, stderr: 'ERR_PNPM_OUTDATED_LOCKFILE' })).toBe(true)
        expect(isLockfileBaselineFailure({
            ...base,
            stderr: '',
            stdout: 'Cannot read lockfile: duplicated mapping key',
        })).toBe(true)
    })

    it('does not treat environmental failures as a broken lockfile', () => {
        expect(isLockfileBaselineFailure({ ...base, stderr: 'ENOSPC: no space left on device' })).toBe(false)
        expect(isLockfileBaselineFailure({ ...base, stderr: '', timedOut: true })).toBe(false)
        expect(isLockfileBaselineFailure(undefined)).toBe(false)
    })
})
