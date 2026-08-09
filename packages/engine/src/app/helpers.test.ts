import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError, type FixAction } from '@dependfix/core'
import {
    autoCleanupMergedBranches,
    buildCommitMessage,
    buildPrTitle,
    buildVersionedOverrides,
    closeSupersededPRs,
    codeScanningAlertsTokenHint,
    computeExitCode,
    dependabotAlertsTokenHint,
    hasMultipleMajorVersions,
    pullRequestCreationHint,
    resolveAlertRepositories,
    tryLockfileRepair,
    verifyProject,
    mergeAiUsage,
    type AppContext,
} from './helpers'

// ---------------------------------------------------------------------------
// Mock engine 内部模块（engine 内相对导入，mock 路径用相对引用）：
// - pr-creator 方法（autoCleanupMergedBranches / closeSupersededPRs 依赖）
// - inferRepoFromGitRemote（resolveAlertRepositories 依赖）
// - repairLockfile（tryLockfileRepair 依赖，避免真实 pnpm）
// ---------------------------------------------------------------------------

const prCreatorMock = vi.hoisted(() => ({
    listDependfixBranches: vi.fn(),
    getBranchPrStatus: vi.fn(),
    deleteRemoteBranch: vi.fn(),
    closePullRequest: vi.fn(),
    stageAndCommit: vi.fn(),
    isConfirmAnswer: vi.fn(),
}))

const configMock = vi.hoisted(() => ({
    inferRepoFromGitRemote: vi.fn(),
}))

const pnpmFixerMock = vi.hoisted(() => ({
    repairLockfile: vi.fn(),
}))

vi.mock('../github/pr-creator', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../github/pr-creator')>()
    return { ...actual, ...prCreatorMock }
})

vi.mock('../config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../config')>()
    return { ...actual, inferRepoFromGitRemote: configMock.inferRepoFromGitRemote }
})

vi.mock('../fixers/pnpm', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixers/pnpm')>()
    return { ...actual, repairLockfile: pnpmFixerMock.repairLockfile }
})

// ---------------------------------------------------------------------------
// Mock verification-runner（verifyProject 依赖，避免真实 spawn）
// ---------------------------------------------------------------------------

const verificationRunnerMock = vi.hoisted(() => ({
    runVerification: vi.fn(),
}))

vi.mock('../runners/verification-runner', () => verificationRunnerMock)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<AppContext> = {}): Pick<AppContext, 'config' | 'allErrors' | 'allActions' | 'repoResults'> {
    return {
        config: { mode: 'report-only' } as AppContext['config'],
        allErrors: [],
        allActions: [],
        repoResults: [],
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// mergeAiUsage（run 级 AI 用量聚合）
// ---------------------------------------------------------------------------

describe('mergeAiUsage', () => {
    it('returns undefined when single call has no usage', () => {
        expect(mergeAiUsage(undefined, undefined)).toBeUndefined()
        expect(mergeAiUsage(undefined, { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 })).toBeUndefined()
    })

    it('accumulates calls and tokens', () => {
        const agg = mergeAiUsage(
            { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0001 },
            { calls: 2, inputTokens: 300, outputTokens: 60, totalTokens: 360, estimatedCostUsd: 0.0003 },
        )
        // 浮点累加误差（0.0001 + 0.0003）用近似断言；其余字段用 toMatchObject（cost 单独断言）
        expect(agg).toMatchObject({
            calls: 3,
            inputTokens: 400,
            outputTokens: 100,
            totalTokens: 500,
        })
        expect(agg?.estimatedCostUsd).toBeCloseTo(0.0004, 6)
    })

    it('takes cost from the first call when aggregate starts empty', () => {
        const agg = mergeAiUsage(
            undefined,
            { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0003 },
        )
        expect(agg?.estimatedCostUsd).toBeCloseTo(0.0003, 6)
    })

    it('preserves aggregate when new usage is undefined', () => {
        const agg = { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0001 }
        expect(mergeAiUsage(agg, undefined)).toBe(agg)
    })

    it('drops cost to undefined when either side lacks price data', () => {
        const noCost = { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: undefined }
        const withCost = { calls: 1, inputTokens: 100, outputTokens: 40, totalTokens: 140, estimatedCostUsd: 0.0001 }
        expect(mergeAiUsage(noCost, withCost)?.estimatedCostUsd).toBeUndefined()
        expect(mergeAiUsage(withCost, noCost)?.estimatedCostUsd).toBeUndefined()
    })
})

// ---------------------------------------------------------------------------
// computeExitCode
// ---------------------------------------------------------------------------

describe('computeExitCode', () => {
    it('returns 0 when everything succeeds (report-only)', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{ success: true } as never],
            repoResults: [{ alertsCount: 3, fixed: 2, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 0 when nothing to process and no errors', () => {
        expect(computeExitCode(makeCtx())).toBe(0)
    })

    it('returns 2 when a repo fails and nothing succeeds', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    // 回归：report-only 模式（默认模式）fetch 403 必须非零退出
    it('returns 2 for report-only mode when fetch fails with 403', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fetch',
                category: 'FETCH_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    // 回归：fix 模式 fetch 403 必须非零退出
    it('returns 2 for fix mode when fetch fails with 403', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix' } as AppContext['config'],
            allErrors: [{
                repository: 'foo/bar',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    it('returns 1 when some repos succeed and others fail', () => {
        const exitCode = computeExitCode(makeCtx({
            allErrors: [{ repository: 'foo/bad', category: 'PROCESS_FAILED' } as never],
            repoResults: [
                { alertsCount: 0, fixed: 0 } as never,
                { alertsCount: 5, fixed: 5, verificationPassed: true } as never,
            ],
        }))
        expect(exitCode).toBe(1)
    })

    // 回归：code-scanning 修复的 noOp（陈旧告警/无模板）不计 failed，不得触发非零退出
    it('returns 0 when only noOp code-scanning-fix actions exist (no permanent failure semantics)', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{
                type: 'code-scanning-fix',
                repository: 'foo/bar',
                target: 'eol-last',
                success: true,
                noOp: true,
                error: 'no fix template for rule',
            } as never],
            repoResults: [{ alertsCount: 1, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    // 回归：code-scanning 真实失败（写盘失败/验证回滚）仍计入 failed → 非零退出
    it('returns 1 when code-scanning fix fails but repo has success', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{
                type: 'code-scanning-fix',
                repository: 'foo/bar',
                target: 'eol-last',
                success: false,
                error: 'cannot write src/foo.ts',
            } as never],
            repoResults: [{ alertsCount: 2, fixed: 1, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(1)
    })

    // 回归：fix-and-pr 模式 fetch 403（PERMISSION_DENIED）时必须非零退出，杜绝静默空跑
    it('returns 2 for fix-and-pr mode when fetch fails with 403 and no repo succeeds', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{
                repository: 'dependfix/dependfix',
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: 'fetch dependabot alerts for dependfix/dependfix: Resource not accessible by integration',
            } as never],
            repoResults: [{ alertsCount: 0, fixed: 0 } as never],
        }))
        expect(exitCode).toBe(2)
    })

    it('returns 1 for fix-and-pr mode when fetch fails for one repo but another succeeds', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            allErrors: [{ repository: 'foo/bad', category: 'PROCESS_FAILED' } as never],
            repoResults: [
                { alertsCount: 0, fixed: 0 } as never,
                { alertsCount: 2, fixed: 2, verificationPassed: true } as never,
            ],
        }))
        expect(exitCode).toBe(1)
    })

    it('returns 0 for fix-and-pr mode on a clean run (no errors, no failures)', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'fix-and-pr' } as AppContext['config'],
            repoResults: [{ alertsCount: 0, fixed: 0, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 0 for cleanup-branches mode with a successful branch-cleanup action', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'cleanup-branches' } as AppContext['config'],
            allActions: [{ type: 'branch-cleanup', success: true } as never],
        }))
        expect(exitCode).toBe(0)
    })

    it('returns 2 for cleanup-branches mode with errors', () => {
        const exitCode = computeExitCode(makeCtx({
            config: { mode: 'cleanup-branches' } as AppContext['config'],
            allErrors: [{ repository: 'foo/bar', category: 'PROCESS_FAILED' } as never],
        }))
        expect(exitCode).toBe(2)
    })

    it('returns 1 when failed actions and errors coexist with repo success', () => {
        const exitCode = computeExitCode(makeCtx({
            allActions: [{ success: false } as never],
            allErrors: [{ repository: 'foo/bar', category: 'PROCESS_FAILED' } as never],
            repoResults: [{ alertsCount: 3, fixed: 2, verificationPassed: true } as never],
        }))
        expect(exitCode).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// dependabotAlertsTokenHint
// ---------------------------------------------------------------------------

describe('buildCommitMessage', () => {
    const upgrade = (overrides: Partial<FixAction>): FixAction => ({
        type: 'dependency-upgrade',
        repository: 'foo/bar',
        target: 'vite',
        success: true,
        ...overrides,
    })

    it('returns title only when there are no successful upgrades', () => {
        expect(buildCommitMessage([])).toBe('fix(deps): automated dependfix security repair')
        expect(buildCommitMessage([{
            type: 'verification',
            repository: 'foo/bar',
            target: 'pnpm lint',
            success: true,
        }])).toBe('fix(deps): automated dependfix security repair')
    })

    it('excludes PR-record actions from details', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'PR #42 (existing)', toVersion: 'https://github.com/foo/bar/pull/42' }),
            upgrade({ target: 'js-yaml', fromVersion: 'unknown', toVersion: '^4.3.0' }),
        ])
        expect(msg).not.toContain('PR #42')
        expect(msg).toContain('- js-yaml: ^4.3.0')
        expect(msg).toContain('bump js-yaml')
    })

    it('uses single-package bump title with from → to (Dependabot style)', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'flatted', fromVersion: '3.3.3', toVersion: '3.4.2', strategy: 'override' }),
        ])
        expect(msg).toBe([
            'fix(deps): bump flatted from 3.3.3 to 3.4.2',
            '',
            '- flatted: 3.3.3 → 3.4.2 (pnpm overrides)',
        ].join('\n'))
    })

    it('omits from-version in title when unknown', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'fast-uri', fromVersion: 'unknown', toVersion: '^3.1.5' }),
        ])
        expect(msg).toContain('fix(deps): bump fast-uri to ^3.1.5')
    })

    it('lists all packages in title when under header limit', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'vite', fromVersion: '^8.2.0', toVersion: '^6.4.3' }),
            upgrade({ target: 'lodash', fromVersion: 'unknown', toVersion: '^4.18.0' }),
        ])
        expect(msg).toBe([
            'fix(deps): bump vite, lodash',
            '',
            '- vite: ^8.2.0 → ^6.4.3',
            '- lodash: ^4.18.0',
        ].join('\n'))
    })

    it('truncates title with "and N more" when package list exceeds header limit', () => {
        const names = Array.from({ length: 12 }, (_, i) => `package-name-${i + 1}`)
        const msg = buildCommitMessage(names.map((n) => upgrade({ target: n, toVersion: '^1.0.0' })))
        const [title] = msg.split('\n')
        expect(title).toMatch(/^fix\(deps\): bump .+ and \d+ more$/)
        expect(title.length).toBeLessThanOrEqual(140)
        // 明细仍然完整列出所有包
        expect(msg).toContain('- package-name-12: ^1.0.0')
    })

    it('marks pnpm overrides strategy in the detail line', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'fast-uri', fromVersion: 'unknown', toVersion: '^3.1.5', strategy: 'override' }),
        ])
        expect(msg).toContain('- fast-uri: ^3.1.5 (pnpm overrides)')
    })

    it('ignores failed upgrades', () => {
        const msg = buildCommitMessage([
            upgrade({ success: false, toVersion: '^9.0.0', error: 'peer conflict' }),
            upgrade({ target: 'js-yaml', fromVersion: 'unknown', toVersion: '^4.3.0' }),
        ])
        expect(msg).not.toContain('peer conflict')
        expect(msg).toContain('- js-yaml: ^4.3.0')
    })
})

// ---------------------------------------------------------------------------
// buildPrTitle（收尾审查遗留：cs-only 修复不再误标 N upgrades）
// ---------------------------------------------------------------------------

describe('buildPrTitle', () => {
    it('labels upgrade-only runs as upgrades', () => {
        expect(buildPrTitle({ alertsFixed: 3 }, [
            { type: 'dependency-upgrade', repository: 'a/b', target: 'lodash', success: true },
        ])).toBe('fix(deps): automated security fix — 3 upgrades')
    })

    it('labels code-scanning-only runs as code fixes (not upgrades)', () => {
        expect(buildPrTitle({ alertsFixed: 2 }, [
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
        ])).toBe('fix(deps): automated security fix — 2 code fixes')
    })

    it('combines upgrades and code fixes', () => {
        expect(buildPrTitle({ alertsFixed: 3 }, [
            { type: 'dependency-upgrade', repository: 'a/b', target: 'lodash', success: true },
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true },
        ])).toBe('fix(deps): automated security fix — 1 upgrade, 2 code fixes')
    })

    it('uses neutral title when nothing was fixed (lockfile-only runs)', () => {
        expect(buildPrTitle({ alertsFixed: 0 }, [])).toBe('fix(deps): automated security fix')
    })

    it('excludes noOp code-scanning actions from the fix count', () => {
        expect(buildPrTitle({ alertsFixed: 0 }, [
            { type: 'code-scanning-fix', repository: 'a/b', target: 'eol-last', success: true, noOp: true },
        ])).toBe('fix(deps): automated security fix')
    })
})

describe('pullRequestCreationHint', () => {
    it('returns guidance for GITHUB_TOKEN PR creation 403', () => {
        const hint = pullRequestCreationHint(new AppError(
            'PERMISSION_DENIED',
            'GitHub Actions is not permitted to create or approve pull requests. - https://docs.github.com/rest/pulls/pulls#create-a-pull-request',
        ))
        expect(hint).toContain('Allow GitHub Actions to create and approve pull requests')
        expect(hint).toContain('pull-requests: write')
    })

    it('returns null for other errors', () => {
        expect(pullRequestCreationHint(new AppError('PERMISSION_DENIED', 'Resource not accessible by integration'))).toBeNull()
        expect(pullRequestCreationHint(new AppError('REPO_NOT_FOUND', 'not found'))).toBeNull()
        expect(pullRequestCreationHint(new Error('boom'))).toBeNull()
    })
})

describe('dependabotAlertsTokenHint', () => {
    it('returns a hint for PERMISSION_DENIED (GITHUB_TOKEN cannot read Dependabot alerts)', () => {
        const hint = dependabotAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch dependabot alerts for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toContain('security_events')
        expect(hint).toContain('Dependabot alerts: read')
        expect(hint).toContain('GITHUB_TOKEN')
        expect(hint).toContain('GitHub App')
    })

    it('returns a hint for AUTHENTICATION_FAILED', () => {
        const hint = dependabotAlertsTokenHint(new AppError(
            'AUTHENTICATION_FAILED',
            'fetch dependabot alerts for foo/bar: Bad credentials',
        ))
        expect(hint).toContain('token 无效或已过期')
    })

    it('returns null for other AppError codes', () => {
        expect(dependabotAlertsTokenHint(new AppError('RATE_LIMITED', 'fetch dependabot alerts for foo/bar: rate limited'))).toBeNull()
        expect(dependabotAlertsTokenHint(new AppError('REPO_NOT_FOUND', 'fetch dependabot alerts for foo/bar: not found'))).toBeNull()
        expect(dependabotAlertsTokenHint(new AppError('NETWORK_ERROR', 'fetch dependabot alerts for foo/bar: network'))).toBeNull()
    })

    it('returns null for non-AppError values', () => {
        expect(dependabotAlertsTokenHint(new Error('boom'))).toBeNull()
        expect(dependabotAlertsTokenHint('string error')).toBeNull()
    })

    it('returns null for code scanning fetch errors (context-based routing)', () => {
        const hint = dependabotAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toBeNull()
    })
})

describe('codeScanningAlertsTokenHint', () => {
    it('returns a hint for PERMISSION_DENIED (token needs security-events: read)', () => {
        const hint = codeScanningAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for foo/bar: Resource not accessible by integration',
        ))
        expect(hint).toContain('security-events: read')
        expect(hint).toContain('Code scanning alerts: read')
    })

    it('returns a hint for AUTHENTICATION_FAILED', () => {
        const hint = codeScanningAlertsTokenHint(new AppError(
            'AUTHENTICATION_FAILED',
            'fetch code scanning alerts for foo/bar: Bad credentials',
        ))
        expect(hint).toContain('token 无效或已过期')
    })

    it('returns hint even when repository name contains "dependabot" (context-based routing)', () => {
        // 回归：仓库名含对方关键字时不得误判（dependabot/dependabot-core 场景）
        const hint = codeScanningAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch code scanning alerts for dependabot/dependabot-core: Resource not accessible by integration',
        ))
        expect(hint).toContain('security-events: read')
    })

    it('returns null for dependabot fetch errors (context-based routing)', () => {
        const hint = codeScanningAlertsTokenHint(new AppError(
            'PERMISSION_DENIED',
            'fetch dependabot alerts for dependabot/dependabot-core: Resource not accessible by integration',
        ))
        expect(hint).toBeNull()
    })

    it('returns null for other AppError codes and non-AppError values', () => {
        expect(codeScanningAlertsTokenHint(new AppError('REPO_NOT_FOUND', 'fetch code scanning alerts for foo/bar: not found'))).toBeNull()
        expect(codeScanningAlertsTokenHint(new Error('boom'))).toBeNull()
        expect(codeScanningAlertsTokenHint('string error')).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// autoCleanupMergedBranches / closeSupersededPRs（分支清理安全边界）
// ---------------------------------------------------------------------------

describe('autoCleanupMergedBranches', () => {
    const client = {} as never
    const baseCtx = {
        config: { dryRun: false, repositories: ['foo/bar'] } as unknown as AppContext['config'],
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        allActions: [],
        allErrors: [],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        baseCtx.allActions = []
        baseCtx.allErrors = []
    })

    it('keeps branches with open PRs (safety red line)', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: false, closed: false })

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.allActions).toHaveLength(0)
    })

    it('deletes merged branches', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa', 'dependfix/auto-fix-bbb'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: true, closed: false })

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(2)
        expect(baseCtx.allActions).toHaveLength(2)
    })

    it('deletes closed (unmerged) branches', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: false, closed: true })

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(1)
    })

    it('only lists branches in dry-run mode without deleting', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: true, closed: false })

        await autoCleanupMergedBranches(
            { ...baseCtx, config: { dryRun: true, repositories: ['foo/bar'] } } as never,
            client,
            'foo/bar',
        )

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.allActions).toHaveLength(0)
    })

    it('continues on delete failure without recording errors (best-effort)', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa', 'dependfix/auto-fix-bbb'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: true, closed: false })
        prCreatorMock.deleteRemoteBranch
            .mockRejectedValueOnce(new Error('delete failed'))
            .mockResolvedValueOnce(undefined)

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(2)
        expect(baseCtx.allActions).toHaveLength(1) // 第二个分支删除成功
        expect(baseCtx.allErrors).toHaveLength(0) // 删除失败不记 error
    })
})

describe('closeSupersededPRs', () => {
    const client = {} as never
    const baseCtx = {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        allErrors: [],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        baseCtx.allErrors = []
    })

    it('deletes the head branch after successfully closing a superseded PR', async () => {
        prCreatorMock.closePullRequest.mockResolvedValue(undefined)
        prCreatorMock.deleteRemoteBranch.mockResolvedValue(undefined)

        await closeSupersededPRs(
            baseCtx as never,
            client,
            'foo',
            'bar',
            [{ number: 42, htmlUrl: 'https://github.com/foo/bar/pull/42', headRef: 'dependfix/auto-fix-old' }],
        )

        expect(prCreatorMock.closePullRequest).toHaveBeenCalledTimes(1)
        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledWith(
            client,
            'foo',
            'bar',
            'dependfix/auto-fix-old',
        )
        expect(baseCtx.allErrors).toHaveLength(0)
    })

    it('does not delete the branch when closing the PR fails', async () => {
        prCreatorMock.closePullRequest.mockRejectedValue(new Error('close failed'))

        await closeSupersededPRs(
            baseCtx as never,
            client,
            'foo',
            'bar',
            [{ number: 42, htmlUrl: 'https://github.com/foo/bar/pull/42', headRef: 'dependfix/auto-fix-old' }],
        )

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.allErrors).toHaveLength(1)
        expect(baseCtx.allErrors[0]?.category).toBe('PR_CLOSE_FAILED')
    })
})

// ---------------------------------------------------------------------------
// tryLockfileRepair（toolchain 传递 + 格式漂移标注）
// ---------------------------------------------------------------------------

describe('tryLockfileRepair', () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('passes toolchain pnpm version from config to repairLockfile', () => {
        pnpmFixerMock.repairLockfile.mockReturnValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines' },
            attemptHistory: [],
        })

        const action = tryLockfileRepair({
            config: { dryRun: false, toolchainPnpmVersion: '10.5.2' } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
        }, 'foo/bar')

        expect(pnpmFixerMock.repairLockfile).toHaveBeenCalledWith({
            workDir: '/tmp/work',
            toolchain: { pnpmVersion: '10.5.2' },
        })
        expect(action.success).toBe(true)
        expect(action.diff).toBe('lockfile updated: +10 lines')
    })

    it('annotates diff when lockfileVersion changed (format drift guard)', () => {
        pnpmFixerMock.repairLockfile.mockReturnValue({
            success: true,
            diff: { summary: 'lockfile updated: +10 lines' },
            attemptHistory: [],
            lockfileVersion: '9.0',
            lockfileVersionChanged: true,
        })

        const action = tryLockfileRepair({
            config: { dryRun: false } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
        }, 'foo/bar')

        expect(action.diff).toBe('lockfile updated: +10 lines (lockfileVersion changed)')
    })

    it('returns early success record in dry-run mode', () => {
        const action = tryLockfileRepair({
            config: { dryRun: true } as AppContext['config'],
            logger,
            workDir: '/tmp/work',
        }, 'foo/bar')

        expect(action.success).toBe(true)
        expect(pnpmFixerMock.repairLockfile).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// resolveAlertRepositories
// ---------------------------------------------------------------------------

describe('resolveAlertRepositories', () => {
    const logger = { info: vi.fn() } as never

    beforeEach(() => {
        configMock.inferRepoFromGitRemote.mockReset()
    })

    it('returns config repositories for github-dependabot source', () => {
        const repos = resolveAlertRepositories({
            config: { alertSource: 'github-dependabot', repositories: ['a/b', 'c/d'] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['a/b', 'c/d'])
    })

    it('returns explicit repo for pnpm-audit source', () => {
        const repos = resolveAlertRepositories({
            config: { alertSource: 'pnpm-audit', repositories: ['owner/repo'] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['owner/repo'])
        expect(configMock.inferRepoFromGitRemote).not.toHaveBeenCalled()
    })

    it('infers repository from git remote for pnpm-audit when no explicit repo (no token does not mean no remote)', () => {
        configMock.inferRepoFromGitRemote.mockReturnValue('owner/repo-from-remote')
        const repos = resolveAlertRepositories({
            config: { alertSource: 'pnpm-audit', repositories: [] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['owner/repo-from-remote'])
    })

    it('falls back to local when pnpm-audit has no explicit repo and no git remote', () => {
        configMock.inferRepoFromGitRemote.mockReturnValue(null)
        const repos = resolveAlertRepositories({
            config: { alertSource: 'pnpm-audit', repositories: [] } as never,
            workDir: '/repo',
            logger,
        })
        expect(repos).toEqual(['local'])
    })
})

// ---------------------------------------------------------------------------
// hasMultipleMajorVersions / buildVersionedOverrides（多版本共存 → 版本化 overrides）
// ---------------------------------------------------------------------------

describe('hasMultipleMajorVersions', () => {
    it('returns true when lockfile has multiple major versions of the package', () => {
        const lockfilePath = join(tmpdir(), 'vite-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
        ].join('\n'))

        expect(hasMultipleMajorVersions(lockfilePath, 'vite')).toBe(true)

        rmSync(lockfilePath, { force: true })
    })

    it('returns false for single version or same-major coexistence', () => {
        const lockfilePath = join(tmpdir(), 'fast-uri-lock.yaml')
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))

        expect(hasMultipleMajorVersions(lockfilePath, 'fast-uri')).toBe(false)

        rmSync(lockfilePath, { force: true })
    })

    it('returns false when lockfile missing', () => {
        expect(hasMultipleMajorVersions(join(tmpdir(), 'missing.yaml'), 'vite')).toBe(false)
    })
})

describe('buildVersionedOverrides', () => {
    const lockfilePath = join(tmpdir(), 'vite-lock.yaml')

    const alert = (packageName: string, recommendedVersion: string, overrides: Partial<Record<string, unknown>> = {}) => ({
        id: 1,
        source: 'dependabot' as const,
        repository: 'owner/repo',
        defaultBranch: 'main',
        severity: 'high' as const,
        packageEcosystem: 'npm' as const,
        packageName,
        manifestPath: 'pnpm-lock.yaml',
        ruleId: 'GHSA-xxx',
        summary: 'test',
        htmlUrl: '',
        fixable: true,
        fixStrategy: 'upgrade' as const,
        recommendedVersion,
        ...overrides,
    })

    beforeEach(() => {
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  vite@5.4.14:',
            '    resolution: {integrity: sha512-old}',
            '',
            '  vite@8.2.0:',
            '    resolution: {integrity: sha512-new}',
            '',
        ].join('\n'))
    })

    afterEach(() => {
        rmSync(lockfilePath, { force: true })
    })

    it('uses major-version key and covers the whole line (body-parser@1 style)', () => {
        const overrides = buildVersionedOverrides(lockfilePath, [alert('vite', '5.4.21')])
        // vite@5.4.14 < 5.4.21 → `vite@5` 大版本 key 覆盖整条 5.x 线；8.2.0 无推荐不覆盖
        expect(overrides).toEqual({ 'vite@5': '^5.4.21' })
    })

    it('groups multiple alerts by major and takes highest target per line (vite 5.x + 8.x alerts)', () => {
        // 多 GHSA：5.x 线推荐最高 5.4.21，8.x 线推荐最高 8.2.1（模拟 run 31028234123）
        const overrides = buildVersionedOverrides(lockfilePath, [
            alert('vite', '5.4.15'),
            alert('vite', '5.4.21'),
            alert('vite', '8.2.1'),
        ])
        expect(overrides).toEqual({
            'vite@5': '^5.4.21',
            'vite@8': '^8.2.1',
        })
    })

    it('covers same-major multi-version coexistence (fast-uri@3.1.0 + 3.1.5)', () => {
        writeFileSync(lockfilePath, [
            'lockfileVersion: \'9.0\'',
            '',
            '  fast-uri@3.1.0:',
            '    resolution: {integrity: sha512-a}',
            '',
            '  fast-uri@3.1.5:',
            '    resolution: {integrity: sha512-b}',
            '',
        ].join('\n'))
        const overrides = buildVersionedOverrides(lockfilePath, [alert('fast-uri', '3.1.5')])
        // 3.1.0 脆弱 → fast-uri@3 覆盖整条 3.x 线（含已安全的 3.1.5 保持不动）
        expect(overrides).toEqual({ 'fast-uri@3': '^3.1.5' })
    })

    it('returns empty when target is higher than all instances (already safe)', () => {
        const overrides = buildVersionedOverrides(lockfilePath, [alert('vite', '5.4.10')])
        expect(overrides).toEqual({})
    })

    it('returns empty when recommendedVersion missing', () => {
        const noTarget = alert('vite', '5.4.21', { recommendedVersion: undefined })
        expect(buildVersionedOverrides(lockfilePath, [noTarget])).toEqual({})
    })

    it('returns empty when no alerts provided', () => {
        expect(buildVersionedOverrides(lockfilePath, [])).toEqual({})
    })
})

// ---------------------------------------------------------------------------
// verifyProject（默认命令链 install 与工具链同版本）
// ---------------------------------------------------------------------------

describe('verifyProject', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-verify-'))
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            scripts: { lint: 'eslint .', build: 'tsc' },
        }, null, 2))
        verificationRunnerMock.runVerification.mockReset()
        verificationRunnerMock.runVerification.mockResolvedValue({
            success: true,
            commandResults: [],
        })
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    function makeVerifyCtx(toolchainPnpmVersion?: string, customCommands?: string[]): Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'> {
        return {
            config: {
                toolchainPnpmVersion,
            } as AppContext['config'],
            customCommands,
            logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as AppContext['logger'],
            workDir,
            allErrors: [],
        }
    }

    it('replaces install command with corepack when toolchain version is set', async () => {
        await verifyProject(makeVerifyCtx('10.5.2'), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands[0]).toBe('corepack pnpm@10.5.2 install --frozen-lockfile')
        expect(commands[1]).toBe('pnpm lint')
        expect(commands[2]).toBe('pnpm build')
    })

    it('keeps bare pnpm install when no toolchain version is set', async () => {
        await verifyProject(makeVerifyCtx(undefined), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands[0]).toBe('pnpm install --frozen-lockfile')
    })

    it('does not touch custom commands', async () => {
        await verifyProject(makeVerifyCtx('10.5.2', ['pnpm test']), 'foo/bar')

        const commands = verificationRunnerMock.runVerification.mock.calls[0][0].commands
        expect(commands).toEqual(['pnpm test'])
    })
})
