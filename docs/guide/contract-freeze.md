# 1.0 契约冻结清单与迁移指南

> **用途**：本页是 `1.0.0` 起**对外承诺不变**的契约面清单。1.x 内只允许新增（可缺省的）键位，改名 / 删除 / 语义变更一律留到 `2.0.0`。
> **事实源**：清单里的每个键位都由代码抽取，`pnpm run check:contract-freeze` 比对代码与本文档（差异即 CI 失败）——**不要手改清单来「修绿」**，先确认代码改动是否真的是有意的契约变更。
> **关联**：1.0 门槛 G2 的判定口径见 [1.0 发布门槛与就绪度台账](../design/governance/release-1.0-readiness.md)；发布流程见 [发布指南](release.md)；配置项说明见 [配置说明](configuration.md)；参数用法见[快速开始](quick-start.md)。

## 1. 冻结范围与判据

| # | 契约面 | 事实源 | 判据 |
|:--|:--|:--|:--|
| 1 | CLI 参数与运行模式 | `packages/cli/src/cli/index.ts` 的 `argsDef`；`packages/engine/src/config/index.ts` 的 `RUNTIME_MODES` | 键位集合相等（含位置参数 `mode`）；参数语义由 `--help` 文案承载 |
| 2 | GitHub Action inputs | `action.yml#inputs` | 键位集合相等；默认值以 `action.yml` 声明为准（**默认值未机检**，改动时人工核对） |
| 3 | 运行时配置项与环境变量 | `RuntimeConfig` 顶层属性；npm 包（`cli` / `core` / `engine` / `mcp`）源码中的 `DEPENDFIX_*` 环境变量 | 键位集合相等；`GITHUB_TOKEN` 属 Actions 标准注入、平台部署变量（`DEPENDFIX_ROLE` 等，见 [配置说明](configuration.md)平台段）不在冻结命名空间内 |
| 4 | 报告 JSON 字段 | `packages/core/src/report/types.ts` 的 `RunResult` / `RepositoryResult` | 顶层字段集合相等；新增字段一律可选（读方不得假设存在） |
| 5 | 平台数据库表列 | `apps/platform/server/entities/*.ts`（含 `BaseEntity` 继承列） | 表 → 物理列名集合相等；列名按 `SnakeCaseNamingStrategy` 换算 |

**冻结语义**：

- **只增不改不删**：新增键位属 minor（新增函数参数须有默认值，新增响应字段须可缺省）；改名、删除、默认值变化、语义反转都是破坏性变更。
- **不在冻结面内**：平台 HTTP API 的路径与响应体（内部控制面，随 UI 演进）、**平台部署环境变量**（`DEPENDFIX_ROLE` / `DEPENDFIX_MIGRATIONS_ONLY` / `DEPENDFIX_LOCALE` / `DEPENDFIX_NOTIFICATION_ENABLED` / `DEPENDFIX_WEEKLY_DIGEST_HOUR` 等，属部署配置，见 [配置说明](configuration.md)平台段与[部署说明](deployment.md)）、报告 Markdown 排版、日志文案、内部模块与文件结构、`@dependfix/*` 未在「§8 迁移指南」列出的导出签名、文档措辞。
- **数据面例外**：平台 DB 的列**可以**为新增能力加列（只加不删）；已发布列的删除 / 改名属破坏性变更，只随 `2.0.0` 且需提供数据迁移脚本。

**机检口径**（`scripts/docs/check-contract-freeze.mjs`）：

- 全部键位由 AST / YAML 解析抽取，不用文本 grep（`argsDef` 是被 `satisfies ArgsDef` 包裹的对象字面量、env 键经 `readEnv` 前缀拼接，grep 会漏或误收注释里的示例名）。
- 比对是**集合**语义（顺序无关）；差异分两类输出：`清单缺少键位（代码已有）` 与 `清单多出键位（代码已无）`。
- fail-closed：文档小节标题改名 / 代码块为空 / 事实源抽取为空，一律失败（避免门禁静默失效）；出现抽取器未覆盖的写法（`@Embedded`、`@ManyToMany` 的 join table、env 解构、非常量 `readEnv` 实参）同样失败（`extractor-coverage`，避免静默少登记键位）。
- 同时校验 zh 与 en 的 quick-start CLI 参数表 == `argsDef` 键位（防止文档漏参数回流）。
- 接入 `gates:docs`（Test / Release / 周回归同一集合）。
- **更新流程**：改代码 → 跑 `pnpm run check:contract-freeze` → 按失败明细**人工判断**是「代码越界」还是「契约变更」，后者才改本页并走弃用策略。

## 2. CLI 参数与运行模式

### CLI 参数（argsDef）

> 键位不带 `--` 前缀（`mode` 为位置参数，其余为 `--<键位>`）。用法与默认值见[快速开始](quick-start.md)。

```text
mode
repo
repos-file
owner
repo-topics
repo-include
repo-exclude
override-protect
repo-topics-exclude
severity-threshold
dry-run
create-pr
commit
cleanup-branches
cleanup-branches-auto
github-token
alerts-token
alerts-source
code-scanning
code-quality
allow-major-upgrade
rollback-granularity
max-alerts-per-repository
max-concurrency
max-retries
max-backoff-ms
max-repos
history
upgrade-groups
toolchain-pnpm-version
commands
mirror-ci-scripts
retry-failed
wait-pr-checks
close-failed-pr
verbose
ai
ai-provider
ai-model
ai-base-url
ai-api-url
ai-api-key
ai-trigger
```

### 运行模式（RUNTIME_MODES）

```text
report-only
fix
fix-and-pr
cleanup-branches
```

## 3. Action inputs（action.yml）

> 键位集合与 `action.yml#inputs` 一致；`dependabot-alerts-token` 对应 CLI 的 `--alerts-token`。

### action.yml inputs

```text
mode
repos
owner
repo-topics
repo-include
repo-exclude
repo-topics-exclude
max-concurrency
max-retries
severity-threshold
dry-run
max-alerts-per-repository
max-repos
cleanup-branches
cleanup-branches-auto
github-token
dependabot-alerts-token
code-scanning
ai
ai-api-key
ai-provider
ai-model
ai-base-url
ai-api-url
ai-trigger
commands
mirror-ci-scripts
retry-failed
wait-pr-checks
close-failed-pr
on-baseline-red
```

## 4. 运行时配置与环境变量

> `RuntimeConfig` 属性是引擎 `runApp` 的入参契约；`DEPENDFIX_*` 是 npm 包（CLI / Action / MCP）的环境变量通道。两者并非一一对应（如 `--allow-major-upgrade` 刻意无 env 通道、`deadlineAt` 只由平台注入）。**平台部署变量不在本清单内**（平台不是 npm 包，其变量见 [配置说明](configuration.md)平台段）。

### RuntimeConfig 属性

```text
mode
severityThreshold
repositories
owner
repoTopics
repoInclude
repoExclude
repoTopicsExclude
overrideProtect
dryRun
createPullRequest
commit
cleanupBranches
cleanupBranchesAuto
githubToken
githubApp
alertSource
codeScanningEnabled
codeQualityEnabled
allowMajorUpgrade
rollbackGranularity
mirrorCiScripts
retryFailed
onBaselineRed
waitPrChecks
closeFailedPr
prCheckTimeoutMs
prCheckRunBudgetMs
jobBudgetMs
deadlineAt
buildVersion
buildCommit
alertsToken
maxAlertsPerRepository
maxConcurrency
maxRetries
maxBackoffMs
upgradeGroups
toolchainPnpmVersion
maxRepos
ai
```

### 环境变量（DEPENDFIX_ 前缀）

```text
DEPENDFIX_AI
DEPENDFIX_AI_API_KEY
DEPENDFIX_AI_API_URL
DEPENDFIX_AI_BASE_URL
DEPENDFIX_AI_MODEL
DEPENDFIX_AI_PROVIDER
DEPENDFIX_AI_TRIGGER
DEPENDFIX_ALERTS_SOURCE
DEPENDFIX_ALERTS_TOKEN
DEPENDFIX_ALLOWED_DOMAINS
DEPENDFIX_CLEANUP_BRANCHES
DEPENDFIX_CLEANUP_BRANCHES_AUTO
DEPENDFIX_CLOSE_FAILED_PR
DEPENDFIX_CODE_QUALITY
DEPENDFIX_CODE_SCANNING
DEPENDFIX_COMMIT
DEPENDFIX_CREATE_PR
DEPENDFIX_DRY_RUN
DEPENDFIX_GITHUB_APP_CONFIG
DEPENDFIX_GITHUB_TOKEN
DEPENDFIX_INSTALL_TIMEOUT_MS
DEPENDFIX_JOB_BUDGET_MS
DEPENDFIX_MAX_ALERTS_PER_REPOSITORY
DEPENDFIX_MAX_BACKOFF_MS
DEPENDFIX_MAX_CONCURRENCY
DEPENDFIX_MAX_REPOS
DEPENDFIX_MAX_RETRIES
DEPENDFIX_MCP_REPORT_DIR
DEPENDFIX_MIRROR_CI_SCRIPTS
DEPENDFIX_MODE
DEPENDFIX_ON_BASELINE_RED
DEPENDFIX_OVERRIDE_PROTECT
DEPENDFIX_OWNER
DEPENDFIX_PR_CHECK_RUN_BUDGET_MS
DEPENDFIX_PR_CHECK_TIMEOUT_MS
DEPENDFIX_REPOSITORIES
DEPENDFIX_REPO_EXCLUDE
DEPENDFIX_REPO_INCLUDE
DEPENDFIX_REPO_TOPICS
DEPENDFIX_REPO_TOPICS_EXCLUDE
DEPENDFIX_RETRY_FAILED
DEPENDFIX_ROLLBACK_GRANULARITY
DEPENDFIX_SEVERITY_THRESHOLD
DEPENDFIX_SUPPRESS_LOCAL_EXECUTION_WARNING
DEPENDFIX_TOOLCHAIN_PNPM_VERSION
DEPENDFIX_UPGRADE_GROUPS
DEPENDFIX_VERIFY_TIMEOUT_MS
DEPENDFIX_WAIT_PR_CHECKS
```

## 5. 报告 JSON 字段

> 运行级报告 JSON（`RunResult`）与其中的单仓结果（`RepositoryResult`，位于 `repositories[]`）的顶层字段。新增字段一律可选，读方对缺失字段必须按「该能力未发生」处理。完整类型定义见 [data-model.md](../design/modules/data-model.md)。

### RunResult 字段

```text
runId
startedAt
finishedAt
config
summary
repositories
alerts
actions
errors
aiUsage
supplyChainWarnings
alertsDisabled
ciAlignment
alertOutcomes
attemptTracking
prCheckWatch
deliverySkips
```

### RepositoryResult 字段

```text
repository
defaultBranch
alertsCount
fixable
fixed
failed
lockfileRepaired
verificationPassed
verificationBlocking
verificationSkipped
durationMs
```

## 6. 平台数据库表列

> 物理表名 = `dependfix_` + 表名（前缀可由 `DATABASE_ENTITY_PREFIX` 覆盖，**前缀不属契约**）；列为物理列名（`SnakeCaseNamingStrategy` 换算后）。每张表都含 `BaseEntity` 的三列（`id` / `created_at` / `updated_at`）。

### 表与列（物理名）

```text
account: id, created_at, updated_at, account_id, provider_id, issuer, user_id, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, password
audit_event: id, created_at, updated_at, type, severity, repository_id, scan_run_id, payload_json, notified, notified_via
batch_run: id, created_at, updated_at, source, schedule_id, triggered_by_user_id, mode, severity_threshold, repository_count, finished_count, completed_count, failed_count, pending_count, summary_json, status, finished_at, organization_id
credential: id, created_at, updated_at, organization_id, name, type, encrypted_token, app_id, encrypted_private_key, installation_id, bot_login, owner_login, note, last_used_at
notification_log: id, created_at, updated_at, delivery_key, category, scope_type, scope_id, channel, fingerprint, recipient_user_id, recipients_json, status, error_message, sent_at
notification_preference: id, created_at, updated_at, user_id, category, channel, enabled
organization: id, created_at, updated_at, name, ai_api_key_encrypted, ai_provider, ai_model, ai_base_url, ai_api_url, notification_settings_json
pr_check: id, created_at, updated_at, repository_id, pr_number, head_sha, author_login, conclusion, check_run_id, details_url, error_message, signals_json, overall_status, failure_sources_json, alert_firing, acknowledged_at, acknowledged_by_user_id, last_polled_at
repository: id, created_at, updated_at, organization_id, owner, name, platform, default_branch, package_manager, credential_id, action_workflow_file, executor_kind, ai_enabled, ai_trigger, note, last_scan_at, tags, sandbox_limits, verify_commands, pr_check_focus, pr_feedback
scan_result: id, created_at, updated_at, scan_run_id, repository_id, upstream_id, source, severity, package_name, manifest_path, rule_id, summary, fixable, fix_strategy, recommended_version, html_url, ghsa_id, cve_ids, fix_status, error_message, first_seen_at, last_seen_at, occurrence_count, superseded_at
scan_run: id, created_at, updated_at, repository_id, mode, severity_threshold, executor_kind, build_version, build_commit, status, started_at, finished_at, summary_json, exit_code, environmental_failure_count, memory_max_bytes, peak_rss_bytes, oom_killed, resource_json, error_json, failure_code, failure_stage, failure_kind, retried_from_run_id, triggered_by_user_id, logs_json, ai_config_snapshot, run_url, pr_number, batch_run_id
schedule: id, created_at, updated_at, kind, name, cron, timezone, selector_kind, selector_json, mode, severity_threshold, enabled, last_triggered_at, last_batch_run_id, organization_id
session: id, created_at, updated_at, expires_at, token, ip_address, user_agent, user_id, impersonated_by
user: id, created_at, updated_at, email, email_verified, name, image, role, banned, ban_reason, ban_expires
verification: id, created_at, updated_at, identifier, value, expires_at
```

## 7. 弃用策略

1.0 起破坏性变更只随 `2.0.0`（与[就绪度台账 §1 semver 承诺](../design/governance/release-1.0-readiness.md)一致）。弃用一个键位的完整流程：

| 步骤 | 要求 |
|:--|:--|
| ① 标记 | 代码与文档同时标注弃用（见下表「标注方式」），行为**保持不变** |
| ② 通告 | 随本次发布的 CHANGELOG 与迁移指南列出，**提前通告期至少 1 个 minor**；提前期满足后仍不得在 1.x 删除，实际移除只在 `2.0.0`（同 minor 内的 patch 也不能删） |
| ③ 过渡 | 弃用期内继续工作，只在 help / 文档 / 日志提示替代写法；替代能力必须先于弃用可用 |
| ④ 移除 | 仅在 `2.0.0` 移除，且同时提供「旧 → 新」映射与迁移命令 |

| 契约面 | 标注方式 |
|:--|:--|
| CLI 参数 | `argsDef` 的 `description` 以 `[已弃用]` 开头并注明替代参数；`--help` 中保留 |
| Action input | `action.yml` 的 `description` 注明「已弃用，改用 X」，并加 `deprecationMessage` |
| 配置项 / 环境变量 | `RuntimeConfig` 属性 JSDoc 加 `@deprecated`，文档表格「说明」列注明替代项 |
| 报告 JSON 字段 | 字段继续输出且保持可缺省；文档标注「已弃用，2.0 移除」 |
| 平台 DB 列 | 只加不删；弃用列保留（可空）并在迁移文件与实体注释标注，`2.0.0` 才随迁移删除 |

### 7.1 弃用台账

> 当前为空（1.0 尚未发布）。登记格式：`契约面 | 键位 | 标记版本 | 可移除版本 | 替代方案`。台账条目与 `2.0.0` 移除清单同步维护。

| 契约面 | 键位 | 标记版本 | 可移除版本 | 替代方案 |
|:--|:--|:--|:--|:--|
| — | — | — | — | — |

## 8. 0.x → 1.0 迁移指南

> 只列**已发生且影响外部行为**的变更。每条给「受影响对象 / 变更 / 迁移动作 / 验证命令」。纯新增（报告字段、CLI 开关、Action input）不需要迁移动作。

### 8.1 `--version` 曾恒为 0.1.0

- **受影响对象**：用 `dependfix --version` 做版本探测的脚本与 CI。
- **变更**：`0.6.0` 及更早版本的版本号是硬编码常量，`--version` 恒输出 `0.1.0`（与 npm 包版本脱节）；修复后改为读包 `package.json`，输出与 npm 版本一致。
- **迁移动作**：升级到含该修复的版本（**下一个发布版本，计划 `0.6.1`**；`0.6.0` 及更早均受影响）。依赖 `--version` 判版本下限的脚本，改为读取 `npm view dependfix version` 或解析自身 `package.json` 依赖版本。
- **验证**：`npx dependfix --version` 与 `npm view dependfix version` 一致。

### 8.2 `@dependfix/engine` 导出函数由同步改为异步

- **受影响对象**：直接 `import { … } from '@dependfix/engine'` 并**同步调用**这些函数的消费者（自建集成 / 二次开发）。CLI、Action、MCP、平台四入口已同批适配，不受影响。
- **变更**：下列函数返回 `Promise`（原为同步返回值）：`repairLockfile`、`classifyLockfileFailure`、`tryLockfileRepair`、`createFixBranch`、`stageAndCommit`、`pushBranch`、`commitStaged`、`stageScopedChanges`、`listChangedPaths`、`computeCommitScope`、`ensureGitConfig`、`commitLocalChanges`。原因是同步子进程会阻塞事件循环，使平台执行超时与运行级取消无法按时生效。
- **迁移动作**：① 调用点改 `await`（同步上下文中用 `void fn(...).then(...)` 或上移到异步函数）；② **失败形态随之变化**——交付类 git 调用不再抛 Node 子进程错误（无 `err.status` / `err.signal`），统一抛 `GitCommandError`：退出码在 `code`，另带 `timedOut` / `aborted` / `started`，`stderr` 为 `string`（非 Buffer）。读取 `status` / `signal` 的错误处理需改用 `code` / `timedOut` / `aborted`。锁文件修复链的失败仍按原类别与 stderr 口径呈现。
- **验证**：`pnpm typecheck` 通过（未 `await` 时报 `Promise<T>` 不可赋值）；集成链上跑一次 report-only 扫描确认无未处理 rejection。

### 8.3 `--allow-major-upgrade` 没有环境变量通道

- **受影响对象**：希望通过 env（`DEPENDFIX_*`）或 Action input 开启跨大版本自动升级的用户。
- **变更**：该能力的唯一入口是 CLI 参数 `--allow-major-upgrade`；**刻意不提供**环境变量与 Action input（防 CI 自动跨线引发意外破坏）。`RuntimeConfig` 里存在 `allowMajorUpgrade` 字段，但 CLI / Action 之外的注入方式不受支持、不属契约。
- **迁移动作**：需要跨线升级时本地显式传 flag；CI 场景改为人工处理跨线告警，或在下游脚本中显式调用 CLI。
- **验证**：`dependfix fix --allow-major-upgrade --dry-run` 能识别跨线告警；不传 flag 时跨线告警进入人工处理。

### 8.4 基线红时的交付降级档位（`on-baseline-red`）

- **受影响对象**：目标仓库本身存在失败验证（基线红）、仍希望交付修复的使用者。
- **变更**：新增配置 `DEPENDFIX_ON_BASELINE_RED`（`RuntimeConfig.onBaselineRed`）/ Action input `on-baseline-red`，取值 `skip`（默认）/ `issue` / `draft`。默认 `skip` 与引入前逐字一致（记录审计 + 回滚，不交付）；`issue` 额外开 issue 追踪，`draft` 不回滚、以草稿 PR 交付。dry-run 一律按 `skip`；非法值 fail-fast。
- **迁移动作**：无强制动作。若过去因基线红「修复被静默丢弃」而困扰，显式设为 `issue` 或 `draft`。
- **验证**：`DEPENDFIX_ON_BASELINE_RED=draft pnpm run dev -- fix-and-pr`，报告 `deliverySkips[].carrier.mode` 为 `draft` 且 PR 为草稿状态。

### 8.5 `PRCheck.signalsJson` 存的是收敛后信号

- **受影响对象**：直接读平台库 `pr_check.signals_json`（或 `signalsJson` 字段）做外部统计 / 告警的消费者。
- **变更**：`signalsJson` 保存**收敛后的信号**——同一组键只保留最新一轮（被覆盖的旧轮次不保留）：`status` 的组键是 provider + context、`deployment` 是 provider + environment、`check` 额外要求**同一条 workflow run 血缘**（取详情链接里的 Actions run id，取不到时用 `sourceId` 作边界）——因此 `push` 与 `pull_request` 触发产生的两个同名 check 属于不同 run，**不会**互相合并。每条信号带 `roundAt` 用于判断轮次可比性，历史行（该列上线前采集）无 `roundAt`，按「不可比」处理。另提供 `overallStatus`（最坏派生状态）与 `failureSourcesJson`（失败源清单）供筛选直接消费。
- **迁移动作**：需要历史轮次的消费者改为自建快照（按 `last_polled_at` 增量落库）；读 `overallStatus` / `failureSourcesJson` 而非自行遍历全量信号。
- **验证**：对同一 PR 连续两轮采集后，`signalsJson` 中同组键只有一条且 `roundAt` 为最新轮次。
