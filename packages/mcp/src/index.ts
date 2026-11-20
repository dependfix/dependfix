import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { fetchAlertsSchema, getLastReportSchema, runScanSchema, fixDependencySchema, discoverReposSchema, cleanupBranchesSchema, historySchema, pnpmAuditSchema, getRunLogsSchema } from './tools/schemas'
import { fetchAlerts } from './tools/fetch-alerts'
import { getLastReport } from './tools/get-last-report'
import { runScan } from './tools/run-scan'
import { fixDependency } from './tools/fix-dependency'
import { discoverRepos } from './tools/discover-repos'
import { cleanupBranches } from './tools/cleanup-branches'
import { getHistory } from './tools/history'
import { pnpmAudit } from './tools/pnpm-audit.tool'
import { getRunLogs } from './tools/get-run-logs'
import { resolveBackend } from './platform'

/**
 * dependfix MCP Server：向 AI 助手暴露 9 个 tool。
 * - fetch_alerts（只读）：拉取 Dependabot / Code Scanning 告警
 * - get_last_report（只读）：读取最近 JSON 报告
 * - run_scan（写入）：执行扫描/修复（默认 report-only；支持 AI 研判透传）
 * - fix_dependency（写入）：修复单个依赖（override / direct / lockfile）
 * - discover_repos（只读）：按 owner / org 自动发现仓库
 * - cleanup_branches（写入）：清理已合并/已关闭的 dependfix 分支（非交互）
 * - history（只读）：查询仓库历史运行摘要
 * - pnpm_audit（只读）：本地 pnpm audit 回退数据源
 * - get_run_logs（只读，remote）：读取平台侧单次运行日志
 * 凭据从 GITHUB_TOKEN 环境变量读取（mcp-server.md §4.3）；remote 后端另读平台 URL / key。
 */
export const createMcpServer = (): McpServer => {
    const remote = resolveBackend() === 'remote'
    const tag = remote ? ' [remote]' : ''
    const discoverDescription = remote
        ? `按平台已纳管仓库列表（remote 降级：忽略 topics / include / exclude / probe_dependabot，仅保留 max_repos）${tag}`
        : '按 owner / org 自动发现仓库（支持 topics / include / exclude 名单策略，只读）'
    const server = new McpServer({
        name: 'dependfix',
        version: '0.1.0',
    })

    server.registerTool(
        'fetch_alerts',
        {
            description: `拉取指定仓库的 Dependabot 安全告警（可选并行 Code Scanning，只读）${tag}`,
            inputSchema: fetchAlertsSchema,
        },
        async (input) => {
            const result = await fetchAlerts(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'get_last_report',
        {
            description: `读取最近一次 dependfix JSON 报告（只读）${tag}`,
            inputSchema: getLastReportSchema,
        },
        async () => {
            const result = await getLastReport()
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'run_scan',
        {
            description: '对目标仓库执行 dependfix 扫描并修复（默认 report-only；支持 code-scanning / AI 研判等参数）',
            inputSchema: runScanSchema,
        },
        async (input) => {
            const result = await runScan(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'fix_dependency',
        {
            description: '修复单个依赖或 lockfile（override / direct / lockfile；需要本地已 clone 仓库目录）',
            inputSchema: fixDependencySchema,
        },
        async (input) => {
            const result = await fixDependency(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'discover_repos',
        {
            description: discoverDescription,
            inputSchema: discoverReposSchema,
        },
        async (input) => {
            const result = await discoverRepos(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'cleanup_branches',
        {
            description: '清理已合并/已关闭的 dependfix 分支（非交互；只删 dependfix/ 前缀且 merged/closed，绝不触碰 open PR 分支）',
            inputSchema: cleanupBranchesSchema,
        },
        async (input) => {
            const result = await cleanupBranches(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'history',
        {
            description: `查询指定仓库的历史运行摘要（倒序时间，只读）${tag}`,
            inputSchema: historySchema,
        },
        async (input) => {
            const result = await getHistory(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'get_run_logs',
        {
            description: `读取平台侧单次运行日志（grouped 聚合 / raw 原始；仅 remote 后端）${tag}`,
            inputSchema: getRunLogsSchema,
        },
        async (input) => {
            const result = await getRunLogs(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    server.registerTool(
        'pnpm_audit',
        {
            description: '本地 pnpm audit 回退数据源（复用 GITHUB_TOKEN 检查；audit 失败硬返回错误）',
            inputSchema: pnpmAuditSchema,
        },
        async (input) => {
            const result = await pnpmAudit(input)
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            }
        },
    )

    return server
}

/** 连接 stdio 传输（bin 入口调用） */
export const connectStdio = async (): Promise<void> => {
    const server = createMcpServer()
    const transport = new StdioServerTransport()
    await server.connect(transport)
}
