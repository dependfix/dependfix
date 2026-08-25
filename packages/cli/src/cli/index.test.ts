import { describe, expect, it } from 'vitest'
import { resolveRuntimeConfig } from '@dependfix/engine'
import { parseCliArgs } from './index'

// CLI 参数解析 → config 覆盖映射（parseCliArgs）的集成测试。
// 拆包后归属 cli 层（engine 的 config 测试只测 resolveRuntimeConfig 的
// env + CliConfigOverrides 输入，不经过 citty 解析）。

describe('parseCliArgs', () => {
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
            codeQualityEnabled: false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 3,
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

    it('rejects invalid --alerts-source from cli (ARGUMENT_PARSE_ERROR)', () => {
        expect(() => parseCliArgs([
            'report-only',
            '--alerts-source',
            'osv-scanner',
        ])).toThrow('Invalid --alerts-source value')
    })

    it('enables code scanning via CLI flag (three-state)', () => {
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--code-scanning'])
            .configOverrides.codeScanningEnabled).toBe(true)
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--no-code-scanning'])
            .configOverrides.codeScanningEnabled).toBe(false)
    })

    it('enables code quality via CLI flag (three-state)', () => {
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--code-quality'])
            .configOverrides.codeQualityEnabled).toBe(true)
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--no-code-quality'])
            .configOverrides.codeQualityEnabled).toBe(false)
    })

    it('enables major upgrade via CLI flag (three-state)', () => {
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--allow-major-upgrade'])
            .configOverrides.allowMajorUpgrade).toBe(true)
        expect(parseCliArgs(['report-only', '--repo', 'foo/bar', '--no-allow-major-upgrade'])
            .configOverrides.allowMajorUpgrade).toBe(false)
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

    it('lets cli owner overrides env owner', () => {
        const invocation = parseCliArgs(['--owner', 'cli-owner'])
        const config = resolveRuntimeConfig({
            env: { GITHUB_TOKEN: 't', DEPENDFIX_OWNER: 'env-owner' },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.owner).toEqual(['cli-owner'])
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

    it('rejects decimal cli flag values (parseIntegerFlag)', () => {
        expect(() => parseCliArgs(['--max-concurrency', '2.5'])).toThrow('Expected an integer between 1 and 16')
        expect(() => parseCliArgs(['--max-backoff-ms', '-5'])).toThrow('Expected an integer between 100 and 120000')
        expect(() => parseCliArgs(['--max-retries', 'abc'])).toThrow('Expected an integer between 0 and 10')
    })

    it('parses AI options from cli flags and precedence over env (incl. anthropic apiUrl)', () => {
        const invocation = parseCliArgs([
            '--ai',
            '--ai-provider', 'anthropic',
            '--ai-model', 'claude-3-5-haiku',
            '--ai-base-url', 'https://api.example.com/v1',
            '--ai-api-url', 'https://gateway.example.com/v1/messages',
            '--ai-trigger', 'failure',
            '--ai-api-key', 'cli-key-1234567890',
        ])
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_AI: 'false',
                DEPENDFIX_AI_MODEL: 'env-model',
                DEPENDFIX_AI_API_KEY: 'env-key-1234567890',
                DEPENDFIX_AI_API_URL: 'https://env.example.com/v1/messages',
            },
            cliOverrides: invocation.configOverrides,
        })

        expect(config.ai).toEqual({
            enabled: true,
            provider: 'anthropic',
            model: 'claude-3-5-haiku',
            baseUrl: 'https://api.example.com/v1',
            apiUrl: 'https://gateway.example.com/v1/messages',
            trigger: 'failure',
            apiKey: 'cli-key-1234567890',
        })
    })

    it('rejects invalid ai-provider and ai-trigger values', () => {
        expect(() => parseCliArgs(['--ai-provider', 'google'])).toThrow('Invalid --ai-provider')
        expect(() => parseCliArgs(['--ai-trigger', 'always'])).toThrow('Invalid --ai-trigger')
        expect(() => resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 't',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                DEPENDFIX_AI_PROVIDER: 'google',
            },
        })).toThrow('Invalid DEPENDFIX_AI_PROVIDER')
    })
})
