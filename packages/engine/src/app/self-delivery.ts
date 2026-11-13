// self-delivery.ts — fix 模式的自包含交付记录（提交后推送当前分支）。
//
// 契约：只有显式开启 `push`（沙箱自包含执行）才推分支；容器路径保持
// `{ deliveredBy: 'platform', status: 'none' }`，由平台接管 push / PR。
import type { FixError, Logger, RunDelivery } from '@dependfix/core'
import { pushBranch, readCurrentBranch, readHeadCommit, type DependfixOpenPR } from '../github'

export interface FixModeDeliveryInput {
    commit: boolean
    /** 提交后是否推送当前分支（容器路径保持 false） */
    push?: boolean
    workDir: string
    logger: Logger
    allErrors: FixError[]
    /** 提交前 HEAD（用于判定是否产生新提交） */
    headBeforeCommit?: string
    /** 运行级取消守卫：返回 true 时不推分支（半成品不落地） */
    abortBlocked: () => boolean
}

/**
 * fix 模式的交付记录：
 * - `push: true`（自包含执行）：推送当前分支，成功记 `pushed`（branch + commit SHA）；
 *   未产生新提交（HEAD 未变）则不推、记 `none`
 * - `push: false`（容器路径）：只记 `{ deliveredBy: 'platform', status: 'none' }`，
 *   由平台接管 push，避免结果被误读为「已交付」
 *
 * 无 commit 配置时返回 undefined（不改写调用方的既有交付状态）。
 */
export async function recordFixModeDelivery(input: FixModeDeliveryInput): Promise<RunDelivery | undefined> {
    const { commit, push, workDir, logger, allErrors } = input
    if (!commit) {
        return undefined
    }
    try {
        const commitSha = await readHeadCommit(workDir).catch(() => undefined)
        const branch = await readCurrentBranch(workDir).catch(() => undefined)
        if (!push) {
            return {
                deliveredBy: 'platform',
                status: 'none',
                ...(branch && branch !== 'HEAD' ? { branch } : {}),
                ...(commitSha ? { commitSha } : {}),
            }
        }
        if (!branch || branch === 'HEAD') {
            logger.warn('Detached HEAD — skipping branch push (self-contained delivery)')
            return { deliveredBy: 'none', status: 'none', ...(commitSha ? { commitSha } : {}) }
        }
        if (input.headBeforeCommit && commitSha && input.headBeforeCommit === commitSha) {
            logger.info('No new commit to push — skipping branch push')
            return { deliveredBy: 'none', status: 'none', branch, ...(commitSha ? { commitSha } : {}) }
        }
        if (input.abortBlocked()) {
            return undefined
        }
        logger.info(`Pushing branch (self-contained delivery): ${branch}`)
        await pushBranch(branch, workDir)
        return { deliveredBy: 'engine', status: 'pushed', branch, ...(commitSha ? { commitSha } : {}) }
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        logger.error(`Pushing branch failed: ${message}`)
        allErrors.push({
            repository: '*',
            stage: 'report',
            category: 'PUSH_FAILED',
            message,
        })
        return { deliveredBy: 'none', status: 'none' }
    }
}

/** 分支已推（fix-and-pr）：后续 PR 失败 / 取消时平台据 branch 清理。 */
export function deliveryBranchPushed(branch: string, commitSha?: string): RunDelivery {
    return { deliveredBy: 'engine', status: 'pushed', branch, ...(commitSha ? { commitSha } : {}) }
}

/** PR 已创建（fix-and-pr）：branch / commit 与 PR 一并记录。 */
export function deliveryPrCreated(
    branch: string,
    commitSha: string | undefined,
    pr: { number: number, htmlUrl: string },
): RunDelivery {
    return {
        deliveredBy: 'engine',
        status: 'pr-created',
        branch,
        ...(commitSha ? { commitSha } : {}),
        prUrl: pr.htmlUrl,
        prNumber: pr.number,
    }
}

/** 同内容 PR 复用：幂等交付，平台不再重复创建。 */
export function deliveryPrReused(pr: DependfixOpenPR): RunDelivery {
    return {
        deliveredBy: 'engine',
        status: 'pr-created',
        branch: pr.headRef,
        prUrl: pr.htmlUrl,
        prNumber: pr.number,
    }
}
