import {
    defineCommand,
    parseArgs,
    type ArgsDef,
    type ParsedArgs,
} from 'citty'
import { AppError, toAppError, isValidRepoIdentifier } from '@dependfix/core'
import { DependfixApp } from '../app'
import {
    type CliConfigOverrides,
    type RuntimeMode,
    type SeverityThreshold,
    resolveRuntimeConfig,
    RUNTIME_MODES,
    SEVERITY_THRESHOLDS,
} from '../config'

// ---------------------------------------------------------------------------
// Public interfaces
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
        description: '运行模式：report-only, fix, fix-and-pr, cleanup-branches',
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
    commit: {
        type: 'boolean' as const,
        description: '修复完成后在本地当前分支直接提交（不推送、不创建 PR）',
        negativeDescription: '不自动提交（默认）',
    },
    'cleanup-branches': {
        type: 'boolean' as const,
        description: '（fix-and-pr 模式）结束后列出已合并的 dependfix 分支到报告，不自动删除',
        negativeDescription: '不执行分支清理检查',
    },
    'cleanup-branches-auto': {
        type: 'boolean' as const,
        description: '（fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互，不删有 open PR 的分支）',
        negativeDescription: '不自动删除分支',
    },
    'github-token': {
        type: 'string' as const,
        description: 'GitHub Personal Access Token',
    },
    'alerts-token': {
        type: 'string' as const,
        description: 'Dependabot alerts 专用 token（可选，最小权限 PAT，仅 Dependabot alerts: read；缺省回退 --github-token。GITHUB_TOKEN 无法读取 Dependabot alerts）',
    },
    'max-alerts-per-repository': {
        type: 'string' as const,
        description: '每个仓库最多处理的告警数',
        default: '20' as const,
    },
    'upgrade-groups': {
        type: 'string' as const,
        description: '用户显式分组（覆盖自动分组），格式 "name1:pkg1,pkg2;name2:pkg3"',
    },
    commands: {
        type: 'string' as const,
        description: '自定义验证命令（逗号分隔），覆盖默认的 install/lint/build',
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

function parseCommandsFlag(value: string): string[] {
    return value
        .split(',')
        .map((cmd) => cmd.trim())
        .filter(Boolean)
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

    // commit (three-state: true / false / undefined)
    if (parsed.commit !== undefined) {
        overrides.commit = parsed.commit
    }

    // cleanup-branches (three-state: true / false / undefined)
    if (parsed['cleanup-branches'] !== undefined) {
        overrides.cleanupBranches = parsed['cleanup-branches']
    }

    // cleanup-branches-auto (three-state: true / false / undefined)
    if (parsed['cleanup-branches-auto'] !== undefined) {
        overrides.cleanupBranchesAuto = parsed['cleanup-branches-auto']
    }

    // github-token
    const githubToken = parsed['github-token']
    if (githubToken) {
        overrides.githubToken = githubToken
    }

    // alerts-token
    const alertsToken = parsed['alerts-token']
    if (alertsToken) {
        overrides.alertsToken = alertsToken
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

    // verbose (three-state: true / false / undefined)
    if (parsed.verbose !== undefined) {
        overrides.verbose = parsed.verbose
    }

    // commands
    const commandsValue = parsed.commands
    if (commandsValue) {
        overrides.commands = parseCommandsFlag(commandsValue)
    }

    // upgrade-groups
    const upgradeGroups = parsed['upgrade-groups']
    if (upgradeGroups) {
        overrides.upgradeGroups = parseUpgradeGroupsFlag(upgradeGroups)
    }

    return overrides
}

/**
 * 解析 `--upgrade-groups "name1:pkg1,pkg2;name2:pkg3"`。
 * 与 config 的 normalizeUpgradeGroups 保持一致（CLI 与 env 同格式）：
 * 空 entry 忽略；非空但缺冒号/组名或包列表为空 → 抛 ARGUMENT_PARSE_ERROR；
 * 原型链风险键名（__proto__ / constructor / prototype）忽略。
 */
function parseUpgradeGroupsFlag(value: string): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const entry of value.split(';')) {
        if (!entry.trim()) {
            continue
        }
        const idx = entry.indexOf(':')
        if (idx <= 0) {
            throw new AppError(
                'ARGUMENT_PARSE_ERROR',
                `Invalid --upgrade-groups entry: "${entry}". Expected format: "name:pkg1,pkg2"`,
            )
        }
        const name = entry.slice(0, idx).trim()
        const pkgs = entry
            .slice(idx + 1)
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        if (name === '__proto__' || name === 'constructor' || name === 'prototype') {
            continue
        }
        if (!name || pkgs.length === 0) {
            throw new AppError(
                'ARGUMENT_PARSE_ERROR',
                `Invalid --upgrade-groups entry: "${entry}". Expected format: "name:pkg1,pkg2"`,
            )
        }
        result[name] = pkgs
    }
    return result
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

    return {
        ok: true,
        invocation,
        config,
    }
}

// ---------------------------------------------------------------------------
// App execution
// ---------------------------------------------------------------------------

async function runApp(rawArgs: string[]): Promise<number> {
    const invocation = parseCliArgs(rawArgs)
    const config = resolveRuntimeConfig({
        env: process.env,
        cliOverrides: invocation.configOverrides,
    })

    const app = new DependfixApp({
        config,
        verbose: invocation.configOverrides.verbose,
        commands: invocation.configOverrides.commands,
    })

    const { exitCode } = await app.run()
    return exitCode
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
    async run({ rawArgs }) {
        let exitCode = 1
        try {
            exitCode = await runApp(rawArgs)
        } catch (error: unknown) {
            const appError = toAppError(error, 'CLI_EXECUTION_FAILED')
            console.error(`Error: ${appError.message}`)
            exitCode = 1
        }
        process.exitCode = exitCode
    },
})
