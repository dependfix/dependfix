import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createGitHubClient, deleteRemoteBranch, getBranchPrStatus, listDependfixBranches } from 'dependfix'
import { cleanupBranches } from './cleanup-branches'

vi.mock('dependfix', () => ({
    createGitHubClient: vi.fn(),
    deleteRemoteBranch: vi.fn(),
    getBranchPrStatus: vi.fn(),
    listDependfixBranches: vi.fn(),
}))

const listMock = vi.mocked(listDependfixBranches)
const statusMock = vi.mocked(getBranchPrStatus)
const deleteMock = vi.mocked(deleteRemoteBranch)
const clientMock = vi.mocked(createGitHubClient)

beforeEach(() => {
    listMock.mockReset()
    statusMock.mockReset()
    deleteMock.mockReset()
    clientMock.mockReset()
    clientMock.mockReturnValue({} as never)
    delete process.env.GITHUB_TOKEN
})

const status = (branch: string, merged: boolean, closed: boolean) => ({
    branch,
    prNumber: merged || closed ? 1 : null,
    merged,
    closed,
})

describe('cleanupBranches（非交互清理，语义对齐 autoCleanupMergedBranches）', () => {
    it('returns error when GITHUB_TOKEN is not set', async () => {
        const result = await cleanupBranches({ repo: 'owner-a/repo-b' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('GITHUB_TOKEN')
    })

    it('returns error for malformed repo', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        const result = await cleanupBranches({ repo: 'invalid' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('owner/repo')
    })

    it('dry_run lists candidates without deleting', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        listMock.mockResolvedValue(['dependfix/merged-1', 'dependfix/orphan-1', 'dependfix/open-1'])
        statusMock.mockImplementation(async (_c, _o, _r, branch: string) => {
            if (branch === 'dependfix/merged-1') {
                return status(branch, true, true)
            }
            if (branch === 'dependfix/orphan-1') {
                return status(branch, false, true)
            }
            return status(branch, false, false)
        })

        const result = await cleanupBranches({ repo: 'owner-a/repo-b', dry_run: true })

        expect(result.ok).toBe(true)
        expect(result).toMatchObject({
            dryRun: true,
            scanned: ['dependfix/merged-1', 'dependfix/orphan-1', 'dependfix/open-1'],
            deleted: [],
            kept: ['dependfix/open-1'],
        })
        expect(deleteMock).not.toHaveBeenCalled()
    })

    it('deletes merged and orphaned branches, keeps open, records failures', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        listMock.mockResolvedValue(['dependfix/merged-1', 'dependfix/orphan-1', 'dependfix/open-1'])
        statusMock.mockImplementation(async (_c, _o, _r, branch: string) => {
            if (branch === 'dependfix/merged-1') {
                return status(branch, true, true)
            }
            if (branch === 'dependfix/orphan-1') {
                return status(branch, false, true)
            }
            return status(branch, false, false)
        })
        deleteMock.mockImplementation(async (_c, _o, _r, branch: string) => {
            if (branch === 'dependfix/orphan-1') {
                throw new Error('protected branch')
            }
        })

        const result = await cleanupBranches({ repo: 'owner-a/repo-b' })

        expect(result.ok).toBe(true)
        expect(result).toMatchObject({
            dryRun: false,
            deleted: ['dependfix/merged-1'],
            kept: ['dependfix/open-1'],
            failed: ['dependfix/orphan-1'],
        })
        expect(deleteMock).toHaveBeenCalledTimes(2)
        // open 分支绝不触碰
        expect(deleteMock).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.anything(), 'dependfix/open-1')
    })

    it('wraps thrown errors into ok:false', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        listMock.mockRejectedValue(new Error('network error'))

        const result = await cleanupBranches({ repo: 'owner-a/repo-b' })

        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('network error')
    })
})
