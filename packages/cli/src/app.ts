import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
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
import { createFixBranch, stageAndCommit, pushBranch, createPullRequest, generatePRBody } from './github/pr-creator'
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
            const message = error instanceof Error ? error.message : String(error)
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
            const message = reportError instanceof Error ? reportError.message : String(reportError)
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
            const message = error instanceof Error ? error.message : String(error)
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
            const repairAction = await this.tryLockfileRepair(repo)
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
            const message = error instanceof Error ? error.message : String(error)
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

    private async executeFixAndPrMode(): Promise<void> {
        const client = this.createClient()

        // 1. Run fix pipeline for all repos (same as fix mode)
        for (const repo of this.config.repositories) {
            await this.processRepoForFix(client, repo)
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

        // 3. Create fix branch + commit + push
        const branchName = `dependfix/auto-fix-${this.runId.slice(0, 8)}`
        const commitMessage = 'fix(deps): automated dependfix security repair'

        try {
            this.logger.info(`Creating fix branch: ${branchName}`)
            createFixBranch(this.runId, this.workDir)

            this.logger.info('Staging and committing changes')
            stageAndCommit(commitMessage, this.workDir)

            this.logger.info(`Pushing branch: ${branchName}`)
            pushBranch(branchName, this.workDir)

            // 4. Create PR (one PR covering all repos)
            if (this.config.repositories.length > 0) {
                const firstRepo = this.config.repositories[0]
                const [owner, repo] = firstRepo.split('/')
                const defaultBranch = await this.fetchDefaultBranch(client, owner, repo)

                // Build RunResult for PR body
                this.computeSummary()
                const runResult = this.buildRunResult()
                const prBody = generatePRBody(runResult)
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

                // Record PR as a fix action
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
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error)
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
     * 检查工作目录是否有未暂存的变更。
     */
    private hasGitChanges(): boolean {
        try {
            execSync('git diff --quiet', { cwd: this.workDir, stdio: 'pipe' })
            return false // exit 0 = no changes
        } catch {
            return true // exit 1 = has changes
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
            const message = error instanceof Error ? error.message : String(error)
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

    private async tryLockfileRepair(repo: string): Promise<FixAction> {
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
            const result: LockfileRepairResult = await repairLockfile({ workDir: this.workDir })

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
            const message = error instanceof Error ? error.message : String(error)
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
            const message = error instanceof Error ? error.message : String(error)
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
        const hasSuccess = this.repoResults.length > 0
            && this.repoResults.some((r) => r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true)

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
