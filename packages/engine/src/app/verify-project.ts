// verify-project.ts — 修复后验证（`verifyProject`）与修复前基线采样（`sampleVerificationBaseline`）。
//
// 从 `app/helpers.ts` 拆出：验证链的命令解析、基线采样与「逐命令归因」属同一职责单元，
// 拆分时 helpers.ts 已因本模块代码超出 max-lines 上限。
//
// 归因口径（既有失败基线判定）：修复前在 pristine 工作区采样一次基线；修复后仍失败、且
// **同一命令**在基线下也失败 → 标记 `preExisting`（既有失败，不归因本次改动）；
// 基线中缺失的命令保守归因本次（未知不算既有）。详见 docs/design/modules/dependency-fixer.md。
import { toErrorMessage, type FixAction } from '@dependfix/core'
import { logNetworkAudit, redactUrlForReport } from '../runners/network-audit'
import {
    DEFAULT_VERIFY_COMMANDS,
    formatVerificationError,
    runVerification,
    type CommandResult,
    type VerificationResult,
} from '../runners/verification-runner'
import { validateVerifyCommands } from '../verification/validate-commands'
import type { AppContext } from './helpers'

/**
 * 解析本次运行要执行的验证命令：默认命令链（含工具链版本绑定）或用户自定义命令，
 * 并对默认链做 `package.json#scripts` 存在性校验（跳过不存在的脚本命令）。
 *
 * 抽取理由：修复前基线采样与修复后验证**必须**用同一套命令解析与跳过口径，
 * 否则两侧命令集漂移会让「既有失败」的归因失真。
 *
 * @param recordSkips 是否把跳过的命令写入 `allErrors`（修复后验证记录一次即可；基线采样只记日志，避免报告重复）
 */
function resolveVerifyCommands(
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'>,
    repo: string,
    options: { recordSkips: boolean },
): string[] {
    const { config, customCommands, logger, workDir, allErrors } = ctx

    // 确定要执行的命令：用户自定义 > 默认命令链
    let rawCommands = customCommands ?? DEFAULT_VERIFY_COMMANDS

    // 默认命令链的 install 与策略命令同版本（显式 toolchainPnpmVersion 时）
    // 避免系统裸 pnpm 版本架空 PIN_TOOLCHAIN（旧版 pnpm 可能无法处理新版 lockfile）
    if (!customCommands && config.toolchainPnpmVersion) {
        rawCommands = rawCommands.map((cmd) => (
            cmd === 'pnpm install --frozen-lockfile'
                ? `corepack pnpm@${config.toolchainPnpmVersion} install --frozen-lockfile`
                : cmd
        ))
    }

    // 仅对默认命令链做脚本存在性校验
    const isDefault = !customCommands
    const { valid, skipped } = isDefault
        ? validateVerifyCommands(rawCommands, workDir)
        : { valid: rawCommands, skipped: [] as string[] }

    // 记录被跳过的命令
    for (const cmd of skipped) {
        logger.info(`Skipping command "${cmd}": script not found in package.json`)
        if (options.recordSkips) {
            allErrors.push({
                repository: repo,
                target: cmd,
                stage: 'verify',
                category: 'SCRIPT_NOT_FOUND',
                message: `Skipped: no matching script in package.json for "${cmd}"`,
            })
        }
    }

    return valid
}

/**
 * 修复前（pristine 工作区）采样验证基线：用与修复后验证相同的命令口径跑一次验证链，
 * 返回逐命令结果，供 `verifyProject` 区分「本次改动引入的失败」与「目标仓库本就存在的失败」。
 *
 * 背景：`pnpm test` 纳入默认链后，目标仓库测试长期为红时，该失败会计入本次修复
 * 并触发交付回滚（合法修复被回滚、仓库进一步「不可用」）。基线判定把这类**修复前即红**
 * 的命令从「本次引入」中剔除（不归因、不据此回滚；报告单列 `PRE_EXISTING_FAILURE`）。
 *
 * 约定：
 * - **只测量**：失败与网络违规只记日志（warn），不写 `allErrors`（避免把既有状态渲染成本次运行的问题）
 * - `runVerification` 遇首个失败即停 → 基线可能只覆盖到失败命令为止；调用方对
 *   「基线中缺失的命令」**不适用豁免**（保守归因：未知不算既有）
 * - 采样异常（无 package.json / spawn 失败等）返回 `undefined`，调用方退回原始口径（全量归因）
 */
export async function sampleVerificationBaseline(
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'>,
    repo: string,
): Promise<CommandResult[] | undefined> {
    const { logger, workDir } = ctx
    const commands = resolveVerifyCommands(ctx, repo, { recordSkips: false })
    if (commands.length === 0) {
        return []
    }

    logger.info(`[baseline] Sampling pre-fix verification baseline for ${repo} (${commands.join(' → ')})`)
    try {
        const result = await runVerification({ workDir, commands })
        // 基线同样走 deny-by-default 外联审计代理：拦截记录必须留痕（只 warn、不入报告错误区），
        // 否则既有状态下的越权外联会成为审计盲区
        for (const violation of result.networkViolations ?? []) {
            logger.warn(
                `[baseline] outbound blocked by allowlist (not attributed to this change): ${violation.method} ${redactUrlForReport(violation.target)}`,
            )
        }
        for (const cr of result.commandResults) {
            if (cr.exitCode !== 0) {
                logger.warn(
                    `[baseline] "${cr.command}" already failing before this run (${cr.timedOut ? 'timed out' : `exit code ${cr.exitCode}`}) — failures of this command will not be attributed to this change`,
                )
            }
        }
        return result.commandResults
    } catch (error: unknown) {
        logger.warn(`[baseline] Sampling failed: ${toErrorMessage(error)} — existing-failure attribution disabled for this run`)
        return undefined
    }
}

/** `verifyProject` 可选参数：修复前基线（`sampleVerificationBaseline` 产物）。 */
export interface VerifyProjectOptions {
    /**
     * 提供时：修复后仍失败、且**同一命令**在基线下也失败 → 标记 `preExisting`
     * （不归因本次改动，门禁不据此回滚；报告记 `PRE_EXISTING_FAILURE`）。
     */
    baseline?: CommandResult[]
}

export async function verifyProject(
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'>,
    repo: string,
    options: VerifyProjectOptions = {},
): Promise<FixAction[]> {
    const { logger, workDir, allErrors } = ctx

    const valid = resolveVerifyCommands(ctx, repo, { recordSkips: true })

    if (valid.length === 0) {
        logger.info(`No verification commands to run for ${repo}`)
        return []
    }

    // 修复前即失败的命令集合（命令级基线：只豁免「同命令在基线中也失败」的失败）
    const baselineFailedCommands = new Set(
        (options.baseline ?? []).filter((cr) => cr.exitCode !== 0).map((cr) => cr.command),
    )

    try {
        const result: VerificationResult = await runVerification({
            workDir,
            commands: valid,
        })

        // 执行期网络外联审计（备查：恶意脚本外联事故溯源；总数 info、明细 debug）
        logNetworkAudit(logger, repo, result.networkAudit ?? [])

        // 非白名单外联违规 → 报告 error 区（verify 阶段，deny-by-default 拦截证据；逐条记录保证可审计）
        // target 经 redactUrlForReport 最小化为 host[:port]——恶意 URL 的 path/query 可能携带
        // 外带凭据，拦截后不得原样回显进报告/日志（防御纵深，最小暴露）
        for (const violation of result.networkViolations ?? []) {
            const redacted = redactUrlForReport(violation.target)
            allErrors.push({
                repository: repo,
                target: redacted,
                stage: 'verify',
                category: 'network_violation',
                message: `outbound blocked by allowlist: ${violation.method} ${redacted}`,
            })
            logger.error(`[network-audit] ${repo}: outbound blocked (network_violation): ${violation.method} ${redacted}`)
        }

        return result.commandResults.map((cr) => {
            // 失败时附 stdout/stderr 摘要（已脱敏截断）供日志/报告定位失败原因（run 31552922137 教训：仅 "exit code 1" 无法定位）
            const failed = cr.exitCode !== 0
            const error = failed ? formatVerificationError(cr) : undefined
            const preExisting = failed && baselineFailedCommands.has(cr.command)
            if (preExisting) {
                // 既有失败：不归因本次改动（门禁不据此回滚），但必须显式记录，避免"静默放过"
                logger.warn(
                    `Verification failed for ${repo}: ${cr.command} — pre-existing failure (already failing before this run), not attributed to this change`,
                )
                allErrors.push({
                    repository: repo,
                    target: cr.command,
                    stage: 'verify',
                    category: 'PRE_EXISTING_FAILURE',
                    message: `Pre-existing failure (already failing before this run; not caused by this change): ${cr.command} — ${error}`,
                })
            } else if (failed) {
                logger.error(`Verification failed for ${repo}: ${cr.command} — ${error}`)
            }
            return {
                type: 'verification' as const,
                repository: repo,
                target: cr.command,
                success: !failed,
                error,
                ...(preExisting ? { preExisting: true } : {}),
                durationMs: cr.durationMs,
            }
        })
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        logger.error(`Verification error for ${repo}: ${message}`)
        return [{
            type: 'verification',
            repository: repo,
            target: 'verification',
            success: false,
            error: message,
        }]
    }
}
