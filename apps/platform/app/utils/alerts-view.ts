import type { ComponentTone } from 'caomei-ui'
import { SEVERITY_RANK } from './sort-helpers'

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

/**
 * 「按包」组排序键的 rank 步长（见 `summarizePackageGroups`）。
 * 取远大于包数量的常量，使 rank 数值主导顺序、包名序号仅在同 rank 内区分，并保证组键组间唯一。
 */
const PACKAGE_GROUP_STRIDE = 1_000_000

/** 单个包的聚合信息（按包分组模式：组排序 + 组头展示）。 */
export interface PackageGroupSummary {
    /** 组内最高 severity 的 rank（`SEVERITY_RANK` 口径） */
    rank: number
    /** 组内最高 severity 取值（组头 Tag 展示） */
    severity: string
    /**
     * 组排序键：`rank × PACKAGE_GROUP_STRIDE − 包名升序序号`。
     *
     * 「严重级别」列在按包分组模式下以它作排序取值：`desc` 即「最高级别降序 → 包名升序」（默认契约）；
     * 键组间唯一 → 任何次排序键只在组内生效，同包行不会被拆散（「一个包一组」硬不变量）。
     */
    sortKey: number
}

/**
 * 按包聚合「最高 severity」与组排序键（alerts「按包」分组的排序依据）。
 *
 * 抽取动机：caomei 的相邻行分组靠稳定排序维持同组相邻，而分组字段列已从 `columns` 剔除
 * （TanStack 只对列模型内的列排序，分组字段排序键会被静默丢弃），无法直接以 `packageName` 排序 →
 * 改为让「严重级别」列返回组排序键，把排序单位从「行」变成「组」。纯函数便于单测覆盖组键的排序与唯一性。
 */
export const summarizePackageGroups = (
    rows: readonly { packageName: string, severity: string }[],
): Map<string, PackageGroupSummary> => {
    const ranks = new Map<string, { rank: number, severity: string }>()
    for (const row of rows) {
        const rank = SEVERITY_RANK[row.severity] ?? 0
        const current = ranks.get(row.packageName)
        if (!current || rank > current.rank) {
            ranks.set(row.packageName, { rank, severity: row.severity })
        }
    }
    const summary = new Map<string, PackageGroupSummary>()
    // 包名升序序号参与 sortKey（保证组键组间唯一），并决定同级别组之间的默认展示顺序
    const names = [...ranks.keys()].sort()
    names.forEach((name, index) => {
        const entry = ranks.get(name)
        if (!entry) {
            return
        }
        summary.set(name, { ...entry, sortKey: entry.rank * PACKAGE_GROUP_STRIDE - index })
    })
    return summary
}
