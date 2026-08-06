// verification-gate.ts（原 cli/src 根目录）
// 验证门禁：修复（提交/PR）交付前的最后一道检查。
// 任一仓库验证失败时，记录审计、回滚修复改动，防止把未通过 lint/build/install
// 的坏改动提交给用户（曾导致坏 PR 被创建）。
import { execSync } from 'node:child_process'
import { toErrorMessage, type RepositoryResult } from '@dependfix/core'
import type { AppContext } from '../app/helpers'

/**
 * 返回验证失败的仓库列表（`verificationPassed === false`）。
 * 验证门禁：修复（提交/PR）前检查，任一仓库验证失败则不应交付改动。
 */
export function findVerificationFailedRepos(repoResults: RepositoryResult[]): string[] {
    return repoResults
        .filter((r) => r.verificationPassed === false)
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
export function rollbackChanges(workDir: string): void {
    execSync('git reset --hard HEAD', { cwd: workDir, stdio: 'pipe' })
}

/**
 * 执行验证门禁：任一仓库验证失败时记录审计、回滚修复改动，返回 true 表示应中止交付。
 *
 * - 先记录 `VERIFICATION_FAILED`（审计优先），再尝试回滚
 * - 回滚失败（如非 git 仓库）追加 `ROLLBACK_FAILED`，不掩盖审计记录
 * - 运行前已存在用户未提交改动时**不自动回滚**（避免静默销毁本地工作），
 *   仅 warn 提示手动处理
 * - 注意：验证的是"修复后工作区"而非"修复增量"；多仓库共享 workDir 时，
 *   任一仓库失败会全量回滚（归因局限见 todo.md G3）
 */
export function enforceVerificationGate(
    ctx: Pick<AppContext, 'logger' | 'workDir' | 'allErrors' | 'repoResults'>,
    options: { preExistingDirty: boolean, action: 'pr' | 'commit' },
): boolean {
    const failedRepos = findVerificationFailedRepos(ctx.repoResults)
    if (failedRepos.length === 0) {
        return false
    }

    const { logger, workDir, allErrors } = ctx
    const actionLabel = options.action === 'pr' ? 'PR creation' : 'local commit'
    const repoList = failedRepos.join(', ')
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

    try {
        rollbackChanges(workDir)
        logger.info('Changes rolled back')
    } catch (error: unknown) {
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
