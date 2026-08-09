import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AppError } from '@dependfix/core'
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
            ai: {
                enabled: false,
                provider: 'openai-compatible',
                model: 'deepseek-v4-flash',
                baseUrl: 'https://api.deepseek.com',
                trigger: 'both',
            },
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


    // -----------------------------------------------------------------------
    // AI 研判配置（--ai 系列 / DEPENDFIX_AI_*）
    // -----------------------------------------------------------------------

    it('parses AI options from env (enabled + apiKey)', () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_AI: 'true',
                DEPENDFIX_AI_API_KEY: 'sk-test-key-1234567890',
                DEPENDFIX_AI_MODEL: 'custom-model',
                DEPENDFIX_AI_TRIGGER: 'major',
            },
        })

        expect(config.ai).toEqual({
            enabled: true,
            provider: 'openai-compatible',
            model: 'custom-model',
            baseUrl: 'https://api.deepseek.com',
            trigger: 'major',
            apiKey: 'sk-test-key-1234567890',
        })
    })


    it('rejects AI enabled without apiKey (clear configuration error)', () => {
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_AI: 'true',
            },
        })).toThrow('AI 研判已开启但缺少 API Key')
    })


    it('keeps AI disabled by default (opt-in, no cost)', () => {
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_REPOSITORIES: 'foo/bar' },
        })
        expect(config.ai?.enabled).toBe(false)
        expect(config.ai?.apiKey).toBeUndefined()
    })
})

// ===========================================================================
// GitHub remote URL regex (used by inferRepoFromGitRemote)
// ===========================================================================

const GITHUB_REMOTE_RE = /github\.com[/:]([^/]+)\/([^/\s.]+?)(?:\.git)?\s*$/i

/** 执行正则并断言有匹配（strict 下类型收窄：返回非空 RegExpExecArray） */
function execGitHubRemote(url: string): RegExpExecArray {
    const m = GITHUB_REMOTE_RE.exec(url)
    expect(m).not.toBeNull()
    return m!
}

describe('GITHUB_REMOTE_RE', () => {
    it('matches HTTPS GitHub URL with .git suffix', () => {
        const m = execGitHubRemote('https://github.com/dependfix/dependfix.git')
        expect(m[1]).toBe('dependfix')
        expect(m[2]).toBe('dependfix')
    })

    it('matches HTTPS GitHub URL without .git suffix', () => {
        const m = execGitHubRemote('https://github.com/dependfix/dependfix')
        expect(m[2]).toBe('dependfix')
    })

    it('matches SSH git@ format', () => {
        const m = execGitHubRemote('git@github.com:dependfix/dependfix.git')
        expect(m[1]).toBe('dependfix')
        expect(m[2]).toBe('dependfix')
    })

    it('matches SSH ssh:// format', () => {
        const m = execGitHubRemote('ssh://git@github.com/dependfix/dependfix.git')
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
        const m = execGitHubRemote('https://github.com/owner/repo.git\n')
        expect(m[1]).toBe('owner')
        expect(m[2]).toBe('repo')
    })

    it('matches with leading whitespace', () => {
        const m = execGitHubRemote(' https://github.com/owner/repo.git')
        expect(m[1]).toBe('owner')
    })
})
