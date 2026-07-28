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
            '--repository',
            'cli-owner/repo-a',
            '--repository=cli-owner/repo-b',
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
