import type { ComponentTone } from 'caomei-ui'
import type { PRCheckConclusion } from '#server/entities/pr-check'

/**
 * PR Check 结论 → caomei Tag tone 映射。
 *
 * 视觉策略：
 * - failure / timed_out / action_required → danger（红色，对应 alerts 危险视觉）
 * - success → success（绿色）
 * - pending → warning（黄色，CI 在跑未结论）
 * - 其他（neutral / cancelled / stale / skipped）→ primary（蓝色，中性档）
 *
 * 调用方：apps/platform/app/pages/pr-checks.vue 的结论列（`CaomeiTag` 行渲染）。
 * 复用性：本函数对 PRCheck entity 状态机的可视化无依赖；与 alerts 的 Tag 视觉策略一致
 * （同为「状态语义 → tone」分离，但不复用 alerts 的 Tag utility）。
 *
 * 与 alerts 行渲染共享 Tag tone 风格，但不合并两者的 utility 函数：
 * alerts 工具函数依赖 ScanResult severity（critical/high/medium），与 PRCheck conclusion
 * 语义不同（GitHub check conclusion 与 security severity 解耦）。
 */
export const conclusionTagTone = (conclusion: PRCheckConclusion): ComponentTone => {
    if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'action_required') {
        return 'danger'
    }
    if (conclusion === 'success') {
        return 'success'
    }
    if (conclusion === 'pending') {
        return 'warning'
    }
    return 'primary'
}
