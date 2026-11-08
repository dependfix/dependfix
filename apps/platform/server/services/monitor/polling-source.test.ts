import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import nock from 'nock'
import { Octokit } from '@octokit/rest'
import { PollingSource, isTargetAuthor } from './polling-source'
import { isFailureConclusion, TARGET_PR_AUTHOR_LOGINS } from './types'

const API = 'https://api.github.com'

/** 构造测试用 Octokit（不真实发请求，由 nock 拦截） */
const makeOctokit = (): Octokit => new Octokit({ auth: 'test-token' })

const HEAD_SHA = 'a'.repeat(40)

/** PR 夹具（author 可配置；updated_at 默认在窗口内） */
const makePr = (overrides: Record<string, unknown> = {}) => ({
    number: 101,
    html_url: 'https://github.com/acme/web-app/pull/101',
    updated_at: new Date().toISOString(),
    user: { login: 'dependfix[bot]' },
    head: { sha: HEAD_SHA },
    ...overrides,
})

/** 注册三源的常规响应（各源可覆盖 / 传 null 表示不注册，用于 fail-open 用例） */
const mockSources = (options: {
    pulls?: unknown[]
    checkRuns?: unknown[]
    statuses?: unknown[]
    deployments?: unknown[]
    deploymentStatuses?: Record<number, unknown[]>
} = {}) => {
    const {
        pulls = [makePr()],
        checkRuns = [],
        statuses = [],
        deployments = [],
        deploymentStatuses = {},
    } = options

    nock(API).get('/repos/acme/web-app/pulls').query(true).reply(200, pulls)
    // check runs 显式要求 `filter=all`（重跑的历史尝试可见）；缺失该参数该请求不匹配 → 采集侧 fail-open 暴露
    nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/check-runs`).query({ filter: 'all', per_page: 100 }).reply(200, { total_count: checkRuns.length, check_runs: checkRuns })
    nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/statuses`).query(true).reply(200, statuses)
    nock(API).get('/repos/acme/web-app/deployments').query(true).reply(200, deployments)
    for (const [id, list] of Object.entries(deploymentStatuses)) {
        nock(API).get(`/repos/acme/web-app/deployments/${id}/statuses`).query(true).reply(200, list)
    }
}

const source = () => new PollingSource(makeOctokit())

describe('monitor/types', () => {
    describe('isFailureConclusion', () => {
        it('failure / timed_out / action_required 触发 firing', () => {
            expect(isFailureConclusion('failure')).toBe(true)
            expect(isFailureConclusion('timed_out')).toBe(true)
            expect(isFailureConclusion('action_required')).toBe(true)
        })

        it('success / pending / skipped 等不触发 firing', () => {
            expect(isFailureConclusion('success')).toBe(false)
            expect(isFailureConclusion('pending')).toBe(false)
            expect(isFailureConclusion('skipped')).toBe(false)
            expect(isFailureConclusion('cancelled')).toBe(false)
            expect(isFailureConclusion('neutral')).toBe(false)
            expect(isFailureConclusion('stale')).toBe(false)
        })
    })

    describe('TARGET_PR_AUTHOR_LOGINS', () => {
        it('默认含 dependfix[bot] + dependabot[bot]', () => {
            expect(TARGET_PR_AUTHOR_LOGINS).toContain('dependfix[bot]')
            expect(TARGET_PR_AUTHOR_LOGINS).toContain('dependabot[bot]')
        })
    })
})

describe('monitor/polling-source 工具函数', () => {
    describe('isTargetAuthor', () => {
        it('匹配 dependabot[bot]', () => {
            expect(isTargetAuthor('dependabot[bot]')).toBe(true)
        })

        it('匹配 dependfix[bot] 大小写不敏感', () => {
            expect(isTargetAuthor('DependFix[bot]')).toBe(true)
            expect(isTargetAuthor('dependfix[bot]')).toBe(true)
        })

        it('匹配 GitHub App 动态生成的 bot 名（依赖 [bot] + dependfix 子串）', () => {
            expect(isTargetAuthor('12345+dependfix[bot]')).toBe(true)
            expect(isTargetAuthor('9876+DependFix[bot]')).toBe(true)
        })

        it('不匹配普通用户或无关 bot', () => {
            expect(isTargetAuthor('alice')).toBe(false)
            expect(isTargetAuthor('renovate[bot]')).toBe(false)
            expect(isTargetAuthor('')).toBe(false)
        })
    })
})

describe('monitor/polling-source 三源采集', () => {
    beforeEach(() => {
        // 禁用真实网络：mock 缺失时请求直接抛错（而非打真实 GitHub），避免 fail-open 掩盖 mock 缺口
        nock.disableNetConnect()
        nock.cleanAll()
    })

    afterEach(() => {
        nock.cleanAll()
        nock.enableNetConnect()
    })

    it('归一化三源信号并标注 provider（Actions check + Vercel status/deployment + Cloudflare check）', async () => {
        mockSources({
            checkRuns: [
                {
                    id: 9001,
                    name: 'Test',
                    status: 'completed',
                    conclusion: 'success',
                    app: { slug: 'github-actions' },
                    output: { text: 'all good' },
                },
                {
                    id: 9002,
                    name: 'Workers Builds',
                    status: 'completed',
                    conclusion: 'failure',
                    app: { slug: 'cloudflare-workers-and-pages' },
                    output: { text: 'build failed: script size exceeded' },
                    details_url: 'https://dash.cloudflare.com/build/9002',
                },
            ],
            statuses: [
                {
                    id: 7001,
                    context: 'Vercel – web-app',
                    state: 'success',
                    target_url: 'https://vercel.com/acme/web-app/abc',
                },
            ],
            deployments: [
                { id: 5001, environment: 'Preview', creator: { login: 'vercel[bot]' } },
            ],
            deploymentStatuses: {
                '5001': [
                    {
                        state: 'failure',
                        description: 'Deployment failed',
                        environment_url: 'https://web-app-git-preview.vercel.app',
                        log_url: 'https://vercel.com/acme/web-app/logs',
                    },
                ],
            },
        })

        const snapshots = await source().fetchSnapshots({
            owner: 'acme',
            repo: 'web-app',
            repositoryId: 'repo-1',
        })

        expect(snapshots).toHaveLength(1)
        const snapshot = snapshots[0]!
        expect(snapshot.signals).toHaveLength(4)

        const providers = snapshot.signals.map((s) => `${s.kind}:${s.provider}`)
        expect(providers).toContain('check:github-actions')
        expect(providers).toContain('check:cloudflare-workers-and-pages')
        expect(providers).toContain('status:vercel')
        expect(providers).toContain('deployment:vercel')

        const deployment = snapshot.signals.find((s) => s.kind === 'deployment')!
        expect(deployment.state).toBe('failure')
        expect(deployment.name).toBe('Preview')
        expect(deployment.targetUrl).toBe('https://web-app-git-preview.vercel.app')
        expect(deployment.logUrl).toBe('https://vercel.com/acme/web-app/logs')

        // 聚合：Cloudflare check + Vercel deployment 失败 → overall=failure，conclusion 保留失败 check 粒度
        expect(snapshot.overallStatus).toBe('failure')
        expect(snapshot.conclusion).toBe('failure')
        expect(snapshot.errorMessage).toBe('build failed: script size exceeded')
    })

    it('无任何信号（无 check / 无 status / 无 deployment）的 PR 不产出快照', async () => {
        mockSources({ checkRuns: [], statuses: [], deployments: [] })
        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(0)
    })

    it('fail-open：check runs 源失败不阻断 commit statuses / deployments 源', async () => {
        nock(API).get('/repos/acme/web-app/pulls').query(true).reply(200, [makePr()])
        nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/check-runs`).query(true).reply(500, { message: 'boom' })
        nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/statuses`).query(true).reply(200, [
            { id: 7001, context: 'Vercel – web-app', state: 'failure', target_url: null },
        ])
        nock(API).get('/repos/acme/web-app/deployments').query(true).reply(200, [])

        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(1)
        expect(snapshots[0]!.signals).toHaveLength(1)
        expect(snapshots[0]!.signals[0]!.kind).toBe('status')
        expect(snapshots[0]!.overallStatus).toBe('failure')
    })

    it('fail-open：deployments 源失败不阻断其余源', async () => {
        nock(API).get('/repos/acme/web-app/pulls').query(true).reply(200, [makePr()])
        nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/check-runs`).query(true).reply(200, {
            total_count: 1,
            check_runs: [{ id: 9001, name: 'Test', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }],
        })
        nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/statuses`).query(true).reply(200, [])
        nock(API).get('/repos/acme/web-app/deployments').query(true).reply(500, { message: 'boom' })

        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(1)
        expect(snapshots[0]!.signals).toHaveLength(1)
        expect(snapshots[0]!.overallStatus).toBe('success')
    })

    it('轮询节流：updated_at 早于窗口的 PR 不再打三源 API', async () => {
        const stale = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
        mockSources({ pulls: [makePr({ updated_at: stale })] })

        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(0)
        // 断言节流生效于「请求前」：三源拦截器全部未被消费（仍在 pending），而 pulls 已消费
        const pending = nock.pendingMocks()
        expect(pending.some((p) => p.includes(`/commits/${HEAD_SHA}/check-runs`))).toBe(true)
        expect(pending.some((p) => p.includes('/deployments'))).toBe(true)
    })

    it('终态跳过集命中（同 HEAD）→ 本轮不采集该 PR', async () => {
        mockSources({
            checkRuns: [{ id: 9001, name: 'Test', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }],
        })
        const snapshots = await source().fetchSnapshots({
            owner: 'acme',
            repo: 'web-app',
            repositoryId: 'repo-1',
            knownTerminalHeads: new Map([[101, HEAD_SHA]]),
        })
        expect(snapshots).toHaveLength(0)
        const pending = nock.pendingMocks()
        expect(pending.some((p) => p.includes(`/commits/${HEAD_SHA}/check-runs`))).toBe(true)
    })

    it('终态跳过集命中但 HEAD 已变 → 仍采集', async () => {
        mockSources({
            checkRuns: [{ id: 9001, name: 'Test', status: 'completed', conclusion: 'success', app: { slug: 'github-actions' } }],
        })
        const snapshots = await source().fetchSnapshots({
            owner: 'acme',
            repo: 'web-app',
            repositoryId: 'repo-1',
            knownTerminalHeads: new Map([[101, 'b'.repeat(40)]]),
        })
        expect(snapshots).toHaveLength(1)
        expect(snapshots[0]!.overallStatus).toBe('success')
    })

    it('非目标作者 / 非 open PR 被忽略', async () => {
        mockSources({
            pulls: [
                makePr({ number: 1, user: { login: 'alice' } }),
                makePr({ number: 2, user: { login: 'renovate[bot]' } }),
            ],
        })
        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(0)
    })

    it('形态守卫：check runs 响应缺少 total_count（非标准形态）不产出伪信号', async () => {
        // Octokit paginate 对「无 total_count」的响应会把整个 body 当作单个元素返回
        nock(API).get('/repos/acme/web-app/pulls').query(true).reply(200, [makePr()])
        nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/check-runs`).query(true).reply(200, { check_runs: [] })
        nock(API).get(`/repos/acme/web-app/commits/${HEAD_SHA}/statuses`).query(true).reply(200, [
            { id: 7001, context: 'Vercel – web-app', state: 'success', target_url: null },
        ])
        nock(API).get('/repos/acme/web-app/deployments').query(true).reply(200, [])

        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(1)
        expect(snapshots[0]!.signals).toHaveLength(1)
        expect(snapshots[0]!.signals[0]!.kind).toBe('status')
    })

    it('同名同 run 的重跑：旧 failure + 新 success → 只留最新一轮，聚合 success', async () => {
        mockSources({
            checkRuns: [
                {
                    id: 9101,
                    name: 'Test',
                    status: 'completed',
                    conclusion: 'failure',
                    started_at: '2026-10-22T00:01:00Z',
                    completed_at: '2026-10-22T00:05:00Z',
                    details_url: 'https://github.com/acme/web-app/actions/runs/555/job/1',
                    app: { slug: 'github-actions' },
                },
                {
                    id: 9102,
                    name: 'Test',
                    status: 'completed',
                    conclusion: 'success',
                    started_at: '2026-10-22T00:10:00Z',
                    completed_at: '2026-10-22T00:14:00Z',
                    details_url: 'https://github.com/acme/web-app/actions/runs/555/job/2',
                    app: { slug: 'github-actions' },
                },
            ],
        })
        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots[0]!.signals).toHaveLength(1)
        expect(snapshots[0]!.overallStatus).toBe('success')
        expect(isFailureConclusion(snapshots[0]!.conclusion)).toBe(false)
    })

    it('completed + conclusion=null → 聚合 failure（fail-closed，与 CLI 同口径）', async () => {
        mockSources({
            checkRuns: [
                { id: 9201, name: 'Test', status: 'completed', conclusion: null, app: { slug: 'github-actions' } },
            ],
        })
        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots[0]!.overallStatus).toBe('failure')
        expect(snapshots[0]!.conclusion).toBe('failure')
    })

    it('未完成的 check run → 信号 pending → 聚合 pending（非失败不 firing）', async () => {
        mockSources({
            checkRuns: [
                { id: 9003, name: 'Test', status: 'in_progress', conclusion: null, app: { slug: 'github-actions' } },
            ],
        })
        const snapshots = await source().fetchSnapshots({ owner: 'acme', repo: 'web-app', repositoryId: 'repo-1' })
        expect(snapshots).toHaveLength(1)
        expect(snapshots[0]!.overallStatus).toBe('pending')
        expect(snapshots[0]!.conclusion).toBe('pending')
        expect(isFailureConclusion(snapshots[0]!.conclusion)).toBe(false)
    })
})

describe('monitor/polling-source 生命周期解析', () => {
    beforeEach(() => {
        nock.disableNetConnect()
        nock.cleanAll()
    })

    afterEach(() => {
        nock.cleanAll()
        nock.enableNetConnect()
    })

    const mockOpenList = (numbers: number[]) => {
        nock(API)
            .get('/repos/acme/web-app/pulls')
            .query((query) => query.state === 'open')
            .reply(200, numbers.map((number) => ({ number, state: 'open' })))
    }

    it('open 列表命中 → open；未命中逐个 get 区分 merged / closed', async () => {
        mockOpenList([101])
        nock(API)
            .get('/repos/acme/web-app/pulls/102')
            .reply(200, { number: 102, state: 'closed', merged_at: '2026-09-01T00:00:00Z' })
        nock(API)
            .get('/repos/acme/web-app/pulls/103')
            .reply(200, { number: 103, state: 'closed', merged_at: null })

        const states = await source().fetchPrLifecycles({
            owner: 'acme',
            repo: 'web-app',
            prNumbers: [101, 102, 103],
        })

        expect([...states.entries()].sort((a, b) => a[0] - b[0])).toEqual([
            [101, 'open'],
            [102, 'merged'],
            [103, 'closed'],
        ])
        expect(nock.isDone()).toBe(true)
    })

    it('空编号集合 → 不发任何请求', async () => {
        const states = await source().fetchPrLifecycles({
            owner: 'acme',
            repo: 'web-app',
            prNumbers: [],
        })
        expect(states.size).toBe(0)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('单 PR 404（已删除 / 转移）→ 按 closed 处理，不占用后续解析名额', async () => {
        mockOpenList([201])
        nock(API).get('/repos/acme/web-app/pulls/202').reply(404, { message: 'Not Found' })
        nock(API).get('/repos/acme/web-app/pulls/203').reply(200, { number: 203, state: 'closed', merged_at: null })

        const states = await source().fetchPrLifecycles({
            owner: 'acme',
            repo: 'web-app',
            prNumbers: [201, 202, 203],
        })

        expect(states.get(201)).toBe('open')
        expect(states.get(202)).toBe('closed')
        expect(states.get(203)).toBe('closed')
    })

    it('open 列表采集失败 → 返回空 map 且不抛错（fail-open）', async () => {
        nock(API).get('/repos/acme/web-app/pulls').query(true).reply(404, { message: 'Not Found' })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

        const states = await source().fetchPrLifecycles({
            owner: 'acme',
            repo: 'web-app',
            prNumbers: [301],
        })

        expect(states.size).toBe(0)
        expect(warn).toHaveBeenCalled()
    })
})
