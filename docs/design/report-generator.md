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
    /** 成功修复数 */
    alertsFixed: number
    /** 修复失败数 */
    alertsFailed: number
    /** 跳过的告警数（不可修复 + 超过阈值 + major 限制） */
    alertsSkipped: number
    /** lockfile 修复执行次数 */
    lockfileRepairs: number
    /** 验证通过次数 */
    verificationsPassed: number
    /** 验证失败次数 */
    verificationsFailed: number
}
```

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
    /** 修复后验证是否通过 */
    verificationPassed?: boolean
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
    /** 修复策略（lockfile-repair 专用） */
    strategy?: string
    /** 耗时（毫秒） */
    durationMs?: number
    /** lockfile diff 摘要（lockfile-repair 专用） */
    diff?: string
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

### 3.1 报告结构（6 节）

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
| Skipped | {n} |
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
| verification | owner/repo | lint+build | — | ❌ | 5.2s |

## Errors

| Repository | Stage | Category | Message |
|------------|-------|----------|---------|
| owner/repo | fix | RESOLVE_ERROR | No matching version found for foo@999 |
```

### 3.2 渲染规则

- **分组**：同一仓库的告警和动作聚合在一起，按仓库名称排序
- **状态图标**：成功 `✅` 失败 `❌` 跳过 `⏭️`
- **版本列**：仅 `dependency-upgrade` 动作显示 from/to 版本；lockfile-repair 显示 strategy^；verification 显示 `—`
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

## 5. 文件写入

### 5.1 函数签名

```typescript
/**
 * 写入 Markdown 和 JSON 报告到输出目录。
 * @returns 生成的两个 ReportArtifact
 */
export function writeReport(
    mdContent: string,
    jsonContent: string,
    runId: string,
    outputDir?: string,
): ReportArtifact[]
```

### 5.2 文件命名

```
{outputDir}/dependfix-report-{YYYYMMDD}-{runId}.md
{outputDir}/dependfix-report-{YYYYMMDD}-{runId}.json
```

- `date` 取 `startedAt` 的日期部分，格式 `YYYYMMDD`
- `runId` 截断到 8 字符避免路径过长
- 默认 `outputDir`：`./dependfix-reports`

### 5.3 输出目录行为

- 目录不存在 → 递归创建（`fs.mkdirSync` + `recursive: true`）
- 文件已存在 → 覆盖（报告幂等：同一次运行的多次生成结果一致）

### 5.4 ReportArtifact（已有，不变）

```typescript
// 沿用已有的 ReportArtifact 类型
interface ReportArtifact {
    format: 'markdown' | 'json'
    path: string
}
```

---

## 6. 与已有类型的映射关系

| 来源 | 输入类型 | 映射到 RunResult |
|---|---|---|
| T103 | `NormalizedSecurityAlert[]` | `RunResult.alerts[]` |
| T105 | `DependencyFixResult` | `FixAction { type: 'dependency-upgrade', ... }` |
| T106 | `LockfileRepairResult` | `FixAction { type: 'lockfile-repair', ... }` + `RepositoryResult.lockfileRepaired` |
| T107 | `VerificationResult` | `FixAction { type: 'verification', ... }` + `RepositoryResult.verificationPassed` |
| 运行时 | `RuntimeConfig` | `RunReportConfig`（排除 `githubToken`） |

### 6.1 映射函数（可选，视 T109 集成需要）

```typescript
/** 将 DependencyFixResult 转为 FixAction */
export function toFixAction(result: DependencyFixResult, repository: string): FixAction

/** 将 LockfileRepairResult 转为 FixAction */
export function lockfileRepairToFixAction(result: LockfileRepairResult, repository: string): FixAction

/** 将 VerificationResult 转为 FixAction */
export function verificationToFixAction(result: VerificationResult, repository: string): FixAction
```

这些映射函数定义在 `packages/core/src/report/mappers.ts`，供 T109 编排层调用。**不耦合 CLI 包**——参数通过接口传入而非直接依赖 CLI 类型。

---

## 7. 实现文件清单

| 文件 | 说明 |
|---|---|
| `packages/core/src/report/types.ts` | RunResult、RunSummary、RepositoryResult、FixAction、FixError、RunReportConfig |
| `packages/core/src/report/markdown-generator.ts` | `generateMarkdownReport(runResult): string` |
| `packages/core/src/report/json-generator.ts` | `generateJsonReport(runResult): string` |
| `packages/core/src/report/writer.ts` | `writeReport(mdContent, jsonContent, runId, outputDir?): ReportArtifact[]` |
| `packages/core/src/report/mappers.ts` | `toFixAction` / `lockfileRepairToFixAction` / `verificationToFixAction`（可选） |
| `packages/core/src/report/index.ts` | 更新导出，新增 re-export |

---

## 8. 测试策略

### 8.1 Markdown 生成器测试

| 场景 | 验证点 |
|---|---|
| 空 RunResult（0 告警、0 动作） | 所有节存在，表格数值为 0 |
| 含告警的 RunResult | Summary 表、Severity 表数值正确 |
| 含多仓库 | Repositories 节列出所有仓库，告警归属正确 |
| 含修复动作 | Fix Actions 表包含所有动作，类型列正确 |
| 含错误 | Errors 表列出所有错误 |
| 耗时格式化 | `< 1s` / `1.2s` / `2m 30s` 边界正确 |
| 空错误列表 | 不渲染 Errors 节 |
| major 升级标记 | Fix Actions 表中 isMajor=true 显示 "Yes" |

### 8.2 JSON 生成器测试

| 场景 | 验证点 |
|---|---|
| 正常 RunResult | `JSON.parse` 可解析，所有顶级键存在 |
| 空数组字段 | `repositories` / `alerts` / `actions` / `errors` 为空数组 `[]` |
| 包含日期字段 | `startedAt` / `finishedAt` 为 ISO 8601 字符串 |
| 不含 token | `config` 对象不包含 `githubToken` 键 |

### 8.3 文件写入测试

| 场景 | 验证点 |
|---|---|
| 写入默认目录 | 文件在 `./dependfix-reports/` 下 |
| 自定义目录 | 文件在指定路径下 |
| 目录自动创建 | 递归创建缺失的父目录 |
| 返回正确的 ReportArtifact | format / path 匹配 |

### 8.4 测试依赖

- `vitest`（已有）
- 无需 mock 外部服务（纯数据转换 + 文件写入）

---

## 9. 非目标 (Non-Goals)

- **不实现 HTML 报告**
- **不发送邮件通知**
- **不生成 PDF**
- **不引入第三方 Markdown 渲染库**（如 marked / remark）
- **不实现报告模板自定义**（M1 阶段固定模板）
- **不对标 GitHub 的 Markdown 渲染差异**（本地预览即可）
