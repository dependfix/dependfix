// lockfile-repair-action.ts — pnpm-lock.yaml 修复动作的日志与审计接线。
//
// 从 app/helpers.ts 迁出（该文件接近 max-lines 上限）：只负责把 `repairLockfile` 的结果
// 翻译成 `FixAction` + 可判读日志，并接入「基线已判安装失败」的 known-broken 不变式。
import { toErrorMessage, type FixAction } from '@dependfix/core'
import { repairLockfile, type LockfileRepairResult } from '../fixers/pnpm'
import type { CommandResult } from '../runners/verification-runner'
import type { AppContext } from './helpers'

/** 尝试修复 pnpm-lock.yaml（dry-run 仅记录）。 */
export async function tryLockfileRepair(
    ctx: Pick<AppContext, 'config' | 'logger' | 'workDir' | 'allErrors'>,
    repo: string,
    options: {
        /**
         * 修复前基线里失败的安装命令（`findInstallBaselineFailure` 产物）。
         *
         * 提供时把「基线已判安装失败」作为已知损坏证据传给修复器：禁止走「已合规」捷径，
         * 结构兜底失败则以 `PRECONDITION_FAILED` 上报（不再输出 `Lockfile already compliant`）。
         */
        installBaselineFailure?: CommandResult
    } = {},
): Promise<FixAction> {
    const { config, logger, workDir, allErrors } = ctx
    const startMs = Date.now()

    if (config.dryRun) {
        logger.info(`[dry-run] Would attempt lockfile repair for ${repo}`)
        return {
            type: 'lockfile-repair',
            repository: repo,
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        }
    }

    try {
        const result: LockfileRepairResult = await repairLockfile({
            workDir,
            // 未配置 toolchainPnpmVersion 时省略（缺省从 packageManager 解析）
            ...(config.toolchainPnpmVersion ? { toolchain: { pnpmVersion: config.toolchainPnpmVersion } } : {}),
            ...(options.installBaselineFailure
                ? {
                    knownBrokenLockfile: {
                        command: options.installBaselineFailure.command,
                        detail: options.installBaselineFailure.stderr || options.installBaselineFailure.stdout,
                    },
                }
                : {}),
        })

        // 「已合规」与「修复生效」必须区分：旧文案对两者都输出 repaired，
        // 用户读成「修好了但没提交」（口径见 docs/design/modules/dependency-fixer-records.md §12.15）。
        const noChange = result.success && result.changed === false
        const baselineFailed = options.installBaselineFailure !== undefined
        let logMessage: string
        if (!result.success) {
            const detail = result.failureDetail ?? 'unknown'
            logMessage = baselineFailed && result.failureCategory === 'PRECONDITION_FAILED'
                ? `Lockfile repair precondition failed for ${repo}: ${detail}`
                : `Lockfile repair failed for ${repo}: ${detail}`
        } else if (noChange && baselineFailed) {
            // 基线已判失败、本次结构重建后内容未变但冻结安装通过：只报告「复检通过」，
            // 不宣称「已合规」（基线证据与合规结论互斥）。
            logMessage = `Lockfile recheck passed for ${repo} after baseline install failure `
                + `(${options.installBaselineFailure?.command ?? 'install'}) — content unchanged`
        } else if (noChange) {
            logMessage = `Lockfile already compliant for ${repo} — no repair needed`
        } else if (result.changed === true) {
            logMessage = `Lockfile repair applied for ${repo} (strategy: ${result.strategy ?? 'N/A'})`
        } else {
            // changed 缺省（类型可选）：不把「可能改动」说成「已修复」
            logMessage = `Lockfile repair completed for ${repo} (change status unknown)`
        }
        logger.info(logMessage)

        // 格式漂移检测：lockfileVersion 变化时 diff 摘要附加标注（wisdom: pnpm v11 迁移教训）
        let diffSummary = result.diff?.summary
        if (result.lockfileVersionChanged && diffSummary) {
            diffSummary = `${diffSummary} (lockfileVersion changed)`
        }

        // 环境性安装失败（诊断步无 stderr 诊断）：无法归因目标仓库——记非归因审计条目
        // （`ENVIRONMENT_ERROR` 进 SKIPPED_AUDIT_CATEGORIES），并在 action 上标记，
        // 使 computeExitCode 不计入失败动作（与既有失败基线同族口径）。
        const environmentalFailure = !result.success && result.environmental === true
        if (environmentalFailure) {
            allErrors.push({
                repository: repo,
                target: 'pnpm-lock.yaml',
                stage: 'repair',
                category: 'ENVIRONMENT_ERROR',
                message: result.failureDetail ?? 'environmental install failure',
            })
        }

        return {
            type: 'lockfile-repair',
            repository: repo,
            target: 'pnpm-lock.yaml',
            success: result.success,
            error: result.success ? undefined : (result.failureDetail ?? 'Lockfile repair failed'),
            strategy: result.strategy,
            durationMs: Date.now() - startMs,
            diff: diffSummary,
            // 结构损坏修复产物必须可判读「是否真正改写锁文件」——`success + changed`
            // 与 `success + noOp`（复检通过 / 已合规）分开表达。
            ...(result.changed !== undefined ? { changed: result.changed } : {}),
            ...(noChange ? { noOp: true } : {}),
            ...(environmentalFailure ? { environmentalFailure: true } : {}),
        }
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        logger.error(`Lockfile repair error for ${repo}: ${message}`)
        return {
            type: 'lockfile-repair',
            repository: repo,
            target: 'pnpm-lock.yaml',
            success: false,
            error: message,
            durationMs: Date.now() - startMs,
        }
    }
}
