import { queryRepoHistory } from 'dependfix'
import { isValidRepoIdentifier } from '@dependfix/core'
import { toToolError } from './errors'

/** `history` 返回结构 */
export type HistoryResult =
    | {
        ok: true
        repo: string
        runs: Array<{
            runId: string
            startedAt: string
            durationMs: number
            repositories: string[]
            summary: Record<string, unknown>
            repoStats: Array<Record<string, unknown>>
        }>
    }
    | { ok: false, error: string }

/**
 * `history`：查询某仓库的历史运行摘要（倒序时间：最新在前）。
 * 复用 cli `queryRepoHistory`（读 dependfix-reports/index.json 聚合索引，
 * 与 `get_last_report` 的单文件语义不同）；报告目录可用 `DEPENDFIX_MCP_REPORT_DIR` 覆盖。
 */
export const getHistory = async (input: { repo: string }): Promise<HistoryResult> => {
    if (!isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    try {
        const reportDir = process.env.DEPENDFIX_MCP_REPORT_DIR ?? './dependfix-reports'
        const entries = queryRepoHistory(input.repo, reportDir)
        return {
            ok: true,
            repo: input.repo,
            runs: entries.map((e) => ({
                runId: e.runId,
                startedAt: e.startedAt,
                durationMs: e.durationMs,
                repositories: e.repositories,
                // 桥接：RunSummary/ArchiveRepoStats 无索引签名，显式转 unknown 再收窄
                summary: e.summary as unknown as Record<string, unknown>,
                repoStats: e.repoStats as unknown as Array<Record<string, unknown>>,
            })),
        }
    } catch (error) {
        return toToolError(error)
    }
}
