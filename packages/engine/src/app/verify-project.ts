// verify-project.ts — 修复后验证（`verifyProject`）与修复前基线采样（`sampleVerificationBaseline`）。
//
// 从 `app/helpers.ts` 拆出：验证链的命令解析、基线采样与「逐命令归因」属同一职责单元，
// 拆分时 helpers.ts 已因本模块代码超出 max-lines 上限。
//
// 归因口径（既有失败基线判定）：修复前在 pristine 工作区**按需**采样基线（首个有工作的仓库处采样；
// 零告警仓库不采样，改由 `noChanges` 选项做等价豁免）；修复后仍失败、且**同一命令**在基线下也失败
// → 标记 `preExisting`（既有失败，不归因本次改动）；基线中缺失的命令保守归因本次（未知不算既有）。
// 详见 docs/design/modules/dependency-fixer-records.md §12.9。
import {
    toErrorMessage,
    type CiAlignmentRecord,
    type CiMirrorSkipped,
    type FixAction,
    type VerificationCommandSource,
} from '@dependfix/core'
import type { Octokit } from '@octokit/rest'
import { buildCiAlignmentRecord, planCiMirrorCommands } from '../github/ci-alignment'
import { logNetworkAudit, redactUrlForReport } from '../runners/network-audit'
import {
    DEFAULT_VERIFY_COMMANDS,
    formatVerificationError,
    runVerification,
    type CommandResult,
    type VerificationResult,
} from '../runners/verification-runner'
import { validateVerifyCommands } from '../verification/validate-commands'
import { isInstallCommand } from './delivery'
import { budgetAllows, MIN_STEP_BUDGET_MS, remainingBudgetMs } from './budget'
import type { AppContext } from './helpers'

/**
 * 本次运行的验证命令计划。
 *
 * `sources` 与 `commands` 一一对应（同一条命令只可能有一个来源），供报告逐条标注；
 * `mirror` 仅在 `--mirror-ci-scripts` 开启且未配置自定义链时存在。
 */
interface ResolvedVerifyPlan {
    commands: string[]
    sources: Map<string, VerificationCommandSource>
    mirror?: {
        /** 计划执行（规范化后）的命令；实际执行集由调用方按已 spawn 的结果过滤 */
        planned: string[]
        skipped: CiMirrorSkipped[]
    }
}

/** 日志中的外部可控文本（YAML 解析原因等）单行夹取，避免多行片段污染日志。 */
function clipLogText(text: string, maxLength = 200): string {
    const safe = text.replace(/\s+/g, ' ').trim()
    return safe.length <= maxLength ? safe : `${safe.slice(0, maxLength - 1)}…`
}

/**
 * 解析本次运行要执行的验证命令：默认命令链（含工具链版本绑定）或用户自定义命令，
 * 并对默认链做 `package.json#scripts` 存在性校验（跳过不存在的脚本命令）。
 *
 * `--mirror-ci-scripts` 开启时，在默认链**之后**追加目标仓库 CI 独有的脚本（≤3 条）。
 * 自定义链（`--commands` / Action `commands` / 平台 `verifyCommands`）整链替换默认链，
 * **不与 mirror 叠加**（显式配置优先）；此约束保证「用户声明什么就跑什么」。
 *
 * 抽取理由：修复前基线采样与修复后验证**必须**用同一套命令解析与跳过口径，
 * 否则两侧命令集漂移会让「既有失败」的归因失真——mirror 命令也经同一入口，
 * 因此自动获得同一超时、同一取消面与同一基线归因。
 *
 * @param recordSkips 是否把跳过的命令写入 `allErrors`（修复后验证记录一次即可；基线采样只记日志，避免报告重复）
 */
function resolveVerifyCommands(
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'>,
    repo: string,
    options: { recordSkips: boolean },
): ResolvedVerifyPlan {
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

    const commands = [...valid]
    const sources = new Map<string, VerificationCommandSource>(
        valid.map((cmd) => [cmd, isDefault ? 'default' : 'repo-config']),
    )
    const plan: ResolvedVerifyPlan = { commands, sources }

    if (config.mirrorCiScripts !== true) {
        return plan
    }
    if (customCommands) {
        logger.info(
            `[ci-mirror] ${repo}: 已配置自定义验证链，CI 脚本镜像不叠加（显式命令优先）`,
        )
        return plan
    }

    const mirrorPlan = planCiMirrorCommands(workDir)
    if (mirrorPlan.unreadableReason) {
        const detail = clipLogText(mirrorPlan.unreadableReason)
        // 「没有 workflow」是常见形态（非 GitHub Actions 仓库），info 即可；解析失败才 warn
        if (mirrorPlan.unreadableReason.startsWith('未找到')) {
            logger.info(`[ci-mirror] ${repo}: 跳过 CI 脚本镜像（${detail}）`)
        } else {
            logger.warn(`[ci-mirror] ${repo}: 跳过 CI 脚本镜像（${detail}）`)
        }
    }
    // 与默认链重复的命令不重复执行（极端形态：自定义脚本名与默认链同形）
    const planned = mirrorPlan.runnable.filter((cmd) => !sources.has(cmd))
    for (const cmd of planned) {
        commands.push(cmd)
        sources.set(cmd, 'ci-mirror')
    }
    logger.info(
        `[ci-mirror] ${repo}: 计划执行 ${planned.length} 条 / 跳过 ${mirrorPlan.skipped.length} 条${
            planned.length > 0 ? `（${planned.join('、')}）` : ''}`,
    )
    plan.mirror = { planned, skipped: mirrorPlan.skipped }
    return plan
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
 * - 基线使用完整链（`stopOnFailure:false`），各命令独立记录；调用方仍对
 *   「基线中缺失的命令」**不适用豁免**（保守归因：未知不算既有）
 * - 采样异常（无 package.json / spawn 失败等）返回 `undefined`，调用方退回原始口径（全量归因）
 */
export async function sampleVerificationBaseline(
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors'> & {
        deadlineAt?: number
        verifyCommandTimeoutMs?: number
    },
    repo: string,
): Promise<CommandResult[] | undefined> {
    const { logger, workDir } = ctx
    const plan = resolveVerifyCommands(ctx, repo, { recordSkips: false })
    if (plan.commands.length === 0) {
        return []
    }
    const commands = plan.commands

    logger.info(`[baseline] Sampling pre-fix verification baseline for ${repo} (${commands.join(' → ')})`)
    try {
        // 完整链：首条失败后继续采样后续命令，避免 install 失败遮蔽 test 的既有失败
        // （nest-template：install 红 + jest No tests found）。
        // 预算夹取：单命令超时取「剩余预算 − 交付保留」，避免基线链在预算见底后仍按
        // 默认 10 分钟逐条启动（最坏 5 条 = 50 分钟，远超单仓上限，必然 execution_timeout）。
        const remaining = remainingBudgetMs(ctx.deadlineAt)
        const budgetBoundTimeout = remaining === undefined
            ? undefined
            : Math.max(1_000, remaining - MIN_STEP_BUDGET_MS)
        // 仓库级验证命令超时与预算夹取取更严者：任一更严格都以它为准
        const commandTimeoutCandidates = [budgetBoundTimeout, ctx.verifyCommandTimeoutMs]
            .filter((value): value is number => typeof value === 'number' && value > 0)
        const commandTimeoutMs = commandTimeoutCandidates.length > 0
            ? Math.min(...commandTimeoutCandidates)
            : undefined
        const result = await runVerification({
            workDir,
            commands,
            stopOnFailure: false,
            ...(commandTimeoutMs !== undefined ? { commandTimeoutMs } : {}),
        })
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

/**
 * 从修复前基线中找出「安装命令本身失败」的那一条。
 *
 * 只认默认链的安装命令（`pnpm install …` / `corepack pnpm@x install …`），不把后续
 * lint / build / test 的既有失败当成安装环境问题。调用方据此跳过依赖安装链：pristine
 * 工作区都装不上时，任何 override 安装都会以同一原因失败，逐包重试只会耗尽运行预算。
 */
export function findInstallBaselineFailure(baseline?: CommandResult[]): CommandResult | undefined {
    return baseline?.find((cr) => (
        isInstallCommand(cr.command)
        && (cr.exitCode !== 0 || cr.timedOut === true)
    ))
}

/** `verifyProject` 可选参数：修复前基线（`sampleVerificationBaseline` 产物）。 */
export interface VerifyProjectOptions {
    /**
     * 提供时：修复后仍失败、且**同一命令**在基线下也失败 → 标记 `preExisting`
     * （不归因本次改动，门禁不据此回滚；报告记 `PRE_EXISTING_FAILURE`）。
     */
    baseline?: CommandResult[]
    /**
     * 本次运行对该仓库**无任何写操作**（无告警 / 待修复项 → 调用方未采样基线）：
     * 修复后失败一律标记 `preExisting`（不归因本次改动）。
     *
     * 与 `baseline` 的关系：该场景下工作区仍是 pristine，修复后验证与「若采样的基线」跑的是
     * **同一命令、同一工作区**，故「失败 ⇒ 基线中亦失败」——两者对归因等价，因此可省去一条基线链成本。
     * 与 `baseline` 同时提供时以「任一命中即豁免」处理（`noChanges` 语义不依赖基线）。
     */
    noChanges?: boolean
    /**
     * CI 口径比对上下文（提供时把本次实际执行的命令集与目标仓库默认分支 workflow
     * 做可识别命令类别比对，写入 `ctx.ciAlignment`）。
     *
     * 比对与默认分支健康预检均为**只读 + 不阻断**：解析失败 / API 限流 / 超时只降级留痕，
     * 不影响验证结论、exit code 与交付判定。
     */
    ciAlignment?: CiAlignmentContext
    /**
     * 验证被主动跳过时回调（当前只有运行预算不足）。
     *
     * 调用方据此把「未验证」与「验证通过」区分开：空 `actions` 既可能表示「无命令」也可能
     * 表示「跳过」，**不能**用 `every(...)` 折叠成通过。
     */
    onSkip?: (reason: 'budget') => void
}

/** CI 口径比对所需的最小上下文（GitHub 源之外的运行 client 为 null）。 */
export interface CiAlignmentContext {
    client: Pick<Octokit, 'rest'> | null
    /** 目标仓库默认分支（未知时只做本地解析，不做健康预检） */
    defaultBranch?: string
}

/** CI 脚本镜像执行结果（计划期跳过项 + 实际执行集）。 */
interface MirrorExecution {
    mirrored: string[]
    skipped: CiMirrorSkipped[]
}

/** 从既有记录还原镜像信息（未开启镜像时缺省）。 */
function readMirror(record: CiAlignmentRecord | undefined): MirrorExecution | undefined {
    if (!record || (record.mirrored === undefined && record.mirrorSkipped === undefined)) {
        return undefined
    }
    return { mirrored: record.mirrored ?? [], skipped: record.mirrorSkipped ?? [] }
}

/** 合并两轮镜像信息（同一次运行多次验证取并集；跳过项按命令 + 原因去重）。 */
function mergeMirror(previous: MirrorExecution | undefined, next: MirrorExecution | undefined): MirrorExecution | undefined {
    if (!previous && !next) {
        return undefined
    }
    const mirrored = [...new Set([...(previous?.mirrored ?? []), ...(next?.mirrored ?? [])])]
    const skipped: CiMirrorSkipped[] = []
    const seen = new Set<string>()
    for (const item of [...(previous?.skipped ?? []), ...(next?.skipped ?? [])]) {
        const key = `${item.reason}\u0000${item.command}`
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        skipped.push(item)
    }
    return { mirrored, skipped }
}

/**
 * 记录本次实际执行的验证命令与目标仓库 CI 的口径（同仓库**取命令并集**）。
 *
 * 同一次运行内 `verifyProject` 可能被调用多次（跨 major 回退 / 单元回滚后重验），每次只跑到
 * 首失败位置：单次命令集可能是中间态前缀，若「首写胜出」会把已执行的全链误报成未执行。
 * 因此取**并集**（按首次出现顺序）——即「本次运行实际执行过的命令」；workflow 配置在运行期间
 * 不变，并集未增长时直接复用已有记录，避免重复发起默认分支健康预检（配额与耗时）。
 * 任何异常只 warn，不影响本次验证结果与交付。
 */
async function recordCiAlignment(
    ctx: Pick<AppContext, 'workDir' | 'logger' | 'ciAlignment'>,
    repo: string,
    commands: string[],
    ci: CiAlignmentContext | undefined,
    mirror?: MirrorExecution,
): Promise<void> {
    // 空命令集（取消 / 未执行）不产生记录：没有口径需要比对
    if (!ci || !ctx.ciAlignment || commands.length === 0) {
        return
    }
    const existingIndex = ctx.ciAlignment.findIndex((record: CiAlignmentRecord) => record.repository === repo)
    const previous = existingIndex >= 0 ? ctx.ciAlignment[existingIndex] : undefined
    const merged = previous ? [...new Set([...previous.commands, ...commands])] : commands
    // 镜像信息只可能随命令集变化而变化（mirror 命令本身进入 commands）：命令集未增长即无新事实可记。
    // 跳过项按并集披露，可能保留后续轮次已不再适用的原因（仅证据，不影响结论 / exit code）。
    if (previous && merged.length === previous.commands.length) {
        return
    }
    const mergedMirror = mergeMirror(readMirror(previous), mirror)
    try {
        const record = await buildCiAlignmentRecord({
            repository: repo,
            workDir: ctx.workDir,
            commands: merged,
            client: previous ? null : ci.client,
            ...(ci.defaultBranch ? { defaultBranch: ci.defaultBranch } : {}),
            ...(mergedMirror ? { mirror: mergedMirror } : {}),
            logger: ctx.logger,
            skipHealth: previous !== undefined,
        })
        if (previous) {
            // 复用首轮健康预检结果（workflow 配置与默认分支在运行期间不变）
            if (previous.defaultBranchHealth) {
                record.defaultBranchHealth = previous.defaultBranchHealth
            }
            if (previous.healthUnavailableReason) {
                record.healthUnavailableReason = previous.healthUnavailableReason
            }
            ctx.ciAlignment[existingIndex] = record
        } else {
            ctx.ciAlignment.push(record)
        }
        ctx.logger.info(
            `[ci-alignment] ${repo}: ${record.status}${
                record.unreadableReason ? `（${clipLogText(record.unreadableReason)}）` : ''}`,
        )
    } catch (error: unknown) {
        ctx.logger.warn(`[ci-alignment] ${repo}: 口径比对失败（不阻断运行）：${clipLogText(toErrorMessage(error))}`)
    }
}

/**
 * 解析「失败不可归因本次改动」的原因文案（返回 `undefined` ⇒ 归因本次改动）。
 * 两条来源：① 同一命令在修复前基线中也失败；② 本次运行对该仓库无任何写操作（未采样基线）。
 */
function resolvePreExistingReason(
    command: string,
    options: VerifyProjectOptions,
    baselineFailedCommands: Set<string>,
): string | undefined {
    if (baselineFailedCommands.has(command)) {
        return 'already failing before this run'
    }
    if (options.noChanges === true) {
        return 'no alerts or pending fixes for this repository in this run'
    }
    return undefined
}

export async function verifyProject(
    ctx: Pick<AppContext, 'config' | 'customCommands' | 'logger' | 'workDir' | 'allErrors' | 'ciAlignment' | 'deadlineAt' | 'budgetSkips' | 'verifyCommandTimeoutMs'>,
    repo: string,
    options: VerifyProjectOptions = {},
): Promise<FixAction[]> {
    const { logger, workDir, allErrors } = ctx

    const plan = resolveVerifyCommands(ctx, repo, { recordSkips: true })

    if (plan.commands.length === 0) {
        logger.info(`No verification commands to run for ${repo}`)
        return []
    }

    if (!budgetAllows(ctx, { repository: repo, stage: 'verify', work: 'post-fix verification' })) {
        options.onSkip?.('budget')
        return []
    }

    // 修复前即失败的命令集合（命令级基线：只豁免「同命令在基线中也失败」的失败）
    const baselineFailedCommands = new Set(
        (options.baseline ?? []).filter((cr) => cr.exitCode !== 0).map((cr) => cr.command),
    )

    try {
        const result: VerificationResult = await runVerification({
            workDir,
            commands: plan.commands,
            ...(ctx.verifyCommandTimeoutMs !== undefined ? { commandTimeoutMs: ctx.verifyCommandTimeoutMs } : {}),
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

        const actions = result.commandResults.map((cr) => {
            // 失败时附 stdout/stderr 摘要（已脱敏截断）供日志/报告定位失败原因（run 31552922137 教训：仅 "exit code 1" 无法定位）
            const failed = cr.exitCode !== 0
            const error = failed ? formatVerificationError(cr) : undefined
            // 既有失败两条来源：① 基线中同命令也失败；② 本次运行对该仓库无任何写操作（未采样基线）
            const preExistingReason = failed
                ? resolvePreExistingReason(cr.command, options, baselineFailedCommands)
                : undefined
            const preExisting = preExistingReason !== undefined
            if (preExisting) {
                // 既有失败：不归因本次改动（门禁不据此回滚），但必须显式记录，避免"静默放过"
                logger.warn(
                    `Verification failed for ${repo}: ${cr.command} — pre-existing failure (${preExistingReason}), not attributed to this change`,
                )
                // 基线阶段可能已记录同一条安装失败（recordInstallBaselineFailure）；
                // 按仓库 + 命令 + 类别去重，避免同一根因在报告里出现两次。
                const alreadyRecorded = allErrors.some((e) => (
                    e.repository === repo
                    && e.target === cr.command
                    && e.category === 'PRE_EXISTING_FAILURE'
                ))
                if (!alreadyRecorded) {
                    allErrors.push({
                        repository: repo,
                        target: cr.command,
                        stage: 'verify',
                        category: 'PRE_EXISTING_FAILURE',
                        message: `Pre-existing failure (${preExistingReason}; not caused by this change): ${cr.command} — ${error}`,
                    })
                }
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
                // 来源逐条标注（默认链 / 仓库自定义链 / CI 镜像脚本）
                ...(plan.sources.get(cr.command) ? { commandSource: plan.sources.get(cr.command) } : {}),
                durationMs: cr.durationMs,
            }
        })

        // CI 口径比对（只读 + 不阻断）：只记**实际执行**的命令（首失败短路时尾部命令未 spawn，
        // 不得让正文断言「本次已验证」某条未跑到的命令）
        const executedCommands = result.commandResults.map((cr) => cr.command)
        // 镜像命令同样只记实际执行集（默认链首失败短路时 mirror 尚未 spawn）
        const mirror: MirrorExecution | undefined = plan.mirror
            ? {
                mirrored: plan.mirror.planned.filter((cmd) => executedCommands.includes(cmd)),
                skipped: plan.mirror.skipped,
            }
            : undefined
        await recordCiAlignment(ctx, repo, executedCommands, options.ciAlignment, mirror)

        return actions
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
