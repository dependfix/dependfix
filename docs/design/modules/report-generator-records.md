# 报告生成 设计分片：落地细节与落地清单（report-generator.md §4-§9）

> 本分片自 [report-generator.md](./report-generator.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）；文中 `§N` 除显式标注文件路径者外，均指本分片或主文档的同名章节。

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
{outputDir}/dependfix-report-{YYYYMMDD}-{HHmmss}-{runId尾段}.md
{outputDir}/dependfix-report-{YYYYMMDD}-{HHmmss}-{runId尾段}.json
```

- `date` 取 `startedAt` 的日期部分，格式 `YYYYMMDD`
- `time` 取 `startedAt` 的时刻部分（UTC），格式 `HHmmss`；日期 + 时刻保证同目录内按文件名排序即按运行时间排序（字典序 == 时间序）
- `runId尾段` 取 runId 最后一个 `-` 分隔段（如 `dependfix-<ts>-<rand>` 中的随机段），最多 8 字符；无有效分隔段时取整个 runId 前 8 字符兜底
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
| T107 | `VerificationResult` | `FixAction { type: 'verification', ... }`（含 `preExisting`）+ `RepositoryResult.verificationPassed` / `verificationBlocking` |
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
| `packages/core/src/report/family.ts` | `collectFamilySummaries(actions)`：家族锁步摘要（报告 / PR 正文共用） |
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
| 家族锁步摘要 | 有成功且非 noOp 的 family 动作时渲染 Family Lockstep 段；多仓含 Repository 列、空 skipped 显示 `—`；回滚 / noOp 动作不渲染；`members ∩ skipped = ∅` |

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
