import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import { mapGitHubError } from '@dependfix/engine'

// ---------------------------------------------------------------------------
// Changelog / Release Notes 采集（AI 研判链路入口）
//
// 数据流：npm registry packument（解析 repository）→ GitHub Releases
// （octokit repos.listReleases）→ 提取 breaking changes 段落。
// run 内缓存：同包多告警不重复请求。
// 失败降级：源不可达 / 包不在 registry / 无 GitHub repository →
// 返回 error 原因，上层跳过 AI 研判（不静默）。
// ---------------------------------------------------------------------------

export interface ChangelogEntry {
    /** release 版本号（tag_name 原样保留，可能为 `v1.2.3` 形态） */
    version: string
    /** release body（markdown 原文） */
    body: string
    /** 从 body 提取的 breaking changes 条目（启发式段落匹配） */
    breakingChanges: string[]
    /** release 页面地址 */
    htmlUrl: string
}

export interface ChangelogFetchResult {
    /** 成功时为 release 条目列表；无 release body 时为空数组（非错误） */
    entries: ChangelogEntry[]
    /** 失败原因；`null` = 成功（含"无 changelog"） */
    error?: string
}

export interface ChangelogFetcherOptions {
    /**
     * npm registry 基地址（默认 `https://registry.npmjs.org`）。
     * 测试时注入 mock 端点。
     */
    registryBaseUrl?: string
    /** GitHub Releases 每页数量（默认 30，取最新一批即可覆盖 breaking 判定窗口） */
    releasesPerPage?: number
    /**
     * registry 请求函数（默认全局 fetch）。
     * 注入便于测试（nock 对 undici fetch 的支持依赖版本，注入 vi.fn 最稳）。
     */
    fetchFn?: typeof fetch
    /**
     * registry 请求超时毫秒（默认 10000）。
     * 防止自定义/黑洞 registry 挂起整个批量 run。
     */
    fetchTimeoutMs?: number
}

export interface ChangelogFetcher {
    /**
     * 获取包 changelog（run 内缓存：同包只请求一次 registry + releases）。
     *
     * @param packageName 包名（如 `vite`、`@babel/traverse`）
     * @returns 结果；`error` 非空时调用方应跳过 AI 研判
     */
    fetchChangelog(packageName: string): Promise<ChangelogFetchResult>
}

type ReleaseItem = RestEndpointMethodTypes['repos']['listReleases']['response']['data'][number]

/** breaking 段落标题启发式（标题行命中任一关键词即进入收集模式；词边界防子串误匹配） */
const BREAKING_HEADING_RE = /\bbreaking\s*changes?\b|\bbreaking-changes\b|\bmigration\b|⚠️|🚨/i

/** 收集模式的列表项行（`- ` / `* ` / `+ ` / `1. `，允许缩进） */
const LIST_ITEM_RE = /^\s*(?:[-*+]|\d+\.)\s+/

/** 标题行（任意层级） */
const HEADING_RE = /^#{1,6}\s+/

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function createChangelogFetcher(
    client: Octokit,
    options: ChangelogFetcherOptions = {},
): ChangelogFetcher {
    const registryBaseUrl = options.registryBaseUrl ?? 'https://registry.npmjs.org'
    const releasesPerPage = options.releasesPerPage ?? 30
    const fetchTimeoutMs = options.fetchTimeoutMs ?? 10_000
    const fetchFn = options.fetchFn ?? ((...args: Parameters<typeof fetch>) => fetch(...args))
    const cache = new Map<string, ChangelogFetchResult>()

    return {
        async fetchChangelog(packageName: string): Promise<ChangelogFetchResult> {
            const cached = cache.get(packageName)
            if (cached) {
                return cached
            }
            const result = await fetchChangelogUncached(client, {
                packageName,
                registryBaseUrl,
                releasesPerPage,
                fetchFn,
                fetchTimeoutMs,
            })
            cache.set(packageName, result)
            return result
        },
    }
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

interface FetchChangelogDeps {
    packageName: string
    registryBaseUrl: string
    releasesPerPage: number
    fetchFn: typeof fetch
    fetchTimeoutMs: number
}

async function fetchChangelogUncached(
    client: Octokit,
    deps: FetchChangelogDeps,
): Promise<ChangelogFetchResult> {
    const { packageName, registryBaseUrl, releasesPerPage, fetchFn, fetchTimeoutMs } = deps

    // ---- 1. npm registry packument（解析 repository）----
    let packument: Record<string, unknown>
    try {
        const res = await fetchFn(`${registryBaseUrl}/${encodeURIComponent(packageName)}`, {
            headers: { accept: 'application/vnd.npm.install-v1+json' },
            signal: AbortSignal.timeout(fetchTimeoutMs),
        })
        if (res.status === 404) {
            return { entries: [], error: `package "${packageName}" not found in npm registry` }
        }
        if (!res.ok) {
            return { entries: [], error: `npm registry returned HTTP ${res.status} for "${packageName}"` }
        }
        packument = await res.json() as Record<string, unknown>
    } catch (error: unknown) {
        return { entries: [], error: `failed to fetch npm registry for "${packageName}": ${error instanceof Error ? error.message : String(error)}` }
    }

    // ---- 2. 解析 GitHub repository ----
    const repository = packument.repository
    const repoSlug = parseRepositorySlug(repository)
    if (!repoSlug) {
        return {
            entries: [],
            error: `package "${packageName}" has no GitHub repository metadata in npm registry (repository: ${describeRepository(repository)})`,
        }
    }

    // ---- 3. GitHub Releases（octokit）----
    let releases: ReleaseItem[]
    try {
        const { data } = await client.rest.repos.listReleases({
            owner: repoSlug.owner,
            repo: repoSlug.repo,
            per_page: releasesPerPage,
        })
        releases = data
    } catch (error: unknown) {
        const context = `fetch releases for ${repoSlug.owner}/${repoSlug.repo} (changelog source of "${packageName}")`
        return { entries: [], error: mapGitHubError(error, context).message }
    }

    // ---- 4. 构建条目 + 提取 breaking changes ----
    const entries: ChangelogEntry[] = []
    for (const release of releases) {
        const body = release.body?.trim()
        if (!body) {
            continue
        }
        entries.push({
            version: release.tag_name,
            body,
            breakingChanges: extractBreakingChanges(body),
            htmlUrl: release.html_url,
        })
    }

    return { entries }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RepoSlug {
    owner: string
    repo: string
}

/**
 * 从 npm packument 的 repository 字段解析 GitHub `owner/repo`。
 *
 * 支持形态：
 * - 对象：`{ type: 'git', url: 'https://github.com/owner/repo.git' }`
 * - 字符串 URL：`https://github.com/owner/repo`、`git+https://github.com/owner/repo.git`
 * - git 协议：`git@github.com:owner/repo.git`、`github:owner/repo`
 * - npm 简写：`owner/repo`（无协议）
 *
 * 非 GitHub 仓库（gitlab/bitbucket/自托管）返回 null——首版仅支持 GitHub Release 源。
 */
export function parseRepositorySlug(repository: unknown): RepoSlug | null {
    let raw: string | null = null
    if (typeof repository === 'string') {
        raw = repository
    } else if (repository && typeof repository === 'object' && typeof (repository as { url?: unknown }).url === 'string') {
        raw = (repository as { url: string }).url
    }
    if (!raw) {
        return null
    }
    const trimmed = raw.trim()
    if (!trimmed) {
        return null
    }

    // github.com 路径 / git@github.com:path / github:owner/repo
    // 兼容前缀：https://、http://、git+https://、git://、git+ssh://git@、
    // ssh://git@、git@、github:、裸路径；repo 后允许路径后缀
    // （/tree/main、/releases/... 等，以 / 或行尾结束）
    // 注意交替顺序：git+ssh://git@ 与 ssh://git@ 必须位于 ssh:// 之前
    const patterns: RegExp[] = [
        /^(?:git\+)?(?:git\+ssh:\/\/git@|ssh:\/\/git@|ssh:\/\/|git:\/\/|https?:\/\/|git@)?(?:www\.)?github\.com[:/]([^\s/]+)\/([^\s/]+?)(?:\.git)?(?:\/|$)/i,
        /^github:([^\s/]+)\/([^\s/]+?)(?:\.git)?$/i,
        // 裸 owner/repo（排除含 `:` 的协议简写如 gitlab:owner/repo——非 GitHub 源）
        /^([^\s/:]+)\/([^\s/]+?)$/,
    ]
    for (const pattern of patterns) {
        const match = pattern.exec(trimmed)
        if (match) {
            const owner = match[1]
            const repo = match[2].replace(/\.git$/, '')
            if (owner && repo && owner !== '.' && repo !== '.' && repo !== '..') {
                return { owner, repo }
            }
        }
    }
    return null
}

function describeRepository(repository: unknown): string {
    if (typeof repository === 'string') {
        return repository || '<empty>'
    }
    if (repository && typeof repository === 'object') {
        const url = (repository as { url?: unknown }).url
        return typeof url === 'string' && url ? url : '<object without url>'
    }
    return '<missing>'
}

/**
 * 从 markdown release body 提取 breaking changes 条目（段落启发式）。
 *
 * 匹配规则：进入 breaking 段落（标题含 breaking change / migration / ⚠️ / 🚨
 * 关键词，任意标题层级）后，收集后续列表项（`- ` / `* ` / `+ ` / `1. `），
 * 直到下一个标题或非列表内容。
 *
 * @returns 提取的条目列表（原样保留列表文本）；无匹配返回空数组
 */
export function extractBreakingChanges(markdown: string): string[] {
    const lines = markdown.split(/\r?\n/)
    const entries: string[] = []
    let inBreakingSection = false

    for (const line of lines) {
        if (HEADING_RE.test(line)) {
            // 新标题：进入 breaking 段落 or 退出收集
            inBreakingSection = BREAKING_HEADING_RE.test(line)
            continue
        }
        if (inBreakingSection && LIST_ITEM_RE.test(line)) {
            const item = line.trim().replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim()
            if (item) {
                entries.push(item)
            }
        }
    }

    return entries
}
