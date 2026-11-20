# dependfix CLI 命令参考

> 本文件是 dependfix-remediator skill 的详细参考，由 SKILL.md 按需引用。
> 完整参数以 `npx dependfix --help` 输出为准。

## 运行模式（positional）

| 模式 | 说明 |
|------|------|
| `report-only` | 只读扫描，输出报告，不修改文件（默认） |
| `fix` | 修复 + 本地验证，不提交不推送 |
| `fix-and-pr` | 修复 + 创建修复分支与 PR |
| `cleanup-branches` | 列出 / 清理已合并的 dependfix 修复分支 |

## 完整参数表

### 仓库与范围

| 参数 | 说明 |
|------|------|
| `--repo, -r` | 目标仓库 `owner/repo`，逗号分隔多个 |
| `--repos-file` | 从文件读取仓库列表（每行一个 owner/repo） |
| `--owner` | owner / org 自动发现（逗号分隔多个或多次传入） |
| `--repo-topics` | 发现结果 topic 白名单（逗号分隔，AND 语义） |
| `--repo-include` | 仓库白名单 glob（如 `owner/*`、`owner/pkg-*`） |
| `--repo-exclude` | 仓库黑名单 glob（与 include 冲突时胜出） |
| `--repo-topics-exclude` | 发现结果 topic 黑名单 |

### 凭据与数据源

| 参数 | 说明 |
|------|------|
| `--github-token` | GitHub PAT（多仓库 / PR / Code Scanning 均可用） |
| `--alerts-token` | Dependabot alerts 专用最小权限 PAT（缺省回退 `--github-token`） |
| `--alerts-source` | `github-dependabot`（默认）或 `pnpm-audit`（本地无 token 回退） |
| `--code-scanning` | 并行拉取 Code Scanning 告警（需 `security-events: read`） |

环境变量：`GITHUB_TOKEN` / `DEPENDFIX_GITHUB_TOKEN`、`ALERTS_TOKEN` / `DEPENDFIX_ALERTS_TOKEN`、`DEPENDFIX_AI_API_KEY`。

### 修复行为

| 参数 | 说明 |
|------|------|
| `--severity-threshold` | critical / high / medium / all，默认 high |
| `--dry-run` | 预演模式，不写文件 |
| `--commit` | 修复后本地当前分支直接提交（不推送、不创建 PR） |
| `--create-pr` | 创建 Pull Request |
| `--allow-major-upgrade` | 跨线告警显式授权自动升级（仅 CLI；workspace 成员独占声明 / 多版本共存维持人工） |
| `--upgrade-groups` | 显式分组，格式 `name1:pkg1,pkg2;name2:pkg3` |
| `--max-alerts-per-repository` | 每仓库最多处理告警数，默认 20 |
| `--commands` | 自定义验证命令（逗号分隔）；整链替换默认 install/lint/build/typecheck/test（不做合并，默认链扩展不会自动跟随，默认链内的条目须显式保留） |
| `--toolchain-pnpm-version` | lockfile 修复用的 pnpm 版本 |

### 多仓库并发

| 参数 | 说明 |
|------|------|
| `--max-concurrency` | 并发窗口 1-16，默认 1（保守串行，>1 可能触发 GitHub 限流） |
| `--max-retries` | 限流重试次数 0-10，默认 3 |
| `--max-backoff-ms` | 退避单次等待上限毫秒，默认 30000 |

### AI breaking change 研判

| 参数 | 说明 |
|------|------|
| `--ai` | 开启 AI 研判（默认关闭；dry-run 不触发、不产生费用） |
| `--ai-provider` | `openai-compatible`（默认）或 `anthropic` |
| `--ai-model` | 模型名（默认 deepseek-v4-flash） |
| `--ai-base-url` | OpenAI 兼容端点基地址（默认 https://api.deepseek.com） |
| `--ai-api-url` | Anthropic 兼容端点（仅 anthropic 生效） |
| `--ai-api-key` | API Key（优先 `DEPENDFIX_AI_API_KEY` env） |
| `--ai-trigger` | 触发范围：failure / major / both（默认 both） |

### 其他

| 参数 | 说明 |
|------|------|
| `--history` | 查询仓库历史运行摘要（读 `dependfix-reports/index.json`，不执行扫描） |
| `--verbose` | 输出详细日志 |

## 数据源说明

- **github-dependabot**：从 GitHub Dependabot alerts API 拉取。需要 PAT（`Dependabot alerts: read` / `security_events`）或 GitHub App token；`GITHUB_TOKEN`（secrets 默认 token）无法读取。
- **code-scanning**：从 GitHub Code Scanning alerts API 拉取，与 Dependabot 并行（追加 `--code-scanning`）。`GITHUB_TOKEN` 默认具备 `security-events: read`，可直接使用。
- **pnpm-audit**：本地无 token 场景，扫描当前工作区 lockfile；repository 优先 `--repo` → git remote → 本地目录兜底。

## 报告产物

- 每次运行生成 Markdown 报告，落盘于 `dependfix-reports/` 目录。
- `dependfix-reports/index.json` 维护历史摘要（供 `--history` 查询与趋势统计）。
- 报告包含：扫描范围、告警明细、修复/未修复清单、验证结果、AI 研判用量（如开启）。

## 常见问题

| 现象 | 处置 |
|------|------|
| `Missing GitHub token` | 设置 `GITHUB_TOKEN` / `DEPENDFIX_GITHUB_TOKEN`，或改用 `--alerts-source pnpm-audit` |
| Dependabot alerts 拉取 404 / 403 | token 缺少 `Dependabot alerts: read` / `security_events` 权限 |
| 升级验证失败 | 自动回滚该依赖并记为未修复（人工处理） |
| 429 / rate limit | 默认指数退避重试 3 次；可调 `--max-retries` / `--max-backoff-ms` |
| AI 研判开启但缺 Key | 设置 `DEPENDFIX_AI_API_KEY` 或 `--ai-api-key` |

## MCP 双后端衔接

> 本文档定义 SKILL.md"执行后端探测"的细节与双后端一致性验证基准。
> MCP Server 已发布（npm `@dependfix/mcp`，≥1.0.0），本 skill 默认 CLI、检测到 MCP 时自动双后端工作，无需改版。

### 探测方法明细

| 环境 | 检测方式 |
|------|---------|
| Claude Code | `claude mcp list`；或项目根 `.mcp.json` 的 `mcpServers` 字段含 dependfix server |
| OpenCode | `opencode.json` / `~/.config/opencode/opencode.json` 的 `mcp` 配置含 dependfix server |
| 通用 | 当前会话工具列表中存在以下 9 个 tool 即视为 MCP 后端可用 |

### MCP tool 映射明细

| 能力 | MCP tool | 入参（以实际 schema 为准） | CLI 对应 |
|------|----------|---------------------------|---------|
| 拉取告警 | `fetch_alerts` | `repo`（owner/repo）、`severity`（critical/high/medium/all，默认 high）、`code_scanning`? | `dependfix report-only` |
| 扫描并修复 | `run_scan` | `repo`、`mode`（report-only/fix/fix-and-pr，默认 report-only）、`severity`、`code_scanning`?、`max_alerts`?、`max_concurrency`?、`dry_run`?、`allow_major_upgrade`?、`ai_enabled`? / `ai_provider`? / `ai_model`? / `ai_trigger`? | `dependfix fix` / `fix-and-pr` |
| 修复指定依赖 | `fix_dependency` | `workDir`（本地已 clone）、`fix_type`（override/direct/lockfile，默认 override）、`packageName`?、`targetVersion`? | `dependfix fix --groups <name>:<pkg>` |
| 查询最近报告 | `get_last_report` | 无参数（读取最近一次 JSON 报告） | 读取 `dependfix-reports/` 最近报告 |
| 发现仓库 | `discover_repos` | `owner[]`、`topics[]`?、`include[]`?、`exclude[]`?、`probe_dependabot`?（默认 true）、`max_repos`?（默认 100） | `--owner` + `--repo-topics` / `--repo-include` / `--repo-exclude` / `--max-repos` |
| 读取运行日志 | `get_run_logs` | `run_id`、`view`（grouped/raw）、`level`?、`q`?、`page`?、`page_size`?（仅 remote 后端） | 平台 `/api/v1/runs/{id}/logs` |
| 清理分支 | `cleanup_branches` | `repo`、`dry_run`? | `dependfix cleanup-branches` |
| 历史摘要 | `history` | `repo` | `dependfix --history <owner/repo>` |
| 本地审计 | `pnpm_audit` | `workDir`（本地已 clone）、`repository`（owner/repo 或 local） | `--alerts-source pnpm-audit` |

> 入参名逐字对齐 `packages/mcp/src/tools/schemas.ts`（大小写敏感：snake_case 为主，`workDir` / `packageName` / `targetVersion` / `repository` 为 camelCase）；新增 / 改动 tool 时同批更新本表与 `packages/skills/test/sync-consistency.test.mjs` 覆盖的分发副本。

### 双后端一致性断言清单（MCP 验证基准）

以 `@dependfix/core` 报告契约为基准（RunResult JSON；`dependfix-reports/index.json` 历史条目为 CLI archiver 的派生格式），MCP tool 输出必须与 CLI 报告同源一致：

| 能力 | CLI 侧契约基准（字段） | MCP 一致性断言 |
|------|------------------------|---------------|
| 拉取告警 | RunResult：`summary.alertsFound` / `summary.alertsFixable` / `repositories[].alertsCount` / `alerts[]` | `fetch_alerts` 返回的告警数与严重级别分布与 CLI 报告一致；`alerts[]` 明细字段（package/severity/manifest）与 RunResult 对齐 |
| 扫描并修复 | RunResult：`summary.alertsFixed` / `alertsFailed` / `alertsSkipped` / `actions[]`（type=dependency-upgrade） | `run_scan` 返回的 fixed/failed/skipped 计数与 CLI 报告一致；`actions[]` 的 target/fromVersion/toVersion 对齐 |
| 修复指定依赖 | RunResult：`actions[]` + `summary`（单仓库维度） | `fix_dependency` 返回的修复结果与 CLI 对同一依赖的修复记录一致（含 PR 链接如创建） |
| 查询最近报告 | 报告目录下最近的 JSON | `get_last_report` 返回报告目录最近的 JSON；平铺布局下等价于最近一次 RunResult，归档布局下为 `index.json` 趋势条目（与 `history` 同源） |
| 发现仓库 | `--owner` 发现结果（topics / include / exclude 过滤后） | `discover_repos` 的仓库集合与 CLI 同参数发现结果一致 |
| 清理分支 | `cleanup-branches` 删除集合（仅 `dependfix/` 前缀且 merged/closed） | `cleanup_branches` 的待删 / 已删集合与 CLI 一致，open PR 分支零触碰 |
| 历史摘要 | ArchiveRunEntry：`repoStats[]`（alertsCount/fixed/failed/durationMs）+ `runId` | `history` 返回与 `dependfix-reports/index.json` 对应条目同源（字段值一致） |
| 本地审计 | 包装对象 `{ ok, count, workDir, repository, alerts[] }`（`alerts[]` 为 `NormalizedSecurityAlert`：`packageName` / `severity` / `manifestPath`） | `pnpm_audit` 的告警集合与 CLI `--alerts-source pnpm-audit` 同源；audit 失败硬返回错误 |

### 降级路径规则

1. 探测不到 MCP → 直接 CLI，不提示安装。
2. MCP tool 调用失败（不存在 / 超时 / 服务端错误）→ 改用 CLI 完成同能力调用，并向用户说明降级原因。
3. MCP 输出与 CLI 报告不一致（怀疑 MCP 缺陷）→ 以 CLI 报告为准，记录差异供后续修复。
