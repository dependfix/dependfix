import { createInterface } from 'node:readline'
import type { Octokit } from '@octokit/rest'
import { toErrorMessage } from '@dependfix/core'
import {
    closePullRequest,
    deleteRemoteBranch,
    getBranchPrStatus,
    isConfirmAnswer,
    listDependfixBranches,
    type DependfixOpenPR,
    type DependfixBranchStatus,
} from '@dependfix/engine'
import type { AppContext } from './helpers'

// ---------------------------------------------------------------------------
// 分支清理（fix-and-pr 附属流程与 cleanup-branches 模式）
// 独立模块：控制 app/helpers.ts 行数，职责边界清晰。
// ---------------------------------------------------------------------------

/**
 * 清理单个仓库的 dependfix 分支（cleanup-branches 模式循环体）。
 * 分类：已合并（安全清理）/ 已关闭未合并（supersede 孤儿）/ open（跳过）；
 * 删除前交互式确认（非 TTY 默认拒绝）；dry-run 仅列清单；只删 `dependfix/` 前缀分支。
 */
export async function runBranchCleanupForRepo(ctx: AppContext, client: Octokit, repo: string): Promise<void> {
    const [owner, name] = repo.split('/')
    try {
        const branches = await listDependfixBranches(client, owner, name)
        if (branches.length === 0) {
            ctx.logger.info(`[cleanup] ${repo}: no dependfix branches found`)
            return
        }

        const statuses: DependfixBranchStatus[] = []
        for (const branch of branches) {
            statuses.push(await getBranchPrStatus(client, owner, name, branch))
        }

        const merged = statuses.filter((s) => s.merged)
        const orphaned = statuses.filter((s) => s.closed && !s.merged)
        const open = statuses.filter((s) => !s.closed)

        ctx.logger.info(
            `[cleanup] ${repo}: ${merged.length} merged, ${orphaned.length} closed, ${open.length} kept`,
        )
        for (const s of merged) {
            ctx.logger.info(`  [merged] ${s.branch}${s.prNumber ? ` (PR #${s.prNumber})` : ''}`)
        }
        for (const s of orphaned) {
            ctx.logger.info(`  [closed] ${s.branch}${s.prNumber ? ` (PR #${s.prNumber})` : ''}`)
        }
        for (const s of open) {
            const label = s.prNumber ? `[open — kept]` : `[no PR — kept]`
            ctx.logger.info(`  ${label} ${s.branch}${s.prNumber ? ` (PR #${s.prNumber})` : ''}`)
        }

        const candidates = [...merged, ...orphaned]
        if (candidates.length === 0) {
            ctx.logger.info('[cleanup] nothing to delete')
            return
        }

        if (ctx.config.dryRun) {
            ctx.logger.info(`[dry-run] Would delete ${candidates.length} branch(es): ${candidates.map((s) => s.branch).join(', ')}`)
            return
        }

        if (!(await confirmCleanup(ctx, repo, candidates))) {
            ctx.logger.info('[cleanup] cancelled by user')
            return
        }

        for (const s of candidates) {
            try {
                await deleteRemoteBranch(client, owner, name, s.branch)
                ctx.logger.info(`Deleted branch: ${s.branch}`)
                ctx.allActions.push({
                    type: 'branch-cleanup',
                    repository: repo,
                    target: s.branch,
                    success: true,
                    diff: s.merged ? 'merged' : 'closed',
                    durationMs: 0,
                })
            } catch (error: unknown) {
                const message = toErrorMessage(error)
                ctx.logger.error(`Failed to delete branch ${s.branch}: ${message}`)
                ctx.allErrors.push({
                    repository: repo,
                    stage: 'report',
                    category: 'BRANCH_DELETE_FAILED',
                    message: `Failed to delete ${s.branch}: ${message}`,
                })
            }
        }
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        ctx.logger.error(`[cleanup] failed for ${repo}: ${message}`)
        ctx.allErrors.push({
            repository: repo,
            stage: 'report',
            category: 'CLEANUP_FAILED',
            message,
        })
    }
}

/**
 * 关闭被取代的旧 PR 并回收其 head 分支（supersede 流程）。
 * 关闭失败记录错误；分支删除失败仅 warn（家务活 best-effort，不触发非零退出）。
 */
export async function closeSupersededPRs(
    ctx: Pick<AppContext, 'logger' | 'allErrors'>,
    client: Octokit,
    owner: string,
    repo: string,
    supersedePRs: DependfixOpenPR[],
): Promise<void> {
    const { logger, allErrors } = ctx
    for (const old of supersedePRs) {
        try {
            await closePullRequest(client, owner, repo, old.number)
            logger.info(`Closed superseded PR #${old.number}`)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            logger.error(`Failed to close superseded PR #${old.number}: ${message}`)
            allErrors.push({
                repository: `${owner}/${repo}`,
                stage: 'report',
                category: 'PR_CLOSE_FAILED',
                message: `Failed to close PR #${old.number}: ${message}`,
            })
            continue
        }

        // 旧 PR 已关闭，回收其 head 分支（内容仍在 PR 记录中可审计）。
        // 删除失败不阻塞主流程，仅 warn（家务活 best-effort，不触发非零退出）
        try {
            await deleteRemoteBranch(client, owner, repo, old.headRef)
            logger.info(`Deleted branch of superseded PR #${old.number}: ${old.headRef}`)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            logger.warn(`Failed to delete branch ${old.headRef} of superseded PR #${old.number}: ${message}`)
        }
    }
}

/**
 * （fix-and-pr + --cleanup-branches）将已合并的 dependfix 分支列为待清理清单，
 * 记录到报告与日志，不执行删除。
 */
export async function reportCleanupCandidates(
    ctx: Pick<AppContext, 'config' | 'logger' | 'allActions' | 'allErrors'>,
    client: Octokit,
): Promise<void> {
    const { config, logger, allActions, allErrors } = ctx
    for (const repo of config.repositories) {
        const [owner, name] = repo.split('/')
        try {
            const branches = await listDependfixBranches(client, owner, name)
            for (const branch of branches) {
                const status = await getBranchPrStatus(client, owner, name, branch)
                if (status.merged) {
                    logger.info(`[cleanup] merged branch awaiting manual cleanup: ${branch}`)
                    allActions.push({
                        type: 'branch-cleanup',
                        repository: repo,
                        target: branch,
                        success: true,
                        diff: 'merged; run `dependfix cleanup-branches` to delete',
                        durationMs: 0,
                    })
                }
            }
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            logger.error(`[cleanup] detection failed for ${repo}: ${message}`)
            allErrors.push({
                repository: repo,
                stage: 'report',
                category: 'CLEANUP_DETECT_FAILED',
                message,
            })
        }
    }
}

/**
 * （fix-and-pr + --cleanup-branches-auto）自动删除已合并/已关闭的 dependfix 分支。
 *
 * - 非交互：CI 环境可用，无需 TTY 确认
 * - 安全边界：只删 `dependfix/` 前缀且 merged / closed 状态的分支，绝不触碰 open PR 分支
 * - dry-run 仅列出 would-delete，不执行删除
 * - 删除动作记入 `branch-cleanup` action（报告可审计）；删除失败记录错误不中断
 */
export async function autoCleanupMergedBranches(
    ctx: Pick<AppContext, 'config' | 'logger' | 'allActions' | 'allErrors'>,
    client: Octokit,
    repo: string,
): Promise<void> {
    const { config, logger, allActions, allErrors } = ctx
    const [owner, name] = repo.split('/')

    try {
        const branches = await listDependfixBranches(client, owner, name)
        if (branches.length === 0) {
            logger.info(`[cleanup-auto] ${repo}: no dependfix branches found`)
            return
        }

        let deleted = 0
        for (const branch of branches) {
            const status = await getBranchPrStatus(client, owner, name, branch)
            if (!status.merged && !status.closed) {
                continue // open PR 或未知状态，保留
            }

            if (config.dryRun) {
                logger.info(`[cleanup-auto][dry-run] Would delete ${branch} (${status.merged ? 'merged' : 'closed'})`)
                continue
            }

            try {
                await deleteRemoteBranch(client, owner, name, branch)
                deleted++
                logger.info(`[cleanup-auto] Deleted branch: ${branch}`)
                allActions.push({
                    type: 'branch-cleanup',
                    repository: repo,
                    target: branch,
                    success: true,
                    diff: status.merged ? 'merged' : 'closed',
                    durationMs: 0,
                })
            } catch (error: unknown) {
                const message = toErrorMessage(error)
                // 删除失败不中断（家务活 best-effort，不触发非零退出）
                logger.warn(`[cleanup-auto] Failed to delete branch ${branch}: ${message}`)
            }
        }
        logger.info(`[cleanup-auto] ${repo}: deleted ${deleted} branch(es)`)
    } catch (error: unknown) {
        const message = toErrorMessage(error)
        logger.error(`[cleanup-auto] detection failed for ${repo}: ${message}`)
        allErrors.push({
            repository: repo,
            stage: 'report',
            category: 'CLEANUP_DETECT_FAILED',
            message,
        })
    }
}

/**
 * 交互式确认删除。非 TTY（CI/管道）时直接拒绝。
 */
export function confirmCleanup(
    ctx: Pick<AppContext, 'logger'>,
    repo: string,
    candidates: { branch: string }[],
): Promise<boolean> {
    const { logger } = ctx
    if (!process.stdin.isTTY) {
        logger.warn('[cleanup] non-TTY environment — deletion requires interactive confirmation, aborting')
        return Promise.resolve(false)
    }

    const rl = createInterface({ input: process.stdin, output: process.stdout })
    return new Promise((resolve) => {
        rl.question(
            `Delete ${candidates.length} branch(es) from ${repo}? [y/N] `,
            (answer) => {
                rl.close()
                resolve(isConfirmAnswer(answer))
            },
        )
    })
}
