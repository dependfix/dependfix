import { isValidRepoIdentifier } from '@dependfix/core'
import { getPlatformConfig, platformErrorToTool, platformGet, resolveBackend } from '../platform'

/** `get_run_logs` 返回结构 */
export type GetRunLogsResult =
    | { ok: true, source: 'platform', logs: unknown }
    | { ok: false, error: string }

/**
 * `get_run_logs`：读取平台侧单次运行日志（仅 remote 后端）。
 *
 * - grouped（默认）/ raw 两视图由平台返回，MCP 侧不做归一化（实现点在 shared/log-digest）
 * - local 后端没有平台日志数据源（RunResult 不含日志），返回明确提示而非空结果
 */
export const getRunLogs = async (input: {
    run_id: string
    view?: 'grouped' | 'raw'
    level?: string
    q?: string
    page?: number
    page_size?: number
    repo?: string
}): Promise<GetRunLogsResult> => {
    if (input.repo && !isValidRepoIdentifier(input.repo)) {
        return { ok: false, error: `repo 格式非法（预期 owner/repo，收到 ${input.repo}）` }
    }
    if (resolveBackend() !== 'remote') {
        return { ok: false, error: '本地后端没有平台日志数据源；请配置 DEPENDFIX_PLATFORM_URL / DEPENDFIX_PLATFORM_API_KEY 使用 remote 后端' }
    }
    try {
        getPlatformConfig()
        const logs = await platformGet(`/api/v1/runs/${encodeURIComponent(input.run_id)}/logs`, {
            view: input.view ?? 'grouped',
            level: input.level,
            q: input.q,
            page: input.page,
            pageSize: input.page_size,
        })
        return { ok: true, source: 'platform', logs }
    } catch (error) {
        return platformErrorToTool(error)
    }
}
