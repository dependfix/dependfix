import { describe, expect, it } from 'vitest'
import { AppError, type FixAction } from '@dependfix/core'
import {
    buildCommitMessage,
    computeExitCode,
    dependabotAlertsTokenHint,
    pullRequestCreationHint,
    type AppContext,
} from './app-helpers'

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
