import type { DataSource } from 'typeorm'
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import { ActionStatusMonitor } from './action-status-monitor'
import type { PRCheckSnapshot, PRCheckSyncSource } from './types'

// ---------- mock DataSource / Repository ----------
const {
    prCheckFindOne,
    prCheckSave,
    repoFind,
} = vi.hoisted(() => ({
    prCheckFindOne: vi.fn(),
    prCheckSave: vi.fn(),
    repoFind: vi.fn(),
}))

const makeMockDataSource = (): DataSource => {
    const prCheckRepo = {
        findOne: prCheckFindOne,
        save: prCheckSave,
    }
    const repositoryRepo = {
        find: repoFind,
    }
    return {
        getRepository: (entity: unknown) => {
            // PRCheck 实体：按 type name 区分（测试环境 module identity 不同）
            const name = (entity as { name?: string })?.name ?? ''
            if (name === 'PRCheck') {
                return prCheckRepo
            }
            if (name === 'Repository') {
                return repositoryRepo
            }
            throw new Error(`unexpected entity: ${String(entity)}`)
        },
    } as unknown as DataSource
}

// ---------- mock SyncSource ----------
const makeSnapshot = (overrides: Partial<PRCheckSnapshot> = {}): PRCheckSnapshot => ({
    repositoryId: 'repo-1',
    owner: 'octocat',
    repo: 'hello-world',
    prNumber: 42,
    headSha: 'a'.repeat(40),
    authorLogin: 'dependabot[bot]',
    conclusion: 'success',
    checkRunId: '12345',
    detailsUrl: 'https://github.com/octocat/hello-world/pull/42',
    errorMessage: null,
    observedAt: new Date('2026-09-03T00:00:00Z'),
    ...overrides,
})

describe('ActionStatusMonitor', () => {
    let monitor: ActionStatusMonitor
    let mockSource: PRCheckSyncSource

    beforeEach(() => {
        vi.clearAllMocks()
        repoFind.mockResolvedValue([
            { id: 'repo-1', owner: 'octocat', name: 'hello-world', credentialId: null },
        ])
        prCheckSave.mockImplementation(async (row) => row)
        prCheckFindOne.mockResolvedValue(null) // 默认无 existing
        const ds = makeMockDataSource()
        mockSource = { fetchSnapshots: vi.fn() }
        monitor = new ActionStatusMonitor(ds, mockSource)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('pollOnce 基本流程', () => {
        it('空快照数组 → processed=0, errors=0', async () => {
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            const result = await monitor.pollOnce({ organizationId: 'org-1' })
            expect(result).toEqual({ processed: 0, errors: 0 })
            expect(prCheckSave).not.toHaveBeenCalled()
        })

        it('1 个 success 快照 → INSERT 路径 + alertFiring=false', async () => {
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([makeSnapshot()])
            const result = await monitor.pollOnce({ organizationId: 'org-1' })
            expect(result).toEqual({ processed: 1, errors: 0 })
            expect(prCheckSave).toHaveBeenCalledTimes(1)
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved).toMatchObject({
                repositoryId: 'repo-1',
                prNumber: 42,
                headSha: 'a'.repeat(40),
                authorLogin: 'dependabot[bot]',
                conclusion: 'success',
                alertFiring: false,
                acknowledgedAt: null,
                lastPolledAt: new Date('2026-09-03T00:00:00Z'),
            })
        })

        it('1 个 failure 快照 → INSERT 路径 + alertFiring=true（状态机 D3）', async () => {
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({ conclusion: 'failure', errorMessage: 'TS2339: x missing' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(true)
            expect(saved.errorMessage).toBe('TS2339: x missing')
        })
    })

    describe('状态机（关键决策 D3）', () => {
        it('UPDATE 路径：failure 覆盖原 ack 状态为 firing=true', async () => {
            prCheckFindOne.mockResolvedValue({
                id: 'existing-1',
                repositoryId: 'repo-1',
                prNumber: 42,
                headSha: 'a'.repeat(40),
                alertFiring: false, // 用户之前 ack 过
                acknowledgedAt: new Date('2026-09-02T00:00:00Z'),
                acknowledgedByUserId: 'user-1',
                conclusion: 'success',
            })
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({ conclusion: 'failure' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(true) // 失败覆盖 ack
            expect(saved.conclusion).toBe('failure')
        })

        it('UPDATE 路径：success 回归 → 自动 ack（清空用户 ack 时间）', async () => {
            // 真实回归场景：PR 失败 → 用户手动 ack → 再 polling success → 必须清空用户 ack 时间
            prCheckFindOne.mockResolvedValue({
                id: 'existing-1',
                repositoryId: 'repo-1',
                prNumber: 42,
                headSha: 'a'.repeat(40),
                alertFiring: true,
                acknowledgedAt: new Date('2026-09-01T00:00:00Z'),
                acknowledgedByUserId: 'user-1',
                conclusion: 'failure',
            })
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({ conclusion: 'success' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(false) // 回归 success 自动 ack
            expect(saved.conclusion).toBe('success')
            expect(saved.acknowledgedAt).toBeNull() // 真实验证 acknowledgedAt 被清空
            expect(saved.acknowledgedByUserId).toBeNull()
        })

        it('UPDATE 路径：timed_out 触发 firing（与 failure 等价）', async () => {
            prCheckFindOne.mockResolvedValue(null)
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({ conclusion: 'timed_out' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(true)
        })
    })

    describe('错误隔离（fail-open）', () => {
        it('单仓 syncSource 失败不影响其他仓库', async () => {
            // 2 仓库，第 2 仓库 fetchSnapshots 抛错
            repoFind.mockResolvedValue([
                { id: 'repo-1', owner: 'octocat', name: 'hello-world', credentialId: null },
                { id: 'repo-2', owner: 'foo', name: 'bar', credentialId: null },
            ])
            vi.mocked(mockSource.fetchSnapshots).mockImplementation(async (input) => {
                if (input.repositoryId === 'repo-1') {
                    return [makeSnapshot({ repositoryId: 'repo-1', prNumber: 1 })]
                }
                throw new Error('network timeout')
            })
            const result = await monitor.pollOnce({ organizationId: 'org-1' })
            expect(result).toEqual({ processed: 1, errors: 1 })
            expect(prCheckSave).toHaveBeenCalledTimes(1)
        })
    })
})
