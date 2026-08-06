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
    type AlertSourceKind,
    resolveRuntimeConfig,
    RUNTIME_MODES,
    SEVERITY_THRESHOLDS,
    ALERT_SOURCES,
} from '../config'
import { queryRepoHistory } from '../report/archiver'
import { formatHistory } from '../report/history'

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
    owner: {
        type: 'string' as const,
        description: 'owner / org 自动发现（逗号分隔多个或多次传入），与 --repo 合并去重（显式优先）',
    },
    'repo-topics': {
        type: 'string' as const,
        description: '发现结果 topic 白名单（逗号分隔，AND 语义；仅影响 --owner 发现结果）',
    },
    'repo-include': {
        type: 'string' as const,
        description: '仓库白名单 glob（逗号分隔多个或多次传入，如 owner/*、owner/pkg-*；仅作用于发现结果）',
    },
    'repo-exclude': {
        type: 'string' as const,
        description: '仓库黑名单 glob（逗号分隔多个或多次传入；显式列表与发现结果均受约束，与 include 冲突时胜出）',
    },
    'repo-topics-exclude': {
        type: 'string' as const,
        description: '发现结果 topic 黑名单（逗号分隔，排除含任一指定 topic 的仓库）',
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
    'alerts-source': {
        type: 'string' as const,
        description: '告警数据源：github-dependabot（默认，GitHub Dependabot alerts API）或 pnpm-audit（本地无 token 回退，扫描当前工作区 lockfile；repository 优先 --repo → git remote → local 兜底）',
    },
    'code-scanning': {
        type: 'boolean' as const,
        description: '同时拉取 Code Scanning alerts（与 Dependabot 并行，默认关闭；需要 token 具备 security-events: read，GITHUB_TOKEN 默认具备）',
        negativeDescription: '不拉取 Code Scanning alerts（默认）',
    },
    'max-alerts-per-repository': {
        type: 'string' as const,
        description: '每个仓库最多处理的告警数',
        default: '20' as const,
    },
    'max-concurrency': {
        type: 'string' as const,
        description: '多仓库并发窗口（1-16，默认 1 保守串行；>1 可能触发 GitHub 限流）',
        default: '1' as const,
    },
    'max-retries': {
        type: 'string' as const,
        description: 'GitHub API 限流重试次数（0-10，默认 3；429/rate limit 指数退避重试）',
        default: '3' as const,
    },
    'max-backoff-ms': {
        type: 'string' as const,
        description: '限流退避单次等待上限毫秒（100-120000，默认 30000；Retry-After / reset / 指数退避均受此约束）',
        default: '30000' as const,
    },
    history: {
        type: 'string' as const,
        description: '查询仓库历史运行摘要（读 dependfix-reports/index.json，倒序时间；不执行扫描）',
    },
    'upgrade-groups': {
        type: 'string' as const,
        description: '用户显式分组（覆盖自动分组），格式 "name1:pkg1,pkg2;name2:pkg3"',
    },
    'toolchain-pnpm-version': {
        type: 'string' as const,
        description: 'lockfile 修复用的 pnpm 版本（工具链固定；缺省从 package.json packageManager 解析；PIN_TOOLCHAIN 策略用 corepack pnpm@<version> 执行）',
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

function isAlertSource(value: string): value is AlertSourceKind {
    return ALERT_SOURCES.includes(value as AlertSourceKind)
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

/**
 * 严格整数字面量解析（修复：拒绝 `2.5` 被 parseInt 静默截断为 2）。
 * 仅接受 `^\d+$`；范围语义由调用方在 expected 描述中声明（config 校验兜底）。
 */
function parseIntegerFlag(value: string, flagName: string, expected: string): number {
    const trimmed = value.trim()
    if (!/^\d+$/.test(trimmed)) {
        throw new AppError(
            'ARGUMENT_PARSE_ERROR',
            `Invalid ${flagName} value: "${value}". ${expected}`,
        )
    }
    return Number.parseInt(trimmed, 10)
}

/**
 * 归一化可重复 flag 值（citty/mri 对重复传入返回数组，单次传入返回字符串）：
 * 按逗号拆分 + 去空白 + 去空项。`--owner a,b --owner c` → ['a', 'b', 'c']。
 */
function normalizeFlagList(value: string | string[] | undefined): string[] {
    if (value === undefined) {
        return []
    }
    const parts = Array.isArray(value) ? value : [value]
    return parts
        .flatMap((v) => v.split(','))
        .map((s) => s.trim())
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

    // owner（自动发现；逗号分隔多个或多次传入）
    const ownerValue = normalizeFlagList(parsed.owner)
    if (ownerValue.length > 0) {
        overrides.owner = ownerValue
    }

    // repo-topics（发现结果 topic 白名单，AND 语义）
    const repoTopicsValue = normalizeFlagList(parsed['repo-topics'])
    if (repoTopicsValue.length > 0) {
        overrides.repoTopics = repoTopicsValue
    }

    // repo-include / repo-exclude / repo-topics-exclude（名单策略）
    const repoIncludeValue = normalizeFlagList(parsed['repo-include'])
    if (repoIncludeValue.length > 0) {
        overrides.repoInclude = repoIncludeValue
    }
    const repoExcludeValue = normalizeFlagList(parsed['repo-exclude'])
    if (repoExcludeValue.length > 0) {
        overrides.repoExclude = repoExcludeValue
    }
    const repoTopicsExcludeValue = normalizeFlagList(parsed['repo-topics-exclude'])
    if (repoTopicsExcludeValue.length > 0) {
        overrides.repoTopicsExclude = repoTopicsExcludeValue
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

    // alerts-source
    const alertsSource = parsed['alerts-source']
    if (alertsSource) {
        if (!isAlertSource(alertsSource)) {
            throw new AppError(
                'ARGUMENT_PARSE_ERROR',
                `Invalid --alerts-source value: "${alertsSource}". Expected one of: ${ALERT_SOURCES.join(', ')}.`,
            )
        }
        overrides.alertSource = alertsSource
    }

    // code-scanning (three-state: true / false / undefined)
    if (parsed['code-scanning'] !== undefined) {
        overrides.codeScanningEnabled = parsed['code-scanning']
    }

    // max-alerts-per-repository
    const maxAlerts = parsed['max-alerts-per-repository']
    if (maxAlerts) {
        overrides.maxAlertsPerRepository = parseIntegerFlag(maxAlerts, '--max-alerts-per-repository', 'Expected a positive integer.')
    }

    // max-concurrency（1-16，config 校验兜底）
    const maxConcurrency = parsed['max-concurrency']
    if (maxConcurrency) {
        overrides.maxConcurrency = parseIntegerFlag(maxConcurrency, '--max-concurrency', 'Expected an integer between 1 and 16.')
    }

    // max-retries（0-10，config 校验兜底）
    const maxRetries = parsed['max-retries']
    if (maxRetries) {
        overrides.maxRetries = parseIntegerFlag(maxRetries, '--max-retries', 'Expected an integer between 0 and 10.')
    }

    // max-backoff-ms（100-120000，config 校验兜底）
    const maxBackoffMs = parsed['max-backoff-ms']
    if (maxBackoffMs) {
        overrides.maxBackoffMs = parseIntegerFlag(maxBackoffMs, '--max-backoff-ms', 'Expected an integer between 100 and 120000.')
    }

    // history（独立查询命令，不进入运行配置）
    const history = parsed.history
    if (history) {
        overrides.history = history
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

    // toolchain-pnpm-version
    const toolchainPnpmVersion = parsed['toolchain-pnpm-version']
    if (toolchainPnpmVersion) {
        overrides.toolchainPnpmVersion = toolchainPnpmVersion
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

    // --history：独立查询命令（读归档索引，不执行扫描、不要求 token/仓库配置）
    if (invocation.configOverrides.history) {
        return runHistoryQuery(invocation.configOverrides.history)
    }

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

/**
 * 查询仓库历史运行摘要并打印（读 `./dependfix-reports/index.json`）。
 * 无历史 / 索引缺失不视为错误（exit 0），输出提示。
 */
function runHistoryQuery(repo: string): number {
    const entries = queryRepoHistory(repo)
    console.log(formatHistory(entries, repo))
    return 0
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
