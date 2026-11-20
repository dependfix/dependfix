import { createGitHubClient, fetchCodeScanningAlerts, fetchDependabotAlerts, type FetchDependabotAlertsParams } from '@dependfix/engine'
import { fromPat } from '@dependfix/engine/auth'
import { filterAlerts, isValidRepoIdentifier, type SeverityThreshold } from '@dependfix/core'
import { platformErrorToTool, platformGet, resolveBackend, resolvePlatformRepo } from '../platform'
import { requireToken, toToolError } from './errors'

/** `fetch_alerts` 返回结构 */
export type FetchAlertsResult =
    | {
        ok: true
        count: number
        total?: number
        truncated?: boolean
        alerts: Array<{
            id: number | string
            severity: string
            packageName: string
            manifestPath: string
            recommendedVersion: string
            fixable: boolean
            htmlUrl: string
            summary: string
        }>
    }
    | { ok: false, error: string }

/**
 * `fetch_alerts`：拉取指定仓库的 Dependabot 安全告警（只读）。
 * 凭据从 GITHUB_TOKEN 环境变量读取（mcp-server.md §4.3）。
 */
export const fetchAlerts = async (input: { repo: string, severity: SeverityThreshold, code_scanning?: boolean }): Promise<FetchAlertsResult> => {
    if (resolveBackend() === 'remote') {
        return fetchAlertsRemote(input)
    }
    const token = requireToken()
    if (typeof token !== 'string') {
        return token
    }

    // repo 格式校验复用 core（与 CLI 同源，避免自研校验漂移）
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = input.repo.split('/')

    try {
        const client = createGitHubClient({ auth: fromPat(token) })
        const params: FetchDependabotAlertsParams = {
            owner,
            repo,
            state: 'open',
        }

        // Dependabot + 可选 Code Scanning 并行（复用 cli fetcher；与 CLI --code-scanning 同源）。
        // 注意：CS 拉取失败（权限/网络）会使整个 tool 失败——与 CLI 现状一致
        // （per-source 错误隔离为 backlog 登记项，暂缓），结果不静默丢弃。
        const codeScanningEnabled = input.code_scanning ?? false
        const [dependabotAlerts, codeScanningAlerts] = await Promise.all([
            fetchDependabotAlerts(client, params),
            codeScanningEnabled
                ? fetchCodeScanningAlerts(client, { owner, repo })
                : Promise.resolve([] as Awaited<ReturnType<typeof fetchDependabotAlerts>>),
        ])
        const alerts = [...dependabotAlerts, ...codeScanningAlerts]

        // 严重级别过滤复用 core 阈值语义（与 CLI 一致：high 保留 critical + high；
        // all 不过滤；Code Scanning 源 unknown 恒透传）。不使用相等匹配，避免 high 漏掉 critical。
        const { filtered } = filterAlerts(alerts, { severityThreshold: input.severity })

        return {
            ok: true,
            count: filtered.length,
            alerts: filtered.map((a) => ({
                id: a.id,
                severity: a.severity,
                packageName: a.packageName,
                manifestPath: a.manifestPath,
                recommendedVersion: a.recommendedVersion,
                fixable: a.fixable,
                htmlUrl: a.htmlUrl,
                summary: a.summary,
            })),
        }
    } catch (error) {
        return toToolError(error)
    }
}

interface PlatformAlert {
    id: string
    source: string
    severity: string
    packageName: string
    manifestPath: string | null
    recommendedVersion: string | null
    fixable: boolean
    htmlUrl: string | null
    summary: string | null
}

const SEVERITY_RANK: Record<string, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
    unknown: 0,
}

const fetchAllPlatformAlerts = async (repositoryId: string): Promise<{ items: PlatformAlert[], total: number, truncated: boolean }> => {
    const items: PlatformAlert[] = []
    let total = 0
    for (let page = 1; page <= 20; page += 1) {
        const response = await platformGet<{ items: PlatformAlert[], total: number }>('/api/v1/alerts', {
            repositoryId,
            page,
            pageSize: 500,
        })
        total = response.total
        items.push(...response.items)
        if (items.length >= response.total || response.items.length === 0) {
            break
        }
    }
    return { items, total, truncated: items.length < total }
}

const fetchAlertsRemote = async (input: { repo: string, severity: SeverityThreshold, code_scanning?: boolean }): Promise<FetchAlertsResult> => {
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = input.repo.split('/')
    try {
        const platformRepo = await resolvePlatformRepo(owner, repo)
        if (!platformRepo) {
            return { ok: false, error: `平台未纳管仓库 ${input.repo}（请先在平台添加仓库）` }
        }
        const { items: all, total, truncated } = await fetchAllPlatformAlerts(platformRepo.id)
        const sourceFilter = input.code_scanning ? ['dependabot', 'code-scanning'] : ['dependabot']
        const thresholdRank = input.severity === 'all' ? 0 : (SEVERITY_RANK[input.severity] ?? 3)
        const filtered = all
            .filter((alert) => sourceFilter.includes(alert.source))
            // 与 core filterAlerts 同源：静态分析源的 unknown 恒透传，不得静默丢弃
            .filter((alert) => {
                const keepUnknownStatic = alert.severity === 'unknown'
                    && (alert.source === 'code-scanning' || alert.source === 'code-quality')
                return keepUnknownStatic || (SEVERITY_RANK[alert.severity] ?? 0) >= thresholdRank
            })
        return {
            ok: true,
            count: filtered.length,
            total,
            truncated,
            alerts: filtered.map((alert) => ({
                id: alert.id,
                severity: alert.severity,
                packageName: alert.packageName,
                manifestPath: alert.manifestPath ?? '',
                recommendedVersion: alert.recommendedVersion ?? '',
                fixable: alert.fixable,
                htmlUrl: alert.htmlUrl ?? '',
                summary: alert.summary ?? '',
            })),
        }
    } catch (error) {
        return platformErrorToTool(error)
    }
}
