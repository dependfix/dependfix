# 数据模型

## 标准化告警模型

内部统一使用 `NormalizedSecurityAlert` 模型，让过滤、修复、报告三层不依赖 GitHub 原始返回结构。

```typescript
interface NormalizedSecurityAlert {
  source: 'dependabot' | 'code-scanning'
  repository: string
  defaultBranch: string
  severity: Severity
  packageEcosystem: string
  packageName: string
  manifestPath: string
  ruleId: string
  summary: string
  htmlUrl: string
  fixable: boolean
  fixStrategy: FixStrategy
  recommendedVersion: string
}
```

## 严重级别映射

| Dependabot | Code Scanning | 系统内部 |
|------------|---------------|----------|
| critical   | —             | critical |
| high       | error         | high     |
| medium     | warning       | medium   |
| low        | note          | low      |

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
