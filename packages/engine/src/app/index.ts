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
import { fromPat } from '../auth'
import {
    createFixBranch,
    stageAndCommit,
    pushBranch,
    createPullRequest,
    generatePRBody,
    computeFixFingerprint,
    computeFixAndPrPlan,
    findDependfixOpenPR,
    commentOnPullRequest,
    addLabelToPullRequest,
    type DependfixOpenPR,
    createGitHubClient,
    discoverRepositories,
    mergeRepositories,
    filterExplicitRepositories,
    checkTokenPermissions,
    type RepoPolicy,
} from '../github'
import { runWithConcurrency } from '../multirepo/scheduler'
import { writeArchive } from '../report/archiver'
import type { RuntimeConfig } from '../config'
import { enforceVerificationGate } from '../runners/verification-gate'
import { collectSupplyChainWarnings } from '../supply-chain'
import { loadRulesConfigFromEnv, resetActiveRulesConfig, setActiveRulesConfig } from '../code-scanning/rule-config'
import { fetchRepoAlerts, fetchDefaultBranch, truncatedWarning } from './repo-alerts'
import { processRepoFix, type AiUsageRef } from './repo-fix'
import {
    buildCommitMessage,
    buildPrTitle,
    buildRunResult,
    closeSupersededPRs,
    codeScanningAlertsTokenHint,
    commitLocalChanges,
    computeExitCode,
    computeSummary,
    dependabotAlertsTokenHint,
    ensureGitignore,
    hasGitChanges,
    pullRequestCreationHint,
    reportCleanupCandidates,
    autoCleanupMergedBranches,
    resolveAlertRepositories,
    runBranchCleanupForRepo,
    type AppContext,
} from './helpers'

// 仅 re-export 平台直接调用的辅助函数（PR 创建在平台 A 模式复用）
export { buildPrTitle } from './helpers'
export { fetchDefaultBranch } from './repo-alerts'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DependfixAppOptions {
    /** 已解析的运行时配置 */
    config: RuntimeConfig
    /** 工作目录（默认 `process.cwd()`） */
    workDir?: string
    /** 报告输出目录（默认 `./dependfix-reports`；测试可指向临时目录） */
    reportOutputDir?: string
    /** 是否输出详细日志 */
    verbose?: boolean
    /** 自定义验证命令（覆盖默认命令链） */
    commands?: string[]
    /**
     * 执行环境：`local`（CLI/MCP 等用户机器直接执行）| `container`（平台容器沙箱）。
     * 默认 `local`。容器内执行属于设计内隔离行为（非 root + 临时目录），
     * 不触发本地模式不可信代码风险警告。
     */
    executionEnvironment?: 'local' | 'container'
}

export interface DependfixRunResult {
    /** 结构化运行结果（用于报告生成） */
    result: RunResult
    /** 进程退出码：0=全部成功, 1=部分失败, 2=全部失败 */
    exitCode: number
}

// ---------------------------------------------------------------------------
// Per-source 错误隔离汇总（todo.md §M19.5 C8）
// ---------------------------------------------------------------------------

/**
 * 输出"部分源拉取失败"汇总（todo.md §M19.5 C8 per-source 错误隔离）。
 *
 * 触发条件（必须全部满足，避免与"全部源失败"语义重叠）：
 * 1. allErrors 至少包含一个 `stage='fetch' + category='FETCH_FAILED'` 错误（per-source 失败）
 * 2. **至少一个仓库成功拉取了部分告警**（isAnyRepoSuccessful = true）——
 *    否则就是"全部源失败"语义，已由 processRepoForReport catch + logger.error 单独处理，
 *    本函数聚焦"warn + 保留成功源"场景的汇总输出，避免重复提示。
 *
 * 汇总按 source 分组（'dependabot' / 'code-scanning' / 'code-quality' / 'pnpm-audit'），
 * 列出每个源失败的仓库数 + 示例错误消息，便于用户快速定位是 token 权限还是网络问题。
 */
export function logPartialSourceFailureSummary(
    allErrors: FixError[],
    logger: Logger,
    isAnyRepoSuccessful: boolean,
): void {
    const fetchErrors = allErrors.filter((e) => e.stage === 'fetch' && e.category === 'FETCH_FAILED')
    if (fetchErrors.length === 0) {
        return
    }
    if (!isAnyRepoSuccessful) {
        // 全部源失败：避免与 fetchRepoAlerts 抛错路径的 logger.error 重复提示
        return
    }

    // 按 source 分组
    const bySource = new Map<string, { repos: Set<string>, sampleMessage: string }>()
    for (const err of fetchErrors) {
        const source = err.source ?? 'unknown'
        const existing = bySource.get(source)
        if (existing) {
            existing.repos.add(err.repository)
        } else {
            bySource.set(source, {
                repos: new Set([err.repository]),
                sampleMessage: err.message,
            })
        }
    }

    const summary = [...bySource.entries()]
        .map(([source, { repos, sampleMessage }]) => `${source}（${repos.size} 个仓库: ${[...repos].slice(0, 3).join(', ')}${repos.size > 3 ? '...' : ''}）: ${sampleMessage}`)
        .join('\n  - ')

    logger.warn(
        `[alerts] 部分源拉取失败（M19.5 per-source 错误隔离）— 成功源已保留继续处理，详细如下：\n  - ${summary}`,
    )
}

// ---------------------------------------------------------------------------
// DependfixApp
// ---------------------------------------------------------------------------

export class DependfixApp {
    private readonly config: RuntimeConfig
    private readonly workDir: string
    private readonly reportOutputDir: string
    private readonly logger: Logger
    private readonly verbose: boolean
    private readonly customCommands?: string[]
    private readonly executionEnvironment: 'local' | 'container'
    private readonly runId: string

    private readonly allAlerts: NormalizedSecurityAlert[] = []
    private readonly allActions: FixAction[] = []
    private readonly allErrors: FixError[] = []
    private readonly repoResults: RepositoryResult[] = []
    private readonly summary: RunSummary = createEmptyRunSummary()
    /** run 级 AI 用量聚合（--ai 实际调用时填充；报告 aiUsage 段数据源；由 repo-fix 管线步骤回写） */
    private readonly aiUsageRef: AiUsageRef = { aggregate: undefined }
    private startedAt: string = ''
    private finishedAt: string = ''
    /** 运行前工作区是否已有未提交改动（验证门禁回滚保护：避免销毁用户本地工作） */
    private preExistingDirty = false

    constructor(options: DependfixAppOptions) {
        this.config = options.config
        this.workDir = options.workDir ?? process.cwd()
        this.reportOutputDir = options.reportOutputDir ?? './dependfix-reports'
        this.verbose = options.verbose ?? false
        this.customCommands = options.commands
        this.executionEnvironment = options.executionEnvironment ?? 'local'
        this.runId = `dependfix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        this.logger = createLogger({
            name: 'dependfix',
            minLevel: this.verbose ? 'debug' : 'info',
        })

        // Code Scanning 规则分类配置：env `CODE_SCANNING_RULES_CONFIG_PATH`
        // 指向的 JSON 文件加载并替换默认分类表；env 未设 / 文件缺失 / 解析失败
        // 均降级默认（向后兼容）。错误信息已由 loadRulesConfigFromEnv 写入 stderr，
        // 此处不重复（避免双写）。
        //
        // 进程级状态生命周期：active config 是模块级单例，每次构造 DependfixApp
        // 先 reset 再按需 set，避免前一个 app 残留配置污染当前 run
        // （同一进程多次 new DependfixApp 场景，如 cli 测试 / 多 batch 调度）。
        resetActiveRulesConfig()
        const ruleConfig = loadRulesConfigFromEnv(process.env)
        if (ruleConfig) {
            setActiveRulesConfig(ruleConfig)
            this.logger.debug('Loaded custom code-scanning rules config from env', {
                autoFixableCount: ruleConfig.autoFixable.size,
                suggestedCount: ruleConfig.suggested.size,
            })
        }
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
        // 启动安全自检（best-effort，失败不阻断运行）
        await this.runStartupSecurityChecks()
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

        // 供应链信号收集（路径 A 投毒合入前确认依据）：本次升级包带脚本且被目标仓库批准
        const supplyChainWarnings = collectSupplyChainWarnings(this.workDir, this.allActions)

        const runResult = buildRunResult(this.ctx, this.aiUsageRef.aggregate, supplyChainWarnings)
        const exitCode = computeExitCode(this.ctx)

        // 生成并写入报告
        try {
            const md = generateMarkdownReport(runResult)
            const json = generateJsonReport(runResult)
            writeReport(md, json, this.startedAt, this.runId, this.reportOutputDir)
            this.logger.info(`Reports written to ${this.reportOutputDir}/`)
            // 归档：{YYYY-MM}/{runId}/ + index.json 趋势索引（幂等）
            writeArchive(runResult, this.reportOutputDir)
            this.logger.info(`Archive written to ${this.reportOutputDir}/`)
        } catch (reportError: unknown) {
            const message = toErrorMessage(reportError)
            this.logger.error(`Failed to write reports: ${message}`)
        }

        // 确保目标仓库的 .gitignore 忽略报告目录
        ensureGitignore(this.workDir)

        this.logger.info(`Run ${this.runId} completed`, { exitCode })
        // AI 用量摘要（决策 4 可见性；报告 aiUsage 段同源）
        if (this.aiUsageRef.aggregate && this.aiUsageRef.aggregate.calls > 0) {
            const u = this.aiUsageRef.aggregate
            const costText = u.estimatedCostUsd !== undefined
                ? `, 估算成本 $${u.estimatedCostUsd.toFixed(4)}`
                : ''
            this.logger.info(
                `[ai] run 总计: ${u.calls} 次调用, ${u.inputTokens} in / ${u.outputTokens} out tokens${costText}`,
            )
        }
        // 部分源拉取失败汇总（todo.md §M19.5 C8）：
        // 仅当至少 1 个源成功 + 至少 1 个源失败时输出（避免与"全部源失败"语义重叠）。
        const isAnyRepoSuccessful = this.repoResults.some((r) =>
            r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true,
        )
        logPartialSourceFailureSummary(this.allErrors, this.logger, isAnyRepoSuccessful)
        return { result: runResult, exitCode }
    }

    // -----------------------------------------------------------------------
    // Startup security checks
    // -----------------------------------------------------------------------

    /**
     * 启动安全自检（best-effort，任何失败不阻断运行）：
     * - 本地模式风险提示：fix/fix-and-pr 会在用户机器直接执行目标仓库的
     *   依赖脚本（不可信代码）；容器环境（平台沙箱）属于设计内隔离，跳过。
     * - token 权限面探测：超权限 token（classic repo scope）启动即警告，
     *   Code Scanning 开启但缺 security-events 权限时提示。
     */
    private async runStartupSecurityChecks(): Promise<void> {
        const isLocalFix = this.executionEnvironment === 'local'
            && !this.config.dryRun
            && (this.config.mode === 'fix' || this.config.mode === 'fix-and-pr')
        if (isLocalFix && process.env.DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING !== '1') {
            this.logger.warn(
                '[local-exec] 本地模式将直接执行目标仓库的依赖安装/验证脚本（install/lint/build 钩子，属不可信代码）'
                + '——若仓库或依赖被恶意控制，脚本可读取本机环境变量（含 GITHUB_TOKEN）。'
                + '建议：使用专用低权限 token，并在专用环境（容器/VM/CI runner）运行；'
                + '已确认风险可设置 DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING=1 抑制本提示'
                + '（详见 quick-start 安全注意事项）。',
            )
        }

        if (this.config.alertSource === 'github-dependabot' && this.config.githubToken) {
            const result = await checkTokenPermissions(this.createClient(), {
                codeScanningEnabled: this.config.codeScanningEnabled,
            })
            if (result.ok && result.warnings.length > 0) {
                for (const warning of result.warnings) {
                    this.logger.warn(`[token-scope] ${warning.message}`)
                }
            }
        }
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
        const repositories = await this.resolveRepositories(client)
        await this.runRepoPipeline(repositories, (repo) => this.processRepoForReport(client, repo))
    }

    private async processRepoForReport(client: Octokit | null, repo: string): Promise<void> {
        const startTime = Date.now()
        const [owner, name] = repo.split('/')

        try {
            const alerts = await fetchRepoAlerts(this.ctx, repo)
            const { filtered } = filterAlerts(alerts, { severityThreshold: this.config.severityThreshold })
            const prioritized = prioritizeAlerts(filtered)
            const { limited, truncated } = limitAlerts(prioritized, this.config.maxAlertsPerRepository)
            if (truncated.length > 0) {
                this.summary.alertsTruncated += truncated.length
                this.logger.warn(truncatedWarning(this.config, truncated.length))
            }

            const defaultBranch = await fetchDefaultBranch(client, owner, name)

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
            const hint = dependabotAlertsTokenHint(error) ?? codeScanningAlertsTokenHint(error)
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
        const repositories = await this.resolveRepositories(client)
        await this.runRepoPipeline(repositories, (repo) => this.processRepoForFix(client, repo))

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
        await processRepoFix({ ...this.ctx, aiUsageRef: this.aiUsageRef }, client, repo)
    }

    // -----------------------------------------------------------------------
    // fix-and-pr mode
    // -----------------------------------------------------------------------

    /**
     * 修复 → 计算内容指纹 → 查重 →（同指纹跳过 / 异指纹关旧开新）。
     *
     * 去重语义：
     * - 同告警集 → 同修复结果 → 同指纹 → 跳过，不重复提交相同 PR
     * - 内容变化 → 先创建新 PR（body 注明 Supersedes），成功后关闭旧 PR；
     *   新 PR 创建失败时保留旧 PR，避免出现"无 PR 窗口"
     */
    private async executeFixAndPrMode(): Promise<void> {
        const client = this.createClient()
        const repositories = await this.resolveRepositories(client)

        // 1. Run fix pipeline for all repos (same as fix mode)
        // （config 校验已保证 fix-and-pr 仅 github-dependabot 源，client 恒非 null）
        await this.runRepoPipeline(repositories, (repo) => this.processRepoForFix(client, repo))

        // 1.5 Optional: report merged dependfix branches for manual cleanup.
        // early return 前执行（"PR 已存在"等路径也输出清单）；cleanup-branches-auto 时跳过报告
        if (this.config.cleanupBranches && !this.config.cleanupBranchesAuto) {
            await reportCleanupCandidates(this.ctx, client)
        }

        // 1.6 Optional: auto-delete merged/closed dependfix branches（非交互，可与 1.5 同开）
        if (this.config.cleanupBranchesAuto) {
            for (const repo of repositories) {
                await autoCleanupMergedBranches(this.ctx, client, repo)
            }
        }

        // 2. Verification gate：任一仓库验证失败 → 回滚修复改动并跳过 PR 创建
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

        if (repositories.length === 0) {
            return
        }
        const firstRepo = repositories[0]
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
            const defaultBranch = await fetchDefaultBranch(client, owner, repo)

            // Build RunResult for PR body（供应链信号：升级包带脚本且被批准 → PR 警示区）
            computeSummary(this.ctx)
            const supplyChainWarnings = collectSupplyChainWarnings(this.workDir, this.allActions)
            const runResult = buildRunResult(this.ctx, this.aiUsageRef.aggregate, supplyChainWarnings)
            const prBody = generatePRBody(
                runResult,
                plan.supersedePRs.map((pr) => pr.number),
            )
            const prTitle = buildPrTitle(this.summary, this.allActions)

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

            // 6.5 Duplicate PR handling: comment + label on the new PR
            // pointing to the superseded PRs (avoid manual dedup by users).
            // Requires `issues: write` token scope; failure is logged but not fatal.
            await this.handleDuplicatePRs(client, owner, repo, pr.number, plan.supersedePRs)

            // 7. Close superseded PRs only after new PR created successfully
            await closeSupersededPRs(this.ctx, client, owner, repo, plan.supersedePRs)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            const hint = pullRequestCreationHint(error)
            this.logger.error(`PR creation failed: ${message}${hint ? ` — ${hint}` : ''}`)
            this.allErrors.push({
                repository: repositories[0] ?? '*',
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
            await runBranchCleanupForRepo(this.ctx, client, repo)
        }
    }

    /**
     * 重复 PR 处理：在新 PR 上添加评论指向被取代的旧 PR + 添加 `duplicate` label。
     *
     * 失败仅记录 warning（家务活 best-effort），不阻断主流程：
     * - 新 PR 已创建成功，用户已可访问
     * - 评论失败不影响 PR 本身的可用性
     * - 但需要 `issues: write` token scope（比 `pull-requests: write` 宽）；
     *   若 token 权限不足，error 会被记录但不阻塞
     */
    private async handleDuplicatePRs(
        client: Octokit,
        owner: string,
        repo: string,
        newPRNumber: number,
        supersededPRs: DependfixOpenPR[],
    ): Promise<void> {
        if (supersededPRs.length === 0) {
            return
        }

        const supersededLinks = supersededPRs
            .map((pr) => `- [#${pr.number}](${pr.htmlUrl})`)
            .join('\n')

        const commentBody = [
            '## ⚠️ Duplicate PR Notice',
            '',
            'This PR supersedes the following dependfix PR(s) with different content:',
            '',
            supersededLinks,
            '',
            'The superseded PR(s) have been closed. Please review this PR as the new canonical fix.',
        ].join('\n')

        try {
            await commentOnPullRequest(client, owner, repo, newPRNumber, commentBody)
            this.logger.info(`Added duplicate notice comment to PR #${newPRNumber}`)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.warn(
                `Failed to add duplicate notice comment to PR #${newPRNumber}: ${message}`
                + '（token may lack `issues: write` scope）',
            )
        }

        try {
            await addLabelToPullRequest(client, owner, repo, newPRNumber, ['duplicate'])
            this.logger.info(`Added 'duplicate' label to PR #${newPRNumber}`)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.warn(
                `Failed to add 'duplicate' label to PR #${newPRNumber}: ${message}`
                + '（token may lack `issues: write` scope）',
            )
        }
    }

    // -----------------------------------------------------------------------
    // Multi-repo orchestration（并发控制 + 失败隔离）
    // -----------------------------------------------------------------------

    /**
     * 多仓库并发执行管线。
     *
     * - 并发窗口 = config.maxConcurrency（默认 1 保守串行，行为与现状一致）
     * - `>1` 时输出警告（并行 GitHub API 调用可能触发限流）
     * - 失败隔离由 task 内部 try-catch 承担（每仓库独立 repoResults 记录），
     *   scheduler 提供 onError 兜底，单仓库异常不中断整体
     * - 空清单：记录 EMPTY_REPO_LIST 错误（非 0 退出），避免静默空跑（同构缺陷）
     */
    private async runRepoPipeline(
        repositories: string[],
        task: (repo: string) => Promise<void>,
    ): Promise<void> {
        if (repositories.length === 0) {
            this.logger.warn(
                '[scheduler] no repositories to process — check --owner discovery and policy filtering (--repo-topics / --repo-include / --repo-exclude / --repo-topics-exclude)',
            )
            this.allErrors.push({
                repository: '*',
                stage: 'report',
                category: 'EMPTY_REPO_LIST',
                message: 'No repositories to process after owner discovery and policy filtering.',
            })
            return
        }

        if (this.config.maxConcurrency > 1) {
            this.logger.warn(
                `[scheduler] maxConcurrency=${this.config.maxConcurrency} > 1 — parallel GitHub API calls may hit rate limits; --max-retries applies (${this.config.maxRetries})`,
            )
        }

        await runWithConcurrency({
            items: repositories,
            concurrency: this.config.maxConcurrency,
            task,
            logger: this.logger,
            // 防御兜底：task 内部未捕获异常 → 记录审计错误，不中断整体
            onError: (repo, error) => {
                const message = toErrorMessage(error)
                this.logger.error(`Failed to process ${repo}: ${message}`)
                this.allErrors.push({
                    repository: repo,
                    stage: 'fix',
                    category: 'PROCESS_FAILED',
                    message,
                })
            },
        })
    }

    /**
     * 解析本次运行要处理的仓库清单（owner 自动发现 + 显式列表合并）。
     *
     * - 配置了 `--owner` 且 client 可用：自动发现 → 与显式 `repositories` 合并去重
     *   （显式优先：显式列表保持原顺序在前，发现结果按仓库名排序仅补充未出现项）
     * - 发现失败（token 权限、网络等全局性问题）：记录 DISCOVERY_FAILED 错误，
     *   回退处理显式列表（显式优先语义，不静默丢弃显式仓库）
     * - 未配置 `--owner`：沿用现有 resolveAlertRepositories 语义
     */
    private async resolveRepositories(client: Octokit | null): Promise<string[]> {
        const { owner } = this.config
        // 名单策略：include 仅作用于发现结果；exclude 对显式 + 发现均生效；
        // topicsExclude 仅作用于发现结果（显式列表无 topics 元数据）
        const policy: RepoPolicy = {
            include: this.config.repoInclude,
            exclude: this.config.repoExclude,
            topicsExclude: this.config.repoTopicsExclude,
        }

        if (!client || !owner || owner.length === 0) {
            // 无 owner 发现：显式列表仍受 exclude 约束（语义）
            return filterExplicitRepositories(policy, resolveAlertRepositories(this.ctx))
        }

        try {
            const discovered = await discoverRepositories({
                client,
                owners: owner,
                topics: this.config.repoTopics,
                // 策略在发现探测前应用（被排除仓库不触达 contents API）
                policy,
                maxRepos: this.config.maxRepos,
            })
            // 显式列表：仅 exclude 约束（include 不适用于显式，显式优先）
            const explicitFiltered = filterExplicitRepositories(policy, this.config.repositories)
            const merged = mergeRepositories(
                explicitFiltered,
                discovered.map((r) => r.fullName),
            )
            this.logger.info(
                `[discovery] owner(s) ${owner.join(', ')}: discovered ${discovered.length} repo(s), ${merged.length} total after policy/merge`,
            )
            return merged
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            this.logger.error(`[discovery] owner discovery failed: ${message}`)
            this.allErrors.push({
                repository: '*',
                stage: 'report',
                category: 'DISCOVERY_FAILED',
                message,
            })
            // 发现失败不阻塞显式列表（显式优先语义；显式列表仍受 exclude 约束）
            return filterExplicitRepositories(policy, this.config.repositories)
        }
    }

    // -----------------------------------------------------------------------
    // GitHub helpers
    // -----------------------------------------------------------------------

    /** pnpm-audit 模式不创建 GitHub client（无 token）；github-dependabot 模式返回主 token client。 */
    private githubClientOrNull(): Octokit | null {
        if (this.config.alertSource === 'pnpm-audit') {
            return null
        }
        return this.createClient()
    }

    private createClient(token: string = this.config.githubToken): Octokit {
        return createGitHubClient({
            auth: fromPat(token, {
                // 429 / rate limit 指数退避重试（0 可关闭；退避上限可配）
                retry: {
                    maxRetries: this.config.maxRetries,
                    maxBackoffMs: this.config.maxBackoffMs,
                },
            }),
        })
    }
}
