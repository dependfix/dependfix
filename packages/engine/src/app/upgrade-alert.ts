// upgrade-alert.ts — 单个告警的升级执行（常规分组 / 拆组逐包共用）。
//
// 自 helpers.ts 拆出：文件行数治理（max-lines 800）。行为与拆分前一致：
// 家族锁步优先 → 直接升级 → 间接依赖回退 pnpm overrides（含保护名单与审计口径）。
import { addSkipped, toErrorMessage, type FixAction, type NormalizedSecurityAlert } from '@dependfix/core'
import {
    overrideTransitiveDependency,
    upgradeDependency,
    type DependencyFixResult,
} from '../fixers/dependency'
import { attemptFamilyUpgrade } from './family-upgrade'
import { recordSkippedAlerts } from './alert-outcomes'
import { markEnvironmentalInstallFailure } from './environmental-failure'
import type { AppContext } from './helpers'
import { handleOverrideProtection } from './override-protect'

/**
 * `upgradeAlert` 可选行为。
 */
export interface UpgradeAlertOptions {
    /**
     * 同批告警的目标版本（包名 → 推荐版本）。
     * 显式 `upgradeGroups` / 组内告警给出的目标优先于家族规则解析结果。
     */
    familyTargets?: Readonly<Record<string, string>>
}

/**
 * 升级单个告警对应的依赖（dry-run 仅记录）。
 * 优先家族锁步（同生态成员同版本线），其次直接升级，失败且为间接依赖时回退到 pnpm overrides。
 */
export async function upgradeAlert(
    ctx: Pick<AppContext, 'config' | 'logger' | 'workDir' | 'allErrors' | 'summary'>,
    alert: NormalizedSecurityAlert,
    options: UpgradeAlertOptions = {},
): Promise<FixAction> {
    const { config, logger, workDir } = ctx
    const startMs = Date.now()

    if (config.dryRun) {
        logger.info(`[dry-run] Would upgrade ${alert.packageName} to ${alert.recommendedVersion}`)
        return {
            type: 'dependency-upgrade',
            repository: alert.repository,
            target: alert.packageName,
            fromVersion: alert.recommendedVersion ? `< ${alert.recommendedVersion}` : undefined,
            toVersion: alert.recommendedVersion,
            isMajor: false,
            success: true,
            durationMs: 0,
        }
    }

    // 家族锁步优先：同生态成员必须同一条版本线（vitest + @vitest/coverage-v8 等）。
    // 不属家族 / 只有触发包可写时返回 not-applicable，继续既有单包路径。
    // 整个调用放在 try 内：写盘 / 解析的意外异常必须收敛为单告警失败，不能冒泡成整仓失败。
    let familyPhase = false
    try {
        familyPhase = true
        const familyAttempt = await attemptFamilyUpgrade(ctx, {
            alert,
            alertTargets: options.familyTargets,
        })
        familyPhase = false
        if (familyAttempt.action) {
            return familyAttempt.action
        }

        // 优先尝试直接升级，失败自动回退到 overrides（处理间接依赖）
        let result: DependencyFixResult = await upgradeDependency({
            packageName: alert.packageName,
            targetVersion: alert.recommendedVersion,
            workDir,
        })
        let strategy: 'override' | undefined

        if (!result.success && result.error?.includes('not found in dependencies')) {
            // 间接依赖 — 通过 pnpm overrides 升级
            // 先查 overrides 保护名单（repo policy）：命中则不写盘并记审计
            // （防历史上被人工移除的破坏性 override 复发，实证 PR #1095）
            const protectedAction = handleOverrideProtection(ctx, {
                overrideProtect: config.overrideProtect,
                repository: alert.repository,
                packageName: alert.packageName,
                toVersion: alert.recommendedVersion,
                scope: 'override',
            })
            if (protectedAction) {
                recordSkippedAlerts(ctx, [alert], 'override-protected')
                return protectedAction
            }
            strategy = 'override'
            result = await overrideTransitiveDependency({
                packageName: alert.packageName,
                targetVersion: alert.recommendedVersion,
                workDir,
            })
            logger.info(
                result.success
                    ? `Upgraded ${result.packageName}: ${result.fromVersion} → ${result.toVersion} (pnpm overrides)`
                    : `Failed to upgrade ${result.packageName}: ${result.error}`,
            )
        } else {
            logger.info(
                result.success
                    ? `Upgraded ${result.packageName}: ${result.fromVersion} → ${result.toVersion}`
                    : `Failed to upgrade ${result.packageName}: ${result.error}`,
            )
        }

        if (result.success && result.warning) {
            logger.warn(`[upgrade] ${result.packageName}: ${result.warning}`)
        }

        if (!result.success && result.manualReview) {
            // peer-only 等不可自动修复形态：记跳过而非失败动作（与版本化 overrides 路径同口径），
            // 否则常规单包 override 链路会把「无法自动修复」计入 alertsFailed。
            addSkipped(ctx.summary, 'peer-only', 1)
            recordSkippedAlerts(ctx, [alert], 'peer-only')
            logger.warn(`[upgrade] ${result.packageName}: ${result.error ?? 'manual review required'}`)
            return {
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: result.fromVersion,
                toVersion: result.toVersion,
                isMajor: result.isMajor,
                strategy,
                success: true,
                noOp: true,
                error: result.error,
                durationMs: Date.now() - startMs,
            }
        }

        // 环境性安装失败不归因目标仓库：记审计条目 + 动作标记，调用方不得计入失败（见记录 §12.16）
        const environmentalMark = !result.success && result.environmental === true
            ? markEnvironmentalInstallFailure(ctx, { scope: 'upgrade', repository: alert.repository, target: alert.packageName, error: result.error })
            : {}

        return {
            type: 'dependency-upgrade',
            repository: alert.repository,
            target: alert.packageName,
            fromVersion: result.fromVersion,
            toVersion: result.toVersion,
            isMajor: result.isMajor,
            strategy,
            success: result.success,
            error: result.error,
            durationMs: Date.now() - startMs,
            ...environmentalMark,
        }
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        if (familyPhase) {
            const errorText = `FAMILY_LOCKSTEP_FAILED: unexpected family lockstep error: ${message}`
            logger.error(`Family lockstep error for ${alert.packageName}: ${message}`)
            ctx.allErrors.push({
                repository: alert.repository,
                target: alert.packageName,
                stage: 'fix',
                category: 'FAMILY_LOCKSTEP_FAILED',
                message: errorText,
            })
            return {
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                toVersion: alert.recommendedVersion,
                isMajor: false,
                strategy: 'family-lockstep',
                success: false,
                error: errorText,
                durationMs: Date.now() - startMs,
            }
        }
        logger.error(`Upgrade error for ${alert.packageName}: ${message}`)
        return {
            type: 'dependency-upgrade',
            repository: alert.repository,
            target: alert.packageName,
            toVersion: alert.recommendedVersion,
            success: false,
            error: message,
            durationMs: Date.now() - startMs,
        }
    }
}
