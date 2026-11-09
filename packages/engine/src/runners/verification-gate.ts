// verification-gate.ts（原 cli/src 根目录）
// 验证门禁：修复（提交/PR）交付前的最后一道检查。
// 任一仓库验证失败时，记录审计、回滚修复改动，防止把未通过 lint/build/typecheck/test/install
// 的坏改动提交给用户（曾导致坏 PR 被创建）。
import { formatVerificationSkipReason, toErrorMessage, type RepositoryResult } from '@dependfix/core'
import { isGitRepository, type AppContext } from '../app/helpers'
import { GitCommandError, runGitOrThrow } from '../github/git-run'

/**
 * 单仓库是否被「本次改动引入的验证失败」阻断。
 *
 * 判定口径（既有失败基线，**单一事实源**——交付门禁与退出码共用，避免同一字段在两处被
 * 解读为相反语义）：
 * - 优先用 `verificationBlocking`（**本次改动引入**的验证失败）：既有基线失败（目标仓库
 *   修复前即为红，如长期失败的测试套件）不归因本次改动，因此不阻断交付
 * - `verificationBlocking` 未提供（旧数据 / 非本版本产物）时回退 `verificationPassed === false`
 *   ——保持既有语义，避免调用方漏传字段时静默放过
 */
export function isRepoVerificationBlocked(
    repo: Pick<RepositoryResult, 'verificationPassed' | 'verificationBlocking'>,
): boolean {
    return repo.verificationBlocking ?? (repo.verificationPassed === false)
}

/** 返回需要阻断交付（回滚）的仓库列表（判定口径见 [isRepoVerificationBlocked]）。 */
export function findVerificationFailedRepos(repoResults: RepositoryResult[]): string[] {
    return repoResults
        .filter((r) => isRepoVerificationBlocked(r))
        .map((r) => r.repository)
}

/**
 * 回滚修复产生的所有未提交改动（验证失败时调用）。
 *
 * - `git reset --hard HEAD`：丢弃工作区与暂存区的修复改动（package.json /
 *   pnpm-lock.yaml / pnpm-workspace.yaml / overrides 等已跟踪文件）
 * - 报告目录 `dependfix-reports/` 已被 .gitignore 忽略，不受影响
 * - 仅限验证失败且尚未提交的场景；不清理未跟踪文件（避免误删用户文件；
 *   node_modules 等未跟踪目录保留，下次 install 自愈）
 */
export async function rollbackChanges(workDir: string): Promise<void> {
    // 受管异步：取消 / 超时期间回滚也必须可被进程树终止，且不阻塞事件循环
    await runGitOrThrow(['reset', '--hard', 'HEAD'], { cwd: workDir, what: 'rollback worktree' })
}

/**
 * 执行验证门禁：任一仓库验证失败时记录审计、回滚修复改动，返回 true 表示应中止交付。
 *
 * - 先记录 `VERIFICATION_FAILED`（审计优先），再尝试回滚
 * - 回滚失败（如仓库 HEAD 不可解析 / 工作树只读）追加 `ROLLBACK_FAILED`，不掩盖审计记录
 * - 运行前已存在用户未提交改动时**不自动回滚**（避免静默销毁本地工作），
 *   仅 warn 提示手动处理
 * - **非 git 仓库不回滚**（无工作树，`git reset --hard` 必然失败）→ 仅 warn，避免以
 *   `ROLLBACK_FAILED` 掩盖真实失败原因（结论仍为「应中止交付」）
 * - 判定用 `verificationBlocking`（本次改动引入的失败）；修复前即红的既有失败
 *   （`PRE_EXISTING_FAILURE`）不阻断交付
 * - 注意：验证的是"修复后工作区"而非"修复增量"；`finalizeRepoFix` 会先尝试
 *   回退最近一个已通过 probe 的单元并重验一次（默认 `rollbackGranularity=unit`）；
 *   本函数仍是最终逃生路径——选择性回滚不可用 / 重验仍失败时执行整仓 `git reset --hard`
 * - 多仓库共享 workDir 时文件级改动无法按仓拆分；选择性回滚按当前仓库最近 checkpoint 处理，
 *   失败时显式记录 `ROLLBACK_GRANULARITY_DEGRADED` 后退回整仓回滚
 */
export async function enforceVerificationGate(
    ctx: Pick<AppContext, 'logger' | 'workDir' | 'allErrors' | 'repoResults'>,
    options: { preExistingDirty: boolean, action: 'pr' | 'commit' },
): Promise<boolean> {
    const failedRepos = findVerificationFailedRepos(ctx.repoResults)
    if (failedRepos.length === 0) {
        return false
    }

    const { logger, workDir, allErrors } = ctx

    // 主动跳过的终验（`verificationSkipped`）不得折叠成「验证通过」，也不等同「验证失败」：
    // 不交付（保守，未经完整验证的改动不上抛），但**不回滚**（保留已通过单元供人工复核），
    // 且不写 `VERIFICATION_FAILED`（跳过原因已在验证入口 / 收尾记录）。
    // 与真实失败并存时，仅对真实失败仓库走失败 / 回滚路径（共享 workDir 的回滚语义不变）。
    // 0 写入跳过（`no-write`）不属于本分支：其 `verificationBlocking=false`（无改动即无可归因失败），
    // 在 [findVerificationFailedRepos] 就已排除，不会阻断其他仓库的交付。
    const skippedResults = ctx.repoResults.filter((result) => (
        failedRepos.includes(result.repository) && result.verificationSkipped !== undefined
    ))
    const realFailedRepos = failedRepos.filter((repo) => (
        !skippedResults.some((result) => result.repository === repo)
    ))
    if (skippedResults.length > 0 && realFailedRepos.length === 0) {
        logger.warn(
            `Verification skipped for: ${skippedResults
                .map((result) => `${result.repository} (${formatVerificationSkipReason(result.verificationSkipped!)})`)
                .join(', ')} — delivery skipped (worktree preserved; no changes were rolled back)`,
        )
        return true
    }
    if (skippedResults.length > 0) {
        logger.warn(
            `Verification skipped for: ${skippedResults.map((result) => result.repository).join(', ')} `
            + '— not counted as verification failures; continuing with real failures',
        )
    }
    const actionLabel = options.action === 'pr' ? 'PR creation' : 'local commit'
    const repoList = realFailedRepos.join(', ')
    logger.error(`Verification failed for: ${repoList} — skipping ${actionLabel}`)

    // 审计优先：先记录失败，再执行回滚（回滚失败也不丢失审计）
    allErrors.push({
        repository: repoList,
        stage: 'verify',
        category: 'VERIFICATION_FAILED',
        message: `Verification failed for ${repoList}; ${options.action === 'pr' ? 'PR not created' : 'commit skipped'}`,
    })

    if (options.preExistingDirty) {
        logger.warn(
            'Detected pre-existing uncommitted changes before this run — skipped auto rollback to avoid destroying user work; please resolve the worktree manually',
        )
        return true
    }

    if (!isGitRepository(workDir)) {
        // 非 git 仓库：没有可回滚的工作树（`git reset --hard` 必然失败）→ 跳过回滚并说明，
        // 避免以 ROLLBACK_FAILED 掩盖真实失败原因（门禁结论仍为「应中止交付」）
        logger.warn('工作目录不是 git 仓库 — 跳过验证失败回滚（无可回滚工作树）')
        return true
    }

    try {
        await rollbackChanges(workDir)
        logger.info('Changes rolled back')
    } catch (error: unknown) {
        // 运行级取消期间回滚被前置守卫拦下（未产生子进程）：工作区交由调用方清理（平台删运行目录 /
        // CLI 用户自行处理），不记 ROLLBACK_FAILED 以免把「主动取消」渲染成回滚故障
        if (error instanceof GitCommandError && error.aborted && !error.started) {
            logger.warn('Run aborted before rollback started — worktree left as-is (caller cleans up)')
            return true
        }
        const message = toErrorMessage(error)
        logger.error(`Rollback failed: ${message}`)
        allErrors.push({
            repository: repoList,
            stage: 'verify',
            category: 'ROLLBACK_FAILED',
            message: `Rollback failed after verification failure: ${message}`,
        })
    }
    return true
}
