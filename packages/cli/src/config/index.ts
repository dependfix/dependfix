import { execSync } from 'node:child_process'
import { AppError, isValidRepoIdentifier, type SeverityThreshold } from '@dependfix/core'
import { resolveRepoList } from '../github/repo-selector'

export const RUNTIME_MODES = ['report-only', 'fix', 'fix-and-pr', 'cleanup-branches'] as const
export const SEVERITY_THRESHOLDS = ['critical', 'high', 'medium', 'all'] as const

export type RuntimeMode = typeof RUNTIME_MODES[number]
export type { SeverityThreshold }

export interface RuntimeConfig {
    mode: RuntimeMode
    severityThreshold: SeverityThreshold
    repositories: string[]
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
     * Dependabot alerts 专用 token（可选）。
     * 提供时仅用于拉取 Dependabot alerts（GITHUB_TOKEN 无法读取该 API，
     * 建议使用最小权限 fine-grained PAT，仅 `Dependabot alerts: read`）；
     * 缺省时回退使用 githubToken（本地完整 PAT 场景）。
     * 背景详见 docs/plan/todo.md「已知缺口 G2」。
     */
    alertsToken?: string
    maxAlertsPerRepository: number
}

export interface CliConfigOverrides {
    mode?: RuntimeMode
    severityThreshold?: SeverityThreshold
    repositories?: string[]
    reposFilePath?: string
    dryRun?: boolean
    createPullRequest?: boolean
    /** 修复完成后是否在本地当前分支直接提交 */
    commit?: boolean
    /** fix-and-pr 模式下结束后是否列出已合并的 dependfix 分支到报告 */
    cleanupBranches?: boolean
    /** fix-and-pr 模式下结束后是否自动删除已合并/已关闭的 dependfix 分支（非交互） */
    cleanupBranchesAuto?: boolean
    githubToken?: string
    /** Dependabot alerts 专用 token（可选，最小权限；缺省回退 githubToken） */
    alertsToken?: string
    maxAlertsPerRepository?: number
    /** 是否输出详细日志 */
    verbose?: boolean
    /** 自定义验证命令（覆盖默认的 `pnpm install --frozen-lockfile` / `pnpm lint` / `pnpm build`） */
    commands?: string[]
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
    maxAlertsPerRepository: 20,
}

function isRuntimeMode(value: string): value is RuntimeMode {
    return RUNTIME_MODES.includes(value as RuntimeMode)
}

function isSeverityThreshold(value: string): value is SeverityThreshold {
    return SEVERITY_THRESHOLDS.includes(value as SeverityThreshold)
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

    const parsed = Number.parseInt(value, 10)

    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError('CONFIG_VALIDATION_ERROR', `${fieldName} must be a positive integer`)
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

export function readEnvConfig(env: NodeJS.ProcessEnv = process.env): CliConfigOverrides {
    return {
        mode: readRuntimeMode(env.AUTO_FIX_GITHUB_SECURITY_MODE, 'AUTO_FIX_GITHUB_SECURITY_MODE'),
        severityThreshold: readSeverityThreshold(env.AUTO_FIX_GITHUB_SECURITY_SEVERITY_THRESHOLD, 'AUTO_FIX_GITHUB_SECURITY_SEVERITY_THRESHOLD'),
        repositories: normalizeList(env.AUTO_FIX_GITHUB_SECURITY_REPOSITORIES),
        dryRun: normalizeBoolean(env.AUTO_FIX_GITHUB_SECURITY_DRY_RUN, 'AUTO_FIX_GITHUB_SECURITY_DRY_RUN'),
        createPullRequest: normalizeBoolean(env.AUTO_FIX_GITHUB_SECURITY_CREATE_PR, 'AUTO_FIX_GITHUB_SECURITY_CREATE_PR'),
        commit: normalizeBoolean(env.AUTO_FIX_GITHUB_SECURITY_COMMIT, 'AUTO_FIX_GITHUB_SECURITY_COMMIT'),
        cleanupBranches: normalizeBoolean(env.AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES, 'AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES'),
        cleanupBranchesAuto: normalizeBoolean(env.AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES_AUTO, 'AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES_AUTO'),
        githubToken: env.AUTO_FIX_GITHUB_SECURITY_GITHUB_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || undefined,
        alertsToken: env.AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN?.trim() || undefined,
        maxAlertsPerRepository: normalizeInteger(env.AUTO_FIX_GITHUB_SECURITY_MAX_ALERTS_PER_REPOSITORY, 'AUTO_FIX_GITHUB_SECURITY_MAX_ALERTS_PER_REPOSITORY'),
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
    if (!config.githubToken) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'Missing GitHub token. Provide GITHUB_TOKEN or AUTO_FIX_GITHUB_SECURITY_GITHUB_TOKEN.',
        )
    }

    if (config.repositories.length === 0) {
        throw new AppError(
            'CONFIG_VALIDATION_ERROR',
            'Missing target repositories. Provide --repo, --repository, --repos-file or AUTO_FIX_GITHUB_SECURITY_REPOSITORIES.',
        )
    }

    for (const repo of config.repositories) {
        if (!isValidRepoIdentifier(repo)) {
            throw new AppError('CONFIG_VALIDATION_ERROR', `Invalid repository identifier: "${repo}". Expected format: owner/repo`)
        }
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
        dryRun: resolveDryRun(mode, cliOverrides, envConfig),
        createPullRequest: resolveCreatePullRequest(mode, cliOverrides, envConfig),
        commit: resolveCommit(cliOverrides, envConfig),
        cleanupBranches: resolveCleanupBranches(cliOverrides, envConfig),
        cleanupBranchesAuto: resolveCleanupBranchesAuto(cliOverrides, envConfig),
        githubToken: cliOverrides.githubToken ?? envConfig.githubToken ?? '',
        alertsToken: cliOverrides.alertsToken ?? envConfig.alertsToken,
        maxAlertsPerRepository: cliOverrides.maxAlertsPerRepository ?? envConfig.maxAlertsPerRepository ?? DEFAULT_RUNTIME_CONFIG.maxAlertsPerRepository,
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
