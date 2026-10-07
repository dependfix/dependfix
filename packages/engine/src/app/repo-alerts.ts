import type { Octokit } from '@octokit/rest'
import { toErrorMessage, type AlertsDisabledRecord, type FixError, type Logger, type NormalizedSecurityAlert } from '@dependfix/core'
import { fetchPnpmAuditAlerts } from '../alerts'
import type { RuntimeConfig } from '../config'
import { fromPat } from '../auth'
import {
    createGitHubClient,
    fetchCodeQualityFindings,
    fetchCodeScanningAlerts,
    fetchDependabotAlerts,
} from '../github'
import {
    alertSourceLabel,
    alertsDisabledHint,
    alertsFetchTokenHint,
    isAlertsDisabledError,
} from './token-hints'

/** fetchRepoAlerts 所需的最小上下文切片（AppContext 满足此结构）。 */
export interface FetchAlertsDeps {
    config: RuntimeConfig
    workDir: string
    logger: Logger
    allErrors: FixError[]
    /** alerts 功能未启用记录（方案 A：未启用 ≠ 失败，不计入 allErrors） */
    alertsDisabled: AlertsDisabledRecord[]
}

/**
 * 告警数据源统一入口：
 * - `github-dependabot`：Octokit 拉取 Dependabot alerts（alertsToken 优先）；
 *   `codeScanningEnabled` 时**并行**拉取 Code Scanning alerts（互不覆盖、互不回退）；
 *   `codeQualityEnabled` 时**并行**拉取 Code Quality findings（与 Code Scanning 同源独立开启）。
 *   三个 GitHub 源完全独立（可单独开启任意组合）。
 * - `pnpm-audit`：本地 `pnpm audit --json` 回退（无 token；repository 已由 resolveAlertRepositories 解析）
 *
 * per-source 错误隔离：并行源任一失败 → 记录该源 FETCH_FAILED 错误
 * （退出码保持非 0）并保留成功源数据继续处理；**无任何成功源且存在失败源**才抛错
 * （调用方 catch 记录仓库失败，保持 hint 语义）。未启用源（ALERTS_DISABLED）既不计成功
 * 也不计失败，但若其余源全部失败则判定仓库失败（避免以 0 告警冒充扫描成功）。
 */
export async function fetchRepoAlerts(deps: FetchAlertsDeps, repo: string): Promise<NormalizedSecurityAlert[]> {
    const { config, workDir } = deps
    if (config.alertSource === 'pnpm-audit') {
        return fetchPnpmAuditAlerts({ workDir, repository: repo })
    }
    const alertsClient = createAlertsClientFromConfig(config)
    const [owner, name] = repo.split('/')

    const [dependabotResult, codeScanningResult, codeQualityResult] = await Promise.allSettled([
        fetchDependabotAlerts(alertsClient, { owner, repo: name }),
        config.codeScanningEnabled
            ? fetchCodeScanningAlerts(alertsClient, { owner, repo: name })
            : Promise.resolve([] as NormalizedSecurityAlert[]),
        config.codeQualityEnabled
            ? fetchCodeQualityFindings(alertsClient, { owner, repo: name })
            : Promise.resolve([] as NormalizedSecurityAlert[]),
    ])

    const alerts: NormalizedSecurityAlert[] = []
    const failedSources: string[] = []
    let successfulSources = 0

    if (dependabotResult.status === 'fulfilled') {
        alerts.push(...dependabotResult.value)
        successfulSources++
    } else if (!recordAlertSourceError(deps, repo, 'dependabot', dependabotResult.reason)) {
        // 未启用（ALERTS_DISABLED）不算失败源；真实失败才推入
        failedSources.push('dependabot')
    }

    if (config.codeScanningEnabled) {
        if (codeScanningResult.status === 'fulfilled') {
            alerts.push(...codeScanningResult.value)
            successfulSources++
            deps.logger.info(`Fetched ${codeScanningResult.value.length} code scanning alerts for ${repo}`)
        } else if (!recordAlertSourceError(deps, repo, 'code-scanning', codeScanningResult.reason)) {
            failedSources.push('code-scanning')
        }
    }

    if (config.codeQualityEnabled) {
        if (codeQualityResult.status === 'fulfilled') {
            alerts.push(...codeQualityResult.value)
            successfulSources++
            deps.logger.info(`Fetched ${codeQualityResult.value.length} code quality findings for ${repo}`)
        } else if (!recordAlertSourceError(deps, repo, 'code-quality', codeQualityResult.reason)) {
            failedSources.push('code-quality')
        }
    }

    // 无任何成功源且存在失败源 → 抛第一个失败（调用方 catch 保持仓库失败语义 + token hint）。
    // 未启用源不计失败，但若其余启用源全失败，仓库仍应按失败处理（避免以 0 告警冒充扫描成功）。
    if (failedSources.length > 0 && successfulSources === 0) {
        let firstReason: unknown
        if (dependabotResult.status === 'rejected') {
            firstReason = dependabotResult.reason
        } else if (codeScanningResult.status === 'rejected') {
            firstReason = codeScanningResult.reason
        } else if (codeQualityResult.status === 'rejected') {
            firstReason = codeQualityResult.reason
        } else {
            firstReason = new Error(`failed to fetch alerts for ${repo}`)
        }
        throw firstReason
    }

    return alerts
}

/**
 * 拉取 Dependabot alerts 使用的 client（双 token 设计）：
 * 优先使用 `alertsToken`（最小权限：仅 Dependabot alerts: read），
 * 缺省回退主 token（本地完整 PAT 场景）。
 * 背景详见 docs/plan/todo.md「已知缺口 G2」。
 */
function createAlertsClientFromConfig(config: RuntimeConfig): Octokit {
    return createGitHubClient({
        auth: fromPat(config.alertsToken || config.githubToken, {
            // 429 / rate limit 指数退避重试（0 可关闭；退避上限可配）
            retry: {
                maxRetries: config.maxRetries,
                maxBackoffMs: config.maxBackoffMs,
            },
        }),
    })
}

/**
 * 该仓库是否已记录「带 `source` 的 `FETCH_FAILED`」（per-source 信号）。
 *
 * 供仓库级 catch 去重：全部启用源失败时 `fetchRepoAlerts` 已逐源记录错误，
 * 再追加无 `source` 的仓库级同类信号会造成重复（日志汇总还会把它归入 unknown 分组）。
 */
export function hasSourceScopedFetchFailure(errors: readonly FixError[], repo: string): boolean {
    return errors.some(
        (error) => error.repository === repo
            && error.stage === 'fetch'
            && error.category === 'FETCH_FAILED'
            && Boolean(error.source),
    )
}

/**
 * 记录单个告警源的拉取结果（不中断另一源的处理）。
 *
 * 方案 A：`ALERTS_DISABLED`（alerts 功能未启用）≠ 获取失败——
 * 不计入 `allErrors` / 不触发 exitCode 非 0，改记 `alertsDisabled` + 准确日志文案。
 *
 * @returns `true` = 未启用（预期状态，不算失败源）；`false` = 真实失败
 */
function recordAlertSourceError(deps: FetchAlertsDeps, repo: string, source: string, error: unknown): boolean {
    // 未启用 ≠ 失败：独立记录，不入 allErrors（方案 A）；提示文案按告警源给出对应开启路径
    if (isAlertsDisabledError(error)) {
        const message = toErrorMessage(error)
        const hint = alertsDisabledHint(source)
        deps.logger.warn(`${alertSourceLabel(source)} disabled for ${repo}: ${message} — ${hint}`)
        deps.alertsDisabled.push({ repository: repo, source, message })
        return true
    }

    const message = toErrorMessage(error)
    const hint = alertsFetchTokenHint(error)
    deps.logger.error(`Failed to fetch ${source} alerts for ${repo}: ${message}${hint ? ` — ${hint}` : ''}`)
    deps.allErrors.push({
        repository: repo,
        stage: 'fetch',
        category: 'FETCH_FAILED',
        source,
        message: hint ? `${message}（${hint}）` : message,
    })
    return false
}

/**
 * 获取仓库的默认分支。
 * pnpm-audit 模式 client 为 null → 返回 ''（报告显示 local）。
 * 失败时返回 `'unknown'`（不阻塞主流程）。
 */
export async function fetchDefaultBranch(client: Octokit | null, owner: string, repo: string): Promise<string> {
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

/** 告警截断提示（report/fix 共用；code-scanning 开启时附加排序说明）。 */
export function truncatedWarning(config: RuntimeConfig, truncatedCount: number): string {
    const base = `[alerts] ${truncatedCount} alert(s) truncated (max ${config.maxAlertsPerRepository} per repository) — consider --max-alerts-per-repository`
    return config.codeScanningEnabled
        ? `${base}; code-scanning alerts rank after fixable dependabot alerts`
        : base
}
