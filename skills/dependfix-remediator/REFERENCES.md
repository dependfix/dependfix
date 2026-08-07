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
| `--commands` | 自定义验证命令（逗号分隔），覆盖默认 install/lint/build |
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

## MCP 双后端衔接（后续 MCP 交付扩展点）

> 本文档定义 SKILL.md"执行后端探测"的细节与双后端一致性验证基准。
> 当前 MCP Server 未发布（规划于后续里程碑），本 skill 全部走 CLI；MCP 发布后无需改版即可双后端工作。

### 探测方法明细

| 环境 | 检测方式 |
|------|---------|
| Claude Code | `claude mcp list`；或项目根 `.mcp.json` 的 `mcpServers` 字段含 dependfix server |
| OpenCode | `opencode.json` / `~/.config/opencode/opencode.json` 的 `mcp` 配置含 dependfix server |
| 通用 | 当前会话工具列表中存在以下 4 个 tool 即视为 MCP 后端可用 |

### MCP tool 映射明细

| 能力 | MCP tool | 入参要点 | CLI 对应 |
|------|----------|---------|---------|
| 拉取告警 | `fetch_alerts` | `owner`、`repo`（或多仓库列表）、`severityThreshold`、`includeCodeScanning` | `dependfix report-only` |
| 扫描并修复 | `run_scan` | `repo`、`mode`（fix / fix-and-pr）、`severityThreshold`、`dryRun` | `dependfix fix` / `fix-and-pr` |
| 修复指定依赖 | `fix_dependency` | `repo`、`dependency`、`createPr`、`allowMajorUpgrade` | `dependfix fix`（分组指定） |
| 查询历史报告 | `get_last_report` | `repo`（缺省取最近一次） | `dependfix --history <owner/repo>` |

> 说明：MCP tool 的最终入参 schema 以 MCP Server 实际交付为准；本表为能力契约映射的基准约定，MCP 实现不得改变各能力语义。MCP Server 交付时须与本表逐项核对（tool 名与入参 schema），确保"skill 无需改版"承诺闭环。

### 双后端一致性断言清单（MCP 交付验证基准）

以 `@dependfix/core` 报告契约为基准（RunResult JSON；`dependfix-reports/index.json` 历史条目为 CLI archiver 的派生格式），MCP tool 输出必须与 CLI 报告同源一致：

| 能力 | CLI 侧契约基准（字段） | MCP 一致性断言 |
|------|------------------------|---------------|
| 拉取告警 | RunResult：`summary.alertsFound` / `summary.alertsFixable` / `repositories[].alertsCount` / `alerts[]` | `fetch_alerts` 返回的告警数与严重级别分布与 CLI 报告一致；`alerts[]` 明细字段（package/severity/manifest）与 RunResult 对齐 |
| 扫描并修复 | RunResult：`summary.alertsFixed` / `alertsFailed` / `alertsSkipped` / `actions[]`（type=dependency-upgrade） | `run_scan` 返回的 fixed/failed/skipped 计数与 CLI 报告一致；`actions[]` 的 target/fromVersion/toVersion 对齐 |
| 修复指定依赖 | RunResult：`actions[]` + `summary`（单仓库维度） | `fix_dependency` 返回的修复结果与 CLI 对同一依赖的修复记录一致（含 PR 链接如创建） |
| 查询历史报告 | ArchiveRunEntry：`repoStats[]`（alertsCount/fixed/failed/durationMs）+ `runId` | `get_last_report` 返回与 `dependfix-reports/index.json` 对应条目同源（字段值一致） |

### 降级路径规则

1. 探测不到 MCP → 直接 CLI，不提示安装。
2. MCP tool 调用失败（不存在 / 超时 / 服务端错误）→ 改用 CLI 完成同能力调用，并向用户说明降级原因。
3. MCP 输出与 CLI 报告不一致（怀疑 MCP 缺陷）→ 以 CLI 报告为准，记录差异供后续修复。
