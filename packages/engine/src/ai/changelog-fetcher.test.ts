import { describe, expect, it, vi } from 'vitest'
import type { Octokit } from '@octokit/rest'
import {
    createChangelogFetcher,
    extractBreakingChanges,
    parseRepositorySlug,
    type ChangelogFetchResult,
} from './changelog-fetcher'

// ---------------------------------------------------------------------------
// Changelog / Release Notes 采集
// - extractBreakingChanges：breaking 段落启发式解析矩阵
// - parseRepositorySlug：packument repository 字段变体
// - fetchChangelog：registry + GitHub Releases 双源 + run 内缓存 + 降级
// ---------------------------------------------------------------------------

function mockOctokit(listReleases: ReturnType<typeof vi.fn>): Octokit {
    return { rest: { repos: { listReleases } } } as unknown as Octokit
}

function okResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// ---------------------------------------------------------------------------
// extractBreakingChanges
// ---------------------------------------------------------------------------

describe('extractBreakingChanges', () => {
    it('extracts list items under a "Breaking Changes" heading', () => {
        const md = [
            '## What Changed',
            '',
            '- Feature A',
            '',
            '## Breaking Changes',
            '',
            '- Removed `foo()` API',
            '- Changed default of `bar`',
            '',
            '## Fixes',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual([
            'Removed `foo()` API',
            'Changed default of `bar`',
        ])
    })

    it('supports heading level variants and lowercase', () => {
        const md = [
            '### Breaking changes',
            '',
            '- Dropped Node 18 support',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual(['Dropped Node 18 support'])
    })

    it('supports Migration guide sections', () => {
        const md = [
            '## Migration Guide',
            '',
            '- Use `createClient()` instead of `new Client()`',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual([
            'Use `createClient()` instead of `new Client()`',
        ])
    })

    it('supports emoji markers (⚠️ / 🚨)', () => {
        const md = [
            '## ⚠️ Breaking Changes',
            '',
            '- `vite.config` fields renamed',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual(['`vite.config` fields renamed'])
    })

    it('supports numbered list items and indented bullets', () => {
        const md = [
            '## Breaking Changes',
            '',
            '1. First item',
            '  - nested item',
            '2. Second item',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual(['First item', 'nested item', 'Second item'])
    })

    it('returns empty array when no breaking section exists', () => {
        const md = [
            '## Features',
            '',
            '- New API',
            '',
            '## Fixes',
            '',
            '- Bug fix',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual([])
    })

    it('does not match migration as substring of unrelated words', () => {
        const md = [
            '## Immigration changes',
            '',
            '- Should NOT be collected',
            '',
            '## Emigration policy',
            '',
            '- Also NOT collected',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual([])
    })

    it('stops collecting at the next heading', () => {
        const md = [
            '## Breaking Changes',
            '',
            '- Item in breaking section',
            '',
            '## Features',
            '',
            '- Item in features section (should NOT be collected)',
            '',
        ].join('\n')

        expect(extractBreakingChanges(md)).toEqual(['Item in breaking section'])
    })

    it('returns empty array for empty or non-list content', () => {
        expect(extractBreakingChanges('')).toEqual([])
        expect(extractBreakingChanges('## Breaking Changes\n\nSome prose without a list.\n')).toEqual([])
    })

    it('handles CRLF line endings', () => {
        const md = '## Breaking Changes\r\n\r\n- CRLF item\r\n'

        expect(extractBreakingChanges(md)).toEqual(['CRLF item'])
    })
})

// ---------------------------------------------------------------------------
// parseRepositorySlug
// ---------------------------------------------------------------------------

describe('parseRepositorySlug', () => {
    it('parses https URL with .git suffix', () => {
        expect(parseRepositorySlug('https://github.com/vitejs/vite.git')).toEqual({ owner: 'vitejs', repo: 'vite' })
    })

    it('parses git+https URL', () => {
        expect(parseRepositorySlug('git+https://github.com/expressjs/express')).toEqual({ owner: 'expressjs', repo: 'express' })
    })

    it('parses git@ SSH form', () => {
        expect(parseRepositorySlug('git@github.com:lodash/lodash.git')).toEqual({ owner: 'lodash', repo: 'lodash' })
    })

    it('parses full SSH and git:// URL forms', () => {
        expect(parseRepositorySlug('git+ssh://git@github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
        expect(parseRepositorySlug('ssh://git@github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
        expect(parseRepositorySlug('git://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('rejects non-GitHub protocol shorthands', () => {
        expect(parseRepositorySlug('gitlab:owner/repo')).toBeNull()
        expect(parseRepositorySlug('bitbucket:owner/repo')).toBeNull()
    })

    it('parses github: shorthand', () => {
        expect(parseRepositorySlug('github:owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('parses bare owner/repo', () => {
        expect(parseRepositorySlug('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('parses repository object form ({ type, url })', () => {
        expect(parseRepositorySlug({ type: 'git', url: 'https://github.com/owner/repo.git' }))
            .toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('parses www.github.com and scoped path depth', () => {
        expect(parseRepositorySlug('https://www.github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' })
        expect(parseRepositorySlug('https://github.com/owner/repo/tree/main')).toEqual({ owner: 'owner', repo: 'repo' })
    })

    it('returns null for non-GitHub hosts', () => {
        expect(parseRepositorySlug('https://gitlab.com/owner/repo')).toBeNull()
        expect(parseRepositorySlug('https://bitbucket.org/owner/repo')).toBeNull()
    })

    it('returns null for missing or malformed repository metadata', () => {
        expect(parseRepositorySlug(null)).toBeNull()
        expect(parseRepositorySlug(undefined)).toBeNull()
        expect(parseRepositorySlug('')).toBeNull()
        expect(parseRepositorySlug({})).toBeNull()
        expect(parseRepositorySlug({ type: 'git' })).toBeNull()
    })
})

// ---------------------------------------------------------------------------
// fetchChangelog（createChangelogFetcher）
// ---------------------------------------------------------------------------

describe('fetchChangelog', () => {
    it('fetches registry metadata then GitHub releases and extracts breaking changes', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({
            name: 'vite',
            repository: { type: 'git', url: 'https://github.com/vitejs/vite.git' },
        }))
        const listReleases = vi.fn().mockResolvedValue({
            data: [
                {
                    tag_name: 'v6.4.3',
                    html_url: 'https://github.com/vitejs/vite/releases/tag/v6.4.3',
                    body: '## Breaking Changes\n\n- Requires Node 20+\n\n## Features\n\n- Faster HMR',
                },
                {
                    tag_name: 'v6.4.2',
                    html_url: 'https://github.com/vitejs/vite/releases/tag/v6.4.2',
                    body: '## Fixes\n\n- Bug fix',
                },
            ],
        })
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        const result = await fetcher.fetchChangelog('vite')

        expect(result.error).toBeUndefined()
        expect(result.entries).toHaveLength(2)
        expect(result.entries[0]).toMatchObject({
            version: 'v6.4.3',
            htmlUrl: 'https://github.com/vitejs/vite/releases/tag/v6.4.3',
        })
        expect(result.entries[0].breakingChanges).toEqual(['Requires Node 20+'])
        expect(result.entries[1].breakingChanges).toEqual([])
        // registry 请求 URL 编码正确
        expect(fetchFn).toHaveBeenCalledWith(
            'https://registry.npmjs.org/vite',
            expect.objectContaining({ headers: expect.any(Object) }),
        )
        expect(listReleases).toHaveBeenCalledWith(expect.objectContaining({ owner: 'vitejs', repo: 'vite' }))
    })

    it('caches per package within a run (single registry + releases request)', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({
            repository: 'https://github.com/owner/repo',
        }))
        const listReleases = vi.fn().mockResolvedValue({
            data: [{ tag_name: 'v1.0.0', html_url: '', body: '## Breaking Changes\n\n- X' }],
        })
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        const first = await fetcher.fetchChangelog('lodash')
        const second = await fetcher.fetchChangelog('lodash')

        expect(first).toBe(second)
        expect(fetchFn).toHaveBeenCalledTimes(1)
        expect(listReleases).toHaveBeenCalledTimes(1)
    })

    it('encodes scoped package names in the registry URL', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({ repository: 'owner/repo' }))
        const listReleases = vi.fn().mockResolvedValue({ data: [] })
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        await fetcher.fetchChangelog('@babel/traverse')

        expect(fetchFn).toHaveBeenCalledWith(
            'https://registry.npmjs.org/%40babel%2Ftraverse',
            expect.anything(),
        )
    })

    it('returns error when package not found in registry (404)', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('Not Found', { status: 404 }))
        const listReleases = vi.fn()
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        const result = await fetcher.fetchChangelog('not-real-pkg-xyz')

        expect(result.entries).toEqual([])
        expect(result.error).toContain('not found in npm registry')
        expect(listReleases).not.toHaveBeenCalled()
    })

    it('returns error when registry request fails (network)', async () => {
        const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
        const fetcher = createChangelogFetcher(mockOctokit(vi.fn()), { fetchFn })

        const result = await fetcher.fetchChangelog('vite')

        expect(result.error).toContain('failed to fetch npm registry')
        expect(result.error).toContain('ECONNREFUSED')
    })

    it('passes an abort signal for registry request timeout', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({ repository: 'owner/repo' }))
        const listReleases = vi.fn().mockResolvedValue({ data: [] })
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        await fetcher.fetchChangelog('vite')

        const [, init] = fetchFn.mock.calls[0] as [string, RequestInit]
        expect(init.signal).toBeDefined()
    })

    it('returns error when registry returns non-JSON body', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 200 }))
        const fetcher = createChangelogFetcher(mockOctokit(vi.fn()), { fetchFn })

        const result = await fetcher.fetchChangelog('vite')

        expect(result.error).toContain('failed to fetch npm registry')
    })

    it('returns error when registry status is not ok', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('Server Error', { status: 503 }))
        const fetcher = createChangelogFetcher(mockOctokit(vi.fn()), { fetchFn })

        const result = await fetcher.fetchChangelog('vite')

        expect(result.error).toContain('HTTP 503')
    })

    it('returns error when package has no GitHub repository metadata', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({ name: 'pkg', repository: null }))
        const listReleases = vi.fn()
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        const result = await fetcher.fetchChangelog('pkg')

        expect(result.error).toContain('no GitHub repository metadata')
        expect(listReleases).not.toHaveBeenCalled()
    })

    it('returns error when GitHub releases fetch fails', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({ repository: 'https://github.com/owner/repo' }))
        const listReleases = vi.fn().mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }))
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        const result = await fetcher.fetchChangelog('vite')

        expect(result.error).toBeDefined()
        expect(result.error).toContain('owner/repo')
    })

    it('returns empty entries (no error) when releases exist but have no body', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({ repository: 'owner/repo' }))
        const listReleases = vi.fn().mockResolvedValue({
            data: [
                { tag_name: 'v1.0.0', html_url: '', body: null },
                { tag_name: 'v1.0.1', html_url: '', body: '' },
            ],
        })
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), { fetchFn })

        const result: ChangelogFetchResult = await fetcher.fetchChangelog('vite')

        expect(result.error).toBeUndefined()
        expect(result.entries).toEqual([])
    })

    it('supports custom registry base url (self-hosted registry)', async () => {
        const fetchFn = vi.fn().mockResolvedValue(okResponse({ repository: 'owner/repo' }))
        const listReleases = vi.fn().mockResolvedValue({ data: [] })
        const fetcher = createChangelogFetcher(mockOctokit(listReleases), {
            fetchFn,
            registryBaseUrl: 'https://registry.example.com',
        })

        await fetcher.fetchChangelog('vite')

        expect(fetchFn).toHaveBeenCalledWith('https://registry.example.com/vite', expect.anything())
    })
})
