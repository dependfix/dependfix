# 数据模型

> 状态: ✅ M20 已完成（2026-08-31）——ScanResult 已从"per-scan×per-alert"改为"per-alert"，新增 upstreamId / firstSeenAt / lastSeenAt / occurrenceCount / supersededAt 字段；详见 [archive/todo-archive-phases-m19-m21.md §M20](../../plan/archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构-m20-1-m20-3-m20-5-m20-6-m20-7-全部已闭环-2026-08-31-归档)
>
> ✅ 2026-10-30（M51.1）：`ScanResult.fixStatus` 不再是固定 `not-tried`——引擎报告新增 `alertOutcomes`，平台按同一键回写四态结果；见 [§告警级修复结果回写](#告警级修复结果回写-m51-1)
>
> 历史：✅ 2026-08-05 修正——`AlertSource` 扩展 `'pnpm-audit'`、`FixStrategy` 增加 `override`，对齐当前实现

## 标准化告警模型

内部统一使用 `NormalizedSecurityAlert` 模型，让过滤、修复、报告三层不依赖 GitHub 原始返回结构。

```typescript
interface NormalizedSecurityAlert {
  source: 'dependabot' | 'code-scanning' | 'pnpm-audit' | 'code-quality'  // pnpm-audit 为本地无 token 回退源
  repository: string
  defaultBranch: string
  severity: Severity                                     // 'critical' | 'high' | 'medium' | 'low' | 'unknown'
  packageEcosystem: string
  packageName: string
  manifestPath: string
  ruleId: string                                         // Dependabot=GHSA/CVE，Code Scanning=rule.id，pnpm-audit=advisory URL/ID
  summary: string
  htmlUrl: string
  fixable: boolean
  fixStrategy: FixStrategy | null                        // 'upgrade' | 'lock' | 'wait-upstream' | 'manual' | 'override'
  recommendedVersion: string
  dependencyType?: 'direct' | 'transitive'               // 缺少数据时为 undefined
  /**
   * 上游告警唯一标识符（M20 新增）。
   * 平台 ScanResult 用此作为去重键 + 唯一索引 `(repositoryId, upstreamId)`。
   * 规范化函数：`normalizeUpstreamId(source, raw)`（见 packages/core/src/alerts/upstream-id.ts）。
   * - dependabot: `dependabot:<alertNumber>`（GitHub numeric alert number）
   * - code-scanning: `code-scanning:<alertNumber>`
   * - pnpm-audit: `pnpm-audit:<packageName>:<sha256(advisoryId).slice(0,16)>`（pnpm 无数字 ID）
   * - code-quality: `code-quality:<findingId>`
   */
  upstreamId: string
}
```

### upstreamId 规范化（M20）

pnpm-audit 没有原生 numeric alert number，使用 `${packageName}:${sha256(advisoryId).slice(0,16)}` 稳定标识同一告警：

- `packageName`：避免同一 GHSA 影响多个包时混淆
- `sha256(advisoryId).slice(0,16)`：16 字符足够碰撞概率极低，且保持 ID 长度可控

其他 source 直接用上游 numeric ID，零变换。

## 平台 ScanResult 表（M20 升级后）

```typescript
@Entity('scan_result')
@Index('idx_scan_result_repo_upstream', ['repositoryId', 'upstreamId'], { unique: true })
@Index('idx_scan_result_repo_active', ['repositoryId', 'supersededAt'])  // 默认 query 高频路径
export class ScanResult extends BaseEntity {
    @Column({ type: 'varchar', length: 36 })
    repositoryId!: string  // 冗余 scanRun.repositoryId，便于索引（去重键第一段）

    @Column({ type: 'varchar', length: 36 })
    scanRunId!: string     // 最近一次看到该告警的 runId（语义从"扫描行"变为"追踪")

    @Column({ type: 'varchar', length: 128 })
    upstreamId!: string    // 唯一键第二段；规范化格式见上文

    // 生命周期字段
    @Column({ type: 'datetime' })
    firstSeenAt!: Date     // 首次发现时间

    @Column({ type: 'datetime' })
    lastSeenAt!: Date      // 最近一次发现时间（每次 reconcile 扫描成功后更新）

    @Column({ type: 'integer', default: 1 })
    occurrenceCount!: number  // 跨次扫描出现次数

    @Column({ type: 'datetime', nullable: true })
    supersededAt!: Date | null  // 上游已无此告警的时间；NULL = 活跃；fixStatus='success' 永不设

    // 告警属性（reconcile 时同步更新上游最新值）
    @Column({ type: 'varchar', length: 32 })  source!: string
    @Column({ type: 'varchar', length: 32 })  severity!: string
    @Column({ type: 'varchar', length: 255 }) packageName!: string
    @Column({ type: 'varchar', length: 500, nullable: true }) manifestPath!: string | null
    @Column({ type: 'varchar', length: 255, nullable: true }) ruleId!: string | null
    @Column({ type: 'text', nullable: true }) summary!: string | null
    @Column({ type: 'boolean', default: false }) fixable!: boolean
    @Column({ type: 'varchar', length: 32, nullable: true }) fixStrategy!: string | null
    @Column({ type: 'varchar', length: 100, nullable: true }) recommendedVersion!: string | null
    @Column({ type: 'varchar', length: 500, nullable: true }) htmlUrl!: string | null

    // 修复结果（与生命周期解耦——`success` 永不被 supersede 覆盖）
    @Column({ type: 'varchar', length: 32, default: 'not-tried' }) fixStatus!: string
    @Column({ type: 'text', nullable: true }) errorMessage!: string | null
}
```

### 关键不变量（M20 reconcile 维护）

1. **唯一性**：`UNIQUE (repositoryId, upstreamId)` 保证一个独立告警只存一行
2. **生命周期自动闭环**：reconcile 扫描完成后，上游消失的告警自动 `supersededAt = NOW()`
3. **修复成就保留**：`fixStatus='success'` 永不被 supersede（即使上游消失，该行保持 success）。
   注意：**活跃行**可被后续运行的新结论覆盖（含 `success` → `failed`），故 dashboard「已修复数」非单调——
   成就保证只作用于「上游消失」这一路径（告警级结果回写口径见 [alert-outcome-writeback.md](../governance/alert-outcome-writeback.md)）。
   由此 dashboard「活跃告警 / 按严重级别」与 `/api/alerts` 默认视图会把 `success` 行长期计入（本批首次生效，未调整活跃定义）
4. **跨次计数**：`occurrenceCount` 在每次 reconcile 时 +1；UI 直接显示，无需聚合

## 告警级修复结果回写（M51.1）

`fixStatus` 的取值由「固定 `not-tried`」改为「本次运行的真实结论」，以避免明细与引擎汇总各说一套。

### 报告契约（引擎 → 平台）

```typescript
// packages/core/src/report/alert-outcomes.ts
type AlertFixStatus = 'success' | 'converged' | 'failed' | 'skipped' | 'not-tried'

interface AlertFixOutcome {
  repository: string      // 告警所属仓库（owner/repo 或 local）
  source: AlertSource     // dependabot / code-scanning / code-quality / pnpm-audit
  upstreamId: string      // 引擎抓取侧注入（normalizeUpstreamId，per-repo 标识）
  manifestPath?: string | null
  status: AlertOutcomeStatus   // success | converged | failed | skipped（不含 not-tried）
  reason?: string         // failed 取动作 error；skipped 取 SKIP_REASONS 标识
}

interface RunResult {
  // ...
  /** 只列有结论的告警；缺键即 not-tried（存量 run 无该字段 ⇒ 行为与引入前一致） */
  alertOutcomes?: AlertFixOutcome[]
}
```

- **匹配键**：`(repository, source, upstreamId, manifestPath)`，两侧共用 `alertOutcomeKey`（分隔符 `\u0000`，`null`/`undefined` 等价）。`repository` 必需——`upstreamId` 是 **per-repo** 标识（两仓都会出现 `dependabot:42`），单次运行可处理多仓；`manifestPath` 消歧同号位的多清单实例。运行时按 `ALERT_OUTCOME_STATUSES`（4 值，不含 `not-tried`）白名单校验状态值（报告来自 JSON，未知值 / `not-tried` 不写库）。
- **产出优先级**（`buildAlertOutcomes`，高 → 低）：
  1. **修复链路的显式记录**（收敛 / 跨 major 跳过 / 清单分区跳过 / 不可修复）：`recordConvergedAlerts` / `recordSkippedAlerts` 写入，代表该**实例**的权威判定；
  2. `isAlertFixedByActions` → `success`（与 `alertsUnfixed` 同一谓词）；
  3. Code Scanning `noOp` **且无 `error`**（模板已应用、文件无改动）→ `converged`；带 `error` 的 `noOp`（无模板 / 路径越界等）不判已收敛；
  4. 同告警失败动作 → `failed`（排除 `environmentalFailure` / `preExisting` / `noOp` / AI 辅助动作；依赖升级的失败归因为**包级**，`FixAction` 无清单维度；Code Quality 不归因）；
  5. `override-protected` / `repeated-failure` 的 `noOp` 动作 → `skipped`；
  6. `fixable === false` → `skipped('not-fixable')`；
  7. 其余不落条目（`not-tried`）。

  显式记录优先于派生 `success` 的原因：包级成功谓词会把「同包另一清单已被主动跳过」的实例误判为已修复（如根清单 `vite` 升级成功、`docs/package.json` 的同一告警属子目录清单跳过），方向是 fail-open（少报未修复）。
- **可对账口径**：`converged` 明细数与 `RunSummary.alertsConverged` **逐条对齐**（两个收敛点用**同一数组**同时计数与记录）。`alertsSkipped` 是 **action 级**计数（同包多告警可能共用一个 `noOp` 动作），故 `skipped` 明细可多于该计数——不构成不一致，消费方勿据此对账。
- **触发前提**：`success` / `converged` / `failed` 只在修复链路（`fix` / `fix-and-pr`）产生；`report-only` 无修复动作，不可修复的告警仍以 `skipped('not-fixable')` 落条目（与运行模式无关），其余按缺键 `not-tried`（既有 `success` 行保持原值，不被 `report-only` 重置）。
- **报告体积**：只列非 `not-tried` 条目；`code-quality` findings 恒 `fixable=false`，会以 `skipped('not-fixable')` 落条目（条目本身极小，且平台据此展示「已跳过」而非「待处理」）；`fixable=true` 但无推荐版本的告警不落条目。

### 平台写入与下游影响

写回规则、优先级取舍与下游通知口径见 [alert-outcome-writeback.md](../governance/alert-outcome-writeback.md)。
本文件只固定数据契约：

| 场景 | `fixStatus` |
|:--|:--|
| 新行 | 本次结论；缺键 `not-tried` |
| 活跃行 + 有结论 | 本次结论（可覆盖 `success`） |
| 活跃行 + 无结论 | 保持原值 |
| 已 supersede 行 | 不参与（只读 `supersededAt IS NULL`） |
| `config.dryRun` | 不回写 |

## 严重级别映射

| Dependabot | Code Scanning | pnpm audit | 系统内部 |
|------------|---------------|------------|----------|
| critical   | —             | critical   | critical |
| high       | error         | high / error | high   |
| medium     | warning       | moderate / medium / warning | medium |
| low        | note          | low / info / note | low |
| —          | none          | 未识别     | unknown  |

## 告警数据源（2026-08-05 更新）

- `github-dependabot`：GitHub Dependabot alerts API（默认；需 PAT / GitHub App token，GITHUB_TOKEN 恒 403——G2 已处置）
- `code-scanning`：Code Scanning alerts（GITHUB_TOKEN 可访问，M3 已落地，与 dependabot **并行**；默认关闭，`--code-scanning` / `DEPENDFIX_CODE_SCANNING` / action `code-scanning` input 开启）
- `pnpm-audit`：本地 `pnpm audit --json` 回退（显式 `--alerts-source pnpm-audit`，与 GitHub 源**互斥**；详见 [pnpm audit fallback](./pnpm-audit-fallback.md)）

## 过滤模式

- `>= critical`
- `>= high`
- `>= medium`
- `all`

## 配置模型

```typescript
interface Config {
  mode: RunMode           // 'report-only' | 'fix' | 'fix-and-pr'
  severityThreshold: Severity
  repositories: string[]
  dryRun: boolean
  createPr: boolean
  maxAlertsPerRepo: number
  maxMajorUpgrades: number
}
```

## 修复规划模型

```typescript
interface FixPlan {
  steps: FixStep[]
}

interface FixStep {
  type: 'dependency-upgrade' | 'lockfile-repair' | 'code-scanning-fix'
  target: string
  strategy: string
  status: 'pending' | 'running' | 'success' | 'failed'
}
```

## 报告模型

```typescript
interface RunResult {
  runId: string
  startedAt: string
  finishedAt: string
  config: Config
  summary: RunSummary
  repositories: RepositoryResult[]
  alerts: NormalizedSecurityAlert[]
  actions: FixAction[]
  errors: FixError[]
  alertOutcomes?: AlertFixOutcome[]   // 告警级处置结果（M51.1）；只列有结论的告警
  // 其余可选段：ciAlignment / attemptTracking / prCheckWatch / supplyChainWarnings / alertsDisabled
}
```
