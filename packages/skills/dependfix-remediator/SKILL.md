---
name: dependfix-remediator
description: 自动拉取并修复 GitHub Dependabot / Code Scanning 安全告警：扫描仓库依赖漏洞、按严重级别研判、升级有漏洞的依赖、创建修复 PR、生成可审计报告。Use when 用户提到安全告警、dependabot、依赖漏洞、依赖升级、code scanning、pnpm audit、安全扫描、自动修复安全问题时使用。
---

# dependfix-remediator

自动处理 GitHub 安全告警（Dependabot alerts / Code Scanning alerts）的修复工作流：拉取告警 → 研判 → 修复 → 报告，全链路闭环。

## 能力契约与执行后端

本 skill 只依赖以下能力契约，不绑定具体实现：

| 能力 | 当前后端（dependfix CLI） | MCP 预留位 |
|------|--------------------------|-----------|
| 拉取告警 | `npx dependfix report-only` | fetch_alerts |
| 修复依赖 | `npx dependfix fix` | run_scan / fix_dependency |
| 修复并创建 PR | `npx dependfix fix-and-pr` | fix_dependency |
| 查询历史报告 | `npx dependfix --history <owner/repo>` | get_last_report |
| 清理已合并分支 | `npx dependfix cleanup-branches` | — |

未配置 MCP 时全部走 CLI；MCP 接入后（后续版本）探测到 MCP 工具则优先调用，两条后端输出保持一致。本 skill 当前不依赖 MCP，CLI 后端开箱即用。

## 执行后端探测

开始编排前先确定执行后端（只需一次）：

1. **检查当前会话是否已加载 dependfix MCP 工具**：工具列表中是否存在 `fetch_alerts` / `run_scan` / `fix_dependency` / `get_last_report`（server 前缀可能为 `dependfix` 或 `@dependfix/mcp`）。不确定时用命令确认：
   - Claude Code：`claude mcp list`（或检查项目根 `.mcp.json` 的 `mcpServers`）
   - OpenCode：检查 `opencode.json` / `~/.config/opencode/opencode.json` 的 `mcp` 配置
2. **决策规则**：
   - 4 个 MCP tool 均可用 → **MCP tool 优先**（按能力契约映射表调用，详见 [REFERENCES.md](REFERENCES.md)）
   - 未配置 MCP 或探测不到 → **CLI 后端**（本 skill 默认路径）
   - MCP 调用失败（tool 不存在 / 超时 / 报错）→ **降级 CLI 并告知用户**，不中断流程
3. 两条后端的输出以同一份能力契约（报告结构见 [REFERENCES.md](REFERENCES.md) 一致性断言清单）为准，MCP 与 CLI 结果应一致；发现不一致时以 CLI 报告为准并记录。

## 前置条件

1. Node.js >= 20（检查：`node --version`）。
2. 工作目录为 git 仓库（检查：`git rev-parse --is-inside-work-tree`）。
3. 凭据（按场景）：
   - GitHub 仓库：设置 `GITHUB_TOKEN` 或 `DEPENDFIX_GITHUB_TOKEN` 环境变量。注意 Dependabot alerts 需要 PAT 且具备 `Dependabot alerts: read` / `security_events` 权限，普通 `GITHUB_TOKEN` 无法读取 Dependabot alerts（Code Scanning 可用）。
   - 本地无 token：使用 `--alerts-source pnpm-audit` 走本地 lockfile 扫描，无需 GitHub 凭据。

## 工作流编排

### 决策树

收到用户请求后，先判断场景：

- 只看告警，不修改 → **场景 A：只读扫描**
- 自动修复（本地验证，不推送）→ **场景 B：自动修复**
- 修复并创建 PR → **场景 C：修复 + PR**
- 修复整个 owner / 仓库列表 → **场景 D：多仓库**
- 本地仓库且无 GitHub token → **场景 E：pnpm audit**
- 查看历史运行结果 → **场景 F：历史查询**
- 清理已合并的修复分支 → **场景 G：分支清理**

### 场景 A：只读扫描（报告）

```bash
npx dependfix report-only --repo <owner/repo> --severity-threshold high
```

- 拉取 Dependabot 告警并按严重级别过滤，输出 Markdown 报告到 `dependfix-reports/`，不修改任何文件。
- 需要同时扫 Code Scanning：追加 `--code-scanning`。
- 汇报：告警总数、严重级别分布、修复建议摘要、报告路径。

### 场景 B：自动修复（默认路径）

```bash
npx dependfix fix --repo <owner/repo> --severity-threshold high
```

- 自动升级可修复依赖 → 强制验证（install + lint + build）→ 生成报告。默认不提交不推送。
- 需要本地提交时追加 `--commit`；需要预演时先加 `--dry-run`（只输出将要做的修改，不写文件）。
- 汇报：修复的告警、验证结果、未修复（需人工处理）清单、报告路径。

### 场景 C：修复 + 创建 PR

```bash
npx dependfix fix-and-pr --repo <owner/repo>
```

- 修复 + 自动创建修复分支与 PR（PR 去重、分组升级）。
- 汇报：PR 链接 / 编号列表、报告路径。

### 场景 D：多仓库治理

```bash
npx dependfix fix --owner <org> --severity-threshold high
# 或从文件读取仓库列表（每行一个 owner/repo）：
npx dependfix fix --repos-file repos.txt
```

- 自动发现 owner 下全部仓库（可用 `--repo-include` / `--repo-exclude` glob 过滤）。
- 汇报：每个仓库的结果摘要与失败隔离情况。

### 场景 E：本地无 token（pnpm audit）

```bash
npx dependfix fix --alerts-source pnpm-audit
```

- 在目标仓库内运行，基于本地 lockfile 扫描；目标仓库优先取 `--repo`，其次 git remote，最后当前目录。
- 汇报：audit 告警数与修复结果。

### 场景 F：历史报告查询

```bash
npx dependfix --history <owner/repo>
```

- 读取 `dependfix-reports/index.json` 摘要，不执行扫描。
- 汇报：历史运行时间线及每次结果摘要。

### 场景 G：清理已合并分支

```bash
npx dependfix cleanup-branches --repo <owner/repo>
```

- 列出已合并 / 已关闭的 dependfix 修复分支，交互确认后删除（非 TTY 环境默认拒绝删除）；`--dry-run` 仅列清单。
- fix-and-pr 模式中追加 `--cleanup-branches-auto` 可在结束后非交互自动删除已合并 / 已关闭分支（CI 可用，不删有 open PR 的分支）。

## 关键参数速查

| 参数 | 说明 | 默认 |
|------|------|------|
| `--severity-threshold` | 严重级别阈值：critical / high / medium / all | high |
| `--code-scanning` | 并行拉取 Code Scanning 告警 | 关闭 |
| `--allow-major-upgrade` | 显式授权跨大版本自动升级（仅 CLI） | 关闭 |
| `--max-alerts-per-repository` | 每个仓库最多处理告警数 | 20 |
| `--ai` | 开启 AI breaking change 研判（需配置 API Key） | 关闭 |
| `--dry-run` | 预演模式，不写文件不触发 AI | 关闭 |
| `--alerts-source` | github-dependabot（默认）或 pnpm-audit | github-dependabot |

完整参数与说明见 [REFERENCES.md](REFERENCES.md)。

## 安全与执行纪律

- Token 优先用环境变量（`GITHUB_TOKEN` / `DEPENDFIX_GITHUB_TOKEN` / `DEPENDFIX_AI_API_KEY`），避免命令行参数泄露到进程列表与 shell history。
- 修复类操作前先确认仓库工作区干净（`git status`）；存在未提交改动时先与用户确认。
- AI 研判默认关闭，开启会产生 API 费用，先与用户确认。
- 跨线升级（`--allow-major-upgrade`）风险高，仅在用户明确要求时使用；升级失败会自动回滚。
- 报告落盘在 `dependfix-reports/`，可归档、可审计，勿删除。

## 完成汇报模板

每次执行完向用户汇报：

1. 扫描范围：仓库 / 数据源 / 严重级别阈值。
2. 结果：修复 N 个告警，未修复 M 个（含原因与建议）。
3. 验证状态：install / lint / build 是否通过。
4. 产物：报告路径、PR 链接（如有）。
