import { ALERT_SEVERITIES, type AlertSeverity } from '../alerts'
import {
    SKIP_REASONS,
    type AlertsSkippedByReason,
    type AlertsTruncatedBySeverity,
    type RunSummary,
    type SkipReason,
} from './types'

/**
 * 分组展示行。`other` 用于旧 summaryJson 缺分组字段时的降级：
 * 展示层用 `total - sum(known)` 补齐，保证总数不丢。
 */
export interface BreakdownRow<T extends string> {
    key: T | 'other'
    count: number
}

type SkipSummary = Pick<RunSummary, 'alertsSkipped'> & {
    alertsSkippedByReason?: AlertsSkippedByReason
}

type TruncatedSummary = Pick<RunSummary, 'alertsTruncated'> & {
    alertsTruncatedBySeverity?: AlertsTruncatedBySeverity
}

const countValue = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

/**
 * 累加一次跳过：总数与原因分组必须同源更新。
 *
 * 直接写 `summary.alertsSkipped++` 会破坏 `sum(alertsSkippedByReason) === alertsSkipped`，
 * 所有跳过点一律经此函数（`override-protect` 与 repo-fix 各累加点共用）。
 */
export function addSkipped(summary: SkipSummary, reason: SkipReason, count = 1): void {
    if (!Number.isFinite(count) || count <= 0) {
        return
    }
    summary.alertsSkipped += count
    const byReason = summary.alertsSkippedByReason ?? (summary.alertsSkippedByReason = {})
    byReason[reason] = (byReason[reason] ?? 0) + count
}

/**
 * 累加截断：总数与严重级别分组必须同源更新。
 * `alerts` 为被 `limitAlerts` 丢弃的告警（不需要完整对象，只要有 severity）。
 */
export function addTruncatedBySeverity(
    summary: TruncatedSummary,
    alerts: ReadonlyArray<Pick<RunSummaryAlert, 'severity'>>,
): void {
    if (alerts.length === 0) {
        return
    }
    summary.alertsTruncated += alerts.length
    const bySeverity = summary.alertsTruncatedBySeverity ?? (summary.alertsTruncatedBySeverity = {})
    for (const alert of alerts) {
        bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1
    }
}

/** 仅需 severity 的最小告警形状（避免把完整 NormalizedSecurityAlert 依赖带进纯计数层）。 */
interface RunSummaryAlert {
    severity: AlertSeverity
}

/**
 * 按原因展开跳过计数（稳定顺序，仅返回 >0 的项）。
 * 旧 summaryJson 缺 `alertsSkippedByReason` 时返回单个 `other = alertsSkipped`。
 */
export function skippedBreakdown(summary: SkipSummary): BreakdownRow<SkipReason>[] {
    const grouped = summary.alertsSkippedByReason ?? {}
    const rows: BreakdownRow<SkipReason>[] = SKIP_REASONS
        .map((key) => ({ key, count: countValue(grouped[key]) }))
        .filter((row) => row.count > 0)
    const known = rows.reduce((sum, row) => sum + row.count, 0)
    const other = Math.max(0, countValue(summary.alertsSkipped) - known)
    if (other > 0) {
        rows.push({ key: 'other', count: other })
    }
    return rows
}

/**
 * 按严重级别展开截断计数（critical → unknown，仅返回 >0 的项）。
 * 旧 summaryJson 缺 `alertsTruncatedBySeverity` 时返回单个 `other = alertsTruncated`。
 */
export function truncatedBreakdown(summary: TruncatedSummary): BreakdownRow<AlertSeverity>[] {
    const grouped = summary.alertsTruncatedBySeverity ?? {}
    const rows: BreakdownRow<AlertSeverity>[] = ALERT_SEVERITIES
        .map((key) => ({ key, count: countValue(grouped[key]) }))
        .filter((row) => row.count > 0)
    const known = rows.reduce((sum, row) => sum + row.count, 0)
    const other = Math.max(0, countValue(summary.alertsTruncated) - known)
    if (other > 0) {
        rows.push({ key: 'other', count: other })
    }
    return rows
}

/**
 * 未修复告警数：优先读 `alertsUnfixed`（告警级，由引擎逐条判定）；
 * 旧 summary 缺 `alertsUnfixed` 字段时回退 `found − alertsFixed − alertsConverged`（action 级近似值）。
 */
export function countUnfixedAlerts(
    summary: Pick<RunSummary, 'alertsFound' | 'alertsFixed' | 'alertsConverged'> & { alertsUnfixed?: number },
): number {
    if (typeof summary.alertsUnfixed === 'number' && Number.isFinite(summary.alertsUnfixed)) {
        return Math.max(0, summary.alertsUnfixed)
    }
    return Math.max(0, countValue(summary.alertsFound) - countValue(summary.alertsFixed) - countValue(summary.alertsConverged))
}

/** 发现总数 = 已评估（alertsFound）+ 被截断（alertsTruncated），用于「未修复 / 总数」披露。 */
export function countDiscoveredAlerts(
    summary: Pick<RunSummary, 'alertsFound' | 'alertsTruncated'>,
): number {
    return countValue(summary.alertsFound) + countValue(summary.alertsTruncated)
}

const SKIP_REASON_LABELS: Record<SkipReason | 'other', string> = {
    'subdirectory-manifest': 'Sub-directory / root direct manifest',
    'cross-major': 'Cross-major / manual review',
    'not-fixable': 'Not auto-fixable',
    'override-protected': 'Protected by policy',
    'repeated-failure': 'Repeated failure (attempt limit)',
    'peer-only': 'Peer-only dependency (manual review)',
    other: 'Other / unclassified',
}

const SEVERITY_LABELS: Record<AlertSeverity | 'other', string> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    unknown: 'Unknown',
    other: 'Other / unclassified',
}

/** 跳过原因的英文展示标签（报告 / PR 正文共用，避免两处口径漂移）。 */
export const formatSkipReason = (reason: SkipReason | 'other'): string => SKIP_REASON_LABELS[reason]

/** 严重级别的英文展示标签（报告 / PR 正文共用）。 */
export const formatSeverity = (severity: AlertSeverity | 'other'): string => SEVERITY_LABELS[severity]
