# 报告生成器设计

## 1. 设计目标

`generateMarkdownReport()` 和 `generateJsonReport()` 将一次 dependfix 运行的全量数据（告警、修复动作、验证结果、错误）渲染为可归档的 Markdown 和可机器解析的 JSON 报告。

核心原则：

- **同源数据，双格式输出**：Markdown 和 JSON 基于同一份 `RunResult`，不重复采集
- **Markdown 面向人**：分节、表格、可读摘要，适合贴到 PR 或存档
- **JSON 面向机器**：`JSON.stringify` 即可，无自定义序列化逻辑
- **零外部依赖**：不引入 marked / remark 等 Markdown 渲染库

---

## 2. 数据模型

### 2.1 RunResult（报告顶层容器）

```typescript
interface RunResult {
    /** 每次运行的唯一标识 */
    runId: string
    /** 运行开始时间（ISO 8601） */
    startedAt: string
    /** 运行结束时间（ISO 8601） */
    finishedAt: string
    /** 运行配置（不含 token 等敏感字段） */
    config: RunReportConfig
    /** 汇总统计 */
    summary: RunSummary
    /** 按仓库维度的明细 */
    repositories: RepositoryResult[]
    /** 原始告警列表 */
    alerts: NormalizedSecurityAlert[]
    /** 所有修复动作（扁平化） */
    actions: FixAction[]
    /** 所有错误记录 */
    errors: FixError[]
}

// 本表只列必填字段；可选段（ciAlignment / attemptTracking / prCheckWatch /
// alertOutcomes / supplyChainWarnings / alertsDisabled）见
// [data-model.md](data-model.md) 与 packages/core/src/report/types.ts。
```

### 2.2 RunReportConfig（配置子集，脱敏）

```typescript
interface RunReportConfig {
    /** 运行模式：'report-only' | 'fix' | 'fix-and-pr' */
    mode: string
    /** 严重级别阈值：'critical' | 'high' | 'medium' | 'all' */
    severityThreshold: string
    /** 目标仓库列表 */
    repositories: string[]
    /** 是否为 dry-run（不实际写入文件） */
    dryRun: boolean
    /** 是否准备创建 PR（fix-and-pr 模式） */
    createPullRequest: boolean
    /** 每仓库最大告警数 */
    maxAlertsPerRepository: number
}
```

### 2.3 RunSummary（汇总统计）

```typescript
interface RunSummary {
    /** 扫描仓库总数 */
    repositoriesScanned: number
    /** 总告警数 */
    alertsFound: number
    /** 可修复告警数 */
    alertsFixable: number
    /** 成功修复的 action 数（同包多告警可能共用一个 action） */
    alertsFixed: number
    /** 未修复告警数（告警级；converged 不计入；旧数据缺失时消费方回退近似公式） */
    alertsUnfixed: number
    /** 修复失败数 */
    alertsFailed: number
    /** 跳过的告警数（不可修复 / 子目录清单 / 跨大版本 / 保护名单） */
    alertsSkipped: number
    /** 已收敛（当前锁定版本已满足推荐版本，无需升级；不计入未修复） */
    alertsConverged: number
    /** 环境性失败事件数（不归因目标仓库：安装信号 / 超时 / 静默非零退出） */
    environmentalFailures: number
    /** 按原因分组的跳过计数（sum = alertsSkipped） */
    alertsSkippedByReason: Partial<Record<SkipReason, number>>
    /** 按严重级别分组的截断计数（sum = alertsTruncated） */
    alertsTruncatedBySeverity: Partial<Record<AlertSeverity, number>>
    /** lockfile 修复执行次数 */
    lockfileRepairs: number
    /** 验证通过次数 */
    verificationsPassed: number
    /** 验证失败次数 */
    verificationsFailed: number
}
```

完整字段（含 `alertsTruncated` / `reposWithAlertsDisabled`）以 `packages/core/src/report/types.ts` 为准；本节仅列关键字段。

### 2.4 RepositoryResult（仓库维度汇总）

```typescript
interface RepositoryResult {
    /** 仓库标识（owner/repo） */
    repository: string
    /** 默认分支 */
    defaultBranch: string
    /** 该仓库告警总数 */
    alertsCount: number
    /** 可修复数 */
    fixable: number
    /** 已修复数 */
    fixed: number
    /** 修复失败数 */
    failed: number
    /** 是否需要 lockfile 修复 */
    lockfileRepaired: boolean
    /** 修复后验证是否通过（原始口径：链路是否全绿） */
    verificationPassed?: boolean
    /** 是否存在**本次改动引入**的验证失败（决定是否回滚；既有基线失败不归因本次） */
    verificationBlocking?: boolean
    /** 验证被主动跳过（`budget` = 运行预算不足）：`undefined` + 该字段 = 未验证，不得渲染为通过 */
    verificationSkipped?: 'budget'
    /** 该仓库总处理耗时（毫秒） */
    durationMs: number
}
```

### 2.5 FixAction（修复动作记录）

```typescript
interface FixAction {
    /** 动作类型 */
    type: 'dependency-upgrade' | 'lockfile-repair' | 'verification'
    /** 所属仓库 */
    repository: string
    /** 目标（包名 / lockfile / 验证命令序列） */
    target: string
    /** 升级前版本（dependency-upgrade 专用） */
    fromVersion?: string
    /** 升级后版本（dependency-upgrade 专用） */
    toVersion?: string
    /** 是否为 major 升级 */
    isMajor?: boolean
    /** 是否成功 */
    success: boolean
    /** 失败原因 */
    error?: string
    /** 仅 verification 类型：该失败在修复前即存在（既有失败，不归因本次改动） */
    preExisting?: boolean
    /** 仅 lockfile-repair 类型：环境性安装失败（无 stderr 诊断），不归因本次改动 */
    environmentalFailure?: boolean
    /** 修复策略（lockfile-repair 专用） */
    strategy?: string
    /** 耗时（毫秒） */
    durationMs?: number
    /** lockfile diff 摘要（lockfile-repair 专用） */
    diff?: string
    /** 本次动作实际写盘的相对路径（交付提交据此与白名单取并集；不参与报告渲染） */
    changedPaths?: string[]
}
```

### 2.6 FixError（错误记录）

```typescript
interface FixError {
    /** 所属仓库 */
    repository: string
    /** 关联目标（包名或资源标识） */
    target?: string
    /** 发生阶段 */
    stage: 'fetch' | 'filter' | 'fix' | 'repair' | 'verify' | 'report'
    /** 分类标签（如 'CREDENTIAL_ERROR'、'RESOLVE_ERROR'） */
    category?: string
    /** 错误信息 */
    message: string
}
```

### 2.7 类型归属

所有新类型定义在 `packages/core/src/report/types.ts`，由 `packages/core/src/report/index.ts` 统一导出。

已有的 `ExecutionSummary`（M0 stub）保留不变，`RunSummary` 作为其超集独立定义。

---

## 3. Markdown 报告模板

### 3.1 报告结构（6 节 + 条件性 Skipped & Truncated / Repeated Failure Attempts / Family Lockstep）

> 条件性第 7 节 `Skipped & Truncated`（有跳过 / 截断 / 失败残差时渲染）见 [run-failure-taxonomy.md §5.8](../governance/run-failure-taxonomy.md#_5-8-跳过与截断披露)。

```
# dependfix Report

> **Run ID**: {runId}
> **Date**: {startedAt} → {finishedAt}
> **Mode**: {mode} (Severity ≥ {severityThreshold})

## Summary

| Metric | Count |
|--------|-------|
| Repositories scanned | {n} |
| Alerts found | {n} |
| Fixable | {n} |
| Fixed | {n} |
| Failed | {n} |
| Unfixed | {n} |
| Skipped | {n} |
| Converged | {n} |
| Truncated | {n} |
| Lockfile repairs | {n} |
| Verifications passed | {n} |
| Verifications failed | {n} |

## Alerts by Severity

| Severity | Found | Fixable | Fixed | Failed |
|----------|-------|---------|-------|--------|
| Critical | {n}   | {n}     | {n}   | {n}    |
| High     | {n}   | {n}     | {n}   | {n}    |
| Medium   | {n}   | {n}     | {n}   | {n}    |
| Low      | {n}   | {n}     | {n}   | {n}    |

## Repositories

### owner/repo (branch: main)

| Package | Severity | From | To | Major | Status |
|---------|----------|------|----|-------|--------|
| lodash  | HIGH     | ^4.17.20 | ^4.17.21 | No | ✅ Fixed |
| ...     | ...      | ...  | ... | ... | ... |

## Fix Actions

| Type | Repository | Target | Details | Success | Duration |
|------|------------|--------|---------|---------|----------|
| dependency-upgrade | owner/repo | lodash | 4.17.20 → 4.17.21 | ✅ | 2.3s |
| lockfile-repair | owner/repo | pnpm-lock.yaml | REGENERATE: +5/-3 lines | ✅ | 1.1s |
| verification | owner/repo | install+lint+build+typecheck+test | — | ❌ | 5.2s |
| verification | owner/repo | test | 既有失败（修复前即红，未归因本次改动） | ❌ | 4.8s |

## Errors

| Repository | Stage | Category | Message |
|------------|-------|----------|---------|
| owner/repo | fix | RESOLVE_ERROR | No matching version found for foo@999 |
```

### 3.2 渲染规则

- **分组**：同一仓库的告警和动作聚合在一起，按仓库名称排序
- **状态图标**：成功 `✅` 失败 `❌` 跳过 `⏭️`
- **Skipped & Truncated**：仅当存在跳过 / 截断 / 失败残差时渲染；旧 `summaryJson` 缺分组字段时按 `total - known` 补 `Other / unclassified`，不抛错
- **Repeated Failure Attempts**：仅当 `RunResult.attemptTracking` 非空时渲染（旧 JSON 缺字段不渲染、不抛错）；逐条展示 `repository / package / attempt key / 尝试序号 / 状态`（`attempt` / `forced (manual retry)` / `skipped (attempt limit)`）；序号 = 同键已关闭 PR 数 + 1，口径见 [pr-delivery-closure.md §6](../governance/pr-delivery-closure.md#_6-m48-3-同告警尝试指纹去重)
- **Delivery Skipped**：仅当 `RunResult.deliverySkips` 非空（基线红：修复后安装仍既有失败）时渲染；逐条展示仓库集 / 失败命令 / 降级载体（`issue #N (created|already exists)` / `draft PR #N` / `draft PR (this PR)` / `report only (skip)`），口径见 [pr-delivery-closure.md §16](../governance/pr-delivery-closure.md#_16-m51-4-基线红-安装失败的交付降级-2026-10-30)
- **版本列**：仅 `dependency-upgrade` 动作显示 from/to 版本；lockfile-repair 显示 strategy^；verification 显示 `—`，但**既有失败**（`FixAction.preExisting`，修复前即红、未归因本次改动）显示「既有失败（修复前即红，未归因本次改动）」
- **环境性安装失败**：`lockfile-repair` 与升级链（`dependency-upgrade`：成员 / 分组 / 拆组逐包 / 跨线）的环境性失败（`FixAction.environmentalFailure === true`）在 **Fix Actions 表的失败原因**（渲染自 `FixAction.error`，见 `markdown-generator.ts` 的 `actionDetails`）展示证据，形态按链路分两种：lockfile-repair 为「进程信号（如 `signal SIGKILL` / `exit code 1`）+ `diagnostics: <stderr+stdout 尾部>`（无诊断时 `no stderr/stdout diagnostics`）」；升级链为 `pnpm install failed: <根因提示>: <诊断>`（无诊断时 `no error detail`）。`environmentalFailure` 字段本身不被渲染器消费，仅作非归因标记（见 [pnpm-lockfile-fixer.md §2.4](./pnpm-lockfile-fixer.md) 与 [dependency-fixer-records.md §12.16](./dependency-fixer-records.md)）
- **Family Lockstep**：仅当存在**成功且非 noOp** 的家族锁步动作时渲染；按仓库 + 家族收敛（仓库级口径：根 / 成员 manifest 归并），`members` 取并集、`skipped` 剔除已写入成员（`members ∩ skipped = ∅`）；多仓库时增加 Repository 列
- **空数据处理**：
  - 无错误 → 不渲染 Errors 节
  - 无修复动作 → Fix Actions 表显示 `No fix actions performed.`
  - 无告警 → 不渲染 Alerts by Severity 节，Summary 表数值为 0
- **耗时格式化**：`< 1s` / `1.2s` / `2m 30s`

### 3.3 耗时格式化规则

| 耗时范围 | 格式 |
|---|---|
| < 1000ms | `< 1s` |
| 1s - 59s | `{n}s`（`Math.round(ms / 1000)`） |
| 60s - 3599s | `{min}m {sec}s` |
| ≥ 3600s | `{h}h {min}m` |

---

## 4. JSON 报告生成

### 4.1 实现

JSON 报告直接对 `RunResult` 调用 `JSON.stringify(runResult, null, 2)`。

不实现自定义序列化逻辑，原因：
- `RunResult` 已是纯数据结构（无函数、无循环引用）
- `NormalizedSecurityAlert`、`DependencyFixResult` 等依赖类型也是纯数据
- 所有字段已在定义阶段处理好脱敏（`RunReportConfig` 不含 token）

### 4.2 验证要点

- 生成的字符串必须可被 `JSON.parse` 解析
- 必须包含 `runId`、`startedAt`、`finishedAt`、`config`、`summary`、`repositories`、`alerts`、`actions`、`errors` 所有顶级键
- `repositories`、`alerts`、`actions`、`errors` 必须是数组（可为空数组）

---

## 分片索引（迁出章节）

| 分片 | 章节范围 | 主题 |
|:--|:--|:--|
| [report-generator-records.md](./report-generator-records.md) | §5 - §9 | 文件写入 / 类型映射 / 实现文件清单 / 测试策略 / 非目标 |
