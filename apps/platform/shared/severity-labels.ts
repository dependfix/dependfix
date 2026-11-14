/**
 * 严重级别展示标签（前端页面 / 服务端通知与报告共用的单一事实源）。
 *
 * 为什么放在 `shared/`：`apps/platform` 的 App 与 Nitro server 两侧都要渲染同一批级别文案，
 * 各写一份映射会出现「页面显示 High、邮件显示 high」这类漂移。Nuxt 4 的 `shared/` 目录
 * 同时被两侧打包，故在此收敛。
 *
 * 口径：
 * - 扫描严重级别（critical / high / medium / low / unknown）是专有名词，不走 i18n；
 * - 未命中（历史数据 / 新枚举）**原样返回**，避免展示层抛错或显示空白。
 */

/** 扫描严重级别 → 展示标签（顺序即列表展示顺序） */
export const SCAN_SEVERITY_LABELS = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    unknown: 'Unknown',
} as const

/** 扫描严重级别取值（展示顺序） */
export const SCAN_SEVERITY_VALUES = ['critical', 'high', 'medium', 'low', 'unknown'] as const

/** 扫描严重级别展示标签（未命中回退原值） */
export const severityLabel = (value: string): string =>
    (SCAN_SEVERITY_LABELS as Record<string, string>)[value] ?? value
