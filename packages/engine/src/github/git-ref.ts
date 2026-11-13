// git-ref.ts — 交付结果所需的仓库引用读取（分支名 / HEAD 提交）。
//
// 只服务「交付记录」：引擎在进程内完成 push / PR 时，结果契约需要 branch 与 commitSha
// 作为单一事实源（平台据此展示与失败清理）。读取本身不改变仓库状态。
import { runGitOrThrow } from './git-run'

/** 读取当前分支名（detached HEAD 返回 `HEAD`，调用方不得据此删分支）。 */
export async function readCurrentBranch(workDir: string): Promise<string> {
    const stdout = await runGitOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: workDir,
        what: 'read current branch',
    })
    return stdout.trim()
}

/** 读取当前 HEAD 的完整提交 SHA。 */
export async function readHeadCommit(workDir: string): Promise<string> {
    const stdout = await runGitOrThrow(['rev-parse', 'HEAD'], {
        cwd: workDir,
        what: 'read HEAD commit',
    })
    return stdout.trim()
}
