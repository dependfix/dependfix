// peer-only-outcome.ts — peer-only「需人工」处置的单一写入点。
//
// 触发面：overrides 无法覆盖 peer-only 实例、且回退到「提升 manifest 直接依赖」也不可用或未覆盖时。
// 口径：记跳过（`peer-only`）而非失败动作——这类形态当前无法自动修复，计入 `alertsFailed` 会污染
// 出口码与交付判断；同时落一条 `noOp` 动作携带判据（已检查文件 + 建议版本），使报告 / 运行详情
// 能与「已提升」的成功动作区分（三态：已提升 / 需人工 / 跳过）。
//
// 与 alert-outcomes.ts 的分工：那里只写告警级结果（不做动作构造）；本模块负责 peer-only 的
// 「计数 + 告警级结果 + 动作 + 日志」组合，避免同一语义散落在各编排分支里。

import {
    addSkipped,
    type FixAction,
    type NormalizedSecurityAlert,
    type RunSummary,
} from '@dependfix/core'
import { recordSkippedAlerts, type AlertOutcomeSink } from './alert-outcomes'

/** 写入所需上下文面（结构兼容 AppContext 子集）。 */
export interface PeerOnlyManualReviewSink extends AlertOutcomeSink {
    summary: RunSummary
    allActions: FixAction[]
}

/**
 * 记录 peer-only 需人工处置。
 *
 * @param sink - 运行上下文（summary / actions / logger / 告警结果）
 * @param action - 该包的 dependency-upgrade 动作（失败态；本函数会以 `success + noOp` 落列）
 * @param alerts - 该包的全部告警（跳过按告警级计数）
 * @param detail - 判据文本（含已检查文件与建议版本），同时进动作 `error` 与日志
 */
export function recordPeerOnlyManualReview(
    sink: PeerOnlyManualReviewSink,
    action: FixAction,
    alerts: readonly NormalizedSecurityAlert[],
    detail?: string,
): void {
    addSkipped(sink.summary, 'peer-only', alerts.length)
    recordSkippedAlerts(sink, alerts, 'peer-only')
    sink.logger?.warn(`[peer-only] ${action.target}: ${detail ?? 'manual review required'}`)
    sink.allActions.push({ ...action, success: true, noOp: true })
}
