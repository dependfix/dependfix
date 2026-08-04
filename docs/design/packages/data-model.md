# 数据模型

> 状态: ✅ 已落地（2026-08-05 修正——`AlertSource` 扩展 `'pnpm-audit'`、`FixStrategy` 增加 `override`，对齐当前实现）

## 标准化告警模型

内部统一使用 `NormalizedSecurityAlert` 模型，让过滤、修复、报告三层不依赖 GitHub 原始返回结构。

```typescript
interface NormalizedSecurityAlert {
  source: 'dependabot' | 'code-scanning' | 'pnpm-audit'  // pnpm-audit 为本地无 token 回退源（T-G2-4）
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
}
```

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
- `code-scanning`：Code Scanning alerts（GITHUB_TOKEN 可访问，M3 规划中，与 dependabot **并行**）
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
