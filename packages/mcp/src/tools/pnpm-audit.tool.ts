import { fetchPnpmAuditAlerts, type FetchPnpmAuditAlertsParams } from '@dependfix/engine'
import { requireToken, toToolError } from './errors'

/**
 * `pnpm_audit` 返回结构
 *
 * 复用 `fetchAlerts` 的子集结构（id / severity / packageName / manifestPath /
 * recommendedVersion / fixable / htmlUrl / summary），让客户端能以一致形式
 * 消费 Dependabot / Code Scanning / pnpm-audit 三源告警。
 */
export type PnpmAuditResult =
    | {
        ok: true
        /** pnpm-audit 归一化后的告警数 */
        count: number
        /** 工作目录（与 input.workDir 一致；方便客户端无需记录入参） */
        workDir: string
        /** 注入的仓库标识（owner/repo 或 local 兜底） */
        repository: string
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
 * `pnpm_audit`：本地 pnpm audit 回退数据源（无 GitHub token 或 403 场景）。
 *
 * 设计意图（详见 docs/design/pnpm-audit-fallback.md）：
 * - 显式 `--alerts-source pnpm-audit` 触发（CLI）或显式调用 `pnpm_audit` tool（MCP）触发
 * - 复用 `fetchPnpmAuditAlerts` 解析 + 归一化逻辑（与 CLI 同源）
 * - audit 自身失败（无 lockfile / pnpm 不可用 / JSON 解析失败）→ 硬失败，绝不静默空跑
 *
 * 凭据：pnpm-audit 不需要 GitHub token（本地命令）；但保留 `requireToken()`
 * 调用与其它 tool 一致（保持 pattern 统一，未来如需 pnpm registry token 可扩展）。
 *
 * @param input.workDir 本地仓库工作目录（包含 pnpm-lock.yaml）
 * @param input.repository 仓库标识（owner/repo 或 local 兜底；与 CLI --repo 同源语义）
 */
export const pnpmAudit = async (input: FetchPnpmAuditAlertsParams): Promise<PnpmAuditResult> => {
    const token = requireToken()
    if (typeof token !== 'string') {
        return token
    }

    try {
        const normalizedAlerts = await fetchPnpmAuditAlerts(input)
        return {
            ok: true,
            count: normalizedAlerts.length,
            workDir: input.workDir,
            repository: input.repository,
            alerts: normalizedAlerts.map((a) => ({
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
