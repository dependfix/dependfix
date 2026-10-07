# 运行失败分类与筛选设计（设计先行稿）

> 状态：✅ 已落地（2026-10-07 —— 分类模型 + 落库回填 + API 筛选 + UI 展示全部实现；§5.5 受约束重试入口仍延后并登记 backlog）
> 提出：2026-10-02（用户报告 —— 运行列表只显示「失败」，无法区分失败阶段；网络类失败可考虑重试，验证类失败需重点研判）
> 范围：`apps/platform`（实体 / API / UI）+ 可选 `packages/core` 分类常量；不改引擎修复逻辑
> 关联：[executor-sandbox.md §7.8 降级状态机契约](./executor-sandbox.md)、[platform.md](../../standards/platform.md)、`apps/platform/server/services/scan-run-state.ts`、`apps/platform/server/entities/scan-run.ts`

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

- **`FixError.category`（进 `RunResult.errors[]`）**：`FETCH_FAILED`、`DISCOVERY_FAILED`、`EMPTY_REPO_LIST`、`PROCESS_FAILED`、`FATAL`、`COMMIT_FAILED`、`PR_CREATION_FAILED`、`VERIFICATION_FAILED`、`ROLLBACK_FAILED`、`OVERRIDE_PROTECTED`、`PRE_EXISTING_FAILURE`、`SCRIPT_NOT_FOUND`、`network_violation`、`BRANCH_DELETE_FAILED`、`PR_CLOSE_FAILED`、`CLEANUP_DETECT_FAILED`、`CLEANUP_FAILED`。
- **`LockfileFailureCategory`（进 `FixAction.error` / lockfile 修复结果，非 `RunResult.errors[].category`）**：`LOCKFILE_NOT_FOUND`、`MANIFEST_MISMATCH`、`LOCKFILE_VERSION_MISMATCH`、`CORRUPTED_LOCKFILE`、`CREDENTIAL_ERROR`、`RESOLVE_ERROR`、`MINIMUM_RELEASE_AGE`、`UNKNOWN`。
- `ARCHIVE_FAILED` 仅出现在测试夹具（生产无发射点），不纳入分类映射。
- `FixError.stage` 类型含 `fetch | filter | fix | repair | verify | report`，但当前生产发射点仅见 `fetch` / `fix` / `verify` / `report`（`filter` / `repair` 无发射点）。
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
- 失败记录可提供受约束的**重试**入口（仅 transient）——**本阶段延后**（见 §5.5）。
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
| `install` | 依赖安装 / lockfile 修复 | 当前**无 `FixError` 发射点**：lockfile 失败落在 `FixAction`（`LockfileFailureCategory`）；需新增落库信号才能填充（见 §5.1） |
| `fix` | 修复应用 | `PROCESS_FAILED`、`OVERRIDE_PROTECTED` |
| `verify` | 验证门禁 | `VERIFICATION_FAILED`、`PRE_EXISTING_FAILURE`、`SCRIPT_NOT_FOUND`、`network_violation`、验证命令超时 |
| `deliver` | commit / push / PR 交付 | `COMMIT_FAILED`、`push_failed`、`PR_CREATION_FAILED`、`pr_creation_failed`、`ROLLBACK_FAILED` |
| `runtime` | 执行器 / 编排 / 环境 | `execution_timeout`、`execution_failed`、`sandbox_unavailable`、`orchestration_failed`、`engine_exit_2`、`FATAL` |
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
- `PRE_EXISTING_FAILURE` → `verify` + `deterministic`：修复前基线即红，非本次引入（已有 `FixAction.preExisting` 信号可复用）。
- `network_violation` → `verify` + `deterministic`：执行期外联审计命中黑名单（验证链外联违规），需研判；不提供一键重试。
- `engine_exit_2` → `runtime` + `deterministic`（进程级全仓库失败 / 全量回滚）。
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
- **已采纳（M37.1 实现期）：选项 B 落库**，三列均落库（§7 决策收敛）。落点覆盖全部失败写路径：orchestrator（状态机决策 + catch-all）/ batch-executor（去重合并 / 入队失败）/ stale-cleanup（孤儿清理）/ scan.post（去重合并）/ force-fail（admin 强终）。

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
- 重试 = 复用 `POST /api/repos/[id]/scan` 以原参数重新入队，并记录来源（如 `retriedFromRunId`）以便审计。
- 守卫：非终态（`running` / `pending`）不允许重试；同仓库并发去重；凭据仍走原有 credential service。

### 5.6 迁移与回填

- 新增列迁移（TypeORM）；回填脚本按历史 `errorJson.code` / `summaryJson` / `RunResult.errors` 尽力推断 `failure_stage` / `failure_kind`，无法判定写 `unknown`。
- 回填为**幂等**且可 dry-run（对齐 `db:backfill` 既有脚本模式）。

## 6. 验收标准（草案 → 实现结果）

- [x] `classifyRunFailure` 纯函数 + 单测覆盖全部已知 code / category（含 `unknown` 兜底）——`server/services/run-failure-classify.ts` + 全映射表逐码用例。
- [x] 迁移 + 回填（幂等 + dry-run）；存量 `failed` / `dispatched` 行尽力回填——`2200000000000-AddScanRunFailureColumns.ts` + `scripts/backfill-run-failure.ts`（默认 dry-run、`--apply` + y/N、无法判定写 `unknown`）。
- [x] `/api/runs` 过滤参数生效且与分页组合正确；组织隔离不回退——`status` / `failureStage` / `failureKind` 多值 query（白名单校验，非法值 400）。
- [x] `scans.vue` 筛选控件 + 状态列阶段展示 + 汇总计数；i18n 双侧一致——`scans.runList.filter*` + `runs.failureStage.*` / `runs.failureKind.*`（zh-CN / en-US）。
- [ ] （本阶段延后）重试入口仅对 `transient` 可见可用；非终态不可重试——登记 backlog §候选评估中。
- [x] 文档同步 + Review Gate Pass。

## 7. 风险与开放问题

- **已决策（M37.1 / 2026-10-06）**：`failure_code` / `failure_stage` / `failure_kind` 三列均落库，以支持 SQL 筛选与后续重试入口；策略变更经回填脚本重算。
- **已决策（M37.1 实现期）**：`execution_timeout` 归 `runtime` + `transient`（大仓库 / 慢网络可重试；真实挂死场景由人工在详情研判）。
- **已决策（M37.1 实现期）**：`push_failed` 保持 `deliver` + `unknown`，不解析 message 区分网络 / 权限（解析脆弱，交人工）。
- **已决策（M37.1 实现期）**：`dispatched`（PR 创建失败 / 结果未就绪）纳入失败分类——`pr_creation_failed` → `deliver` + `deterministic`；`result_fetch_failed` / `run_url_not_resolved` → `runtime` + `transient`。`degraded`（业务完成 + 路径偏离）**不**参与失败分类；`dispatched` 且**无任何错误码**（B 模式已受理待回执）亦不分类，避免把进行中的派发记录混入 `byFailureStage.unknown`。
- **风险**：分类漂移（新错误码未纳入映射）→ 用集中映射表 + `unknown` 兜底 + 单测守护；未映射码保留 `code` 供审计。
- **风险**：回填误判 → 仅做保守推断，无法判定一律 `unknown`（引擎 `result.errors` 未落库，细分依赖 `engine_delivery_failed` message 回读）。
- **风险**：重试被滥用 → 仅 transient + 审计来源 + 非终态守卫（入口延后，风险当前不适用）。

## 8. 关联文档

- [executor-sandbox.md §7.8 降级状态机契约](./executor-sandbox.md)
- [platform.md](../../standards/platform.md)
- [backlog.md](../../plan/backlog.md)（受约束重试入口延后登记）
- [todo-archive.md §M37](../../plan/todo-archive.md#m37-运行可观测性与体验记忆m371m376-全部已闭环--2026-10-08-归档)（M37.1 已闭环归档）
