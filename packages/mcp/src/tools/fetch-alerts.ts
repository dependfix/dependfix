import { createGitHubClient, fetchCodeScanningAlerts, fetchDependabotAlerts, type FetchDependabotAlertsParams } from 'dependfix'
import { filterAlerts, isValidRepoIdentifier, type SeverityThreshold } from '@dependfix/core'

/** `fetch_alerts` 返回结构 */
export type FetchAlertsResult =
    | {
        ok: true
        count: number
        alerts: Array<{
            id: number
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
    const token = process.env.GITHUB_TOKEN
    if (!token) {
        return {
            ok: false,
            error: 'GITHUB_TOKEN not set（请配置环境变量）',
        }
    }

    // repo 格式校验复用 core（与 CLI 同源，避免自研校验漂移）
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = input.repo.split('/')

    try {
        const client = createGitHubClient({ token })
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
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        }
    }
}
