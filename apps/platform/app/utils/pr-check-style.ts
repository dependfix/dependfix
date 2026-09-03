import type { PRCheckConclusion } from '#server/entities/pr-check'

/**
 * PR Check 结论 → PrimeVue Tag severity 映射（详见 docs/plan/todo.md §M24.1 Phase 4）。
 *
 * 视觉策略：
 * - failure / timed_out / action_required → danger（红色，对应 alerts 危险视觉）
 * - success → success（绿色）
 * - pending → warn（黄色，CI 在跑未结论）
 * - 其他（neutral / cancelled / stale / skipped）→ info（蓝色）
 *
 * 调用方：apps/platform/app/pages/pr-checks.vue 的 PrimeVue Tag 组件（行模板）。
 * 复用性：本函数对 PRCheck entity 状态机的可视化无依赖；与 ScanResult alerts 视觉策略
 * 一致（alerts.vue L96-113 alertsSeverityTagSeverity 同款语义分离）。
 *
 * 与 alerts-rowgroup 共享 PrimeVue Tag severity 风格，但不复用 alerts 的 Tag utility：
 * alerts 工具函数依赖 ScanResult severity（critical/high/medium），与 PRCheck conclusion
 * 语义不同（GitHub check conclusion 与 security severity 解耦）。
 */
export const conclusionTagSeverity = (conclusion: PRCheckConclusion): TagSeverity => {
    if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
        return 'danger'
    }
    if (conclusion === 'success') {
        return 'success'
    }
    if (conclusion === 'pending') {
        return 'warn'
    }
    return 'info'
}

/** PrimeVue Tag severity 字面量类型（避免子组件 props string 类型与 PrimeVue 类型不匹配） */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast'
