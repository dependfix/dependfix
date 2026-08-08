import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { toToolError } from './errors'

/** `get_last_report` 返回结构 */
export type GetLastReportResult =
    | { ok: true, file: string, report: unknown }
    | { ok: false, error: string }

/**
 * `get_last_report`：读取最近一次 JSON 报告（只读）。
 * 报告目录默认为 `./dependfix-reports`（可用 `DEPENDFIX_MCP_REPORT_DIR` 覆盖）。
 */
export const getLastReport = async (): Promise<GetLastReportResult> => {
    const reportDir = process.env.DEPENDFIX_MCP_REPORT_DIR ?? './dependfix-reports'
    try {
        const files = readdirSync(reportDir)
            .filter((f) => f.endsWith('.json'))
            .sort()
        if (files.length === 0) {
            return { ok: false, error: `未找到报告（目录 ${reportDir} 为空）` }
        }
        const latest = files[files.length - 1]
        const content = readFileSync(join(reportDir, latest), 'utf-8')
        return {
            ok: true,
            file: latest,
            report: JSON.parse(content),
        }
    } catch (error) {
        return toToolError(error)
    }
}
