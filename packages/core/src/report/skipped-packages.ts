// skipped-packages.ts：按「包」聚合被拦截（skipped）的告警，供日志与报告共用同一汇总口径。
//
// 运行级结论过去只说「本次无写入」，读者无法判断是「确无工作」还是「12 条告警全被拦下」。
// 这里把 `alertOutcomes` 里同一包的 skipped 条目收敛成一行（条数 + 最高目标版本 + 原因集合），
// 与 `summary.alertsSkippedByReason` 的按原因计数互补，不替代它。

import type { NormalizedSecurityAlert } from '../alerts'
import { alertOutcomeKey, type AlertFixOutcome } from './alert-outcomes'
import { compareVersions, SKIP_REASONS } from './types'

/** 单个包的拦截汇总（同仓同包多条告警收敛为一行）。 */
export interface SkippedPackageSummaryRow {
    repository: string
    packageName: string
    /** 被拦截的告警条数 */
    count: number
    /** 同包内的最高目标版本（无法比较时取首个非空值）；无版本信息时缺省 */
    highestTarget?: string
    /** 去重后的拦截原因（与报告 `SKIP_REASONS` 同域，如 `cross-major` / `peer-only`） */
    reasons: string[]
}

interface Accumulator {
    repository: string
    packageName: string
    count: number
    highestTarget?: string
    reasons: Set<string>
}

/**
 * 按包聚合被拦截的告警。
 *
 * - 只统计显式记录为 `skipped` 的告警结果（`alertOutcomes`）；成功 / 收敛 / 失败不进入本汇总。
 * - 同一 `(repository, packageName)` 的多条告警合并：`count` 累加，`highestTarget` 取可比较版本的最大值，
 *   `reasons` 去重后按 `SKIP_REASONS` 顺序输出，未知原因排在末尾。
 * - 缺少 `upstreamId` 的告警不会出现在 `alertOutcomes` 中（与 {@link alertOutcomeKey} 同键），故一并跳过。
 *
 * 返回顺序：仓库名升序 → 条数降序 → 包名升序，保证报告与日志输出稳定可 diff。
 */
export function summarizeSkippedByPackage(
    alerts: readonly NormalizedSecurityAlert[],
    outcomes: readonly AlertFixOutcome[] | undefined,
): SkippedPackageSummaryRow[] {
    if (!outcomes || outcomes.length === 0) {
        return []
    }
    const skipped = new Map<string, AlertFixOutcome>()
    for (const outcome of outcomes) {
        if (outcome.status === 'skipped') {
            skipped.set(alertOutcomeKey(outcome), outcome)
        }
    }
    if (skipped.size === 0) {
        return []
    }

    const groups = new Map<string, Accumulator>()
    for (const alert of alerts) {
        if (!alert.upstreamId) {
            continue
        }
        const outcome = skipped.get(alertOutcomeKey(alert))
        if (!outcome) {
            continue
        }
        const groupKey = `${alert.repository}\u0000${alert.packageName}`
        let group = groups.get(groupKey)
        if (!group) {
            group = {
                repository: alert.repository,
                packageName: alert.packageName,
                count: 0,
                reasons: new Set<string>(),
                ...(alert.recommendedVersion ? { highestTarget: alert.recommendedVersion } : {}),
            }
            groups.set(groupKey, group)
        }
        group.count += 1
        if (alert.recommendedVersion) {
            group.highestTarget = pickHigherVersion(group.highestTarget, alert.recommendedVersion)
        }
        if (outcome.reason) {
            group.reasons.add(outcome.reason)
        }
    }

    return [...groups.values()]
        .map((group) => ({
            repository: group.repository,
            packageName: group.packageName,
            count: group.count,
            ...(group.highestTarget ? { highestTarget: group.highestTarget } : {}),
            reasons: sortReasons([...group.reasons]),
        }))
        .sort((left, right) => (
            left.repository.localeCompare(right.repository)
            || right.count - left.count
            || left.packageName.localeCompare(right.packageName)
        ))
}

/** 取更高版本；任一侧不可比较时保留已有值（避免把非 semver 目标版本互相比较）。 */
function pickHigherVersion(current: string | undefined, candidate: string): string {
    if (!current) {
        return candidate
    }
    try {
        return compareVersions(candidate, current) > 0 ? candidate : current
    } catch {
        return current
    }
}

/** 原因排序：已知原因按 `SKIP_REASONS` 顺序，未知原因按字典序排在末尾。 */
function sortReasons(reasons: string[]): string[] {
    const known = SKIP_REASONS as readonly string[]
    return reasons.sort((left, right) => {
        const leftIndex = known.indexOf(left)
        const rightIndex = known.indexOf(right)
        if (leftIndex !== -1 && rightIndex !== -1) {
            return leftIndex - rightIndex
        }
        if (leftIndex !== -1) {
            return -1
        }
        if (rightIndex !== -1) {
            return 1
        }
        return left.localeCompare(right)
    })
}
