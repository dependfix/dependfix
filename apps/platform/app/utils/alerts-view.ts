type Translator = (key: string, params?: Record<string, string | number>) => string

/**
 * alerts 视图 Tag 颜色 + 文案工具（todo.md §M16.2 抽出）。
 *
 * 历史：alerts.vue 内联实现导致文件 > 800 行 lint 警告（file too long）；
 * 抽到独立 util 与 todo.md §M15.1 run-view.ts 抽取模式一致 —— utility 在多处复用前先抽出，
 * 单调用方 utility 由 audit suggest 触发（避免过早抽象）。
 */

/**
 * alerts 列表 severity Tag 颜色（critical / high / medium / 其他）。
 * PrimeVue Tag severity: 'danger' | 'warn' | 'info' | 'secondary' ...
 */
export const alertsSeverityTagSeverity = (severity: string): string => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'high':
            return 'warn'
        case 'medium':
            return 'info'
        default:
            return 'secondary'
    }
}

/**
 * alerts 列表 ruleId Tag 颜色（按 source 区分）：实测反馈 alerts UI 看不到 GHSA/CVE/rule 关键标识，
 * source 不同 → 不同 severity 区分；ruleId 字段混用（GHSA / CVE / advisory URL / CodeQL rule id / Code Quality finding id）。
 */
export const alertsRuleIdTagSeverity = (source: string): string => {
    switch (source) {
        case 'dependabot':
            return 'success'
        case 'pnpm-audit':
            return 'warn'
        case 'code-scanning':
            return 'info'
        case 'code-quality':
            return 'contrast'
        default:
            return 'secondary'
    }
}

/** dedupe 详情侧栏 RunDetailView status → Tag severity 映射 */
export const alertsRunStatusSeverity = (status: string): string => {
    switch (status) {
        case 'completed':
            return 'success'
        case 'failed':
            return 'danger'
        case 'dispatched':
            return 'info'
        default:
            return 'warn'
    }
}

/** alerts 列表 fixStatus → i18n 文案 */
export const alertsFixStatusLabel = (status: string, t: Translator): string => ({
    success: t('common.fixStatus.success'),
    failed: t('common.fixStatus.failed'),
    skipped: t('common.fixStatus.skipped'),
    converged: t('common.fixStatus.converged'),
})[status] ?? t('common.fixStatus.pending')

/**
 * alerts 列表"状态"列文案（todo.md §M20.6）：
 * - 优先级 superseded > success：fixStatus=success 仍显示"已修复"，不受 supersededAt 影响
 *   （todo.md §M20.3 决策 1：success 永不被 supersede，所以 success 行 supersededAt 必然为 NULL；但 UI 防御性判断）
 * - fixStatus≠success + supersededAt 非空 → "已关闭"（上游已消失，本地未修复）
 * - 其他走原 fixStatus 文案
 */
export const alertsStatusLabel = (alert: { fixStatus: string, supersededAt?: string | null }, t: Translator): string => {
    if (alert.fixStatus === 'success') {
        return t('common.fixStatus.success')
    }
    if (alert.supersededAt) {
        return t('common.superseded')
    }
    return alertsFixStatusLabel(alert.fixStatus, t)
}

/** alerts 视图模式（todo.md §C65-D3）：按包 / 按项目 / 原始列表 */
export type AlertsViewMode = 'package' | 'repository' | 'none'

/**
 * alerts 筛选器（与 alerts.vue `filters` ref 形状对齐；不含 viewMode，viewMode 独立）。
 *
 * includeSuperseded（M20.6 todo.md §M20.6）：
 * - false（默认）：后端 result.supersededAt IS NULL 过滤，仅显示活跃告警
 * - true：返回全量（含已 superseded 上游已消失的告警），用于"显示已解决"开关
 * - 替代旧 todo.md §M13.2 §T1306 的 dedupe 跨次去重 UI（per-alert 模型下 ScanResult 已天然 deduped，
 *   occurrenceCount 字段直接来自 ScanResult，无需应用层 fingerprint 聚合）
 */
export interface AlertsFilters {
    repositoryId: string
    severity: string
    source: string
    includeSuperseded: boolean
}

/**
 * 按 viewMode + filters 构造 /api/alerts query（todo.md §M16.4）。
 *
 * 抽取动机：alerts.vue 迁移到 useAsyncData 后，watch 自动触发 refetch 时 handler
 * 需要无副作用地派生 query；纯函数 utility 便于单测覆盖 viewMode + filters 各组合，
 * 避免在 .vue 文件内嵌实现导致 viewMode 无效值（后端 zod safeParse 静默 fallback）、
 * includeSuperseded 漏加 / repositoryId='all' 误传 等 case 漏测。
 *
 * 行为契约：
 * - viewMode='none' 不传 groupBy（后端等价于原始顺序）
 * - 'package' / 'repository' 携带 groupBy 让后端预排序以满足 PrimeVue rowGroup subheader 要求
 * - filters 中 == 'all' 的字段不携带（与现有 fetchAlerts 行为一致；后端空字符串视为全量）
 * - filters.includeSuperseded=true 携带 includeSuperseded=true（后端默认 false 时已过滤 superseded）
 */
export const buildAlertsQuery = (viewMode: AlertsViewMode, filters: AlertsFilters): Record<string, string> => {
    const query: Record<string, string> = viewMode === 'none' ? {} : { groupBy: viewMode }
    if (filters.repositoryId !== 'all') {
        query.repositoryId = filters.repositoryId
    }
    if (filters.severity !== 'all') {
        query.severity = filters.severity
    }
    if (filters.source !== 'all') {
        query.source = filters.source
    }
    if (filters.includeSuperseded) {
        query.includeSuperseded = 'true'
    }
    return query
}
