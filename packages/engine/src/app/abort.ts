// abort.ts — 运行级取消在编排层的接入面（留痕 / 仓库边界 / 交付闸门）。
//
// 拆出理由（2026-10-16 生产复盘，触发 `index.ts` 的 `max-lines` 上限 → 按既有处置先拆分再改）：
// 取消相关的三处策略（审计留痕、跳过后续仓库、放弃交付）都是"围绕 `runners/process-control`
// 的编排决策"，与 `DependfixApp` 的其余编排职责不同源；集中在本模块便于单点复核。
//
// 语义边界：决策与留痕在本模块；`abortRun` 是接入面，终止进程由 `runners/process-control.requestAbort` 执行。
import type { FixError, Logger } from '@dependfix/core'
import { getAbortReason, isAbortRequested, requestAbort } from '../runners/process-control'

/** 本模块所需的上下文切片（`allErrors` 用于审计留痕，`logger` 用于人读日志）。 */
export interface AbortContext {
    logger: Pick<Logger, 'warn' | 'info'>
    allErrors: FixError[]
}

/**
 * 请求中止本次运行（平台执行超时 / 运维中止的接入点；协作式、可重复调用）。
 *
 * ① 终止在跑子进程树；② 停止启动新工作；③ 放弃交付。不抛错、不中断调用栈；
 * 审计留痕由 `recordRunAbort` 完成。
 */
export function abortRun(ctx: AbortContext, reason: string): void {
    requestAbort(reason)
    recordRunAbort(ctx, reason)
}

/**
 * 记录一次运行级中止（幂等：同一运行的重复调用不再重复留痕）。
 *
 * 中止必须留痕且**计入非零退出码**（`ABORTED` 不在 `SKIPPED_AUDIT_CATEGORIES` 中）——
 * 否则"被中止"会与"跑完了"在外观上不可区分（2026-10-16 复盘的核心观感问题）。
 */
export function recordRunAbort(ctx: AbortContext, reason: string): void {
    if (ctx.allErrors.some((error) => error.category === 'ABORTED')) {
        return
    }
    ctx.logger.warn(`[abort] 收到中止请求：${reason} —— 终止在跑子进程并停止启动新工作（不再交付）`)
    ctx.allErrors.push({
        repository: '*',
        // 引擎侧 stage 全集不含 'runtime'（平台 taxonomy 才有）：运行级条目沿用 '*' + 'report' 口径
        stage: 'report',
        category: 'ABORTED',
        message: `Run aborted: ${reason}`,
    })
}

/**
 * 包装仓库任务：已取消时跳过该仓库（计入 `skipped`），不抓告警、不装依赖。
 *
 * 保留 `skipped` 计数是为了让"哪些仓库因中止未处理"可见（不静默跳过）。
 */
export function abortAwareRepoTask(
    task: (repo: string) => Promise<void>,
    skipped: string[],
): (repo: string) => Promise<void> {
    return async (repo) => {
        if (isAbortRequested()) {
            skipped.push(repo)
            return
        }
        await task(repo)
    }
}

/** 汇总因中止被跳过的仓库（无跳过时不输出，避免噪声）。 */
export function logSkippedRepos(logger: Pick<Logger, 'warn'>, skipped: string[]): void {
    if (skipped.length === 0) {
        return
    }
    const preview = skipped.slice(0, 5).join(', ')
    logger.warn(
        `[abort] 运行已中止（${getAbortReason() ?? 'abort requested'}）— 跳过 ${skipped.length} 个仓库：${preview}${skipped.length > 5 ? '…' : ''}`,
    )
}

/**
 * 交付闸门：已取消时返回 `true`（调用方据此放弃提交 / PR 创建）并留一条人读日志。
 *
 * 理由：中止可能发生在任意阶段，工作区处于"部分修复 + 未完整验证"状态，交付即坏改动落地。
 */
export function abortBlocksDelivery(ctx: Pick<AbortContext, 'logger'>, action: 'local commit' | 'PR creation' | 'branch push'): boolean {
    if (!isAbortRequested()) {
        return false
    }
    ctx.logger.warn(
        `[abort] 运行已中止（${getAbortReason() ?? 'abort requested'}）— 跳过 ${action}（工作区状态未经完整验证）`,
    )
    return true
}
