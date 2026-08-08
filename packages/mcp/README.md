# @dependfix/mcp

> dependfix 的 MCP Server 包。通过 [Model Context Protocol](https://modelcontextprotocol.io/) 将 dependfix 的扫描/修复能力暴露给 AI 编程助手（Claude、Copilot、Cursor 等）。

## 安装

```bash
pnpm add @dependfix/mcp
```

## Tool 清单

| Tool | 功能 | 输入 |
|:-----|:-----|:-----|
| `fetch_alerts` | 拉取指定仓库的 Dependabot 安全告警（可选并行 Code Scanning，只读） | `repo`, `severity?`, `code_scanning?` |
| `discover_repos` | 按 owner / org 自动发现仓库（只读） | `owner[]`, `topics?`, `include?`, `exclude?`, `probe_dependabot?` |
| `run_scan` | 对目标仓库执行 dependfix 扫描并修复 | `repo`, `mode?`, `severity?`, `code_scanning?`, `max_alerts?`, `max_concurrency?`, `dry_run?`, `allow_major_upgrade?`, `ai_enabled?`, `ai_provider?`, `ai_model?`, `ai_trigger?` |
| `fix_dependency` | 修复单个依赖或 lockfile（override / direct / lockfile） | `workDir`, `fix_type?`, `packageName?`, `targetVersion?` |
| `cleanup_branches` | 清理已合并/已关闭的 dependfix 分支（非交互） | `repo`, `dry_run?` |
| `history` | 查询指定仓库的历史运行摘要（只读） | `repo` |
| `get_last_report` | 读取最近一次 JSON 报告（只读） | — |

参数语义与 CLI 对齐（severity 为阈值语义：`high` 保留 critical + high；`dry_run` 缺省按 mode 推断；AI 参数仅透传开关与模型，apiKey 从环境变量读取）。

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
| `GITHUB_TOKEN` | GitHub 访问凭据（拉取告警 / 执行扫描 / 分支清理必需） |
| `DEPENDFIX_MCP_REPORT_DIR` | JSON 报告输出目录（默认 `./dependfix-reports`） |
| `DEPENDFIX_AI_API_KEY` | AI 研判 API Key（启用 `run_scan` 的 `ai_enabled` 时必需；仅经 env 读取，禁止经 tool 参数传入） |

## 安全边界

- 凭据仅从环境变量读取（`GITHUB_TOKEN` / `DEPENDFIX_AI_API_KEY`），tool 参数不透传敏感信息
- `cleanup_branches` 为纯 GitHub API 操作（列表/状态/删除远程分支），无需本地仓库；只删除 `dependfix/` 前缀且已合并/已关闭的分支，绝不触碰 open PR 分支
- `fix_dependency` 需要本地已 clone 仓库目录（`workDir`，操作 package.json / pnpm-workspace.yaml / pnpm-lock.yaml）

## 本地开发

```bash
pnpm --filter @dependfix/mcp build   # 构建 dist
pnpm --filter @dependfix/mcp test    # 一致性测试
node packages/mcp/dist/bin.mjs       # stdio 启动
```

## 设计

详见 [mcp-server.md](../../docs/design/governance/mcp-server.md)（Tool schema、与 CLI 的一致性、错误处理、能力差距与演进路线）。
