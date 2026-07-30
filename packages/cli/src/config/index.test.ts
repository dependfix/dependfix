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
            githubToken: 'token-from-env',
            maxAlertsPerRepository: 10,
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
            githubToken: 'token-from-cli',
            maxAlertsPerRepository: 3,
        })
    })

    it('throws readable validation errors for missing critical config', () => {
        expect(() => resolveRuntimeConfig({ env: {} })).toThrowError(AppError)
        expect(() => resolveRuntimeConfig({ env: {} })).toThrow('Missing GitHub token')
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
        const m = GITHUB_REMOTE_RE.exec('https://github.com/CaoMeiYouRen/dependfix.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('CaoMeiYouRen')
        expect(m[2]).toBe('dependfix')
    })

    it('matches HTTPS GitHub URL without .git suffix', () => {
        const m = GITHUB_REMOTE_RE.exec('https://github.com/CaoMeiYouRen/dependfix')
        expect(m).not.toBeNull()
        expect(m[2]).toBe('dependfix')
    })

    it('matches SSH git@ format', () => {
        const m = GITHUB_REMOTE_RE.exec('git@github.com:CaoMeiYouRen/dependfix.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('CaoMeiYouRen')
        expect(m[2]).toBe('dependfix')
    })

    it('matches SSH ssh:// format', () => {
        const m = GITHUB_REMOTE_RE.exec('ssh://git@github.com/CaoMeiYouRen/dependfix.git')
        expect(m).not.toBeNull()
        expect(m[1]).toBe('CaoMeiYouRen')
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
