// cross-major.ts — 跨 major / 混合实例 / 仅传递依赖的纯读判定（单一谓词）。
//
// 从 `repo-fix.ts` 抽出：基线采样前置判定（「本仓库是否有可写工作」）与修复链内的跳过归因
// 必须用**同一套谓词**，否则「前置判无工作」与「链路实际跳过」会漂移（预算与归因双口径）。
//
// 三类形态（与跳过原因一一对应）：
// - `cross-major`：无实例落在目标 major 线（需人工跨大版本）
// - `mixed-instance`：最高实例已达标，但仍有低于目标且**仍在 advisory 受影响区间**的实例
// - `transitive-only`：`allowMajorUpgrade` 已开，但告警不是根直接依赖（自动跨 major 不适用）
import { join } from 'node:path'
import { addSkipped, type NormalizedSecurityAlert, type RunSummary } from '@dependfix/core'
import { compareSemver, isCrossMajorFixRequired, readLockfileVersions } from '../fixers/dependency'
import { parseMajorVersion } from '../fixers/dependency/semver'
import { isVersionAffected } from '../fixers/dependency/vulnerable-range'
import { isRootDirectDependency } from '../helpers'
import { recordSkippedAlerts, type AlertOutcomeSink } from './alert-outcomes'

/** 跨 major 判定上下文（纯读：workDir 只用于读取 manifest / lockfile）。 */
export interface CrossMajorContext {
    workDir: string
    lockfilePath: string
    allowMajorUpgrade: boolean
}

/**
 * 自动跨 major 是否适用（与既有准入一致，**不放宽**）：开关开 + 根直接依赖 + 单实例。
 *
 * 三条件缺一即回落到人工判定（`isManualCrossMajorAlert`）。
 */
export function isAutoMajorEligible(alert: NormalizedSecurityAlert, ctx: CrossMajorContext): boolean {
    return ctx.allowMajorUpgrade
        && isRootDirectDependency(ctx.workDir, alert.packageName)
        && readLockfileVersions(ctx.lockfilePath, alert.packageName).length === 1
}

/**
 * 仅传递依赖形态：开关已开、告警**本身是传递依赖** → 自动跨 major 不适用，按人工处理。
 *
 * 依赖关系优先用告警自带的 `dependencyType`（dependabot `relationship`）：workspace 成员的
 * 直接依赖不是传递依赖，标成 `transitive-only` 会让报告口径失真；数据源不提供时回退
 * 「非根直接依赖」判定（pnpm-audit 无该字段）。
 */
export function isTransitiveOnlyCrossMajor(alert: NormalizedSecurityAlert, ctx: CrossMajorContext): boolean {
    if (!ctx.allowMajorUpgrade) {
        return false
    }
    if (alert.dependencyType !== undefined) {
        return alert.dependencyType === 'transitive'
    }
    return !isRootDirectDependency(ctx.workDir, alert.packageName)
}

/**
 * 需要人工跨 major 的告警（链路与基线前置共用）。
 *
 * 判定顺序：先看「是否需要跨 major」，再看「自动准入是否适用」——自动准入只对根直接依赖
 * 单实例成立，其余一律人工。
 */
export function isManualCrossMajorAlert(alert: NormalizedSecurityAlert, ctx: CrossMajorContext): boolean {
    return isCrossMajorFixRequired(ctx.lockfilePath, alert)
        && !isAutoMajorEligible(alert, ctx)
}

export { isVersionAffected } from '../fixers/dependency/vulnerable-range'

/**
 * 低于目标的实例分类（供 group 路径的跳过归因）。
 *
 * - `all-affected`：全部低于目标的实例仍受影响 → `cross-major`（人工跨大版本）
 * - `mixed`：部分受影响、部分已不在区间 → `mixed-instance`
 * - `none-affected`：全部已不在区间 → 视为已收敛（无需写盘）
 */
export function classifyBelowTargetInstances(
    alerts: NormalizedSecurityAlert | NormalizedSecurityAlert[],
    belowTargetVersions: string[],
): 'all-affected' | 'mixed' | 'none-affected' {
    if (belowTargetVersions.length === 0) {
        return 'none-affected'
    }
    // 同包多条 advisory 取**并集**（任一区间命中即受影响）：代表告警的窄区间不得把仍受影响的实例判成收敛
    const list = Array.isArray(alerts) ? alerts : [alerts]
    const affected = belowTargetVersions.filter((version) => list.some((alert) => isVersionAffected(version, alert.vulnerableRange)))
    if (affected.length === 0) {
        return 'none-affected'
    }
    return affected.length === belowTargetVersions.length ? 'all-affected' : 'mixed'
}

/**
 * 混合实例是否存在可写工作：低于目标的实例所在大版本线**另有目标**时，版本化 override 会写盘。
 *
 * 单条 advisory（target 只有一个 major）时低 major 线没有目标 → 不写盘（group 路径按
 * `mixed-instance` / `cross-major` 跳过）；同包多 advisory 覆盖低 major 时才可能写。
 */
export function hasWritableOverrideWork(
    alerts: NormalizedSecurityAlert[],
    versions: string[],
): boolean {
    const targetMajors = new Set(
        alerts
            .map((alert) => alert.recommendedVersion)
            .filter((target): target is string => Boolean(target))
            .map((target) => String(parseMajorVersion(target))),
    )
    return versions.some((version) => targetMajors.has(String(parseMajorVersion(version))))
}

/**
 * 混合实例是否无需写盘：**最高实例已达标**、仍有低于目标的实例，且这些实例不会被版本化
 * override 覆盖（所在大版本线无目标）——无论它们是否仍在受影响区间（受影响 → group 路径按
 * `mixed-instance` / `cross-major` 跳过；不受影响 → 计 `alertsConverged`）。
 *
 * 基线前置据此判「本仓库没有可写的 lockfile 工作」，避免为一条只会在链路里跳过的混合实例
 * 付完整基线。**前提**：最高实例已达标——否则链路会走常规升级写盘，不得判「无工作」。
 */
export function isNonWritableMixedInstance(
    alert: NormalizedSecurityAlert,
    packageAlerts: NormalizedSecurityAlert[],
    ctx: CrossMajorContext,
): boolean {
    const target = alert.recommendedVersion
    // 路径级补丁（dependencyPath）会独立写盘，不能按「实例已不在区间」判无工作
    if (!target || alert.dependencyPath?.length || isCrossMajorFixRequired(ctx.lockfilePath, alert)) {
        return false
    }
    const versions = readLockfileVersions(ctx.lockfilePath, alert.packageName)
    if (versions.length === 0) {
        return false
    }
    // 注：不单独判「最高实例 >= 目标」——非跨 major 意味着存在实例落在目标 major 线；
    // 该实例若低于目标就会进入 belowTarget，而 `hasWritableOverrideWork` 对「目标 major 线
    // 在版本集合内」必然为真，因此「最高未达标」的形态由它兜住（等价，不留死代码）。
    const belowTarget = versions.filter((version) => compareSemver(version, target) < 0)
    if (belowTarget.length === 0) {
        // 全部达标：属既有「已收敛」分支，不算混合实例
        return false
    }
    return !hasWritableOverrideWork(packageAlerts, belowTarget)
}

/**
 * 记录人工跨 major 的跳过归因：开关开但仅传递依赖 → `transitive-only`，其余 → `cross-major`。
 *
 * 与基线前置同一谓词（`isTransitiveOnlyCrossMajor`），避免两处判定漂移。
 */
export function recordManualCrossMajorSkips(
    target: AlertOutcomeSink & { summary: RunSummary },
    alerts: NormalizedSecurityAlert[],
    ctx: CrossMajorContext,
): void {
    const transitiveOnly = alerts.filter((alert) => isTransitiveOnlyCrossMajor(alert, ctx))
    const transitiveIds = new Set(transitiveOnly.map((alert) => alert.id))
    const crossMajorAlerts = alerts.filter((alert) => !transitiveIds.has(alert.id))
    const groups = [['cross-major', crossMajorAlerts], ['transitive-only', transitiveOnly]] as const
    for (const [reason, group] of groups) {
        if (group.length > 0) {
            addSkipped(target.summary, reason, group.length)
            recordSkippedAlerts(target, group, reason)
        }
    }
}

/** 基线前置判定结果：lockfile 告警中是否存在可写工作。 */
export interface LockfileWorkAssessment {
    /** 需要人工跨 major 的告警（含仅传递依赖形态） */
    manual: NormalizedSecurityAlert[]
    /** 不产生写盘的混合实例（最高已达标且低 major 线无目标；链路里按 converged / skip 归因） */
    convergedMixed: NormalizedSecurityAlert[]
    /** 全部 lockfile 告警都无需写盘 → 不必付修复前基线 */
    noWritableWork: boolean
}

/** 基线前置：用与修复链同一谓词判定「本仓库是否有可写的 lockfile 工作」。 */
export function assessLockfileWork(
    lockfileAlerts: NormalizedSecurityAlert[],
    ctx: CrossMajorContext,
): LockfileWorkAssessment {
    const manual = lockfileAlerts.filter((alert) => isManualCrossMajorAlert(alert, ctx))
    const convergedMixed = lockfileAlerts.filter((alert) => isNonWritableMixedInstance(
        alert,
        lockfileAlerts.filter((candidate) => candidate.packageName === alert.packageName),
        ctx,
    ))
    return {
        manual,
        convergedMixed,
        noWritableWork: lockfileAlerts.length > 0 && manual.length + convergedMixed.length === lockfileAlerts.length,
    }
}

/** 组装跨 major 判定上下文（repo-fix 前置与链路共用）。 */
export function createCrossMajorContext(
    ctx: { workDir: string, config: { allowMajorUpgrade?: boolean } },
): CrossMajorContext {
    return {
        workDir: ctx.workDir,
        lockfilePath: join(ctx.workDir, 'pnpm-lock.yaml'),
        allowMajorUpgrade: ctx.config.allowMajorUpgrade === true,
    }
}
