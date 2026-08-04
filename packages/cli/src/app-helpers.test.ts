import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError, type FixAction } from '@dependfix/core'
import {
    autoCleanupMergedBranches,
    buildCommitMessage,
    closeSupersededPRs,
    computeExitCode,
    dependabotAlertsTokenHint,
    pullRequestCreationHint,
    resolveAlertRepositories,
    type AppContext,
} from './app-helpers'
import { findVerificationFailedRepos, rollbackChanges } from './verification-gate'

// ---------------------------------------------------------------------------
// Mock pr-creator（autoCleanupMergedBranches / closeSupersededPRs 依赖）
// ---------------------------------------------------------------------------

const prCreatorMock = vi.hoisted(() => ({
    listDependfixBranches: vi.fn(),
    getBranchPrStatus: vi.fn(),
    deleteRemoteBranch: vi.fn(),
    closePullRequest: vi.fn(),
    stageAndCommit: vi.fn(),
    isConfirmAnswer: vi.fn(),
}))

vi.mock('./github/pr-creator', () => prCreatorMock)

// ---------------------------------------------------------------------------
// Mock config（resolveAlertRepositories 依赖 inferRepoFromGitRemote）
// ---------------------------------------------------------------------------

const configMock = vi.hoisted(() => ({
    inferRepoFromGitRemote: vi.fn(),
}))

vi.mock('./config', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./config')>()
    return { ...actual, inferRepoFromGitRemote: configMock.inferRepoFromGitRemote }
})

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
    })

    it('lists successful upgrades with from → to versions', () => {
        const msg = buildCommitMessage([
            upgrade({ target: 'vite', fromVersion: '^8.2.0', toVersion: '^6.4.3' }),
            upgrade({ target: 'lodash', fromVersion: 'unknown', toVersion: '^4.18.0' }),
        ])
        expect(msg).toBe([
            'fix(deps): automated dependfix security repair',
            '',
            '- vite: ^8.2.0 → ^6.4.3',
            '- lodash: ^4.18.0',
        ].join('\n'))
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
        const hint = dependabotAlertsTokenHint(new AppError('PERMISSION_DENIED', 'Resource not accessible by integration'))
        expect(hint).toContain('security_events')
        expect(hint).toContain('Dependabot alerts: read')
        expect(hint).toContain('GITHUB_TOKEN')
        expect(hint).toContain('GitHub App')
    })

    it('returns a hint for AUTHENTICATION_FAILED', () => {
        const hint = dependabotAlertsTokenHint(new AppError('AUTHENTICATION_FAILED', 'Bad credentials'))
        expect(hint).toContain('token 无效或已过期')
    })

    it('returns null for other AppError codes', () => {
        expect(dependabotAlertsTokenHint(new AppError('RATE_LIMITED', 'rate limited'))).toBeNull()
        expect(dependabotAlertsTokenHint(new AppError('REPO_NOT_FOUND', 'not found'))).toBeNull()
        expect(dependabotAlertsTokenHint(new AppError('NETWORK_ERROR', 'network'))).toBeNull()
    })

    it('returns null for non-AppError values', () => {
        expect(dependabotAlertsTokenHint(new Error('boom'))).toBeNull()
        expect(dependabotAlertsTokenHint('string error')).toBeNull()
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
// findVerificationFailedRepos / rollbackChanges（验证门禁）
// ---------------------------------------------------------------------------

describe('findVerificationFailedRepos', () => {
    it('returns empty array when all repos passed verification', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: true } as never,
            { repository: 'foo/b', verificationPassed: undefined } as never,
        ])).toEqual([])
    })

    it('returns repos whose verification failed', () => {
        expect(findVerificationFailedRepos([
            { repository: 'foo/a', verificationPassed: true } as never,
            { repository: 'foo/b', verificationPassed: false } as never,
            { repository: 'foo/c', verificationPassed: false } as never,
        ])).toEqual(['foo/b', 'foo/c'])
    })
})

describe('rollbackChanges', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-rollback-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
    })

    afterEach(() => {
        rmSync(workDir, { recursive: true, force: true })
    })

    it('discards uncommitted fix changes (working tree + index)', () => {
        writeFileSync(join(workDir, 'package.json'), '{"version":"1.0.0"}')
        execSync('git add . && git commit -qm init', { cwd: workDir })

        // 模拟修复改动：修改已跟踪文件 + 暂存
        writeFileSync(join(workDir, 'package.json'), '{"version":"2.0.0"}')
        execSync('git add package.json', { cwd: workDir })

        rollbackChanges(workDir)

        expect(execSync('git status --porcelain', { cwd: workDir, encoding: 'utf-8' }).trim()).toBe('')
        expect(execSync('git show HEAD:package.json', { cwd: workDir, encoding: 'utf-8' })).toContain('"version":"1.0.0"')
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
