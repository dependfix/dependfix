import type { NormalizedSecurityAlert, AlertSeverity } from '../alerts'

/**
 * 告警数据源。
 * - `github-dependabot`：GitHub Dependabot alerts API（默认）
 * - `pnpm-audit`：本地 `pnpm audit --json`（无 token 回退）
 */
export type AlertSourceKind = 'github-dependabot' | 'pnpm-audit'

/**
 * 报告级运行配置（RuntimeConfig 脱敏子集，不含 githubToken）。
 */
export interface RunReportConfig {
    mode: string
    severityThreshold: string
    repositories: string[]
    dryRun: boolean
    createPullRequest: boolean
    maxAlertsPerRepository: number
    alertSource: AlertSourceKind
}

/**
 * 汇总统计。
 */
export interface RunSummary {
    repositoriesScanned: number
    alertsFound: number
    alertsFixable: number
    alertsFixed: number
    alertsFailed: number
    alertsSkipped: number
    lockfileRepairs: number
    verificationsPassed: number
    verificationsFailed: number
}

/**
 * 仓库维度汇总。
 */
export interface RepositoryResult {
    repository: string
    defaultBranch: string
    alertsCount: number
    fixable: number
    fixed: number
    failed: number
    lockfileRepaired: boolean
    verificationPassed?: boolean
    durationMs: number
}

/**
 * 修复动作记录（DependencyFixResult / LockfileRepairResult / VerificationResult 的扁平化表示）。
 */
export interface FixAction {
    type: 'dependency-upgrade' | 'lockfile-repair' | 'verification' | 'branch-cleanup'
    repository: string
    target: string
    fromVersion?: string
    toVersion?: string
    isMajor?: boolean
    success: boolean
    error?: string
    strategy?: string
    durationMs?: number
    diff?: string
}

/**
 * 错误记录。
 */
export interface FixError {
    repository: string
    target?: string
    stage: 'fetch' | 'filter' | 'fix' | 'repair' | 'verify' | 'report'
    category?: string
    message: string
}

/**
 * 报告顶层容器。
 */
export interface RunResult {
    runId: string
    startedAt: string
    finishedAt: string
    config: RunReportConfig
    summary: RunSummary
    repositories: RepositoryResult[]
    alerts: NormalizedSecurityAlert[]
    actions: FixAction[]
    errors: FixError[]
}

/** 按严重级别聚合的统计。 */
export interface SeverityBreakdown {
    critical: SeverityRow
    high: SeverityRow
    medium: SeverityRow
    low: SeverityRow
}

interface SeverityRow {
    found: number
    fixable: number
    fixed: number
    failed: number
}

/** 按仓库分组的动作。 */
export interface RepositoryActions {
    repository: string
    alerts: NormalizedSecurityAlert[]
    actions: FixAction[]
}

/**
 * 从告警列表中计算按严重级别的聚合。
 */
export function aggregateSeverity(alerts: NormalizedSecurityAlert[], fixedAlerts: Set<string>): SeverityBreakdown {
    const empty = (): SeverityRow => ({ found: 0, fixable: 0, fixed: 0, failed: 0 })

    const breakdown: Record<AlertSeverity, SeverityRow> = {
        critical: empty(),
        high: empty(),
        medium: empty(),
        low: empty(),
        unknown: empty(),
    }

    for (const alert of alerts) {
        const row = breakdown[alert.severity] ?? breakdown.unknown
        row.found++
        if (alert.fixable) {
            row.fixable++
        }
        if (fixedAlerts.has(alertKey(alert))) {
            row.fixed++
        }
    }

    return {
        critical: breakdown.critical,
        high: breakdown.high,
        medium: breakdown.medium,
        low: breakdown.low,
    }
}

/**
 * 按仓库分组告警和动作。
 */
export function groupByRepository(
    alerts: NormalizedSecurityAlert[],
    actions: FixAction[],
    repoResults: RepositoryResult[],
): RepositoryActions[] {
    const repoMap = new Map<string, RepositoryActions>()

    for (const rr of repoResults) {
        repoMap.set(rr.repository, { repository: rr.repository, alerts: [], actions: [] })
    }
    for (const alert of alerts) {
        const entry = repoMap.get(alert.repository)
        if (entry) {
            entry.alerts.push(alert)
        }
    }
    for (const action of actions) {
        const entry = repoMap.get(action.repository)
        if (entry) {
            entry.actions.push(action)
        }
    }

    return [...repoMap.values()]
}

/**
 * 生成告警的唯一键（用于固定集合追踪）。
 */
export function alertKey(alert: NormalizedSecurityAlert): string {
    return `${alert.repository}/${alert.packageName}@${alert.recommendedVersion}`
}

/**
 * 格式化耗时。
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) {
        return '< 1s'
    }
    if (ms < 60_000) {
        return `${Math.round(ms / 1000)}s`
    }

    const totalSeconds = Math.round(ms / 1000)
    const totalMinutes = Math.floor(totalSeconds / 60)
    const remainingSeconds = totalSeconds % 60

    if (totalMinutes < 60) {
        return remainingSeconds > 0 ? `${totalMinutes}m ${remainingSeconds}s` : `${totalMinutes}m`
    }

    const totalHours = Math.floor(totalMinutes / 60)
    const remainingMinutes = totalMinutes % 60
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`
}

/**
 * 动作类型到展示标签的映射。
 */
export function actionTypeLabel(type: FixAction['type']): string {
    switch (type) {
        case 'dependency-upgrade': return 'dependency-upgrade'
        case 'lockfile-repair': return 'lockfile-repair'
        case 'verification': return 'verification'
        case 'branch-cleanup': return 'branch-cleanup'
    }
}

/**
 * 成功/失败图标。
 */
export function statusIcon(success: boolean): string {
    return success ? '✅' : '❌'
}

/**
 * 创建空的 RunSummary。
 */
export function createEmptyRunSummary(): RunSummary {
    return {
        repositoriesScanned: 0,
        alertsFound: 0,
        alertsFixable: 0,
        alertsFixed: 0,
        alertsFailed: 0,
        alertsSkipped: 0,
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
    }
}
