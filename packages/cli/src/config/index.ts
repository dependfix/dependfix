import { AppError, isValidRepoIdentifier, type SeverityThreshold } from '@dependfix/core'
import { resolveRepoList } from '../github/repo-selector'

export const RUNTIME_MODES = ['report-only', 'fix', 'fix-and-pr'] as const
export const SEVERITY_THRESHOLDS = ['critical', 'high', 'medium', 'all'] as const

export type RuntimeMode = typeof RUNTIME_MODES[number]
export type { SeverityThreshold }

export interface RuntimeConfig {
    mode: RuntimeMode
    severityThreshold: SeverityThreshold
    repositories: string[]
    dryRun: boolean
    createPullRequest: boolean
    githubToken: string
    maxAlertsPerRepository: number
}

export interface ConfigLayerDescriptor {
    module: 'config'
    supportedModes: RuntimeMode[]
    envVarPrefix: 'AUTO_FIX_GITHUB_SECURITY'
    config: RuntimeConfig
}

export interface CliConfigOverrides {
    mode?: RuntimeMode
    severityThreshold?: SeverityThreshold
    repositories?: string[]
    reposFilePath?: string
    dryRun?: boolean
    createPullRequest?: boolean
    githubToken?: string
    maxAlertsPerRepository?: number
}

export interface ResolveRuntimeConfigOptions {
    env?: NodeJS.ProcessEnv
    cliOverrides?: CliConfigOverrides
}

export const DEFAULT_RUNTIME_CONFIG: Omit<RuntimeConfig, 'githubToken' | 'repositories' | 'dryRun' | 'createPullRequest'> = {
    mode: 'report-only',
    severityThreshold: 'high',
    maxAlertsPerRepository: 10,
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
        githubToken: env.AUTO_FIX_GITHUB_SECURITY_GITHUB_TOKEN?.trim() || env.GITHUB_TOKEN?.trim() || undefined,
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

    return config
}

export function resolveRuntimeConfig(options: ResolveRuntimeConfigOptions = {}): RuntimeConfig {
    const envConfig = readEnvConfig(options.env)
    const cliOverrides = options.cliOverrides ?? {}
    const mode = cliOverrides.mode ?? envConfig.mode ?? DEFAULT_RUNTIME_CONFIG.mode

    const config: RuntimeConfig = {
        mode,
        severityThreshold: cliOverrides.severityThreshold ?? envConfig.severityThreshold ?? DEFAULT_RUNTIME_CONFIG.severityThreshold,
        repositories: resolveRepoList([
            ...(envConfig.repositories ?? []),
            ...(cliOverrides.repositories ?? []),
        ], cliOverrides.reposFilePath),
        dryRun: resolveDryRun(mode, cliOverrides, envConfig),
        createPullRequest: resolveCreatePullRequest(mode, cliOverrides, envConfig),
        githubToken: cliOverrides.githubToken ?? envConfig.githubToken ?? '',
        maxAlertsPerRepository: cliOverrides.maxAlertsPerRepository ?? envConfig.maxAlertsPerRepository ?? DEFAULT_RUNTIME_CONFIG.maxAlertsPerRepository,
    }

    return validateRuntimeConfig(config)
}

export function createConfigLayerDescriptor(config: RuntimeConfig = resolveRuntimeConfig()): ConfigLayerDescriptor {
    return {
        module: 'config',
        supportedModes: [...RUNTIME_MODES],
        envVarPrefix: 'AUTO_FIX_GITHUB_SECURITY',
        config,
    }
}
