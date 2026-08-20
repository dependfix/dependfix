import { vi, describe, expect, it, beforeEach } from 'vitest'

/**
 * PR 链路测试（createPrForFix）。
 *
 * 与 container-executor-push.test.ts 拆开原因：
 * - push 测试 mock child_process；PR 测试 mock @dependfix/engine（按需精确替换）
 * - 拆文件避免两套 mock 互相干扰
 *
 * Mock 关键点：vi.mock('node:child_process') 与 vi.mock('@dependfix/engine') 都用 vi.hoisted
 * 注入；后者通过 vi.importActual 保留其它 engine 导出（避免破坏 Dialobit 其它测试）。
 */

const engineMock = vi.hoisted(() => ({
    createGitHubClient: vi.fn(),
    createPullRequest: vi.fn(),
    fetchDefaultBranch: vi.fn(),
    buildPrTitle: vi.fn(),
    generatePRBody: vi.fn(),
}))

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        createGitHubClient: engineMock.createGitHubClient,
        createPullRequest: engineMock.createPullRequest,
        fetchDefaultBranch: engineMock.fetchDefaultBranch,
        buildPrTitle: engineMock.buildPrTitle,
        generatePRBody: engineMock.generatePRBody,
    }
})

const { createPrForFix } = await import('./container-executor')
import type { RunResult } from '@dependfix/core'

beforeEach(() => {
    engineMock.createGitHubClient.mockReset()
    engineMock.createPullRequest.mockReset()
    engineMock.fetchDefaultBranch.mockReset()
    engineMock.buildPrTitle.mockReset()
    engineMock.generatePRBody.mockReset()
})

const minimalResult = {
    runId: 'run-1',
    startedAt: '2026-08-20T00:00:00.000Z',
    finishedAt: '2026-08-20T00:01:00.000Z',
    config: {
        mode: 'fix-and-pr' as const,
        repositorieSeverities: ['critical', 'high'],
        repositories: ['owner-a/repo-b'],
        dryRun: false,
    },
    summary: {
        repositoriesScanned: 1,
        alertsFound: 1,
        alertsFixable: 1,
        alertsFixed: 1,
        alertsFailed: 0,
        alertsSkipped: 0,
        alertsConverged: 0,
        alertsTruncated: 0,
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
    },
    repositories: [{ repository: 'owner-a/repo-b', defaultBranch: 'main', alertsCount: 1, fixable: 1, fixed: 1, failed: 0, lockfileRepaired: false, durationMs: 1000 }],
    alerts: [],
    actions: [],
    errors: [],
} as unknown as RunResult

describe('createPrForFix', () => {
    it('creates PR with engine-derived title/body and resolved default branch', async () => {
        const fakeOctokit = { rest: { repos: { get: vi.fn() } } }
        engineMock.createGitHubClient.mockReturnValue(fakeOctokit)
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('fix(deps): automated security fix — 1 upgrade')
        engineMock.generatePRBody.mockReturnValue('## Dependfix Auto Fix\n\n...')
        engineMock.createPullRequest.mockResolvedValue({ number: 42, htmlUrl: 'https://github.com/owner-a/repo-b/pull/42' })

        const pr = await createPrForFix(minimalResult, 'owner-a', 'repo-b', 'dependfix/auto-fix-abc12345', 'ghp_token')

        expect(pr).toEqual({ number: 42, htmlUrl: 'https://github.com/owner-a/repo-b/pull/42' })
        expect(engineMock.createGitHubClient).toHaveBeenCalledWith({
            token: 'ghp_token',
            retry: { maxRetries: 3, maxBackoffMs: 30_000 },
        })
        expect(engineMock.fetchDefaultBranch).toHaveBeenCalledWith(fakeOctokit, 'owner-a', 'repo-b')
        expect(engineMock.buildPrTitle).toHaveBeenCalledWith(minimalResult.summary, minimalResult.actions)
        expect(engineMock.generatePRBody).toHaveBeenCalledWith(minimalResult)
        expect(engineMock.createPullRequest).toHaveBeenCalledWith({
            octokit: fakeOctokit,
            owner: 'owner-a',
            repo: 'repo-b',
            headBranch: 'dependfix/auto-fix-abc12345',
            baseBranch: 'main',
            title: 'fix(deps): automated security fix — 1 upgrade',
            body: '## Dependfix Auto Fix\n\n...',
        })
    })

    it('falls back to defaultBranch "unknown" when fetchDefaultBranch returns fallback', async () => {
        engineMock.createGitHubClient.mockReturnValue({})
        engineMock.fetchDefaultBranch.mockResolvedValue('unknown')
        engineMock.buildPrTitle.mockReturnValue('t')
        engineMock.generatePRBody.mockReturnValue('b')
        engineMock.createPullRequest.mockResolvedValue({ number: 1, htmlUrl: 'u' })

        await createPrForFix(minimalResult, 'o', 'r', 'b', 't')

        expect(engineMock.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({ baseBranch: 'unknown' }))
    })

    it('propagates PR creation error (execute() 归类 pr_creation_failed)', async () => {
        engineMock.createGitHubClient.mockReturnValue({})
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('t')
        engineMock.generatePRBody.mockReturnValue('b')
        engineMock.createPullRequest.mockRejectedValue(new Error('Validation Failed: title too long'))

        await expect(createPrForFix(minimalResult, 'o', 'r', 'b', 't'))
            .rejects.toThrow(/Validation Failed/)
    })

    it('uses token from caller (平台 credential service 解密后传入)', async () => {
        engineMock.createGitHubClient.mockReturnValue({})
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('t')
        engineMock.generatePRBody.mockReturnValue('b')
        engineMock.createPullRequest.mockResolvedValue({ number: 1, htmlUrl: 'u' })

        await createPrForFix(minimalResult, 'o', 'r', 'b', 'ghp_DECRYPTED_TOKEN')

        expect(engineMock.createGitHubClient).toHaveBeenCalledWith(
            expect.objectContaining({ token: 'ghp_DECRYPTED_TOKEN' }),
        )
    })
})
