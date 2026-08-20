// branch-cleanup.test.ts — autoCleanupMergedBranches / closeSupersededPRs（分支清理安全边界）。
// 拆分自 app/helpers.test.ts（原 1031 行超 max-lines 1000）。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { autoCleanupMergedBranches, closeSupersededPRs, type AppContext } from './helpers'

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
