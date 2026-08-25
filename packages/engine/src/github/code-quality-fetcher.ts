import type { Octokit } from '@octokit/rest'
import type { AlertSeverity, NormalizedSecurityAlert } from '@dependfix/core'
import { mapGitHubError } from './errors'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** cursor 分页最大页数保护（恶意 Link header 重复同 cursor 或 API 异常时终止循环） */
const MAX_CURSOR_PAGES = 1000

// ---------------------------------------------------------------------------
// Code Quality Findings 数据源接入
//
// 接入 GitHub REST API `GET /repos/{owner}/{repo}/code-quality/findings`：
// https://docs.github.com/en/rest/code-quality/code-quality
//
// 复用 `NormalizedSecurityAlert` 模型（source='code-quality'）+ A/B/C 规则分层。
// 首版仅 `report-only`（C 类默认），不实现模板化修复：
// - rule.category=maintainability/reliability 的告警**不可自动修复**
//   （与 code-scanning 同：CodeQL 类语义改写需词法/语法解析，超出 C 类兜底范围）
// - 报告 §Code Quality Findings 段单独展示 + 通用建议（rule.description）
//
// Octokit 22 / plugin-rest-endpoint-methods 17 的类型表当前**未含**
// `code-quality/findings` 端点（Octokit 类型更新滞后于新 API），使用
// `client.request('GET ...', ...)` 走 raw 端点；响应类型本地声明。
// ---------------------------------------------------------------------------

export interface FetchCodeQualityFindingsParams {
    /** 仓库所属组织或用户 */
    owner: string
    /** 仓库名称 */
    repo: string
    /**
     * 告警状态过滤。
     * 默认 `open`；GitHub 合法值 `open` / `resolved` / `dismissed`。
     */
    state?: 'open' | 'resolved' | 'dismissed'
    /** 每页数量，默认 100（GitHub API 最大值） */
    perPage?: number
}

/**
 * GitHub `code-quality/findings` 响应的单条原始类型。
 * 本地声明：Octokit 类型表暂未含该端点（端点 2026 年新增预览）。
 * 字段基于 docs/standards/platform.md §7.1「类型 vs 运行时契约核验」同步核对
 * （GitHub Docs 2026-03-10 抓取）：number/state/url/rule/location/message/created_at。
 * 字段类型用宽松构造（octokit 实际响应可能含未文档化字段，但核心字段必须存在）。
 */
interface CodeQualityFindingRaw {
    number: number
    state: 'open' | 'resolved' | 'dismissed'
    url: string
    rule: {
        id: string
        title?: string
        description?: string
        severity?: 'error' | 'warning' | 'note'
        category?: 'maintainability' | 'reliability' | 'security' | 'performance' | string
    }
    location: {
        path: string
        start_line?: number
        start_column?: number
        end_line?: number
        end_column?: number
    }
    message?: {
        text?: string
        markdown?: string
    }
    created_at?: string
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 拉取指定仓库的 Code Quality findings 并映射为标准化模型。
 *
 * - 自动分页（cursor-based：before/after 走 `Link` header，与 GitHub 通用分页一致）
 * - 仅处理 `state=open` 的 finding（可通过 `params.state` 覆盖）
 * - severity：`rule.severity`（error/warning/note）经 `mapCodeQualitySeverity` 映射
 * - Code Quality findings **不可自动修复**（`fixable: false`、`fixStrategy: null`），
 *   首版统一归 C 类（`alertClass: 'report-only'`），不实现模板化修复
 * - 异常通过 `mapGitHubError` 转为 `AppError`
 * - 空仓库返回 `[]`，不抛异常
 *
 * @param client - 已认证的 Octokit 实例（来自 `createGitHubClient`）
 * @param params - 仓库标识与过滤参数
 * @returns 标准化告警列表
 */
export async function fetchCodeQualityFindings(
    client: Octokit,
    params: FetchCodeQualityFindingsParams,
): Promise<NormalizedSecurityAlert[]> {
    const { owner, repo, state = 'open', perPage = 100 } = params

    try {
        // cursor 分页：before / after 走 Link header（next/prev）；octokit.paginate
        // 不直接支持 cursor 接口，改为手工 while 循环（GitHub Code Quality API
        // 设计 = cursor-based，与 listAlertsForRepo 的 page-based 不同）。
        //
        // 防御性终止：(1) Link header 无 rel="next" → 自然终止；(2) cursor 与上一轮
        // 相同（API 异常或恶意 Link header）→ 中止循环；(3) 页数超过 MAX_CURSOR_PAGES →
        // 中止循环（避免异常无限循环消耗 API 配额）。
        const findings: CodeQualityFindingRaw[] = []
        let cursor: string | undefined
        let pages = 0
        const seenCursors = new Set<string>()

        for (;;) {
            pages += 1
            if (pages > MAX_CURSOR_PAGES) {
                // 异常长分页（>1000 页 = >100000 findings），截断防失控；
                // 真实仓库 finding 数远低于此阈值，正常情况不会触发
                break
            }
            if (cursor && seenCursors.has(cursor)) {
                // cursor 重复（API 异常 / Link header 异常）：避免无限循环
                break
            }
            if (cursor) {
                seenCursors.add(cursor)
            }

            // 响应类型取 Octokit 真实返回（headers: ResponseHeaders 含 string | number | undefined）；
            // parseNextCursor 仅依赖 headers.link（string | undefined）字段，安全兼容
            const response = await client.request(
                'GET /repos/{owner}/{repo}/code-quality/findings',
                {
                    owner,
                    repo,
                    state,
                    per_page: perPage,
                    ...(cursor ? { after: cursor } : {}),
                },
            ) as { data: CodeQualityFindingRaw[], headers: { link?: string } }
            findings.push(...response.data)
            cursor = parseNextCursor(response.headers.link)
            if (!cursor) {
                break
            }
        }

        return findings.map((f) => normalizeFinding(f, owner, repo))
    } catch (error: unknown) {
        const context = `fetch code quality findings for ${owner}/${repo}`
        throw mapGitHubError(error, context)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 将单条 Code Quality finding 转换为标准化模型。
 *
 * 映射逻辑：
 * - severity：`rule.severity`（error/warning/note）经 `mapCodeQualitySeverity` 映射；
 *   缺失 → `'unknown'`（不静默丢弃）
 * - packageName 取规则人类可读名（`rule.title`，如 "Useless null check"），
 *   报告 Package 列对 code-quality 展示规则名
 * - ruleId 取 `rule.id`（如 `java/useless-null-check`），报告 Rule/Advisory 列展示
 * - manifestPath 取告警文件路径（`location.path`）
 * - htmlUrl：将 API URL（`https://api.github.com/...`）转换为 web URL
 *   （`https://github.com/owner/repo/code-quality/findings/N`）
 * - fixable 恒为 `false`（Code Quality findings 不可自动修复）
 * - alertClass 恒为 `'report-only'`（C 类默认，未列入 A/B）
 */
function normalizeFinding(
    finding: CodeQualityFindingRaw,
    owner: string,
    repo: string,
): NormalizedSecurityAlert {
    const ruleId = finding.rule?.id ?? ''
    const severity = mapCodeQualitySeverity(finding.rule?.severity)
    const description = finding.rule?.description ?? ''

    return {
        id: finding.number,
        source: 'code-quality',
        repository: `${owner}/${repo}`,
        defaultBranch: '', // 由上层调用 octokit.rest.repos.get 后填入
        severity,
        packageEcosystem: 'code-quality',
        packageName: finding.rule?.title ?? (ruleId || 'unknown'),
        manifestPath: finding.location?.path ?? '',
        ruleId,
        summary: finding.message?.text ?? description,
        htmlUrl: toWebUrl(finding.url, owner, repo, finding.number),
        fixable: false,
        fixStrategy: null,
        recommendedVersion: '',
        alertClass: 'report-only',
        startLine: finding.location?.start_line ?? undefined,
        endLine: finding.location?.end_line ?? undefined,
        // 用 rule.description 作为 Code Quality 报告建议（fetcher 注入；
        // 报告 collectCodeQualityFindings 直接使用 alert.suggestion）
        suggestion: description || '人工审查该 Code Quality finding',
    }
}

/**
 * 映射 Code Quality severity：
 * - `error` → `high`（语义对齐 code-scanning 映射：error 表示需立即关注）
 * - `warning` → `medium`
 * - `note` → `low`
 * - 缺失或非法值 → `'unknown'`（不静默丢弃）
 *
 * 与 code-scanning 共用 `error/warning/note` 值域（GitHub CodeQL 规则同源），
 * 映射口径与 `mapCodeScanningSeverity` 对齐（避免新源不一致）。
 */
export function mapCodeQualitySeverity(
    severity: string | null | undefined,
): AlertSeverity {
    switch (severity) {
        case 'error':
            return 'high'
        case 'warning':
            return 'medium'
        case 'note':
            return 'low'
        default:
            return 'unknown'
    }
}

/**
 * 将 GitHub API URL（`https://api.github.com/repos/{owner}/{repo}/code-quality/findings/{n}`）
 * 转换为 web URL（`https://github.com/{owner}/{repo}/code-quality/findings/{n}`）。
 *
 * GitHub web URL 形态固定（不含 `/repos/` 段），直接基于 owner/repo/number 构造
 * 比正则替换更稳健（避免 API 路径形态变化导致错误）。
 */
function toWebUrl(apiUrl: string, owner: string, repo: string, number: number): string {
    // 直接构造 web URL（apiUrl 仅作为 fallback 提示存在参数非预期时）
    return `https://github.com/${owner}/${repo}/code-quality/findings/${number}`
}

/**
 * 解析 GitHub Link header 提取 `rel="next"` 的 cursor（after=...）。
 * 返回 cursor 字符串；无 next → 返回 undefined（终止分页）。
 *
 * GitHub Code Quality API 用 cursor-based 分页（before/after）而非 page-based，
 * 与 listAlertsForRepo 的 page=1&page=2 不同；Link header 格式相同。
 */
function parseNextCursor(linkHeader: string | undefined): string | undefined {
    if (!linkHeader) {
        return undefined
    }
    // 匹配 `<url>; rel="next"` 形式，提取 url 中的 after/cursor 查询参数
    const nextMatch = /<([^>]+)>;\s*rel="next"/.exec(linkHeader)
    if (!nextMatch) {
        return undefined
    }
    const nextUrl = nextMatch[1]
    // URL 形如 `https://api.github.com/.../findings?after=cursor&per_page=100`
    // 解码后提取 after 参数值
    try {
        const url = new URL(nextUrl)
        return url.searchParams.get('after') ?? undefined
    } catch {
        return undefined
    }
}
