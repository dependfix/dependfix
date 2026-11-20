import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPlatformConfig, platformErrorToTool, platformGet, resolveBackend, PlatformHttpError } from './platform'
import { fetchAlerts } from './tools/fetch-alerts'
import { getHistory } from './tools/history'
import { getLastReport } from './tools/get-last-report'
import { discoverRepos } from './tools/discover-repos'
import { getRunLogs } from './tools/get-run-logs'
import { createMcpServer } from './index'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
})

const usePlatform = () => {
    process.env.DEPENDFIX_MCP_BACKEND = 'remote'
    process.env.DEPENDFIX_PLATFORM_URL = 'https://platform.test'
    process.env.DEPENDFIX_PLATFORM_API_KEY = 'dfk_test'
}

beforeEach(() => {
    usePlatform()
})

afterEach(() => {
    delete process.env.DEPENDFIX_MCP_BACKEND
    delete process.env.DEPENDFIX_PLATFORM_URL
    delete process.env.DEPENDFIX_PLATFORM_API_KEY
    delete process.env.GITHUB_TOKEN
    vi.unstubAllGlobals()
})

describe('backend selection', () => {
    it('defaults to remote only when url + key are both present', () => {
        expect(resolveBackend({})).toBe('local')
        expect(resolveBackend({ DEPENDFIX_PLATFORM_URL: 'https://x' })).toBe('local')
        expect(resolveBackend({ DEPENDFIX_PLATFORM_URL: 'https://x', DEPENDFIX_PLATFORM_API_KEY: 'k' })).toBe('remote')
        expect(resolveBackend({ DEPENDFIX_MCP_BACKEND: 'local', DEPENDFIX_PLATFORM_URL: 'https://x', DEPENDFIX_PLATFORM_API_KEY: 'k' })).toBe('local')
        expect(resolveBackend({ DEPENDFIX_MCP_BACKEND: 'remote' })).toBe('remote')
    })

    it('requires config for explicit remote', () => {
        expect(() => getPlatformConfig({ DEPENDFIX_MCP_BACKEND: 'remote' })).toThrow(/DEPENDFIX_PLATFORM_URL/)
    })
})

describe('platformGet errors', () => {
    it.each([
        [401, 'UNAUTHORIZED'],
        [403, 'FORBIDDEN'],
        [429, 'RATE_LIMITED'],
        [500, 'INTERNAL'],
    ])('maps HTTP %s to a clear error', async (status, code) => {
        const fetchImpl = vi.fn(async () => json({ data: { code }, message: 'x' }, status, { 'retry-after': '7' }))
        await expect(platformGet('/api/v1/repos', {}, { config: { url: 'https://p', apiKey: 'k' }, fetchImpl }))
            .rejects.toMatchObject({ status })
        const error = await platformGet('/api/v1/repos', {}, { config: { url: 'https://p', apiKey: 'k' }, fetchImpl }).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(PlatformHttpError)
        const mapped = platformErrorToTool(error) as { error: string }
        if (status === 401) {
            expect(mapped.error).toContain('key 无效')
        }
        if (status === 403) {
            expect(mapped.error).toContain('拒绝访问')
        }
        if (status === 429) {
            expect(mapped.error).toContain('7 秒后重试')
        }
        if (status === 500) {
            expect(mapped.error).toContain('服务异常')
        }
    })

    it('maps timeout errors with an explicit message', () => {
        const error = new Error('The operation was aborted due to timeout')
        error.name = 'TimeoutError'
        expect(platformErrorToTool(error)).toEqual({ ok: false, error: expect.stringContaining('平台请求超时') })
    })

    it('maps network failures and non-JSON bodies to clear platform errors', async () => {
        const network = await platformGet('/api/v1/repos', {}, {
            config: { url: 'https://p', apiKey: 'k' },
            fetchImpl: vi.fn(async () => { throw new TypeError('fetch failed') }),
        }).catch((error: unknown) => error)
        expect(platformErrorToTool(network)).toEqual({ ok: false, error: expect.stringContaining('平台不可达') })

        const nonJson = await platformGet('/api/v1/repos', {}, {
            config: { url: 'https://p', apiKey: 'k' },
            fetchImpl: vi.fn(async () => new Response('oops', { status: 200 })),
        }).catch((error: unknown) => error)
        expect(nonJson).toBeInstanceOf(PlatformHttpError)
        expect(platformErrorToTool(nonJson)).toEqual({ ok: false, error: expect.stringContaining('空响应') })
    })
})

describe('remote tools', () => {
    it('fetch_alerts resolves repo, fetches all alerts and filters by threshold/source', async () => {
        const fetchImpl = vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input))
            if (url.pathname === '/api/v1/repos') {
                return json({ items: [{ id: 'repo-1', owner: 'o', name: 'r', defaultBranch: 'main', tags: [] }], total: 1 })
            }
            if (url.pathname === '/api/v1/alerts') {
                return json({
                    items: [
                        { id: 'a1', source: 'dependabot', severity: 'critical', packageName: 'p', manifestPath: 'package.json', recommendedVersion: '1.0.1', fixable: true, htmlUrl: null, summary: 's' },
                        { id: 'a2', source: 'dependabot', severity: 'low', packageName: 'q', manifestPath: 'package.json', recommendedVersion: null, fixable: false, htmlUrl: null, summary: 's' },
                        { id: 'a3', source: 'code-scanning', severity: 'high', packageName: 'r', manifestPath: null, recommendedVersion: null, fixable: false, htmlUrl: null, summary: 's' },
                        { id: 'a4', source: 'pnpm-audit', severity: 'critical', packageName: 's', manifestPath: null, recommendedVersion: null, fixable: false, htmlUrl: null, summary: 's' },
                        { id: 'a5', source: 'code-scanning', severity: 'unknown', packageName: 't', manifestPath: null, recommendedVersion: null, fixable: false, htmlUrl: null, summary: 's' },
                    ],
                    total: 5,
                })
            }
            throw new Error(`unexpected ${url.pathname}`)
        })
        vi.stubGlobal('fetch', fetchImpl)

        const result = await fetchAlerts({ repo: 'o/r', severity: 'high', code_scanning: true })
        expect(result.ok).toBe(true)
        // critical + high + 静态分析 unknown（恒透传），排除 low / pnpm-audit
        expect(result.ok && result.count).toBe(3)
        expect(result.ok && result.alerts.map((alert) => alert.id)).toEqual(['a1', 'a3', 'a5'])

        const onlyDependabot = await fetchAlerts({ repo: 'o/r', severity: 'all' })
        expect(onlyDependabot.ok && onlyDependabot.count).toBe(2)
    })

    it('fetch_alerts paginates until total is reached and discloses truncation', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input))
            if (url.pathname === '/api/v1/repos') {
                return json({ items: [{ id: 'repo-1', owner: 'o', name: 'r', defaultBranch: 'main', tags: [] }], total: 1 })
            }
            const page = Number(url.searchParams.get('page'))
            const items = page === 1
                ? [{ id: 'a1', source: 'dependabot', severity: 'high', packageName: 'p', manifestPath: null, recommendedVersion: null, fixable: false, htmlUrl: null, summary: 's' }]
                : [{ id: 'a2', source: 'dependabot', severity: 'critical', packageName: 'q', manifestPath: null, recommendedVersion: null, fixable: false, htmlUrl: null, summary: 's' }]
            return json({ items, total: 2 })
        }))
        const result = await fetchAlerts({ repo: 'o/r', severity: 'all' }) as { ok: true, count: number, total: number, truncated: boolean }
        expect(result.count).toBe(2)
        expect(result.total).toBe(2)
        expect(result.truncated).toBe(false)
    })

    it('history maps platform runs and keeps the same shape', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input))
            if (url.pathname === '/api/v1/repos') {
                return json({ items: [{ id: 'repo-1', owner: 'o', name: 'r', defaultBranch: 'main', tags: [] }], total: 1 })
            }
            return json({
                items: [{ id: 'run-1', status: 'completed', startedAt: '2026-11-19T00:00:00Z', finishedAt: '2026-11-19T00:00:12Z', createdAt: '2026-11-19T00:00:00Z', summary: { alertsFound: 1 } }],
                total: 1,
            })
        }))
        const result = await getHistory({ repo: 'o/r' })
        expect(result.ok).toBe(true)
        expect(result.ok && result.runs[0]).toMatchObject({ runId: 'run-1', durationMs: 12000, repositories: ['o/r'] })
    })

    it('get_last_report returns the latest run with source=platform', async () => {
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input))
            if (url.pathname === '/api/v1/runs') {
                return json({ items: [{ id: 'run-9' }], total: 1 })
            }
            return json({ id: 'run-9', status: 'completed' })
        }))
        const result = await getLastReport()
        expect(result).toMatchObject({ ok: true, source: 'platform', file: 'platform://runs/run-9' })
    })

    it('discover_repos degrades to platform-managed repos with source marker', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({
            items: [{ id: 'r1', owner: 'o', name: 'r', defaultBranch: 'main', tags: [] }],
            total: 1,
        })))
        const result = await discoverRepos({ owner: ['o'] })
        expect(result).toMatchObject({
            ok: true,
            source: 'platform',
            count: 1,
            repositories: [{ fullName: 'o/r', defaultBranch: 'main', topics: [], hasDependabotConfig: false }],
        })
    })

    it('get_run_logs is remote-only and passes platform response through', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ view: 'grouped', groups: [], total: 0 })))
        const remote = await getRunLogs({ run_id: 'run-1' })
        expect(remote).toMatchObject({ ok: true, source: 'platform' })

        process.env.DEPENDFIX_MCP_BACKEND = 'local'
        const local = await getRunLogs({ run_id: 'run-1' })
        expect(local.ok).toBe(false)
        expect((local as { error: string }).error).toContain('本地后端')
    })

    it('get_run_logs maps 404 to a clear error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => json({ data: { code: 'RUN_LOGS_NOT_FOUND' }, message: 'no logs' }, 404)))
        const result = await getRunLogs({ run_id: 'missing' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('平台资源不存在')
    })

    it('explicit local keeps the local tool path even when platform env is present', async () => {
        process.env.DEPENDFIX_MCP_BACKEND = 'local'
        delete process.env.GITHUB_TOKEN
        const result = await fetchAlerts({ repo: 'o/r', severity: 'high' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('GITHUB_TOKEN')
    })

    it('registers 9 tools and marks remote tools', () => {
        const server = createMcpServer()
        const registered = (server as unknown as { _registeredTools: Record<string, { description?: string }> })._registeredTools
        expect(Object.keys(registered)).toHaveLength(9)
        expect(registered.get_run_logs).toBeTruthy()
        expect(registered.fetch_alerts?.description).toContain('[remote]')
    })
})
