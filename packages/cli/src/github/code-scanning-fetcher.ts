import type { Octokit, RestEndpointMethodTypes } from '@octokit/rest'
import { mapCodeScanningSeverity, type NormalizedSecurityAlert, type AlertSeverity } from '@dependfix/core'
import { classifyRule, suggestionFor } from '../code-scanning/rule-classifier'
import { mapGitHubError } from './errors'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FetchCodeScanningAlertsParams {
    /** 仓库所属组织或用户 */
    owner: string
    /** 仓库名称 */
    repo: string
    /**
     * 告警状态过滤。
     * M3 只拉 `open`（默认）。
     */
    state?: 'open' | 'fixed' | 'dismissed'
    /** 每页数量，默认 100（GitHub API 最大值） */
    perPage?: number
}

/**
 * Code Scanning API 返回的单条原始告警类型。
 * 从 `@octokit/rest` 的 `RestEndpointMethodTypes` 推导，无需手写。
 */
type CodeScanningAlertItem =
    RestEndpointMethodTypes['codeScanning']['listAlertsForRepo']['response']['data'][number]

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 拉取指定仓库的 Code Scanning 告警并映射为标准化模型。
 *
 * - 自动分页（`octokit.paginate()`），返回所有匹配的告警
 * - 仅处理 `state=open` 的告警（可通过 `params.state` 覆盖）
 * - severity：`security_severity_level`（GitHub 计算值）优先，
 *   缺失时用 `rule.severity`（error/warning/note/none）经 `mapCodeScanningSeverity` 映射
 * - Code Scanning 告警默认**不可自动修复**（`fixable: false`、`fixStrategy: null`），
 *   修复能力由 T303 规则模板按规则启用
 * - 异常通过 `mapGitHubError` 转为 `AppError`
 * - 空仓库返回 `[]`，不抛异常
 *
 * @param client - 已认证的 Octokit 实例（来自 `createGitHubClient`）
 * @param params - 仓库标识与过滤参数
 * @returns 标准化告警列表
 */
export async function fetchCodeScanningAlerts(
    client: Octokit,
    params: FetchCodeScanningAlertsParams,
): Promise<NormalizedSecurityAlert[]> {
    const { owner, repo, state = 'open', perPage = 100 } = params

    try {
        const rawAlerts = await client.paginate(
            client.rest.codeScanning.listAlertsForRepo,
            { owner, repo, state, per_page: perPage },
        )
        return rawAlerts.map((alert) => normalizeAlert(alert, owner, repo))
    } catch (error: unknown) {
        const context = `fetch code scanning alerts for ${owner}/${repo}`
        throw mapGitHubError(error, context)
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * 将单条 Code Scanning API 原始告警转换为标准化模型。
 *
 * 映射逻辑：
 * - severity：`security_severity_level`（critical/high/medium/low）优先；
 *   缺失时 `rule.severity`（error/warning/note/none → high/medium/low），
 *   `none` 或两者皆缺 → `'unknown'`
 * - packageName 取规则的人类可读名（`rule.name`，如 "SQL injection"），
 *   报告 Package 列对 code-scanning 展示规则名
 * - ruleId 取 `rule.id`（如 `js-sqli`），报告 Rule/Advisory 列展示
 * - manifestPath 取告警文件路径（`most_recent_instance.location.path`）
 * - fixable 恒为 `false`（Code Scanning 告警默认不可自动修复，T303 按规则启用）
 * - `defaultBranch` 不在此层填充（由上层调用方获取后注入）
 */
function normalizeAlert(
    alert: CodeScanningAlertItem,
    owner: string,
    repo: string,
): NormalizedSecurityAlert {
    const ruleId = alert.rule.id ?? ''
    const instance = alert.most_recent_instance

    return {
        id: alert.number,
        source: 'code-scanning',
        repository: `${owner}/${repo}`,
        defaultBranch: '', // 由上层调用 octokit.rest.repos.get 后填入
        severity: mapSeverity(alert),
        packageEcosystem: 'code-scanning',
        packageName: alert.rule.name ?? (ruleId || 'unknown'),
        manifestPath: instance?.location?.path ?? '',
        ruleId,
        summary: instance?.message?.text ?? '',
        htmlUrl: alert.html_url,
        fixable: false,
        fixStrategy: null,
        recommendedVersion: '',
        alertClass: classifyRule(ruleId),
        startLine: instance?.location?.start_line ?? undefined,
        endLine: instance?.location?.end_line ?? undefined,
        suggestion: suggestionFor(ruleId),
    }
}

/**
 * 映射 Code Scanning 告警严重级别：
 * `security_severity_level`（GitHub 计算值，值域与 AlertSeverity 对齐）优先；
 * 缺失时用 `rule.severity` 经 `mapCodeScanningSeverity` 映射；
 * 两者皆缺 → `'unknown'`。
 */
function mapSeverity(alert: CodeScanningAlertItem): AlertSeverity {
    // rule.security_severity_level 值域（critical/high/medium/low）与 AlertSeverity 对齐
    const securityLevel: AlertSeverity | null | undefined = alert.rule.security_severity_level as AlertSeverity | null | undefined
    if (securityLevel) {
        return securityLevel
    }
    if (alert.rule.severity) {
        return mapCodeScanningSeverity(alert.rule.severity)
    }
    return 'unknown'
}
