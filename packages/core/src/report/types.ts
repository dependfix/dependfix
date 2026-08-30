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
    /** 是否同时拉取 Code Quality findings（与 Dependabot 并行源） */
    codeQualityEnabled?: boolean
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
    /**
     * 跳过（不可自动修复 / 需人工处理：非 fixable、子目录 manifest、降级风险等）。
     * 与 `alertsConverged`（已收敛，无需升级）语义分离。
     */
    alertsSkipped: number
    /**
     * 已收敛：当前锁定版本已 >= 推荐版本（或 lockfile 已无脆弱实例），
     * 无需升级。从 alertsSkipped 拆分，避免混合语义。
     */
    alertsConverged: number
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
    /**
     * 告警源标识（仅 stage='fetch' + category='FETCH_FAILED' 时存在）：
     * 标识本次失败的具体源（'dependabot' | 'code-scanning' | 'code-quality' | 'pnpm-audit'），
     * 便于 CLI / 平台 UI 输出部分源失败的分组汇总（M19.5 C8 per-source 错误隔离）。
     */
    source?: string
}

/**
 * AI 研判用量聚合（run 级；每次成功调用累计）。
 * 成本估算仅当全部调用的模型均有单价数据时输出（无单价 → undefined）。
 */
export interface AiUsageAggregate {
    /** 成功调用次数（provider 正常返回；失败调用不计入） */
    calls: number
    inputTokens: number
    outputTokens: number
    totalTokens: number
    /** 估算成本（USD，公开定价推算，仅供参考）；模型无单价数据时为 undefined */
    estimatedCostUsd?: number
}

/**
 * 供应链信号警示（路径 A"合法包被投毒"合入前人工确认的关键依据）：
 * 本次新增/升级的包带 lifecycle scripts 且已被目标仓库 `allowBuilds` /
 * `onlyBuiltDependencies` 批准——脚本会在目标仓库安装时真实执行。
 */
export interface SupplyChainWarning {
    /** 目标仓库（owner/repo 或 local） */
    repository: string
    /** 包名 */
    packageName: string
    /** 升级后的版本（该版本在目标仓库将被安装并可能执行脚本） */
    version: string
    /** lifecycle 脚本类型（install / preinstall / postinstall 中的已存在项） */
    scriptTypes: string[]
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
    /** AI 研判用量聚合（仅 --ai 开启且实际调用时存在） */
    aiUsage?: AiUsageAggregate
    /** 供应链信号警示区（本次升级包带脚本且被批准；空 = 不渲染） */
    supplyChainWarnings?: SupplyChainWarning[]
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
 * @param alerts 告警列表
 * @param actions 修复动作（用于精确 fixed 判定，见 {@link isAlertFixedByActions}）
 */
export function aggregateSeverity(
    alerts: NormalizedSecurityAlert[],
    actions: FixAction[],
): SeverityBreakdown {
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
        if (isAlertFixedByActions(alert, actions)) {
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
 * 精确判定单条告警是否已被修复（防跨线误标，2026-08-06 复盘 PR #28）。
 *
 * - Code Scanning：既有规则 `repo/ruleId@filePath` 匹配（success && !noOp）
 * - 依赖升级：存在同仓库同包的**成功** action，且其升级目标中存在
 *   **与推荐版本同 major 且 >= 推荐版本**的目标（{@link parseRangeTargets}）。
 *   推荐版本为空时回退包级匹配（兼容无推荐场景）。
 *
 * 与包级匹配（buildFixedKeys）的区别：包级匹配会把同包所有告警标 fixed，
 * 包括"推荐版本需要跨大版本升级"（如 5.x 实例的告警推荐 6.4.3 而只升到 5.4.21，
 * 或同包其他线的目标 8.2.1 掩盖 5.x 实例未修复）的未真正修复告警——
 * 本函数按"同 major 版本满足"判定，杜绝该误标。
 */
export function isAlertFixedByActions(
    alert: NormalizedSecurityAlert,
    actions: FixAction[],
): boolean {
    // Code Scanning：实例维度
    if (alert.source === 'code-scanning') {
        const csKey = `${alert.repository}/${alert.ruleId}@${alert.manifestPath}`
        return actions.some((a) => (
            a.success
            && !a.noOp
            && a.type === 'code-scanning-fix'
            && `${a.repository}/${a.target}@${a.filePath ?? ''}` === csKey
        ))
    }

    // Code Quality：所有 findings 均 `fixable: false`、`recommendedVersion: ''`；
    // 不可被 dependency-upgrade action 误标为 fixed（同名 packageName 与 Dependabot 重叠时
    // 走包级匹配兜底会错误返回 true）。首版统一不可修复。
    if (alert.source === 'code-quality') {
        return false
    }

    // 依赖升级：版本满足判定
    const upgradeActions = actions.filter((a) => (
        a.success
        && !a.noOp
        && a.type === 'dependency-upgrade'
        && a.repository === alert.repository
        && a.target === alert.packageName
    ))
    if (upgradeActions.length === 0) {
        return false
    }

    // 推荐版本为空（无修复版本信息）→ 包级匹配兜底（有成功升级即视为处理）
    if (!alert.recommendedVersion) {
        return true
    }

    // 逐目标判定：存在一个升级目标 >= 推荐版本 **且 major 相同**。
    // major 匹配要求杜绝跨线误标：5.x 实例的告警推荐 6.4.3 而目标只有 8.2.1
    // （或 5.4.21）时——目标 major 8（或 5）≠ 推荐 major 6 → 不标 fixed
    // （PR #28 复盘；"max of targets" 会被同包其他线目标掩盖，故用逐目标判定）
    const recommendedMajor = parseMajorVersion(alert.recommendedVersion)
    return upgradeActions.some((a) => parseRangeTargets([a.toVersion]).some((t) => (
        parseMajorVersion(t) === recommendedMajor
        && compareVersions(t, alert.recommendedVersion as string) >= 0
    )))
}

/**
 * 解析升级目标 range 中出现的全部版本（含版本化覆盖多目标）。
 * - `^5.4.21` / `~5.4.21` / `>=5.4.21` / `5.4.21` → `['5.4.21']`
 * - `5.4.21, 6.4.3` → `['5.4.21', '6.4.3']`
 * - 无有效版本 → `[]`
 */
export function parseRangeTargets(ranges: Array<string | undefined>): string[] {
    const targets: string[] = []
    for (const range of ranges) {
        if (!range) {
            continue
        }
        for (const part of range.split(',')) {
            const bare = part.trim().replace(/^[\^~>=<\s]+/, '')
            const match = /^\d+\.\d+\.\d+/.exec(bare)
            if (match) {
                targets.push(match[0])
            }
        }
    }
    return targets
}

/**
 * 简单三段版本比较（core 无 semver 依赖；语义与 cli compareSemver 对齐：
 * 缺失段补 0，pre-release 忽略）。非法版本按 0.0.0 处理。
 */
export function compareVersions(a: string, b: string): number {
    const pa = parseVersion(a)
    const pb = parseVersion(b)
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) {
            return pa[i] < pb[i] ? -1 : 1
        }
    }
    return 0
}

function parseVersion(v: string): [number, number, number] {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim())
    if (!match) {
        return [0, 0, 0]
    }
    return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** 大版本号（非法版本按 0）。 */
function parseMajorVersion(v: string): number {
    return parseVersion(v)[0]
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
        alertsConverged: 0,
        alertsTruncated: 0,
        lockfileRepairs: 0,
        verificationsPassed: 0,
        verificationsFailed: 0,
    }
}
