import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createInterface } from 'node:readline'
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
    type RunReportConfig,
    type RepositoryResult,
    type FixAction,
    type FixError,
} from '@dependfix/core'
import { createGitHubClient } from './github/client'
import { fetchDependabotAlerts } from './github/dependabot-fetcher'
import { upgradeDependency, overrideTransitiveDependency, type DependencyFixResult } from './fixers/dependency'
import { repairLockfile, type LockfileRepairResult } from './fixers/pnpm'
import { runVerification, type VerificationResult } from './runners/verification-runner'
import {
    createFixBranch,
    stageAndCommit,
    pushBranch,
    createPullRequest,
    generatePRBody,
    computeFixFingerprint,
    computeFixAndPrPlan,
    findDependfixOpenPR,
    closePullRequest,
    listDependfixBranches,
    getBranchPrStatus,
    deleteRemoteBranch,
    isConfirmAnswer,
    type DependfixBranchStatus,
} from './github/pr-creator'
import type { RuntimeConfig } from './config'

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
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_VERIFY_COMMANDS = [
    'pnpm install --frozen-lockfile',
    'pnpm lint',
    'pnpm build',
]

/** 匹配 `pnpm <singleWord>` 模式的命令（可能是 package.json script 引用） */
const PNPM_SCRIPT_RE = /^pnpm\s+([a-zA-Z][a-zA-Z0-9:_-]*)$/

/** 自动修复提交的标准消息（本地 --commit 与 fix-and-pr 共用） */
const FIX_COMMIT_MESSAGE = 'fix(deps): automated dependfix security repair'

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

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** 执行完整的编排流程，返回结构化结果和退出码。 */
    async run(): Promise<DependfixRunResult> {
        this.startedAt = new Date().toISOString()
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
        this.computeSummary()

        const runResult = this.buildRunResult()
        const exitCode = this.computeExitCode()

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
        this.ensureGitignore()

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
        const client = this.createClient()
        for (const repo of this.config.repositories) {
            await this.processRepoForReport(client, repo)
        }
    }

    private async processRepoForReport(client: Octokit, repo: string): Promise<void> {
        const startTime = Date.now()
        const [owner, name] = repo.split('/')

        try {
            const alerts = await fetchDependabotAlerts(client, { owner, repo: name })
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
            this.logger.error(`Failed to fetch alerts for ${repo}: ${message}`)
            this.allErrors.push({
                repository: repo,
                stage: 'fetch',
                category: 'FETCH_FAILED',
                message,
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
        const client = this.createClient()
        for (const repo of this.config.repositories) {
            await this.processRepoForFix(client, repo)
        }

        // 修复完成后，按需在本地当前分支直接提交（不推送、不创建 PR）
        if (this.config.commit) {
            try {
                this.commitLocalChanges()
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

    private async processRepoForFix(client: Octokit, repo: string): Promise<void> {
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
            // 1. Fetch alerts
            const rawAlerts = await fetchDependabotAlerts(client, { owner, repo: name })
            const { filtered } = filterAlerts(rawAlerts, { severityThreshold: this.config.severityThreshold })
            const prioritized = prioritizeAlerts(filtered)
            const { limited } = limitAlerts(prioritized, this.config.maxAlertsPerRepository)
            alertsCount = limited.length
            fixable = limited.filter((a) => a.fixable).length

            defaultBranch = await this.fetchDefaultBranch(client, owner, name)

            this.allAlerts.push(...limited)

            // 2. Upgrade fixable dependencies
            const fixableAlerts = limited.filter((a) => a.fixable && a.recommendedVersion)
            for (const alert of fixableAlerts) {
                const action = await this.upgradeAlert(alert)
                this.allActions.push(action)
                if (action.success) {
                    fixed++
                } else {
                    failed++
                }
            }

            // Track skipped (non-fixable) alerts
            const skippedCount = limited.length - fixableAlerts.length
            this.summary.alertsSkipped += skippedCount

            // 3. Lockfile repair
            const repairAction = this.tryLockfileRepair(repo)
            this.allActions.push(repairAction)
            if (repairAction.success) {
                lockfileRepaired = true
            }

            // 4. Verification (skip in dry-run mode)
            if (!this.config.dryRun) {
                const verifyActions = await this.verifyProject(repo)
                this.allActions.push(...verifyActions)
                verificationPassed = verifyActions.every((a) => a.success)
            } else {
                this.logger.info(`[dry-run] Skipping verification for ${repo}`)
                verificationPassed = undefined
            }
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`Failed to process ${repo}: ${message}`)
            this.allErrors.push({
                repository: repo,
                stage: 'fix',
                category: 'PROCESS_FAILED',
                message,
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
        for (const repo of this.config.repositories) {
            await this.processRepoForFix(client, repo)
        }

        // 1.5 Optional: report merged dependfix branches for manual cleanup.
        // 在 early return 之前执行，保证"PR 已存在（skip）"等高频路径也能输出清单。
        if (this.config.cleanupBranches) {
            await this.reportCleanupCandidates(client)
        }

        // 2. Check if there are changes to commit (skip dry-run)
        if (this.config.dryRun) {
            this.logger.info('[dry-run] Would create branch, commit, push, and PR')
            return
        }

        if (!this.hasGitChanges()) {
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
                await this.closeSupersededPRs(client, owner, repo, plan.supersedePRs)
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
            stageAndCommit(FIX_COMMIT_MESSAGE, this.workDir)

            this.logger.info(`Pushing branch: ${branchName}`)
            pushBranch(branchName, this.workDir)

            // 6. Create PR (one PR covering all repos)
            const defaultBranch = await this.fetchDefaultBranch(client, owner, repo)

            // Build RunResult for PR body
            this.computeSummary()
            const runResult = this.buildRunResult()
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
            await this.closeSupersededPRs(client, owner, repo, plan.supersedePRs)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`PR creation failed: ${message}`)
            this.allErrors.push({
                repository: this.config.repositories[0] ?? '*',
                stage: 'report',
                category: 'PR_CREATION_FAILED',
                message,
            })
        }
    }

    /**
     * 关闭被取代的旧 PR。单条关闭失败不中断其余 PR 的关闭，
     * 失败记录为 `PR_CLOSE_FAILED`（与 PR 创建失败区分）。
     */
    private async closeSupersededPRs(
        client: Octokit,
        owner: string,
        repo: string,
        supersedePRs: { number: number }[],
    ): Promise<void> {
        for (const old of supersedePRs) {
            try {
                await closePullRequest(client, owner, repo, old.number)
                this.logger.info(`Closed superseded PR #${old.number}`)
            } catch (error: unknown) {
                const message = toErrorMessage(error)
                this.logger.error(`Failed to close superseded PR #${old.number}: ${message}`)
                this.allErrors.push({
                    repository: `${owner}/${repo}`,
                    stage: 'report',
                    category: 'PR_CLOSE_FAILED',
                    message: `Failed to close PR #${old.number}: ${message}`,
                })
            }
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

                if (!(await this.confirmCleanup(repo, candidates))) {
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

    /**
     * 交互式确认删除。非 TTY（CI/管道）时直接拒绝。
     */
    private confirmCleanup(repo: string, candidates: { branch: string }[]): Promise<boolean> {
        if (!process.stdin.isTTY) {
            this.logger.warn('[cleanup] non-TTY environment — deletion requires interactive confirmation, aborting')
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

    /**
     * （fix-and-pr + --cleanup-branches）将已合并的 dependfix 分支列为待清理清单，
     * 记录到报告与日志，不执行删除。
     */
    private async reportCleanupCandidates(client: Octokit): Promise<void> {
        for (const repo of this.config.repositories) {
            const [owner, name] = repo.split('/')
            try {
                const branches = await listDependfixBranches(client, owner, name)
                for (const branch of branches) {
                    const status = await getBranchPrStatus(client, owner, name, branch)
                    if (status.merged) {
                        this.logger.info(`[cleanup] merged branch awaiting manual cleanup: ${branch}`)
                        this.allActions.push({
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
                this.logger.error(`[cleanup] detection failed for ${repo}: ${message}`)
                this.allErrors.push({
                    repository: repo,
                    stage: 'report',
                    category: 'CLEANUP_DETECT_FAILED',
                    message,
                })
            }
        }
    }

    /**
     * 将修复产生的变更提交到本地当前分支。
     *
     * - 无任何变更（含已暂存变更）时跳过
     * - config 校验已保证 `commit` 与 `dryRun` / `createPullRequest` 互斥，
     *   因此这里不需要再检查这两个开关
     */
    private commitLocalChanges(): void {
        if (!this.hasGitChanges()) {
            this.logger.info('No changes to commit — skipping local commit')
            return
        }

        // 提交前先确保报告目录被 .gitignore 忽略，避免残留的 dependfix-reports/ 被 git add 提交
        this.ensureGitignore()

        stageAndCommit(FIX_COMMIT_MESSAGE, this.workDir)
        this.logger.info(`Committed fix changes to current branch: ${FIX_COMMIT_MESSAGE}`)
    }

    /**
     * 检查工作目录是否有未提交的变更（含未暂存与已暂存）。
     */
    private hasGitChanges(): boolean {
        try {
            execSync('git diff --quiet', { cwd: this.workDir, stdio: 'pipe' })
            execSync('git diff --cached --quiet', { cwd: this.workDir, stdio: 'pipe' })
            return false // 两者都无变更
        } catch {
            return true // 任一有变更
        }
    }

    // -----------------------------------------------------------------------
    // Upgrade helpers
    // -----------------------------------------------------------------------

    private async upgradeAlert(alert: NormalizedSecurityAlert): Promise<FixAction> {
        const startMs = Date.now()

        if (this.config.dryRun) {
            this.logger.info(`[dry-run] Would upgrade ${alert.packageName} to ${alert.recommendedVersion}`)
            return {
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: alert.recommendedVersion ? `< ${alert.recommendedVersion}` : undefined,
                toVersion: alert.recommendedVersion,
                isMajor: false,
                success: true,
                durationMs: 0,
            }
        }

        try {
            // 优先尝试直接升级，失败自动回退到 overrides（处理间接依赖）
            let result: DependencyFixResult = await upgradeDependency({
                packageName: alert.packageName,
                targetVersion: alert.recommendedVersion,
                workDir: this.workDir,
            })

            if (!result.success && result.error?.includes('not found in dependencies')) {
                // 间接依赖 — 通过 pnpm overrides 升级
                result = await overrideTransitiveDependency({
                    packageName: alert.packageName,
                    targetVersion: alert.recommendedVersion,
                    workDir: this.workDir,
                })
                this.logger.info(
                    result.success
                        ? `Upgraded ${result.packageName}: ${result.fromVersion} → ${result.toVersion} (pnpm overrides)`
                        : `Failed to upgrade ${result.packageName}: ${result.error}`,
                )
            } else {
                this.logger.info(
                    result.success
                        ? `Upgraded ${result.packageName}: ${result.fromVersion} → ${result.toVersion}`
                        : `Failed to upgrade ${result.packageName}: ${result.error}`,
                )
            }

            return {
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                fromVersion: result.fromVersion,
                toVersion: result.toVersion,
                isMajor: result.isMajor,
                success: result.success,
                error: result.error,
                durationMs: Date.now() - startMs,
            }
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`Upgrade error for ${alert.packageName}: ${message}`)
            return {
                type: 'dependency-upgrade',
                repository: alert.repository,
                target: alert.packageName,
                toVersion: alert.recommendedVersion,
                success: false,
                error: message,
                durationMs: Date.now() - startMs,
            }
        }
    }

    // -----------------------------------------------------------------------
    // Lockfile repair
    // -----------------------------------------------------------------------

    private tryLockfileRepair(repo: string): FixAction {
        const startMs = Date.now()

        if (this.config.dryRun) {
            this.logger.info(`[dry-run] Would attempt lockfile repair for ${repo}`)
            return {
                type: 'lockfile-repair',
                repository: repo,
                target: 'pnpm-lock.yaml',
                success: true,
                durationMs: 0,
            }
        }

        try {
            const result: LockfileRepairResult = repairLockfile({ workDir: this.workDir })

            this.logger.info(
                result.success
                    ? `Lockfile repaired for ${repo} (strategy: ${result.strategy ?? 'N/A'})`
                    : `Lockfile repair failed for ${repo}: ${result.failureDetail ?? 'unknown'}`,
            )

            return {
                type: 'lockfile-repair',
                repository: repo,
                target: 'pnpm-lock.yaml',
                success: result.success,
                error: result.success ? undefined : (result.failureDetail ?? 'Lockfile repair failed'),
                strategy: result.strategy,
                durationMs: Date.now() - startMs,
                diff: result.diff?.summary,
            }
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`Lockfile repair error for ${repo}: ${message}`)
            return {
                type: 'lockfile-repair',
                repository: repo,
                target: 'pnpm-lock.yaml',
                success: false,
                error: message,
                durationMs: Date.now() - startMs,
            }
        }
    }

    // -----------------------------------------------------------------------
    // Verification
    // -----------------------------------------------------------------------

    private async verifyProject(repo: string): Promise<FixAction[]> {
        // 确定要执行的命令：用户自定义 > 默认命令链
        const rawCommands = this.customCommands ?? DEFAULT_VERIFY_COMMANDS

        // 仅对默认命令链做脚本存在性校验
        const isDefault = !this.customCommands
        const { valid, skipped } = isDefault
            ? this.validateVerifyCommands(rawCommands)
            : { valid: rawCommands, skipped: [] as string[] }

        // 记录被跳过的命令
        for (const cmd of skipped) {
            this.logger.info(`Skipping command "${cmd}": script not found in package.json`)
            this.allErrors.push({
                repository: repo,
                target: cmd,
                stage: 'verify',
                category: 'SCRIPT_NOT_FOUND',
                message: `Skipped: no matching script in package.json for "${cmd}"`,
            })
        }

        if (valid.length === 0) {
            this.logger.info(`No verification commands to run for ${repo}`)
            return []
        }

        try {
            const result: VerificationResult = await runVerification({
                workDir: this.workDir,
                commands: valid,
            })

            return result.commandResults.map((cr) => ({
                type: 'verification' as const,
                repository: repo,
                target: cr.command,
                success: cr.exitCode === 0,
                error: cr.exitCode !== 0 ? `exit code ${cr.exitCode}` : undefined,
                durationMs: cr.durationMs,
            }))
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`Verification error for ${repo}: ${message}`)
            return [{
                type: 'verification',
                repository: repo,
                target: 'verification',
                success: false,
                error: message,
            }]
        }
    }

    /**
     * 校验默认命令链中的脚本引用是否存在。
     *
     * - `pnpm install --frozen-lockfile` 等非脚本命令 → 直接保留
     * - `pnpm lint` 等脚本命令 → 检查 `package.json#scripts` 是否存在对应键
     * - 用户自定义命令（`--commands`）不经过此校验
     */
    private validateVerifyCommands(commands: string[]): { valid: string[], skipped: string[] } {
        const pkgJsonPath = join(this.workDir, 'package.json')
        let pkgScripts: Record<string, string> = {}

        if (existsSync(pkgJsonPath)) {
            try {
                const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { scripts?: Record<string, string> }
                pkgScripts = pkg.scripts ?? {}
            } catch {
                // package.json 解析失败 → 不校验，全部当作有效
                return { valid: commands, skipped: [] }
            }
        }

        const valid: string[] = []
        const skipped: string[] = []

        for (const cmd of commands) {
            const match = PNPM_SCRIPT_RE.exec(cmd)
            if (match) {
                const scriptName = match[1]
                if (pkgScripts[scriptName]) {
                    valid.push(cmd)
                } else {
                    skipped.push(cmd)
                }
            } else {
                // 非脚本命令（如 `pnpm install --frozen-lockfile`）→ 直接保留
                valid.push(cmd)
            }
        }

        return { valid, skipped }
    }

    // -----------------------------------------------------------------------
    // GitHub helpers
    // -----------------------------------------------------------------------

    private createClient(): Octokit {
        return createGitHubClient({ token: this.config.githubToken })
    }

    /**
     * 获取仓库的默认分支。
     * 失败时返回 `'unknown'`（不阻塞主流程）。
     */
    private async fetchDefaultBranch(client: Octokit, owner: string, repo: string): Promise<string> {
        try {
            const { data } = await client.rest.repos.get({ owner, repo })
            return data.default_branch
        } catch {
            return 'unknown'
        }
    }

    // -----------------------------------------------------------------------
    // Result assembly
    // -----------------------------------------------------------------------

    private computeSummary(): void {
        let fixed = 0
        let failed = 0
        let lockfileRepairs = 0
        let verificationsPassed = 0
        let verificationsFailed = 0

        for (const action of this.allActions) {
            if (action.type === 'dependency-upgrade') {
                if (action.success) {
                    fixed++
                } else {
                    failed++
                }
            }
            if (action.type === 'lockfile-repair' && action.success) {
                lockfileRepairs++
            }
            if (action.type === 'verification') {
                if (action.success) {
                    verificationsPassed++
                } else {
                    verificationsFailed++
                }
            }
        }

        const fixable = this.allAlerts.filter((a) => a.fixable).length

        this.summary.repositoriesScanned = this.config.repositories.length
        this.summary.alertsFound = this.allAlerts.length
        this.summary.alertsFixable = fixable
        this.summary.alertsFixed = fixed
        this.summary.alertsFailed = failed
        // alertsSkipped 在 processRepoForFix 中已累加
        this.summary.lockfileRepairs = lockfileRepairs
        this.summary.verificationsPassed = verificationsPassed
        this.summary.verificationsFailed = verificationsFailed
    }

    private buildRunResult(): RunResult {
        const reportConfig: RunReportConfig = {
            mode: this.config.mode,
            severityThreshold: this.config.severityThreshold,
            repositories: this.config.repositories,
            dryRun: this.config.dryRun,
            createPullRequest: this.config.createPullRequest,
            maxAlertsPerRepository: this.config.maxAlertsPerRepository,
        }

        return {
            runId: this.runId,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
            config: reportConfig,
            summary: this.summary,
            repositories: this.repoResults,
            alerts: this.allAlerts,
            actions: this.allActions,
            errors: this.allErrors,
        }
    }

    /**
     * 计算退出码：
     * - 0: 全部仓库处理成功（无 failed actions、无 errors）
     * - 1: 部分仓库失败
     * - 2: 全部仓库失败（或无仓库被成功处理）
     */
    private computeExitCode(): number {
        const hasErrors = this.allErrors.length > 0
        const hasFailures = this.allActions.some((a) => !a.success)
        const hasRepoSuccess = this.repoResults.length > 0
            && this.repoResults.some((r) => r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true)
        // cleanup-branches 模式不填充 repoResults，以成功的 branch-cleanup 动作判定
        const hasCleanupSuccess = this.config.mode === 'cleanup-branches'
            && this.allActions.some((a) => a.success && a.type === 'branch-cleanup')
        const hasSuccess = hasRepoSuccess || hasCleanupSuccess

        // fix-and-pr stub：总是返回 0（非错误）
        if (this.config.mode === 'fix-and-pr') {
            return 0
        }

        if (!hasErrors && !hasFailures) {
            return 0
        }

        if (hasSuccess) {
            return 1
        }

        return 2
    }

    /**
     * 确保目标仓库的 `.gitignore` 中包含 `dependfix-reports/`。
     *
     * - 仅在 workDir 是 git 仓库时执行
     * - 已存在该条目时幂等跳过
     * - 失败（权限、磁盘满等）静默降级
     */
    private ensureGitignore(): void {
        try {
            const gitDir = join(this.workDir, '.git')
            if (!existsSync(gitDir)) {
                return
            }

            const gitignorePath = join(this.workDir, '.gitignore')
            const entry = 'dependfix-reports/'

            let content = ''
            if (existsSync(gitignorePath)) {
                content = readFileSync(gitignorePath, 'utf-8')
            }

            // 幂等检查
            const lines = content.split('\n')
            if (lines.some((l) => l.trim() === entry)) {
                return
            }

            // 追加（末尾无换行时补一个）
            const suffix = content.endsWith('\n') || content.length === 0 ? '' : '\n'
            const block = `${suffix}# dependfix\n${entry}\n`
            writeFileSync(gitignorePath, content + block, 'utf-8')
        } catch {
            // 静默降级
        }
    }
}
