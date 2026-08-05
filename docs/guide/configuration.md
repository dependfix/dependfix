# 配置说明

## 配置来源（按优先级）

1. CLI 参数
2. 环境变量（`DEPENDFIX_*` + `GITHUB_TOKEN`）
3. 配置文件（`dependfix.config.json` / `dependfix.config.yaml`，计划中 M4+）
4. 默认值

## 全部配置项

| 配置项 | 环境变量 | 类型 | 默认值 | 说明 |
|:-------|:---------|:-----|:-------|:-----|
| `mode` | `DEPENDFIX_MODE` | `string` | `report-only` | 运行模式：`report-only` / `fix` / `fix-and-pr` |
| `repositories` | `DEPENDFIX_REPOSITORIES` | `string[]` | `[]` | 目标仓库列表（逗号分隔） |
| `reposFilePath` | —（仅 CLI `--repos-file`） | `string` | — | 从文件读取仓库列表（每行一个 `owner/repo`） |
| `severityThreshold` | `DEPENDFIX_SEVERITY_THRESHOLD` | `string` | `high` | 严重级别阈值：`critical` / `high` / `medium` / `all` |
| `dryRun` | `DEPENDFIX_DRY_RUN` | `boolean` | `false` | 预演模式，不实际修改文件 |
| `createPullRequest` | `DEPENDFIX_CREATE_PR` | `boolean` | `false` | 是否创建 PR（`fix-and-pr` 模式自动启用） |
| `commit` | `DEPENDFIX_COMMIT` | `boolean` | `false` | 修复完成后在本地当前分支直接提交（仅 `fix` 模式生效；与 `--dry-run` / `--create-pr` 互斥） |
| `cleanupBranches` | `DEPENDFIX_CLEANUP_BRANCHES` | `boolean` | `false` | （fix-and-pr 模式）结束后将已合并的 dependfix 分支列入报告待清理清单（不自动删除；删除需 `cleanup-branches` 模式交互确认） |
| `cleanupBranchesAuto` | `DEPENDFIX_CLEANUP_BRANCHES_AUTO` | `boolean` | `false` | （fix-and-pr 模式）结束后自动删除已合并/已关闭的 dependfix 分支（非交互；不删有 open PR 的分支） |
| `githubToken` | `DEPENDFIX_GITHUB_TOKEN` / `GITHUB_TOKEN` | `string` | — | GitHub 认证 Token（`pnpm-audit` 数据源下可省略） |
| `alertsToken` | `DEPENDFIX_ALERTS_TOKEN` | `string` | — | Dependabot alerts 专用 token（可选，最小权限 fine-grained PAT，仅 `Dependabot alerts: read`；缺省回退 `githubToken`。GITHUB_TOKEN 无法读取 Dependabot alerts） |
| `alertSource` | `DEPENDFIX_ALERTS_SOURCE` | `string` | `github-dependabot` | 告警数据源：`github-dependabot`（GitHub Dependabot alerts API）/ `pnpm-audit`（本地无 token 回退，扫描当前工作区 lockfile；repository 解析优先显式 `--repo` → git remote → `local` 兜底）。`pnpm-audit` 下不要求 token、不支持 `fix-and-pr` 模式与多个 `--repo`。详见 [pnpm audit fallback 设计](../design/packages/pnpm-audit-fallback.md) |
| `codeScanningEnabled` | `DEPENDFIX_CODE_SCANNING` | `boolean` | `false` | 是否同时拉取 Code Scanning alerts（与 Dependabot **并行源**，非回退；默认关闭，行为与 M2 一致）。开启后 Dependabot + Code Scanning 并行拉取、互不覆盖；Code Scanning 告警默认不可自动修复（A/B/C 规则分层按规则启用）。需要 token 具备 `security-events: read` 权限（GITHUB_TOKEN 默认具备）；`pnpm-audit` 本地数据源下不可用。详见 [Code Scanning 设计](../design/packages/data-model.md) |
| `maxAlertsPerRepository` | `DEPENDFIX_MAX_ALERTS_PER_REPOSITORY` | `number` | `20` | 每仓库最大告警处理数 |
| `upgradeGroups` | `DEPENDFIX_UPGRADE_GROUPS` | `Record<string, string[]>` | — | 用户显式依赖分组（覆盖自动分组），格式 `name1:pkg1,pkg2;name2:pkg3`（分号分隔组、冒号分隔组名与包列表、逗号分隔包名）。缺省时使用自动分组：`dependabot.yml groups` → `@types` 归并 → scope/前缀启发式 → 单包。详见 [依赖分组设计](../design/packages/dependency-grouping.md) |
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
maxAlertsPerRepository: 20
commit: false
```

## 环境变量

```bash
export GITHUB_TOKEN=ghp_xxx
export DEPENDFIX_MODE=report-only
export DEPENDFIX_SEVERITY_THRESHOLD=high
export DEPENDFIX_REPOSITORIES=owner/repo-a,owner/repo-b
export DEPENDFIX_DRY_RUN=true
export DEPENDFIX_MAX_ALERTS_PER_REPOSITORY=20
export DEPENDFIX_COMMIT=false
export DEPENDFIX_CLEANUP_BRANCHES=false
# 用户显式依赖分组（可选；缺省时自动分组）
# 格式：name1:pkg1,pkg2;name2:pkg3
export DEPENDFIX_UPGRADE_GROUPS="eslint-stack:eslint,eslint-plugin-vue;nuxt-stack:@nuxt/eslint,nuxt"
# 仅当 GitHub token 无法读取 Dependabot alerts（如 Action 内 GITHUB_TOKEN）时配置，
# 使用最小权限 fine-grained PAT（仅 Dependabot alerts: read）
export DEPENDFIX_ALERTS_TOKEN=github_pat_xxx
# 本地无 token 回退：使用 pnpm audit 扫描当前工作区 lockfile
# （不要求 GITHUB_TOKEN / 不要求 git remote；repository 显示 git remote 或 local）
export DEPENDFIX_ALERTS_SOURCE=pnpm-audit
```

> `GITHUB_TOKEN` 环境变量会被自动识别，无需额外配置前缀。`DEPENDFIX_GITHUB_TOKEN` 优先级高于 `GITHUB_TOKEN`。
