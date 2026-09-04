import { vi, describe, expect, it, beforeEach } from 'vitest'

/**
 * 平台交付链路测试（planFixAndPrDelivery / deliverFixAndPr / pushFixBranchWithCredential）。
 *
 * Mock 策略：
 * - child_process: vi.hoisted + Symbol.for('nodejs.util.promisify.custom') 标记为 Promise 风格
 *   （与 container-executor-cleanup.test.ts 一致）
 * - @dependfix/engine: vi.hoisted + vi.importActual，保留其它导出
 *   （与 container-executor-pr.test.ts 原模式一致）
 */

const childProcessMock = vi.hoisted(() => {
    const m: {
        execFile: ReturnType<typeof vi.fn>
        execFileSync: ReturnType<typeof vi.fn>
        execSync: ReturnType<typeof vi.fn>
    } = {
        execFile: vi.fn(),
        execFileSync: vi.fn(),
        execSync: vi.fn(),
    }
    ;(m.execFile as unknown as Record<symbol, unknown>)[Symbol.for('nodejs.util.promisify.custom')] = m.execFile
    return m
})

vi.mock('node:child_process', () => childProcessMock)

const engineMock = vi.hoisted(() => ({
    buildPrTitle: vi.fn(),
    closeSupersededPRs: vi.fn(),
    computeFixAndPrPlan: vi.fn(),
    computeFixFingerprint: vi.fn(),
    createGitHubClient: vi.fn(),
    createPullRequest: vi.fn(),
    fetchDefaultBranch: vi.fn(),
    findDependfixOpenPR: vi.fn(),
    generatePRBody: vi.fn(),
}))

vi.mock('@dependfix/engine', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@dependfix/engine')>()
    return {
        ...actual,
        buildPrTitle: engineMock.buildPrTitle,
        closeSupersededPRs: engineMock.closeSupersededPRs,
        computeFixAndPrPlan: engineMock.computeFixAndPrPlan,
        computeFixFingerprint: engineMock.computeFixFingerprint,
        createGitHubClient: engineMock.createGitHubClient,
        createPullRequest: engineMock.createPullRequest,
        fetchDefaultBranch: engineMock.fetchDefaultBranch,
        findDependfixOpenPR: engineMock.findDependfixOpenPR,
        generatePRBody: engineMock.generatePRBody,
    }
})

const {
    deliverFixAndPr,
    planFixAndPrDelivery,
    pushFixBranchWithCredential,
    PlatformDeliveryError,
} = await import('./platform-delivery')

import type { DependfixOpenPR } from '@dependfix/engine'
import type { RunResult } from '@dependfix/core'
import type { Octokit } from '@octokit/rest'

beforeEach(() => {
    childProcessMock.execFile.mockReset()
    engineMock.buildPrTitle.mockReset()
    engineMock.closeSupersededPRs.mockReset()
    engineMock.computeFixAndPrPlan.mockReset()
    engineMock.computeFixFingerprint.mockReset()
    engineMock.createGitHubClient.mockReset()
    engineMock.createPullRequest.mockReset()
    engineMock.fetchDefaultBranch.mockReset()
    engineMock.findDependfixOpenPR.mockReset()
    engineMock.generatePRBody.mockReset()
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const minimalResult = {
    runId: 'run-1',
    startedAt: '2026-08-20T00:00:00.000Z',
    finishedAt: '2026-08-20T00:01:00.000Z',
    config: { mode: 'fix-and-pr' as const, repositories: ['o/r'], dryRun: false },
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
    repositories: [],
    alerts: [],
    actions: [{
        type: 'dependency-upgrade',
        repository: 'o/r',
        target: 'lodash@4.17.21',
        fromVersion: '4.17.20',
        toVersion: '4.17.21',
        isMajor: false,
        success: true,
        durationMs: 1000,
    }],
    errors: [],
} as unknown as RunResult

function makeOctokit() {
    return { rest: { pulls: { list: vi.fn() } } } as unknown as Octokit
}

// ---------------------------------------------------------------------------
// planFixAndPrDelivery
// ---------------------------------------------------------------------------

describe('planFixAndPrDelivery', () => {
    it('skips when same-fingerprint PR exists (幂等交付)', async () => {
        engineMock.computeFixFingerprint.mockReturnValue('abc12345')
        const sameContentPR: DependfixOpenPR = { number: 100, htmlUrl: 'https://github.com/o/r/pull/100', headRef: 'dependfix/auto-fix-abc12345' }
        engineMock.findDependfixOpenPR.mockResolvedValue([sameContentPR])
        engineMock.computeFixAndPrPlan.mockReturnValue({ action: 'skip', sameContentPR, supersedePRs: [] })

        const plan = await planFixAndPrDelivery(makeOctokit(), 'o', 'r', minimalResult)

        expect(plan.fingerprint).toBe('abc12345')
        expect(plan.branchName).toBe('dependfix/auto-fix-abc12345')
        expect(plan.action).toBe('skip')
        expect(plan.sameContentPR).toBe(sameContentPR)
    })

    it('creates when different-fingerprint PRs exist (返回 supersede 列表)', async () => {
        engineMock.computeFixFingerprint.mockReturnValue('new12345')
        const oldPR: DependfixOpenPR = { number: 50, htmlUrl: 'https://github.com/o/r/pull/50', headRef: 'dependfix/auto-fix-old67890' }
        engineMock.findDependfixOpenPR.mockResolvedValue([oldPR])
        engineMock.computeFixAndPrPlan.mockReturnValue({ action: 'create', supersedePRs: [oldPR] })

        const plan = await planFixAndPrDelivery(makeOctokit(), 'o', 'r', minimalResult)

        expect(plan.fingerprint).toBe('new12345')
        expect(plan.action).toBe('create')
        expect(plan.supersedePRs).toEqual([oldPR])
    })

    it('degrades to create path when findDependfixOpenPR fails (网络/API 错)', async () => {
        // 关键降级契约：list 失败不阻塞交付，假设无 open PR 继续 create
        // （GitHub createPullRequest 在 head 已存在时返回 422，兜底归为 pr_creation_failed）
        engineMock.computeFixFingerprint.mockReturnValue('abc12345')
        engineMock.findDependfixOpenPR.mockRejectedValue(new Error('API rate limit exceeded'))
        engineMock.computeFixAndPrPlan.mockReturnValue({ action: 'create', supersedePRs: [] })

        const warnSpy = vi.fn()
        const logger = { debug() { /* noop */ }, info() { /* noop */ }, warn: warnSpy, error() { /* noop */ } }

        const plan = await planFixAndPrDelivery(makeOctokit(), 'o', 'r', minimalResult, logger)

        expect(plan.action).toBe('create')
        expect(plan.supersedePRs).toEqual([])
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('findDependfixOpenPR 失败'))
    })
})

// ---------------------------------------------------------------------------
// pushFixBranchWithCredential
// ---------------------------------------------------------------------------

describe('pushFixBranchWithCredential', () => {
    it('pushes branch with token via http.extraheader (CWE-200: token 不进 argv)', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/owner-a/repo-b.git\n' })
        await pushFixBranchWithCredential('dependfix/auto-fix-abc12345', '/tmp/test', 'ghp_SUPERSECRETTOKEN')

        expect(childProcessMock.execFile).toHaveBeenCalledTimes(1)
        const callArgs = childProcessMock.execFile.mock.calls[0] as unknown as [string, string[], Record<string, unknown>]
        const [bin, args, opts] = callArgs
        expect(bin).toBe('git')
        // 关键断言：token 走 http.extraheader（base64 basic auth），不进 argv
        expect(args).toContain('http.extraheader=Authorization: basic eC1hY2Nlc3MtdG9rZW46Z2hwX1NVUEVSU0VDUkVUVE9LRU4=')
        // 关键反断言：明文 token 不能出现在 argv 中（-c 形式是 base64，不算泄露）
        expect(args.join(' ')).not.toContain('ghp_SUPERSECRETTOKEN')
        // 反断言：URL/argv 也不能含 token（防 URL 注入型泄露）
        expect(args.find((a) => a.includes('https://') && a.includes('@'))).toBeUndefined()
        expect(opts.cwd).toBe('/tmp/test')
    })

    it('throws PlatformDeliveryError(push_failed) when git push fails', async () => {
        childProcessMock.execFile.mockRejectedValue(new Error('Failed to connect to github.com:443'))
        let caught: unknown
        try {
            await pushFixBranchWithCredential('b', '/tmp', 't')
        } catch (err) {
            caught = err
        }
        expect(caught).toBeInstanceOf(PlatformDeliveryError)
        expect(caught).toMatchObject({ code: 'push_failed', branchPushed: false })
    })
})

// ---------------------------------------------------------------------------
// deliverFixAndPr
// ---------------------------------------------------------------------------

describe('deliverFixAndPr', () => {
    it('skips push + create when plan.action=skip (同内容 PR 幂等)', async () => {
        const sameContentPR: DependfixOpenPR = { number: 100, htmlUrl: 'https://github.com/o/r/pull/100', headRef: 'dependfix/auto-fix-abc12345' }
        const result = await deliverFixAndPr({
            owner: 'o',
            repo: 'r',
            branchName: 'dependfix/auto-fix-abc12345',
            token: 't',
            workDir: '/tmp',
            result: minimalResult,
            plan: { fingerprint: 'abc12345', branchName: 'dependfix/auto-fix-abc12345', action: 'skip', sameContentPR, supersedePRs: [] },
            octokit: makeOctokit(),
        })
        expect(result).toEqual({ runUrl: sameContentPR.htmlUrl, prNumber: 100, skipped: true })
        // 关键：未走 push / create / close supersede
        expect(childProcessMock.execFile).not.toHaveBeenCalled()
        expect(engineMock.createPullRequest).not.toHaveBeenCalled()
        expect(engineMock.closeSupersededPRs).not.toHaveBeenCalled()
    })

    it('pushes + creates PR when plan.action=create + no supersede', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/o/r.git\n' })
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('chore(deps): auto fix')
        engineMock.generatePRBody.mockReturnValue('body')
        engineMock.createPullRequest.mockResolvedValue({ number: 200, htmlUrl: 'https://github.com/o/r/pull/200' })

        const result = await deliverFixAndPr({
            owner: 'o',
            repo: 'r',
            branchName: 'dependfix/auto-fix-abc12345',
            token: 'ghp_TEST',
            workDir: '/tmp',
            result: minimalResult,
            plan: { fingerprint: 'abc12345', branchName: 'dependfix/auto-fix-abc12345', action: 'create', supersedePRs: [] },
            octokit: makeOctokit(),
        })

        expect(result).toEqual({ runUrl: 'https://github.com/o/r/pull/200', prNumber: 200, skipped: false })
        expect(childProcessMock.execFile).toHaveBeenCalledTimes(1) // push
        expect(engineMock.createPullRequest).toHaveBeenCalledWith(expect.objectContaining({
            owner: 'o', repo: 'r', headBranch: 'dependfix/auto-fix-abc12345', baseBranch: 'main',
        }))
        expect(engineMock.closeSupersededPRs).not.toHaveBeenCalled()
    })

    it('throws pr_creation_failed when createPullRequest 失败（分支已推）', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/o/r.git\n' })
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('t')
        engineMock.generatePRBody.mockReturnValue('b')
        engineMock.createPullRequest.mockRejectedValue(new Error('Validation Failed: title too long'))

        let caught: unknown
        try {
            await deliverFixAndPr({
                owner: 'o',
                repo: 'r',
                branchName: 'b',
                token: 't',
                workDir: '/tmp',
                result: minimalResult,
                plan: { fingerprint: 'a', branchName: 'b', action: 'create', supersedePRs: [] },
                octokit: makeOctokit(),
            })
        } catch (err) {
            caught = err
        }
        expect(caught).toBeInstanceOf(PlatformDeliveryError)
        expect(caught).toMatchObject({ code: 'pr_creation_failed', branchPushed: true })
    })

    it('closes supersede PRs after successful create (best-effort 失败不影响主交付)', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/o/r.git\n' })
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('t')
        engineMock.generatePRBody.mockReturnValue('b')
        engineMock.createPullRequest.mockResolvedValue({ number: 200, htmlUrl: 'https://github.com/o/r/pull/200' })
        engineMock.closeSupersededPRs.mockResolvedValue(undefined)

        const oldPR: DependfixOpenPR = { number: 50, htmlUrl: 'https://github.com/o/r/pull/50', headRef: 'dependfix/auto-fix-old67890' }
        const result = await deliverFixAndPr({
            owner: 'o',
            repo: 'r',
            branchName: 'b',
            token: 't',
            workDir: '/tmp',
            result: minimalResult,
            plan: { fingerprint: 'a', branchName: 'b', action: 'create', supersedePRs: [oldPR] },
            octokit: makeOctokit(),
        })

        expect(result.runUrl).toBe('https://github.com/o/r/pull/200')
        expect(engineMock.closeSupersededPRs).toHaveBeenCalledWith(
            expect.objectContaining({ allErrors: expect.any(Array) }),
            expect.anything(),
            'o',
            'r',
            [oldPR],
        )
    })

    it('supersede 失败不阻断主交付（warn 即可，runUrl 仍为新 PR）', async () => {
        childProcessMock.execFile.mockResolvedValue({ stdout: '', stderr: 'To https://github.com/o/r.git\n' })
        engineMock.fetchDefaultBranch.mockResolvedValue('main')
        engineMock.buildPrTitle.mockReturnValue('t')
        engineMock.generatePRBody.mockReturnValue('b')
        engineMock.createPullRequest.mockResolvedValue({ number: 200, htmlUrl: 'https://github.com/o/r/pull/200' })
        engineMock.closeSupersededPRs.mockRejectedValue(new Error('close failed'))

        const warnSpy = vi.fn()
        const result = await deliverFixAndPr({
            owner: 'o',
            repo: 'r',
            branchName: 'b',
            token: 't',
            workDir: '/tmp',
            result: minimalResult,
            plan: { fingerprint: 'a', branchName: 'b', action: 'create', supersedePRs: [{ number: 50, htmlUrl: 'u', headRef: 'h' }] },
            octokit: makeOctokit(),
            logger: { debug() { /* noop */ }, info() { /* noop */ }, warn: warnSpy, error() { /* noop */ } },
        })

        expect(result.runUrl).toBe('https://github.com/o/r/pull/200') // 主交付成功
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('关 supersede PR 失败'))
    })
})
