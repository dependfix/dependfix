// app-helpers.ts
// DependfixApp 的辅助方法集合。
// 为控制 app.ts 文件规模（max-lines 800），将不直接参与模式编排的方法
// 提取为模块级函数；通过 AppContext 传入所需状态，行为与原类方法一致。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Octokit } from '@octokit/rest'
import {
    AppError,
    toErrorMessage,
    type FixAction,
    type FixError,
    type Logger,
    type NormalizedSecurityAlert,
    type RepositoryResult,
    type RunResult,
    type RunReportConfig,
    type RunSummary,
} from '@dependfix/core'
import type { RuntimeConfig } from './config'
import {
    upgradeDependency,
    overrideTransitiveDependency,
    type DependencyFixResult,
} from './fixers/dependency'
import { repairLockfile, type LockfileRepairResult } from './fixers/pnpm'
import { runVerification, type VerificationResult } from './runners/verification-runner'
import {
    stageAndCommit,
    closePullRequest,
    listDependfixBranches,
    getBranchPrStatus,
    isConfirmAnswer,
} from './github/pr-creator'

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
export const FIX_COMMIT_MESSAGE = 'fix(deps): automated dependfix security repair'

/**
 * Dependabot alerts 拉取路径的鉴权/权限错误用户指引（GITHUB_TOKEN 无法读取 Dependabot alerts）。
 * 返回附加到错误消息的提示文案；非鉴权类错误返回 null。
 * ⚠️ 仅用于 alerts fetch 错误路径（`fetchDependabotAlerts` 抛出的 `AppError`）；
 * 其他 API 的 PERMISSION_DENIED（如 PR 创建 403）语义不同，不得复用。
 */
export function dependabotAlertsTokenHint(error: unknown): string | null {
    if (!(error instanceof AppError)) {
        return null
    }
    if (error.code === 'PERMISSION_DENIED') {
        return '请检查 token 是否具备 Dependabot alerts 读取权限（classic PAT 需 security_events、fine-grained 需 Dependabot alerts: read、GitHub App 需对应仓库权限；Actions 默认 GITHUB_TOKEN 永远无法获得）'
    }
    if (error.code === 'AUTHENTICATION_FAILED') {
        return 'token 无效或已过期，请检查 GITHUB_TOKEN / alertsToken 配置'
    }
    return null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/** DependfixApp 提供给辅助方法的最小状态切片。 */
export interface AppContext {
    config: RuntimeConfig
    workDir: string
    logger: Logger
    customCommands?: string[]
    runId: string
    allAlerts: NormalizedSecurityAlert[]
    allActions: FixAction[]
    allErrors: FixError[]
    repoResults: RepositoryResult[]
    summary: RunSummary
    startedAt: string
    finishedAt: string
}

// ---------------------------------------------------------------------------
// Upgrade helpers
// ---------------------------------------------------------------------------

/**
 * 升级单个告警对应的依赖（dry-run 仅记录）。
 * 优先直接升级，失败且为间接依赖时回退到 pnpm overrides。
 */
export async function upgradeAlert(
    ctx: Pick<AppContext, 'config' | 'logger' | 'workDir'>,
    alert: NormalizedSecurityAlert,
): Promise<FixAction> {
    const { config, logger, workDir } = ctx
    const startMs = Date.now()

    if (config.dryRun) {
        logger.info(`[dry-run] Would upgrade ${alert.packageName} to ${alert.recommendedVersion}`)
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
            workDir,
        })

        if (!result.success && result.error?.includes('not found in dependencies')) {
            // 间接依赖 — 通过 pnpm overrides 升级
            result = await overrideTransitiveDependency({
                packageName: alert.packageName,
                targetVersion: alert.recommendedVersion,
                workDir,
            })
            logger.info(
                result.success
                    ? `Upgraded ${result.packageName}: ${result.fromVersion} → ${result.toVersion} (pnpm overrides)`
                    : `Failed to upgrade ${result.packageName}: ${result.error}`,
            )
        } else {
            logger.info(
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
        logger.error(`Upgrade error for ${alert.packageName}: ${message}`)
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

// ---------------------------------------------------------------------------
// Lockfile repair
// ---------------------------------------------------------------------------

/** 尝试修复 pnpm-lock.yaml（dry-run 仅记录）。 */
export function tryLockfileRepair(
    ctx: Pick<AppContext, 'config' | 'logger' | 'workDir'>,
    repo: string,
): FixAction {
    const { config, logger, workDir } = ctx
    const startMs = Date.now()

    if (config.dryRun) {
        logger.info(`[dry-run] Would attempt lockfile repair for ${repo}`)
        return {
            type: 'lockfile-repair',
            repository: repo,
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        }
    }

    try {
        const result: LockfileRepairResult = repairLockfile({ workDir })

        logger.info(
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
        logger.error(`Lockfile repair error for ${repo}: ${message}`)
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

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

/** 执行验证命令链，返回逐命令结果。 */
export async function verifyProject(
    ctx: Pick<AppContext, 'customCommands' | 'logger' | 'workDir' | 'allErrors'>,
    repo: string,
): Promise<FixAction[]> {
    const { customCommands, logger, workDir, allErrors } = ctx

    // 确定要执行的命令：用户自定义 > 默认命令链
    const rawCommands = customCommands ?? DEFAULT_VERIFY_COMMANDS

    // 仅对默认命令链做脚本存在性校验
    const isDefault = !customCommands
    const { valid, skipped } = isDefault
        ? validateVerifyCommands(rawCommands, workDir)
        : { valid: rawCommands, skipped: [] as string[] }

    // 记录被跳过的命令
    for (const cmd of skipped) {
        logger.info(`Skipping command "${cmd}": script not found in package.json`)
        allErrors.push({
            repository: repo,
            target: cmd,
            stage: 'verify',
            category: 'SCRIPT_NOT_FOUND',
            message: `Skipped: no matching script in package.json for "${cmd}"`,
        })
    }

    if (valid.length === 0) {
        logger.info(`No verification commands to run for ${repo}`)
        return []
    }

    try {
        const result: VerificationResult = await runVerification({
            workDir,
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
        logger.error(`Verification error for ${repo}: ${message}`)
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
function validateVerifyCommands(commands: string[], workDir: string): { valid: string[], skipped: string[] } {
    const pkgJsonPath = join(workDir, 'package.json')
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

// ---------------------------------------------------------------------------
// Local commit helpers
// ---------------------------------------------------------------------------

/**
 * 将修复产生的变更提交到本地当前分支。
 *
 * - 无任何变更（含已暂存变更）时跳过
 * - config 校验已保证 `commit` 与 `dryRun` / `createPullRequest` 互斥，
 *   因此这里不需要再检查这两个开关
 */
export function commitLocalChanges(
    ctx: Pick<AppContext, 'logger' | 'workDir'>,
): void {
    const { logger, workDir } = ctx

    if (!hasGitChanges(workDir)) {
        logger.info('No changes to commit — skipping local commit')
        return
    }

    // 提交前先确保报告目录被 .gitignore 忽略，避免残留的 dependfix-reports/ 被 git add 提交
    ensureGitignore(workDir)

    stageAndCommit(FIX_COMMIT_MESSAGE, workDir)
    logger.info(`Committed fix changes to current branch: ${FIX_COMMIT_MESSAGE}`)
}

/**
 * 检查工作目录是否有未提交的变更（含未暂存与已暂存）。
 */
export function hasGitChanges(workDir: string): boolean {
    try {
        execSync('git diff --quiet', { cwd: workDir, stdio: 'pipe' })
        execSync('git diff --cached --quiet', { cwd: workDir, stdio: 'pipe' })
        return false // 两者都无变更
    } catch {
        return true // 任一有变更
    }
}

/**
 * 确保目标仓库的 `.gitignore` 中包含 `dependfix-reports/`。
 *
 * - 仅在 workDir 是 git 仓库时执行
 * - 已存在该条目时幂等跳过
 * - 失败（权限、磁盘满等）静默降级
 */
export function ensureGitignore(workDir: string): void {
    try {
        const gitDir = join(workDir, '.git')
        if (!existsSync(gitDir)) {
            return
        }

        const gitignorePath = join(workDir, '.gitignore')
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

// ---------------------------------------------------------------------------
// PR helpers
// ---------------------------------------------------------------------------

/**
 * 关闭被取代的旧 PR。单条关闭失败不中断其余 PR 的关闭，
 * 失败记录为 `PR_CLOSE_FAILED`（与 PR 创建失败区分）。
 */
export async function closeSupersededPRs(
    ctx: Pick<AppContext, 'logger' | 'allErrors'>,
    client: Octokit,
    owner: string,
    repo: string,
    supersedePRs: { number: number }[],
): Promise<void> {
    const { logger, allErrors } = ctx
    for (const old of supersedePRs) {
        try {
            await closePullRequest(client, owner, repo, old.number)
            logger.info(`Closed superseded PR #${old.number}`)
        } catch (error: unknown) {
            const message = toErrorMessage(error)
            logger.error(`Failed to close superseded PR #${old.number}: ${message}`)
            allErrors.push({
                repository: `${owner}/${repo}`,
                stage: 'report',
                category: 'PR_CLOSE_FAILED',
                message: `Failed to close PR #${old.number}: ${message}`,
            })
        }
    }
}

/**
 * （fix-and-pr + --cleanup-branches）将已合并的 dependfix 分支列为待清理清单，
 * 记录到报告与日志，不执行删除。
 */
export async function reportCleanupCandidates(
    ctx: Pick<AppContext, 'config' | 'logger' | 'allActions' | 'allErrors'>,
    client: Octokit,
): Promise<void> {
    const { config, logger, allActions, allErrors } = ctx
    for (const repo of config.repositories) {
        const [owner, name] = repo.split('/')
        try {
            const branches = await listDependfixBranches(client, owner, name)
            for (const branch of branches) {
                const status = await getBranchPrStatus(client, owner, name, branch)
                if (status.merged) {
                    logger.info(`[cleanup] merged branch awaiting manual cleanup: ${branch}`)
                    allActions.push({
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
            logger.error(`[cleanup] detection failed for ${repo}: ${message}`)
            allErrors.push({
                repository: repo,
                stage: 'report',
                category: 'CLEANUP_DETECT_FAILED',
                message,
            })
        }
    }
}

/**
 * 交互式确认删除。非 TTY（CI/管道）时直接拒绝。
 */
export function confirmCleanup(
    ctx: Pick<AppContext, 'logger'>,
    repo: string,
    candidates: { branch: string }[],
): Promise<boolean> {
    const { logger } = ctx
    if (!process.stdin.isTTY) {
        logger.warn('[cleanup] non-TTY environment — deletion requires interactive confirmation, aborting')
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

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------

/** 汇总所有动作到 summary（alertsSkipped 已在 processRepoForFix 中累加）。 */
export function computeSummary(
    ctx: Pick<AppContext, 'config' | 'allActions' | 'allAlerts' | 'summary'>,
): void {
    const { config, allActions, allAlerts, summary } = ctx

    let fixed = 0
    let failed = 0
    let lockfileRepairs = 0
    let verificationsPassed = 0
    let verificationsFailed = 0

    for (const action of allActions) {
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

    const fixable = allAlerts.filter((a) => a.fixable).length

    summary.repositoriesScanned = config.repositories.length
    summary.alertsFound = allAlerts.length
    summary.alertsFixable = fixable
    summary.alertsFixed = fixed
    summary.alertsFailed = failed
    summary.lockfileRepairs = lockfileRepairs
    summary.verificationsPassed = verificationsPassed
    summary.verificationsFailed = verificationsFailed
}

/** 组装最终运行结果。 */
export function buildRunResult(
    ctx: Pick<AppContext, 'config' | 'runId' | 'startedAt' | 'finishedAt' | 'summary' | 'repoResults' | 'allAlerts' | 'allActions' | 'allErrors'>,
): RunResult {
    const reportConfig: RunReportConfig = {
        mode: ctx.config.mode,
        severityThreshold: ctx.config.severityThreshold,
        repositories: ctx.config.repositories,
        dryRun: ctx.config.dryRun,
        createPullRequest: ctx.config.createPullRequest,
        maxAlertsPerRepository: ctx.config.maxAlertsPerRepository,
    }

    return {
        runId: ctx.runId,
        startedAt: ctx.startedAt,
        finishedAt: ctx.finishedAt,
        config: reportConfig,
        summary: ctx.summary,
        repositories: ctx.repoResults,
        alerts: ctx.allAlerts,
        actions: ctx.allActions,
        errors: ctx.allErrors,
    }
}

/**
 * 计算退出码：
 * - 0: 全部仓库处理成功（无 failed actions、无 errors）
 * - 1: 部分仓库失败
 * - 2: 全部仓库失败（或无仓库被成功处理）
 */
export function computeExitCode(
    ctx: Pick<AppContext, 'config' | 'allErrors' | 'allActions' | 'repoResults'>,
): number {
    const { config, allErrors, allActions, repoResults } = ctx
    const hasErrors = allErrors.length > 0
    const hasFailures = allActions.some((a) => !a.success)
    // 保守判定：dry-run 下成功仓库的 verificationPassed 为 undefined、alertsCount 可能为 0，
    // 与失败仓库并存时会被判为"无成功"（返回 2 而非 1）——fail-safe 方向，可接受
    const hasRepoSuccess = repoResults.length > 0
        && repoResults.some((r) => r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true)
    // cleanup-branches 模式不填充 repoResults，以成功的 branch-cleanup 动作判定
    const hasCleanupSuccess = config.mode === 'cleanup-branches'
        && allActions.some((a) => a.success && a.type === 'branch-cleanup')
    const hasSuccess = hasRepoSuccess || hasCleanupSuccess

    if (!hasErrors && !hasFailures) {
        return 0
    }

    if (hasSuccess) {
        return 1
    }

    return 2
}
