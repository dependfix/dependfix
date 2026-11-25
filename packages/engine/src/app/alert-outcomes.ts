// alert-outcomes.ts：告警级修复结果的 run 级收集器。
//
// 修复链路只在「无法从 actions 反推」的判定点写入（收敛 / 跨 major 跳过 / 清单分区跳过），
// 其余状态由 core 的 `buildAlertOutcomes` 依据 actions 与告警属性推导——避免每个失败分支
// 都重复记录，也避免明细与 summary 计数各写一套。契约见
// docs/design/modules/data-model.md（告警级修复结果回写）。

import {
    addSkipped,
    alertOutcomeKey,
    notFixableReason,
    type AlertFixOutcome,
    type Logger,
    type NormalizedSecurityAlert,
    type RunSummary,
    type SkipReason,
} from '@dependfix/core'

/** 可写入告警结果的上下文面（AppContext 的结构兼容子集）。 */
export interface AlertOutcomeSink {
    /**
     * run 级告警结果收集器。缺省 ⇒ 只按 actions 推导（不含收敛 / 跳过等显式判定）。
     * 键为 `alertOutcomeKey`，同键后写覆盖先写（同一告警在一次运行内只应有一个结论）。
     */
    alertOutcomes?: Map<string, AlertFixOutcome>
    logger?: Logger
}

/**
 * 写入单条告警的处置结果。
 *
 * 缺 `upstreamId` 的告警无法与平台 `ScanResult` 对齐（唯一索引依赖它），只 warn 不写入。
 */
function record(
    sink: AlertOutcomeSink,
    alert: NormalizedSecurityAlert,
    status: AlertFixOutcome['status'],
    reason?: string,
): void {
    const outcomeSink = sink.alertOutcomes
    if (!outcomeSink) {
        return
    }
    if (!alert.upstreamId) {
        sink.logger?.warn(
            `[alert-outcome] ${alert.repository}: ${alert.packageName} has no upstreamId — result not recorded`,
        )
        return
    }
    outcomeSink.set(alertOutcomeKey(alert), {
        repository: alert.repository,
        source: alert.source,
        upstreamId: alert.upstreamId,
        manifestPath: alert.manifestPath,
        status,
        reason,
    })
}

/**
 * 记录「已收敛」告警。
 *
 * 调用方必须用**同一数组**同时累加 `RunSummary.alertsConverged` 与调用本函数，
 * 才能保证明细与计数逐条对齐（平台据此剔除「未修复」明细）。
 */
export function recordConvergedAlerts(
    sink: AlertOutcomeSink,
    alerts: readonly NormalizedSecurityAlert[],
    reason: string,
): void {
    for (const alert of alerts) {
        record(sink, alert, 'converged', reason)
    }
}

/** 记录「主动跳过」告警；原因取 `SKIP_REASONS` 标识，便于消费方按原因聚合。 */
export function recordSkippedAlerts(
    sink: AlertOutcomeSink,
    alerts: readonly NormalizedSecurityAlert[],
    reason: SkipReason,
): void {
    for (const alert of alerts) {
        record(sink, alert, 'skipped', reason)
    }
}

/** 计数 + 明细双重写入所需的最小上下文面。 */
export type NotFixableAlertSink = AlertOutcomeSink & {
    summary: Pick<RunSummary, 'alertsSkipped' | 'alertsSkippedByReason'>
}

/**
 * 计数并记录不可自动修复残差。
 *
 * GitHub Dependabot 的 `first_patched_version=null` 单独归 `no-patch`（建议人工 dismiss），
 * 其余保持 `not-fixable`；两组互斥，总数与按原因分组同源更新。
 * `fixable=true` 但缺推荐版本（等上游）只计数不落明细，保持 `not-tried`。
 */
export function recordNotFixableAlerts(
    sink: NotFixableAlertSink,
    alerts: readonly NormalizedSecurityAlert[],
): void {
    const isNoPatch = (alert: NormalizedSecurityAlert) => notFixableReason(alert) === 'no-patch'
    const noPatchAlerts = alerts.filter(isNoPatch)
    const otherAlerts = alerts.filter((alert) => !isNoPatch(alert))
    addSkipped(sink.summary, 'no-patch', noPatchAlerts.length)
    addSkipped(sink.summary, 'not-fixable', otherAlerts.length)
    recordSkippedAlerts(sink, noPatchAlerts, 'no-patch')
    recordSkippedAlerts(sink, otherAlerts.filter((alert) => !alert.fixable), 'not-fixable')
}
