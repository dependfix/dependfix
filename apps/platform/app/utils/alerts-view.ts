import type { ComponentTone } from 'caomei-ui'

type Translator = (key: string, params?: Record<string, string | number>) => string

/**
 * alerts 视图 Tag 颜色 + 文案工具。
 *
 * 历史：alerts.vue 内联实现导致文件 > 800 行 lint 警告（file too long）；
 * 抽到独立 util 与 run-view.ts 抽取模式一致 —— utility 在多处复用前先抽出，
 * 单调用方 utility 由 audit suggest 触发（避免过早抽象）。
 */

/**
 * alerts 列表 severity Tag 颜色（critical / high / medium / 其他）。
 * 返回 caomei-ui 的 tone（Tag 语义色）。
 */
export const alertsSeverityTone = (severity: string): ComponentTone => {
    switch (severity) {
        case 'critical':
            return 'danger'
        case 'high':
            return 'warning'
        case 'medium':
            return 'primary'
        default:
            return 'neutral'
    }
}

/**
 * alerts 列表 ruleId Tag 颜色（按 source 区分）：实测反馈 alerts UI 看不到 GHSA/CVE/rule 关键标识，
 * source 不同 → 不同 tone 区分；ruleId 字段混用（GHSA / CVE / advisory URL / CodeQL rule id / Code Quality finding id）。
 */
export const alertsRuleIdTone = (source: string): ComponentTone => {
    switch (source) {
        case 'dependabot':
            return 'success'
        case 'pnpm-audit':
            return 'warning'
        case 'code-scanning':
            return 'primary'
        case 'code-quality':
            return 'neutral'
        default:
            return 'neutral'
    }
}

/** dedupe 详情侧栏 RunDetailView status → Tag tone 映射 */
export const alertsRunStatusTone = (status: string): ComponentTone => {
    switch (status) {
        case 'completed':
            return 'success'
        case 'failed':
            return 'danger'
        case 'dispatched':
            return 'primary'
        default:
            return 'warning'
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
 * alerts 列表"状态"列文案：
 * - 优先级 superseded > success：fixStatus=success 仍显示"已修复"，不受 supersededAt 影响
 *   （success 永不被 supersede，所以 success 行 supersededAt 必然为 NULL；但 UI 防御性判断）
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

/** alerts 视图模式：按包 / 按项目 / 原始列表 */
export type AlertsViewMode = 'package' | 'repository' | 'none'

/**
 * alerts 筛选器（与 alerts.vue `filters` ref 形状对齐；不含 viewMode，viewMode 独立）。
 *
 * includeSuperseded：
 * - false（默认）：后端 result.supersededAt IS NULL 过滤，仅显示活跃告警
 * - true：返回全量（含已 superseded 上游已消失的告警），用于"显示已解决"开关
 * - 替代旧的 dedupe 跨次去重 UI（per-alert 模型下 ScanResult 已天然 deduped，
 *   occurrenceCount 字段直接来自 ScanResult，无需应用层 fingerprint 聚合）
 */
export interface AlertsFilters {
    repositoryId: string
    severity: string
    source: string
    includeSuperseded: boolean
}

/**
 * 按 viewMode + filters 构造 /api/alerts query。
 *
 * 抽取动机：alerts.vue 迁移到 useAsyncData 后，watch 自动触发 refetch 时 handler
 * 需要无副作用地派生 query；纯函数 utility 便于单测覆盖 viewMode + filters 各组合，
 * 避免在 .vue 文件内嵌实现导致 viewMode 无效值（后端 zod safeParse 静默 fallback）、
 * includeSuperseded 漏加 / repositoryId='all' 误传 等 case 漏测。
 *
 * 行为契约：
 * - viewMode='none' 不传 groupBy（后端等价于原始顺序）
 * - 'package' / 'repository' 携带 groupBy 让后端预排序以满足表格 rowGroup subheader 要求
 * - filters 中 == 'all' 的字段不携带（与既有行为一致；后端空字符串视为全量）
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
