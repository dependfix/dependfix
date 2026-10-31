# 运行失败分类与筛选设计（设计先行稿）

> 状态：✅ 已落地（2026-10-07 —— 分类模型 + 落库回填 + API 筛选 + UI 展示全部实现；**§5.5 受约束重试入口已于 2026-10-16 落地**）
> 提出：2026-10-02（用户报告 —— 运行列表只显示「失败」，无法区分失败阶段；网络类失败可考虑重试，验证类失败需重点研判）
> 范围：`apps/platform`（实体 / API / UI）+ 可选 `packages/core` 分类常量；不改引擎修复逻辑
> 关联：[executor-sandbox.md §7.8 降级状态机契约](./executor-sandbox-implementation.md)、[platform.md](../../standards/platform.md)、`apps/platform/server/services/scan-run-state.ts`、`apps/platform/server/entities/scan-run.ts`

## 1. 背景与问题

`/scans`「全部运行」列表（`apps/platform/app/pages/scans.vue` 的 `runList`）状态列只展示粗粒度状态（执行中 / 已完成 / 失败 / 已派发 / 降级），失败原因藏在状态 Tag 的 `title` tooltip 与详情弹窗里。用户诉求：

1. 能按**成功 / 失败**筛选；
2. 失败能定位到**在哪一阶段失败**（告警获取 / clone / install / 修复 / 验证 / 交付 / 运行时 / 清理）；
3. 区分**可重试**（网络 / 环境类，如 clone 超时）与**需研判**（如 `VERIFICATION_FAILED` 可能意味着破坏性更新，必须人工确认）。

典型现象：2026-10-02 批量运行里多个仓库显示「失败」，但其中既有 clone/网络问题、也可能有验证门禁失败，UI 无法一眼区分。

## 2. 现状调研

### 2.1 状态与错误数据模型

| 字段 | 位置 | 现状 |
|:--|:--|:--|
| `ScanRun.status` | `entities/scan-run.ts` | `pending \| running \| completed \| failed \| dispatched \| degraded` |
| `ScanRun.errorJson` | 同上 | `{ code, message }`（执行级 / 派生错误） |
| `ScanRun.summaryJson` | 同上 | 业务汇总（告警数 / 已修复数等） |
| `RunResult.errors[]` | `packages/core/src/report/types.ts` | `{ repository, target?, stage, category?, message, source? }`（引擎侧业务错误） |

### 2.2 失败信息的三个来源

- **A. 执行器 `error.code`（平台侧，写入 `errorJson`）**：`clone_timeout` / `execution_timeout` / `execution_failed` / `push_failed` / `pr_creation_failed`（`container-executor.ts`）；`sandbox_unavailable`（`sandbox-executor.ts`）；`result_fetch_failed`（`scan-orchestrator.service.ts`）；`run_url_not_resolved` / `workflow_not_configured`（`action-trigger-executor.ts`）；`orchestration_failed`（编排 catch-all）。
- **B. 引擎 `RunResult.errors[].{stage, category}`（业务侧）**：`stage ∈ {fetch, filter, fix, repair, verify, report}`；`category` 见 §2.4。
- **C. 状态机派生（`scan-run-state.ts`）**：把引擎类别映射为平台错误码 `engine_delivery_failed` / `engine_exit_2`，并决定 `status`。

### 2.3 现状状态机（关键规则）

- 引擎交付阶段类别白名单 `ENGINE_DELIVERY_FAILED_CATEGORIES = {COMMIT_FAILED, PR_CREATION_FAILED, VERIFICATION_FAILED, ROLLBACK_FAILED, FATAL}` → 命中时 `status=failed` + `errorJson.code=engine_delivery_failed`。
- `pr_creation_failed`（分支已推、PR 失败）→ `status=dispatched`（副作用部分落地）。
- `degradedReason` + result 存在 → `status=degraded`（业务成功、路径偏离）。
- `exitCode=2` + result 存在 → `failed`（`engine_exit_2`）。
- 其余 `error && !result` → `failed`；否则 `completed`。
- **注意**：不在白名单内的引擎错误（如 `PROCESS_FAILED` / `FETCH_FAILED`）**不翻转状态**，可能表现为 `completed`。

### 2.4 已知错误码 / 类别清单

- **`FixError.category`（进 `RunResult.errors[]`）**：`FETCH_FAILED`、`DISCOVERY_FAILED`、`EMPTY_REPO_LIST`、`PROCESS_FAILED`、`FATAL`、`COMMIT_FAILED`、`PR_CREATION_FAILED`、`VERIFICATION_FAILED`、`ROLLBACK_FAILED`、`OVERRIDE_PROTECTED`、`PRE_EXISTING_FAILURE`、`SCRIPT_NOT_FOUND`、`network_violation`、`BRANCH_DELETE_FAILED`、`PR_CLOSE_FAILED`、`CLEANUP_DETECT_FAILED`、`CLEANUP_FAILED`、`ENVIRONMENT_ERROR`、`ROLLBACK_GRANULARITY_DEGRADED`（审计性降级，跳过类）、`BUDGET_EXHAUSTED`（2026-10-30 M51.5：运行预算不足 → 跳过未开始的工作；跳过类，不影响 exit code，`stage` 随检查点取 `verify` / `fix` / `repair`）、`FAMILY_LOCKSTEP_FAILED`（家族锁步解析 / peer / 非环境性写入失败，2026-10-24 M48.1）、`ABORTED`（2026-10-17 运行级取消：平台执行超时 / 运维中止后引擎协作式收尾；`stage: 'report'` + `repository: '*'`）。
- **`LockfileFailureCategory`（进 `FixAction.error` / lockfile 修复结果，非 `RunResult.errors[].category`；例外见下）**：`LOCKFILE_NOT_FOUND`、`MANIFEST_MISMATCH`、`LOCKFILE_VERSION_MISMATCH`、`CORRUPTED_LOCKFILE`、`CREDENTIAL_ERROR`、`RESOLVE_ERROR`、`MINIMUM_RELEASE_AGE`、`ENVIRONMENT_ERROR`、`ABORTED`（运行级取消：命令未启动即收尾，与环境性失败语义分离）、`UNKNOWN`。**例外**：`ENVIRONMENT_ERROR`（环境性安装失败，2026-10-13 M43.3）**同时**作为 `FixError.category` 发射（`stage: 'repair'` 于 lockfile 链 / `stage: 'fix'` 于升级链——成员 / 分组 / 拆组逐包 / 跨线 / 多版本 / 合批，进 `RunResult.errors[]`；非归因，见 §4.3），供平台侧细分归因为 `install` + `transient`。
- `ARCHIVE_FAILED` 仅出现在测试夹具（生产无发射点），不纳入分类映射。
- `FixError.stage` 类型含 `fetch | filter | fix | repair | verify | report`，但当前生产发射点仅见 `fetch` / `fix` / `repair` / `verify` / `report`（`repair` 为 2026-10-13 M43.3 新增的 `ENVIRONMENT_ERROR` 发射点，升级链同类别走 `fix`；`filter` 无发射点）。
- GitHub 错误码（`packages/core/src/errors/error-codes.ts`）：`AUTHENTICATION_FAILED`、`PERMISSION_DENIED`、`ALERTS_DISABLED`、`RATE_LIMITED`、`REPO_NOT_FOUND`、`GITHUB_API_ERROR`、`NETWORK_ERROR`。

### 2.5 API / UI 现状

- `GET /api/runs`（`server/api/runs/index.get.ts`）query 仅 `repositoryId` / `ids` / `page` / `pageSize`，**无状态或失败阶段过滤**。
- `GET /api/scan-history/summary` 提供 `byStatus` 六态计数 + 按仓库聚合，**无阶段维度**。
- `scans.vue` 无筛选控件；状态列只渲染 Tag，失败细节靠 tooltip / 详情弹窗。
- **无「重试」入口**：失败后需到仓库页重新触发扫描。

### 2.6 缺口小结

| 缺口 | 说明 |
|:--|:--|
| G1 无筛选 | 列表无法按成功 / 失败 / 阶段筛 |
| G2 状态语义过载 | `failed` 同时表示网络 / 环境 / 验证 / 交付失败，处置方式完全不同 |
| G3 分类碎片化 | 执行器 code、引擎 category、GitHub code 三套并存，无单一事实源 / 无 UI 可读阶段 |
| G4 无处置建议 | 无「可重试 vs 需研判」信号，也无重试入口 |
| G5 历史不可查 | 既有记录只有非结构化 `errorJson`，无 `failureStage` 可筛 |

## 3. 目标与非目标

**目标**

- 统一失败分类模型：`failureStage`（阶段）+ `failureKind`（处置建议：可重试 / 需研判 / 未知）。
- 列表支持按状态 / 失败阶段筛选；状态列呈现失败阶段；汇总计数扩展到阶段维度。
- 失败记录可提供受约束的**重试**入口（仅 transient）——**已落地**（2026-10-16，见 §5.5：端点 / 守卫 / 入口与二次确认）。
- 分类逻辑单一事实源 + 可单测；历史记录可回填（无法判定则 `unknown`）。

**非目标**

- 不改引擎的修复与验证逻辑，不改跨 major 保护语义。
- 不引入新的执行后端；不改鉴权 / 组织隔离。
- 不追求 100% 精确归因（无信息时显式 `unknown`，不猜测）。

## 4. 分类模型（提案）

### 4.1 `failureStage`（阶段，面向 UI）

| stage | 含义 | 典型来源 |
|:--|:--|:--|
| `source` | 告警获取 / 仓库发现 | `FETCH_FAILED` / `DISCOVERY_FAILED` / `EMPTY_REPO_LIST` / GitHub `RATE_LIMITED` / `NETWORK_ERROR` / `AUTHENTICATION_FAILED` / `PERMISSION_DENIED` / `ALERTS_DISABLED` / `REPO_NOT_FOUND` |
| `clone` | 仓库克隆 | `clone_timeout`（git clone 失败 / 超时） |
| `install` | 依赖安装 / lockfile 修复 | `ENVIRONMENT_ERROR`（环境性安装失败，2026-10-13 M43.3 新增发射点；**非归因**——见 §4.3）；其余 lockfile 失败落在 `FixAction.error`（`LockfileFailureCategory`，**不**进 `result.errors`，经失败动作计入 exit code） |
| `fix` | 修复应用 | `PROCESS_FAILED`、`OVERRIDE_PROTECTED`、`FAMILY_LOCKSTEP_FAILED` |
| `verify` | 验证门禁 | `VERIFICATION_FAILED`、`PRE_EXISTING_FAILURE`、`SCRIPT_NOT_FOUND`、`network_violation`、验证命令超时 |
| `deliver` | commit / push / PR 交付 | `COMMIT_FAILED`、`push_failed`、`PR_CREATION_FAILED`、`pr_creation_failed`、`ROLLBACK_FAILED` |
| `runtime` | 执行器 / 编排 / 环境 | `execution_timeout`、`execution_failed`、`sandbox_unavailable`、`orchestration_failed`、`engine_exit_2`、`ABORTED`（防御性映射）、`FATAL` |
| `cleanup` | 分支 / PR 清理（best-effort） | `BRANCH_DELETE_FAILED`、`PR_CLOSE_FAILED`、`CLEANUP_*` |
| `unknown` | 无法判定 | `engine_delivery_failed` 无细分、缺失信息 |

> **实现期补充映射**（完整权威表见 `apps/platform/server/services/run-failure-classify.ts` 的 `FAILURE_CODE_MAP`，未命中的码一律归 `unknown`）：`workflow_not_configured` → `runtime` + `deterministic`；`enqueue_failed` / `orphan_run` → `runtime` + `transient`；`force_failed` / `SCAN_PENDING_MERGED` → `runtime` + `deterministic`；`supersede_failed` → `cleanup` + `unknown`；`engine_delivery_failed`（message 无法细分类别时）→ `unknown` + `deterministic`。

### 4.2 `failureKind`（处置建议）

| kind | 含义 | 处置 |
|:--|:--|:--|
| `transient` | 网络 / 限流 / 环境临时问题 | 可一键重试 |
| `deterministic` | 确定性失败（破坏性更新 / 配置 / 权限 / 交付） | 需人工研判，**禁止**无脑重试 |
| `unknown` | 信息不足 | 人工查看详情 |

### 4.3 映射要点

- `VERIFICATION_FAILED` → `verify` + `deterministic`：升级后验证链失败（可能破坏性更新），需重点研判；**不提供一键重试**。
- `UNEXPECTED_CHANGES` / `NO_CHANGES` → `deliver` + `deterministic`：交付提交集合不合法（存在未声明的已跟踪改动 / 只有生成物与未跟踪文件）→ 远程未落地，需人工清理工作区后重跑（口径见 [pr-delivery-closure.md §7](./pr-delivery-closure.md#_7-m48-4-提交面白名单与-yaml-定点编辑)）。两者均进 `scan-run-state` 的引擎交付失败类别，不误判 `completed`。
- `PRE_EXISTING_FAILURE` → `verify` + `deterministic`：修复前基线即红，非本次引入（已有 `FixAction.preExisting` 信号可复用）。
- `network_violation` → `verify` + `deterministic`：执行期外联审计命中黑名单（验证链外联违规），需研判；不提供一键重试。
- `engine_exit_2` → `runtime` + `deterministic`（进程级全仓库失败 / 全量回滚）。
- `ENVIRONMENT_ERROR` → `install` + `transient`（环境性安装失败：被信号杀死 / 超时 / 静默非零退出；可重试）。引擎侧已标记为**非归因**（`SKIPPED_AUDIT_CATEGORIES` + `FixAction.environmentalFailure`）→ 不驱动 `status=failed`、不参与 exit code，故该映射在当前编排路径上**不可达**（`failed` 分支的 `errorJson` 恒有值），保留为防御性映射（同表 `EMPTY_REPO_LIST` / `SCRIPT_NOT_FOUND` 同类）；保留目的是「内部回退读 `result.errors` 的路径一旦被改动而变得可达时，该信号仍应落 `install` + 可重试」而非 `runtime` + `engine_exit_2`。
- `BUDGET_EXHAUSTED` → `runtime` + `transient`（运行预算不足 → 主动跳过未开始的工作，可重试）。同属**防御性映射**：引擎侧在跳过类白名单内，正常路径不驱动 `status=failed`。
- `ABORTED` → `runtime` + `transient`（运行级取消：平台执行超时 / 运维中止后引擎协作式收尾，可重试）。同 `ENVIRONMENT_ERROR` 属**防御性映射**：超时由执行器以 `execution_timeout` 记录（`errorJson` 优先），本项保留目的是「内部回退读 `result.errors` 的路径一旦可变更达时，该信号应落 `runtime` + 可重试」而非 `engine_exit_2`（后者是「所有仓库失败」的笼统码，会掩盖"被中止"这一事实）。引擎侧该类别**不**进跳过类清单（计非零退出码，避免"被中止"与"跑完了"外观不可区分）。
- `engine_delivery_failed` → 按 `errorJson.message` 中的 `（${category}）` 细分到具体 stage / kind；无法解析时 `unknown` + `deterministic`。
- `clone_timeout` / `execution_timeout` / `sandbox_unavailable` / `NETWORK_ERROR` / `RATE_LIMITED` / `result_fetch_failed` / `run_url_not_resolved` → `transient`（`execution_timeout` 置信度较低，可标 `unknown` 或 `transient`，见开放问题）。
- `push_failed` → `deliver` + `unknown`（可能是网络，也可能是权限；细分需看 message，见开放问题）。
- `pr_creation_failed`（status=dispatched）→ `deliver` + `deterministic`：分支已推、PR 未建，需人工/重试交付。
- `OVERRIDE_PROTECTED` / `EMPTY_REPO_LIST` / `SCRIPT_NOT_FOUND` / `AUTHENTICATION_FAILED` / `PERMISSION_DENIED` / `ALERTS_DISABLED` / `REPO_NOT_FOUND` → `deterministic`（配置 / 权限）。
- GitHub `GITHUB_API_ERROR` → `source` + `unknown`。

## 5. 落地方案

### 5.1 计算位置（二选一）

- **选项 A：读取时派生**（无 schema 变更）。在 API 层用纯函数 `classifyRunFailure(status, errorJson, result/summaryJson)` 计算。优点：零迁移、向后兼容；缺点：无法 SQL 索引过滤、逻辑散落读路径。
- **选项 B：落库（推荐）**。在 run 终结时（`scan-orchestrator.service.ts` 调用 `resolveScanRunState` 之后）计算并写入新列；历史行由迁移回填（可判定则填，否则 `unknown`）。优点：可索引 / 可聚合 / 稳定可审计；缺点：需迁移 + 回填。
- **已采纳（M37.1 实现期）：选项 B 落库**，三列均落库（§7 决策收敛）。落点覆盖全部失败写路径：orchestrator（状态机决策 + catch-all）/ batch-executor（去重合并 / 入队失败）/ stale-cleanup（孤儿清理）/ scan.post（**仅「新建路径的孤儿 pending run」去重合并落库**；复用既有终态 run 的去重合并**不落失败**——既有 run 记录保持不变、仅回应「已合并」提示）/ force-fail（admin 强终）。

### 5.2 数据模型（已落地）

`ScanRun` 新增（均可空，兼容存量）：

- `failure_code` varchar(64)：归一化后的原始码 / 类别（便于审计）。
- `failure_stage` varchar(32)：见 §4.1。
- `failure_kind` varchar(16)：`transient | deterministic | unknown`。
- 保留 `errorJson`（message 与向后兼容）。

迁移 `2200000000000-AddScanRunFailureColumns`（前缀感知 + 幂等）；不建索引（单组织 run 量级小，summary 窗口上限 500 下顺序扫描成本可忽略，且避免与基线元数据驱动索引同名漂移）。

### 5.3 API 扩展（已落地）

- `GET /api/runs` 增加 `status`（多值）/ `failureStage`（多值）/ `failureKind` query，参与 `where`；响应 `items[]` 增加 `failureStage` / `failureKind` / `failureCode`。多值取值为逗号分隔，非法枚举值返回 400。
- `GET /api/scan-history/summary` 的 `byStatus` 之外增加 `byFailureStage`（受同一时间窗约束）；`repositories[]` 增加 `lastFailureStage`（与 `lastStatus` 同源）。

### 5.4 UI（`scans.vue` runList）（已落地）

- 运行列表上方筛选条：状态下拉 + 失败阶段下拉 + 处置建议下拉 +「清除筛选」。
- 阶段分布计数：`byFailureStage` 非零项以标签行展示（与阶段下拉同源口径）。
- 状态列：`failed` 且有阶段时显示「失败 · {阶段}」（如「失败 · 验证门禁」「失败 · 仓库克隆」），tooltip 保留 message。
- byRepo「最近状态」同步阶段口径（`lastFailureStage`）。
- i18n：zh-CN / en-US 双侧新增 `runs.failureStage.*` / `runs.failureKind.*` / `scans.runList.filter*` 键。

### 5.5 重试语义与安全边界

- **仅 `transient`** 提供一键重试；`deterministic`（尤其 `verify` / `deliver`）不提供，必须进详情人工研判。
- **端点（2026-10-16 落地，取代本段原「复用 scan 端点」设想）**：`POST /api/runs/[id]/retry`（写操作限 admin/org_admin）。
  前端**只传 runId**：新运行的 `mode` / `severityThreshold` / `executorKind` 由服务端按来源运行派生，
  来源 run id 写入新列的 `retriedFromRunId`（`scan_run.retried_from_run_id` varchar(64) NULL，迁移 `2400000000000-AddScanRunRetriedFromRunId`，
  已登记进 DataSource `migrations` 数组）；入队 / 同仓库去重合并 / 入队失败降级同步复用
  `services/scan-trigger.service`（与 `POST /api/repos/[id]/scan` 同一路径，避免两条触发链漂移）。
- **守卫（前端不可见 ≠ 后端可绕过）**：来源运行须已终态（`pending` / `running` → 409 `RUN_RETRY_SOURCE_RUNNING`）
  且 `failureKind === 'transient'`（`deterministic` / `unknown` / 成功态 → 409 `RUN_RETRY_NOT_ALLOWED`）；
  同仓库存在进行中任务时按既有「已合并」语义回应（响应顶层 `merged`，前端提示合并且不跳转）；
  来源运行的持久化参数无法通过请求校验（历史脏值）时同样 409 拒绝并落 warn 留痕（不静默降级、不 500）。
  凭据仍走原有 credential service（重试不新增凭据通道）。
- **入口与二次确认（2026-10-16 落地）**：入口落在**运行详情弹窗**（`app/components/run-detail-dialog.vue`），
  仅 `failureKind === 'transient'` 呈现；点击后二次确认（文案提示将按原参数重新入队、占用扫描队列与容器资源）。
  弹窗内同屏展示失败归因（失败阶段 / 处置建议 / 失败码）与来源链（`retriedFromRunId`）。
  前端状态机与合并感知见 `app/composables/use-run-retry.ts`（与 `use-fix-now` 同模式：四态分离 + 5s 自动清除）。
- **不做**：批量重试；非 `transient` 的「强制重试」逃生舱；自动 / 定时重试。
- **已知边界**：① AI 研判 override 不随 `ScanRun` 落库（仅落 `ai_config_snapshot`），故重试时按仓库 / 组织默认重新解析
  （与「以原持久化参数重新入队」的边界一致）；② 入口当前仅在运行详情弹窗——`/scans` 失败历史视图的详情由
  `repo-history-dialog.vue` 自带实现，若要在该视图加入口需先统一详情组件（登记为后续候选）；③ 来源链当前**仅展示一跳**（`retriedFromRunId` 显示上一跳短 id，不做 A→B→C 链式溯源与跳转）。

### 5.6 迁移与回填

- 新增列迁移（TypeORM）；回填脚本按历史 `errorJson.code` / `summaryJson` / `RunResult.errors` 尽力推断 `failure_stage` / `failure_kind`，无法判定写 `unknown`。
- 回填为**幂等**且可 dry-run（对齐 `db:backfill` 既有脚本模式）。

### 5.7 运行结果可信度与未修复口径

- **落库**：`scan_run.exit_code`（integer NULL）保存引擎进程级退出码（0 / 1 / 2）；**仅在执行器产出 result 时落库**——无 result 的执行器合成码 2（超时 / 容器不可用 / 交付失败）不是引擎进程码，不落库；B 模式（github-action）的 0 / 2 是触发受理哨兵，编排层不传递；旧数据为 NULL。`scan_run.environmental_failure_count`（integer NULL）保存 `RunSummary.environmentalFailures` 快照；**无 result 或 result 缺 summary 时为 NULL**，与「0 次环境性失败」区分。映射单一事实源 `scan-run-state.ts#resolveScanRunOutcome`；`reuse=true` 时两列随 `summaryJson` 一并清空。
- **不归因**：环境性失败由 `computeSummary` 按 `FixError.category === 'ENVIRONMENT_ERROR'` 的审计条目计数（不按 action 的 `environmentalFailure` 标记重复计数），不计入 `alertsFailed`、不驱动 `status=failed`、不参与 exit code；运行即使 `completed` 也可显示「环境性失败 N」，tooltip 必须说明「不归因本次运行但可见」。
- **未修复告警**：UI 优先读 `alertsUnfixed`（告警级 canonical，逐条 `isAlertFixedByActions` 判定）；旧 summary 缺 `alertsUnfixed` 字段时回退 `alertsFound − alertsFixed − alertsConverged`（action 级近似，下限 0）。`converged`（本地已满足）不计入，`failed` / `skipped` / 不可自动修复计入。截断告警不在 `alertsFound` 内，由 §5.8 的 `alertsTruncatedBySeverity` 单独披露。
- **结果缺失**：`failed` / `completed` / `degraded` 且 `summaryJson` 为空，或 `error.code === 'execution_timeout'` → UI 显示「结果缺失」，不展示「告警 0」；该 run 不参与告警明细 reconcile（`failed` 分支既有契约）。
- **覆盖边界**：计数只覆盖已落 `ENVIRONMENT_ERROR` 的路径（lockfile 诊断 / 多版本 / 合批 / 成员 / 常规分组与拆组逐包 / 跨线——2026-10-23 M47.3 已把升级链四条消费点接入，见 [dependency-fixer-records.md §12.16](../modules/dependency-fixer-records.md)）。本字段已进入 `RunResult` JSON，CLI Markdown / PR 正文摘要表暂未新增行（平台可见性为本条目范围）。
- **迁移与降级**：迁移 `2600000000000-AddScanRunOutcomeColumns` 幂等（前缀感知 + 列缺失才 ALTER）；旧数据两列为 NULL，API 原样返回 NULL，UI 按 0 / 结果缺失降级，不抛错。

### 5.8 跳过与截断披露

- **数据模型**：`RunSummary.alertsUnfixed` 为告警级未修复数（逐条 `isAlertFixedByActions` 判定，converged 不计入；不能直接用 `alertsFixed` action 数做减法）。`RunSummary.alertsSkippedByReason` 按 `subdirectory-manifest` / `cross-major` / `not-fixable` / `override-protected` / `repeated-failure` 分组，满足 `sum(values) === alertsSkipped`；`RunSummary.alertsTruncatedBySeverity` 按 `critical` / `high` / `medium` / `low` / `unknown` 分组，满足 `sum(values) === alertsTruncated`。枚举唯一源为 `SKIP_REASONS` / `ALERT_SEVERITIES`；所有累加点经 `addSkipped` / `addTruncatedBySeverity`，禁止直接自增。
- **累加点**：`repo-fix.ts` 的子目录 / 根直接依赖 lockfile 桶 → `subdirectory-manifest`；跨大版本人工 review（含收敛判定后的低实例残留）→ `cross-major`；常规链路不可自动修复 / 缺推荐版本 → `not-fixable`；`override-protect.ts` 命中保护名单 → `override-protected`；`app/repeated-failure.ts` 的尝试上限命中 → `repeated-failure`（判定在安装与验证之前，读取失败 fail-open，口径见 [pr-delivery-closure.md §6](./pr-delivery-closure.md#_6-m48-3-同告警尝试指纹去重)）。`limitAlerts` 丢弃集合在 fix / report 两条抓取路径统一按 severity 累计。
- **展示口径**：UI 详情显示 `未修复 X / 总数 Y · 截断 Z（未评估）· 跳过 W`，其中 `Y = alertsFound + alertsTruncated`、`X` 取 `alertsUnfixed`；分组 chips 固定顺序。列表只显示紧凑总数。PR 正文与 Markdown 报告输出 `Not Fixed / Skipped` 表，含跳过原因、截断严重级别与 `Failed / other not fixed` 残差；`Unfixed` 的分子分母按「已评估告警」表述，截断明确标注未评估。
- **旧数据降级**：缺分组字段时按 `total - sum(known)` 补 `other` 行，不抛错且总数不丢；分组和大于总数时不再补 `other`（分组优先，异常数据原样展示）。
- **不做什么**：不改跳过策略 / 跨 major 判定 / `allowMajorUpgrade`；不改 PR 指纹与去重；截断告警不伪造逐条明细，只披露分组计数。

### 5.9 基线完整链与单元回滚粒度（M46.3）

- **基线完整链**：修复前基线采样不再首失败即停，`install → lint → build → typecheck → test` 各段独立记录；`pnpm test` 的 `No tests found` 与工具链缺失按「同命令基线失败」豁免，不归因本次改动。修复后验证仍首失败即停（交付链语义不变）。
- **单元回滚**：默认 `rollbackGranularity=unit`。依赖修复单元开始前记录工作树 checkpoint，成功时保留为可回退基线；最终验证存在本次引入失败时，回退最近单元并重跑一次完整验证，通过则保留更早 probe 并交付。重验仍失败时记 `ROLLBACK_GRANULARITY_DEGRADED`（跳过类审计，不影响 exit code），再由门禁执行整仓回滚。
- **逃生开关**：`--rollback-granularity=repo` / `DEPENDFIX_ROLLBACK_GRANULARITY=repo` 恢复整仓回滚；`preExistingDirty` 保护面不变。
- **映射**：`ROLLBACK_GRANULARITY_DEGRADED` → `verify` + `deterministic`（审计性降级，非失败动作；用于解释「为何回退粒度退回整仓」）。

### 5.10 执行资源与 OOM 归因（M46.4）

- `scan_run` 新增 `memory_max_bytes` / `peak_rss_bytes` / `oom_killed` / `resource_json`（迁移 `2800000000000-AddScanRunResourceColumns`，前缀感知 + 幂等）。
- 采集口径：Linux cgroup v2 `memory.max` / `memory.current` / `memory.events`，回退 v1 `memory/memory.limit_in_bytes` / `memory.usage_in_bytes` / `memory.oom_control`；`peak_rss_bytes` 是执行窗口 `memory.current` 采样峰值（含页缓存），不是单进程 RSS。
- `oom_killed` 三态：true = 执行前后 `oom_kill` 计数增加；false = 计数可读且未增加；**null = 不可采集**。非 Linux / 无 cgroup / B 模式 / sandbox 未接入 → null + `resource_json.degradedReason`，不伪造 0 / false。
- 归因边界：cgroup `oom_kill` 只覆盖容器限额触发的 OOM；宿主级 OOM（未设容器 memory limit）不保证被捕获。`resource_json.sigkillDetected` 仅表示引擎错误文本出现 SIGKILL，**不单独断言 OOM**；引擎自身安装 / 验证超时也会产生 `signal SIGKILL, timed out`，需结合宿主 `journalctl -k` 与峰值 / 上限判断。
- API `GET /api/runs` / `GET /api/runs/[id]` 返回三列与解析后的 `resource`；运行详情展示内存上限 / 峰值 / OOM 标记，不可采集时显示「不可采集」+ 原因 tooltip。

### 5.11 构建版本回执（M47.2）

- **问题**：日志缺行时无法区分「线上构建旧（代码路径不存在）」与「代码路径未覆盖（数据为空）」——两者表现都是「没有这一行」，靠猜。故每次运行落一份「由哪个部署产物受理 / 执行」的回执。
- **落库**：`scan_run.build_version` / `build_commit`（varchar(64) NULL，迁移 `2900000000000-AddScanRunBuildColumns`，前缀感知 + 幂等）。**业务写入路径创建的新 run 两列不会是 null**：构建期未注入时写 `unknown`（e2e fixtures 端点直接建行、属测试专用写入，不在此承诺内）；**存量行为 NULL**（不回填），UI 按「未知」降级。
- **取值单一事实源**：`runtimeConfig.buildVersion` / `buildCommit`（与 `/api/health`、平台启动 `[build]` 行同源，来自镜像构建期 `--build-arg BUILD_VERSION/BUILD_COMMIT`；口径见 [platform.md](../../standards/platform.md) §10.7）。服务端经 `server/utils/run-build-info.ts#resolveRunBuildStamp` 读取，取不到 `useRuntimeConfig`（非 Nitro 运行时的脚本 / 单测）时回退 `unknown`，**不阻断 run 创建**。
- **写入点与刷新语义**：`createPendingScanRun`（入队即落库，pending 阶段即可看受理产物）与 `runScanInternal` 的同步新建路径；队列续跑 / `reuse=true` 复用路径**随本次执行进程刷新**——跨部署续跑时记录当前构建，而不是最初入队者。
- **执行者口径（重要边界）**：`container` / `sandbox` 模式下两列即**实际执行者**的构建；`github-action`（B 模式）模式下引擎跑在目标仓库的 Actions runner，本列记录的是**受理 / 派发本次 run 的平台构建**——真实执行镜像需结合 `executor_kind` 与 Actions 侧版本核对，UI 文案与 tooltip 不得读成「Actions 镜像版本」。
- **引擎侧**：同一个值经 `RuntimeConfig.buildVersion/buildCommit` 透传，`DependfixApp.run()` 在 `Starting dependfix run` 之前输出 `[build] dependfix version=… commit=… source=…`（`app/build-info.ts`）。`source=host` 表示「值来自宿主运行时配置」（平台缺省值即字符串 `unknown`，也归此类——它代表宿主没注入真值，而不是引擎包版本）；`source=engine-package` 表示宿主未提供任何值、回退引擎自身 `package.json` 版本（CLI / MCP；该版本号与 CLI 产品版本可能不同号，故必须带来源标记）。commit 无宿主注入时固定 `unknown`。
- **消费面**：`GET /api/runs/[id]` 返回 `buildVersion` / `buildCommit`；运行详情弹窗（`run-detail-dialog.vue`）以「构建版本：`<version> · <短 commit>`」展示，`unknown` / null 统一显示「未知」+ tooltip 说明（诊断信息缺失不是错误态）。`/scans` 的详情（`repo-history-dialog.vue`）本批不渲染该字段（UI 面收敛，与 §5.5「重试入口只在运行详情弹窗」同族边界）；该视图的 `container` 执行 run 仍可从日志区 `[build]` 行读到同一事实——`github-action` 与存量 run 无该日志行，不承诺兜底。
- **有意不动**：`GET /api/runs` 列表与 `scan-trigger.serializeScanRun` 的响应白名单不改（避免第二个事实源）；后续若在列表 / 触发响应展示，需同批扩展白名单并补等值断言。`sandbox` 执行器当前只回显最小 `RunResult`、不启动引擎，故无 `[build]` 行；其落库值仍是平台构建，启用真实引擎执行时需补 `buildVersion/buildCommit` 透传。
- **不做什么**：不做部署回执（Jenkins webhook / 镜像推送对齐）；不回填历史 run；不把版本塞进 `summaryJson`（独立列，契约不变）；不改 exit code / 交付判定。

## 6. 验收标准（草案 → 实现结果）

- [x] `classifyRunFailure` 纯函数 + 单测覆盖全部已知 code / category（含 `unknown` 兜底）——`server/services/run-failure-classify.ts` + 全映射表逐码用例。
- [x] 迁移 + 回填（幂等 + dry-run）；存量 `failed` / `dispatched` 行尽力回填——`2200000000000-AddScanRunFailureColumns.ts` + `scripts/backfill-run-failure.ts`（默认 dry-run、`--apply` + y/N、无法判定写 `unknown`）。
- [x] `/api/runs` 过滤参数生效且与分页组合正确；组织隔离不回退——`status` / `failureStage` / `failureKind` 多值 query（白名单校验，非法值 400）。
- [x] `scans.vue` 筛选控件 + 状态列阶段展示 + 汇总计数；i18n 双侧一致——`scans.runList.filter*` + `runs.failureStage.*` / `runs.failureKind.*`（zh-CN / en-US）。
- [x] 重试入口仅对 `transient` 可见可用；非终态不可重试——**已落地**（2026-10-16）：`POST /api/runs/[id]/retry` + 详情弹窗入口 + 后端三重守卫，见 §5.5。
- [x] 文档同步 + Review Gate Pass。

## 7. 风险与开放问题

- **已决策（M37.1 / 2026-10-06）**：`failure_code` / `failure_stage` / `failure_kind` 三列均落库，以支持 SQL 筛选与后续重试入口；策略变更经回填脚本重算。
- **已决策（M37.1 实现期）**：`execution_timeout` 归 `runtime` + `transient`（大仓库 / 慢网络可重试；真实挂死场景由人工在详情研判）。
- **已决策（M37.1 实现期）**：`push_failed` 保持 `deliver` + `unknown`，不解析 message 区分网络 / 权限（解析脆弱，交人工）。
- **已决策（M37.1 实现期）**：`dispatched`（PR 创建失败 / 结果未就绪）纳入失败分类——`pr_creation_failed` → `deliver` + `deterministic`；`result_fetch_failed` / `run_url_not_resolved` → `runtime` + `transient`。`degraded`（业务完成 + 路径偏离）**不**参与失败分类；`dispatched` 且**无任何错误码**（B 模式已受理待回执）亦不分类，避免把进行中的派发记录混入 `byFailureStage.unknown`。
- **风险**：分类漂移（新错误码未纳入映射）→ 用集中映射表 + `unknown` 兜底 + 单测守护；未映射码保留 `code` 供审计。
- **风险**：回填误判 → 仅做保守推断，无法判定一律 `unknown`（引擎 `result.errors` 未落库，细分依赖 `engine_delivery_failed` message 回读）。
- **风险**：重试被滥用 → 仅 transient + 审计来源 + 非终态守卫（**入口已落地，缓解措施随之生效**，见 §5.5）。

## 8. 关联文档

- [executor-sandbox.md §7.8 降级状态机契约](./executor-sandbox-implementation.md)
- [platform.md](../../standards/platform.md)
- [M45.4](../../plan/todo-archive.md)（受约束重试入口落地条目）
- [M37](../../plan/archive/todo-archive-phases-m37.md#m37-运行可观测性与体验记忆-m37-1-m37-6-全部已闭环-2026-10-08-归档)（M37.1 已闭环归档）
