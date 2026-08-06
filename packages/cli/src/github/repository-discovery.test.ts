import { describe, expect, it, afterEach, beforeEach } from 'vitest'
import nock from 'nock'
import { AppError } from '@dependfix/core'
import { createGitHubClient } from './client'
import { discoverRepositories, mergeRepositories } from './repository-discovery'

const API_BASE = 'https://api.github.com'

function setupClient(token = 'test-token') {
    return createGitHubClient({ token })
}

/** 构造仓库列表项（默认全部通过基础过滤） */
function makeRepo(overrides: Record<string, unknown> = {}) {
    return {
        full_name: 'foo/bar',
        default_branch: 'main',
        archived: false,
        disabled: false,
        fork: false,
        topics: [] as string[],
        ...overrides,
    }
}

describe('discoverRepositories', () => {
    afterEach(() => {
        nock.cleanAll()
    })

    beforeEach(() => {
        // 未 mock 的请求立即失败（负向测试防真实外发）
        nock.disableNetConnect()
    })

    it('discovers user-owned repos with pagination, filtering and deterministic sort', async () => {
        // 分页第一页：含 archived / disabled / fork / 无默认分支（应全部剔除）+ 2 个有效
        nock(API_BASE)
            .get('/users/foo')
            .reply(200, { login: 'foo', type: 'User' })
        nock(API_BASE)
            .get('/users/foo/repos')
            .query({ per_page: '100', type: 'all' })
            .reply(200, [
                makeRepo({ full_name: 'foo/zeta', default_branch: 'main' }),
                makeRepo({ full_name: 'foo/archived', archived: true }),
                makeRepo({ full_name: 'foo/disabled', disabled: true }),
                makeRepo({ full_name: 'foo/forked', fork: true }),
                makeRepo({ full_name: 'foo/no-default', default_branch: '' }),
            ], {
                link: `<${API_BASE}/users/foo/repos?per_page=100&type=all&page=2>; rel="next"`,
            })
        // 第二页：alpha（分页测试；乱序验证排序）
        nock(API_BASE)
            .get('/users/foo/repos')
            .query({ per_page: '100', type: 'all', page: '2' })
            .reply(200, [
                makeRepo({ full_name: 'foo/alpha', default_branch: 'master' }),
            ])
        // dependabot.yml 探测（全部候选仓库）
        for (const repo of ['foo/zeta', 'foo/alpha']) {
            nock(API_BASE)
                .get(new RegExp(`/repos/${repo}/contents/`))
                .reply(200, { type: 'file' })
        }

        const repos = await discoverRepositories({ client: setupClient(), owners: ['foo'] })

        expect(repos.map((r) => r.fullName)).toEqual(['foo/alpha', 'foo/zeta'])
        expect(repos[0].defaultBranch).toBe('master')
        expect(repos[1].defaultBranch).toBe('main')
        expect(repos.every((r) => r.hasDependabotConfig)).toBe(true)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('discovers org-owned repos via listForOrg endpoint', async () => {
        nock(API_BASE)
            .get('/users/myorg')
            .reply(200, { login: 'myorg', type: 'Organization' })
        nock(API_BASE)
            .get('/orgs/myorg/repos')
            .query({ per_page: '100', type: 'all' })
            .reply(200, [
                makeRepo({ full_name: 'myorg/app', topics: ['node', 'pnpm'] }),
            ])
        nock(API_BASE)
            .get(new RegExp('/repos/myorg/app/contents/'))
            .reply(404, { message: 'Not Found' })

        const repos = await discoverRepositories({ client: setupClient(), owners: ['myorg'] })

        expect(repos).toHaveLength(1)
        expect(repos[0].fullName).toBe('myorg/app')
        // 404 视为不支持，不剔除仓库
        expect(repos[0].hasDependabotConfig).toBe(false)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('filters by topics with AND semantics', async () => {
        nock(API_BASE)
            .get('/users/foo')
            .reply(200, { login: 'foo', type: 'User' })
        nock(API_BASE)
            .get('/users/foo/repos')
            .query(true)
            .reply(200, [
                makeRepo({ full_name: 'foo/node-only', topics: ['node'] }),
                makeRepo({ full_name: 'foo/both', topics: ['node', 'pnpm'] }),
                makeRepo({ full_name: 'foo/none' }),
            ])
        // 仅 both 通过 topic 过滤 → 仅探测 both
        nock(API_BASE)
            .get(new RegExp('/repos/foo/both/contents/'))
            .reply(200, { type: 'file' })

        const repos = await discoverRepositories({
            client: setupClient(),
            owners: ['foo'],
            topics: ['node', 'pnpm'],
        })

        expect(repos.map((r) => r.fullName)).toEqual(['foo/both'])
        // 请求数量受控：仅候选仓库触达 contents API
        expect(nock.pendingMocks()).toEqual([])
    })

    it('does not probe dependabot config when probeDependabot is false', async () => {
        nock(API_BASE)
            .get('/users/foo')
            .reply(200, { login: 'foo', type: 'User' })
        nock(API_BASE)
            .get('/users/foo/repos')
            .query(true)
            .reply(200, [makeRepo({ full_name: 'foo/bar' })])

        const repos = await discoverRepositories({
            client: setupClient(),
            owners: ['foo'],
            probeDependabot: false,
        })

        expect(repos).toHaveLength(1)
        expect(repos[0].hasDependabotConfig).toBe(false)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('merges multiple owners with deterministic sort', async () => {
        nock(API_BASE)
            .get('/users/a')
            .reply(200, { login: 'a', type: 'User' })
        nock(API_BASE)
            .get('/users/a/repos')
            .query(true)
            .reply(200, [makeRepo({ full_name: 'a/repo-a' })])
        nock(API_BASE)
            .get('/users/b')
            .reply(200, { login: 'b', type: 'User' })
        nock(API_BASE)
            .get('/users/b/repos')
            .query(true)
            .reply(200, [makeRepo({ full_name: 'b/repo-b' })])
        for (const repo of ['a/repo-a', 'b/repo-b']) {
            nock(API_BASE)
                .get(new RegExp(`/repos/${repo}/contents/`))
                .reply(200, { type: 'file' })
        }

        const repos = await discoverRepositories({ client: setupClient(), owners: ['b', 'a'] })

        expect(repos.map((r) => r.fullName)).toEqual(['a/repo-a', 'b/repo-b'])
        expect(nock.pendingMocks()).toEqual([])
    })

    it('throws AppError when owner does not exist', async () => {
        nock(API_BASE)
            .get('/users/nobody')
            .reply(404, { message: 'Not Found' })

        try {
            await discoverRepositories({ client: setupClient(), owners: ['nobody'] })
            expect.fail('Expected discoverRepositories to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('REPO_NOT_FOUND')
            expect((error as AppError).message).toContain('nobody')
        }
    })

    it('throws AppError on non-404 contents probe errors (fail-fast)', async () => {
        nock(API_BASE)
            .get('/users/foo')
            .reply(200, { login: 'foo', type: 'User' })
        nock(API_BASE)
            .get('/users/foo/repos')
            .query(true)
            .reply(200, [makeRepo({ full_name: 'foo/bar' })])
        nock(API_BASE)
            .get(new RegExp('/repos/foo/bar/contents/'))
            .reply(403, { message: 'Resource not accessible by integration' })

        try {
            await discoverRepositories({ client: setupClient(), owners: ['foo'] })
            expect.fail('Expected discoverRepositories to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('PERMISSION_DENIED')
        }
    })

    it('applies include/exclude/topics-exclude policy before probing (excluded repos never hit contents API)', async () => {
        nock(API_BASE)
            .get('/users/org')
            .reply(200, { login: 'org', type: 'User' })
        nock(API_BASE)
            .get('/users/org/repos')
            .query(true)
            .reply(200, [
                makeRepo({ full_name: 'org/app', topics: ['node'] }),
                makeRepo({ full_name: 'org/legacy-1', topics: ['node'] }),
                makeRepo({ full_name: 'org/deprecated-app', topics: ['node', 'deprecated'] }),
                makeRepo({ full_name: 'other/app', topics: ['node'] }),
            ])
        // 仅 org/app 通过策略进入探测；其余仓库若触达 contents API 会因无 mock 而失败
        nock(API_BASE)
            .get(new RegExp('/repos/org/app/contents/'))
            .reply(200, { type: 'file' })

        const repos = await discoverRepositories({
            client: setupClient(),
            owners: ['org'],
            policy: {
                include: ['org/*'],
                exclude: ['org/legacy-*'],
                topicsExclude: ['deprecated'],
            },
        })

        expect(repos.map((r) => r.fullName)).toEqual(['org/app'])
        expect(nock.pendingMocks()).toEqual([])
    })

    it('include + exclude conflict: exclude wins during discovery', async () => {
        nock(API_BASE)
            .get('/users/org')
            .reply(200, { login: 'org', type: 'User' })
        nock(API_BASE)
            .get('/users/org/repos')
            .query(true)
            .reply(200, [
                makeRepo({ full_name: 'org/legacy-1', topics: [] }),
            ])
        // 若被错误保留会触发 contents 探测 → 无 mock 失败；此处不 mock 探测

        const repos = await discoverRepositories({
            client: setupClient(),
            owners: ['org'],
            policy: {
                include: ['org/legacy-1'],
                exclude: ['org/legacy-*'],
            },
        })

        expect(repos).toEqual([])
    })
})

describe('mergeRepositories', () => {
    it('keeps explicit order first and appends only missing discovered repos', () => {
        const merged = mergeRepositories(['a/z', 'a/a'], ['a/a', 'a/b', 'a/c'])
        expect(merged).toEqual(['a/z', 'a/a', 'a/b', 'a/c'])
    })

    it('returns explicit list unchanged when discovery is empty', () => {
        expect(mergeRepositories(['a/a'], [])).toEqual(['a/a'])
    })

    it('returns discovered list when explicit is empty', () => {
        expect(mergeRepositories([], ['a/b', 'a/a'])).toEqual(['a/b', 'a/a'])
    })
})
