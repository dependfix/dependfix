import type { Octokit } from '@octokit/rest'
import {
    createLogger,
    generateMarkdownReport,
    generateJsonReport,
    writeReport,
    createEmptyRunSummary,
    toErrorMessage,
    type AlertsDisabledRecord,
    type CiAlignmentRecord,
    type Logger,
    type NormalizedSecurityAlert,
    type RunResult,
    type RunSummary,
    type RepositoryResult,
    type FixAction,
    type FixError,
    type RepeatedAttemptRecord,
    type PrCheckWatchReport,
    type DeliverySkipRecord,
    type RunDelivery,
} from '@dependfix/core'
import { fromApp, type AuthProvider } from '../auth'
import {
    createFixBranch,
    stageAndCommit,
    pushBranch,
    readHeadCommit,
    createPullRequest,
    generatePRBody,
    computeFixFingerprint,
    computeFixAndPrPlan,
    findDependfixOpenPR,
    ClosedAttemptIndex,
    collectAttemptMarkers,
    CommitScopeError,
    collectDeclaredPaths,
    discoverRepositories,
    mergeRepositories,
    filterExplicitRepositories,
    type RepoPolicy,
} from '../github'
import { runWithConcurrency } from '../multirepo/scheduler'
import { writeArchive } from '../report/archiver'
import type { RuntimeConfig } from '../config'
import { enforceVerificationGate } from '../runners/verification-gate'
import { resetProcessControlState } from '../runners/process-control'
import { collectSupplyChainWarnings } from '../supply-chain'
import { loadRulesConfigFromEnv, resetActiveRulesConfig, setActiveRulesConfig } from '../code-scanning/rule-config'
import type { CommandResult } from '../runners/verification-runner'
import { setRunInstallTimeoutMs } from '../fixers/install-timeouts'
import type { VerificationCheckpoint } from './verification-checkpoint'
import { createConfiguredGitHubClient, createConfiguredGitHubClientOrNull } from './github-client'
import { formatEngineBuildLine, resolveRunBuildInfo, type RunBuildInfo } from './build-info'
import { fetchDefaultBranch } from './repo-alerts'
import { abortAwareRepoTask, abortBlocksDelivery, abortRun, logSkippedRepos } from './abort'
import { processRepoForReport } from './repo-report'
import { processRepoFix, type AiUsageRef } from './repo-fix'
import { applyRepoConfig } from './repo-config'
import {
    buildCommitMessage,
    buildPrTitle,
    buildRunResult,
    closeSupersededPRs,
    commitLocalChanges,
    computeExitCode,
    computeSummary,
    ensureGitignore,
    hasGitChanges,
    isGitRepository,
    reportCleanupCandidates,
    autoCleanupMergedBranches,
    resolveAlertRepositories,
    runBranchCleanupForRepo,
    type AppContext,
} from './helpers'
import { findInstallBlockedReposWithFixes, hasDeliverableFixes } from './delivery'
import { prepareDeliveryHygiene } from './git-exclude'
import { runPrCheckWatch } from './pr-check-watch-run'
import { handleBaselineRedDelivery, rollbackForSkippedDelivery } from './skipped-delivery'
import { logPartialSourceFailureSummary } from './source-failure-summary'
import { logSkippedByPackageSummary } from './result-assembly'
import { attachRunEgressResult, beginRunEgressAudit, finishRunEgressAudit } from './run-egress'
import { pullRequestCreationHint } from './token-hints'
import { runStartupSecurityChecks as runStartupSecurityChecksImpl } from './startup-checks'
import { deliveryBranchPushed, deliveryPrCreated, deliveryPrReused, recordFixModeDelivery } from './self-delivery'
import { handleDuplicatePRs } from './duplicate-prs'

// 仅 re-export 平台直接调用的辅助函数（PR 创建在平台 A 模式复用）
export { buildPrTitle } from './helpers'
export { fetchDefaultBranch } from './repo-alerts'
export { closeSupersededPRs } from './branch-cleanup'

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
    /** 仓库级验证命令超时（毫秒；缺省走 env / 内置默认，见 execute-limits） */
    verifyCommandTimeoutMs?: number
    /** 仓库级安装类命令超时（毫秒；缺省走 env / 内置默认） */
    installTimeoutMs?: number
    /**
     * 执行环境：`local`（CLI/MCP 等用户机器直接执行）| `container`（平台容器沙箱）。
     * 默认 `local`。容器内执行属于设计内隔离行为（非 root + 临时目录），
     * 不触发本地模式不可信代码风险警告。
     */
    executionEnvironment?: 'local' | 'container'
    /**
     * 自定义 Logger（平台层注入 MemoryLogger 用于捕获执行日志）。
     * 未提供时使用内部 createLogger（输出到 console）。
     */
    logger?: Logger
}

export interface DependfixRunResult {
    /** 结构化运行结果（用于报告生成） */
    result: RunResult
    /** 进程退出码：0=全部成功, 1=部分失败, 2=全部失败 */
    exitCode: number
}

export { logPartialSourceFailureSummary } from './source-failure-summary'

// ---------------------------------------------------------------------------
// DependfixApp
// ---------------------------------------------------------------------------

export class DependfixApp {
    /** 运行时配置；构造期按「中央配置优先」合并目标仓库专属配置后单次赋值（见 applyRepoConfig） */
    private readonly config: RuntimeConfig
    private readonly workDir: string
    private readonly reportOutputDir: string
    private readonly logger: Logger
    private readonly verbose: boolean
    private readonly customCommands?: string[]
    private readonly verifyCommandTimeoutMs?: number
    private readonly installTimeoutMs?: number
    private readonly executionEnvironment: 'local' | 'container'
    private readonly runId: string
    /** GitHub App 认证提供者（用于 commit author 真实 bot 身份；仅 fix/fix-and-pr 模式生效） */
    private readonly githubAppAuth?: AuthProvider
    /** 运行构建版本回执（`[build]` 启动行；平台注入优先，CLI 回退包版本） */
    private readonly buildInfo: RunBuildInfo

    private readonly allAlerts: NormalizedSecurityAlert[] = []
    private readonly allActions: FixAction[] = []
    private readonly allErrors: FixError[] = []
    /** alerts 功能未启用记录（未启用 ≠ 失败，不计入 allErrors / exitCode） */
    private readonly alertsDisabled: AlertsDisabledRecord[] = []
    private readonly repoResults: RepositoryResult[] = []
    private readonly summary: RunSummary = createEmptyRunSummary()
    /** run 级 AI 用量聚合（--ai 实际调用时填充；报告 aiUsage 段数据源；由 repo-fix 管线步骤回写） */
    private readonly aiUsageRef: AiUsageRef = { aggregate: undefined }
    private startedAt: string = ''
    private finishedAt: string = ''
    /** 运行前工作区是否已有未提交改动（验证门禁回滚保护：避免销毁用户本地工作） */
    private preExistingDirty = false
    /** 运行级修复前基线（跨仓库复用；惰性首采，零告警不采样）。 */
    private verificationBaseline: { value?: CommandResult[] } = {}
    /** 单元回滚 checkpoint（单元 probe 开始前记录，跨仓库传递）。 */
    private readonly verificationCheckpoints: VerificationCheckpoint[] = []
    /** checkpoint 建立失败的去重键（run 级；同仓同因只记一条降级审计）。 */
    private readonly checkpointFailures = new Set<string>()
    /** 验证链口径记录（run 级；`verifyProject` 写入，报告与 PR 正文消费） */
    private readonly ciAlignment: CiAlignmentRecord[] = []
    /** 最近关闭 PR 的尝试索引（run 级缓存；仅 fix-and-pr 模式参与判定） */
    private readonly attemptIndex: ClosedAttemptIndex
    /** 同告警尝试记录（run 级；报告与 PR 正文标记数据源） */
    private readonly attemptTracking: RepeatedAttemptRecord[] = []
    /** PR 落点仓库（第一个仓库；尝试标记只能写进该仓库的 PR） */
    private attemptRepo: string | undefined
    /** PR check 回环结果（run 级；仅在 `--wait-pr-checks` 且创建 PR 时递增） */
    private readonly prCheckWatchReport: PrCheckWatchReport = { attempts: [], runBudgetExhausted: false }
    /** 交付跳过记录（基线红；`computeSummary` 据此派生 summary 计数） */
    private readonly deliverySkips: NonNullable<AppContext['deliverySkips']> = []
    /** 已记录的预算跳过（`stage:work`；逐包命中不刷审计） */
    private readonly budgetSkips = new Set<string>()
    /** `draft` 档的跳过记录（sanity: PR 创建后回填载体编号） */
    private baselineRedDraft?: DeliverySkipRecord
    private readonly alertOutcomes: NonNullable<AppContext['alertOutcomes']> = new Map()

    constructor(options: DependfixAppOptions) {
        this.workDir = options.workDir ?? process.cwd()
        this.reportOutputDir = options.reportOutputDir ?? './dependfix-reports'
        this.verbose = options.verbose ?? false
        this.customCommands = options.commands
        this.verifyCommandTimeoutMs = options.verifyCommandTimeoutMs
        this.installTimeoutMs = options.installTimeoutMs
        this.executionEnvironment = options.executionEnvironment ?? 'local'
        this.runId = `dependfix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

        // 使用自定义 Logger（平台层注入 MemoryLogger）或内部创建
        this.logger = options.logger ?? createLogger({
            name: 'dependfix',
            minLevel: this.verbose ? 'debug' : 'info',
        })

        // 目标仓库专属配置（`.github/dependfix.yml`）：按「中央配置优先」合并（当前仅 overrideProtect），
        // 在 logger 之后读取、结果作为唯一 config 来源单次赋值；非法配置降级不中断。
        this.config = applyRepoConfig(options.config, this.workDir, this.logger)
        // 构建版本回执：平台注入值优先，本地回退引擎包版本
        this.buildInfo = resolveRunBuildInfo(this.config)

        // GitHub App 认证提供者（用于 commit author 真实 bot 身份）
        if (this.config.githubApp) {
            this.githubAppAuth = fromApp(this.config.githubApp)
        }

        // 同告警尝试索引：运行级缓存（每仓库每轮只查一次已关闭 PR）
        this.attemptIndex = new ClosedAttemptIndex({ logger: this.logger })

        // Code Scanning 规则分类配置：env `CODE_SCANNING_RULES_CONFIG_PATH`
        // 指向的 JSON 文件加载并替换默认分类表；env 未设 / 文件缺失 / 解析失败
        // 均降级默认（向后兼容）。错误信息已由 loadRulesConfigFromEnv 写入 stderr，
        // 此处不重复（避免双写）。
        //
        // 进程级状态生命周期：active config 是模块级单例，每次构造先 reset 再按需 set（同进程多次构造场景）。
        resetActiveRulesConfig()
        const ruleConfig = loadRulesConfigFromEnv(process.env)
        if (ruleConfig) {
            setActiveRulesConfig(ruleConfig)
            this.logger.debug('Loaded custom code-scanning rules config from env', {
                autoFixableCount: ruleConfig.autoFixable.size,
                suggestedCount: ruleConfig.suggested.size,
            })
        }

        // 进程级状态生命周期（同 `resetActiveRulesConfig` 口径）：运行级取消状态与受管子进程登记
        // 是模块级单例，每次构造 app 先复位，避免同一进程内的前一次运行状态污染本次运行
        // （同一进程多次 new DependfixApp 场景：cli 测试 / 平台多 batch 调度）。
        resetProcessControlState()
    }

    /** 请求中止本次运行（协作式；留痕口径见 app/abort.ts）。 */
    abort(reason = 'abort requested'): void {
        abortRun(this.ctx, reason)
    }

    private deliveryRecord?: RunDelivery // getter 每次新建 ctx，故状态留在实例字段

    private get ctx(): AppContext {
        return {
            config: this.config,
            workDir: this.workDir,
            logger: this.logger,
            customCommands: this.customCommands,
            verifyCommandTimeoutMs: this.verifyCommandTimeoutMs,
            runId: this.runId,
            allAlerts: this.allAlerts,
            allActions: this.allActions,
            allErrors: this.allErrors,
            alertsDisabled: this.alertsDisabled,
            repoResults: this.repoResults,
            summary: this.summary,
            startedAt: this.startedAt,
            finishedAt: this.finishedAt,
            authProvider: this.githubAppAuth,
            ciAlignment: this.ciAlignment,
            attemptTracking: this.attemptTracking,
            attemptIndex: this.attemptIndex,
            attemptRepo: this.attemptRepo,
            prCheckWatch: this.prCheckWatchReport,
            alertOutcomes: this.alertOutcomes,
            deliverySkips: this.deliverySkips,
            delivery: this.deliveryRecord,
            deadlineAt: this.config.deadlineAt,
            budgetSkips: this.budgetSkips,
        }
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** 执行完整的编排流程，返回结构化结果和退出码。 */
    async run(): Promise<DependfixRunResult> {
        this.startedAt = new Date().toISOString()
        // 仓库级安装超时：运行期上下文（安装类调用散布在无 ctx 的底层函数中）
        setRunInstallTimeoutMs(this.installTimeoutMs)
        // 启动安全自检（best-effort，失败不阻断运行）
        await this.runStartupSecurityChecks()
        // 运行前工作区状态（验证门禁回滚时保护用户已有未提交改动；非仓库目录视为无既有改动）。
        this.preExistingDirty = isGitRepository(this.workDir) && hasGitChanges(this.workDir)
        // 提交卫生：安装产物不得进入交付提交。必须在安装 / 验证前落盘（只写 .git/info/exclude，幂等）
        prepareDeliveryHygiene(this.workDir, this.config, this.logger)
        // 构建版本回执：先于业务日志输出（口径见 app/build-info.ts）
        this.logger.info(formatEngineBuildLine(this.buildInfo))
        this.logger.info(`Starting dependfix run ${this.runId}`, {
            mode: this.config.mode,
            repositories: this.config.repositories,
        })

        await beginRunEgressAudit(this.workDir)

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
        const egress = await finishRunEgressAudit()
        computeSummary(this.ctx)

        // 供应链信号（投毒合入前确认依据）：本次升级包带脚本且被目标仓库批准
        const supplyChainWarnings = collectSupplyChainWarnings(this.workDir, this.allActions)

        const runResult = buildRunResult(this.ctx, this.aiUsageRef.aggregate, supplyChainWarnings)
        if (attachRunEgressResult(runResult, egress, this.allErrors)) {
            this.logger.warn('[network-audit] non-allowlisted outbound targets were blocked in this run')
        }
        logSkippedByPackageSummary(this.logger, runResult)
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
        // 部分源拉取失败汇总：仅当至少 1 个源成功 + 1 个失败时输出；`verificationPassed === true` 在此
        // 只是「该仓库产出了结果」的启发式（仅用于日志汇总门控），不是失败判定（归因口径见 `isRepoVerificationBlocked`）。
        const isAnyRepoSuccessful = this.repoResults.some((r) =>
            r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true,
        )
        logPartialSourceFailureSummary(this.allErrors, this.logger, isAnyRepoSuccessful)
        // 清除运行级覆盖，避免同进程后续运行（测试 / 批量复用）继承上一次的仓库配置
        setRunInstallTimeoutMs(undefined)
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
        await runStartupSecurityChecksImpl({
            config: this.config,
            logger: this.logger,
            executionEnvironment: this.executionEnvironment,
        })
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
        const client = createConfiguredGitHubClientOrNull(this.config)
        const repositories = await this.resolveRepositories(client)
        await this.runRepoPipeline(repositories, (repo) => processRepoForReport(this.ctx, client, repo))
    }

    // -----------------------------------------------------------------------
    // fix mode
    // -----------------------------------------------------------------------

    private async executeFixMode(): Promise<void> {
        const client = createConfiguredGitHubClientOrNull(this.config)
        const repositories = await this.resolveRepositories(client)
        await this.runRepoPipeline(repositories, (repo) => this.processRepoForFix(client, repo))

        // 修复完成后，按需在本地当前分支直接提交（不推送、不创建 PR）
        if (this.config.commit) {
            // 运行级取消：不交付半成品
            if (abortBlocksDelivery(this.ctx, 'local commit')) {
                return
            }
            // 验证门禁：任一仓库验证失败 → 回滚，不提交坏改动
            if (await enforceVerificationGate(this.ctx, { preExistingDirty: this.preExistingDirty, action: 'commit' })) {
                return
            }

            const headBeforeCommit = await readHeadCommit(this.workDir).catch(() => undefined)
            try {
                await commitLocalChanges(this.ctx)
            } catch (error: unknown) {
                const message = toErrorMessage(error)
                this.logger.error(`Local commit failed: ${message}`)
                const isScopeError = error instanceof CommitScopeError
                this.allErrors.push({
                    repository: '*',
                    // 提交集合不合法统一记交付阶段（与 PR 路径一致），其余仍为 fix 阶段的 COMMIT_FAILED
                    stage: isScopeError ? 'report' : 'fix',
                    category: isScopeError ? error.category : 'COMMIT_FAILED',
                    message,
                })
            }
            const delivery = await recordFixModeDelivery({
                commit: this.config.commit,
                ...(this.config.push !== undefined ? { push: this.config.push } : {}),
                workDir: this.workDir,
                logger: this.logger,
                allErrors: this.allErrors,
                ...(headBeforeCommit ? { headBeforeCommit } : {}),
                abortBlocked: () => abortBlocksDelivery(this.ctx, 'branch push'),
            })
            if (delivery) {
                this.deliveryRecord = delivery
            }
        }
    }

    private async processRepoForFix(client: Octokit | null, repo: string): Promise<void> {
        await processRepoFix(
            {
                ...this.ctx,
                aiUsageRef: this.aiUsageRef,
                verificationBaseline: this.verificationBaseline,
                verificationCheckpoints: this.verificationCheckpoints,
                checkpointFailures: this.checkpointFailures,
                preExistingDirty: this.preExistingDirty,
            },
            client,
            repo,
        )
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
        const client = createConfiguredGitHubClient(this.config)
        const repositories = await this.resolveRepositories(client)
        // PR 落点仓库 = 第一个仓库（尝试标记只能写进它的 PR；其余仓库不参与尝试计数）
        this.attemptRepo = repositories[0]

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
        if (abortBlocksDelivery(this.ctx, 'PR creation')) {
            return
        }
        if (await enforceVerificationGate(this.ctx, { preExistingDirty: this.preExistingDirty, action: 'pr' })) {
            return
        }

        // 2.5 交付正确性守卫（2026-10-18）：修复后安装仍既有失败 / 零修复时不建普通 PR。
        // 放在门禁之后：先让「本次新引入」的失败按原语义回滚，再处理非归因的安装红与零修复。
        const installBlockedRepos = findInstallBlockedReposWithFixes(this.allActions)
        if (installBlockedRepos.length > 0) {
            const outcome = await handleBaselineRedDelivery({
                ctx: this.ctx,
                config: this.config,
                client,
                repositories,
                installBlockedRepos,
                workDir: this.workDir,
                preExistingDirty: this.preExistingDirty,
            })
            if (!outcome.continueAsDraft) {
                return
            }
            this.baselineRedDraft = outcome.record
        }
        if (!hasDeliverableFixes(this.allActions)) {
            this.logger.info('No deliverable fixes produced — skipping PR creation')
            await rollbackForSkippedDelivery({
                logger: this.logger,
                workDir: this.workDir,
                preExistingDirty: this.preExistingDirty,
                reason: 'no deliverable fixes',
            })
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
                this.summary.prsSkippedByFingerprint += 1
                // 同内容 PR 复用也算已交付：平台据此落 runUrl / PR 编号，不重复创建
                this.deliveryRecord = deliveryPrReused(plan.sameContentPR)
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
            await createFixBranch(branchName, this.workDir)
            this.logger.info(`Creating fix branch: ${branchName}`)

            this.logger.info('Staging and committing changes')
            const author = this.githubAppAuth?.getCommitAuthor()
            try {
                const scope = await stageAndCommit(buildCommitMessage(this.allActions), this.workDir, author, {
                    declaredPaths: collectDeclaredPaths(this.allActions),
                })
                if (scope.ignored.length > 0) {
                    this.logger.info(`Not committing ${scope.ignored.length} generated / undeclared path(s): ${scope.ignored.join(', ')}`)
                }
                if (scope.missing.length > 0) {
                    this.logger.warn(`Declared path(s) had no changes in the worktree: ${scope.missing.join(', ')}`)
                }
            } catch (error: unknown) {
                if (error instanceof CommitScopeError) {
                    // 提交集合不合法：记录专属类别（平台据 category 判 deliver 失败），不进入 push / PR
                    this.logger.error(`Staging rejected (${error.category}): ${error.message}`)
                    this.allErrors.push({
                        repository: firstRepo,
                        stage: 'report',
                        category: error.category,
                        message: error.message,
                    })
                    return
                }
                throw error
            }

            this.logger.info(`Pushing branch: ${branchName}`)
            const commitSha = await readHeadCommit(this.workDir).catch(() => undefined)
            await pushBranch(branchName, this.workDir)
            // 分支已推：先落 `pushed`（后续 PR 失败 / 取消时平台据 branch 清理，不推测命名）
            this.deliveryRecord = deliveryBranchPushed(branchName, commitSha)

            // 6. Create PR (one PR covering all repos)
            const defaultBranch = await fetchDefaultBranch(client, owner, repo)

            // Build RunResult for PR body（供应链信号：升级包带脚本且被批准 → PR 警示区）
            computeSummary(this.ctx)
            const supplyChainWarnings = collectSupplyChainWarnings(this.workDir, this.allActions)
            const runResult = buildRunResult(this.ctx, this.aiUsageRef.aggregate, supplyChainWarnings)
            const prBody = generatePRBody(
                runResult,
                plan.supersedePRs.map((pr) => pr.number),
                collectAttemptMarkers(this.attemptTracking, this.allActions),
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
                // 基线红：草稿 PR（CI 会以既有失败为红，先不进人工 review 队列）
                draft: this.baselineRedDraft !== undefined,
            })

            this.logger.info(`PR created: ${pr.htmlUrl}`)
            this.summary.prsOpened += 1
            this.deliveryRecord = deliveryPrCreated(branchName, commitSha, pr)
            if (this.baselineRedDraft) {
                this.baselineRedDraft.carrier.draftPr = { number: pr.number, htmlUrl: pr.htmlUrl }
                this.logger.warn(
                    `Draft PR created for pre-existing install failure: ${pr.htmlUrl} `
                    + '— fix the repository install chain, then mark it ready for review',
                )
            }

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
            await handleDuplicatePRs({
                client,
                owner,
                repo,
                newPRNumber: pr.number,
                supersededPRs: plan.supersedePRs,
                logger: this.logger,
            })

            // 7. Close superseded PRs only after new PR created successfully
            await closeSupersededPRs(this.ctx, client, owner, repo, plan.supersedePRs)

            if (this.config.waitPrChecks && this.baselineRedDraft) {
                this.logger.info(
                    'Skipping PR check watch: draft delivery is expected to fail on the pre-existing install failure',
                )
            } else if (this.config.waitPrChecks) {
                await runPrCheckWatch({ ctx: this.ctx, octokit: client, owner, repo, pr, branchName })
            }
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
        const client = createConfiguredGitHubClient(this.config)
        for (const repo of this.config.repositories) {
            await runBranchCleanupForRepo(this.ctx, client, repo)
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

        /** 因运行级取消而未处理的仓库（显式计数，避免静默跳过）。 */
        const abortedRepos: string[] = []

        await runWithConcurrency({
            items: repositories,
            concurrency: this.config.maxConcurrency,
            // 运行级取消：中止后不再启动新仓库（也不抓告警 / 不装依赖），避免"僵尸运行"与后续
            // 队列任务争抢资源；被跳过的仓库显式计数并汇总告警（不静默）
            task: abortAwareRepoTask(task, abortedRepos),
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

        logSkippedRepos(this.logger, abortedRepos)
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
            overrideProtect: this.config.overrideProtect,
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
}
