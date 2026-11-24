// branch-cleanup.ts — PR 反馈关闭后回收 head 分支（对齐引擎 supersede 路径）。
//
// 背景：`closeFailed` 开启时平台只关闭 PR、不删 head 分支，`dependfix/auto-fix-*` 残留后
// 下一轮同指纹交付会撞上 non-fast-forward（`push_failed`）。引擎 supersede 路径已有「关闭后删
// 分支」口径（`app/branch-cleanup.ts`），平台侧此前缺失。
//
// 安全边界（误删防护是本模块的核心约束）：
// - 只处理 **本仓库** 的 head（fork PR 的 head 属于他人仓库 → 跳过）
// - 只处理 `dependfix/auto-fix-*` 前缀，默认分支与任意其它命名 → 跳过
// - head sha 必须等于触发反馈的 `PRCheck.headSha`：sha 变了说明有新提交，分支不再对应本次关闭的
//   交付内容，留给后续观察 / 人工处理（避免删掉别人正在跟进的分支）
// 所有结局（deleted / failed / skipped + 原因）都落 `delivery_branch_cleanup` 审计，副作用可观测；
// 删除失败不阻断反馈主流程（与 `sandbox-delivery-cleanup.ts` 同口径）。

import type { Octokit } from '@octokit/rest'
import { DEPENDFIX_BRANCH_PREFIX, deleteRemoteBranch } from '@dependfix/engine'
import type { Repository } from '#server/entities/repository'
import type { ScanRun } from '#server/entities/scan-run'
import { recordDeliveryCleanupEvent } from '#server/services/sandbox-delivery-cleanup'
import { sanitizeString } from '#server/utils/sanitize'

/** 关闭 PR 后的 head 分支处置结局。 */
export type ClosedPrCleanupOutcome = 'deleted' | 'failed' | 'skipped'

/** 跳过原因（写入审计 payload，便于离线判读）。 */
export type ClosedPrCleanupSkipReason =
    | 'fork_head'
    | 'default_branch'
    | 'branch_out_of_scope'
    | 'head_sha_mismatch'

/** PR head 的最小视图（`pulls.get` 的 `head`）。 */
export interface PullRequestHead {
    ref: string
    sha: string
    /** head 所属仓库（`owner/name`）；fork PR 时与目标仓库不同，可能为 null（源仓库已删除） */
    repoFullName: string | null
}

/**
 * 关闭后回收 head 分支。
 *
 * @param params.expectedHeadSha - 触发本次反馈的 `PRCheck.headSha`（sha 不一致即跳过）
 * @returns 处置结局（审计事件始终写入，失败不外抛）
 */
export async function cleanupClosedPullRequestBranch(params: {
    octokit: Octokit
    repository: Pick<Repository, 'id' | 'owner' | 'name' | 'defaultBranch'>
    run: Pick<ScanRun, 'id'>
    expectedHeadSha: string
    head: PullRequestHead
}): Promise<ClosedPrCleanupOutcome> {
    const { octokit, repository, run, expectedHeadSha, head } = params
    const skip = async (reason: ClosedPrCleanupSkipReason): Promise<ClosedPrCleanupOutcome> => {
        await recordDeliveryCleanupEvent(repository, run, head.ref, 'skipped', reason)
        return 'skipped'
    }

    // 仓库全名比较忽略大小写：owner/name 来自用户输入，GitHub 返回的是规范大小写（只跳过不删，方向安全）
    const expectedRepo = `${repository.owner}/${repository.name}`.toLowerCase()
    if (head.repoFullName?.toLowerCase() !== expectedRepo) {
        return skip('fork_head')
    }
    if (head.ref === repository.defaultBranch) {
        return skip('default_branch')
    }
    if (!head.ref.startsWith(DEPENDFIX_BRANCH_PREFIX)) {
        return skip('branch_out_of_scope')
    }
    if (head.sha.toLowerCase() !== expectedHeadSha.toLowerCase()) {
        return skip('head_sha_mismatch')
    }

    try {
        await deleteRemoteBranch(octokit, repository.owner, repository.name, head.ref)
        await recordDeliveryCleanupEvent(repository, run, head.ref, 'deleted')
        return 'deleted'
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await recordDeliveryCleanupEvent(repository, run, head.ref, 'failed', sanitizeString(message))
        return 'failed'
    }
}
