# @dependfix/mcp

> dependfix 的 MCP Server 包。通过 [Model Context Protocol](https://modelcontextprotocol.io/) 将 dependfix 的扫描/修复能力暴露给 AI 编程助手（Claude、Copilot、Cursor 等）。

## 安装

```bash
pnpm add @dependfix/mcp
```

## Tool 清单

| Tool | 功能 | 输入 |
|:-----|:-----|:-----|
| `fetch_alerts` | 拉取指定仓库的 Dependabot 安全告警（只读） | `repo`, `severity?` |
| `get_last_report` | 读取最近一次 JSON 报告（只读） | — |
| `run_scan` | 对目标仓库执行 dependfix 扫描并修复 | `repo`, `mode?`, `severity?` |
| `fix_dependency` | 修复单个间接依赖（写入 pnpm overrides） | `workDir`, `packageName`, `targetVersion` |

## 配置

通过 MCP 配置文件添加（stdio 传输）：

```json
{
  "mcpServers": {
    "dependfix": {
      "command": "npx",
      "args": ["@dependfix/mcp"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

环境变量：

| 变量 | 说明 |
|:-----|:-----|
| `GITHUB_TOKEN` | GitHub 访问凭据（拉取告警 / 执行扫描必需） |
| `DEPENDFIX_MCP_REPORT_DIR` | JSON 报告输出目录（默认 `./dependfix-reports`） |

## 本地开发

```bash
pnpm --filter @dependfix/mcp build   # 构建 dist
pnpm --filter @dependfix/mcp test    # 一致性测试
node packages/mcp/dist/bin.mjs       # stdio 启动
```

## 设计

详见 [mcp-server.md](../../docs/design/governance/mcp-server.md)（Tool schema、与 CLI 的一致性、错误处理）。
