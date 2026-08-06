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
| `owner` | `DEPENDFIX_OWNER` | `string[]` | — | owner / org 列表（逗号分隔多个或 CLI 多次传入），按 owner 自动发现仓库（M4 T401）；与显式 `repositories` 合并去重（显式优先，发现仅补充未出现项）。仅 `github-dependabot` 数据源可用；`cleanup-branches` 模式不可用 |
| `repoTopics` | `DEPENDFIX_REPO_TOPICS` | `string[]` | — | 发现结果 topic 白名单（逗号分隔，**AND 语义**：仓库必须包含全部指定 topics）。仅影响发现结果，不影响显式列表 |
| `repoInclude` | `DEPENDFIX_REPO_INCLUDE` | `string[]` | — | 仓库白名单 glob（逗号分隔多个或 CLI 多次传入，如 `owner/*`、`owner/pkg-*`）。**仅作用于发现结果**；显式列表不受 include 影响（显式优先） |
| `repoExclude` | `DEPENDFIX_REPO_EXCLUDE` | `string[]` | — | 仓库黑名单 glob。**显式列表与发现结果均受 exclude 约束**；与 include 冲突时 **exclude 胜出** |
| `repoTopicsExclude` | `DEPENDFIX_REPO_TOPICS_EXCLUDE` | `string[]` | — | 发现结果 topic 黑名单（排除含任一指定 topic 的仓库）。仅作用于发现结果（显式列表无 topics 元数据） |
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
| `maxConcurrency` | `DEPENDFIX_MAX_CONCURRENCY` | `number` | `1` | 多仓库并发窗口（1-16，默认 1 保守串行）。`>1` 时输出警告（可能触发 GitHub 限流）；**仅 `report-only` 模式允许并发**——`fix` / `fix-and-pr` 共享单一 workDir，并发写存在快照覆盖 / 互踩回滚 / install 竞争，配置校验 fail-fast 拒绝 |
| `maxRetries` | `DEPENDFIX_MAX_RETRIES` | `number` | `3` | GitHub API 限流重试次数（0-10；0=关闭）。对 429 / primary rate limit（403 + remaining=0）/ secondary rate limit（403/429 特征）指数退避重试（reset 头优先，上限 30s）；权限类 403 不重试 |
| `upgradeGroups` | `DEPENDFIX_UPGRADE_GROUPS` | `Record<string, string[]>` | — | 用户显式依赖分组（覆盖自动分组），格式 `name1:pkg1,pkg2;name2:pkg3`（分号分隔组、冒号分隔组名与包列表、逗号分隔包名）。缺省时使用自动分组：`dependabot.yml groups` → `@types` 归并 → scope/前缀启发式 → 单包。详见 [依赖分组设计](../design/packages/dependency-grouping.md) |
| `verbose` | — | `boolean` | `false` | 详细日志输出（仅 CLI `--verbose`） |
| `commands` | — | `string[]` | — | 自定义验证命令（仅 CLI `--commands`） |
| `history` | —（仅 CLI `--history`） | `string` | — | 查询仓库历史运行摘要（读 `dependfix-reports/index.json`，倒序时间，计数为仓库级口径），**不执行扫描**、不要求 token/仓库配置；与运行参数并存时 history 优先、其余参数忽略 |

### M4 名单策略优先级语义（T403）

| 来源 | include 白名单 | exclude 黑名单 | topicsExclude |
|:-----|:---|:---|:---|
| 显式 `repositories`（`--repo` / `--repos-file`） | **不受影响**（显式优先） | 受约束（命中即剔除） | 不适用（显式列表无 topics 元数据） |
| `--owner` 发现结果 | 受约束（include 非空时必须命中其一） | 受约束（命中即剔除） | 受约束（含任一指定 topic 即剔除） |

- 冲突规则：include 与 exclude 同时命中时 **exclude 胜出**（仓库被剔除）。
- 过滤时机：策略在发现阶段、dependabot.yml 探测**之前**应用——被排除仓库不触达 contents API（探测请求数量受控）。
- glob 语法：`*` 匹配任意非 `/` 字符序列（不跨仓库分隔符），`?` 匹配单个非 `/` 字符，其余字符按字面量；匹配对象为完整 `owner/repo`（大小写敏感）。

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
# M4 多仓库治理（可选）
# owner 级自动发现（与 DEPENDFIX_REPOSITORIES 合并去重，显式优先）
export DEPENDFIX_OWNER=owner-a,owner-b
# 发现结果 topic 白名单（AND 语义）与黑名单（排除含任一 topic 的仓库）
export DEPENDFIX_REPO_TOPICS=node,pnpm
export DEPENDFIX_REPO_TOPICS_EXCLUDE=deprecated,archived
# 仓库白名单 / 黑名单 glob（仅白名单作用于发现结果；黑名单对显式列表同样生效）
export DEPENDFIX_REPO_INCLUDE=owner-a/*,owner-b/pkg-*
export DEPENDFIX_REPO_EXCLUDE=owner-a/legacy-*
# 并发与限流（默认 1 保守串行；>1 仅 report-only 模式允许；限流退避默认 3 次）
export DEPENDFIX_MAX_CONCURRENCY=4
export DEPENDFIX_MAX_RETRIES=3
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
