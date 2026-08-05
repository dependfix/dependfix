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
    /** 是否同时拉取 Code Scanning alerts（与 Dependabot 并行源） */
    codeScanningEnabled?: boolean
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
    /** 因 maxAlertsPerRepository 截断的告警数（收尾审查遗留：截断明细进报告） */
    alertsTruncated: number
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
    type: 'dependency-upgrade' | 'lockfile-repair' | 'verification' | 'branch-cleanup' | 'code-scanning-fix'
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
    /**
     * 标记"无需修改"（code-scanning 修复时文件已合规）。
     * 不计入 fixed/failed 统计（summary 与 repoResults 口径一致）。
     */
    noOp?: boolean
    /**
     * code-scanning 修复的目标文件（告警 manifestPath，相对路径）。
     * 用于告警级修复状态关联（同 ruleId 多实例区分）。
     */
    filePath?: string
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
 * fixedKeys 为已修复告警键集合（buildFixedKeys 单一事实源）：
 * 依赖升级用包级 `repo/pkg`，Code Scanning 用 `repo/ruleId@filePath`（实例维度）；
 * 兼容旧格式 `repo/pkg@version`（alertKey）。
 */
export function aggregateSeverity(alerts: NormalizedSecurityAlert[], fixedKeys: Set<string>): SeverityBreakdown {
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
        const fixed = fixedKeys.has(`${alert.repository}/${alert.packageName}`)
            || fixedKeys.has(alertKey(alert))
            || fixedKeys.has(`${alert.repository}/${alert.ruleId}@${alert.manifestPath}`)
        if (fixed) {
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
 * 从动作列表构建已修复告警键集合（单一事实源，markdown 报告与 PR body 共用）。
 *
 * - 依赖升级：`repo/pkg`（**包级**匹配——同包多条 GHSA 告警推荐版本各异，
 *   action 的 toVersion 是统一目标（版本化 overrides 甚至多目标逗号分隔），
 *   按版本精确匹配必然漏列；包级匹配与 markdown 明细表口径一致）
 * - Code Scanning：`repo/ruleId@filePath`（实例维度，同规则多文件区分；noOp 动作不算修复）
 */
export function buildFixedKeys(actions: FixAction[]): Set<string> {
    return new Set(
        actions
            .filter((a) => a.success && !a.noOp && (a.type === 'dependency-upgrade' || a.type === 'code-scanning-fix'))
            .map((a) => a.type === 'code-scanning-fix' && a.filePath
                ? `${a.repository}/${a.target}@${a.filePath}`
                : `${a.repository}/${a.target}`),
    )
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
        case 'code-scanning-fix': return 'code-scanning-fix'
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
        alertsTruncated: 0,
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
    }
}
