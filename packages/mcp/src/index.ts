import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { fetchAlertsSchema, getLastReportSchema, runScanSchema, fixDependencySchema } from './tools/schemas'
import { fetchAlerts } from './tools/fetch-alerts'
import { getLastReport } from './tools/get-last-report'
import { runScan } from './tools/run-scan'
import { fixDependency } from './tools/fix-dependency'

/**
 * dependfix MCP Server：向 AI 助手暴露 4 个 tool。
 * - fetch_alerts（只读）：拉取 Dependabot 告警
 * - get_last_report（只读）：读取最近 JSON 报告
 * - run_scan（写入）：执行扫描/修复（默认 report-only）
 * - fix_dependency（写入）：修复单个间接依赖（需本地仓库目录）
 * 凭据从 GITHUB_TOKEN 环境变量读取（mcp-server.md §4.3）。
 */
export const createMcpServer = (): McpServer => {
    const server = new McpServer({
        name: 'dependfix',
        version: '0.1.0',
    })

    server.registerTool(
        'fetch_alerts',
        {
            description: '拉取指定仓库的 Dependabot 安全告警（只读）',
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
            description: '读取最近一次 dependfix JSON 报告（只读）',
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
            description: '对目标仓库执行 dependfix 扫描并修复（默认 report-only，不修改文件）',
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
            description: '修复单个间接依赖（写入 pnpm overrides；需要本地已 clone 仓库目录）',
            inputSchema: fixDependencySchema,
        },
        async (input) => {
            const result = await fixDependency(input)
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
