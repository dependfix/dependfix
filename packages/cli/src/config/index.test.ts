import { describe, expect, it } from 'vitest'
import { AppError } from '@dependfix/core'
import { parseCliArgs } from '../cli'
import { resolveRuntimeConfig } from './index'

describe('resolveRuntimeConfig', () => {
    it('reads defaults from env when required inputs exist', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a, owner/repo-b',
            },
        })

        expect(config).toEqual({
            mode: 'report-only',
            severityThreshold: 'high',
            repositories: ['owner/repo-a', 'owner/repo-b'],
            dryRun: true,
            createPullRequest: false,
            commit: false,
            cleanupBranches: false,
            cleanupBranchesAuto: false,
            githubToken: 'token-from-env',
            maxAlertsPerRepository: 20,
        })
    })

    it('lets cli overrides take precedence over env', () => {
        const invocation = parseCliArgs([
            'fix',
            '--severity-threshold=critical',
            '--repository=cli-owner/repo-a,cli-owner/repo-b',
            '--github-token',
            'token-from-cli',
            '--no-dry-run',
            '--max-alerts-per-repository',
            '3',
        ])

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'env-owner/repo-c',
                AUTO_FIX_GITHUB_SECURITY_SEVERITY_THRESHOLD: 'medium',
                AUTO_FIX_GITHUB_SECURITY_DRY_RUN: 'true',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config).toEqual({
            mode: 'fix',
            severityThreshold: 'critical',
            repositories: ['env-owner/repo-c', 'cli-owner/repo-a', 'cli-owner/repo-b'],
            dryRun: false,
            createPullRequest: false,
            commit: false,
            cleanupBranches: false,
            cleanupBranchesAuto: false,
            githubToken: 'token-from-cli',
            maxAlertsPerRepository: 3,
        })
    })

    it('throws readable validation errors for missing critical config', () => {
        expect(() => resolveRuntimeConfig({ env: {} })).toThrowError(AppError)
        expect(() => resolveRuntimeConfig({ env: {} })).toThrow('Missing GitHub token')
    })

    it('reads alertsToken from env (Dependabot alerts 专用最小权限 token)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN: 'github_pat_alerts_only',
            },
        })

        expect(config.alertsToken).toBe('github_pat_alerts_only')
        expect(config.githubToken).toBe('token-from-env')
    })

    it('lets cli alerts-token override env alertsToken', () => {
        const invocation = parseCliArgs([
            'report-only',
            '--github-token',
            'token-from-cli',
            '--alerts-token',
            'alerts-from-cli',
        ])

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN: 'alerts-from-env',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.alertsToken).toBe('alerts-from-cli')
    })

    it('leaves alertsToken undefined when not provided (fallback to githubToken)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
            },
        })

        expect(config.alertsToken).toBeUndefined()
    })

    it('reads cleanupBranchesAuto from env', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES_AUTO: 'true',
            },
        })

        expect(config.cleanupBranchesAuto).toBe(true)
    })

    it('lets cli cleanup-branches-auto override env', () => {
        const invocation = parseCliArgs([
            'fix-and-pr',
            '--github-token',
            'token-from-cli',
            '--cleanup-branches-auto',
        ])

        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES_AUTO: 'false',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.cleanupBranchesAuto).toBe(true)
    })

    it('rejects invalid create pr combinations', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_CREATE_PR: 'true',
            },
        })).toThrow('createPullRequest cannot be enabled when mode is report-only.')
    })

    it('resolves fix-and-pr defaults to dryRun=false and createPullRequest=true', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix-and-pr',
            },
        })

        expect(config.mode).toBe('fix-and-pr')
        expect(config.dryRun).toBe(false)
        expect(config.createPullRequest).toBe(true)
        // 默认组合必须通过互斥校验（dryRun && createPullRequest 不允许）
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix-and-pr',
            },
        })).not.toThrow()
    })

    it('rejects dryRun together with createPullRequest', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix-and-pr',
                AUTO_FIX_GITHUB_SECURITY_DRY_RUN: 'true',
            },
        })).toThrow('createPullRequest cannot be enabled while dryRun is true.')
    })

    it('resolves cleanup-branches mode without repair-specific flags', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'cleanup-branches',
            },
        })

        expect(config.mode).toBe('cleanup-branches')
        expect(config.createPullRequest).toBe(false)
        expect(config.dryRun).toBe(false)
        expect(config.commit).toBe(false)
    })

    it('enables cleanupBranches from cli override', () => {
        const invocation = parseCliArgs([
            'fix-and-pr',
            '--repository=owner/repo-a',
            '--github-token',
            't',
            '--cleanup-branches',
        ])

        const config = resolveRuntimeConfig({ cliOverrides: invocation.configOverrides })
        expect(config.cleanupBranches).toBe(true)
    })

    it('enables commit from cli override', () => {
        const invocation = parseCliArgs([
            'fix',
            '--repository=owner/repo-a',
            '--github-token',
            't',
            '--commit',
        ])

        const config = resolveRuntimeConfig({ cliOverrides: invocation.configOverrides })
        expect(config.commit).toBe(true)
    })

    it('rejects commit while dry-run is enabled', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix',
                AUTO_FIX_GITHUB_SECURITY_COMMIT: 'true',
                AUTO_FIX_GITHUB_SECURITY_DRY_RUN: 'true',
            },
        })).toThrow('commit cannot be enabled while dryRun is true.')
    })

    it('rejects commit in report-only mode', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_COMMIT: 'true',
            },
        })).toThrow('commit is only supported in fix mode.')
    })

    it('rejects commit in fix-and-pr mode even without create-pr', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix-and-pr',
                AUTO_FIX_GITHUB_SECURITY_COMMIT: 'true',
                AUTO_FIX_GITHUB_SECURITY_CREATE_PR: 'false',
            },
        })).toThrow('commit is only supported in fix mode.')
    })

    it('rejects commit together with createPullRequest', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a',
                AUTO_FIX_GITHUB_SECURITY_MODE: 'fix',
                AUTO_FIX_GITHUB_SECURITY_COMMIT: 'true',
                AUTO_FIX_GITHUB_SECURITY_CREATE_PR: 'true',
            },
        })).toThrow('commit cannot be enabled together with createPullRequest.')
    })

    it('rejects invalid repository identifier format', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                AUTO_FIX_GITHUB_SECURITY_REPOSITORIES: 'owner/repo-a, invalid-repo, owner/repo-b',
            },
        })).toThrow('Invalid repository identifier')
    })
})

// ===========================================================================
// GitHub remote URL regex (used by inferRepoFromGitRemote)
// ===========================================================================

const GITHUB_REMOTE_RE = /github\.com[/:]([^/]+)\/([^/\s.]+?)(?:\.git)?\s*$/i

describe('GITHUB_REMOTE_RE', () => {
    it('matches HTTPS GitHub URL with .git suffix', () => {
        const m = GITHUB_REMOTE_RE.exec('https://github.com/dependfix/dependfix.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('dependfix')
        expect(m[2]).toBe('dependfix')
    })

    it('matches HTTPS GitHub URL without .git suffix', () => {
        const m = GITHUB_REMOTE_RE.exec('https://github.com/dependfix/dependfix')
        expect(m).not.toBeNull()
        expect(m[2]).toBe('dependfix')
    })

    it('matches SSH git@ format', () => {
        const m = GITHUB_REMOTE_RE.exec('git@github.com:dependfix/dependfix.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('dependfix')
        expect(m[2]).toBe('dependfix')
    })

    it('matches SSH ssh:// format', () => {
        const m = GITHUB_REMOTE_RE.exec('ssh://git@github.com/dependfix/dependfix.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('dependfix')
        expect(m[2]).toBe('dependfix')
    })

    it('does not match GitLab URLs', () => {
        expect(GITHUB_REMOTE_RE.exec('https://gitlab.com/foo/bar.git')).toBeNull()
    })

    it('does not match non-GitHub URLs', () => {
        expect(GITHUB_REMOTE_RE.exec('https://example.com/foo/bar.git')).toBeNull()
    })

    it('matches with trailing whitespace/newline', () => {
        const m = GITHUB_REMOTE_RE.exec('https://github.com/owner/repo.git\n')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('owner')
        expect(m[2]).toBe('repo')
    })

    it('matches with leading whitespace', () => {
        const m = GITHUB_REMOTE_RE.exec(' https://github.com/owner/repo.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('owner')
    })
})
