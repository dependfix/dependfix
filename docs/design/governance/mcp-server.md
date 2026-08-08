# MCP Server 设计（`@dependfix/mcp`）

> 通过 [Model Context Protocol](https://modelcontextprotocol.io/) 将 dependfix 的能力暴露给 AI 编程助手（Claude、Copilot、Cursor 等），实现 CLI + Skills 自动化闭环。

---

## 1. 定位

`@dependfix/mcp` 是一个 MCP Server，运行后向 AI 助手注册 4 个 tool。AI 助手可通过工具调用直接拉取告警、执行修复、获取报告，无需用户手动输入 CLI 命令。

```
用户："检查这个仓库的安全告警"
  → AI Agent 调用 mcp_dependfix_fetch_alerts
    → 返回标准化告警列表
  → AI Agent 调用 mcp_dependfix_scan
    → 执行修复流程
  → AI Agent 返回结构化的修复摘要
```

---

## 2. Tool 清单

| Tool | 功能 | 输入 Schema | 输出 |
|:-----|:-----|:-----|:-----|
| `fetch_alerts` | 拉取 Dependabot 告警 | `repo: string`, `severity?: string` | `NormalizedSecurityAlert[]` |
| `fix_dependency` | 修复单个依赖 | `workDir: string`, `packageName: string`, `targetVersion: string` | `DependencyFixResult` |
| `run_scan` | 执行完整扫描修复 | `repo: string`, `mode?: 'report-only' \| 'fix' \| 'fix-and-pr'`, `severity?: string` | `RunResult` |
| `get_last_report` | 读取最近一次 JSON 报告 | — | `RunResult \| null` |

---

## 3. 架构

```
┌─────────────────────────────────────┐
│  AI 助手 (Claude / Copilot / Cursor) │
└──────────────┬──────────────────────┘
               │ JSON-RPC (stdio)
┌──────────────▼──────────────────────┐
│  @dependfix/mcp                     │
│  ├── server.ts    # MCP Server 启动 │
│  ├── tools/       # 4 个 tool 实现  │
│  └── transport.ts # stdio 传输层    │
└──────────────┬──────────────────────┘
               │ 直接调用（无网络）
┌──────────────▼──────────────────────┐
│  @dependfix/core  # 告警模型/过滤/报告 │
│  dependfix/cli    # 编排/app 逻辑   │
└─────────────────────────────────────┘
```

### 3.1 与 CLI 的关系

```
packages/cli（dependfix）
  → runCli() / DependfixApp
  → 解析 CLI args → resolveRuntimeConfig → run()

packages/mcp（@dependfix/mcp）
  → 直接调用 DependfixApp（程序化接口）
  → tool handler 构造 RuntimeConfig → new DependfixApp({ config }).run()
```

MCP Server 不依赖 CLI args 解析，直接走程序化 API。这要求 `DependfixApp` 的接口已经足够干净（T505 解耦后满足）。

### 3.2 依赖

| 依赖 | 版本 | 用途 |
|:-----|:-----|:-----|
| `@modelcontextprotocol/sdk` | `^1.x` | MCP Server 框架 |
| `@dependfix/core` | `workspace:*` | 告警模型与报告 |
| `dependfix` | `workspace:*` | CLI 编排逻辑 |

---

## 4. Tool 实现要点

### 4.1 `fetch_alerts`

```typescript
{
  name: 'fetch_alerts',
  description: '拉取指定仓库的 Dependabot 安全告警',
  inputSchema: {
    repo: { type: 'string', description: 'owner/repo' },
    severity: { type: 'string', enum: ['critical','high','medium','all'] },
  },
}
```

### 4.2 `run_scan`

```typescript
{
  name: 'run_scan',
  description: '对目标仓库执行 dependfix 扫描并修复',
  inputSchema: {
    repo: { type: 'string', description: 'owner/repo' },
    mode: { type: 'string', enum: ['report-only', 'fix', 'fix-and-pr'], default: 'report-only' },
    severity: { type: 'string', default: 'high' },
  },
}
```

> 注意：`fix` / `fix-and-pr` 模式会修改文件或创建 PR，应以 `report-only` 为默认。
> `fix` 类模式依赖进程 cwd 为目标仓库 clone 目录（fix_dependency 同理需本地 workDir）。

### 4.3 认证

MCP Server 本身不管理凭据。`GITHUB_TOKEN` 和 `AI_API_KEY` 从环境变量读取：

```
mcpServer.connect(transport)
  → tool handler 读取 process.env.GITHUB_TOKEN
  → 传入 DependfixApp 的 RuntimeConfig
```

### 4.4 错误处理

| 场景 | 行为 |
|:-----|:-----|
| Token 缺失 | 返回 `{ ok: false, error: "GITHUB_TOKEN not set" }` |
| API 限流 | 返回限流信息，建议稍后重试 |
| 仓库无权访问 | 返回 403 错误详情 |

---

## 5. 集成方式

用户通过 AI 助手的 MCP 配置文件添加：

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

---

## 6. 与 Skills 的关系

MCP 提供底层 tool 能力，Skills 提供高层编排：

```
MCP Tool: fetch_alerts, run_scan, fix_dependency
     ↑
Skill: dependfix-remediator
     ↑
Agent: 用户对话 → Skill 编排 → MCP 执行 → 报告
```

产品 skill `dependfix-remediator`（规划见 [backlog.md §M5.5](../../plan/backlog.md#m55-skill-编排cli-先行)）以 **CLI 为先行执行后端**（M5.5 T506/T507），MCP 为增强后端：配置了 MCP 的环境走 tool 调用（T605 验证一致性、T706 发布），未配置的环境回退 CLI 命令。

---

## 7. 里程碑

| 阶段 | 内容 |
|:-----|:-----|
| **M6 T605** | MCP Server（`@dependfix/mcp`）：骨架 + `fetch_alerts` / `get_last_report` 只读 tool + `run_scan` / `fix_dependency` 写入 tool + CLI 一致性断言（2026-08-07 规划：原 T605/T606 合并，见 [todo.md §M6 规划决策](../../plan/todo.md#m6-最小平台-mvp)） |
| **M7 T706** | MCP Server 发布 npm + 集成到 `dependfix-remediator` skill 双后端 |
