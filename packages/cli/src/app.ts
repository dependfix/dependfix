import { join } from 'node:path'
import type { Octokit } from '@octokit/rest'
import {
    createLogger,
    filterAlerts,
    prioritizeAlerts,
    limitAlerts,
    generateMarkdownReport,
    generateJsonReport,
    writeReport,
    createEmptyRunSummary,
    toErrorMessage,
    type Logger,
    type NormalizedSecurityAlert,
    type RunResult,
    type RunSummary,
    type RepositoryResult,
    type FixAction,
    type FixError,
} from '@dependfix/core'
import { createGitHubClient } from './github/client'
import { enforceVerificationGate } from './verification-gate'
import { fetchDependabotAlerts } from './github/dependabot-fetcher'
import { fetchPnpmAuditAlerts } from './alerts/pnpm-audit-fetcher'
import { createFixBranch, stageAndCommit, pushBranch, createPullRequest, generatePRBody, computeFixFingerprint, computeFixAndPrPlan, findDependfixOpenPR, listDependfixBranches, getBranchPrStatus, deleteRemoteBranch, type DependfixBranchStatus } from './github/pr-creator'
import type { RuntimeConfig } from './config'
import { compareSemver, readLockfileVersion } from './fixers/dependency'
import { dedupeFixableAlerts, snapshotTrackedFiles, restoreTrackedFiles, quickVerifyProject } from './fix-helpers'
import { buildUpgradeGroups } from './fix-grouping'
import {
    buildCommitMessage,
    type AppContext,
    upgradeAlert,
    tryLockfileRepair,
    verifyProject,
    commitLocalChanges,
    hasGitChanges,
    ensureGitignore,
    closeSupersededPRs,
    reportCleanupCandidates,
    autoCleanupMergedBranches,
    confirmCleanup,
    computeSummary,
    buildRunResult,
    computeExitCode,
    dependabotAlertsTokenHint,
    pullRequestCreationHint,
    resolveAlertRepositories,
} from './app-helpers'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DependfixAppOptions {
    /** 已解析的运行时配置 */
    config: RuntimeConfig
    /** 工作目录（默认 `process.cwd()`） */
    workDir?: string
    /** 是否输出详细日志 */
    verbose?: boolean
    /** 自定义验证命令（覆盖默认命令链） */
    commands?: string[]
}

export interface DependfixRunResult {
    /** 结构化运行结果（用于报告生成） */
    result: RunResult
    /** 进程退出码：0=全部成功, 1=部分失败, 2=全部失败 */
    exitCode: number
}

// ---------------------------------------------------------------------------
// DependfixApp
// ---------------------------------------------------------------------------

export class DependfixApp {
    private readonly config: RuntimeConfig
    private readonly workDir: string
    private readonly logger: Logger
    private readonly verbose: boolean
    private readonly customCommands?: string[]
    private readonly runId: string

    private readonly allAlerts: NormalizedSecurityAlert[] = []
    private readonly allActions: FixAction[] = []
    private readonly allErrors: FixError[] = []
    private readonly repoResults: RepositoryResult[] = []
    private readonly summary: RunSummary = createEmptyRunSummary()
    private startedAt: string = ''
    private finishedAt: string = ''
    /** 运行前工作区是否已有未提交改动（验证门禁回滚保护：避免销毁用户本地工作） */
    private preExistingDirty = false

    constructor(options: DependfixAppOptions) {
        this.config = options.config
        this.workDir = options.workDir ?? process.cwd()
        this.verbose = options.verbose ?? false
        this.customCommands = options.commands
        this.runId = `dependfix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        this.logger = createLogger({
            name: 'dependfix',
            minLevel: this.verbose ? 'debug' : 'info',
        })
    }

    /** 供辅助方法使用的状态切片。 */
    private get ctx(): AppContext {
        return {
            config: this.config,
            workDir: this.workDir,
            logger: this.logger,
            customCommands: this.customCommands,
            runId: this.runId,
            allAlerts: this.allAlerts,
            allActions: this.allActions,
            allErrors: this.allErrors,
            repoResults: this.repoResults,
            summary: this.summary,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** 执行完整的编排流程，返回结构化结果和退出码。 */
    async run(): Promise<DependfixRunResult> {
        this.startedAt = new Date().toISOString()
        // 记录运行前工作区状态（验证门禁回滚时保护用户已有未提交改动）
        this.preExistingDirty = hasGitChanges(this.workDir)
        this.logger.info(`Starting dependfix run ${this.runId}`, {
            mode: this.config.mode,
            repositories: this.config.repositories,
        })

        try {
            await this.executeMode()
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`Unexpected error: ${message}`)
            this.allErrors.push({
                repository: '*',
                stage: 'report',
                category: 'FATAL',
                message,
            })
        }

        this.finishedAt = new Date().toISOString()
        computeSummary(this.ctx)

        const runResult = buildRunResult(this.ctx)
        const exitCode = computeExitCode(this.ctx)

        // 生成并写入报告
        try {
            const md = generateMarkdownReport(runResult)
            const json = generateJsonReport(runResult)
            writeReport(md, json, this.startedAt, this.runId)
            this.logger.info(`Reports written to ./dependfix-reports/`)
        } catch (reportError: unknown) {
            const message = toErrorMessage(reportError)
            this.logger.error(`Failed to write reports: ${message}`)
        }

        // 确保目标仓库的 .gitignore 忽略报告目录
        ensureGitignore(this.workDir)

        this.logger.info(`Run ${this.runId} completed`, { exitCode })
        return { result: runResult, exitCode }
    }

    // -----------------------------------------------------------------------
    // Mode dispatch
    // -----------------------------------------------------------------------

    private async executeMode(): Promise<void> {
        switch (this.config.mode) {
            case 'report-only':
                await this.executeReportMode()
                break
            case 'fix':
                await this.executeFixMode()
                break
            case 'fix-and-pr':
                await this.executeFixAndPrMode()
                break
            case 'cleanup-branches':
                await this.executeCleanupBranchesMode()
                break
        }
    }

    // -----------------------------------------------------------------------
    // report-only mode
    // -----------------------------------------------------------------------

    private async executeReportMode(): Promise<void> {
        const client = this.githubClientOrNull()
        for (const repo of resolveAlertRepositories(this.ctx)) {
            await this.processRepoForReport(client, repo)
        }
    }

    private async processRepoForReport(client: Octokit | null, repo: string): Promise<void> {
        const startTime = Date.now()
        const [owner, name] = repo.split('/')

        try {
            const alerts = await this.fetchAlerts(repo)
            const { filtered } = filterAlerts(alerts, { severityThreshold: this.config.severityThreshold })
            const prioritized = prioritizeAlerts(filtered)
            const { limited } = limitAlerts(prioritized, this.config.maxAlertsPerRepository)

            const defaultBranch = await this.fetchDefaultBranch(client, owner, name)

            this.allAlerts.push(...limited)
            this.repoResults.push({
                repository: repo,
                defaultBranch,
                alertsCount: limited.length,
                fixable: limited.filter((a) => a.fixable).length,
                fixed: 0,
                failed: 0,
                lockfileRepaired: false,
                durationMs: Date.now() - startTime,
            })

            this.logger.info(`Fetched ${limited.length} alerts for ${repo}`)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            const hint = dependabotAlertsTokenHint(error)
            this.logger.error(`Failed to fetch alerts for ${repo}: ${message}${hint ? ` — ${hint}` : ''}`)
            this.allErrors.push({
                repository: repo,
                stage: 'fetch',
                category: 'FETCH_FAILED',
                message: hint ? `${message}（${hint}）` : message,
            })
            this.repoResults.push({
                repository: repo,
                defaultBranch: '',
                alertsCount: 0,
                fixable: 0,
                fixed: 0,
                failed: 0,
                lockfileRepaired: false,
                durationMs: Date.now() - startTime,
            })
        }
    }

    // -----------------------------------------------------------------------
    // fix mode
    // -----------------------------------------------------------------------

    private async executeFixMode(): Promise<void> {
        const client = this.githubClientOrNull()
        for (const repo of resolveAlertRepositories(this.ctx)) {
            await this.processRepoForFix(client, repo)
        }

        // 修复完成后，按需在本地当前分支直接提交（不推送、不创建 PR）
        if (this.config.commit) {
            // 验证门禁：任一仓库验证失败 → 回滚，不提交坏改动
            if (enforceVerificationGate(this.ctx, { preExistingDirty: this.preExistingDirty, action: 'commit' })) {
                return
            }

            try {
                commitLocalChanges(this.ctx)
            } catch (error: unknown) {
                const message = toErrorMessage(error)
                this.logger.error(`Local commit failed: ${message}`)
                this.allErrors.push({
                    repository: '*',
                    stage: 'fix',
                    category: 'COMMIT_FAILED',
                    message,
                })
            }
        }
    }

    private async processRepoForFix(client: Octokit | null, repo: string): Promise<void> {
        const startTime = Date.now()
        const [owner, name] = repo.split('/')
        let alertsCount = 0
        let fixable = 0
        let fixed = 0
        let failed = 0
        let lockfileRepaired = false
        let verificationPassed: boolean | undefined
        let defaultBranch = ''

        try {
            // 1. Fetch alerts（github-dependabot：alertsClient 使用 alertsToken，主 token 无法读取 Dependabot alerts；
            //    pnpm-audit：本地 `pnpm audit --json`，无 token）
            const rawAlerts = await this.fetchAlerts(repo)
            const { filtered } = filterAlerts(rawAlerts, { severityThreshold: this.config.severityThreshold })
            const prioritized = prioritizeAlerts(filtered)
            const { limited } = limitAlerts(prioritized, this.config.maxAlertsPerRepository)
            alertsCount = limited.length
            fixable = limited.filter((a) => a.fixable).length

            defaultBranch = await this.fetchDefaultBranch(client, owner, name)

            this.allAlerts.push(...limited)

            // 2. Upgrade fixable dependencies（T213 分组升级 + G3 同包收敛）
            // - 同包多个 alerts 去重，取最高 recommendedVersion（避免互相覆盖/降级）
            // - 分组：显式分组 > dependabot.yml groups > @types 归并 > scope/前缀启发式 > 单包
            // - 组级验证（lint）失败 → 整组回滚 → 拆组逐个重试（坏包隔离）
            // - 当前版本已 >= 目标版本时跳过（不降级保护）
            const fixableAlerts = dedupeFixableAlerts(
                limited.filter((a) => a.fixable && a.recommendedVersion),
            )
            const lockfilePath = join(this.workDir, 'pnpm-lock.yaml')

            const { groups, cleanupCandidates } = buildUpgradeGroups(fixableAlerts, {
                workDir: this.workDir,
                explicitGroups: this.config.upgradeGroups,
            })
            for (const group of groups) {
                this.logger.info(`[group] ${group.name} (${group.source}): ${group.packages.join(', ')}`)
            }
            if (cleanupCandidates.length > 0) {
                this.logger.warn(
                    `[group] orphan @types detected (main package removed) — not upgrading, consider removal: ${cleanupCandidates.join(', ')}`,
                )
            }

            const alertByPackage = new Map(fixableAlerts.map((a) => [a.packageName, a]))
            let snapshot: ReturnType<typeof snapshotTrackedFiles>

            for (const group of groups) {
                // 组前快照（整组回滚基线）
                snapshot = snapshotTrackedFiles(this.workDir)

                const pendingActions: FixAction[] = []
                const upgradedInGroup: NormalizedSecurityAlert[] = []

                for (const packageName of group.packages) {
                    // 防御：assign 已通过 target 集合过滤，组内包必在 fixableAlerts 中
                    const alert = alertByPackage.get(packageName)
                    if (!alert) {
                        continue
                    }

                    const currentVersion = readLockfileVersion(lockfilePath, alert.packageName)
                    if (currentVersion && compareSemver(currentVersion, alert.recommendedVersion) >= 0) {
                        this.logger.info(
                            `Skipping ${alert.packageName}: current ${currentVersion} >= target ${alert.recommendedVersion} (no upgrade needed)`,
                        )
                        this.summary.alertsSkipped++
                        continue
                    }
                    if (currentVersion === null) {
                        // lockfile 格式非 v9（pnpm <9 / peer 后缀条目）时无法解析当前版本，
                        // 不降级保护失效——warn 提示（G3 遗留：P2-1）
                        this.logger.warn(
                            `Could not resolve current version of ${alert.packageName} from lockfile — no-downgrade protection inactive`,
                        )
                    }

                    const action = await upgradeAlert(this.ctx, alert)
                    pendingActions.push(action)
                    if (!action.success) {
                        failed++
                        continue
                    }
                    if (this.config.dryRun) {
                        // dry-run 无实际文件改动，跳过验证
                        fixed++
                        continue
                    }
                    upgradedInGroup.push(alert)
                }

                // dry-run 或组内无实际升级：仅记录 action，不做组级验证
                if (this.config.dryRun || upgradedInGroup.length === 0) {
                    this.allActions.push(...pendingActions)
                    continue
                }

                // 组级快速验证：lint 通过 → 整组保留（一次验证替代逐包 N 次验证）
                const groupOk = await quickVerifyProject(this.ctx, repo)
                if (groupOk) {
                    this.allActions.push(...pendingActions)
                    fixed += upgradedInGroup.length
                    this.logger.info(
                        `[group] ${group.name}: ${upgradedInGroup.length} upgrade(s) passed group verification`,
                    )
                    // 更新快照基线：后续组的失败回滚不应影响本组
                    snapshot = snapshotTrackedFiles(this.workDir)
                    continue
                }

                // 组级验证失败：整组回滚 → 拆组逐个重试（保留能单独通过的包）
                restoreTrackedFiles(this.workDir, snapshot)
                this.logger.warn(
                    `[group] ${group.name}: group verification failed — rolling back group, retrying per-package`,
                )

                // 组内升级失败的包：保留原始失败记录（已计 failed）
                for (const action of pendingActions) {
                    if (!action.success) {
                        this.allActions.push(action)
                    }
                }

                // 组内升级成功但组验证失败的包：逐个重新升级 + 验证
                for (const alert of upgradedInGroup) {
                    const action = await upgradeAlert(this.ctx, alert)
                    this.allActions.push(action)
                    if (!action.success) {
                        failed++
                        continue
                    }
                    const quickOk = await quickVerifyProject(this.ctx, repo)
                    if (!quickOk) {
                        restoreTrackedFiles(this.workDir, snapshot)
                        this.logger.warn(
                            `Rolled back ${alert.packageName} upgrade: lint failed after upgrade (per-package verification)`,
                        )
                        action.success = false
                        action.error = 'lint failed after upgrade; per-package verification failed, changes rolled back'
                        failed++
                        continue
                    }
                    fixed++
                    // 更新快照基线：后续包的失败回滚不应影响本包
                    snapshot = snapshotTrackedFiles(this.workDir)
                }
            }

            // Track skipped (non-fixable) alerts
            const skippedCount = limited.length - fixableAlerts.length
            this.summary.alertsSkipped += skippedCount

            // 3. Lockfile repair
            const repairAction = tryLockfileRepair(this.ctx, repo)
            this.allActions.push(repairAction)
            if (repairAction.success) {
                lockfileRepaired = true
            }

            // 4. Verification (skip in dry-run mode)
            if (!this.config.dryRun) {
                const verifyActions = await verifyProject(this.ctx, repo)
                this.allActions.push(...verifyActions)
                verificationPassed = verifyActions.every((a) => a.success)
            } else {
                this.logger.info(`[dry-run] Skipping verification for ${repo}`)
                verificationPassed = undefined
            }
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            const hint = dependabotAlertsTokenHint(error)
            this.logger.error(`Failed to process ${repo}: ${message}${hint ? ` — ${hint}` : ''}`)
            this.allErrors.push({
                repository: repo,
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message: hint ? `${message}（${hint}）` : message,
            })
        }

        this.repoResults.push({
            repository: repo,
            defaultBranch,
            alertsCount,
            fixable,
            fixed,
            failed,
            lockfileRepaired,
            verificationPassed,
            durationMs: Date.now() - startTime,
        })
    }

    // -----------------------------------------------------------------------
    // fix-and-pr mode
    // -----------------------------------------------------------------------

    /**
     * 修复 → 计算内容指纹 → 查重 →（同指纹跳过 / 异指纹关旧开新）。
     *
     * 去重语义（T210）：
     * - 同告警集 → 同修复结果 → 同指纹 → 跳过，不重复提交相同 PR
     * - 内容变化 → 先创建新 PR（body 注明 Supersedes），成功后关闭旧 PR；
     *   新 PR 创建失败时保留旧 PR，避免出现"无 PR 窗口"
     */
    private async executeFixAndPrMode(): Promise<void> {
        const client = this.createClient()

        // 1. Run fix pipeline for all repos (same as fix mode)
        // （config 校验已保证 fix-and-pr 仅 github-dependabot 源，client 恒非 null）
        for (const repo of this.config.repositories) {
            await this.processRepoForFix(client, repo)
        }

        // 1.5 Optional: report merged dependfix branches for manual cleanup.
        // 在 early return 之前执行，保证"PR 已存在（skip）"等高频路径也能输出清单。
        // cleanup-branches-auto 开启时跳过报告（避免同一分支同时出现"待清理"与"已删除"记录）。
        if (this.config.cleanupBranches && !this.config.cleanupBranchesAuto) {
            await reportCleanupCandidates(this.ctx, client)
        }

        // 1.6 Optional: auto-delete merged/closed dependfix branches（非交互）。
        // 与 cleanup-branches 可同时开启（报告 + 删除）。
        if (this.config.cleanupBranchesAuto) {
            for (const repo of this.config.repositories) {
                await autoCleanupMergedBranches(this.ctx, client, repo)
            }
        }

        // 2. Verification gate：任一仓库验证失败 → 回滚修复改动并跳过 PR 创建。
        // 避免把未通过 lint/build/install 的坏改动提交给用户（曾导致坏 PR 被创建）。
        if (enforceVerificationGate(this.ctx, { preExistingDirty: this.preExistingDirty, action: 'pr' })) {
            return
        }

        // 3. Check if there are changes to commit (skip dry-run)
        if (this.config.dryRun) {
            this.logger.info('[dry-run] Would create branch, commit, push, and PR')
            return
        }

        if (!hasGitChanges(this.workDir)) {
            this.logger.info('No changes to commit — skipping PR creation')
            return
        }

        if (this.config.repositories.length === 0) {
            return
        }
        const firstRepo = this.config.repositories[0]
        const [owner, repo] = firstRepo.split('/')

        try {
            // 3. Compute content fingerprint from actual fix results
            const fingerprint = computeFixFingerprint(this.allActions)
            this.logger.info(`Fix fingerprint: ${fingerprint}`)

            // 4. Dedup: decide skip / supersede based on existing dependfix open PRs
            const existingPRs = await findDependfixOpenPR(client, owner, repo)
            const plan = computeFixAndPrPlan(existingPRs, fingerprint)

            if (plan.action === 'skip' && plan.sameContentPR) {
                this.logger.info(
                    `Open PR #${plan.sameContentPR.number} already contains identical fixes — skipping PR creation`,
                )
                this.allActions.push({
                    type: 'dependency-upgrade',
                    repository: firstRepo,
                    target: `PR #${plan.sameContentPR.number} (existing)`,
                    fromVersion: undefined,
                    toVersion: plan.sameContentPR.htmlUrl,
                    isMajor: false,
                    success: true,
                    durationMs: 0,
                })

                // 关闭并存的异指纹旧 PR（保持"永远单线"，异常态也收敛）
                await closeSupersededPRs(this.ctx, client, owner, repo, plan.supersedePRs)
                return
            }

            if (plan.supersedePRs.length > 0) {
                this.logger.info(
                    `Existing PR(s) with different content will be superseded: ${plan.supersedePRs.map((pr) => `#${pr.number}`).join(', ')}`,
                )
            }

            // 5. Create fix branch (content-addressed) + commit + push
            const branchName = `dependfix/auto-fix-${fingerprint}`
            createFixBranch(branchName, this.workDir)
            this.logger.info(`Creating fix branch: ${branchName}`)

            this.logger.info('Staging and committing changes')
            stageAndCommit(buildCommitMessage(this.allActions), this.workDir)

            this.logger.info(`Pushing branch: ${branchName}`)
            pushBranch(branchName, this.workDir)

            // 6. Create PR (one PR covering all repos)
            const defaultBranch = await this.fetchDefaultBranch(client, owner, repo)

            // Build RunResult for PR body
            computeSummary(this.ctx)
            const runResult = buildRunResult(this.ctx)
            const prBody = generatePRBody(
                runResult,
                plan.supersedePRs.map((pr) => pr.number),
            )
            const prTitle = `fix(deps): automated security fix — ${this.summary.alertsFixed} upgrades`

            const pr = await createPullRequest({
                octokit: client,
                owner,
                repo,
                headBranch: branchName,
                baseBranch: defaultBranch,
                title: prTitle,
                body: prBody,
            })

            this.logger.info(`PR created: ${pr.htmlUrl}`)

            // Record PR as a fix action before closing superseded PRs,
            // so a close failure never hides the successfully created PR
            this.allActions.push({
                type: 'dependency-upgrade',
                repository: firstRepo,
                target: `PR #${pr.number}`,
                fromVersion: undefined,
                toVersion: pr.htmlUrl,
                isMajor: false,
                success: true,
                durationMs: 0,
            })

            // 7. Close superseded PRs only after new PR created successfully
            await closeSupersededPRs(this.ctx, client, owner, repo, plan.supersedePRs)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            const hint = pullRequestCreationHint(error)
            this.logger.error(`PR creation failed: ${message}${hint ? ` — ${hint}` : ''}`)
            this.allErrors.push({
                repository: this.config.repositories[0] ?? '*',
                stage: 'report',
                category: 'PR_CREATION_FAILED',
                message: hint ? `${message}（${hint}）` : message,
            })
        }
    }

    // -----------------------------------------------------------------------
    // cleanup-branches mode
    // -----------------------------------------------------------------------

    /**
     * 清理已合并（或已关闭）的 dependfix 分支。
     *
     * - 分类：已合并（安全清理）/ 已关闭未合并（supersede 孤儿）/ open（跳过）
     * - 删除前必须交互式确认（y/N）；非 TTY 环境（CI）默认拒绝
     * - 只删 `dependfix/` 前缀分支，绝不触碰 open PR 对应分支
     * - dry-run 模式仅列清单并打印 "would delete"，不执行删除
     */
    private async executeCleanupBranchesMode(): Promise<void> {
        const client = this.createClient()

        for (const repo of this.config.repositories) {
            const [owner, name] = repo.split('/')
            try {
                const branches = await listDependfixBranches(client, owner, name)
                if (branches.length === 0) {
                    this.logger.info(`[cleanup] ${repo}: no dependfix branches found`)
                    continue
                }

                const statuses: DependfixBranchStatus[] = []
                for (const branch of branches) {
                    statuses.push(await getBranchPrStatus(client, owner, name, branch))
                }

                const merged = statuses.filter((s) => s.merged)
                const orphaned = statuses.filter((s) => s.closed && !s.merged)
                const open = statuses.filter((s) => !s.closed)

                this.logger.info(
                    `[cleanup] ${repo}: ${merged.length} merged, ${orphaned.length} closed, ${open.length} kept`,
                )
                for (const s of merged) {
                    this.logger.info(`  [merged] ${s.branch}${s.prNumber ? ` (PR #${s.prNumber})` : ''}`)
                }
                for (const s of orphaned) {
                    this.logger.info(`  [closed] ${s.branch}${s.prNumber ? ` (PR #${s.prNumber})` : ''}`)
                }
                for (const s of open) {
                    const label = s.prNumber ? `[open — kept]` : `[no PR — kept]`
                    this.logger.info(`  ${label} ${s.branch}${s.prNumber ? ` (PR #${s.prNumber})` : ''}`)
                }

                const candidates = [...merged, ...orphaned]
                if (candidates.length === 0) {
                    this.logger.info('[cleanup] nothing to delete')
                    continue
                }

                if (this.config.dryRun) {
                    this.logger.info(`[dry-run] Would delete ${candidates.length} branch(es): ${candidates.map((s) => s.branch).join(', ')}`)
                    continue
                }

                if (!(await confirmCleanup(this.ctx, repo, candidates))) {
                    this.logger.info('[cleanup] cancelled by user')
                    continue
                }

                for (const s of candidates) {
                    try {
                        await deleteRemoteBranch(client, owner, name, s.branch)
                        this.logger.info(`Deleted branch: ${s.branch}`)
                        this.allActions.push({
                            type: 'branch-cleanup',
                            repository: repo,
                            target: s.branch,
                            success: true,
                            diff: s.merged ? 'merged' : 'closed',
                            durationMs: 0,
                        })
                    } catch (error: unknown) {
                        const message = toErrorMessage(error)
                        this.logger.error(`Failed to delete branch ${s.branch}: ${message}`)
                        this.allErrors.push({
                            repository: repo,
                            stage: 'report',
                            category: 'BRANCH_DELETE_FAILED',
                            message: `Failed to delete ${s.branch}: ${message}`,
                        })
                    }
                }
            } catch (error: unknown) {
                const message = toErrorMessage(error)
                this.logger.error(`[cleanup] failed for ${repo}: ${message}`)
                this.allErrors.push({
                    repository: repo,
                    stage: 'report',
                    category: 'CLEANUP_FAILED',
                    message,
                })
            }
        }
    }

    // -----------------------------------------------------------------------
    // GitHub helpers
    // -----------------------------------------------------------------------

    /**
     * 告警数据源统一入口：
     * - `github-dependabot`：Octokit 拉取 Dependabot alerts（alertsToken 优先）
     * - `pnpm-audit`：本地 `pnpm audit --json` 回退（无 token；repository 已由 resolveAlertRepositories 解析）
     */
    private async fetchAlerts(repo: string): Promise<NormalizedSecurityAlert[]> {
        if (this.config.alertSource === 'pnpm-audit') {
            return fetchPnpmAuditAlerts({ workDir: this.workDir, repository: repo })
        }
        const alertsClient = this.createAlertsClient()
        const [owner, name] = repo.split('/')
        return fetchDependabotAlerts(alertsClient, { owner, repo: name })
    }

    /** pnpm-audit 模式不创建 GitHub client（无 token）；github-dependabot 模式返回主 token client。 */
    private githubClientOrNull(): Octokit | null {
        if (this.config.alertSource === 'pnpm-audit') {
            return null
        }
        return this.createClient()
    }

    private createClient(token: string = this.config.githubToken): Octokit {
        return createGitHubClient({ token })
    }

    /**
     * 拉取 Dependabot alerts 使用的 client（双 token 设计）：
     * 优先使用 `alertsToken`（最小权限：仅 Dependabot alerts: read），
     * 缺省回退主 token（本地完整 PAT 场景）。
     * 背景详见 docs/plan/todo.md「已知缺口 G2」。
     */
    private createAlertsClient(): Octokit {
        return this.createClient(this.config.alertsToken || this.config.githubToken)
    }

    /**
     * 获取仓库的默认分支。
     * pnpm-audit 模式 client 为 null → 返回 ''（报告显示 local）。
     * 失败时返回 `'unknown'`（不阻塞主流程）。
     */
    private async fetchDefaultBranch(client: Octokit | null, owner: string, repo: string): Promise<string> {
        if (!client) {
            return ''
        }
        try {
            const { data } = await client.rest.repos.get({ owner, repo })
            return data.default_branch
        } catch {
            return 'unknown'
        }
    }
}
