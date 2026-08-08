import { createGitHubClient, fetchDependabotAlerts, type FetchDependabotAlertsParams } from 'dependfix'

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
export const fetchAlerts = async (input: { repo: string, severity: string }): Promise<FetchAlertsResult> => {
    const token = process.env.GITHUB_TOKEN
    if (!token) {
        return {
            ok: false,
            error: 'GITHUB_TOKEN not set（请配置环境变量）',
        }
    }

    const parts = input.repo.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    const [owner, repo] = parts

    try {
        const client = createGitHubClient({ token })
        const params: FetchDependabotAlertsParams = {
            owner,
            repo,
            state: 'open',
        }
        const alerts = await fetchDependabotAlerts(client, params)

        const filtered = input.severity === 'all'
            ? alerts
            : alerts.filter((a) => a.severity === input.severity)

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
