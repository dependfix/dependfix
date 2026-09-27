import { execSync } from 'node:child_process'
import { AppError, type SeverityThreshold, type AlertSourceKind } from '@dependfix/core'
import { parseOverrideProtectEntries } from '../github/repo-policy'
import { resolveRepoList } from '../github/repo-selector'
import { validateRuntimeConfig } from './validation'

export const RUNTIME_MODES = ['report-only', 'fix', 'fix-and-pr', 'cleanup-branches'] as const
export const SEVERITY_THRESHOLDS = ['critical', 'high', 'medium', 'all'] as const
export const ALERT_SOURCES: readonly AlertSourceKind[] = ['github-dependabot', 'pnpm-audit']

/**
 * GitHub App 认证配置（M30.4 / C74）。
 * 通过 GitHub App installation token 认证时使用，用于生成真实 bot 身份的 commit author。
 * 仅在 fix / fix-and-pr 模式下创建 commit 时生效；PAT 路径保持不变（M18.0 兼容性）。
 */
export interface GitHubAppConfig {
    /** GitHub App ID */
    appId: string
    /** PEM 格式私钥 */
    privateKey: string
    /** Installation ID */
    installationId: string
    /** Bot 用户名（用于 commit author 动态生成；缺省 fallback `dependfix[bot]`） */
    botLogin?: string
}

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
    /**
     * overrides 保护名单（`--override-protect` / `DEPENDFIX_OVERRIDE_PROTECT`）：
     * 仓库 glob（`owner/*` / `owner/pkg-*`；全局兜底需写两段通配，因单星号不跨斜杠）→ 不得自动写入 override 的包名列表。
     * 命中时跳过该包的 override 写入并记 `OVERRIDE_PROTECTED` 审计（防历史上被人工移除的破坏性 override 复发）。
     */
    overrideProtect?: Record<string, string[]>
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
     * GitHub App 认证配置（用于 commit author 真实 bot 身份）。
     * 仅 fix-and-pr / fix 模式下创建 commit 时使用；PAT 路径保持不变（M18.0 兼容性）。
     */
    githubApp?: GitHubAppConfig
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
     * 是否同时拉取 Code Quality findings（与 Dependabot 并行源；可与 codeScanningEnabled 同开）。
     * 默认关闭（opt-in，向后兼容）；开启后 GitHub 源下 Dependabot + Code Quality
     * 并行拉取、互不覆盖。Code Quality findings 不可自动修复（首版统一 C 类），
     * 仅做最小报告接入（不实现 CodeQL 完整语义解析）。
     * 需要 token 具备 fine-grained `Code quality: read`（classic PAT 需 `repo`/`public_repo`）。
     */
    codeQualityEnabled: boolean
    /**
     * 跨线告警（推荐版本跨大版本）显式授权自动升级（`--allow-major-upgrade`）。
     *
     * 仅 CLI 参数入口，**刻意不提供 env 通道**（action 结构性禁用：
     * action.yml 未暴露 input 且无 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` 可绕过）。
     *
     * 开启后仅对「根 package.json 直接依赖（workspace 成员独占声明维持人工）
     * + lockfile 单版本」的跨线告警自动升级，升级后复核脆弱实例消除、
     * 强制完整验证（install + lint + build + test），失败自动回滚；
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
    /**
     * 发现规模上限（`--max-repos` / `DEPENDFIX_MAX_REPOS`）：最多保留的仓库数。
     * 默认 100；设为 0 或负数表示不限制。大 org 场景下防止一次性全量发现。
     */
    maxRepos: number
    /**
     * AI 研判配置（`--ai` 系列参数 / `DEPENDFIX_AI_*` env）。
     * 默认关闭（opt-in）；开启后依赖升级验证失败或 major 升级时触发
     * breaking change 研判（触发范围由 `trigger` 控制）。
     * `apiKey` 为凭据：仅运行时持有，**不进入 RunReportConfig 序列化**。
     */
    ai?: AiOptions
}

/**
 * AI 研判触发范围。
 * - `failure`：仅升级验证失败时触发
 * - `major`：仅 major 升级时触发
 * - `both`（默认）：验证失败 或 major 升级均触发
 */
export type AiTriggerKind = 'failure' | 'major' | 'both'

export interface AiOptions {
    /** AI 研判总开关（默认 false，opt-in；dry-run 下不触发） */
    enabled: boolean
    /** 提供商：openai-compatible（默认，DeepSeek 等指定 baseUrl）/ anthropic */
    provider: 'openai-compatible' | 'anthropic'
    /** 模型名（默认 `deepseek-v4-flash`，2026-08-07 决策，models.dev 确认） */
    model: string
    /**
     * OpenAI 兼容端点基地址。
     * 默认 `https://api.deepseek.com`（与默认模型 deepseek-v4-flash 配套；
     * DeepSeek 官方 OpenAI 兼容端点，models.dev 确认）。
     * 使用 OpenAI 官方模型时显式指定 `--ai-base-url https://api.openai.com/v1`
     * 并配合对应 --ai-model。
     */
    baseUrl: string
    /**
     * Anthropic 兼容端点（仅 provider=anthropic 生效；
     * 默认 `https://api.anthropic.com/v1/messages`；自托管/网关可显式指定）。
     */
    apiUrl?: string
    /** AI API Key（凭据：仅运行时，不进报告/日志） */
    apiKey?: string
    /** 触发范围（默认 both） */
    trigger: AiTriggerKind
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
    /** overrides 保护名单（仓库 glob → 包名列表；命中则跳过 override 写入） */
    overrideProtect?: Record<string, string[]>
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
    /** 是否同时拉取 Code Quality findings（默认 false） */
    codeQualityEnabled?: boolean
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
    /**
     * 发现规模上限（`--max-repos` / `DEPENDFIX_MAX_REPOS`）：最多保留的仓库数。
     * 默认 100；设为 0 或负数表示不限制。大 org 场景下防止一次性全量发现。
     */
    maxRepos?: number
    /** AI 研判总开关（`--ai`） */
    aiEnabled?: boolean
    /** AI 提供商（`--ai-provider`：openai-compatible / anthropic） */
    aiProvider?: 'openai-compatible' | 'anthropic'
    /** AI 模型（`--ai-model`，默认 deepseek-v4-flash） */
    aiModel?: string
    /** AI 端点（`--ai-base-url`，OpenAI 兼容） */
    aiBaseUrl?: string
    /** AI Anthropic 兼容端点（`--ai-api-url`，仅 provider=anthropic 生效） */
    aiApiUrl?: string
    /** AI API Key（`--ai-api-key`；优先 DEPENDFIX_AI_API_KEY env） */
    aiApiKey?: string
    /** AI 触发范围（`--ai-trigger`：failure / major / both） */
    aiTrigger?: AiTriggerKind
    /** 是否输出详细日志 */
    verbose?: boolean
    /** 自定义验证命令（覆盖默认的 `pnpm install --frozen-lockfile` / `pnpm lint` / `pnpm build` / `pnpm test`） */
    commands?: string[]
    /**
     * 历史查询（仅 CLI `--history`）：读取归档索引列出仓库历史运行摘要，
     * 不进入运行配置（resolveRuntimeConfig 不消费），由 CLI 层直接处理。
     */
    history?: string
    /**
     * GitHub App 认证配置（用于 commit author 真实 bot 身份）。
     * 仅 fix / fix-and-pr 模式下创建 commit 时使用；PAT 路径保持不变。
     */
    githubApp?: GitHubAppConfig
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
    codeQualityEnabled: false,
    allowMajorUpgrade: false,
    maxAlertsPerRepository: 20,
    maxConcurrency: 1,
    maxRetries: 3,
    maxBackoffMs: 30_000,
    maxRepos: 100,
    ai: {
        enabled: false,
        provider: 'openai-compatible',
        model: 'deepseek-v4-flash',
        baseUrl: 'https://api.deepseek.com',
        trigger: 'both',
    },
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

/**
 * 解析 `DEPENDFIX_OVERRIDE_PROTECT`：`repo-glob:pkg1,pkg2;repo-glob2:pkg3`。
 *
 * 语法与 `normalizeUpgradeGroups` 一致（`;` 分隔条目 / `:` 分隔仓库 glob 与包列表 / `,` 分隔包名）；
 * 解析逻辑复用 `parseOverrideProtectEntries`（与 CLI 同源），非法条目 fail-fast。
 */
function normalizeOverrideProtect(value: string | undefined): Record<string, string[]> | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }
    const parsed = parseOverrideProtectEntries(
        value,
        (message) => new AppError('CONFIG_VALIDATION_ERROR', message),
        `${ENV_PREFIX}OVERRIDE_PROTECT`,
    )
    return Object.keys(parsed).length > 0 ? parsed : undefined
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
        overrideProtect: normalizeOverrideProtect(readEnv(env, 'OVERRIDE_PROTECT')),
        dryRun: normalizeBoolean(readEnv(env, 'DRY_RUN'), `${ENV_PREFIX}DRY_RUN`),
        createPullRequest: normalizeBoolean(readEnv(env, 'CREATE_PR'), `${ENV_PREFIX}CREATE_PR`),
        commit: normalizeBoolean(readEnv(env, 'COMMIT'), `${ENV_PREFIX}COMMIT`),
        cleanupBranches: normalizeBoolean(readEnv(env, 'CLEANUP_BRANCHES'), `${ENV_PREFIX}CLEANUP_BRANCHES`),
        cleanupBranchesAuto: normalizeBoolean(readEnv(env, 'CLEANUP_BRANCHES_AUTO'), `${ENV_PREFIX}CLEANUP_BRANCHES_AUTO`),
        githubToken: readEnv(env, 'GITHUB_TOKEN')?.trim() || env.GITHUB_TOKEN?.trim() || undefined,
        alertsToken: readEnv(env, 'ALERTS_TOKEN')?.trim() || undefined,
        alertSource: readAlertSource(readEnv(env, 'ALERTS_SOURCE'), `${ENV_PREFIX}ALERTS_SOURCE`),
        codeScanningEnabled: normalizeBoolean(readEnv(env, 'CODE_SCANNING'), `${ENV_PREFIX}CODE_SCANNING`),
        codeQualityEnabled: normalizeBoolean(readEnv(env, 'CODE_QUALITY'), `${ENV_PREFIX}CODE_QUALITY`),
        maxAlertsPerRepository: normalizeInteger(readEnv(env, 'MAX_ALERTS_PER_REPOSITORY'), `${ENV_PREFIX}MAX_ALERTS_PER_REPOSITORY`),
        maxConcurrency: normalizeInteger(readEnv(env, 'MAX_CONCURRENCY'), `${ENV_PREFIX}MAX_CONCURRENCY`),
        maxRetries: normalizeNonNegativeInteger(readEnv(env, 'MAX_RETRIES'), `${ENV_PREFIX}MAX_RETRIES`),
        maxBackoffMs: normalizeInteger(readEnv(env, 'MAX_BACKOFF_MS'), `${ENV_PREFIX}MAX_BACKOFF_MS`),
        maxRepos: normalizeNonNegativeInteger(readEnv(env, 'MAX_REPOS'), `${ENV_PREFIX}MAX_REPOS`),
        upgradeGroups: normalizeUpgradeGroups(readEnv(env, 'UPGRADE_GROUPS')),
        toolchainPnpmVersion: readEnv(env, 'TOOLCHAIN_PNPM_VERSION')?.trim() || undefined,
        aiEnabled: normalizeBoolean(readEnv(env, 'AI'), `${ENV_PREFIX}AI`),
        aiProvider: readAiProvider(readEnv(env, 'AI_PROVIDER'), `${ENV_PREFIX}AI_PROVIDER`),
        aiModel: readEnv(env, 'AI_MODEL')?.trim() || undefined,
        aiBaseUrl: readEnv(env, 'AI_BASE_URL')?.trim() || undefined,
        aiApiUrl: readEnv(env, 'AI_API_URL')?.trim() || undefined,
        aiApiKey: readEnv(env, 'AI_API_KEY')?.trim() || undefined,
        aiTrigger: readAiTrigger(readEnv(env, 'AI_TRIGGER'), `${ENV_PREFIX}AI_TRIGGER`),
        githubApp: readGitHubAppConfig(readEnv(env, 'GITHUB_APP_CONFIG')),
    }
}

function readAiProvider(value: string | undefined, name: string): 'openai-compatible' | 'anthropic' | undefined {
    if (value === undefined) {
        return undefined
    }
    const normalized = value.trim().toLowerCase()
    if (normalized === 'openai-compatible' || normalized === 'anthropic') {
        return normalized
    }
    throw new AppError('CONFIG_PARSE_ERROR', `Invalid ${name} value: "${value}". Expected "openai-compatible" or "anthropic".`)
}

function readAiTrigger(value: string | undefined, name: string): AiTriggerKind | undefined {
    if (value === undefined) {
        return undefined
    }
    const normalized = value.trim().toLowerCase()
    if (normalized === 'failure' || normalized === 'major' || normalized === 'both') {
        return normalized
    }
    throw new AppError('CONFIG_PARSE_ERROR', `Invalid ${name} value: "${value}". Expected "failure", "major" or "both".`)
}

interface ParsedGitHubAppConfig {
    appId?: unknown
    privateKey?: unknown
    installationId?: unknown
    botLogin?: unknown
}

function readGitHubAppConfig(value: string | undefined): GitHubAppConfig | undefined {
    if (value === undefined || value.trim() === '') {
        return undefined
    }
    try {
        const parsed = JSON.parse(value.trim()) as ParsedGitHubAppConfig
        if (!parsed.appId || !parsed.privateKey || !parsed.installationId) {
            throw new Error('Missing required fields: appId, privateKey, installationId')
        }
        return {
            appId: String(parsed.appId),
            privateKey: String(parsed.privateKey),
            installationId: String(parsed.installationId),
            botLogin: parsed.botLogin ? String(parsed.botLogin) : undefined,
        }
    } catch {
        throw new AppError('CONFIG_PARSE_ERROR', 'Invalid GITHUB_APP_CONFIG: expected JSON with appId, privateKey, installationId, optional botLogin')
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
        codeQualityEnabled: cliOverrides.codeQualityEnabled ?? envConfig.codeQualityEnabled ?? DEFAULT_RUNTIME_CONFIG.codeQualityEnabled,
        allowMajorUpgrade: cliOverrides.allowMajorUpgrade ?? DEFAULT_RUNTIME_CONFIG.allowMajorUpgrade,
        maxAlertsPerRepository: cliOverrides.maxAlertsPerRepository ?? envConfig.maxAlertsPerRepository ?? DEFAULT_RUNTIME_CONFIG.maxAlertsPerRepository,
        maxConcurrency: cliOverrides.maxConcurrency ?? envConfig.maxConcurrency ?? DEFAULT_RUNTIME_CONFIG.maxConcurrency,
        maxRetries: cliOverrides.maxRetries ?? envConfig.maxRetries ?? DEFAULT_RUNTIME_CONFIG.maxRetries,
        maxBackoffMs: cliOverrides.maxBackoffMs ?? envConfig.maxBackoffMs ?? DEFAULT_RUNTIME_CONFIG.maxBackoffMs,
        maxRepos: cliOverrides.maxRepos ?? envConfig.maxRepos ?? DEFAULT_RUNTIME_CONFIG.maxRepos,
        upgradeGroups: cliOverrides.upgradeGroups ?? envConfig.upgradeGroups,
        overrideProtect: cliOverrides.overrideProtect ?? envConfig.overrideProtect,
        toolchainPnpmVersion: cliOverrides.toolchainPnpmVersion ?? envConfig.toolchainPnpmVersion,
        ai: resolveAiOptions(cliOverrides, envConfig),
        githubApp: cliOverrides.githubApp ?? envConfig.githubApp,
    }

    return validateRuntimeConfig(config)
}

function resolveAiOptions(cliOverrides: CliConfigOverrides, envConfig: CliConfigOverrides): AiOptions {
    const defaults = DEFAULT_RUNTIME_CONFIG.ai!
    return {
        enabled: cliOverrides.aiEnabled ?? envConfig.aiEnabled ?? defaults.enabled,
        provider: cliOverrides.aiProvider ?? envConfig.aiProvider ?? defaults.provider,
        model: cliOverrides.aiModel ?? envConfig.aiModel ?? defaults.model,
        baseUrl: cliOverrides.aiBaseUrl ?? envConfig.aiBaseUrl ?? defaults.baseUrl,
        apiUrl: cliOverrides.aiApiUrl ?? envConfig.aiApiUrl ?? defaults.apiUrl,
        apiKey: cliOverrides.aiApiKey ?? envConfig.aiApiKey ?? defaults.apiKey,
        trigger: cliOverrides.aiTrigger ?? envConfig.aiTrigger ?? defaults.trigger,
    }
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
