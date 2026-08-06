import { execSync } from 'node:child_process'
import { AppError, isValidRepoIdentifier, type SeverityThreshold, type AlertSourceKind } from '@dependfix/core'
import { resolveRepoList } from '../github/repo-selector'
import { isValidPnpmVersion } from '../fixers/pnpm'
import { isValidConcurrency } from '../multirepo/scheduler'

export const RUNTIME_MODES = ['report-only', 'fix', 'fix-and-pr', 'cleanup-branches'] as const
export const SEVERITY_THRESHOLDS = ['critical', 'high', 'medium', 'all'] as const
export const ALERT_SOURCES: readonly AlertSourceKind[] = ['github-dependabot', 'pnpm-audit']

/**
 * 环境变量统一前缀（v0.2 起替代旧项目名遗留的 `AUTO_FIX_GITHUB_SECURITY_`）。
 * 所有环境变量读取必须经由 {@link readEnv}，禁止散落硬编码，防止改名漏网。
 */
export const ENV_PREFIX = 'DEPENDFIX_'

/**
 * 从统一前缀读取环境变量。
 * @param env 进程环境
 * @param name 变量名（不含前缀），如 `'MODE'` → `DEPENDFIX_MODE`
 */
export function readEnv(env: NodeJS.ProcessEnv, name: string): string | undefined {
    return env[ENV_PREFIX + name]
}

export type RuntimeMode = typeof RUNTIME_MODES[number]
export type { SeverityThreshold, AlertSourceKind }

export interface RuntimeConfig {
    mode: RuntimeMode
    severityThreshold: SeverityThreshold
    repositories: string[]
    /**
     * owner / org 列表（`--owner` / `DEPENDFIX_OWNER`）。
     * 提供时按 owner 自动发现仓库：与显式 `repositories` 合并去重
     * （显式优先，发现仅补充未出现项）。适用于 report-only / fix / fix-and-pr。
     */
    owner?: string[]
    /**
     * 发现结果的 topic 白名单（`--repo-topics` / `DEPENDFIX_REPO_TOPICS`，AND 语义）。
     * 仓库必须包含全部指定 topics 才保留。仅影响发现结果，不影响显式列表。
     */
    repoTopics?: string[]
    /**
     * 仓库白名单 glob（`--repo-include`，如 `owner/*`、`owner/pkg-*`）。
     * 仅作用于发现结果；显式 repositories 列表不受 include 影响（显式优先）。
     */
    repoInclude?: string[]
    /**
     * 仓库黑名单 glob（`--repo-exclude`）。
     * 显式列表与发现结果均受 exclude 约束；与 include 冲突时 exclude 胜出。
     */
    repoExclude?: string[]
    /**
     * 发现结果 topic 黑名单（`--repo-topics-exclude`）：
     * 排除含任一指定 topic 的仓库。仅作用于发现结果（显式列表无 topics 元数据）。
     */
    repoTopicsExclude?: string[]
    dryRun: boolean
    createPullRequest: boolean
    /** 修复完成后是否在本地当前分支直接提交（不推送、不创建 PR） */
    commit: boolean
    /** fix-and-pr 模式下结束后是否列出已合并的 dependfix 分支到报告（不自动删除） */
    cleanupBranches: boolean
    /** fix-and-pr 模式下结束后是否自动删除已合并/已关闭的 dependfix 分支（非交互） */
    cleanupBranchesAuto: boolean
    githubToken: string
    /**
     * 告警数据源。默认 `github-dependabot`（GitHub Dependabot alerts API）；
     * `pnpm-audit` 为本地无 token 回退（`pnpm audit --json`），repository 解析
     * 优先显式 --repo → git remote → `local` 兜底。详见 docs/design/pnpm-audit-fallback.md。
     */
    alertSource: AlertSourceKind
    /**
     * 是否同时拉取 Code Scanning alerts（与 Dependabot 并行源，非回退）。
     * 默认关闭（行为与现状一致）；开启后 GitHub 源下 Dependabot + Code Scanning
     * 并行拉取、互不覆盖。Code Scanning 告警默认不可自动修复（按规则启用）。
     * 需要 token 具备 `security-events: read` 权限（GITHUB_TOKEN 默认具备）。
     */
    codeScanningEnabled: boolean
    /**
     * 跨线告警（推荐版本跨大版本）显式授权自动升级（`--allow-major-upgrade`）。
     *
     * 仅 CLI 参数入口，**刻意不提供 env 通道**（action 结构性禁用：
     * action.yml 未暴露 input 且无 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` 可绕过）。
     *
     * 开启后仅对「根 package.json 直接依赖（workspace 成员独占声明维持人工）
     * + lockfile 单版本」的跨线告警自动升级，升级后复核脆弱实例消除、
     * 强制完整验证（install + lint + build），失败自动回滚；
     * 间接依赖 / 多版本共存跨线告警维持人工处理（skipped + warn）。
     */
    allowMajorUpgrade: boolean
    /**
     * Dependabot alerts 专用 token（可选）。
     * 提供时仅用于拉取 Dependabot alerts（GITHUB_TOKEN 无法读取该 API，
     * 建议使用最小权限 fine-grained PAT，仅 `Dependabot alerts: read`）；
     * 缺省时回退使用 githubToken（本地完整 PAT 场景）。
     * 背景详见 docs/plan/todo.md「已知缺口 G2」。
     */
    alertsToken?: string
    maxAlertsPerRepository: number
    /**
     * 多仓库并发窗口。默认 1（保守，行为与现状一致）；
     * >1 时调度器输出警告（GitHub API 限流风险）。
     */
    maxConcurrency: number
    /**
     * GitHub API 限流重试次数。默认 3；
     * 对 429 / primary rate limit / secondary rate limit 指数退避重试，0 关闭。
     */
    maxRetries: number
    /**
     * 限流退避单次等待上限毫秒。默认 30000（30s）；
     * Retry-After / x-ratelimit-reset / 指数退避均受此上限约束。
     */
    maxBackoffMs: number
    /**
     * 用户显式分组（最高优先级，覆盖自动分组）。
     * 键为组名，值为组内包列表。缺省时使用自动分组
     * （dependabot.yml groups → @types 归并 → scope/前缀启发式）。
     * 详见 docs/design/dependency-grouping.md。
     */
    upgradeGroups?: Record<string, string[]>
    /**
     * lockfile 修复用的 pnpm 版本（工具链固定）。
     * 提供时 PIN_TOOLCHAIN 策略执行 `corepack pnpm@<version> install --lockfile-only`；
     * 缺省从 package.json 的 `packageManager` 字段解析；都不可用时回退裸 pnpm 命令
     * （由策略链 REGENERATE/REINSTALL 兜底）。
     */
    toolchainPnpmVersion?: string
}

export interface CliConfigOverrides {
    mode?: RuntimeMode
    severityThreshold?: SeverityThreshold
    repositories?: string[]
    reposFilePath?: string
    /** owner / org 列表（自动发现仓库，与显式列表合并去重） */
    owner?: string[]
    /** 发现结果 topic 白名单（AND 语义） */
    repoTopics?: string[]
    /** 仓库白名单 glob（仅作用于发现结果） */
    repoInclude?: string[]
    /** 仓库黑名单 glob（显式列表与发现结果均受约束） */
    repoExclude?: string[]
    /** 发现结果 topic 黑名单（排除含任一指定 topic 的仓库） */
    repoTopicsExclude?: string[]
    dryRun?: boolean
    createPullRequest?: boolean
    /** 修复完成后是否在本地当前分支直接提交 */
    commit?: boolean
    /** fix-and-pr 模式下结束后是否列出已合并的 dependfix 分支到报告 */
    cleanupBranches?: boolean
    /** fix-and-pr 模式下结束后是否自动删除已合并/已关闭的 dependfix 分支（非交互） */
    cleanupBranchesAuto?: boolean
    githubToken?: string
    /** 告警数据源（`github-dependabot` / `pnpm-audit`） */
    alertSource?: AlertSourceKind
    /** 是否同时拉取 Code Scanning alerts（默认 false） */
    codeScanningEnabled?: boolean
    /**
     * 跨线告警显式授权自动升级（仅 CLI `--allow-major-upgrade` 入口，
     * 无 env 通道；Action 不支持）。详见 RuntimeConfig.allowMajorUpgrade。
     */
    allowMajorUpgrade?: boolean
    /** Dependabot alerts 专用 token（可选，最小权限；缺省回退 githubToken） */
    alertsToken?: string
    maxAlertsPerRepository?: number
    /** 多仓库并发窗口（1-16，默认 1 保守） */
    maxConcurrency?: number
    /** GitHub API 限流重试次数（0-10，默认 3） */
    maxRetries?: number
    /** 限流退避单次等待上限毫秒（100-120000，默认 30000） */
    maxBackoffMs?: number
    /** 用户显式分组（覆盖自动分组），格式 `name1:pkg1,pkg2;name2:pkg3` */
    upgradeGroups?: Record<string, string[]>
    /** lockfile 修复用的 pnpm 版本（工具链固定；缺省从 packageManager 解析） */
    toolchainPnpmVersion?: string
    /** 是否输出详细日志 */
    verbose?: boolean
    /** 自定义验证命令（覆盖默认的 `pnpm install --frozen-lockfile` / `pnpm lint` / `pnpm build`） */
    commands?: string[]
    /**
     * 历史查询（仅 CLI `--history`）：读取归档索引列出仓库历史运行摘要，
     * 不进入运行配置（resolveRuntimeConfig 不消费），由 CLI 层直接处理。
     */
    history?: string
}

export interface ResolveRuntimeConfigOptions {
    env?: NodeJS.ProcessEnv
    cliOverrides?: CliConfigOverrides
    /** 工作目录，用于从 git remote 推断仓库名（默认 `process.cwd()`） */
    workDir?: string
}

export const DEFAULT_RUNTIME_CONFIG: Omit<RuntimeConfig, 'githubToken' | 'repositories' | 'dryRun' | 'createPullRequest' | 'commit' | 'cleanupBranches' | 'cleanupBranchesAuto'> = {
    mode: 'report-only',
    severityThreshold: 'high',
    alertSource: 'github-dependabot',
    codeScanningEnabled: false,
    allowMajorUpgrade: false,
    maxAlertsPerRepository: 20,
    maxConcurrency: 1,
    maxRetries: 3,
    maxBackoffMs: 30_000,
}

function isRuntimeMode(value: string): value is RuntimeMode {
    return RUNTIME_MODES.includes(value as RuntimeMode)
}

function isSeverityThreshold(value: string): value is SeverityThreshold {
    return SEVERITY_THRESHOLDS.includes(value as SeverityThreshold)
}

function isAlertSource(value: string): value is AlertSourceKind {
    return ALERT_SOURCES.includes(value as AlertSourceKind)
}

function normalizeBoolean(value: string | undefined, fieldName: string): boolean | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    const normalized = value.trim().toLowerCase()

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
        return true
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
        return false
    }

    throw new AppError('CONFIG_VALIDATION_ERROR', `Invalid boolean value for ${fieldName}: ${value}`)
}

function normalizeInteger(value: string | undefined, fieldName: string): number | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    // 整数字面量严格校验（与 CLI parseIntegerFlag 对齐）：拒绝 `2.5` 被 parseInt 静默截断为 2
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be a positive integer (got "${value}")`)
    }

    const parsed = Number.parseInt(trimmed, 10)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be a positive integer`)
    }

    return parsed
}

function normalizeNonNegativeInteger(value: string | undefined, fieldName: string): number | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    // 整数字面量严格校验（与 CLI parseIntegerFlag 对齐）：拒绝 `2.5` 被 parseInt 静默截断为 2
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be a non-negative integer (got "${value}")`)
    }

    const parsed = Number.parseInt(trimmed, 10)

    if (!Number.isInteger(parsed) || parsed < 0) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be a non-negative integer`)
    }

    return parsed
}

function normalizeList(value: string | undefined): string[] | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    const items = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)

    return items.length > 0 ? items : undefined
}

/**
 * 解析用户显式分组字符串：`name1:pkg1,pkg2;name2:pkg3`。
 * - `;` 分隔多个组
 * - `:` 分隔组名与包列表
 * - `,` 分隔组内包名
 *
 * 语义与 CLI 解析保持一致：
 * - 空 entry（尾随/连续分号）忽略
 * - 非空但缺冒号或组名/包列表为空 → 抛 CONFIG_VALIDATION_ERROR（fail-fast，避免静默退回自动分组）
 * - 原型链风险键名（__proto__ / constructor / prototype）忽略
 */
function normalizeUpgradeGroups(value: string | undefined): Record<string, string[]> | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    const result: Record<string, string[]> = {}
    for (const entry of value.split(';')) {
        if (!entry.trim()) {
            continue
        }
        const idx = entry.indexOf(':')
        if (idx <= 0) {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                `Invalid ${ENV_PREFIX}UPGRADE_GROUPS entry: "${entry}". Expected format: "name:pkg1,pkg2"`,
            )
        }
        const name = entry.slice(0, idx).trim()
        const pkgs = entry
            .slice(idx + 1)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        if (!isSafeUpgradeGroupName(name)) {
            continue
        }
        if (!name || pkgs.length === 0) {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                `Invalid ${ENV_PREFIX}UPGRADE_GROUPS entry: "${entry}". Expected format: "name:pkg1,pkg2"`,
            )
        }
        if (pkgs.length === 0) {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                `Invalid ${ENV_PREFIX}UPGRADE_GROUPS entry: "${entry}". Expected format: "name:pkg1,pkg2"`,
            )
        }
        result[name] = pkgs
    }

    return Object.keys(result).length > 0 ? result : undefined
}

/** 原型链风险键名过滤 */
function isSafeUpgradeGroupName(name: string): boolean {
    return name !== '__proto__' && name !== 'constructor' && name !== 'prototype'
}

function readRuntimeMode(value: string | undefined, fieldName: string): RuntimeMode | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    if (!isRuntimeMode(value)) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be one of: ${RUNTIME_MODES.join(', ')}`)
    }

    return value
}

function readSeverityThreshold(value: string | undefined, fieldName: string): SeverityThreshold | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    if (!isSeverityThreshold(value)) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be one of: ${SEVERITY_THRESHOLDS.join(', ')}`)
    }

    return value
}

function readAlertSource(value: string | undefined, fieldName: string): AlertSourceKind | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }

    if (!isAlertSource(value)) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be one of: ${ALERT_SOURCES.join(', ')}`)
    }

    return value
}

export function readEnvConfig(env: NodeJS.ProcessEnv = process.env): CliConfigOverrides {
    return {
        mode: readRuntimeMode(readEnv(env, 'MODE'), `${ENV_PREFIX}MODE`),
        severityThreshold: readSeverityThreshold(readEnv(env, 'SEVERITY_THRESHOLD'), `${ENV_PREFIX}SEVERITY_THRESHOLD`),
        repositories: normalizeList(readEnv(env, 'REPOSITORIES')),
        owner: normalizeList(readEnv(env, 'OWNER')),
        repoTopics: normalizeList(readEnv(env, 'REPO_TOPICS')),
        repoInclude: normalizeList(readEnv(env, 'REPO_INCLUDE')),
        repoExclude: normalizeList(readEnv(env, 'REPO_EXCLUDE')),
        repoTopicsExclude: normalizeList(readEnv(env, 'REPO_TOPICS_EXCLUDE')),
        dryRun: normalizeBoolean(readEnv(env, 'DRY_RUN'), `${ENV_PREFIX}DRY_RUN`),
        createPullRequest: normalizeBoolean(readEnv(env, 'CREATE_PR'), `${ENV_PREFIX}CREATE_PR`),
        commit: normalizeBoolean(readEnv(env, 'COMMIT'), `${ENV_PREFIX}COMMIT`),
        cleanupBranches: normalizeBoolean(readEnv(env, 'CLEANUP_BRANCHES'), `${ENV_PREFIX}CLEANUP_BRANCHES`),
        cleanupBranchesAuto: normalizeBoolean(readEnv(env, 'CLEANUP_BRANCHES_AUTO'), `${ENV_PREFIX}CLEANUP_BRANCHES_AUTO`),
        githubToken: readEnv(env, 'GITHUB_TOKEN')?.trim() || env.GITHUB_TOKEN?.trim() || undefined,
        alertsToken: readEnv(env, 'ALERTS_TOKEN')?.trim() || undefined,
        alertSource: readAlertSource(readEnv(env, 'ALERTS_SOURCE'), `${ENV_PREFIX}ALERTS_SOURCE`),
        codeScanningEnabled: normalizeBoolean(readEnv(env, 'CODE_SCANNING'), `${ENV_PREFIX}CODE_SCANNING`),
        maxAlertsPerRepository: normalizeInteger(readEnv(env, 'MAX_ALERTS_PER_REPOSITORY'), `${ENV_PREFIX}MAX_ALERTS_PER_REPOSITORY`),
        maxConcurrency: normalizeInteger(readEnv(env, 'MAX_CONCURRENCY'), `${ENV_PREFIX}MAX_CONCURRENCY`),
        maxRetries: normalizeNonNegativeInteger(readEnv(env, 'MAX_RETRIES'), `${ENV_PREFIX}MAX_RETRIES`),
        maxBackoffMs: normalizeInteger(readEnv(env, 'MAX_BACKOFF_MS'), `${ENV_PREFIX}MAX_BACKOFF_MS`),
        upgradeGroups: normalizeUpgradeGroups(readEnv(env, 'UPGRADE_GROUPS')),
        toolchainPnpmVersion: readEnv(env, 'TOOLCHAIN_PNPM_VERSION')?.trim() || undefined,
    }
}

function resolveDryRun(mode: RuntimeMode, cliOverrides: CliConfigOverrides, envConfig: CliConfigOverrides): boolean {
    if (cliOverrides.dryRun !== undefined) {
        return cliOverrides.dryRun
    }

    if (envConfig.dryRun !== undefined) {
        return envConfig.dryRun
    }

    return mode === 'report-only'
}

function resolveCreatePullRequest(mode: RuntimeMode, cliOverrides: CliConfigOverrides, envConfig: CliConfigOverrides): boolean {
    if (cliOverrides.createPullRequest !== undefined) {
        return cliOverrides.createPullRequest
    }

    if (envConfig.createPullRequest !== undefined) {
        return envConfig.createPullRequest
    }

    return mode === 'fix-and-pr'
}

function resolveCommit(cliOverrides: CliConfigOverrides, envConfig: CliConfigOverrides): boolean {
    if (cliOverrides.commit !== undefined) {
        return cliOverrides.commit
    }

    if (envConfig.commit !== undefined) {
        return envConfig.commit
    }

    return false
}

function resolveCleanupBranches(cliOverrides: CliConfigOverrides, envConfig: CliConfigOverrides): boolean {
    if (cliOverrides.cleanupBranches !== undefined) {
        return cliOverrides.cleanupBranches
    }

    if (envConfig.cleanupBranches !== undefined) {
        return envConfig.cleanupBranches
    }

    return false
}

function resolveCleanupBranchesAuto(cliOverrides: CliConfigOverrides, envConfig: CliConfigOverrides): boolean {
    if (cliOverrides.cleanupBranchesAuto !== undefined) {
        return cliOverrides.cleanupBranchesAuto
    }

    if (envConfig.cleanupBranchesAuto !== undefined) {
        return envConfig.cleanupBranchesAuto
    }

    return false
}

function validateRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
    const isAuditSource = config.alertSource === 'pnpm-audit'

    // pnpm-audit 模式不要求 GitHub token（本地回退的核心场景）
    if (!isAuditSource && !config.githubToken) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'Missing GitHub token. Provide GITHUB_TOKEN or DEPENDFIX_GITHUB_TOKEN.',
        )
    }

    // owner 发现需要 GitHub API，pnpm-audit 本地场景无法发现
    if (isAuditSource && config.owner && config.owner.length > 0) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            '--owner / DEPENDFIX_OWNER requires the github-dependabot alert source (owner discovery uses the GitHub API).',
        )
    }

    // cleanup-branches 模式不做 owner 发现（分支清理需明确目标仓库）
    if (config.mode === 'cleanup-branches' && config.owner && config.owner.length > 0) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            '--owner / DEPENDFIX_OWNER is not supported in cleanup-branches mode (branch cleanup requires explicit target repositories).',
        )
    }

    // cleanup-branches 模式串行执行（不走并发管线）；maxConcurrency>1 属无效配置，fail-fast
    if (config.mode === 'cleanup-branches' && config.maxConcurrency > 1) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'maxConcurrency > 1 is not supported in cleanup-branches mode (branch cleanup runs sequentially).',
        )
    }

    if (config.repositories.length === 0 && !(config.owner && config.owner.length > 0)) {
        if (isAuditSource) {
            // pnpm-audit 模式允许无 --repo：repository 由 app 层解析（git remote → local 兜底）
        } else {
            throw new AppError(
                'CONFIG_VALIDATION_ERROR',
                'Missing target repositories. Provide --repo, --repository, --repos-file, --owner or DEPENDFIX_REPOSITORIES / DEPENDFIX_OWNER.',
            )
        }
    }

    for (const repo of config.repositories) {
        if (!isValidRepoIdentifier(repo)) {
            throw new AppError('CONFIG_VALIDATION_ERROR', `Invalid repository identifier: "${repo}". Expected format: owner/repo`)
        }
    }

    // pnpm-audit 只扫当前目录一个 lockfile，无法对应多个仓库
    if (isAuditSource && config.repositories.length > 1) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'pnpm-audit alert source supports at most one repository (it scans the current workspace lockfile).',
        )
    }

    // Code Scanning 是 GitHub API 并行源，pnpm-audit 本地场景无法拉取
    if (isAuditSource && config.codeScanningEnabled) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'code-scanning requires the github-dependabot alert source (Code Scanning alerts are fetched from the GitHub API).',
        )
    }

    // PR 必须 GitHub，audit 数据无对应仓库
    if (isAuditSource && config.mode === 'fix-and-pr') {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'fix-and-pr mode requires the github-dependabot alert source. Use pnpm-audit with report-only/fix mode instead.',
        )
    }

    // 分支清理完全依赖 GitHub API，与 audit 数据源语义无关；
    // 不校验则无 remote 目录 + audit 模式会 exit 0 静默空跑（同构缺陷）
    if (isAuditSource && config.mode === 'cleanup-branches') {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'cleanup-branches mode requires the github-dependabot alert source (branch cleanup needs GitHub API).',
        )
    }

    if (config.mode === 'report-only' && config.createPullRequest) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'createPullRequest cannot be enabled when mode is report-only.')
    }

    if (config.dryRun && config.createPullRequest) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'createPullRequest cannot be enabled while dryRun is true.')
    }

    if (config.commit && config.mode !== 'fix') {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'commit is only supported in fix mode.')
    }

    if (config.commit && config.dryRun) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'commit cannot be enabled while dryRun is true.')
    }

    if (config.commit && config.createPullRequest) {
        throw new AppError('CONFIG_VALIDATION_ERROR', 'commit cannot be enabled together with createPullRequest. Use fix-and-pr mode instead.')
    }

    // 工具链 pnpm 版本格式校验（用户显式输入 fail-fast；格式非法拒绝，防命令注入）
    if (config.toolchainPnpmVersion !== undefined && !isValidPnpmVersion(config.toolchainPnpmVersion)) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `Invalid toolchainPnpmVersion: "${config.toolchainPnpmVersion}". Expected semver like 10.5.2 (optionally +sha512.<hash>).`,
        )
    }

    // 多仓库并发窗口：1-16；超过上限 fail-fast，避免无意打爆 GitHub API
    if (!isValidConcurrency(config.maxConcurrency)) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `maxConcurrency must be between 1 and 16 (got ${config.maxConcurrency}).`,
        )
    }

    // fix / fix-and-pr 共享单一 workDir（package.json + pnpm-lock.yaml + node_modules），
    // 并发写存在快照覆盖 / 互踩回滚 / install 竞争，仅 report-only 允许并发
    if (config.maxConcurrency > 1 && (config.mode === 'fix' || config.mode === 'fix-and-pr')) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'maxConcurrency > 1 is only supported in report-only mode (fix / fix-and-pr share a single workDir — parallel writes are unsafe).',
        )
    }

    // 限流重试次数：0-10；超过 10 次重试属异常配置
    if (!Number.isInteger(config.maxRetries) || config.maxRetries < 0 || config.maxRetries > 10) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `maxRetries must be between 0 and 10 (got ${config.maxRetries}).`,
        )
    }

    // 退避等待上限：100ms-120s；过低会频繁重试打爆 API，过高会长时间空转
    if (!Number.isInteger(config.maxBackoffMs) || config.maxBackoffMs < 100 || config.maxBackoffMs > 120_000) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            `maxBackoffMs must be between 100 and 120000 (got ${config.maxBackoffMs}).`,
        )
    }

    return config
}

export function resolveRuntimeConfig(options: ResolveRuntimeConfigOptions = {}): RuntimeConfig {
    const envConfig = readEnvConfig(options.env)
    const cliOverrides = options.cliOverrides ?? {}
    const mode = cliOverrides.mode ?? envConfig.mode ?? DEFAULT_RUNTIME_CONFIG.mode

    let repositories = resolveRepoList([
        ...(envConfig.repositories ?? []),
        ...(cliOverrides.repositories ?? []),
    ], cliOverrides.reposFilePath)

    // 自动推断：所有来源都未提供仓库时，从 git remote 提取
    if (repositories.length === 0) {
        const workDir = options.workDir ?? process.cwd()
        const inferred = inferRepoFromGitRemote(workDir)
        if (inferred) {
            repositories = [inferred]
        }
    }

    const config: RuntimeConfig = {
        mode,
        severityThreshold: cliOverrides.severityThreshold ?? envConfig.severityThreshold ?? DEFAULT_RUNTIME_CONFIG.severityThreshold,
        repositories,
        owner: cliOverrides.owner ?? envConfig.owner,
        repoTopics: cliOverrides.repoTopics ?? envConfig.repoTopics,
        repoInclude: cliOverrides.repoInclude ?? envConfig.repoInclude,
        repoExclude: cliOverrides.repoExclude ?? envConfig.repoExclude,
        repoTopicsExclude: cliOverrides.repoTopicsExclude ?? envConfig.repoTopicsExclude,
        dryRun: resolveDryRun(mode, cliOverrides, envConfig),
        createPullRequest: resolveCreatePullRequest(mode, cliOverrides, envConfig),
        commit: resolveCommit(cliOverrides, envConfig),
        cleanupBranches: resolveCleanupBranches(cliOverrides, envConfig),
        cleanupBranchesAuto: resolveCleanupBranchesAuto(cliOverrides, envConfig),
        githubToken: cliOverrides.githubToken ?? envConfig.githubToken ?? '',
        alertsToken: cliOverrides.alertsToken ?? envConfig.alertsToken,
        alertSource: cliOverrides.alertSource ?? envConfig.alertSource ?? DEFAULT_RUNTIME_CONFIG.alertSource,
        codeScanningEnabled: cliOverrides.codeScanningEnabled ?? envConfig.codeScanningEnabled ?? DEFAULT_RUNTIME_CONFIG.codeScanningEnabled,
        allowMajorUpgrade: cliOverrides.allowMajorUpgrade ?? DEFAULT_RUNTIME_CONFIG.allowMajorUpgrade,
        maxAlertsPerRepository: cliOverrides.maxAlertsPerRepository ?? envConfig.maxAlertsPerRepository ?? DEFAULT_RUNTIME_CONFIG.maxAlertsPerRepository,
        maxConcurrency: cliOverrides.maxConcurrency ?? envConfig.maxConcurrency ?? DEFAULT_RUNTIME_CONFIG.maxConcurrency,
        maxRetries: cliOverrides.maxRetries ?? envConfig.maxRetries ?? DEFAULT_RUNTIME_CONFIG.maxRetries,
        maxBackoffMs: cliOverrides.maxBackoffMs ?? envConfig.maxBackoffMs ?? DEFAULT_RUNTIME_CONFIG.maxBackoffMs,
        upgradeGroups: cliOverrides.upgradeGroups ?? envConfig.upgradeGroups,
        toolchainPnpmVersion: cliOverrides.toolchainPnpmVersion ?? envConfig.toolchainPnpmVersion,
    }

    return validateRuntimeConfig(config)
}

// ---------------------------------------------------------------------------
// Git remote inference
// ---------------------------------------------------------------------------

/** 匹配 GitHub remote URL 的正则（HTTPS / SSH / git@ 格式） */
const GITHUB_REMOTE_RE = /github\.com[/:]([^/]+)\/([^/\s.]+?)(?:\.git)?\s*$/i

/**
 * 从 git remote origin 推断 owner/repo。
 *
 * 支持格式：
 * - `https://github.com/owner/repo.git`
 * - `git@github.com:owner/repo.git`
 * - `ssh://git@github.com/owner/repo.git`
 *
 * @returns `owner/repo` 或 `null`（非 GitHub / 无 origin）
 */
export function inferRepoFromGitRemote(workDir: string): string | null {
    try {
        const url = execSync('git remote get-url origin', {
            cwd: workDir,
            encoding: 'utf-8',
            stdio: 'pipe',
        }).trim()

        const match = GITHUB_REMOTE_RE.exec(url)
        return match ? `${match[1]}/${match[2]}` : null
    } catch {
        return null
    }
}
