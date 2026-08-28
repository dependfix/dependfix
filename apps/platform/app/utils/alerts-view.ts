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

/** alerts 视图模式（todo.md §C65-D3）：按包 / 按项目 / 原始列表 */
export type AlertsViewMode = 'package' | 'repository' | 'none'

/** alerts 筛选器（与 alerts.vue `filters` ref 形状对齐；不含 viewMode，viewMode 独立） */
export interface AlertsFilters {
    repositoryId: string
    severity: string
    source: string
    dedupe: 'off' | 'across'
}

/**
 * 按 viewMode + filters 构造 /api/alerts query（todo.md §M16.4）。
 *
 * 抽取动机：alerts.vue 迁移到 useAsyncData 后，watch 自动触发 refetch 时 handler
 * 需要无副作用地派生 query；纯函数 utility 便于单测覆盖 viewMode + filters 各组合，
 * 避免在 .vue 文件内嵌实现导致 viewMode 无效值（后端 zod safeParse 静默 fallback）、
 * dedupe='across' 漏加 / repositoryId='all' 误传 等 case 漏测。
 *
 * 行为契约：
 * - viewMode='none' 不传 groupBy（后端等价于原始顺序）
 * - 'package' / 'repository' 携带 groupBy 让后端预排序以满足 PrimeVue rowGroup subheader 要求
 * - filters 中 == 'all' 的字段不携带（与现有 fetchAlerts 行为一致；后端空字符串视为全量）
 * - dedupe='across' 携带 dedupe=true 触发后端跨次扫描去重聚合（todo.md §T1306）
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
    if (filters.dedupe === 'across') {
        query.dedupe = 'true'
    }
    return query
}
