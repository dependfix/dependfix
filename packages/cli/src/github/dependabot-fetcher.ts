import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import type { NormalizedSecurityAlert } from '@dependfix/core'
import { mapGitHubError } from './errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchDependabotAlertsParams {
    /** 仓库所属组织或用户 */
    owner: string
    /** 仓库名称 */
    repo: string
    /**
     * 告警状态过滤。
     * M1 只拉 `open`（默认）。
     */
    state?: 'open' | 'fixed' | 'dismissed' | 'auto_dismissed'
    /** 每页数量，默认 100（GitHub API 最大值） */
    perPage?: number
}

/**
 * Dependabot API 返回的单条原始告警类型。
 * 从 `@octokit/rest` 的 `RestEndpointMethodTypes` 推导，无需手写。
 */
type DependabotAlertItem =
    RestEndpointMethodTypes['dependabot']['listAlertsForRepo']['response']['data'][number]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 拉取指定仓库的 Dependabot 告警并映射为标准化模型。
 *
 * - 自动分页（`octokit.paginate()`），返回所有匹配的告警
 * - 仅处理 `state=open` 的告警（可通过 `params.state` 覆盖）
 * - 异常通过 `mapGitHubError` 转为 `AppError`
 * - 空仓库返回 `[]`，不抛异常
 *
 * @param client - 已认证的 Octokit 实例（来自 `createGitHubClient`）
 * @param params - 仓库标识与过滤参数
 * @returns 标准化告警列表
 *
 * @example
 * ```typescript
 * const octokit = createGitHubClient({ token: 'ghp_xxxx' })
 * const alerts = await fetchDependabotAlerts(octokit, { owner: 'foo', repo: 'bar' })
 * ```
 */
export async function fetchDependabotAlerts(
    client: Octokit,
    params: FetchDependabotAlertsParams,
): Promise<NormalizedSecurityAlert[]> {
    const { owner, repo, state = 'open', perPage = 100 } = params

    try {
        const rawAlerts = await client.paginate(
            client.rest.dependabot.listAlertsForRepo,
            { owner, repo, state, per_page: perPage },
        )
        return rawAlerts.map((alert) => normalizeAlert(alert, owner, repo))
    } catch (error: unknown) {
        const context = `fetch dependabot alerts for ${owner}/${repo}`
        throw mapGitHubError(error, context)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 将单条 Dependabot API 原始告警转换为标准化模型。
 *
 * 映射逻辑：
 * - severity 直接透传（Dependabot 的 `low|medium|high|critical` 与 `AlertSeverity` 对齐）
 * - fixable 判定：`security_vulnerability.first_patched_version !== null`
 * - fixStrategy：有修复版本 → `'upgrade'`，否则 `null`
 * - recommendedVersion 取自 `first_patched_version.identifier`
 * - 可选字段兜底：`packageName`/`packageEcosystem` → `'unknown'`，`manifestPath` → `''`
 * - `defaultBranch` 不在此层填充（由上层调用方获取后注入）
 */
function normalizeAlert(
    alert: DependabotAlertItem,
    owner: string,
    repo: string,
): NormalizedSecurityAlert {
    const firstPatched = alert.security_vulnerability.first_patched_version
    const fixable = firstPatched !== null

    return {
        id: alert.number,
        source: 'dependabot',
        repository: `${owner}/${repo}`,
        defaultBranch: '', // 由上层调用 octokit.rest.repos.get 后填入
        severity: alert.security_advisory.severity,
        packageEcosystem: alert.dependency.package?.ecosystem ?? 'unknown',
        packageName: alert.dependency.package?.name ?? 'unknown',
        manifestPath: alert.dependency.manifest_path ?? '',
        ruleId: alert.security_advisory.ghsa_id,
        summary: alert.security_advisory.summary,
        htmlUrl: alert.html_url,
        fixable,
        fixStrategy: fixable ? 'upgrade' : null,
        recommendedVersion: firstPatched?.identifier ?? '',
    }
}
