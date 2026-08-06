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
import { createGitHubClient } from '../github/client'
import { discoverRepositories, mergeRepositories } from '../github/repository-discovery'
import {
    filterExplicitRepositories,
    type RepoPolicy,
} from '../github/repo-policy'
import { runWithConcurrency } from '../multirepo/scheduler'
import { writeArchive } from '../report/archiver'
import { enforceVerificationGate } from '../runners/verification-gate'
import { fetchDependabotAlerts } from '../github/dependabot-fetcher'
import { fetchCodeScanningAlerts } from '../github/code-scanning-fetcher'
import { fetchPnpmAuditAlerts } from '../alerts/pnpm-audit-fetcher'
import { createFixBranch, stageAndCommit, pushBranch, createPullRequest, generatePRBody, computeFixFingerprint, computeFixAndPrPlan, findDependfixOpenPR } from '../github/pr-creator'
import type { RuntimeConfig } from '../config'
import { compareSemver, readLockfileVersion, applyVersionedOverrides } from '../fixers/dependency'
import { dedupeFixableAlerts, snapshotTrackedFiles, restoreTrackedFiles, quickVerifyProject, partitionSubmanifestAlerts } from '../helpers'
import { buildUpgradeGroups } from '../grouping'
import {
    buildCommitMessage,
    buildVersionedOverrides,
    type AppContext,
    upgradeAlert,
    tryLockfileRepair,
    runCodeScanningFixes,
    runBranchCleanupForRepo,
    verifyProject,
    commitLocalChanges,
    hasGitChanges,
    ensureGitignore,
    closeSupersededPRs,
    reportCleanupCandidates,
    autoCleanupMergedBranches,
    computeSummary,
    buildRunResult,
    computeExitCode,
    dependabotAlertsTokenHint,
    codeScanningAlertsTokenHint,
    pullRequestCreationHint,
    resolveAlertRepositories,
    buildPrTitle,
} from './helpers'

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
    private readonly reportOutputDir: string
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
        this.reportOutputDir = options.reportOutputDir ?? './dependfix-reports'
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
            writeReport(md, json, this.startedAt, this.runId, this.reportOutputDir)
            this.logger.info(`Reports written to ${this.reportOutputDir}/`)
            // T404 归档：{YYYY-MM}/{runId}/ + index.json 趋势索引（幂等）
            writeArchive(runResult, this.reportOutputDir)
            this.logger.info(`Archive written to ${this.reportOutputDir}/`)
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
        const repositories = await this.resolveRepositories(client)
        await this.runRepoPipeline(repositories, (repo) => this.processRepoForReport(client, repo))
    }

    private async processRepoForReport(client: Octokit | null, repo: string): Promise<void> {
        const startTime = Date.now()
        const [owner, name] = repo.split('/')

        try {
            const alerts = await this.fetchAlerts(repo)
            const { filtered } = filterAlerts(alerts, { severityThreshold: this.config.severityThreshold })
            const prioritized = prioritizeAlerts(filtered)
            const { limited, truncated } = limitAlerts(prioritized, this.config.maxAlertsPerRepository)
            if (truncated.length > 0) {
                this.summary.alertsTruncated += truncated.length
                this.logger.warn(truncatedWarning(this.config, truncated.length))
            }

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
            // 1. Fetch alerts（双源：github-dependabot 走 alertsToken / pnpm-audit 本地回退）
            const rawAlerts = await this.fetchAlerts(repo)
            const { filtered } = filterAlerts(rawAlerts, { severityThreshold: this.config.severityThreshold })
            const prioritized = prioritizeAlerts(filtered)
            const { limited, truncated } = limitAlerts(prioritized, this.config.maxAlertsPerRepository)
            if (truncated.length > 0) {
                this.summary.alertsTruncated += truncated.length
                this.logger.warn(truncatedWarning(this.config, truncated.length))
            }
            alertsCount = limited.length
            fixable = limited.filter((a) => a.fixable).length

            defaultBranch = await this.fetchDefaultBranch(client, owner, name)

            this.allAlerts.push(...limited)

            // 2.0 Code Scanning 模板修复（T303，A 类白名单；与依赖升级链路并行、互不干扰）
            // 逐告警：快照 → 应用模板 → quickVerify（lint）→ 失败回滚（不静默）
            const csCounts = await runCodeScanningFixes(this.ctx, repo, limited)
            fixed += csCounts.fixed
            failed += csCounts.failed

            // 2.1 子目录 / 根直接依赖 lockfile 告警（P0 防护：docs vite 告警曾误降级根 vite@8→6）→ 剔除修复链路
            // 收尾审查遗留修复：code-scanning 告警（manifestPath 为源码路径）不参与依赖清单分区，
            // 避免全部落 sub 桶产生 skip 计数噪音（其可见性由 §Code Scanning Suggestions 承担）
            const dependencyAlerts = limited.filter((a) => a.source !== 'code-scanning')
            const { root: rootManifestAlerts, sub: submanifestAlerts } = partitionSubmanifestAlerts(dependencyAlerts, this.workDir)
            if (submanifestAlerts.length > 0) {
                this.logger.warn(
                    `[alerts] ${submanifestAlerts.length} alert(s) from sub-directory / root-direct-dep manifest(s) skipped — manual review required: ${submanifestAlerts.map((a) => `${a.packageName} (${a.manifestPath})`).join(', ')}`,
                )
                this.summary.alertsSkipped += submanifestAlerts.length
            }

            // 2. Upgrade fixable dependencies（T213 分组升级 + G3 同包收敛）
            // - 同包 alerts 去重取最高 recommendedVersion；分组显式 > dependabot.yml > @types > 启发式 > 单包
            // - 组级验证失败 → 整组回滚 → 拆组逐个重试；当前版本 >= 目标时跳过（不降级保护）
            // - 多版本共存（vite@5.4.14 + vite@8.2.0）：版本化 overrides 分别覆盖（2026-08-06 复盘）
            const lockfilePath = join(this.workDir, 'pnpm-lock.yaml')

            // 2.0 多版本共存 → 版本化 overrides（独立于分组升级，避免全局覆盖误伤根声明）
            // 门槛：该包在 lockfile 中存在脆弱实例（低于某大版本线的推荐目标）——
            // 覆盖多 major（vite@5.4.14 + vite@8.2.0）与同 major 多小版本
            // （fast-uri@3.1.0 + 3.1.5）两类场景（2026-08-06 run 31028234123 复盘）
            const fixableLockfileAlerts = rootManifestAlerts.filter(
                (a) => a.source !== 'code-scanning' && a.manifestPath.trim().replace(/\\/g, '/') === 'pnpm-lock.yaml'
                    && a.fixable && a.recommendedVersion,
            )
            // 按包分组，构建版本化 overrides；非空即存在脆弱实例 → 进入 2.0.1
            const versionedOverridesByPackage = new Map<string, Record<string, string>>()
            for (const alert of fixableLockfileAlerts) {
                if (!versionedOverridesByPackage.has(alert.packageName)) {
                    const packageAlerts = fixableLockfileAlerts.filter((a) => a.packageName === alert.packageName)
                    versionedOverridesByPackage.set(
                        alert.packageName,
                        buildVersionedOverrides(lockfilePath, packageAlerts),
                    )
                }
            }
            const multiVersionPackages = new Set(
                [...versionedOverridesByPackage.entries()]
                    .filter(([, overrides]) => Object.keys(overrides).length > 0)
                    .map(([packageName]) => packageName),
            )
            // 多版本包的所有 lockfile 告警进入 2.0.1（按告警身份排除，不按包名——同包
            // 其他 manifest 告警（package.json 根声明等）保留在常规链路，避免静默丢失）
            const multiVersionAlerts = fixableLockfileAlerts.filter((a) => multiVersionPackages.has(a.packageName))
            const multiVersionAlertIds = new Set(multiVersionAlerts.map((a) => a.id))
            const singleVersionAlerts = rootManifestAlerts.filter((a) => !multiVersionAlertIds.has(a.id))

            // 2.0.1 执行版本化 overrides 修复（逐包：快照 → 写入 → install → 组级验证 → 回滚）
            const upgradedMultiVersion = new Set<string>()
            for (const alert of multiVersionAlerts) {
                if (upgradedMultiVersion.has(alert.packageName)) {
                    continue
                }
                upgradedMultiVersion.add(alert.packageName)
                const versionedOverrides = versionedOverridesByPackage.get(alert.packageName) ?? {}
                const targets = Object.values(versionedOverrides)
                const targetSummary = targets.length > 0 ? targets.join(', ') : alert.recommendedVersion
                if (this.config.dryRun) {
                    // dry-run 不写盘：仅记录计划动作（与 upgradeAlert 的 dry-run 语义一致）
                    this.logger.info(`[dry-run] Would apply versioned overrides for ${alert.packageName}: ${JSON.stringify(versionedOverrides)}`)
                    this.allActions.push({
                        type: 'dependency-upgrade',
                        repository: alert.repository,
                        target: alert.packageName,
                        fromVersion: '',
                        toVersion: targetSummary,
                        isMajor: false,
                        strategy: 'versioned-override',
                        success: true,
                        durationMs: 0,
                    })
                    fixed++
                    continue
                }
                if (Object.keys(versionedOverrides).length === 0) {
                    this.logger.info(`Skipping ${alert.packageName}: no vulnerable instances below targets`)
                    this.summary.alertsSkipped++
                    continue
                }
                const snapshot = snapshotTrackedFiles(this.workDir)
                this.logger.info(
                    `[multi-version] ${alert.packageName}: applying versioned overrides ${JSON.stringify(versionedOverrides)}`,
                )
                const result = await applyVersionedOverrides({
                    packageName: alert.packageName,
                    versionedOverrides,
                    workDir: this.workDir,
                })
                // C1：overrides 写入位置可能被 pnpm v10+ 忽略 → 成功但需用户注意的 warning 进日志
                if (result.success && result.warning) {
                    this.logger.warn(`[multi-version] ${alert.packageName}: ${result.warning}`)
                }
                const action: FixAction = {
                    type: 'dependency-upgrade',
                    repository: alert.repository,
                    target: alert.packageName,
                    fromVersion: '',
                    toVersion: result.toVersion,
                    isMajor: false,
                    strategy: 'versioned-override',
                    success: result.success,
                    error: result.error,
                    durationMs: 0,
                }
                if (!result.success) {
                    this.allActions.push(action)
                    failed++
                    continue
                }
                // 组级快速验证：lint 通过 → 保留；失败 → 回滚
                const groupOk = await quickVerifyProject(this.ctx, repo)
                if (groupOk) {
                    this.allActions.push(action)
                    fixed++
                    this.logger.info(`[multi-version] ${alert.packageName}: versioned overrides passed verification`)
                } else {
                    restoreTrackedFiles(this.workDir, snapshot)
                    action.success = false
                    action.error = 'lint failed after versioned overrides; changes rolled back'
                    this.allActions.push(action)
                    failed++
                    this.logger.warn(`[multi-version] ${alert.packageName}: verification failed — rolled back versioned overrides`)
                }
            }

            const fixableAlerts = dedupeFixableAlerts(
                singleVersionAlerts.filter((a) => a.fixable && a.recommendedVersion),
            )

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
                            `Skipping ${alert.packageName}: highest locked ${currentVersion} >= target ${alert.recommendedVersion} (no upgrade needed; vulnerable lower version may coexist across manifests — global fix not applicable, manual review advised)`,
                        )
                        this.summary.alertsSkipped++
                        continue
                    }
                    if (currentVersion === null) {
                        // 包不在 lockfile（或格式非常规）——不降级保护失效，warn 提示
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

            // Track skipped (non-fixable) alerts（子目录 manifest 已在 2.0 单独计入，避免重复计数；
            // 多版本共存包已在 2.0.1 独立处理，不计入此 skipped 差额）
            const skippedCount = singleVersionAlerts.length - fixableAlerts.length
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
            const hint = dependabotAlertsTokenHint(error) ?? codeScanningAlertsTokenHint(error)
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
            const defaultBranch = await this.fetchDefaultBranch(client, owner, repo)

            // Build RunResult for PR body
            computeSummary(this.ctx)
            const runResult = buildRunResult(this.ctx)
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

    // -----------------------------------------------------------------------
    // Multi-repo orchestration（T402：并发控制 + 失败隔离）
    // -----------------------------------------------------------------------

    /**
     * 多仓库并发执行管线。
     *
     * - 并发窗口 = config.maxConcurrency（默认 1 保守串行，行为与现状一致）
     * - `>1` 时输出警告（并行 GitHub API 调用可能触发限流）
     * - 失败隔离由 task 内部 try-catch 承担（每仓库独立 repoResults 记录），
     *   scheduler 提供 onError 兜底，单仓库异常不中断整体
     * - 空清单：记录 EMPTY_REPO_LIST 错误（非 0 退出），避免静默空跑（T-G2-1 同构缺陷）
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
     * 解析本次运行要处理的仓库清单（M4 owner 自动发现 + 显式列表合并）。
     *
     * - 配置了 `--owner` 且 client 可用：自动发现 → 与显式 `repositories` 合并去重
     *   （显式优先：显式列表保持原顺序在前，发现结果按仓库名排序仅补充未出现项）
     * - 发现失败（token 权限、网络等全局性问题）：记录 DISCOVERY_FAILED 错误，
     *   回退处理显式列表（显式优先语义，不静默丢弃显式仓库）
     * - 未配置 `--owner`：沿用现有 resolveAlertRepositories 语义
     */
    private async resolveRepositories(client: Octokit | null): Promise<string[]> {
        const { owner } = this.config
        // T403 名单策略：include 仅作用于发现结果；exclude 对显式 + 发现均生效；
        // topicsExclude 仅作用于发现结果（显式列表无 topics 元数据）
        const policy: RepoPolicy = {
            include: this.config.repoInclude,
            exclude: this.config.repoExclude,
            topicsExclude: this.config.repoTopicsExclude,
        }

        if (!client || !owner || owner.length === 0) {
            // 无 owner 发现：显式列表仍受 exclude 约束（T403 语义）
            return filterExplicitRepositories(policy, resolveAlertRepositories(this.ctx))
        }

        try {
            const discovered = await discoverRepositories({
                client,
                owners: owner,
                topics: this.config.repoTopics,
                // T403：策略在发现探测前应用（被排除仓库不触达 contents API）
                policy,
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

    /**
     * 告警数据源统一入口：
     * - `github-dependabot`：Octokit 拉取 Dependabot alerts（alertsToken 优先）；
     *   `codeScanningEnabled` 时**并行**拉取 Code Scanning alerts（互不覆盖、互不回退）
     * - `pnpm-audit`：本地 `pnpm audit --json` 回退（无 token；repository 已由 resolveAlertRepositories 解析）
     * 并行源任一失败 → 抛 AppError 硬失败（沿用 T-G2-1 语义），由调用方 catch 记录 hint。
     */
    private async fetchAlerts(repo: string): Promise<NormalizedSecurityAlert[]> {
        if (this.config.alertSource === 'pnpm-audit') {
            return fetchPnpmAuditAlerts({ workDir: this.workDir, repository: repo })
        }
        const alertsClient = this.createAlertsClient()
        const [owner, name] = repo.split('/')

        const dependabotAlerts = await fetchDependabotAlerts(alertsClient, { owner, repo: name })
        if (!this.config.codeScanningEnabled) {
            return dependabotAlerts
        }
        const codeScanningAlerts = await fetchCodeScanningAlerts(alertsClient, { owner, repo: name })
        this.logger.info(`Fetched ${codeScanningAlerts.length} code scanning alerts for ${repo}`)
        return [...dependabotAlerts, ...codeScanningAlerts]
    }

    /** pnpm-audit 模式不创建 GitHub client（无 token）；github-dependabot 模式返回主 token client。 */
    private githubClientOrNull(): Octokit | null {
        if (this.config.alertSource === 'pnpm-audit') {
            return null
        }
        return this.createClient()
    }

    private createClient(token: string = this.config.githubToken): Octokit {
        return createGitHubClient({
            token,
            // T402：429 / rate limit 指数退避重试（0 可关闭；退避上限可配）
            retry: {
                maxRetries: this.config.maxRetries,
                maxBackoffMs: this.config.maxBackoffMs,
            },
        })
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

/** 告警截断提示（report/fix 共用；code-scanning 开启时附加排序说明）。 */
function truncatedWarning(config: RuntimeConfig, truncatedCount: number): string {
    const base = `[alerts] ${truncatedCount} alert(s) truncated (max ${config.maxAlertsPerRepository} per repository) — consider --max-alerts-per-repository`
    return config.codeScanningEnabled
        ? `${base}; code-scanning alerts rank after fixable dependabot alerts`
        : base
}
