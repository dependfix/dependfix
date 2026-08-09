import { createGitHubClient, deleteRemoteBranch, getBranchPrStatus, listDependfixBranches } from '@dependfix/engine'
import { isValidRepoIdentifier } from '@dependfix/core'
import { requireToken, toToolError } from './errors'

/** `cleanup_branches` 返回结构 */
export type CleanupBranchesResult =
    | {
        ok: true
        dryRun: boolean
        scanned: string[]
        /** 已删除分支（dry_run 时为空） */
        deleted: string[]
        /** 保留分支（open PR / 无 PR 未关闭） */
        kept: string[]
        /** 删除失败分支（best-effort，不中断） */
        failed: string[]
    }
    | { ok: false, error: string }

/**
 * `cleanup_branches`：清理已合并/已关闭的 dependfix 分支（非交互）。
 *
 * 复用 cli pr-creator 底层函数自编排，语义对齐 `autoCleanupMergedBranches`：
 * - 只处理 `dependfix/` 前缀分支（listDependfixBranches 已过滤）
 * - 删除候选 = 已合并（merged）+ 已关闭未合并（orphaned）；绝不触碰 open PR 分支
 * - 单分支删除失败记录到 `failed`，不中断其余删除（best-effort）
 * - dry_run 仅列清单（deleted/failed 为空）
 *
 * 刻意不走 DependfixApp 的 cleanup-branches mode：`runBranchCleanupForRepo`
 * 含交互式确认（非 TTY 默认拒绝），MCP stdio 下不可用。
 */
export const cleanupBranches = async (input: { repo: string, dry_run?: boolean }): Promise<CleanupBranchesResult> => {
    const token = requireToken()
    if (typeof token !== 'string') {
        return token
    }
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = input.repo.split('/')
    const dryRun = input.dry_run ?? false

    try {
        const client = createGitHubClient({ token })
        const branches = await listDependfixBranches(client, owner, repo)
        const statuses = await Promise.all(
            branches.map((branch) => getBranchPrStatus(client, owner, repo, branch)),
        )

        const merged = statuses.filter((s) => s.merged)
        const orphaned = statuses.filter((s) => s.closed && !s.merged)
        const kept = statuses.filter((s) => !s.closed)
        const candidates = [...merged, ...orphaned]

        if (dryRun) {
            return {
                ok: true,
                dryRun: true,
                scanned: branches,
                deleted: [],
                kept: kept.map((s) => s.branch),
                failed: [],
            }
        }

        const deleted: string[] = []
        const failed: string[] = []
        for (const s of candidates) {
            try {
                await deleteRemoteBranch(client, owner, repo, s.branch)
                deleted.push(s.branch)
            } catch {
                // 单分支删除失败（分支保护/不存在）不中断其余删除，best-effort
                failed.push(s.branch)
            }
        }

        return {
            ok: true,
            dryRun: false,
            scanned: branches,
            deleted,
            kept: kept.map((s) => s.branch),
            failed,
        }
    } catch (error) {
        return toToolError(error)
    }
}
