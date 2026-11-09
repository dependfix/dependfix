// verification-checkpoint.ts — 验证失败时的单元级回滚 checkpoint。
//
// 背景：修复前基线完整链只解决「既有失败被误归因」；修复后完整验证失败时，旧门禁仍
// `git reset --hard HEAD` 整仓回滚，连带丢弃已经通过 probe 的依赖升级单元（picgo 形态）。
//
// 方案（用户 2026-10-21 确认）：每个依赖修复单元开始前，用 `git stash create`
// 生成一个游离 commit 对象作为工作树 checkpoint（不移动 HEAD / 不新增 ref）；单元成功时保留，
// 最终验证失败时恢复当前仓库最近 checkpoint，截断该单元的动作 / 进度 / summary，并重跑一次完整验证。
// 重验通过 → 保留更早单元继续交付；仍失败 → 记录 ROLLBACK_GRANULARITY_DEGRADED 后退回整仓回滚。
import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FixAction, RunSummary } from '@dependfix/core'
import { GitCommandError, runGit, runGitOrThrow } from '../github/git-run'
import { requestAbort } from '../runners/process-control'
import { recordRunAbort } from './abort'
import type { RepoFixCtx, RepoFixProgress } from './repo-fix'
import { isGitRepository } from './helpers'

/** checkpoint 建立失败原因（决定继续降级还是中止运行）。 */
export type CheckpointFailureCause = 'index-lock' | 'permission' | 'disk' | 'unknown'

/** 失败分类：`abort` = 工作区不可用于回滚（索引锁 / 权限 / 磁盘），`degrade` = 仅丧失单元级回滚。 */
export interface CheckpointFailureClassification {
    cause: CheckpointFailureCause
    tier: 'abort' | 'degrade'
}

/** 中止档原因集合（新增原因时在此登记，`tier` 由集合推导，避免两处漂移）。 */
const ABORT_CAUSES: ReadonlySet<CheckpointFailureCause> = new Set(['index-lock', 'permission', 'disk'])

/** 诊断特征（按数组顺序匹配合并文本；`git stash create` 对索引锁 / 权限失败可能静默退出，故仅作快路径）。 */
const CHECKPOINT_FAILURE_PATTERNS: Array<{ cause: CheckpointFailureCause, pattern: RegExp }> = [
    { cause: 'index-lock', pattern: /index\.lock|Unable to create .*\.lock|another git process|lock file already exists/i },
    { cause: 'permission', pattern: /permission denied|operation not permitted|EACCES|EPERM|EROFS/i },
    { cause: 'disk', pattern: /no space left on device|ENOSPC|EDQUOT|disk quota exceeded/i },
]

/**
 * 按诊断文本分类（快路径）。
 *
 * - 索引锁 / 权限 / 磁盘 → **abort**：工作区无法可靠回滚，继续写盘可能留下不可恢复的坏改动
 * - 其余（含无诊断文本）→ **degrade**：仅丧失单元级回滚，退回整仓回滚继续交付
 */
export const classifyCheckpointFailure = (
    output: { stderr?: string, stdout?: string, message?: string },
): CheckpointFailureClassification => {
    const text = [output.stderr, output.message, output.stdout].filter(Boolean).join('\n')
    const matched = CHECKPOINT_FAILURE_PATTERNS.find((entry) => entry.pattern.test(text))
    const cause = matched?.cause ?? 'unknown'
    return { cause, tier: ABORT_CAUSES.has(cause) ? 'abort' : 'degrade' }
}

/** 合并「文本分类」与「结构化探测」：文本命中优先，未知时采用探测结果。 */
export const resolveCheckpointFailure = (
    textClassification: CheckpointFailureClassification,
    probedCause: CheckpointFailureCause | undefined,
): CheckpointFailureClassification => {
    const cause = textClassification.cause !== 'unknown' ? textClassification.cause : probedCause ?? 'unknown'
    return { cause, tier: ABORT_CAUSES.has(cause) ? 'abort' : 'degrade' }
}

/** 探针写入失败的 errno → 失败原因（`EROFS` 归权限：工作区对本次运行不可写）。 */
export const classifyProbeError = (code: string | undefined): CheckpointFailureCause => {
    if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') {
        return 'permission'
    }
    if (code === 'ENOSPC' || code === 'EDQUOT') {
        return 'disk'
    }
    return 'unknown'
}

/** 视为「刚创建」的索引锁年龄：可能是并发 git 的合法短锁，先重试一次再判定。 */
const FRESH_LOCK_AGE_MS = 5_000
/** 新鲜锁的重试等待（只重试一次，避免把偶发竞态升级为中止）。 */
const LOCK_RETRY_DELAY_MS = 250
/** 证据采集的短超时：失败现场本身可能卡在磁盘 / 索引异常上，不能等默认 5 分钟。 */
const EVIDENCE_TIMEOUT_MS = 10_000
/** 证据里 `git status` 保留的前缀长度（开头通常是最相关条目）。 */
const STATUS_EVIDENCE_LENGTH = 400

const delay = (ms: number): Promise<void> => new Promise((resolve) => {
    setTimeout(resolve, ms)
})

/** 证据截断（与交付审计同量级，避免整页输出入报告）。 */
const tail = (text: string, length: number): string => (text.length <= length ? text : text.slice(-length))

interface CheckpointProbe {
    cause?: CheckpointFailureCause
    detail?: string
    /** 索引锁是刚创建的（可能是并发 git 的短锁） */
    freshLock?: boolean
}

/**
 * 结构化探测工作区可回滚性。
 *
 * `git stash create` 在索引锁 / 权限失败时**可能不输出任何诊断**直接退出 1（实测 git 2.43），
 * 因此不能只依赖 stderr 文本：直接检查 git dir 的 `index.lock`，并用一次小文件写入探针
 * 读取 errno（权限 / 磁盘）。探测自身任何失败都归 `unknown`（降级继续）。
 */
const probeWorktreeHealth = async (ctx: RepoFixCtx): Promise<CheckpointProbe> => {
    const gitDirResult = await runGit(['rev-parse', '--absolute-git-dir'], {
        cwd: ctx.workDir,
        timeoutMs: EVIDENCE_TIMEOUT_MS,
    })
    if (!gitDirResult.started || gitDirResult.code !== 0) {
        return {}
    }
    const gitDir = gitDirResult.stdout.trim()
    if (!gitDir) {
        return {}
    }
    const lockPath = join(gitDir, 'index.lock')
    if (existsSync(lockPath)) {
        let freshLock = false
        try {
            freshLock = Date.now() - statSync(lockPath).mtimeMs < FRESH_LOCK_AGE_MS
        } catch {
            // 锁在探测瞬间被释放：按未知处理（调用方仍会记录失败详情）
        }
        return { cause: 'index-lock', detail: 'index.lock present', freshLock }
    }
    const probePath = join(gitDir, `.dependfix-checkpoint-probe-${process.pid}`)
    try {
        writeFileSync(probePath, 'probe')
        rmSync(probePath, { force: true })
        return {}
    } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        return {
            cause: classifyProbeError(code),
            detail: `git dir write probe failed: ${code ?? 'unknown error'}`,
        }
    }
}

/** stash 失败的机器可读描述（超时 / 中止 / 退出码不可判读时不得只写 `code null`）。 */
const describeStashFailure = (stash: { code: number | null, timedOut: boolean, aborted: boolean }): string => {
    if (stash.timedOut) {
        return 'git stash create timed out'
    }
    if (stash.aborted) {
        return 'git stash create terminated by run abort'
    }
    return `git stash create exited with code ${stash.code}`
}

/** 采集失败现场（工作区状态 + HEAD）；采集自身失败记 `(unavailable)`，不抛错。 */
const captureCheckpointEvidence = async (ctx: RepoFixCtx): Promise<{ status: string, head: string }> => {
    const [status, head] = await Promise.all([
        runGit(['status', '--porcelain'], { cwd: ctx.workDir, timeoutMs: EVIDENCE_TIMEOUT_MS }),
        runGit(['rev-parse', 'HEAD'], { cwd: ctx.workDir, timeoutMs: EVIDENCE_TIMEOUT_MS }),
    ])
    // porcelain 行首空格有语义（` M` = 工作区改动）；多行压单行，保留开头（最相关条目在前）
    const statusText = status.started && status.code === 0
        ? status.stdout
            .replace(/\r\n|\r/gu, '\n')
            .replace(/\s+$/u, '')
            .replace(/\n/gu, ' | ')
            .slice(0, STATUS_EVIDENCE_LENGTH) || '(clean)'
        : '(unavailable)'
    return {
        status: statusText,
        head: head.started && head.code === 0 ? head.stdout.trim() : '(unavailable)',
    }
}

/** 只影响排障、不改变退出码的审计类条目（不参与选择性回滚的「后续失败」判定）。 */
const isAuditOnlyError = (error: { category?: string }): boolean =>
    error.category === 'ROLLBACK_GRANULARITY_DEGRADED'

const countSubstantiveErrors = (errors: Array<{ category?: string }>): number =>
    errors.filter((error) => !isAuditOnlyError(error)).length

/** checkpoint 保存的可恢复状态（只含依赖修复单元会改动的字段）。 */
export interface VerificationCheckpoint {
    /** `git stash create` 返回的 commit hash（游离对象，不挂 ref） */
    id: string
    repository: string
    label: string
    actionsLength: number
    errorsLength: number
    /** 记录时点的「实质性错误」数（排除审计类降级条目），供选择性回滚判定使用。 */
    substantiveErrorsLength: number
    progress: Pick<RepoFixProgress, 'fixed' | 'failed' | 'lockfileRepaired'>
    summary: RunSummary
}

export interface SelectiveRollbackOutcome {
    /** 是否成功恢复 checkpoint（false = 无 checkpoint / 恢复失败 / 已禁用） */
    applied: boolean
    /** 重验后是否仍存在本次引入失败（applied=false 时保持调用方原值） */
    blocking: boolean
    /** 重验产生的验证 actions（由调用方推入 allActions） */
    verifyActions: FixAction[]
    /** 降级 / 未应用原因 */
    reason?: string
}

/** 当前仓库最近一个 checkpoint（按记录顺序）。 */
export const findLatestVerificationCheckpoint = (
    ctx: Pick<RepoFixCtx, 'verificationCheckpoints'>,
    repository: string,
): VerificationCheckpoint | undefined => {
    const checkpoints = ctx.verificationCheckpoints ?? []
    for (let i = checkpoints.length - 1; i >= 0; i--) {
        if (checkpoints[i]!.repository === repository) {
            return checkpoints[i]
        }
    }
    return undefined
}

/**
 * 记录单元开始前 checkpoint（成功时保留为可回退基线）。仅在 `rollbackGranularity=unit` 且非 dry-run 时生效。
 * `git stash create` 只捕获已跟踪文件；未跟踪文件（如 AI 新建源码）不在本批范围。
 * 工作区干净时回退到 HEAD，保证首个单元也有可回退基线。
 */
export const recordVerificationCheckpoint = async (
    ctx: RepoFixCtx,
    repo: string,
    progress: RepoFixProgress,
    label: string,
): Promise<VerificationCheckpoint | undefined> => {
    if (ctx.config.dryRun || (ctx.config.rollbackGranularity ?? 'unit') !== 'unit' || !ctx.verificationCheckpoints) {
        return undefined
    }
    // 非 git 工作区没有 HEAD / 索引语义，checkpoint 不可用；不刷 warning（测试 / 非 git 目录常见）
    if (!isGitRepository(ctx.workDir)) {
        return undefined
    }
    try {
        // 受管异步：checkpoint 建立同样不得阻塞事件循环（取消 / 超时期间要有落定机会）
        const stashLabel = `dependfix:${repo}:${label}`
        let stash = await runGit(['stash', 'create', stashLabel], { cwd: ctx.workDir })
        if (!stash.started) {
            // 取消前置守卫拦下：不建 checkpoint（调用方按「无 checkpoint」处理）
            return undefined
        }
        // stash create 失败可能完全静默（索引锁 / 权限）：先探测工作区，再决定是否重试一次
        let probe: CheckpointProbe = !stash.stdout.trim() && stash.code !== 0
            ? await probeWorktreeHealth(ctx)
            : {}
        if (probe.freshLock) {
            await delay(LOCK_RETRY_DELAY_MS)
            stash = await runGit(['stash', 'create', stashLabel], { cwd: ctx.workDir })
            if (!stash.started) {
                return undefined
            }
            probe = !stash.stdout.trim() && stash.code !== 0 ? await probeWorktreeHealth(ctx) : {}
        }
        let id = stash.stdout.trim()
        if (!id && stash.code !== 0) {
            const detail = `${describeStashFailure(stash)}${probe.detail ? `; ${probe.detail}` : ''}`
            recordCheckpointFailure(ctx, repo, label, {
                classification: resolveCheckpointFailure(
                    classifyCheckpointFailure({ stderr: stash.stderr, stdout: stash.stdout }),
                    probe.cause,
                ),
                detail,
                stderr: tail(stash.stderr.trim(), 400),
                evidence: await captureCheckpointEvidence(ctx),
            })
            return undefined
        }
        if (!id) {
            // 工作区干净时 stash create 返回空串：用 HEAD 作为 checkpoint（回退首个单元时即回到基线）
            id = (await runGitOrThrow(['rev-parse', 'HEAD'], {
                cwd: ctx.workDir,
                what: 'resolve checkpoint HEAD',
            })).trim()
        }
        if (!id) {
            return undefined
        }
        const checkpoint: VerificationCheckpoint = {
            id,
            repository: repo,
            label,
            actionsLength: ctx.allActions.length,
            errorsLength: ctx.allErrors.length,
            substantiveErrorsLength: countSubstantiveErrors(ctx.allErrors),
            progress: {
                fixed: progress.fixed,
                failed: progress.failed,
                lockfileRepaired: progress.lockfileRepaired,
            },
            summary: structuredClone(ctx.summary),
        }
        ctx.verificationCheckpoints.push(checkpoint)
        return checkpoint
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const probe = await probeWorktreeHealth(ctx)
        recordCheckpointFailure(ctx, repo, label, {
            classification: resolveCheckpointFailure(classifyCheckpointFailure({ message }), probe.cause),
            detail: `${message}${probe.detail ? `; ${probe.detail}` : ''}`,
            stderr: tail((error instanceof GitCommandError ? error.stderr.trim() : ''), 400),
            evidence: await captureCheckpointEvidence(ctx),
        })
        return undefined
    }
}

/**
 * 记录 checkpoint 建立失败：降级审计（含原因分类与证据快照）+ 日志；硬故障档同时中止运行。
 *
 * 同一仓库同一原因只记一条审计（逐单元重试不刷屏），日志仍逐次留痕。
 */
const recordCheckpointFailure = (
    ctx: RepoFixCtx,
    repo: string,
    label: string,
    info: {
        classification: CheckpointFailureClassification
        detail: string
        stderr: string
        evidence: { status: string, head: string }
    },
): void => {
    const { classification, detail, stderr, evidence } = info
    ctx.logger.warn(
        `[rollback] failed to create verification checkpoint for ${repo} (${label}): `
        + `${classification.cause} — ${detail}`,
    )
    const reported = ctx.checkpointFailures ?? new Set<string>()
    ctx.checkpointFailures = reported
    const key = `${repo}:${classification.cause}`
    if (reported.has(key)) {
        return
    }
    reported.add(key)
    const abortNote = classification.tier === 'abort' ? '; run aborted (workspace not usable for rollback)' : ''
    ctx.allErrors.push({
        repository: repo,
        stage: 'verify',
        category: 'ROLLBACK_GRANULARITY_DEGRADED',
        message: `Unit-level rollback degraded to repository-level rollback: checkpoint creation failed (${classification.cause}) — ${detail}; evidence: stderr=${stderr || '(empty)'}, status=${evidence.status}, head=${evidence.head}${abortNote}`,
    })
    if (classification.tier === 'abort') {
        const reason = `checkpoint creation failed (${classification.cause}) for ${repo}: `
            + `workspace is not usable for rollback — ${detail}`
        requestAbort(reason)
        recordRunAbort(ctx, reason)
    }
}

/** 恢复 checkpoint：工作树 / 暂存区回到 checkpoint，HEAD 不变。 */
const restoreCheckpoint = async (ctx: RepoFixCtx, checkpoint: VerificationCheckpoint): Promise<void> => {
    await runGitOrThrow(['read-tree', '--reset', '-u', checkpoint.id], {
        cwd: ctx.workDir,
        what: 'restore verification checkpoint',
    })
}

const restoreProgressAndActions = (
    ctx: RepoFixCtx,
    progress: RepoFixProgress,
    checkpoint: VerificationCheckpoint,
): void => {
    ctx.allActions.length = checkpoint.actionsLength
    // 审计类降级条目（checkpoint 之后的）在截断后保留：它们解释「为何走了整仓回滚」，
    // 且不参与「后续失败」判定（否则一次 checkpoint 失败会反向禁用本可用的选择性回滚）
    const retainedAuditEntries = ctx.allErrors.slice(checkpoint.errorsLength).filter(isAuditOnlyError)
    ctx.allErrors.length = checkpoint.errorsLength
    ctx.allErrors.push(...retainedAuditEntries)
    progress.fixed = checkpoint.progress.fixed
    progress.failed = checkpoint.progress.failed
    progress.lockfileRepaired = checkpoint.progress.lockfileRepaired
    Object.assign(ctx.summary, structuredClone(checkpoint.summary))
}

const recordDegraded = (ctx: RepoFixCtx, repo: string, reason: string): void => {
    ctx.logger.warn(
        `[rollback] ${repo}: unit-level rollback degraded to repo-level — ${reason}`,
    )
    ctx.allErrors.push({
        repository: repo,
        stage: 'verify',
        category: 'ROLLBACK_GRANULARITY_DEGRADED',
        message: `Unit-level rollback degraded to repository-level rollback: ${reason}`,
    })
}

/**
 * 尝试回退当前仓库最近一个成功单元并重跑一次完整验证。
 *
 * 调用方仅在首次完整验证存在 `verificationBlocking=true` 时调用。
 * 语义：
 * - 无 checkpoint / 禁用 / 恢复失败 → applied=false，调用方保持原状态，由门禁整仓回滚
 * - 恢复成功且重验通过 → applied=true, blocking=false，保留更早单元
 * - 恢复成功但重验仍失败 → applied=true, blocking=true，记降级审计，门禁整仓回滚
 */
export const attemptSelectiveUnitRollback = async (
    ctx: RepoFixCtx,
    repo: string,
    progress: RepoFixProgress,
    verify: () => Promise<FixAction[]>,
    options: { beforeVerify?: () => Promise<void> } = {},
): Promise<SelectiveRollbackOutcome> => {
    if ((ctx.config.rollbackGranularity ?? 'unit') !== 'unit') {
        return { applied: false, blocking: true, verifyActions: [], reason: 'rollback granularity is repo' }
    }
    const checkpoint = findLatestVerificationCheckpoint(ctx, repo)
    if (!checkpoint) {
        recordDegraded(ctx, repo, 'no unit checkpoint available')
        return { applied: false, blocking: true, verifyActions: [], reason: 'no unit checkpoint available' }
    }

    // checkpoint 记录在单元开始前；若之后有失败单元，progress.failed / 实质性 errors 会增长。
    // 此时回退会抹掉失败单元的审计，改用整仓回滚（成功单元的 actions 会被截断，属预期）。
    // 审计类降级条目（ROLLBACK_GRANULARITY_DEGRADED）不参与该判定，截断时保留（见 restoreProgressAndActions）。
    if (countSubstantiveErrors(ctx.allErrors) !== checkpoint.substantiveErrorsLength
        || progress.failed !== checkpoint.progress.failed) {
        recordDegraded(
            ctx,
            repo,
            'substantive failure audit / failed outcomes exist after the latest checkpoint; selective rollback would lose failure audit',
        )
        return {
            applied: false,
            blocking: true,
            verifyActions: [],
            reason: 'later failed unit outcomes after checkpoint',
        }
    }

    try {
        await restoreCheckpoint(ctx, checkpoint)
        restoreProgressAndActions(ctx, progress, checkpoint)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        recordDegraded(ctx, repo, `checkpoint restore failed: ${message}`)
        return { applied: false, blocking: true, verifyActions: [], reason: `checkpoint restore failed: ${message}` }
    }

    ctx.logger.info(
        `[rollback] ${repo}: restored checkpoint before "${checkpoint.label}" — re-running full verification`,
    )
    let verifyActions: FixAction[]
    try {
        if (options.beforeVerify) {
            await options.beforeVerify()
        }
        verifyActions = await verify()
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        recordDegraded(ctx, repo, `verification callback failed after checkpoint restore: ${message}`)
        return { applied: false, blocking: true, verifyActions: [], reason: `verification callback failed: ${message}` }
    }
    const blocking = verifyActions.some((action) => !action.success && !action.preExisting)
    if (blocking) {
        recordDegraded(
            ctx,
            repo,
            `full verification still failing after reverting the latest unit "${checkpoint.label}"`,
        )
        return { applied: true, blocking: true, verifyActions, reason: 're-verification still blocking' }
    }

    ctx.logger.info(
        `[rollback] ${repo}: selective rollback applied — earlier verified units preserved (reverted "${checkpoint.label}")`,
    )
    return { applied: true, blocking: false, verifyActions }
}
