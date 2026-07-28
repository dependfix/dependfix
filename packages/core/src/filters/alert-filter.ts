import type { AlertSeverity, NormalizedSecurityAlert } from '../alerts'

/**
 * 严重级别过滤阈值。
 * `all` 表示不过滤；`critical` 只保留 critical。
 */
export type SeverityThreshold = 'critical' | 'high' | 'medium' | 'all'

/**
 * 过滤结果：保留和跳过的告警（含跳过原因）。
 */
export interface FilterResult {
    filtered: NormalizedSecurityAlert[]
    skipped: SkippedAlert[]
}

export interface SkippedAlert {
    alert: NormalizedSecurityAlert
    reason: string
}

/**
 * 截断结果：保留和超出上限被截断的告警。
 */
export interface LimitResult {
    limited: NormalizedSecurityAlert[]
    truncated: SkippedAlert[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<AlertSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    unknown: 0,
}

function severityOrdinal(severity: AlertSeverity): number {
    return SEVERITY_ORDER[severity] ?? 0
}

function thresholdOrdinal(threshold: SeverityThreshold): number {
    // `all` → 0 意味着所有严重级别都 >= 0，全部保留。
    // `critical` → 4 意味着只保留 score >= 4 的（即 critical）
    switch (threshold) {
        case 'critical': return 4
        case 'high': return 3
        case 'medium': return 2
        case 'all': return 0
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * 按严重级别阈值过滤告警。
 *
 * - `>= critical`：只保留 critical
 * - `>= high`：保留 critical + high
 * - `>= medium`：保留 critical + high + medium
 * - `all`：全部保留
 */
export function filterAlerts(
    alerts: NormalizedSecurityAlert[],
    options: { severityThreshold: SeverityThreshold },
): FilterResult {
    const minSeverity = thresholdOrdinal(options.severityThreshold)
    const filtered: NormalizedSecurityAlert[] = []
    const skipped: SkippedAlert[] = []

    for (const alert of alerts) {
        if (severityOrdinal(alert.severity) >= minSeverity) {
            filtered.push(alert)
        } else {
            skipped.push({
                alert,
                reason: `severity below threshold (${alert.severity} < ${options.severityThreshold})`,
            })
        }
    }

    return { filtered, skipped }
}

/**
 * 按优先级排序：
 * 1. `fixable` 优先（isFixable 且 fixStrategy 非 null 的排在前面）
 * 2. 严重级别降序
 * 3. 包名字母序（稳定排序）
 */
export function prioritizeAlerts(alerts: NormalizedSecurityAlert[]): NormalizedSecurityAlert[] {
    return [...alerts].sort((a, b) => {
        // fixable 优先
        const aFixable = a.fixable && a.fixStrategy !== null ? 1 : 0
        const bFixable = b.fixable && b.fixStrategy !== null ? 1 : 0
        if (aFixable !== bFixable) {
            return bFixable - aFixable
        }

        // 严重级别降序
        const severityDiff = severityOrdinal(b.severity) - severityOrdinal(a.severity)
        if (severityDiff !== 0) {
            return severityDiff
        }

        // 包名字母序
        return a.packageName.localeCompare(b.packageName)
    })
}

/**
 * 按单仓库最大数量截断告警列表。
 * 超出部分以 `truncated` 返回，reason 包含截断原因。
 */
export function limitAlerts(
    alerts: NormalizedSecurityAlert[],
    maxPerRepo: number,
): LimitResult {
    if (alerts.length <= maxPerRepo) {
        return { limited: alerts, truncated: [] }
    }

    const limited = alerts.slice(0, maxPerRepo)
    const truncated = alerts.slice(maxPerRepo).map((alert) => ({
        alert,
        reason: `exceeded max alerts per repository (${alerts.length} > ${maxPerRepo})`,
    }))

    return { limited, truncated }
}
