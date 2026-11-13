// repo-fix-finalize.ts — 单仓库修复管线的「基线采样触发」与「收尾（lockfile repair + 修复后验证）」交接面。
//
// 从 repo-fix.ts 迁出：该文件新增语句会越过 eslint `max-lines` 上限，按登记候选自带的触发条件
// 「再次改动需要新增语句时（先拆分再改）」处置；该候选已随之移出候选池，处置记录见 docs/plan/todo.md 的「零告警仓库修复前基线采样成本」闭环登记。
// 两段职责的耦合点只有运行级基线持有器：采样时机决定是否需要付基线成本，收尾消费采样结果做归因豁免。
// 验证链口径见 docs/design/modules/dependency-fixer-records.md §12.9。
import type { Octokit } from '@octokit/rest'
import { formatVerificationError, type CommandResult } from '../runners/verification-runner'
import { tryLockfileRepair } from './helpers'
import type { RepoFixCtx, RepoFixProgress } from './repo-fix'
import { budgetAllows, hasBudgetForNextStep } from './budget'
import { findInstallBaselineFailure, sampleVerificationBaseline, verifyProject } from './verify-project'
import { attemptSelectiveUnitRollback } from './verification-checkpoint'

/**
 * 惰性取得本次运行修复前的验证基线（每运行一次），并返回本仓库的归因豁免判定。
 * dry-run 不做验证，因此也不需要基线。
 *
 * 采样触发面按「本仓库是否有工作」收窄（口径见 docs/design/modules/dependency-fixer-records.md 验证链章节）：
 * - 已有基线（本次运行内任一仓库采样过）→ 复用，运行级「首采一次 + 跨仓库复用」语义不变
 * - 本仓库有可写工作（可修复的依赖 / 成员清单 / 自动修复模板告警 → 会有写操作）→ 采样
 * - 本仓库无工作且尚无基线 → 不采样，返回 `exemptAttribution: true`：pristine 工作区下修复后验证失败
 *   必然也会在基线中失败（同命令同工作区），故「无改动即豁免」与采样等价，省一次完整验证链成本
 */
export async function ensureVerificationBaseline(
    ctx: RepoFixCtx,
    repo: string,
    options: { hasWork: boolean },
): Promise<{ exemptAttribution: boolean, baseline?: CommandResult[] }> {
    if (ctx.config.dryRun || !ctx.verificationBaseline) {
        return { exemptAttribution: false }
    }
    if (!budgetAllows(ctx, { repository: repo, stage: 'verify', work: 'pre-fix baseline sampling' })) {
        // 预算不足不采样：不豁免归因（保守），后续验证同样会被预算检查挡下
        return { exemptAttribution: false }
    }
    if (ctx.verificationBaseline.value) {
        return {
            exemptAttribution: false,
            // 运行级首采只对采样仓库自身可信：多仓运行时不能把 A 仓的安装失败套到 B 仓，
            // 否则会把 B 仓的修复链误跳过。归因口径仍沿用运行级基线（见 currentBaseline）。
            baseline: ctx.verificationBaseline.repo === repo ? ctx.verificationBaseline.value : undefined,
        }
    }
    if (!options.hasWork) {
        ctx.logger.info(
            `[baseline] Skipping pre-fix baseline for ${repo}: no writable work → no writes in this run `
            + '(verification failures of this repository are not attributed to this change)',
        )
        return { exemptAttribution: true }
    }
    const value = await sampleVerificationBaseline(ctx, repo)
    if (value) {
        ctx.verificationBaseline.value = value
        ctx.verificationBaseline.repo = repo
    }
    return { exemptAttribution: false, baseline: value }
}

/** 读取本次运行的修复前基线（未采样 / 采样失败时为 undefined ⇒ 全量归因）。 */
function currentBaseline(ctx: RepoFixCtx): CommandResult[] | undefined {
    return ctx.verificationBaseline?.value
}

/**
 * 记录 pristine 安装失败并返回该条结果（供调用方跳过依赖安装链）。
 *
 * 只在基线属于当前仓库时生效（`ensureVerificationBaseline` 已做仓库归属判定）；
 * 审计条目不归因本次运行（`PRE_EXISTING_FAILURE` 在跳过类白名单内），但必须在报告里
 * 留下失败命令与诊断，避免「有可修告警 / 0 修复」再次变成无证据运行。
 */
export function recordInstallBaselineFailure(
    ctx: Pick<RepoFixCtx, 'logger' | 'allErrors'>,
    repo: string,
    baseline?: CommandResult[],
): CommandResult | undefined {
    const failure = findInstallBaselineFailure(baseline)
    if (!failure) {
        return undefined
    }
    const detail = formatVerificationError(failure)
    ctx.logger.warn(
        `[baseline] pristine install failed for ${repo}: ${failure.command} — ${detail}; `
        + 'skipping dependency install attempts for this run (fix the execution environment or lockfile first)',
    )
    ctx.allErrors.push({
        repository: repo,
        target: failure.command,
        stage: 'verify',
        category: 'PRE_EXISTING_FAILURE',
        message: `Pre-existing failure (already failing before this run; not caused by this change): `
            + `${failure.command} — ${detail}`,
    })
    return failure
}

/**
 * 基线安装失败是否带「锁文件本身有问题」的诊断特征。
 *
 * 只有这类失败才把 known-broken 证据传给锁文件修复：纯环境性失败（超时 / OOM / 网络）下
 * 强制按 manifest 重建会引入与告警无关的解析漂移，故退回既有分类链。
 */
const LOCKFILE_FAILURE_PATTERN = /ERR_PNPM_BROKEN_LOCKFILE|ERR_PNPM_OUTDATED_LOCKFILE|broken.*lockfile|duplicated mapping key|lockfileVersion|Cannot read.*lockfile/i

export function isLockfileBaselineFailure(failure?: CommandResult): boolean {
    if (!failure || failure.timedOut) {
        return false
    }
    return LOCKFILE_FAILURE_PATTERN.test(`${failure.stderr}\n${failure.stdout}`)
}

/**
 * 步骤 5：收尾——lockfile repair + 完整验证（dry-run 跳过验证）。零告警仓库跳过 lockfile repair
 * （无升级改动即无锁文件待修复）+ 跳过修复前基线采样（无改动即无「本次引入」可归因，
 * 见 `ensureVerificationBaseline`；`options.exemptAttribution` 承载该判定），
 * 但保留修复后验证链——其 `verificationPassed` 是零告警仓库唯一的「处理成功」信号。
 */
export async function finalizeRepoFix(
    ctx: RepoFixCtx,
    repo: string,
    progress: RepoFixProgress,
    options: {
        exemptAttribution?: boolean
        client?: Octokit | null
        /**
         * 修复前基线中失败的安装命令（`recordInstallBaselineFailure` 产物）。
         *
         * 传入即表示「基线已判安装失败」：lockfile 修复不得走「已合规」捷径，
         * 结构兜底失败以 `PRECONDITION_FAILED` 上报（见 `tryLockfileRepair`）。
         */
        installBaselineFailure?: CommandResult
    } = {},
): Promise<void> {
    let lockfileRepairFailed = false
    // 仅锁文件特征的基线失败才禁用「已合规」捷径（见 isLockfileBaselineFailure）
    const knownBrokenBaseline = isLockfileBaselineFailure(options.installBaselineFailure)
        ? options.installBaselineFailure
        : undefined
    // 归因豁免（`exemptAttribution`）的前提是「本次没有写过任何文件」——因此零工作仓库
    // 连 lockfile repair 也不跑：repair 若真改了文件，`noChanges` 豁免就不再成立，
    // repair 引起的失败会被误标为既有失败（修复器尝试前缀的归因评审项）。
    if (progress.alertsCount > 0 && options.exemptAttribution !== true
        && budgetAllows(ctx, { repository: repo, stage: 'repair', work: 'lockfile repair' })) {
        const repairAction = await tryLockfileRepair(ctx, repo, {
            ...(knownBrokenBaseline ? { installBaselineFailure: knownBrokenBaseline } : {}),
        })
        ctx.allActions.push(repairAction)
        lockfileRepairFailed = !repairAction.success && !repairAction.noOp
        if (repairAction.success && !repairAction.noOp) {
            progress.lockfileRepaired = true
        }
    } else if (progress.alertsCount === 0) {
        ctx.logger.info(`[skip] No alerts for ${repo} — skipping lockfile repair`)
    } else {
        ctx.logger.info(`[skip] No effective work for ${repo} — skipping lockfile repair (workspace stays pristine for attribution)`)
    }
    // 仅当首次 repair 真正改了文件时，选择性回滚后才需要重做；noOp 不额外跑安装
    const lockfileRepairChanged = progress.lockfileRepaired

    if (!ctx.config.dryRun) {
        // 有告警但本次没有任何实际写入（全部跳过 / 仅跨 major 未授权 / lockfile repair 未改文件）
        // → 工作区保持 pristine，后验证没有对象：跳过整条终验（`no-write`）。
        // 不写「本次引入的失败」（`verificationBlocking=false`）：没有改动就没有可归因的失败，
        // 该仓库既无交付内容也不得阻断其他仓库的交付；「未验证」由 `verificationSkipped` 表达。
        // 零告警仓库不走此分支——其 `verificationPassed` 是唯一的「处理成功」信号（见用例约束）。
        // 预算已耗尽时优先走预算跳过（硬门禁原因），不把「预算跳过」误标为 `no-write`。
        if (progress.alertsCount > 0 && progress.fixed === 0 && !progress.lockfileRepaired
            && hasBudgetForNextStep(ctx.deadlineAt)) {
            ctx.logger.info(
                `[skip] Verification for ${repo}: alerts present but no writes in this run — `
                + 'skipping post-fix verification (nothing to verify or deliver; worktree unchanged)',
            )
            progress.verificationPassed = undefined
            progress.verificationBlocking = false
            progress.verificationSkipped = 'no-write'
            return
        }
        let budgetSkipped = false
        const verifyOptions = {
            baseline: currentBaseline(ctx),
            // 「无改动即豁免」：零告警仓库未采样基线（无任何写操作）——其失败一律视为既有失败，
            // 与「基线中同命令也失败」等价（同命令 + 同一 pristine 工作区），故归因口径零退化
            noChanges: options.exemptAttribution === true,
            // CI 口径比对上下文（只读 + 不阻断；无 GitHub client 时只做本地解析）
            ciAlignment: { client: options.client ?? null, defaultBranch: progress.defaultBranch },
            onSkip: (reason: 'budget') => {
                if (reason === 'budget') {
                    budgetSkipped = true
                }
            },
        }
        let verifyActions = await verifyProject(ctx, repo, verifyOptions)
        let blocking = verifyActions.some((a) => !a.success && !a.preExisting)
        // 首次终验即被预算跳过：未验证 ⇒ 不交付、不记「验证通过」
        const firstVerificationSkipped = budgetSkipped

        // 终验存在本次引入失败时，默认先尝试回退最近一个已通过 probe 的单元并重验一次。
        // 通过 → 保留更早单元继续交付；仍失败 / 无 checkpoint → 原 actions 保持不变，门禁整仓回滚。
        if (!firstVerificationSkipped && blocking && (ctx.config.rollbackGranularity ?? 'unit') === 'unit' && !options.exemptAttribution
            && !ctx.preExistingDirty && !lockfileRepairFailed) {
            const outcome = await attemptSelectiveUnitRollback(
                ctx,
                repo,
                progress,
                () => verifyProject(ctx, repo, verifyOptions),
                {
                    beforeVerify: async () => {
                        // checkpoint 在 lockfile repair 之前：恢复后重做 repair，避免把「安装已合规」
                        // 这一修复一并回退导致重验假红。
                        if (lockfileRepairChanged && progress.alertsCount > 0
                            && budgetAllows(ctx, { repository: repo, stage: 'repair', work: 'lockfile repair after selective rollback' })) {
                            const repairAction = await tryLockfileRepair(ctx, repo, {
                                ...(knownBrokenBaseline ? { installBaselineFailure: knownBrokenBaseline } : {}),
                            })
                            ctx.allActions.push(repairAction)
                            if (repairAction.success && !repairAction.noOp) {
                                progress.lockfileRepaired = true
                            }
                        }
                    },
                },
            )
            if (outcome.applied) {
                if (budgetSkipped) {
                    // 重验被预算跳过：不能宣称「保留更早单元」（一次验证都没跑）→ 退回整仓门禁
                    blocking = true
                } else {
                    verifyActions = outcome.verifyActions
                    blocking = outcome.blocking
                }
            }
        }

        ctx.allActions.push(...verifyActions)
        if (firstVerificationSkipped) {
            // 预算跳过终验：留 `undefined`（未验证）并显式标记，门禁据此不交付但也不回滚
            progress.verificationPassed = undefined
            progress.verificationBlocking = true
            progress.verificationSkipped = 'budget'
        } else {
            // 原始口径：修复后链路是否全绿（报告与「成功交付」启发式沿用）
            progress.verificationPassed = verifyActions.every((a) => a.success)
            // 归因口径：是否存在**本次引入**的失败（门禁据此回滚；既有失败不归因）
            progress.verificationBlocking = blocking
        }
    } else {
        ctx.logger.info(`[dry-run] Skipping verification for ${repo}`)
        progress.verificationPassed = undefined
        progress.verificationBlocking = undefined
    }
}
