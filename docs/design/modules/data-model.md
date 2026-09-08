# 数据模型

> 状态: ✅ M20 已完成（2026-08-31）——ScanResult 已从"per-scan×per-alert"改为"per-alert"，新增 upstreamId / firstSeenAt / lastSeenAt / occurrenceCount / supersededAt 字段；详见 [todo-archive.md §M20](../../plan/todo-archive.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)
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
3. **修复成就保留**：`fixStatus='success'` 永不被 supersede（即使上游消失，dashboard "已修复数" 不减少）
4. **跨次计数**：`occurrenceCount` 在每次 reconcile 时 +1；UI 直接显示，无需聚合

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
}
```
