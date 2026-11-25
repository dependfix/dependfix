// alert-outcomes.ts：告警级修复结果（`RunResult.alertOutcomes`）的契约与推导。
//
// 引擎在修复链路的判定点记录显式结果（收敛 / 跳过），其余状态由 actions 与告警属性推导。
// 平台按同一键回写 `ScanResult.fixStatus`，口径见 docs/design/modules/data-model.md。

import type { AlertSource, NormalizedSecurityAlert } from '../alerts'
import { isAlertFixedByActions, type FixAction } from './types'

/** 平台 `ScanResult.fixStatus` 的完整取值域（含 `not-tried`）。 */
export const ALERT_FIX_STATUSES = ['success', 'converged', 'failed', 'skipped', 'not-tried'] as const

export type AlertFixStatus = (typeof ALERT_FIX_STATUSES)[number]

/**
 * 报告中可携带的**结论**状态（不含 `not-tried`）。
 *
 * 缺键即 `not-tried`，显式回退到它没有语义；落库侧据此做白名单校验：报告来自 JSON
 * （外部输入），未知值一旦写库会落在「未修复」集合之外，静默退出通知明细。
 */
export const ALERT_OUTCOME_STATUSES = ['success', 'converged', 'failed', 'skipped'] as const

export type AlertOutcomeStatus = (typeof ALERT_OUTCOME_STATUSES)[number]

/** 运行时白名单校验：只接受四种结论状态。 */
export function isAlertOutcomeStatus(value: unknown): value is AlertOutcomeStatus {
    return typeof value === 'string' && (ALERT_OUTCOME_STATUSES as readonly string[]).includes(value)
}

/**
 * 单条告警在本次运行中的处置结果。
 *
 * 匹配键为 `(repository, source, upstreamId, manifestPath)`（见 {@link alertOutcomeKey}）：
 * `repository` 必需——`upstreamId` 是 per-repo 标识（`dependabot:42` 在两个仓库都会出现），
 * 单次运行可处理多仓；`manifestPath` 消歧同号位的多清单实例。
 * 报告中只列出**有结论**的告警（`not-tried` 不落条目，缺键即按 `not-tried` 处理）。
 */
export interface AlertFixOutcome {
    /** 告警所属仓库（`owner/repo` 或 `local`） */
    repository: string
    /** 告警来源 */
    source: AlertSource
    upstreamId: string
    manifestPath?: string | null
    status: AlertOutcomeStatus
    /** 失败原因（动作 error）或跳过原因（SKIP_REASONS 标识） */
    reason?: string
}

/** 匹配键的组成部分。 */
export interface AlertOutcomeKeyParts {
    repository: string
    source: AlertSource
    upstreamId: string
    manifestPath?: string | null
}

/**
 * 构造告警级结果的匹配键。
 *
 * 引擎产出与平台回写共用同一实现，避免两侧键算法漂移（分隔符用 `\u0000`，
 * 不会与仓库名 / 包名 / 路径中的可见字符冲突）。
 */
export function alertOutcomeKey(parts: AlertOutcomeKeyParts): string {
    return [parts.repository, parts.source, parts.upstreamId, parts.manifestPath ?? ''].join('\u0000')
}

/**
 * noOp 动作的策略 → 告警级跳过原因映射。
 *
 * 这两类跳过由修复链路以 `noOp` 动作表达（不写盘、不计 fixed/failed），
 * 因此可从 actions 反推，无需在调用点重复记录。
 */
const SKIP_ACTION_REASONS: Record<string, string> = {
    'override-protected': 'override-protected',
    'repeated-failure': 'repeated-failure',
}

/**
 * 找同告警的失败动作（仅依赖升级 / Code Scanning 模板修复，与 `computeSummary` 的计数类别一致）。
 *
 * 排除 `environmentalFailure`（环境性安装失败，不归因目标仓库）、`preExisting`（既有失败）与
 * AI 辅助动作（告警结果由主动作代表），避免把「未归因本次运行」的失败写成告警失败。
 * 依赖升级动作没有清单维度（`FixAction` 无 `manifestPath`），故失败归因为**包级**；
 * Code Quality findings 不进入修复链路，一律不归因（`packageName` 为规则标题，可能与依赖包同名）。
 */
function findFailedAction(alert: NormalizedSecurityAlert, actions: readonly FixAction[]): FixAction | undefined {
    if (alert.source === 'code-quality') {
        return undefined
    }
    return actions.find((action) => {
        if (action.success || action.noOp || action.environmentalFailure || action.preExisting) {
            return false
        }
        if (action.strategy === 'ai-patch' || action.strategy === 'ai-suggestion') {
            return false
        }
        if (action.repository !== alert.repository) {
            return false
        }
        if (action.type === 'dependency-upgrade') {
            return action.target === alert.packageName
        }
        if (action.type === 'code-scanning-fix') {
            return action.target === alert.ruleId && (action.filePath ?? '') === alert.manifestPath
        }
        return false
    })
}

/** 找同告警的跳过动作（override 保护 / 同告警尝试上限），返回跳过原因。 */
function findSkipReason(alert: NormalizedSecurityAlert, actions: readonly FixAction[]): string | undefined {
    if (alert.source === 'code-quality') {
        return undefined
    }
    for (const action of actions) {
        if (!action.noOp || !action.strategy || action.repository !== alert.repository) {
            continue
        }
        const reason = SKIP_ACTION_REASONS[action.strategy]
        if (reason && action.type === 'dependency-upgrade' && action.target === alert.packageName) {
            return reason
        }
    }
    return undefined
}

/**
 * `fixable === false` 告警的跳过归因。
 *
 * GitHub Dependabot 的 `first_patched_version=null` 表示**上游暂无补丁版本**（只能等发布或人工 dismiss），
 * 与 pnpm-audit / Code Scanning 的「不可自动修复」形态不同：前者不是配置或能力缺口，长期停留会让
 * 跳过清单无法区分「等上游」与「做不到」。仅在 `source === 'dependabot'` 且无推荐版本时归为 `no-patch`，
 * 其余保持 `not-fixable`（含 Code Scanning 模板不可用与 pnpm-audit 源）。
 */
export function notFixableReason(
    alert: Pick<NormalizedSecurityAlert, 'source' | 'fixable' | 'recommendedVersion'>,
): 'no-patch' | 'not-fixable' {
    if (alert.source === 'dependabot' && !alert.fixable && !alert.recommendedVersion) {
        return 'no-patch'
    }
    return 'not-fixable'
}

/**
 * 判断 Code Scanning 修复是否「模板已应用且文件无改动」（本就合规）。
 *
 * `success + noOp` 在引擎里有 6 类来源：**只有 compliant 分支不带 `error`**（并带 `diff`），
 * 其余五类（无文件路径 / 越界路径 / 无模板 / 读不到文件 / 模板不适用）都是 `skip(reason)`，
 * `error` 承载原因。若把带 `error` 的 `noOp` 也判为已收敛，会把「无法处理」写成
 * `converged` 并让该 finding 退出「未修复」明细（fail-open），故此处必须要求无 `error`。
 */
function isAlreadyCompliant(alert: NormalizedSecurityAlert, actions: readonly FixAction[]): boolean {
    if (alert.source !== 'code-scanning') {
        return false
    }
    return actions.some((action) => (
        action.type === 'code-scanning-fix'
        && action.success
        && action.noOp === true
        && !action.error
        && action.repository === alert.repository
        && action.target === alert.ruleId
        && (action.filePath ?? '') === alert.manifestPath
    ))
}

/**
 * 汇总本次运行的告警级结果。
 *
 * 判定优先级（高 → 低）：
 * 1. 引擎显式记录（修复链路对该**实例**的权威判定：收敛 / 跨 major / 清单分区 / 不可修复）
 * 2. `isAlertFixedByActions` → `success`
 * 3. Code Scanning `noOp` 且无 `error`（模板已应用、文件无改动）→ `converged`
 * 4. 同告警失败动作 → `failed`
 * 5. noOp 跳过动作（override 保护 / 尝试上限）→ `skipped`
 * 6. `fixable === false` → `skipped`（Dependabot 无补丁版本为 `no-patch`，其余为 `not-fixable`）
 * 7. 其余不落条目（视为 `not-tried`）
 *
 * 显式记录优先于派生 `success` 的理由：依赖升级的成功谓词是**包级**（同包任一清单升级到达标即命中），
 * 会把「同包另一清单已被主动跳过（子目录清单 / 跨 major）」的实例误判为已修复——方向是 fail-open
 * （少报未修复），故显式判定优先。收敛计数与收敛明细由同一数组同时写出，故逐条对齐。
 *
 * 缺 `upstreamId` 的告警（理论上不会发生：引擎抓取侧必注入）不落条目——平台侧同样无法为其回写。
 *
 * @param alerts 本次运行的全部告警（`RunResult.alerts`）
 * @param actions 本次运行的全部动作（`RunResult.actions`）
 * @param explicit 引擎显式记录（键为 {@link alertOutcomeKey}）；缺省 = 仅按 actions 推导
 */
export function buildAlertOutcomes(
    alerts: readonly NormalizedSecurityAlert[],
    actions: readonly FixAction[],
    explicit?: ReadonlyMap<string, AlertFixOutcome>,
): AlertFixOutcome[] {
    const outcomes: AlertFixOutcome[] = []
    for (const alert of alerts) {
        const upstreamId = alert.upstreamId
        if (!upstreamId) {
            continue
        }
        const base = {
            repository: alert.repository,
            source: alert.source,
            upstreamId,
            manifestPath: alert.manifestPath,
        }
        const recorded = explicit?.get(alertOutcomeKey(alert))
        if (recorded) {
            outcomes.push({ ...base, status: recorded.status, reason: recorded.reason })
            continue
        }
        if (isAlertFixedByActions(alert, actions)) {
            outcomes.push({ ...base, status: 'success' })
            continue
        }
        if (isAlreadyCompliant(alert, actions)) {
            outcomes.push({ ...base, status: 'converged', reason: 'no change needed' })
            continue
        }
        const failed = findFailedAction(alert, actions)
        if (failed) {
            outcomes.push({ ...base, status: 'failed', reason: failed.error })
            continue
        }
        const skipReason = findSkipReason(alert, actions)
        if (skipReason) {
            outcomes.push({ ...base, status: 'skipped', reason: skipReason })
            continue
        }
        if (!alert.fixable) {
            outcomes.push({ ...base, status: 'skipped', reason: notFixableReason(alert) })
        }
    }
    return outcomes
}
