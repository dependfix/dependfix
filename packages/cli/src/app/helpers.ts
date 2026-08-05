// helpers.ts（原 app-helpers.ts）
// DependfixApp 的辅助方法集合。
// 为控制 app/index.ts 文件规模（max-lines 800），将不直接参与模式编排的方法
// 提取为模块级函数；通过 AppContext 传入所需状态，行为与原类方法一致。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { execSync } from 'node:child_process'
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
import { inferRepoFromGitRemote, type RuntimeConfig } from '../config'
import {
    compareSemver,
    parseMajorVersion,
    readLockfileVersions,
    upgradeDependency,
    overrideTransitiveDependency,
    type DependencyFixResult,
} from '../fixers/dependency'
import { repairLockfile, type LockfileRepairResult } from '../fixers/pnpm'
import { runVerification, type VerificationResult } from '../runners/verification-runner'
import { applyCodeScanningFix, restoreSourceFile, snapshotSourceFile } from '../fixers/code-scanning'
import { quickVerifyProject } from '../helpers'
import { stageAndCommit } from '../github/pr-creator'

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

/**
 * 解析本次运行要处理的仓库列表。
 * - `github-dependabot`：config.repositories（配置层已保证非空）
 * - `pnpm-audit`：显式 --repo（≤1）→ git remote 推断（无 token 不代表无 remote）→ `local` 兜底
 */
export function resolveAlertRepositories(
    ctx: Pick<AppContext, 'config' | 'workDir' | 'logger'>,
): string[] {
    if (ctx.config.alertSource !== 'pnpm-audit') {
        return ctx.config.repositories
    }
    if (ctx.config.repositories.length > 0) {
        return ctx.config.repositories
    }
    const inferred = inferRepoFromGitRemote(ctx.workDir)
    if (inferred) {
        ctx.logger.info(`[alerts] pnpm-audit: repository inferred from git remote: ${inferred}`)
        return [inferred]
    }
    ctx.logger.info('[alerts] pnpm-audit: no git remote found, using "local" as repository')
    return ['local']
}

/** 自动修复提交的兜底标题（无成功升级 / 包名超长无法生成动态标题时） */
export const FIX_COMMIT_MESSAGE = 'fix(deps): automated dependfix security repair'

/** commitlint header-max-length 上限（commitlint-config-cmyr 覆盖为 140） */
const COMMIT_HEADER_MAX_LENGTH = 140

/**
 * 生成带升级明细的提交消息（Dependabot bump 风格）。
 * 标题含包名：单包 `bump flatted from 3.3.3 to 3.4.2`；多包列表（超长截断 `and N more`）。
 * 明细 `- pkg: from → to (pnpm overrides)`；排除 `PR #N` 记录型 action；无成功升级仅返回标题。
 */
export function buildCommitMessage(actions: FixAction[]): string {
    const upgrades = actions.filter((a) => a.type === 'dependency-upgrade' && a.success && !a.target.startsWith('PR #'))

    if (upgrades.length === 0) {
        return FIX_COMMIT_MESSAGE
    }

    const lines = [buildCommitTitle(upgrades), '']
    for (const a of upgrades) {
        const from = a.fromVersion && a.fromVersion !== 'unknown' ? `${a.fromVersion} → ` : ''
        const to = a.toVersion ?? 'latest'
        const suffix = a.strategy === 'override' ? ' (pnpm overrides)' : ''
        lines.push(`- ${a.target}: ${from}${to}${suffix}`)
    }
    return lines.join('\n')
}

/** 生成提交标题：单包 `bump pkg from X to Y`；多包列表（超长截断为前 N 个 + `and M more`）。 */
function buildCommitTitle(upgrades: FixAction[]): string {
    if (upgrades.length === 1) {
        const a = upgrades[0]
        const from = a.fromVersion && a.fromVersion !== 'unknown' ? ` from ${a.fromVersion}` : ''
        const to = a.toVersion ? ` to ${a.toVersion}` : ''
        const title = `fix(deps): bump ${a.target}${from}${to}`
        return title.length <= COMMIT_HEADER_MAX_LENGTH ? title : FIX_COMMIT_MESSAGE
    }

    const names = upgrades.map((a) => a.target)
    const full = `fix(deps): bump ${names.join(', ')}`
    if (full.length <= COMMIT_HEADER_MAX_LENGTH) {
        return full
    }

    // 超长：逐步减少展示数量，直到 `bump a, b and N more` 不超过上限
    let count = names.length - 1
    while (count > 0) {
        const candidate = `fix(deps): bump ${names.slice(0, count).join(', ')} and ${names.length - count} more`
        if (candidate.length <= COMMIT_HEADER_MAX_LENGTH) {
            return candidate
        }
        count--
    }
    return FIX_COMMIT_MESSAGE
}

/**
 * PR 创建失败的用户指引。
 * 识别 GITHUB_TOKEN 创建 PR 被仓库设置禁用的 403（"GitHub Actions is not
 * permitted to create or approve pull requests"），返回解决指引；其他错误返回 null。
 */
export function pullRequestCreationHint(error: unknown): string | null {
    const message = toErrorMessage(error)
    if (message.includes('not permitted to create or approve pull requests')) {
        return 'GitHub Actions 创建 PR 被仓库设置禁用：仓库 Settings → Actions → General → Workflow permissions → 勾选 "Allow GitHub Actions to create and approve pull requests"；或改用具备 pull-requests: write 权限的 PAT 作为 github-token'
    }
    return null
}

/**
 * Dependabot alerts fetch 错误用户指引（GITHUB_TOKEN 无法读取 Dependabot alerts）。
 * 仅用于 alerts fetch 错误路径；按精确 context 匹配（`fetch dependabot alerts for`），
 * 不依赖裸关键字（仓库名可能包含对方关键字，如 dependabot/dependabot-core）。
 */
export function dependabotAlertsTokenHint(error: unknown): string | null {
    if (!(error instanceof AppError)) {
        return null
    }
    if (!error.message.includes('fetch dependabot alerts for')) {
        return null
    }
    if (error.code === 'PERMISSION_DENIED') {
        return '请检查 token 是否具备 Dependabot alerts 读取权限（classic PAT 需 security_events、fine-grained 需 Dependabot alerts: read、GitHub App 需对应仓库权限；Actions 默认 GITHUB_TOKEN 永远无法获得）。本地场景可切换 --alerts-source pnpm-audit 使用 pnpm audit 回退'
    }
    if (error.code === 'AUTHENTICATION_FAILED') {
        return 'token 无效或已过期，请检查 GITHUB_TOKEN / alertsToken 配置'
    }
    return null
}

/**
 * Code Scanning alerts fetch 错误用户指引（token 需 `security-events: read`）。
 * 仅用于 Code Scanning fetch 错误路径；按精确 context 匹配（`fetch code scanning alerts for`），
 * 不依赖裸关键字（仓库名可能包含对方关键字，如 dependabot/dependabot-core）。
 */
export function codeScanningAlertsTokenHint(error: unknown): string | null {
    if (!(error instanceof AppError)) {
        return null
    }
    if (!error.message.includes('fetch code scanning alerts for')) {
        return null
    }
    if (error.code === 'PERMISSION_DENIED') {
        return '请检查 token 是否具备 Code Scanning alerts 读取权限（security-events: read；Actions 默认 GITHUB_TOKEN 具备，本地 PAT 需勾选 Security events 或 fine-grained 的 Code scanning alerts: read）'
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
 * 判断告警包是否在 lockfile 中多版本共存（版本化 overrides 修复的前置条件）。
 *
 * 多版本共存 = lockfile 中该包存在 **多个大版本**（如 vite@5.4.14 与 vite@8.2.0）。
 * 同一大版本内的多个小版本（如 fast-uri@3.1.0 与 3.1.5）不构成多版本场景，
 * 仍走常规单目标升级（lockfile 最高版本已 >= 目标时不降级保护跳过）。
 */
export function hasMultipleMajorVersions(lockfilePath: string, packageName: string): boolean {
    const versions = readLockfileVersions(lockfilePath, packageName)
    const majors = new Set(versions.map((v) => v.split('.')[0]))
    return majors.size > 1
}

/**
 * 为 lockfile 中多版本共存的包构建版本化 overrides 映射。
 *
 * 对 lockfile 中**与目标同大版本**且低于目标的脆弱实例（如 vite@5.4.14），
 * 生成 `pkg@version: ^target`：
 * - target = 告警的 recommendedVersion（Dependabot 的 first_patched_version）
 * - key 使用**实例精确版本**（pnpm 版本化 override 惯例，参考用户提供的
 *   path-to-regexp@0.1.12: ^0.1.13 示例），只影响该实例，不波及其他大版本
 * - 仅覆盖与 target **同 major** 的实例：若告警 target 属更高 major（如 vite@8
 *   告警 target 8.3.0），不强制把 5.x 实例跨大版本升级（子工作区破坏无法被
 *   根 lint 验证捕获——Review Gate P2）
 *
 * @returns 版本化 overrides 映射；无法确定目标时不生成该 key
 */
export function buildVersionedOverrides(
    lockfilePath: string,
    alert: NormalizedSecurityAlert,
): Record<string, string> {
    const versions = readLockfileVersions(lockfilePath, alert.packageName)
    const target = alert.recommendedVersion
    if (!target) {
        return {}
    }
    const targetMajor = parseMajorVersion(target)
    const overrides: Record<string, string> = {}
    for (const version of versions) {
        // 只覆盖与目标同大版本且低于目标的脆弱实例（不跨 major 升级）
        if (parseMajorVersion(version) === targetMajor && compareSemver(version, target) < 0) {
            overrides[`${alert.packageName}@${version}`] = `^${target}`
        }
    }
    return overrides
}

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
        let strategy: 'override' | undefined

        if (!result.success && result.error?.includes('not found in dependencies')) {
            // 间接依赖 — 通过 pnpm overrides 升级
            strategy = 'override'
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
            strategy,
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

/**
 * 执行 Code Scanning 模板修复（T303 2.0 节；从 app/index.ts 提取以控制文件行数）。
 * 仅处理 A 类告警；逐告警：快照 → 应用模板 → quickVerify（lint）→ 失败回滚（不静默）。
 * - 快照失败 / 无模板 / 模板不适用 / 缺文件 → noOp 动作（回退建议模式，T304 展示；
 *   error 原因可审计，不计 failed 避免陈旧告警永久 exit 1/2）
 * - 写盘失败 / lint 验证失败 → failed（回滚并记录；回滚失败时注明 file may be modified）
 * @returns 本批次实际修复数（fixed）与失败数（failed），调用方累加到仓库统计
 */
export async function runCodeScanningFixes(
    ctx: Pick<AppContext, 'config' | 'workDir' | 'logger' | 'allActions'>,
    repo: string,
    alerts: NormalizedSecurityAlert[],
): Promise<{ fixed: number, failed: number }> {
    const { config, workDir, logger } = ctx
    const codeScanningAutoFixable = alerts.filter(
        (a) => a.source === 'code-scanning' && a.alertClass === 'auto-fixable',
    )

    let fixed = 0
    let failed = 0

    for (const csAlert of codeScanningAutoFixable) {
        // 源码文件快照（不在 snapshotTrackedFiles 清单范围内——回滚必须精确到目标文件）
        const sourceSnapshot = snapshotSourceFile(workDir, csAlert.manifestPath)
        if (!sourceSnapshot) {
            // 快照失败（路径越界/读取异常）：构造 noOp action 保证可审计（不静默）
            const snapAction: FixAction = {
                type: 'code-scanning-fix',
                repository: csAlert.repository,
                target: csAlert.ruleId,
                success: true,
                noOp: true,
                filePath: csAlert.manifestPath,
                error: `cannot snapshot ${csAlert.manifestPath} (unsafe path or unreadable)`,
                durationMs: 0,
            }
            ctx.allActions.push(snapAction)
            logger.warn(`[code-scanning] ${csAlert.ruleId} skipped: ${snapAction.error}`)
            continue
        }

        const action = applyCodeScanningFix({ workDir, alert: csAlert, dryRun: config.dryRun })
        if (!action) {
            continue // 防御：过滤条件已保证非空
        }

        if (!action.success) {
            // 失败分支也恢复快照（写盘异常可能产生中间态；幂等，未改动时写回原内容无害）
            const restored = restoreSourceFile(workDir, sourceSnapshot)
            if (!restored) {
                action.error = `${action.error}; rollback failed, file may be modified`
            }
            ctx.allActions.push(action)
            failed++
            logger.warn(`[code-scanning] ${csAlert.ruleId} not auto-fixed: ${action.error}`)
            continue
        }

        // no-op / 无法安全处理（陈旧告警、无模板、歧义）→ 不计 fixed/failed，
        // error 在 Fix Actions 表可见（不静默）
        if (action.noOp) {
            ctx.allActions.push(action)
            if (action.error) {
                logger.warn(`[code-scanning] ${csAlert.ruleId} skipped: ${action.error}`)
            }
            continue
        }

        if (config.dryRun) {
            fixed++
            ctx.allActions.push(action)
            continue
        }

        const quickOk = await quickVerifyProject(ctx, repo)
        if (!quickOk) {
            const restored = restoreSourceFile(workDir, sourceSnapshot)
            action.success = false
            action.error = restored
                ? 'lint failed after code-scanning fix; changes rolled back'
                : 'lint failed after code-scanning fix; rollback failed, file may be modified'
            ctx.allActions.push(action)
            failed++
            logger.warn(`[code-scanning] ${csAlert.ruleId} fix rolled back: lint failed`)
            continue
        }

        ctx.allActions.push(action)
        fixed++
        logger.info(`[code-scanning] ${csAlert.ruleId}: ${action.diff}`)
    }

    return { fixed, failed }
}

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
        const result: LockfileRepairResult = repairLockfile({
            workDir,
            // 未配置 toolchainPnpmVersion 时省略（缺省从 packageManager 解析）
            ...(config.toolchainPnpmVersion ? { toolchain: { pnpmVersion: config.toolchainPnpmVersion } } : {}),
        })

        logger.info(
            result.success
                ? `Lockfile repaired for ${repo} (strategy: ${result.strategy ?? 'N/A'})`
                : `Lockfile repair failed for ${repo}: ${result.failureDetail ?? 'unknown'}`,
        )

        // 格式漂移检测：lockfileVersion 变化时 diff 摘要附加标注（wisdom: pnpm v11 迁移教训）
        let diffSummary = result.diff?.summary
        if (result.lockfileVersionChanged && diffSummary) {
            diffSummary = `${diffSummary} (lockfileVersion changed)`
        }

        return {
            type: 'lockfile-repair',
            repository: repo,
            target: 'pnpm-lock.yaml',
            success: result.success,
            error: result.success ? undefined : (result.failureDetail ?? 'Lockfile repair failed'),
            strategy: result.strategy,
            durationMs: Date.now() - startMs,
            diff: diffSummary,
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
export function validateVerifyCommands(commands: string[], workDir: string): { valid: string[], skipped: string[] } {
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
    ctx: Pick<AppContext, 'logger' | 'workDir' | 'allActions'>,
): void {
    const { logger, workDir, allActions } = ctx

    if (!hasGitChanges(workDir)) {
        logger.info('No changes to commit — skipping local commit')
        return
    }

    // 提交前先确保报告目录被 .gitignore 忽略，避免残留的 dependfix-reports/ 被 git add 提交
    ensureGitignore(workDir)

    const commitMessage = buildCommitMessage(allActions)
    stageAndCommit(commitMessage, workDir)
    logger.info(`Committed fix changes to current branch: ${commitMessage.split('\n')[0]}`)
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
// Branch cleanup（迁移至 ./branch-cleanup，保持向后兼容 re-export）
// ---------------------------------------------------------------------------

export {
    autoCleanupMergedBranches,
    closeSupersededPRs,
    confirmCleanup,
    reportCleanupCandidates,
    runBranchCleanupForRepo,
} from './branch-cleanup'

/**
 * 按动作构成生成 PR 标题（收尾审查遗留修复：cs-only 修复不再误标 "N upgrades"，
 * lockfile-only 不再出现 "0 upgrades"）。
 * - 依赖升级 + code-scanning 修复分别计数；均为 0 时（lockfile-only）中性标题。
 * - ⚠️ 不变式：`upgrades = alertsFixed - codeFixes` 依赖 computeSummary 与
 *   codeFixes 过滤条件一致（均 success && !noOp）；任一侧口径变更必须同步。
 */
export function buildPrTitle(summary: Pick<RunSummary, 'alertsFixed'>, actions: FixAction[]): string {
    const codeFixes = actions.filter((a) => a.type === 'code-scanning-fix' && a.success && !a.noOp).length
    const upgrades = Math.max(0, summary.alertsFixed - codeFixes)

    const parts: string[] = []
    if (upgrades > 0) {
        parts.push(`${upgrades} upgrade${upgrades > 1 ? 's' : ''}`)
    }
    if (codeFixes > 0) {
        parts.push(`${codeFixes} code fix${codeFixes > 1 ? 'es' : ''}`)
    }
    return parts.length > 0
        ? `fix(deps): automated security fix — ${parts.join(', ')}`
        : 'fix(deps): automated security fix'
}

// ---------------------------------------------------------------------------
// Result assembly
// ---------------------------------------------------------------------------

/** 汇总所有动作到 summary（alertsSkipped 已在 processRepoForFix 中累加）。 */
export function computeSummary(
    ctx: Pick<AppContext, 'allActions' | 'allAlerts' | 'repoResults' | 'summary'>,
): void {
    const { allActions, allAlerts, repoResults, summary } = ctx

    let fixed = 0
    let failed = 0
    let lockfileRepairs = 0
    let verificationsPassed = 0
    let verificationsFailed = 0

    for (const action of allActions) {
        // noOp（如 code-scanning 修复时文件已合规）不计入 fixed/failed（口径与 repoResults 一致）
        if (action.noOp) {
            continue
        }
        if (action.type === 'dependency-upgrade' || action.type === 'code-scanning-fix') {
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

    // 用 repoResults 而非 config.repositories：pnpm-audit + 无 remote 时
    // config.repositories 为空但实际处理了 1 个 local 仓库（报告可审计性）
    summary.repositoriesScanned = repoResults.length
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
        alertSource: ctx.config.alertSource,
        codeScanningEnabled: ctx.config.codeScanningEnabled,
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
    // 验证失败（verificationPassed === false）的仓库不算成功交付（改动已回滚）
    const hasRepoSuccess = repoResults.length > 0
        && repoResults.some((r) => r.verificationPassed !== false
            && (r.alertsCount > 0 || r.fixed > 0 || r.verificationPassed === true))
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

