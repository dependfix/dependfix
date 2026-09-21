// override-protect.ts
// overrides 保护名单命中的统一处理（两处 override 路径共用，避免重复与行数膨胀）：
// 判定命中 → 记审计（`OVERRIDE_PROTECTED`）+ 返回 noOp 动作（不计 fixed/failed）；
// 未命中返回 null（调用方继续正常写入路径）。
// 设计见 docs/design/governance/override-protect-policy.md。

import type { FixAction, FixError, Logger } from '@dependfix/core'
import { matchesOverrideProtect } from '../github/repo-policy'

interface OverrideProtectCtx {
    logger: Logger
    allErrors: FixError[]
    summary: { alertsSkipped: number }
}

interface OverrideProtectParams {
    /** 保护名单（来自 config.overrideProtect） */
    overrideProtect?: Record<string, string[]>
    repository: string
    packageName: string
    toVersion?: string
    /** 命中来源路径（写入报告便于区分） */
    scope: 'override' | 'versioned-override'
}

/**
 * 判定 overrides 保护名单；命中则记审计并返回 noOp 动作，未命中返回 null。
 *
 * 命中语义：**不写盘**（调用方须据此跳过 override 写入），且**不计入 fixed/failed**
 * （`noOp: true`，与既有 noOp 口径一致）；判定依据经 `allErrors`（`OVERRIDE_PROTECTED`）
 * 进入报告 Errors 区。
 */
export function handleOverrideProtection(
    ctx: OverrideProtectCtx,
    params: OverrideProtectParams,
): FixAction | null {
    const { protected: isProtected, matchedPattern } = matchesOverrideProtect(
        { overrideProtect: params.overrideProtect },
        params.repository,
        params.packageName,
    )
    if (!isProtected) {
        return null
    }

    const reason = `${params.scope} skipped: "${params.packageName}" is protected by repo policy pattern "${matchedPattern}"`
    ctx.logger.warn(`[override-protect] ${params.repository}: ${reason}`)
    ctx.allErrors.push({
        repository: params.repository,
        target: params.packageName,
        stage: 'fix',
        category: 'OVERRIDE_PROTECTED',
        message: reason,
    })
    ctx.summary.alertsSkipped++
    return {
        type: 'dependency-upgrade',
        repository: params.repository,
        target: params.packageName,
        toVersion: params.toVersion,
        isMajor: false,
        strategy: 'override-protected',
        success: true,
        noOp: true,
        error: reason,
        durationMs: 0,
    }
}
