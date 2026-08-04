# 配置说明

## 配置来源（按优先级）

1. CLI 参数
2. 环境变量（`AUTO_FIX_GITHUB_SECURITY_*` + `GITHUB_TOKEN`）
3. 配置文件（`dependfix.config.json` / `dependfix.config.yaml`，计划中 M4+）
4. 默认值

## 全部配置项

| 配置项 | 环境变量 | 类型 | 默认值 | 说明 |
|:-------|:---------|:-----|:-------|:-----|
| `mode` | `AUTO_FIX_GITHUB_SECURITY_MODE` | `string` | `report-only` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `repositories` | `AUTO_FIX_GITHUB_SECURITY_REPOSITORIES` | `string[]` | `[]` | 目标仓库列表（逗号分隔） |
| `reposFilePath` | —（仅 CLI `--repos-file`） | `string` | — | 从文件读取仓库列表（每行一个 `owner/repo`） |
| `severityThreshold` | `AUTO_FIX_GITHUB_SECURITY_SEVERITY_THRESHOLD` | `string` | `high` | 严重级别阈值：`critical` / `high` / `medium` / `all` |
| `dryRun` | `AUTO_FIX_GITHUB_SECURITY_DRY_RUN` | `boolean` | `false` | 预演模式，不实际修改文件 |
| `createPullRequest` | `AUTO_FIX_GITHUB_SECURITY_CREATE_PR` | `boolean` | `false` | 是否创建 PR（`fix-and-pr` 模式自动启用） |
| `commit` | `AUTO_FIX_GITHUB_SECURITY_COMMIT` | `boolean` | `false` | 修复完成后在本地当前分支直接提交（仅 `fix` 模式生效；与 `--dry-run` / `--create-pr` 互斥） |
| `cleanupBranches` | `AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES` | `boolean` | `false` | （fix-and-pr 模式）结束后将已合并的 dependfix 分支列入报告待清理清单（不自动删除；删除需 `cleanup-branches` 模式交互确认） |
| `githubToken` | `AUTO_FIX_GITHUB_SECURITY_GITHUB_TOKEN` / `GITHUB_TOKEN` | `string` | — | GitHub 认证 Token |
| `alertsToken` | `AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN` | `string` | — | Dependabot alerts 专用 token（可选，最小权限 fine-grained PAT，仅 `Dependabot alerts: read`；缺省回退 `githubToken`。GITHUB_TOKEN 无法读取 Dependabot alerts） |
| `maxAlertsPerRepository` | `AUTO_FIX_GITHUB_SECURITY_MAX_ALERTS_PER_REPOSITORY` | `number` | `20` | 每仓库最大告警处理数 |
| `verbose` | — | `boolean` | `false` | 详细日志输出（仅 CLI `--verbose`） |
| `commands` | — | `string[]` | — | 自定义验证命令（仅 CLI `--commands`） |

> **计划中（M5）**：AI 研判相关配置（`AI_API_TOKEN`、`AI_API_BASE_URL`、`AI_MODEL`）将在 M5 与 AI 引擎联调时落地。

## 配置文件示例

> **计划中（M4+）**：配置文件支持尚未实现，当前仅支持 CLI 参数和环境变量。

```yaml
# dependfix.config.yaml
repositories:
  - owner/repo-a
  - owner/repo-b
severityThreshold: high
mode: fix-and-pr
maxAlertsPerRepository: 10
commit: false
```

## 环境变量

```bash
export GITHUB_TOKEN=ghp_xxx
export AUTO_FIX_GITHUB_SECURITY_MODE=report-only
export AUTO_FIX_GITHUB_SECURITY_SEVERITY_THRESHOLD=high
export AUTO_FIX_GITHUB_SECURITY_REPOSITORIES=owner/repo-a,owner/repo-b
export AUTO_FIX_GITHUB_SECURITY_DRY_RUN=true
export AUTO_FIX_GITHUB_SECURITY_MAX_ALERTS_PER_REPOSITORY=10
export AUTO_FIX_GITHUB_SECURITY_COMMIT=false
export AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES=false
# 仅当 GitHub token 无法读取 Dependabot alerts（如 Action 内 GITHUB_TOKEN）时配置，
# 使用最小权限 fine-grained PAT（仅 Dependabot alerts: read）
export AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN=github_pat_xxx
```

> `GITHUB_TOKEN` 环境变量会被自动识别，无需额外配置前缀。`AUTO_FIX_GITHUB_SECURITY_GITHUB_TOKEN` 优先级高于 `GITHUB_TOKEN`。
