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
import { TERMINAL_REPOLL_QUIET_MS } from './build-signals'
import type { PRCheckSnapshot, PRCheckSyncSource, UnifiedBuildSignal } from './types'

// ---------- mock DataSource / Repository ----------
const {
    prCheckFind,
    prCheckFindOne,
    prCheckSave,
    prCheckUpdate,
    repoFind,
} = vi.hoisted(() => ({
    prCheckFind: vi.fn(),
    prCheckFindOne: vi.fn(),
    prCheckSave: vi.fn(),
    prCheckUpdate: vi.fn(),
    repoFind: vi.fn(),
}))

const makeMockDataSource = (): DataSource => {
    const prCheckRepo = {
        find: prCheckFind,
        findOne: prCheckFindOne,
        save: prCheckSave,
        update: prCheckUpdate,
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

// ---------- 信号 / 快照夹具 ----------
const makeSignal = (overrides: Partial<UnifiedBuildSignal> = {}): UnifiedBuildSignal => ({
    kind: 'check',
    provider: 'github-actions',
    name: 'Test',
    state: 'success',
    rawState: 'success',
    sourceId: '9001',
    targetUrl: null,
    logUrl: null,
    summary: null,
    observedAt: new Date('2026-09-03T00:00:00Z'),
    ...overrides,
})

const makeSnapshot = (overrides: Partial<PRCheckSnapshot> = {}): PRCheckSnapshot => ({
    repositoryId: 'repo-1',
    owner: 'octocat',
    repo: 'hello-world',
    prNumber: 42,
    headSha: 'a'.repeat(40),
    authorLogin: 'dependabot[bot]',
    conclusion: 'success',
    signals: [makeSignal()],
    overallStatus: 'success',
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
        prCheckFind.mockResolvedValue([]) // 默认无既有行（终态跳过集为空）
        prCheckFindOne.mockResolvedValue(null) // 默认无 existing
        prCheckUpdate.mockResolvedValue({ affected: 1 })
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

        it('1 个 success 快照 → INSERT 路径 + alertFiring=false + 三源字段落库', async () => {
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
                overallStatus: 'success',
                alertFiring: false,
                acknowledgedAt: null,
                lastPolledAt: new Date('2026-09-03T00:00:00Z'),
            })
            expect(JSON.parse(saved.signalsJson)).toHaveLength(1)
            expect(JSON.parse(saved.failureSourcesJson)).toEqual([])
        })

        it('1 个 failure 快照 → INSERT 路径 + alertFiring=true（状态机）+ 失败源清单', async () => {
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({
                    conclusion: 'failure',
                    overallStatus: 'failure',
                    errorMessage: 'TS2339: x missing',
                    signals: [
                        makeSignal({ state: 'success' }),
                        makeSignal({
                            kind: 'deployment',
                            provider: 'vercel',
                            name: 'Preview',
                            state: 'failure',
                            rawState: 'failure',
                            sourceId: '5001',
                            summary: 'Deployment failed',
                        }),
                    ],
                }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(true)
            expect(saved.errorMessage).toBe('TS2339: x missing')
            expect(saved.overallStatus).toBe('failure')
            expect(JSON.parse(saved.failureSourcesJson)).toEqual([
                { provider: 'vercel', name: 'Preview', kind: 'deployment' },
            ])
        })

        it('空信号快照 → 守卫跳过（不落库、不计入 processed）', async () => {
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([makeSnapshot({ signals: [] })])
            const result = await monitor.pollOnce({ organizationId: 'org-1' })
            expect(result).toEqual({ processed: 0, errors: 0 })
            expect(prCheckSave).not.toHaveBeenCalled()
        })
    })

    describe('状态机（关键决策与后续承接）', () => {
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
                makeSnapshot({ conclusion: 'failure', overallStatus: 'failure' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(true) // 失败覆盖 ack
            expect(saved.conclusion).toBe('failure')
        })

        it('UPDATE 路径：聚合 success 回归 → 自动 ack（清空用户 ack 时间）', async () => {
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
                makeSnapshot({ conclusion: 'success', overallStatus: 'success' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(false) // 回归 success 自动 ack
            expect(saved.conclusion).toBe('success')
            expect(saved.acknowledgedAt).toBeNull() // 真实验证 acknowledgedAt 被清空
            expect(saved.acknowledgedByUserId).toBeNull()
        })

        it('UPDATE 路径：聚合 success 但结论为 neutral（存在 neutral 信号）→ 仍清空 ack', async () => {
            // 自动 ack 判定按 overallStatus（此前按 conclusion 时 neutral 永不清 ack）
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
                makeSnapshot({
                    conclusion: 'neutral',
                    overallStatus: 'success',
                    signals: [
                        makeSignal({ state: 'success' }),
                        makeSignal({ provider: 'cloudflare-workers-and-pages', state: 'neutral', rawState: 'neutral' }),
                    ],
                }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.conclusion).toBe('neutral')
            expect(saved.alertFiring).toBe(false)
            expect(saved.acknowledgedAt).toBeNull()
        })

        it('UPDATE 路径：聚合 pending → 不清 ack（非终态不视为回归成功）', async () => {
            prCheckFindOne.mockResolvedValue({
                id: 'existing-1',
                repositoryId: 'repo-1',
                prNumber: 42,
                headSha: 'a'.repeat(40),
                alertFiring: false,
                acknowledgedAt: new Date('2026-09-01T00:00:00Z'),
                acknowledgedByUserId: 'user-1',
                conclusion: 'failure',
            })
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({
                    conclusion: 'pending',
                    overallStatus: 'pending',
                    signals: [makeSignal({ state: 'pending', rawState: null })],
                }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(false)
            expect(saved.acknowledgedAt).toEqual(new Date('2026-09-01T00:00:00Z'))
        })

        it('UPDATE 路径：timed_out 触发 firing（与 failure 等价）', async () => {
            prCheckFindOne.mockResolvedValue(null)
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({ conclusion: 'timed_out', overallStatus: 'failure' }),
            ])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.alertFiring).toBe(true)
        })
    })

    describe('关注集（聚合 / 告警层过滤）', () => {
        const withFocus = (focus: unknown) => {
            repoFind.mockResolvedValue([{
                id: 'repo-1',
                owner: 'octocat',
                name: 'hello-world',
                credentialId: null,
                prCheckFocus: JSON.stringify(focus),
            }])
        }

        it('未配置关注集：派生字段逐字节沿用快照值（即使与 signals 派生态冲突）', async () => {
            // 等价性护栏：快照的 5 个派生字段全部与「由 signals 重新派生」的结果不同——
            // 若实现把未配置路径也改为重新派生，本用例必须失败（mutation 标定点）
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({
                    conclusion: 'action_required',
                    overallStatus: 'pending',
                    checkRunId: 'snapshot-run-id',
                    errorMessage: 'snapshot-error',
                    signals: [
                        makeSignal({
                            name: 'Lint',
                            state: 'failure',
                            rawState: 'failure',
                            summary: 'lint failed',
                            sourceId: '9001',
                        }),
                    ],
                }),
            ])

            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.conclusion).toBe('action_required')
            expect(saved.overallStatus).toBe('pending')
            expect(saved.checkRunId).toBe('snapshot-run-id')
            expect(saved.errorMessage).toBe('snapshot-error')
            // 失败源清单仍来自信号（未配置时即全量信号）
            expect(JSON.parse(saved.failureSourcesJson)).toEqual([
                { provider: 'github-actions', name: 'Lint', kind: 'check' },
            ])
        })

        it('关注面内同名多轮收敛：旧 failure + 新 success 取最新一轮（不误报）', async () => {
            withFocus({ names: ['Test'] })
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({
                    // 快照侧（假设来自未做收敛的 SyncSource）仍报 failure
                    conclusion: 'failure',
                    overallStatus: 'failure',
                    signals: [
                        makeSignal({
                            name: 'Test',
                            state: 'failure',
                            rawState: 'failure',
                            sourceId: '9001',
                            targetUrl: 'https://github.com/octocat/hello-world/actions/runs/777/job/1',
                            roundAt: '2026-09-03T00:01:00Z',
                        }),
                        makeSignal({
                            name: 'Test',
                            state: 'success',
                            rawState: 'success',
                            sourceId: '9002',
                            targetUrl: 'https://github.com/octocat/hello-world/actions/runs/777/job/2',
                            roundAt: '2026-09-03T00:09:00Z',
                        }),
                    ],
                }),
            ])

            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.overallStatus).toBe('success')
            expect(saved.conclusion).toBe('success')
            expect(saved.alertFiring).toBe(false)
            // 快照 signals 原样落库（本用例由 mock 提供、未经采集层收敛；生产 PollingSource 已在采集层收敛）
            expect(JSON.parse(saved.signalsJson)).toHaveLength(2)
        })

        it('命中项全为 success：未关注的 failure 不触发告警，但全量信号仍落库', async () => {
            withFocus({ names: ['Test'] })
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({
                    // 快照侧仍按全量信号派生 failure —— 监控器须以关注面覆盖
                    conclusion: 'failure',
                    overallStatus: 'failure',
                    errorMessage: 'lint failed',
                    signals: [
                        makeSignal({ name: 'Test', state: 'success', rawState: 'success', sourceId: '9001' }),
                        makeSignal({
                            name: 'Lint',
                            state: 'failure',
                            rawState: 'failure',
                            summary: 'lint failed',
                            sourceId: '9002',
                        }),
                    ],
                }),
            ])

            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.overallStatus).toBe('success')
            expect(saved.conclusion).toBe('success')
            expect(saved.alertFiring).toBe(false)
            // 审计面：未关注信号仍全量落库
            expect(JSON.parse(saved.signalsJson)).toHaveLength(2)
            expect(JSON.parse(saved.failureSourcesJson)).toEqual([])
            // 代表字段与告警同源（取关注面，而非未关注信号）
            expect(saved.checkRunId).toBe('9001')
            expect(saved.errorMessage).toBeNull()
        })

        it('命中项失败：聚合 / 结论 / 失败源 / 代表字段均取关注面（保留 timed_out 粒度）', async () => {
            withFocus({ providers: ['GitHub-Actions'], names: ['test'], kinds: ['check'] })
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([
                makeSnapshot({
                    conclusion: 'success',
                    overallStatus: 'success',
                    signals: [
                        makeSignal({
                            name: 'Test',
                            state: 'failure',
                            rawState: 'timed_out',
                            summary: 'Test timed out',
                            sourceId: '9001',
                        }),
                        makeSignal({
                            kind: 'deployment',
                            provider: 'vercel',
                            name: 'Preview',
                            state: 'failure',
                            rawState: 'failure',
                            summary: 'Deployment failed',
                            sourceId: '5001',
                        }),
                    ],
                }),
            ])

            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.overallStatus).toBe('failure')
            expect(saved.conclusion).toBe('timed_out')
            expect(saved.alertFiring).toBe(true)
            expect(JSON.parse(saved.failureSourcesJson)).toEqual([
                { provider: 'github-actions', name: 'Test', kind: 'check' },
            ])
            expect(saved.errorMessage).toBe('Test timed out')
        })

        it('关注面零命中：按空集聚合为 success 并自动 ack，历史未关注失败仍可审计', async () => {
            withFocus({ names: ['Missing'] })
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
                makeSnapshot({
                    conclusion: 'failure',
                    overallStatus: 'failure',
                    signals: [makeSignal({ name: 'Lint', state: 'failure', rawState: 'failure' })],
                }),
            ])

            await monitor.pollOnce({ organizationId: 'org-1' })
            const saved = prCheckSave.mock.calls[0]?.[0]
            expect(saved.overallStatus).toBe('success')
            expect(saved.conclusion).toBe('success')
            expect(saved.alertFiring).toBe(false)
            expect(saved.acknowledgedAt).toBeNull()
            expect(JSON.parse(saved.signalsJson)).toHaveLength(1)
            expect(JSON.parse(saved.failureSourcesJson)).toEqual([])
        })
    })

    describe('终态节流（后续承接项）', () => {
        it('终态 + 静默窗口内 → 传入 knownTerminalHeads（采集层据此跳过）', async () => {
            prCheckFind.mockResolvedValue([
                {
                    prNumber: 42,
                    headSha: 'a'.repeat(40),
                    overallStatus: 'failure',
                    lastPolledAt: new Date(Date.now() - 5 * 60 * 1000),
                },
            ])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const input = vi.mocked(mockSource.fetchSnapshots).mock.calls[0]?.[0]
            expect(input?.knownTerminalHeads?.get(42)).toBe('a'.repeat(40))
        })

        it('静默窗口外 → 不跳过（重新采集以捕获同 SHA 重跑 / 迟到部署失败）', async () => {
            prCheckFind.mockResolvedValue([
                {
                    prNumber: 42,
                    headSha: 'a'.repeat(40),
                    overallStatus: 'success',
                    lastPolledAt: new Date(Date.now() - TERMINAL_REPOLL_QUIET_MS - 60 * 1000),
                },
            ])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const input = vi.mocked(mockSource.fetchSnapshots).mock.calls[0]?.[0]
            expect(input?.knownTerminalHeads?.size).toBe(0)
        })

        it('非终态（pending / 历史 NULL）→ 不跳过', async () => {
            prCheckFind.mockResolvedValue([
                { prNumber: 1, headSha: 'b'.repeat(40), overallStatus: 'pending', lastPolledAt: new Date() },
                { prNumber: 2, headSha: 'c'.repeat(40), overallStatus: null, lastPolledAt: new Date() },
            ])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            await monitor.pollOnce({ organizationId: 'org-1' })
            const input = vi.mocked(mockSource.fetchSnapshots).mock.calls[0]?.[0]
            expect(input?.knownTerminalHeads?.size).toBe(0)
        })
    })

    describe('PR 生命周期', () => {
        const makeRow = (overrides: Record<string, unknown> = {}) => ({
            id: 'row-1',
            repositoryId: 'repo-1',
            prNumber: 42,
            headSha: 'a'.repeat(40),
            prState: 'open',
            overallStatus: 'failure',
            conclusion: 'failure',
            alertFiring: true,
            acknowledgedAt: null as Date | null,
            acknowledgedByUserId: null as string | null,
            lastPolledAt: new Date(Date.now() - 60 * 60 * 1000),
            ...overrides,
        })

        const lifecycleSource = (states: Map<number, 'open' | 'closed' | 'merged'>) => {
            mockSource.fetchPrLifecycles = vi.fn(async () => states)
        }

        it('关闭的失败 PR → 条件更新 prState=closed + alertFiring=false，不动 ack 字段', async () => {
            const acknowledgedAt = new Date('2026-09-01T00:00:00Z')
            prCheckFind.mockResolvedValue([makeRow({ acknowledgedAt, acknowledgedByUserId: 'user-1' })])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            lifecycleSource(new Map([[42, 'closed']]))

            const result = await monitor.pollOnce({ organizationId: 'org-1' })

            // 生命周期更新不计入 processed（信号处理计数口径不变）
            expect(result).toEqual({ processed: 0, errors: 0 })
            expect(mockSource.fetchPrLifecycles).toHaveBeenCalledWith({
                owner: 'octocat',
                repo: 'hello-world',
                prNumbers: [42],
            })
            // 乐观锁 = 读取时 prState；payload 只含生命周期字段（不整行写回，避免 stale ack 覆盖）
            expect(prCheckUpdate).toHaveBeenCalledWith(
                { id: 'row-1', prState: 'open' },
                { prState: 'closed', alertFiring: false },
            )
            expect(prCheckSave).not.toHaveBeenCalled()
        })

        it('合并的 PR → prState=merged 且关闭 firing', async () => {
            prCheckFind.mockResolvedValue([makeRow()])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            lifecycleSource(new Map([[42, 'merged']]))

            await monitor.pollOnce({ organizationId: 'org-1' })

            expect(prCheckUpdate).toHaveBeenCalledWith(
                { id: 'row-1', prState: 'open' },
                { prState: 'merged', alertFiring: false },
            )
        })

        it('unknown 存量行确认 open → 回填 prState 且不改告警态', async () => {
            prCheckFind.mockResolvedValue([makeRow({ prState: 'unknown' })])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            lifecycleSource(new Map([[42, 'open']]))

            await monitor.pollOnce({ organizationId: 'org-1' })

            expect(prCheckUpdate).toHaveBeenCalledWith(
                { id: 'row-1', prState: 'unknown' },
                { prState: 'open' },
            )
        })

        it('同 PR 多 HEAD 行 → 全部行同步终态（不提前中断）', async () => {
            prCheckFind.mockResolvedValue([
                makeRow({ id: 'row-new', headSha: 'b'.repeat(40) }),
                makeRow({ id: 'row-old', headSha: 'c'.repeat(40) }),
            ])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            lifecycleSource(new Map([[42, 'closed']]))

            await monitor.pollOnce({ organizationId: 'org-1' })

            expect(prCheckUpdate).toHaveBeenCalledTimes(2)
            expect(prCheckUpdate).toHaveBeenNthCalledWith(
                1,
                { id: 'row-new', prState: 'open' },
                { prState: 'closed', alertFiring: false },
            )
            expect(prCheckUpdate).toHaveBeenNthCalledWith(
                2,
                { id: 'row-old', prState: 'open' },
                { prState: 'closed', alertFiring: false },
            )
        })

        it('并发写方先改行（affected=0）→ 本轮不覆盖对方结果', async () => {
            prCheckFind.mockResolvedValue([makeRow()])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            lifecycleSource(new Map([[42, 'closed']]))
            // 模拟用户 ack / 另一轮 polling 已把该行 prState 改走 → 条件更新 0 行
            prCheckUpdate.mockResolvedValue({ affected: 0 })

            const result = await monitor.pollOnce({ organizationId: 'org-1' })

            expect(result).toEqual({ processed: 0, errors: 0 })
            expect(prCheckUpdate).toHaveBeenCalledTimes(1)
            expect(prCheckSave).not.toHaveBeenCalled()
        })

        it('本轮快照覆盖的 PR 不进入生命周期候选（快照即 open 证据）', async () => {
            prCheckFind.mockResolvedValue([makeRow({ prState: 'unknown' })])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([makeSnapshot()])
            lifecycleSource(new Map([[42, 'open']]))

            await monitor.pollOnce({ organizationId: 'org-1' })

            expect(mockSource.fetchPrLifecycles).not.toHaveBeenCalled()
            expect(prCheckUpdate).not.toHaveBeenCalled()
        })

        it('生命周期解析失败 fail-open：不抛错、不写生命周期字段', async () => {
            prCheckFind.mockResolvedValue([makeRow()])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            mockSource.fetchPrLifecycles = vi.fn(async () => {
                throw new Error('rate limited')
            })
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

            const result = await monitor.pollOnce({ organizationId: 'org-1' })

            expect(result).toEqual({ processed: 0, errors: 0 })
            expect(prCheckSave).not.toHaveBeenCalled()
            expect(prCheckUpdate).not.toHaveBeenCalled()
            expect(warn).toHaveBeenCalled()
        })

        it('关闭后下一轮不重开告警（终态行不再进入候选集）', async () => {
            prCheckFind.mockResolvedValue([makeRow({ prState: 'closed', alertFiring: false })])
            vi.mocked(mockSource.fetchSnapshots).mockResolvedValue([])
            lifecycleSource(new Map([[42, 'open']]))

            await monitor.pollOnce({ organizationId: 'org-1' })

            expect(mockSource.fetchPrLifecycles).not.toHaveBeenCalled()
            expect(prCheckSave).not.toHaveBeenCalled()
            expect(prCheckUpdate).not.toHaveBeenCalled()
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
