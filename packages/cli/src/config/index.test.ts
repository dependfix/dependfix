import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '@dependfix/core'
import { parseCliArgs } from '../cli'
import { resolveRuntimeConfig } from './index'

describe('resolveRuntimeConfig', () => {
    it('reads defaults from env when required inputs exist', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a, owner/repo-b',
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
            alertSource: 'github-dependabot',
            codeScanningEnabled: false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 20,
            maxConcurrency: 1,
            maxRetries: 3,
            maxBackoffMs: 30000,
        })
    })

    it('parses upgradeGroups from env (name1:pkg1,pkg2;name2:pkg3)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_UPGRADE_GROUPS: 'eslint-stack:eslint,eslint-plugin-vue;types-group:@types/express,@types/koa',
            },
        })

        expect(config.upgradeGroups).toEqual({
            'eslint-stack': ['eslint', 'eslint-plugin-vue'],
            'types-group': ['@types/express', '@types/koa'],
        })
    })

    it('parses upgradeGroups from cli --upgrade-groups', () => {
        const invocation = parseCliArgs([
            'fix',
            '--repo', 'owner/repo-a',
            '--upgrade-groups', 'db:lodash,pkg-a;markdown:markdown-it,markdown-it-anchor',
        ])

        expect(invocation.configOverrides.upgradeGroups).toEqual({
            db: ['lodash', 'pkg-a'],
            markdown: ['markdown-it', 'markdown-it-anchor'],
        })
    })

    it('lets cli upgradeGroups override env upgradeGroups', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_UPGRADE_GROUPS: 'env-group:env-pkg',
            },
            cliOverrides: {
                upgradeGroups: { 'cli-group': ['cli-pkg'] },
            },
        })

        expect(config.upgradeGroups).toEqual({ 'cli-group': ['cli-pkg'] })
    })

    it('rejects malformed --upgrade-groups entries', () => {
        expect(() =>
            parseCliArgs([
                'fix',
                '--repo', 'owner/repo-a',
                '--upgrade-groups', 'missing-colon-here',
            ]),
        ).toThrowError(/Invalid --upgrade-groups entry/)
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
                DEPENDFIX_REPOSITORIES: 'env-owner/repo-c',
                DEPENDFIX_SEVERITY_THRESHOLD: 'medium',
                DEPENDFIX_DRY_RUN: 'true',
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
            alertSource: 'github-dependabot',
            codeScanningEnabled: false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 3,
            maxConcurrency: 1,
            maxRetries: 3,
            maxBackoffMs: 30000,
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
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_ALERTS_TOKEN: 'github_pat_alerts_only',
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
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_ALERTS_TOKEN: 'alerts-from-env',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.alertsToken).toBe('alerts-from-cli')
    })

    it('leaves alertsToken undefined when not provided (fallback to githubToken)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
            },
        })

        expect(config.alertsToken).toBeUndefined()
    })

    it('reads cleanupBranchesAuto from env', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_CLEANUP_BRANCHES_AUTO: 'true',
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
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_CLEANUP_BRANCHES_AUTO: 'false',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.cleanupBranchesAuto).toBe(true)
    })

    it('rejects invalid create pr combinations', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_CREATE_PR: 'true',
            },
        })).toThrow('createPullRequest cannot be enabled when mode is report-only.')
    })

    it('resolves fix-and-pr defaults to dryRun=false and createPullRequest=true', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'fix-and-pr',
            },
        })

        expect(config.mode).toBe('fix-and-pr')
        expect(config.dryRun).toBe(false)
        expect(config.createPullRequest).toBe(true)
        // 默认组合必须通过互斥校验（dryRun && createPullRequest 不允许）
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'fix-and-pr',
            },
        })).not.toThrow()
    })

    it('rejects dryRun together with createPullRequest', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_DRY_RUN: 'true',
            },
        })).toThrow('createPullRequest cannot be enabled while dryRun is true.')
    })

    it('resolves cleanup-branches mode without repair-specific flags', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'cleanup-branches',
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
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_COMMIT: 'true',
                DEPENDFIX_DRY_RUN: 'true',
            },
        })).toThrow('commit cannot be enabled while dryRun is true.')
    })

    it('rejects commit in report-only mode', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_COMMIT: 'true',
            },
        })).toThrow('commit is only supported in fix mode.')
    })

    it('rejects commit in fix-and-pr mode even without create-pr', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_COMMIT: 'true',
                DEPENDFIX_CREATE_PR: 'false',
            },
        })).toThrow('commit is only supported in fix mode.')
    })

    it('rejects commit together with createPullRequest', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_COMMIT: 'true',
                DEPENDFIX_CREATE_PR: 'true',
            },
        })).toThrow('commit cannot be enabled together with createPullRequest.')
    })

    it('rejects invalid repository identifier format', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token-from-env',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a, invalid-repo, owner/repo-b',
            },
        })).toThrow('Invalid repository identifier')
    })

    it('reads alertSource from env (pnpm-audit local fallback)', () => {
        const config = resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
            },
        })

        expect(config.alertSource).toBe('pnpm-audit')
    })

    it('lets cli alerts-source override env', () => {
        const invocation = parseCliArgs([
            'report-only',
            '--alerts-source',
            'pnpm-audit',
        ])

        const config = resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'github-dependabot',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.alertSource).toBe('pnpm-audit')
    })

    it('defaults alertSource to github-dependabot', () => {
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 'token', DEPENDFIX_REPOSITORIES: 'owner/repo-a' },
        })

        expect(config.alertSource).toBe('github-dependabot')
    })

    it('rejects invalid alerts-source value', () => {
        expect(() => resolveRuntimeConfig({
            env: { DEPENDFIX_ALERTS_SOURCE: 'osv-scanner' },
        })).toThrow('DEPENDFIX_ALERTS_SOURCE must be one of')
    })

    it('rejects invalid --alerts-source from cli (ARGUMENT_PARSE_ERROR)', () => {
        expect(() => parseCliArgs([
            'report-only',
            '--alerts-source',
            'osv-scanner',
        ])).toThrow('Invalid --alerts-source value')
    })

    it('allows pnpm-audit without GitHub token (repositories may fall back to git remote or local)', () => {
        // 无 token 不报错；无 --repo 时由 app 层解析（git remote → local 兜底）。
        // config 层在无显式 repos 时仍会尝试 git remote 推断（本仓库即 dependfix/dependfix）。
        const config = resolveRuntimeConfig({
            env: { DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit' },
        })

        expect(config.alertSource).toBe('pnpm-audit')
        expect(config.githubToken).toBe('')
        expect(config.repositories.length).toBeLessThanOrEqual(1)
    })

    it('allows pnpm-audit with a single explicit repository', () => {
        const config = resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a',
            },
        })

        expect(config.repositories).toEqual(['owner/repo-a'])
    })

    it('rejects pnpm-audit with multiple repositories (audit scans one workspace)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_REPOSITORIES: 'owner/repo-a, owner/repo-b',
            },
        })).toThrow('pnpm-audit alert source supports at most one repository')
    })

    it('rejects pnpm-audit with fix-and-pr mode (PR requires GitHub)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_MODE: 'fix-and-pr',
            },
        })).toThrow('fix-and-pr mode requires the github-dependabot alert source')
    })

    it('rejects pnpm-audit with cleanup-branches mode (branch cleanup needs GitHub API)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_MODE: 'cleanup-branches',
            },
        })).toThrow('cleanup-branches mode requires the github-dependabot alert source')
    })

    it('disables code scanning by default (backward compatible)', () => {
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_REPOSITORIES: 'foo/bar' },
        })

        expect(config.codeScanningEnabled).toBe(false)
    })

    it('enables code scanning via env flag', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })

        expect(config.codeScanningEnabled).toBe(true)
    })

    it('enables code scanning via CLI flag (three-state)', () => {
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--code-scanning'])
            .configOverrides.codeScanningEnabled).toBe(true)
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--no-code-scanning'])
            .configOverrides.codeScanningEnabled).toBe(false)
    })

    it('rejects code scanning with pnpm-audit source (Code Scanning is a GitHub API source)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_CODE_SCANNING: 'true',
            },
        })).toThrow('code-scanning requires the github-dependabot alert source')
    })

    it('disables major upgrade by default (backward compatible)', () => {
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_REPOSITORIES: 'foo/bar' },
        })

        expect(config.allowMajorUpgrade).toBe(false)
    })

    it('enables major upgrade via CLI flag (three-state)', () => {
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--allow-major-upgrade'])
            .configOverrides.allowMajorUpgrade).toBe(true)
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--no-allow-major-upgrade'])
            .configOverrides.allowMajorUpgrade).toBe(false)
    })

    it('ignores env variable for major upgrade (CLI-only, no env channel)', () => {
        // 刻意无 DEPENDFIX_ALLOW_MAJOR_UPGRADE 通道：保证 Action 结构性禁用（action.yml 未暴露 input 且无法经 env 绕过）
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_ALLOW_MAJOR_UPGRADE: 'true',
            },
        })

        expect(config.allowMajorUpgrade).toBe(false)
    })

    it('reads toolchainPnpmVersion from env and CLI', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_TOOLCHAIN_PNPM_VERSION: '10.5.2',
            },
        })
        expect(config.toolchainPnpmVersion).toBe('10.5.2')

        const invocation = parseCliArgs([
            'fix',
            '--repo', 'foo/bar',
            '--github-token', 't',
            '--toolchain-pnpm-version', '9.8.0',
        ])
        expect(invocation.configOverrides.toolchainPnpmVersion).toBe('9.8.0')
    })

    it('defaults toolchainPnpmVersion to undefined (resolved from packageManager at repair time)', () => {
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_REPOSITORIES: 'foo/bar' },
        })
        expect(config.toolchainPnpmVersion).toBeUndefined()
    })

    it('rejects unsafe toolchainPnpmVersion (command injection guard)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_TOOLCHAIN_PNPM_VERSION: '1; touch /tmp/pwned',
            },
        })).toThrow('Invalid toolchainPnpmVersion')
    })

    it('still requires token for github-dependabot source', () => {
        expect(() => resolveRuntimeConfig({
            env: { DEPENDFIX_ALERTS_SOURCE: 'github-dependabot' },
        })).toThrow('Missing GitHub token')
    })

    // -----------------------------------------------------------------------
    // owner discovery
    // -----------------------------------------------------------------------

    it('parses owner and repoTopics from env (comma separated)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_OWNER: 'foo, my-org',
                DEPENDFIX_REPO_TOPICS: 'node, pnpm',
            },
        })

        expect(config.owner).toEqual(['foo', 'my-org'])
        expect(config.repoTopics).toEqual(['node', 'pnpm'])
    })

    it('parses repo include/exclude/topics-exclude policies from env', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_OWNER: 'foo',
                DEPENDFIX_REPO_INCLUDE: 'foo/*,bar/*',
                DEPENDFIX_REPO_EXCLUDE: 'foo/legacy-*',
                DEPENDFIX_REPO_TOPICS_EXCLUDE: 'deprecated,archived',
            },
        })

        expect(config.repoInclude).toEqual(['foo/*', 'bar/*'])
        expect(config.repoExclude).toEqual(['foo/legacy-*'])
        expect(config.repoTopicsExclude).toEqual(['deprecated', 'archived'])
    })

    it('lets cli owner overrides env owner', () => {
        const invocation = parseCliArgs(['--owner', 'cli-owner'])
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_OWNER: 'env-owner' },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.owner).toEqual(['cli-owner'])
    })

    it('allows missing repositories when owner is provided', () => {
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_OWNER: 'foo' },
            // 无 git remote 的目录，避免 repositories 推断干扰
            workDir: mkdtempSync(join(tmpdir(), 'dependfix-config-')),
        })

        expect(config.repositories).toEqual([])
        expect(config.owner).toEqual(['foo'])
    })

    it('rejects owner discovery with pnpm-audit alert source', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_ALERTS_SOURCE: 'pnpm-audit',
                DEPENDFIX_OWNER: 'foo',
            },
        })).toThrow('--owner / DEPENDFIX_OWNER requires the github-dependabot alert source')
    })

    it('rejects owner discovery in cleanup-branches mode', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_MODE: 'cleanup-branches',
                DEPENDFIX_OWNER: 'foo',
            },
        })).toThrow('not supported in cleanup-branches mode')
    })

    // -----------------------------------------------------------------------
    // 并发配置
    // -----------------------------------------------------------------------

    it('parses maxConcurrency and maxRetries from env', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_CONCURRENCY: '4',
                DEPENDFIX_MAX_RETRIES: '5',
            },
        })

        expect(config.maxConcurrency).toBe(4)
        expect(config.maxRetries).toBe(5)
    })

    it('parses maxBackoffMs from env and cli', () => {
        const envConfig = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_BACKOFF_MS: '60000',
            },
        })
        expect(envConfig.maxBackoffMs).toBe(60_000)

        const invocation = parseCliArgs(['--max-backoff-ms', '5000'])
        const cliConfig = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_REPOSITORIES: 'foo/bar' },
            cliOverrides: invocation.configOverrides,
        })
        expect(cliConfig.maxBackoffMs).toBe(5000)
    })

    it('rejects maxBackoffMs outside 100-120000', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_BACKOFF_MS: '50',
            },
        })).toThrow('maxBackoffMs must be between 100 and 120000')
    })

    it('rejects maxConcurrency outside 1-16', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_CONCURRENCY: '17',
            },
        })).toThrow('maxConcurrency must be between 1 and 16')
    })

    it('allows maxRetries=0 (retry disabled)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_RETRIES: '0',
            },
        })
        expect(config.maxRetries).toBe(0)
    })

    it('rejects maxRetries above 10', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_RETRIES: '11',
            },
        })).toThrow('maxRetries must be between 0 and 10')
    })

    it('rejects maxConcurrency > 1 in fix mode (shared workDir write race)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MODE: 'fix',
                DEPENDFIX_MAX_CONCURRENCY: '2',
            },
        })).toThrow('only supported in report-only mode')
    })

    it('rejects maxConcurrency > 1 in fix-and-pr mode (shared workDir write race)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_MAX_CONCURRENCY: '2',
            },
        })).toThrow('only supported in report-only mode')
    })

    it('allows maxConcurrency > 1 in report-only mode', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_CONCURRENCY: '4',
            },
        })
        expect(config.maxConcurrency).toBe(4)
    })

    it('rejects maxConcurrency > 1 in cleanup-branches mode (sequential)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MODE: 'cleanup-branches',
                DEPENDFIX_MAX_CONCURRENCY: '2',
            },
        })).toThrow('not supported in cleanup-branches mode')
    })

    // -----------------------------------------------------------------------
    // 整数字面量严格校验（修复：拒绝 parseInt 静默截断）
    // -----------------------------------------------------------------------

    it('rejects decimal env values instead of silently truncating', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_CONCURRENCY: '2.5',
            },
        })).toThrow('must be a positive integer')
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_BACKOFF_MS: '200.5',
            },
        })).toThrow('must be a positive integer')
    })

    it('rejects negative / malformed env integers', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_RETRIES: '-1',
            },
        })).toThrow('must be a non-negative integer')
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_CONCURRENCY: 'abc',
            },
        })).toThrow('must be a positive integer')
    })

    it('accepts whitespace-padded and leading-zero integers', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_MAX_RETRIES: ' 0 ',
            },
        })
        expect(config.maxRetries).toBe(0)
    })

    it('rejects decimal cli flag values (parseIntegerFlag)', () => {
        expect(() => parseCliArgs(['--max-concurrency', '2.5'])).toThrow('Expected an integer between 1 and 16')
        expect(() => parseCliArgs(['--max-backoff-ms', '-5'])).toThrow('Expected an integer between 100 and 120000')
        expect(() => parseCliArgs(['--max-retries', 'abc'])).toThrow('Expected an integer between 0 and 10')
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
