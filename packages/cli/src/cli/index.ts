import {
    defineCommand,
    parseArgs,
    type ArgsDef,
    type ParsedArgs,
} from 'citty'
import { AppError, compactRecord, isValidRepoIdentifier } from '@dependfix/core'
import { createApplicationSkeleton } from '../app'
import {
    type CliConfigOverrides,
    type RuntimeMode,
    type SeverityThreshold,
    resolveRuntimeConfig,
    RUNTIME_MODES,
    SEVERITY_THRESHOLDS,
} from '../config'

// ---------------------------------------------------------------------------
// Public interfaces (unchanged)
// ---------------------------------------------------------------------------

export interface CliInvocation {
    mode?: RuntimeMode
    configOverrides: CliConfigOverrides
    rawArgs: string[]
}

export interface CliRunResult {
    ok: true
    invocation: CliInvocation
    config: ReturnType<typeof resolveRuntimeConfig>
}

// ---------------------------------------------------------------------------
// Args definition for citty
// ---------------------------------------------------------------------------

const argsDef = {
    mode: {
        type: 'positional' as const,
        description: '运行模式：report-only, fix, fix-and-pr',
        required: false,
        default: 'report-only' as const,
    },
    repo: {
        type: 'string' as const,
        description: '目标仓库 (owner/repo)，逗号分隔多个',
        alias: ['r', 'repository', 'repositories'],
    },
    'repos-file': {
        type: 'string' as const,
        description: '从文件读取仓库列表（每行一个 owner/repo）',
    },
    'severity-threshold': {
        type: 'string' as const,
        description: '严重级别阈值：critical, high, medium, all',
        default: 'high' as const,
    },
    'dry-run': {
        type: 'boolean' as const,
        description: '试运行模式，不实际写入文件',
        negativeDescription: '关闭试运行模式',
    },
    'create-pr': {
        type: 'boolean' as const,
        description: '创建 Pull Request',
        negativeDescription: '不创建 Pull Request',
    },
    'github-token': {
        type: 'string' as const,
        description: 'GitHub Personal Access Token',
    },
    'max-alerts-per-repository': {
        type: 'string' as const,
        description: '每个仓库最多处理的告警数',
        default: '10' as const,
    },
    verbose: {
        type: 'boolean' as const,
        description: '输出详细日志',
    },
} satisfies ArgsDef

// ---------------------------------------------------------------------------
// Conversion helpers
// ---------------------------------------------------------------------------

function isRuntimeMode(value: string): value is RuntimeMode {
    return RUNTIME_MODES.includes(value as RuntimeMode)
}

function isSeverityThreshold(value: string): value is SeverityThreshold {
    return SEVERITY_THRESHOLDS.includes(value as SeverityThreshold)
}

function appendRepositories(target: string[], value: string): void {
    for (const repository of value.split(',')) {
        const trimmed = repository.trim()

        if (!trimmed) {
            continue
        }

        if (!isValidRepoIdentifier(trimmed)) {
            throw new AppError(
                'ARGUMENT_PARSE_ERROR',
                `Invalid repository identifier: "${trimmed}". Expected format: owner/repo`,
            )
        }

        target.push(trimmed)
    }
}

function parsedArgsToCliOverrides(parsed: ParsedArgs<typeof argsDef>): CliConfigOverrides {
    const overrides: CliConfigOverrides = {}

    // mode
    const rawMode = parsed.mode
    if (isRuntimeMode(rawMode)) {
        overrides.mode = rawMode
    }

    // repositories (from --repo / --repository)
    const repoValue = parsed.repo
    if (repoValue) {
        const repos: string[] = []
        appendRepositories(repos, repoValue)
        if (repos.length > 0) {
            overrides.repositories = repos
        }
    }

    // repos-file
    const reposFile = parsed['repos-file']
    if (reposFile) {
        overrides.reposFilePath = reposFile
    }

    // severity-threshold
    const severityThreshold = parsed['severity-threshold']
    if (isSeverityThreshold(severityThreshold)) {
        overrides.severityThreshold = severityThreshold
    }

    // dry-run (three-state: true / false / undefined)
    if (parsed['dry-run'] !== undefined) {
        overrides.dryRun = parsed['dry-run']
    }

    // create-pr (three-state: true / false / undefined)
    if (parsed['create-pr'] !== undefined) {
        overrides.createPullRequest = parsed['create-pr']
    }

    // github-token
    const githubToken = parsed['github-token']
    if (githubToken) {
        overrides.githubToken = githubToken
    }

    // max-alerts-per-repository
    const maxAlerts = parsed['max-alerts-per-repository']
    if (maxAlerts) {
        const num = Number.parseInt(maxAlerts, 10)
        if (Number.isNaN(num)) {
            throw new AppError(
                'ARGUMENT_PARSE_ERROR',
                `Invalid --max-alerts-per-repository value: "${maxAlerts}". Expected a positive integer.`,
            )
        }
        overrides.maxAlertsPerRepository = num
    }

    return overrides
}

// ---------------------------------------------------------------------------
// Public API (unchanged signatures)
// ---------------------------------------------------------------------------

export function parseCliArgs(rawArgs: string[]): CliInvocation {
    const parsed = parseArgs<typeof argsDef>(rawArgs, argsDef)
    const configOverrides = parsedArgsToCliOverrides(parsed)

    return {
        mode: configOverrides.mode,
        configOverrides,
        rawArgs: [...rawArgs],
    }
}

export function runCli(rawArgs: string[]): CliRunResult {
    const invocation = parseCliArgs(rawArgs)
    const config = resolveRuntimeConfig({
        env: process.env,
        cliOverrides: invocation.configOverrides,
    })
    const app = createApplicationSkeleton({ config })

    app.logger.info('Runtime configuration resolved', compactRecord({
        mode: config.mode,
        severityThreshold: config.severityThreshold,
        repositories: config.repositories,
        dryRun: config.dryRun,
        createPullRequest: config.createPullRequest,
        maxAlertsPerRepository: config.maxAlertsPerRepository,
        args: invocation.rawArgs.length > 0 ? invocation.rawArgs : undefined,
    }))

    return {
        ok: true,
        invocation,
        config,
    }
}

// ---------------------------------------------------------------------------
// citty command
// ---------------------------------------------------------------------------

export const dependfixCommand = defineCommand({
    meta: {
        name: 'dependfix',
        version: '0.1.0',
        description: '自动化处理 Dependabot / Code Scanning 安全告警的修复工具',
    },
    args: argsDef,
    run({ rawArgs }) {
        runCli(rawArgs)
    },
})
