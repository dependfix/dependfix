import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DependfixApp } from 'dependfix'
import { runScan } from './run-scan'

vi.mock('dependfix', () => ({
    DependfixApp: vi.fn(),
    // 与 cli DEFAULT_RUNTIME_CONFIG 对齐的测试副本（默认值一致性由实现注释 + typecheck 保证）
    DEFAULT_RUNTIME_CONFIG: {
        mode: 'report-only',
        severityThreshold: 'high',
        alertSource: 'github-dependabot',
        codeScanningEnabled: false,
        allowMajorUpgrade: false,
        maxAlertsPerRepository: 20,
        maxConcurrency: 1,
        maxRetries: 3,
        maxBackoffMs: 30_000,
        ai: {
            enabled: false,
            provider: 'openai-compatible',
            model: 'deepseek-v4-flash',
            baseUrl: 'https://api.deepseek.com',
            trigger: 'both',
        },
    },
}))

const DependfixAppMock = vi.mocked(DependfixApp)

const runResult = {
    runId: 'run-1',
    summary: {},
    repositories: [],
    errors: [],
}
const runFn = vi.fn()

beforeEach(() => {
    DependfixAppMock.mockReset()
    runFn.mockReset()
    // 注意：DependfixApp 以 `new` 调用，mock 实现必须是 function（箭头函数不可构造）
    DependfixAppMock.mockImplementation(function () {
        return { run: runFn }
    } as never)
    delete process.env.GITHUB_TOKEN
})

const resolveOkRun = (): void => {
    runFn.mockResolvedValue({ result: runResult, exitCode: 0 })
}

describe('runScan（config 映射与参数透传）', () => {
    it('returns error when GITHUB_TOKEN is not set', async () => {
        const result = await runScan({ repo: 'owner-a/repo-b', mode: 'report-only', severity: 'high' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('GITHUB_TOKEN')
    })

    it('returns error for malformed repo', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        const result = await runScan({ repo: 'invalid', mode: 'report-only', severity: 'high' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('owner/repo')
    })

    it('maps default config from mode (report-only → dryRun, defaults closed)', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        resolveOkRun()

        const result = await runScan({ repo: 'owner-a/repo-b', mode: 'report-only', severity: 'high' })

        expect(result.ok).toBe(true)
        const config = DependfixAppMock.mock.calls[0][0].config
        expect(config).toMatchObject({
            mode: 'report-only',
            dryRun: true,
            createPullRequest: false,
            commit: false,
            codeScanningEnabled: false,
            allowMajorUpgrade: false,
            maxAlertsPerRepository: 20,
            maxConcurrency: 1,
            repositories: ['owner-a/repo-b'],
            githubToken: 'ghp_test',
        })
    })

    it('passes explicit params through to config (dry_run / code_scanning / max_alerts / max_concurrency / allow_major_upgrade)', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        resolveOkRun()

        await runScan({
            repo: 'owner-a/repo-b',
            mode: 'fix-and-pr',
            severity: 'critical',
            dry_run: false,
            code_scanning: true,
            max_alerts: 5,
            max_concurrency: 4,
            allow_major_upgrade: true,
        })

        const config = DependfixAppMock.mock.calls[0][0].config
        expect(config).toMatchObject({
            mode: 'fix-and-pr',
            severityThreshold: 'critical',
            dryRun: false,
            createPullRequest: true,
            commit: false,
            codeScanningEnabled: true,
            allowMajorUpgrade: true,
            maxAlertsPerRepository: 5,
            maxConcurrency: 4,
        })
    })

    it('maps app run result into RunScanResult', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        resolveOkRun()

        const result = await runScan({ repo: 'owner-a/repo-b', mode: 'report-only', severity: 'all' })

        expect(result).toMatchObject({ ok: true, exitCode: 0, runId: 'run-1' })
    })

    it('builds ai config from params when ai_enabled is true (apiKey from env only)', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        process.env.DEPENDFIX_AI_API_KEY = 'sk-test'
        resolveOkRun()

        await runScan({
            repo: 'owner-a/repo-b',
            mode: 'report-only',
            severity: 'high',
            ai_enabled: true,
            ai_provider: 'anthropic',
            ai_model: 'claude-x',
            ai_trigger: 'failure',
        })

        const config = DependfixAppMock.mock.calls[0][0].config
        expect(config.ai).toEqual({
            enabled: true,
            provider: 'anthropic',
            model: 'claude-x',
            baseUrl: 'https://api.deepseek.com',
            apiKey: 'sk-test',
            trigger: 'failure',
        })
    })

    it('omits ai config when ai_enabled is false', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        resolveOkRun()

        await runScan({ repo: 'owner-a/repo-b', mode: 'report-only', severity: 'high' })

        const config = DependfixAppMock.mock.calls[0][0].config
        expect(config.ai).toBeUndefined()
    })
})
