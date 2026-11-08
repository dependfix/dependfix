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

/**
 * 结论筛选可选项（client 侧常量）。
 *
 * 不直接 import 服务端实体枚举：`#server/entities/pr-check` 带 TypeORM 装饰器，进客户端 bundle 会拖入
 * 服务端依赖；此处以 `readonly PRCheckConclusion[]` 锁类型，并由 `pr-check-style.test.ts` 与服务端
 * `PR_CHECK_CONCLUSIONS` 逐值核对，防止两处漂移。
 */
export const PR_CHECK_CONCLUSION_VALUES: readonly PRCheckConclusion[] = [
    'success',
    'failure',
    'neutral',
    'cancelled',
    'timed_out',
    'action_required',
    'stale',
    'pending',
    'skipped',
] as const

/**
 * PR 生命周期 → caomei Tag tone。
 *
 * 视觉策略：`open` → success（仍在推进）；`merged` → primary（已完成，非告警）；`closed` / `unknown` → neutral。
 * 与 Alert 列（danger / neutral / success）分列呈现，避免生命周期色与告警态混淆。
 */
export const prStateTagTone = (state: string): ComponentTone => {
    switch (state) {
        case 'open':
            return 'success'
        case 'merged':
            return 'primary'
        case 'closed':
        case 'unknown':
            return 'neutral'
        default:
            return 'neutral'
    }
}

/** 归因标签的 i18n key 集合（switch 返回字面量键，避免拼接；键存在性由单测对照两份 locale 校验）。 */
export type CheckAttributionI18nKey =
    | 'prChecks.signalAttribution.selfCaused'
    | 'prChecks.signalAttribution.preExisting'
    | 'prChecks.signalAttribution.externalNoise'
    | 'prChecks.signalAttribution.cancelled'
    | 'prChecks.signalAttribution.unknown'

/** check 失败归因 → i18n 文案键（未知取值回退 `unknown`，与分类兜底同口径）。 */
export const checkAttributionI18nKey = (attribution: string | undefined): CheckAttributionI18nKey => {
    switch (attribution) {
        case 'self_caused':
            return 'prChecks.signalAttribution.selfCaused'
        case 'pre_existing':
            return 'prChecks.signalAttribution.preExisting'
        case 'external_noise':
            return 'prChecks.signalAttribution.externalNoise'
        case 'cancelled':
            return 'prChecks.signalAttribution.cancelled'
        default:
            return 'prChecks.signalAttribution.unknown'
    }
}

/**
 * 是否展示归因标签：仅「有归因且非成功 / 非进行中」的信号展示。
 *
 * 成功 / 进行中信号不产出归因（服务端守卫），这里再兜一层历史 `signalsJson` 与未来字段变化；
 * `skipped`（cancelled）仍展示——它是解释「为什么没跑」的有效信息。
 */
export const shouldShowAttribution = (signal: { attribution?: string, state: string }): boolean =>
    Boolean(signal.attribution) && signal.state !== 'success' && signal.state !== 'pending'

/**
 * check 失败归因 → caomei Tag tone。
 *
 * 视觉策略：`self_caused`（本次改动导致）最危险 → danger；`pre_existing` / `unknown` 需人工确认 →
 * warning；`external_noise` / `cancelled` 属解释性信息 → neutral。
 * 归因只做解释、不改变告警与合并放行（见 pr-build-deploy-signals.md §3.9）。
 */
export const checkAttributionTone = (attribution: string | undefined): ComponentTone => {
    switch (attribution) {
        case 'self_caused':
            return 'danger'
        case 'pre_existing':
        case 'unknown':
            return 'warning'
        default:
            return 'neutral'
    }
}
