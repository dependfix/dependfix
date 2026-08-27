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
