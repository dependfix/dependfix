import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Octokit } from '@octokit/rest'
import {
    buildPrTitle,
    closeSupersededPRs,
    computeFixAndPrPlan,
    computeFixFingerprint,
    createGitHubClient,
    createPullRequest,
    fetchDefaultBranch,
    findDependfixOpenPR,
    generatePRBody,
    type DependfixOpenPR,
} from '@dependfix/engine'
import { fromPat } from '@dependfix/engine/auth'
import type { Logger, RunResult } from '@dependfix/core'

const execFileAsync = promisify(execFile)

/**
 * 平台侧 fix-and-pr 交付决策（纯函数，可单测）。
 *
 * 引擎职责：本地修复 + commit（在容器内完成，由 ContainerExecutor 走 `mode: 'fix' + commit: true` 触发）。
 * 平台职责：复用引擎的 dedup/supersede 决策 + 带凭据 push + 创建 PR + 关闭被替代的旧 PR。
 *
 * 与引擎自带的 fix-and-pr 模式（[packages/engine/src/app/index.ts:475 executeFixAndPrMode]）逻辑等价，
 * 但平台侧多了「凭据链安全」保证：push 通过 `git -c http.extraheader=...` 注入 token，不写入 .git/config，
 * 避免 pr_creation_failed 时 workDir 保留 24h 期间 token 明文落盘。
 *
 * 返回的 plan 用于驱动后续 IO：
 * - action='skip'：平台不动作；runUrl 指向同指纹已存在的 PR；status 走 `completed`（幂等交付）
 * - action='create'：平台按 plan.branchName / plan.supersedePRs 推进 push + create + close
 *
 * 错误码语义（与 C53 状态机契约对齐）：
 * - 推 push 前查询 open PR 失败（GitHub API 4xx/5xx/网络）→ 降级为「假设无 open PR」，继续 create 路径
 *   （GitHub createPullRequest 在 head 已存在 open PR 时会返回 422，兜底归为 pr_creation_failed 状态）
 * - 失败回退：仅记录 warn，不阻断——避免单次 API 调用失败阻塞整个交付
 */
export async function planFixAndPrDelivery(
    octokit: Octokit,
    owner: string,
    repo: string,
    result: RunResult,
    logger?: Pick<Logger, 'warn' | 'info' | 'error'>,
): Promise<FixAndPrDeliveryPlan> {
    const fingerprint = computeFixFingerprint(result.actions)

    let existingPRs: DependfixOpenPR[] = []
    try {
        existingPRs = await findDependfixOpenPR(octokit, owner, repo)
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger?.warn?.(`[platform-delivery] findDependfixOpenPR 失败：${message}；降级为无 open PR 继续 create 路径（GitHub 422 兜底）`)
    }

    const plan = computeFixAndPrPlan(existingPRs, fingerprint)
    return {
        fingerprint,
        branchName: `dependfix/auto-fix-${fingerprint}`,
        action: plan.action,
        sameContentPR: plan.sameContentPR,
        supersedePRs: plan.supersedePRs,
    }
}

/** 平台交付决策结果。 */
export interface FixAndPrDeliveryPlan {
    /** 内容指纹（8 位 hex） */
    fingerprint: string
    /** 修复分支名（`dependfix/auto-fix-{fp}`） */
    branchName: string
    /** skip = 同指纹 PR 已存在；create = 需要新建 */
    action: 'skip' | 'create'
    /** action='skip' 时命中的同内容 PR */
    sameContentPR?: DependfixOpenPR
    /** 内容不同、需要关闭的旧 PR 列表 */
    supersedePRs: DependfixOpenPR[]
}

/**
 * 平台交付结果。
 * - runUrl：必填；skip 时为同内容 PR URL，create 成功时为新 PR URL
 * - prNumber：create 成功时为新 PR 编号（无 PR 时为 undefined）
 * - skipped：true 表示幂等跳过（同内容 PR 已存在）
 */
export interface PlatformDeliveryResult {
    runUrl: string
    prNumber?: number
    skipped: boolean
}

/**
 * 带细粒度错误码的交付失败（与 ContainerExecutor.execute() 的 error.code 对齐）。
 *
 * 设计要点：用一个 Error 子类携带 `code` + `branchPushed` 状态，避免调用方靠字符串匹配
 * 区分"push 失败 vs PR 创建失败 vs supersede 失败"。
 */
export class PlatformDeliveryError extends Error {
    readonly code: 'push_failed' | 'pr_creation_failed' | 'supersede_failed'
    readonly branchPushed: boolean

    constructor(code: PlatformDeliveryError['code'], message: string, branchPushed: boolean) {
        super(message)
        this.name = 'PlatformDeliveryError'
        this.code = code
        this.branchPushed = branchPushed
    }
}

/**
 * 推送修复分支到远程 origin（平台带凭据版）。
 *
 * 与 [container-executor.pushFixBranch] 等价实现——本文件保留独立版本，便于 planFixAndPrDelivery + deliverFixAndPr
 * 形成自包含的交付单元（不依赖 container-executor 的私有函数），单测可直接 import。
 *
 * 凭据走 `http.extraheader`（base64 basic auth），不进 argv/URL（防 execFile 错误回显泄露 token）。
 * 失败原样抛 PlatformDeliveryError(code='push_failed')。
 */
export async function pushFixBranchWithCredential(
    branchName: string,
    workDir: string,
    token: string,
): Promise<void> {
    const basic = Buffer.from(`x-access-token:${token}`).toString('base64')
    const args = ['-c', `http.extraheader=Authorization: basic ${basic}`, 'push', 'origin', branchName]
    try {
        const { stderr } = await execFileAsync('git', args, { cwd: workDir, timeout: 60_000 })
        if (stderr && !/^To /m.test(stderr)) {
            throw new Error(stderr.trim())
        }
    } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        throw new PlatformDeliveryError('push_failed', `推送修复分支失败：${raw}`, false)
    }
}

/**
 * 平台侧完整交付：plan → push → create PR → close supersede。
 *
 * 输入前置：调用方已确认 `hasNewCommit(workDir)` 为 true（引擎在 `fix + commit:true` 模式下有 commit 产生）。
 * 该函数假定 workDir 在一个已 commit 的修复分支上；`branchName` 由调用方从 plan 取，与 workDir 当前分支一致。
 *
 * 失败语义：
 * - push_failed：分支未推到远程 → 状态机 failed
 * - pr_creation_failed：分支已推但 PR 创建失败 → 状态机 dispatched（runUrl 兜底为 branch URL）
 * - supersede_failed：仅关旧 PR 失败，**不影响主交付**（已记入 logger.error + result.errors，runUrl 仍为新 PR URL）
 */
export async function deliverFixAndPr(
    ctx: DeliverContext,
): Promise<PlatformDeliveryResult> {
    const { owner, repo, branchName, token, workDir, result, plan, octokit: octokitFromCtx } = ctx
    const logger = ctx.logger
    const log = (level: 'info' | 'warn' | 'error', msg: string) => logger?.[level]?.(msg)

    // 1. Skip 路径：同内容 PR 已存在 → 幂等返回
    if (plan.action === 'skip' && plan.sameContentPR) {
        log('info', `[platform-delivery] 同内容 PR #${plan.sameContentPR.number} 已存在，跳过创建（fingerprints match: ${plan.fingerprint}）`)
        return {
            runUrl: plan.sameContentPR.htmlUrl,
            prNumber: plan.sameContentPR.number,
            skipped: true,
        }
    }

    // 2. Push 修复分支
    await pushFixBranchWithCredential(branchName, workDir, token)

    // 3. Create PR
    let pr: { htmlUrl: string, number: number }
    try {
        const baseBranch = await fetchDefaultBranch(octokitFromCtx, owner, repo)
        const title = buildPrTitle(result.summary, result.actions)
        // supersedePRs 数字用于 PR body 注明（与引擎 generatePRBody 行为对齐）
        const supersededNumbers = plan.supersedePRs.map((p) => p.number)
        const body = generatePRBody(result, supersededNumbers)
        pr = await createPullRequest({
            octokit: octokitFromCtx,
            owner,
            repo,
            headBranch: branchName,
            baseBranch,
            title,
            body,
        })
        log('info', `[platform-delivery] PR created: ${pr.htmlUrl}`)
    } catch (err) {
        const raw = err instanceof Error ? err.message : String(err)
        throw new PlatformDeliveryError('pr_creation_failed', `创建 PR 失败（分支已推 ${branchName}）：${raw}`, true)
    }

    // 4. Close supersede PRs (best-effort：失败仅 warn，不影响主交付 runUrl)
    if (plan.supersedePRs.length > 0) {
        try {
            await closeSupersededPRs(
                { logger: ctx.logger ?? noopLogger(), allErrors: [] },
                octokitFromCtx,
                owner,
                repo,
                plan.supersedePRs,
            )
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            log('warn', `[platform-delivery] 关 supersede PR 失败（不影响主交付）：${message}`)
        }
    }

    return { runUrl: pr.htmlUrl, prNumber: pr.number, skipped: false }
}

export interface DeliverContext {
    owner: string
    repo: string
    branchName: string
    token: string
    workDir: string
    result: RunResult
    plan: FixAndPrDeliveryPlan
    octokit: Octokit
    /** AppContext 兼容的 logger；undefined 时使用 noop（不阻断测试与 silent 模式） */
    logger?: Logger
}

function noopLogger(): Logger {
    return {
        debug() { /* no-op for tests / silent mode */ },
        info() { /* no-op for tests / silent mode */ },
        warn() { /* no-op for tests / silent mode */ },
        error() { /* no-op for tests / silent mode */ },
    }
}

/**
 * 创建 GitHub 客户端（平台专用，retry 策略与 createPrForFix 一致）。
 * 单独导出便于 deliverFixAndPr 单测时可注入 mock octokit。
 */
export function createPlatformOctokit(token: string): Octokit {
    return createGitHubClient({
        auth: fromPat(token, { retry: { maxRetries: 3, maxBackoffMs: 30_000 } }),
    })
}
