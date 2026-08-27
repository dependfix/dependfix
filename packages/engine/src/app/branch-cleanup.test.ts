// branch-cleanup.test.ts — autoCleanupMergedBranches / closeSupersededPRs / runBranchCleanupForRepo / reportCleanupCandidates / confirmCleanup（分支清理安全边界）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）；本次补测 runBranchCleanupForRepo / reportCleanupCandidates / confirmCleanup 恢复分支覆盖率（背景见 todo.md 与经验归档 §四十二）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@dependfix/core'
import {
    autoCleanupMergedBranches,
    closeSupersededPRs,
    confirmCleanup,
    reportCleanupCandidates,
    runBranchCleanupForRepo,
    type AppContext,
} from './helpers'

/** 测试用 logger mock：每个方法返回 vi.fn 便于 expect.toHaveBeenCalled */
const mockLogger = (): Logger => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
})

// Mock node:readline 全局；测试通过 setCreateInterfaceImpl 注入 question 回调返回值。
// ESM 模式下 vi.spyOn 无法 spy named export，故用 vi.mock 整体替换 createInterface。
vi.mock('node:readline', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:readline')>()
    let impl: (q: string, cb: (answer: string) => void) => void = () => { /* default: 不调用 cb */ }
    return {
        ...actual,
        createInterface: vi.fn(() => ({
            question: (q: string, cb: (answer: string) => void) => impl(q, cb),
            close: vi.fn(),
        })),
        __setCreateInterfaceImpl: (fn: typeof impl) => { impl = fn },
    } as unknown as typeof actual & { __setCreateInterfaceImpl: (fn: typeof impl) => void }
})

// ---------------------------------------------------------------------------
// Mock engine 内部模块（autoCleanupMergedBranches / closeSupersededPRs 依赖
// pr-creator 方法；mock 路径用相对引用）
// ---------------------------------------------------------------------------

const prCreatorMock = vi.hoisted(() => ({
    listDependfixBranches: vi.fn(),
    getBranchPrStatus: vi.fn(),
    deleteRemoteBranch: vi.fn(),
    closePullRequest: vi.fn(),
}))

vi.mock('../github/pr-creator', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../github/pr-creator')>()
    return { ...actual, ...prCreatorMock }
})

describe('autoCleanupMergedBranches', () => {
    const client = {} as never
    const baseCtx = {
        config: { dryRun: false, repositories: ['foo/bar'] } as unknown as AppContext['config'],
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        allActions: [] as AppContext['allActions'],
        allErrors: [] as AppContext['allErrors'],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        baseCtx.allActions = []
        baseCtx.allErrors = []
    })

    it('keeps branches with open PRs (safety red line)', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: false, closed: false })

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.allActions).toHaveLength(0)
    })

    it('deletes merged branches', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa', 'dependfix/auto-fix-bbb'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: true, closed: false })

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(2)
        expect(baseCtx.allActions).toHaveLength(2)
    })

    it('deletes closed (unmerged) branches', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: false, closed: true })

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(1)
    })

    it('only lists branches in dry-run mode without deleting', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: true, closed: false })

        await autoCleanupMergedBranches(
            { ...baseCtx, config: { dryRun: true, repositories: ['foo/bar'] } } as never,
            client,
            'foo/bar',
        )

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.allActions).toHaveLength(0)
    })

    it('continues on delete failure without recording errors (best-effort)', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-aaa', 'dependfix/auto-fix-bbb'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: true, closed: false })
        prCreatorMock.deleteRemoteBranch
            .mockRejectedValueOnce(new Error('delete failed'))
            .mockResolvedValueOnce(undefined)

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(2)
        expect(baseCtx.allActions).toHaveLength(1) // 第二个分支删除成功
        expect(baseCtx.allErrors).toHaveLength(0) // 删除失败不记 error
    })
})

describe('closeSupersededPRs', () => {
    const client = {} as never
    const baseCtx = {
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as never,
        allErrors: [] as AppContext['allErrors'],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        baseCtx.allErrors = []
    })

    it('deletes the head branch after successfully closing a superseded PR', async () => {
        prCreatorMock.closePullRequest.mockResolvedValue(undefined)
        prCreatorMock.deleteRemoteBranch.mockResolvedValue(undefined)

        await closeSupersededPRs(
            baseCtx as never,
            client,
            'foo',
            'bar',
            [{ number: 42, htmlUrl: 'https://github.com/foo/bar/pull/42', headRef: 'dependfix/auto-fix-old' }],
        )

        expect(prCreatorMock.closePullRequest).toHaveBeenCalledTimes(1)
        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledWith(
            client,
            'foo',
            'bar',
            'dependfix/auto-fix-old',
        )
        expect(baseCtx.allErrors).toHaveLength(0)
    })

    it('does not delete the branch when closing the PR fails', async () => {
        prCreatorMock.closePullRequest.mockRejectedValue(new Error('close failed'))

        await closeSupersededPRs(
            baseCtx as never,
            client,
            'foo',
            'bar',
            [{ number: 42, htmlUrl: 'https://github.com/foo/bar/pull/42', headRef: 'dependfix/auto-fix-old' }],
        )

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.allErrors).toHaveLength(1)
        expect(baseCtx.allErrors[0]?.category).toBe('PR_CLOSE_FAILED')
    })
})

// ---------------------------------------------------------------------------
// runBranchCleanupForRepo（交互式 cleanup-branches 模式：分类 + 确认 + 删除）
// 覆盖未触达分支：行 29 / 40 / 47 / 50 / 53 / 54 / 58 / 63 / 68 / 82
// ---------------------------------------------------------------------------

describe('runBranchCleanupForRepo', () => {
    const client = {} as never
    const baseCtx = (overrides: Partial<{ dryRun: boolean, confirmAnswer: boolean }> = {}) => ({
        config: { dryRun: overrides.dryRun ?? false, repositories: ['foo/bar'] } as unknown as AppContext['config'],
        logger: mockLogger(),
        allActions: [] as AppContext['allActions'],
        allErrors: [] as AppContext['allErrors'],
        // 用于 confirmCleanup mock 注入：默认 false（非 TTY 等价），true 时模拟用户确认
        _confirmAnswer: overrides.confirmAnswer ?? false,
    })

    beforeEach(() => {
        vi.clearAllMocks()
        // 默认 mock 路径：process.stdin.isTTY = false（CI/管道环境等价），
        // confirmCleanup 走非 TTY 分支直接返回 false；测试如需覆盖确认路径需 monkey-patch confirmCleanup
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    })

    it('空分支列表 → 提示无分支并返回（行 29-32 branches.length === 0）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue([])
        const ctx = baseCtx()
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')
        expect(prCreatorMock.getBranchPrStatus).not.toHaveBeenCalled()
        expect(ctx.logger.info).toHaveBeenCalledWith('[cleanup] foo/bar: no dependfix branches found')
        expect(ctx.allActions).toHaveLength(0)
        expect(ctx.allErrors).toHaveLength(0)
    })

    it('只有 open 分支（merged=0, closed=0, open>0）→ candidates=[] 直接返回（行 58-61）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-open'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-open', prNumber: 10, merged: false, closed: false })

        const ctx = baseCtx()
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('0 merged, 0 closed, 1 kept'))
        expect(ctx.logger.info).toHaveBeenCalledWith('[cleanup] nothing to delete')
        expect(ctx.allActions).toHaveLength(0)
    })

    it('merged + orphaned + open 混合 → 三类日志路径全部触发（行 46-55 分类日志）', async () => {
        // 注：merged 分支用 merged=true, closed=true（GitHub PR 合并后 closed=true）
        // —— 与源码 open 过滤 `!s.closed` 的语义匹配，避免 merged 分支被双重计入 open 桶。
        prCreatorMock.listDependfixBranches.mockResolvedValue([
            'dependfix/auto-fix-merged', // merged=true, closed=true
            'dependfix/auto-fix-closed', // closed=true, merged=false（orphaned）
            'dependfix/auto-fix-open', // closed=false（open）
        ])
        prCreatorMock.getBranchPrStatus
            .mockResolvedValueOnce({ branch: 'dependfix/auto-fix-merged', prNumber: 11, merged: true, closed: true })
            .mockResolvedValueOnce({ branch: 'dependfix/auto-fix-closed', prNumber: 12, merged: false, closed: true })
            .mockResolvedValueOnce({ branch: 'dependfix/auto-fix-open', prNumber: 13, merged: false, closed: false })

        const ctx = baseCtx()
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        // 三类分类日志：merged / closed / open
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[merged] dependfix/auto-fix-merged (PR #11)'))
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[closed] dependfix/auto-fix-closed (PR #12)'))
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[open — kept] dependfix/auto-fix-open (PR #13)'))
        // 计数日志：1 merged, 1 closed, 1 kept
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('1 merged, 1 closed, 1 kept'))
    })

    it('open 分支无 PR 编号 → 日志用 [no PR — kept]（行 53 三元 false 分支）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-no-pr'])
        // prNumber=null 触发"无 PR"日志分支
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-no-pr', prNumber: null, merged: false, closed: false })

        const ctx = baseCtx()
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[no PR — kept] dependfix/auto-fix-no-pr'))
    })

    it('merged 分支无 PR 编号 → 日志省略 PR 引用（行 47 三元 false 分支）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-merged-no-pr'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-merged-no-pr', prNumber: null, merged: true, closed: false })

        const ctx = baseCtx()
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[merged] dependfix/auto-fix-merged-no-pr'))
        // 不应出现 "PR #" 前缀
        const call = (ctx.logger.info as ReturnType<typeof vi.fn>).mock.calls.find((c) => String(c[0]).includes('[merged]'))
        expect(call?.[0]).not.toMatch(/PR #/)
    })

    it('dryRun=true + 有可删除分支 → 列 would-delete 清单 + 不调用 deleteRemoteBranch（行 63-66）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-m', 'dependfix/auto-fix-c'])
        prCreatorMock.getBranchPrStatus
            .mockResolvedValueOnce({ branch: 'dependfix/auto-fix-m', prNumber: 1, merged: true, closed: false })
            .mockResolvedValueOnce({ branch: 'dependfix/auto-fix-c', prNumber: 2, merged: false, closed: true })

        const ctx = baseCtx({ dryRun: true })
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('[dry-run] Would delete 2 branch(es)'))
        expect(ctx.allActions).toHaveLength(0)
    })

    it('非 TTY 环境 → confirmCleanup 拒绝 → 日志 cancelled by user（行 68-71）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-m'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-m', prNumber: 1, merged: true, closed: false })

        const ctx = baseCtx()
        // process.stdin.isTTY = false（beforeEach 已设）→ confirmCleanup 走非 TTY 分支
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(ctx.logger.info).toHaveBeenCalledWith('[cleanup] cancelled by user')
        expect(ctx.allActions).toHaveLength(0)
    })

    it('用户确认 → 成功删除 merged 分支 → allActions.diff=merged（行 73-95 + 行 82 ternary true 分支）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-m'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-m', prNumber: 1, merged: true, closed: false })
        prCreatorMock.deleteRemoteBranch.mockResolvedValue(undefined)

        const ctx = baseCtx()
        // 模拟用户输入 'y'（confirmCleanup 走 TTY 分支）
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
        const rlModule = await import('node:readline') as unknown as { __setCreateInterfaceImpl: (fn: (q: string, cb: (a: string) => void) => void) => void }
        rlModule.__setCreateInterfaceImpl((_q, cb) => cb('y'))

        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledWith(client, 'foo', 'bar', 'dependfix/auto-fix-m')
        expect(ctx.allActions).toHaveLength(1)
        expect(ctx.allActions[0]).toMatchObject({
            type: 'branch-cleanup',
            repository: 'foo/bar',
            target: 'dependfix/auto-fix-m',
            success: true,
            diff: 'merged', // s.merged ? 'merged' : 'closed' 的 true 分支
        })

        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    })

    it('用户确认 → 成功删除 orphaned 分支 → allActions.diff=closed（行 73-95 + 行 82 ternary false 分支）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-orph'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-orph', prNumber: 2, merged: false, closed: true })
        prCreatorMock.deleteRemoteBranch.mockResolvedValue(undefined)

        const ctx = baseCtx()
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
        const rlModule = await import('node:readline') as unknown as { __setCreateInterfaceImpl: (fn: (q: string, cb: (a: string) => void) => void) => void }
        rlModule.__setCreateInterfaceImpl((_q, cb) => cb('y'))

        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(1)
        expect(ctx.allActions[0]).toMatchObject({ diff: 'closed' }) // s.merged=false 走 false 分支

        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    })

    it('用户确认 → 删除失败 → 记 BRANCH_DELETE_FAILED 错误 + 继续（行 85-94）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-fail'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-fail', prNumber: 1, merged: true, closed: false })
        prCreatorMock.deleteRemoteBranch.mockRejectedValue(new Error('403 forbidden'))

        const ctx = baseCtx()
        Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true })
        const rlModule = await import('node:readline') as unknown as { __setCreateInterfaceImpl: (fn: (q: string, cb: (a: string) => void) => void) => void }
        rlModule.__setCreateInterfaceImpl((_q, cb) => cb('y'))

        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(prCreatorMock.deleteRemoteBranch).toHaveBeenCalledTimes(1)
        expect(ctx.allActions).toHaveLength(0) // 失败不入 actions
        expect(ctx.allErrors).toHaveLength(1)
        expect(ctx.allErrors[0]).toMatchObject({
            stage: 'report',
            category: 'BRANCH_DELETE_FAILED',
            message: expect.stringContaining('Failed to delete dependfix/auto-fix-fail'),
        })

        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })
    })

    it('listDependfixBranches 抛错 → 顶层 catch 记 CLEANUP_FAILED（行 96-105）', async () => {
        prCreatorMock.listDependfixBranches.mockRejectedValue(new Error('GitHub API down'))

        const ctx = baseCtx()
        await runBranchCleanupForRepo(ctx as never, client, 'foo/bar')

        expect(ctx.logger.error).toHaveBeenCalledWith(expect.stringContaining('[cleanup] failed for foo/bar'))
        expect(ctx.allErrors).toHaveLength(1)
        expect(ctx.allErrors[0]).toMatchObject({
            stage: 'report',
            category: 'CLEANUP_FAILED',
            message: 'GitHub API down',
        })
    })
})

// ---------------------------------------------------------------------------
// reportCleanupCandidates（fix-and-pr + --cleanup-branches：列清单不删）
// 覆盖未触达分支：行 163（status.merged 三元）
// ---------------------------------------------------------------------------

describe('reportCleanupCandidates', () => {
    const client = {} as never
    const baseCtx = (repos: string[]) => ({
        config: { repositories: repos } as unknown as AppContext['config'],
        logger: mockLogger(),
        allActions: [] as AppContext['allActions'],
        allErrors: [] as AppContext['allErrors'],
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('merged 分支 → 记 branch-cleanup action + 日志提示手动清理（行 163-172）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-m'])
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-m', prNumber: 1, merged: true, closed: false })

        const ctx = baseCtx(['foo/bar'])
        await reportCleanupCandidates(ctx as never, client)

        expect(ctx.logger.info).toHaveBeenCalledWith(expect.stringContaining('merged branch awaiting manual cleanup'))
        expect(ctx.allActions).toHaveLength(1)
        expect(ctx.allActions[0]).toMatchObject({
            type: 'branch-cleanup',
            repository: 'foo/bar',
            target: 'dependfix/auto-fix-m',
            success: true,
        })
    })

    it('非 merged 分支 → 不记 action（行 163 false 分支：filter 已合并）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-open'])
        // closed=true, merged=false 触发 filter 跳过
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ branch: 'dependfix/auto-fix-open', prNumber: 1, merged: false, closed: true })

        const ctx = baseCtx(['foo/bar'])
        await reportCleanupCandidates(ctx as never, client)

        expect(ctx.allActions).toHaveLength(0)
    })

    it('单仓库 listDependfixBranches 抛错 → 记 CLEANUP_DETECT_FAILED（行 175-183）', async () => {
        prCreatorMock.listDependfixBranches.mockRejectedValue(new Error('network error'))

        const ctx = baseCtx(['foo/bar'])
        await reportCleanupCandidates(ctx as never, client)

        expect(ctx.allErrors).toHaveLength(1)
        expect(ctx.allErrors[0]).toMatchObject({
            repository: 'foo/bar',
            stage: 'report',
            category: 'CLEANUP_DETECT_FAILED',
        })
    })
})

// ---------------------------------------------------------------------------
// confirmCleanup（交互式确认：非 TTY 默认拒绝）
// 覆盖未触达分支：行 263 if (!process.stdin.isTTY) true 分支
// ---------------------------------------------------------------------------

describe('confirmCleanup', () => {
    it('非 TTY 环境 → 返回 false（行 263-266：CI/管道环境直接拒绝）', async () => {
        Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true })

        const logger = mockLogger()
        // confirmCleanup 签名：ctx: Pick<AppContext, 'logger'> — 传 { logger } 而非 logger 本身
        const result = await confirmCleanup({ logger }, 'foo/bar', [{ branch: 'dependfix/auto-fix-x' }])

        expect(result).toBe(false)
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('non-TTY environment'))
    })
})

// ---------------------------------------------------------------------------
// autoCleanupMergedBranches 补测（dryRun + closed 三元 false 分支 + 空分支列表）
// 覆盖未触达分支：行 206 / 219（closed 三元）
// ---------------------------------------------------------------------------

describe('autoCleanupMergedBranches (补测)', () => {
    const client = {} as never
    const baseCtx = {
        config: { dryRun: false, repositories: ['foo/bar'] } as unknown as AppContext['config'],
        logger: mockLogger(),
        allActions: [] as AppContext['allActions'],
        allErrors: [] as AppContext['allErrors'],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        baseCtx.allActions = []
        baseCtx.allErrors = []
    })

    it('空分支列表 → 提示无分支并返回（行 206-209）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue([])

        await autoCleanupMergedBranches(baseCtx as never, client, 'foo/bar')

        expect(prCreatorMock.getBranchPrStatus).not.toHaveBeenCalled()
        expect(baseCtx.logger.info).toHaveBeenCalledWith(expect.stringContaining('no dependfix branches found'))
    })

    it('dryRun + closed 分支 → 列 "Would delete X (closed)"（行 219 closed 三元 false 分支）', async () => {
        prCreatorMock.listDependfixBranches.mockResolvedValue(['dependfix/auto-fix-c'])
        // merged=false, closed=true 触发 ternary false 分支输出 "closed"
        prCreatorMock.getBranchPrStatus.mockResolvedValue({ merged: false, closed: true })

        await autoCleanupMergedBranches(
            { ...baseCtx, config: { dryRun: true, repositories: ['foo/bar'] } } as never,
            client,
            'foo/bar',
        )

        expect(prCreatorMock.deleteRemoteBranch).not.toHaveBeenCalled()
        expect(baseCtx.logger.info).toHaveBeenCalledWith(expect.stringContaining('Would delete dependfix/auto-fix-c (closed)'))
    })
})
