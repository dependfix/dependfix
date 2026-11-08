import { scanModeOptions } from './scan-options'

type Translator = (key: string, params?: Record<string, string | number>) => string

export const shortRunId = (id: string) => id.slice(0, 8)

/**
 * 构建期未注入 / 存量行的统一哨兵。
 * 权威值在 `server/utils/build-info.ts#UNKNOWN_BUILD_VALUE`（同一字符串，跨 client/server 边界复制），
 * 等值由 `server/api/runs/[id].get.test.ts` 断言（同 `EXPORT_RUNS_LIMIT` 镜像模式）。
 */
export const BUILD_UNKNOWN_VALUE = 'unknown'

export interface BuildLabelView {
    label: string
    /** 两侧都不可读（未注入 / 存量行）时为 true，UI 据此走 muted 降级而不是错误态 */
    unknown: boolean
}

/**
 * 构建版本回执展示：`<version> · <短 commit>`。
 *
 * - 新 run 未注入构建期版本时两列写 `unknown`，存量行为 `null` → 统一显示「未知」（降级，不是错误态）
 * - 只有一侧可读时只显示该侧，不拼 `unknown`
 */
export const formatBuildLabel = (
    version: string | null | undefined,
    commit: string | null | undefined,
    unknownLabel: string,
): BuildLabelView => {
    const knownVersion = version && version !== BUILD_UNKNOWN_VALUE ? version : ''
    const knownCommit = commit && commit !== BUILD_UNKNOWN_VALUE ? commit.slice(0, 8) : ''
    const unknown = knownVersion === '' && knownCommit === ''
    return {
        label: unknown ? unknownLabel : [knownVersion, knownCommit].filter(Boolean).join(' · '),
        unknown,
    }
}

/** 读取任意计数：正数原样返回；0 / 负数 / 非数字 / 缺失一律降级为 0（旧 summaryJson 兼容）。 */
const countValue = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

export const summaryNumber = (summary: Record<string, unknown> | null, key: string) =>
    countValue(summary?.[key])

const nestedCounts = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

/** 跳过原因展示顺序；与 `packages/core/src/report/types.ts#SKIP_REASONS` 同序。 */
export const SKIP_REASON_ORDER = [
    'subdirectory-manifest',
    'cross-major',
    'not-fixable',
    'override-protected',
    'repeated-failure',
    'peer-only',
] as const

/** 严重级别展示顺序；与 `packages/core/src/alerts/index.ts#ALERT_SEVERITIES` 同序。 */
export const SEVERITY_DISPLAY_ORDER = ['critical', 'high', 'medium', 'low', 'unknown'] as const

export interface BreakdownRow {
    key: string
    count: number
}

/**
 * 交付跳过（基线红）的仓库数（`summary.deliverySkipped`）。
 *
 * >0 表示「有修复产出但没有交付」：列表 / 详情据此展示「交付跳过」标签，
 * 避免把「无 PR」误读为「扫描无告警」。口径见
 * [pr-delivery-closure.md §16](../../../../docs/design/governance/pr-delivery-closure.md#16-m514-基线红--安装失败的交付降级2026-10-30)。
 */
export const deliverySkipped = (summary: Record<string, unknown> | null) => summaryNumber(summary, 'deliverySkipped')

/** 本次运行新建的交付降级 issue 数（`issue` 档）。 */
export const deliverySkipIssues = (summary: Record<string, unknown> | null) => summaryNumber(summary, 'deliverySkipIssues')

/** 本次运行创建的草稿 PR 数（`draft` 档）。 */
export const deliverySkipDraftPrs = (summary: Record<string, unknown> | null) => summaryNumber(summary, 'deliverySkipDraftPrs')

/** 跳过总数（`summary.alertsSkipped`）。 */
export const skippedTotal = (summary: Record<string, unknown> | null) => summaryNumber(summary, 'alertsSkipped')

/** 截断总数（`summary.alertsTruncated`）。 */
export const truncatedTotal = (summary: Record<string, unknown> | null) => summaryNumber(summary, 'alertsTruncated')

/**
 * 按原因展开跳过计数；旧 summaryJson 缺 `alertsSkippedByReason` 时回退为单行 `other`，
 * 展示层用 `total - sum(known)` 补齐，保证总数不丢。
 */
export const skippedBreakdown = (summary: Record<string, unknown> | null): BreakdownRow[] => {
    const grouped = nestedCounts(summary?.alertsSkippedByReason)
    const rows: BreakdownRow[] = SKIP_REASON_ORDER
        .map((key) => ({ key, count: countValue(grouped[key]) }))
        .filter((row) => row.count > 0)
    const other = Math.max(0, skippedTotal(summary) - rows.reduce((sum, row) => sum + row.count, 0))
    if (other > 0) {
        rows.push({ key: 'other', count: other })
    }
    return rows
}

/** 按严重级别展开截断计数；旧 summaryJson 缺分组字段时回退为单行 `other`。 */
export const truncatedBreakdown = (summary: Record<string, unknown> | null): BreakdownRow[] => {
    const grouped = nestedCounts(summary?.alertsTruncatedBySeverity)
    const rows: BreakdownRow[] = SEVERITY_DISPLAY_ORDER
        .map((key) => ({ key, count: countValue(grouped[key]) }))
        .filter((row) => row.count > 0)
    const other = Math.max(0, truncatedTotal(summary) - rows.reduce((sum, row) => sum + row.count, 0))
    if (other > 0) {
        rows.push({ key: 'other', count: other })
    }
    return rows
}

/** 发现总数 = 已评估 + 截断，用于「未修复 / 总数」披露。 */
export const totalDiscoveredAlerts = (summary: Record<string, unknown> | null) =>
    alertsFound(summary) + truncatedTotal(summary)

export const alertsFound = (summary: Record<string, unknown> | null) => summaryNumber(summary, 'alertsFound')

/**
 * 未修复告警数：优先读 `summary.alertsUnfixed`（告警级 canonical）；
 * 旧 summary 缺 `alertsUnfixed` 字段时回退 `found − alertsFixed − alertsConverged`（action 级近似，下限 0）。
 *
 * 归因原则与 [platform-notification.md §7.1](../../../docs/design/governance/platform-notification.md#71-高危与未修复口径)
 * 一致（本函数读运行期 summary 快照，后续 supersede 不回溯）：`converged`（本地已满足、无需升级）不计入未修复；`failed` / `skipped` / 不可自动修复
 * 都属于「本次未修复」，在 UI 中可见但不改变 exit code / 运行状态。
 *
 * 截断告警不在此口径内（引擎只把 `limited` 写入 `alertsFound`），由 `truncatedBreakdown`
 * 单独披露；`totalDiscoveredAlerts` 把截断计入总数用于「未修复 / 总数」展示。
 */
export const unfixedAlerts = (summary: Record<string, unknown> | null) => {
    // 优先读告警级 canonical 字段；旧 summaryJson 缺失时回退 action 级近似公式
    const canonical = summary?.alertsUnfixed
    if (typeof canonical === 'number' && Number.isFinite(canonical)) {
        return Math.max(0, canonical)
    }
    return Math.max(0, alertsFound(summary) - summaryNumber(summary, 'alertsFixed') - summaryNumber(summary, 'alertsConverged'))
}

interface RunOutcomeView {
    status: string
    summary?: Record<string, unknown> | null
    error?: { code?: string | null } | null
    environmentalFailureCount?: number | null
}

/** 字节数 → 人类可读（UI；null / 非法值显示 —，不伪造成 0 B）。 */
export const formatBytes = (bytes: number | null | undefined): string => {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) {
        return '—'
    }
    if (bytes < 1024) {
        return `${bytes} B`
    }
    const units = ['KiB', 'MiB', 'GiB', 'TiB', 'PiB']
    let value = bytes / 1024
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024
        unitIndex++
    }
    return `${value.toFixed(1)} ${units[unitIndex]}`
}

/**
 * 环境性失败事件数：优先读落库列（新数据），回退 summary 快照（旧数据 / 测试）。
 * 两处都缺失 → 0；该口径不归因目标仓库，UI 只提示「可见」。
 */
export const environmentalFailureCount = (run: RunOutcomeView) => {
    const persisted = run.environmentalFailureCount
    if (typeof persisted === 'number' && Number.isFinite(persisted)) {
        return Math.max(0, persisted)
    }
    return summaryNumber(run.summary ?? null, 'environmentalFailures')
}

/**
 * 运行是否「结果缺失」（不能展示告警数 / 已修复数）。
 *
 * - `failed` / `completed` / `degraded` 但无 `summaryJson`（如执行超时、编排失败）
 * - 或明确 `execution_timeout`（即使意外带了半截 summary，也按缺失展示，避免「0 告警」误导）
 *
 * `pending` / `running` / `dispatched` 属于「尚未就绪」，不是缺失，返回 false。
 */
export const isRunResultMissing = (run: RunOutcomeView) => {
    if (run.status === 'pending' || run.status === 'running' || run.status === 'dispatched') {
        return false
    }
    return run.summary === null || run.summary === undefined || run.error?.code === 'execution_timeout'
}

/**
 * 运行模式标签：复用 `scan-options` 的选项单一事实源（标签口径漂移防护）。
 * 未知模式（历史数据 / 未来枚举扩展）原样返回，故用 `find` + 兜底。
 */
export const runModeLabel = (mode: string, t: Translator) =>
    scanModeOptions(t).find((option) => option.value === mode)?.label ?? mode

export const runExecutorLabel = (executorKind: string, t: Translator) => {
    switch (executorKind) {
        case 'github-action':
            return t('repos.githubAction')
        case 'sandbox':
            return t('repos.sandboxContainer')
        default:
            return t('repos.platformContainer')
    }
}

/**
 * 失败阶段下拉选项顺序（与 `server/services/run-failure-classify.ts` 的 `RUN_FAILURE_STAGES` 同序；
 * 分类口径单一事实源在服务端，前端仅复制枚举词汇用于筛选控件）。
 */
export const RUN_FAILURE_STAGE_OPTIONS = [
    'source',
    'clone',
    'install',
    'fix',
    'verify',
    'deliver',
    'runtime',
    'cleanup',
    'unknown',
] as const

/** 处置建议下拉选项顺序（同上） */
export const RUN_FAILURE_KIND_OPTIONS = ['transient', 'deterministic', 'unknown'] as const

/**
 * 批量日志导出的**全量导出**运行数上限（前端镜像，仅用于预判「导出全部筛选结果」是否可用）。
 *
 * 权威值在服务端 `server/api/runs/logs-export.get.ts` 的 `MAX_EXPORT_RUNS`（超限 413 兜底）；
 * 前端镜像只决定菜单项的可点状态与文案，两类漂移后果均为「提示与 413 不一致」而不会放行越权导出。
 * 两侧等值由 `server/api/runs/runs-logs.test.ts` 的断言锁定。
 */
export const EXPORT_RUNS_LIMIT = 100

/** 导出范围菜单项（纯渲染数据；`command` 由页面注入，便于单测覆盖两档文案与禁用态） */
export interface ExportScopeItem {
    label: string
    disabled: boolean
}

/**
 * 「导出全部筛选结果」菜单项（SplitButton 二级入口）。
 *
 * 主按钮已覆盖「当前页」，菜单只承载全量一档：命中数 > `EXPORT_RUNS_LIMIT` 时禁用并标注原因
 * （超限点按只会拿到 413，禁用可免去一次必然失败的操作）。
 */
export const buildExportScopeItems = (total: number, t: Translator): ExportScopeItem[] => {
    const overLimit = total > EXPORT_RUNS_LIMIT
    return [
        {
            label: overLimit
                ? t('scans.runList.exportAllLogsOverLimit', { total, limit: EXPORT_RUNS_LIMIT })
                : t('scans.runList.exportAllLogs', { total }),
            disabled: overLimit,
        },
    ]
}

/** 失败阶段 i18n 标签（null → null；未知阶段原样返回） */
export const failureStageLabel = (stage: string | null | undefined, t: Translator): string | null => {
    if (!stage) {
        return null
    }
    return ({
        source: t('runs.failureStage.source'),
        clone: t('runs.failureStage.clone'),
        install: t('runs.failureStage.install'),
        fix: t('runs.failureStage.fix'),
        verify: t('runs.failureStage.verify'),
        deliver: t('runs.failureStage.deliver'),
        runtime: t('runs.failureStage.runtime'),
        cleanup: t('runs.failureStage.cleanup'),
        unknown: t('runs.failureStage.unknown'),
    } as Record<string, string>)[stage] ?? stage
}

/** 处置建议 i18n 标签（null → null；未知值原样返回） */
export const failureKindLabel = (kind: string | null | undefined, t: Translator): string | null => {
    if (!kind) {
        return null
    }
    return ({
        transient: t('runs.failureKind.transient'),
        deterministic: t('runs.failureKind.deterministic'),
        unknown: t('runs.failureKind.unknown'),
    } as Record<string, string>)[kind] ?? kind
}

export const formatRunDuration = (
    startedAt: string | null,
    finishedAt: string | null,
    t: Translator,
) => {
    if (!startedAt || !finishedAt) {
        return '—'
    }
    const started = new Date(startedAt).getTime()
    const finished = new Date(finishedAt).getTime()
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
        return '—'
    }
    const seconds = (finished - started) / 1000
    const formattedSeconds = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(seconds)
    return t('alerts.runDurationSeconds', { seconds: formattedSeconds })
}
