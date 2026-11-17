// baseline-skip.ts — 修复前基线采样被短路的原因（命令级）。
//
// 从 `types.ts` 拆出：`types.ts` 已贴 max-lines 上限，而本组词汇表与终验跳过原因族
// （`VERIFICATION_SKIP_REASONS`）语义不同，独立成文件更利于「两者不可混用」的可读性。
//
// 与 `VerificationSkipReason` 刻意区分：后者表示「终验未执行」；本原因表示终验照常执行，
// 但基线链在安装命令失败处停止——后续命令**没有基线读数**。
//
// 语义边界：未采样 ≠ 通过，也不等于「已确认既有失败」。这些命令既不能作为豁免依据，
// 也不得在报告 / 平台详情里渲染成验证通过。
// 口径见 docs/design/modules/dependency-fixer-records.md §12.9「基线短路」条。

export const BASELINE_SKIP_REASONS = ['install-baseline-failed'] as const

export type BaselineSkipReason = (typeof BASELINE_SKIP_REASONS)[number]

/** 当前唯一的短路原因（生产方引用该常量，避免与词表漂移）。 */
export const INSTALL_BASELINE_FAILED_REASON: BaselineSkipReason = 'install-baseline-failed'

/** 基线链被短路的单条命令（`reason` 说明为何没有采样）。 */
export interface BaselineSkippedCommand {
    command: string
    reason: BaselineSkipReason
}

/** 基线短路原因文案表（穷举，新增原因时编译失败提醒补文案）。 */
const BASELINE_SKIP_REASON_TEXT: Record<BaselineSkipReason, string> = {
    'install-baseline-failed': 'not sampled (the install command already fails before this run)',
}

/** 基线短路原因的人类可读文案（报告 / 日志）。 */
export const formatBaselineSkipReason = (reason: BaselineSkipReason): string =>
    BASELINE_SKIP_REASON_TEXT[reason]
