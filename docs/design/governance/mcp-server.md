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
| **M6 T605** | MCP Server（`@dependfix/mcp`）：骨架 + `fetch_alerts` / `get_last_report` 只读 tool + `run_scan` / `fix_dependency` 写入 tool + CLI 一致性断言（2026-08-07 规划：原 T605/T606 合并，见 [todo-archive.md §M6 规划决策](../../plan/todo-archive.md#m6-最小平台-mvp已归档)） |
| **M7 T706** | MCP Server 发布 npm + 集成到 `dependfix-remediator` skill 双后端 |

---

## 8. 能力差距与演进路线

> 2026-08-09 评估登记（backlog [C31/C32/C33](../../plan/backlog.md)）。评估基准：core/cli/mcp 复用率分析 + mcp 4 tool 与 cli 能力面对比（cli 40+ 参数 / 4 模式 vs mcp 4 tool，能力覆盖率约 25-30%）。

### 8.1 复用原则（评估结论）

- **core → cli 深度复用**（cli 41 个文件 import core，公共 API 面含 core 全量 re-export）
- **mcp → cli 核心逻辑复用充分**（DependfixApp / fetcher / override 修复器直连），但存在重复实现缺口
- **已收口（2026-08-09，4fc22fb5）**：fetch_alerts severity 过滤改 `filterAlerts`（阈值语义，修复 high 漏报 critical）、repo 校验改 `isValidRepoIdentifier`（fetch_alerts + run_scan 两处）
- **刻意不复用**：`get_last_report` 保持自研（cli 无等价公共 API，`--history` 读 index.json 聚合、语义不同；为复用而扩公共 API 面违反"保持 API 面"原则）

### 8.2 P1 — 低成本高收益（已交付 2026-08-09）

| 项 | 内容 | 复用路径 |
|:---|:-----|:---------|
| run_scan 参数化 | `code_scanning` / `max_alerts` / `max_concurrency` / `dry_run` / `allow_major_upgrade` 可调 | 映射 `RuntimeConfig` 已有字段，无新导出 |
| fetch_alerts 双源 | `code_scanning: true` 时与 Dependabot 并行拉取（复用 `filterAlerts` 的 CS unknown 透传语义） | 补 cli 导出 `fetchCodeScanningAlerts`（github/index.ts） |
| fix_dependency 多修复类型 | `fix_type: override \| direct \| lockfile` | `overrideTransitiveDependency` / `upgradeDependency` / `repairLockfile`（均已导出） |

### 8.3 P2 — 新增能力面（已交付 2026-08-09）

| 项 | 内容 | 复用路径 | 备注 |
|:---|:-----|:---------|:-----|
| `discover_repos` | org 发现 + 名单策略（topics / include / exclude / probe_dependabot） | `discoverRepositories`（已导出） | 覆盖 `--owner` / `--repos-file` 场景 |
| `cleanup_branches` | 列出并删除已合并/已关闭的 dependfix 分支（`dry_run` 仅列清单） | `listDependfixBranches` / `getBranchPrStatus` / `deleteRemoteBranch`（已导出） | **不走 DependfixApp cleanup-branches mode**：`runBranchCleanupForRepo` 含交互确认（非 TTY 默认拒绝），MCP stdio 下不可用；按 `autoCleanupMergedBranches` 语义自编排（只删 `dependfix/` 前缀 + merged/closed，绝不触碰 open PR 分支） |
| run_scan AI 透传 | `ai_enabled` / `ai_provider` / `ai_model` / `ai_trigger` | `RuntimeConfig.ai`（`DEPENDFIX_AI_API_KEY` env） | **安全约束：apiKey 只走 env，禁止进 tool 参数**（防客户端日志泄露）。后续登记：`ai_api_url`（anthropic 兼容端点）透传评估中 |
| `history` | 查询某仓库历史运行摘要（倒序） | `queryRepoHistory`（补 cli 导出） | 与 get_last_report 语义不同（聚合 index.json vs 单文件） |

> 后续登记（审计 suggest，非阻塞）：`ai_api_url` 透传（provider=anthropic 时兼容端点不可注入）；cleanup_branches 状态批量查询 `Promise.all` 全并发，仓库分支量大时可加并发上限（对齐 probeConcurrency 风格）。

### 8.4 P3 — 远期目标（登记不实施）

- pnpm-audit 本地扫描 tool（需 workDir 语义，等本地场景真实需求）
- 统一错误包装 helper（token 检查 + try/catch → ok:false 模板代码收口）
- 返回结构对齐完整 `RunResult`（当前简化映射，保持 + 文档声明）

### 8.5 约束

1. **MCP tool schema 变更对客户端是 breaking**（客户端缓存 input schema）：P1 项一次性批量升级，避免频繁小改
2. **AI apiKey 安全边界**：凭据走 env（§4.3），不透传敏感参数
3. **复用优先**：新能力优先"已导出 API 直连"；cli 能力未导出时评估补 1 行导出 vs mcp 层重写——倾向补导出（保持单一事实源）
