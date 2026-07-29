# T103 设计稿：Dependabot 告警采集

> 对应任务: [T103 接入 Dependabot Alerts 拉取](../plan/todo.md#t103-接入-dependabot-alerts-拉取)
>
> **依赖**: T102（GitHub 客户端）已完成，T004（告警模型）已完成
>
> **选型结论**: 通过 T102 封装的 `Octokit` 实例调用 `octokit.paginate()` 分页拉取 `GET /repos/{owner}/{repo}/dependabot/alerts`，将原始 Dependabot API 响应映射为 `NormalizedSecurityAlert`。M1 采用全量拉取策略（每次运行拉取所有 `state=open` 的告警），不做增量标记。

---

## 1. 设计目标

- 为单仓库拉取所有 `state=open` 的 Dependabot 告警，输出标准化告警列表
- 完成 Dependabot API 字段到 `NormalizedSecurityAlert` 的语义映射
- 自动处理分页：`per_page=100`，通过 `octokit.paginate()` 自动合并多页
- 异常场景统一通过 T102 的 `mapGitHubError()` 转为 `AppError`
- 纯函数设计，无副作用（不写文件、不修改全局状态）

---

## 2. 调用 API

### 2.1 端点

| 项目 | 值 |
|------|-----|
| Octokit 方法 | `octokit.rest.dependabot.listAlertsForRepo` |
| HTTP | `GET /repos/{owner}/{repo}/dependabot/alerts` |
| 分页 | `octokit.paginate()` 自动翻页 |
| 每页条数 | `per_page: 100` |
| 状态过滤 | `state: 'open'` |

### 2.2 参数

```typescript
const rawAlerts = await octokit.paginate(
    octokit.rest.dependabot.listAlertsForRepo,
    {
        owner: 'foo',
        repo: 'bar',
        state: 'open',
        per_page: 100,
    },
)
```

### 2.3 Dependabot Alert 原始响应类型

> 完整类型定义见 `@octokit/openapi-types` 中的 `components["schemas"]["dependabot-alert"]`

关键字段（下方为映射所需字段，完整类型省略无关字段）：

```typescript
type DependabotAlert = {
    number: number                              // 告警编号（alert-number）
    state: 'auto_dismissed' | 'dismissed' | 'fixed' | 'open'
    dependency: {
        package?: {
            ecosystem: string                   // 如 'npm', 'pip', 'maven'
            name: string                        // 如 'lodash', 'express'
        }
        manifest_path?: string                  // 如 'package.json', 'requirements.txt'
        scope?: 'development' | 'runtime' | null
        relationship?: 'unknown' | 'direct' | 'transitive' | null
    }
    security_advisory: {
        ghsa_id: string                         // 如 'GHSA-xxxx-xxxx-xxxx'
        cve_id: string | null                   // 如 'CVE-2024-1234'
        summary: string
        description: string
        severity: 'low' | 'medium' | 'high' | 'critical'
        vulnerabilities: Array<{
            package: { ecosystem: string; name: string }
            severity: 'low' | 'medium' | 'high' | 'critical'
            vulnerable_version_range: string    // 如 '>= 1.0.0, < 1.2.3'
            first_patched_version: { identifier: string } | null
        }>
        // ... 省略 cvss, cwes, identifiers, references, published_at 等
    }
    security_vulnerability: {
        package: { ecosystem: string; name: string }
        severity: 'low' | 'medium' | 'high' | 'critical'
        vulnerable_version_range: string
        first_patched_version: { identifier: string } | null
    }
    html_url: string
    // ... 省略 created_at, updated_at, dismissed_*, fixed_at 等
}
```

#### 字段说明

| 字段 | 说明 | 必填 |
|------|------|:---:|
| `number` | GitHub 告警 ID（数字，非全局唯一） | 是 |
| `state` | 告警状态（open / fixed / dismissed / auto_dismissed） | 是 |
| `dependency.package.ecosystem` | 包系统生态（npm / pip / maven 等） | 否 |
| `dependency.package.name` | 包名 | 否 |
| `dependency.manifest_path` | 依赖清单文件路径 | 否 |
| `security_advisory.ghsa_id` | GitHub Security Advisory ID | 是 |
| `security_advisory.summary` | 咨询摘要 | 是 |
| `security_advisory.severity` | 严重级别（low / medium / high / critical） | 是 |
| `security_vulnerability.first_patched_version` | 首个修复版本（含 `identifier` 字段），无修复则为 `null` | 是 |
| `security_vulnerability.vulnerable_version_range` | 受影响版本范围 | 是 |

---

## 3. 核心接口设计

### 3.1 函数签名

```typescript
// packages/cli/src/github/dependabot-fetcher.ts

import type { Octokit } from '@octokit/rest'
import type { NormalizedSecurityAlert } from '@dependfix/core'

export interface FetchDependabotAlertsParams {
    /** 仓库所属组织或用户 */
    owner: string
    /** 仓库名称 */
    repo: string
    /** 告警状态过滤，M1 只拉 `open` */
    state?: 'open' | 'fixed' | 'dismissed' | 'auto_dismissed'
    /** 每页数量，默认 100（最大值） */
    perPage?: number
}

/**
 * 拉取指定仓库的 Dependabot 告警并映射为标准化模型。
 *
 * - 自动分页，返回所有匹配的告警
 * - 仅处理 `state=open` 的告警（可通过参数覆盖）
 * - 异常通过 `mapGitHubError` 转为 `AppError`
 *
 * @param client  - 已认证的 Octokit 实例（来自 T102 `createGitHubClient`）
 * @param params  - 仓库标识与过滤参数
 * @returns 标准化告警列表（空仓库返回 `[]`，不抛异常）
 */
export async function fetchDependabotAlerts(
    client: Octokit,
    params: FetchDependabotAlertsParams,
): Promise<NormalizedSecurityAlert[]>
```

### 3.2 与 T102 的接口约定

```
T102 (client.ts)                T103 (dependabot-fetcher.ts)
┌──────────────────┐           ┌──────────────────────────┐
│ createGitHubClient│───► Octokit ───► fetchDependabotAlerts │
│   (factory)      │   (实例)  │   (纯函数)                 │
└──────────────────┘           │                          │
                               │  调用 octokit.paginate() │
T102 (errors.ts)               │  调用 mapGitHubError()   │
┌──────────────────┐           │  调用 normalizeAlert()  │
│ mapGitHubError   │◄──────────┤                          │
│   (错误映射)     │  复用     └──────────────────────────┘
└──────────────────┘
```

- T103 不创建 Octokit 实例 —— 由调用方注入
- T103 不重新实现错误映射 —— 复用 `mapGitHubError`
- Octokit 类型完全来自 `@octokit/rest`，dependabot-fetcher.ts 不手写 Dependabot API 类型

### 3.3 设计决策

| 决策 | 理由 |
|------|------|
| 不手写 `DependabotAlert` 接口 | 类型完全来自 `@octokit/openapi-types`（通过 `@octokit/rest` 推导），避免同步滞后 |
| 不判断仓库是否存在 | 由 T102 `createGitHubClient` 调用方负责；`dependabot-fetcher` 只管拉取告警 |
| 空告警不抛异常 | 返回 `[]`，由上层过滤/报告层判断是否为"无告警" |
| 不做增量标记 | M1 单仓库每次全量拉取 `open` 告警，GitHub 侧 `state` 即为真实状态 |

---

## 4. 字段映射

### 4.1 映射表

| NormalizedSecurityAlert | 来源字段 | 映射逻辑 | 默认值/兜底 |
|--------------------------|---------|---------|-------------|
| `id` | `alert.number` | 直接取值 | — |
| `source` | — | 固定 `'dependabot'` | — |
| `repository` | 调用参数 | `\`${owner}/${repo}\`` | — |
| `defaultBranch` | — | M1 不在此层获取，传空字符串，由上层调用 `octokit.rest.repos.get` 后填入 | `''` |
| `severity` | `alert.security_advisory.severity` | 直接取值（`'critical' \| 'high' \| 'medium' \| 'low'`） | — |
| `packageEcosystem` | `alert.dependency.package?.ecosystem` | 直接取值 | `'unknown'` |
| `packageName` | `alert.dependency.package?.name` | 直接取值 | `'unknown'` |
| `manifestPath` | `alert.dependency.manifest_path` | 直接取值 | `''` |
| `ruleId` | `alert.security_advisory.ghsa_id` | 直接取值 | — |
| `summary` | `alert.security_advisory.summary` | 直接取值 | — |
| `htmlUrl` | `alert.html_url` | 直接取值 | — |
| `fixable` | `alert.security_vulnerability.first_patched_version` | `!== null` → `true`，否则 `false` | `false` |
| `fixStrategy` | `alert.security_vulnerability.first_patched_version` | 非 null → `'upgrade'`，否则 `null` | `null` |
| `recommendedVersion` | `alert.security_vulnerability.first_patched_version?.identifier` | 直接取值 | `''` |

### 4.2 映射代码示意

```typescript
function normalizeAlert(
    alert: DependabotAlert,
    owner: string,
    repo: string,
): NormalizedSecurityAlert {
    const firstPatched = alert.security_vulnerability.first_patched_version
    const fixable = firstPatched !== null

    return {
        id: alert.number,
        source: 'dependabot',
        repository: `${owner}/${repo}`,
        defaultBranch: '',                                      // M1 上层填入
        severity: alert.security_advisory.severity,
        packageEcosystem: alert.dependency.package?.ecosystem ?? 'unknown',
        packageName: alert.dependency.package?.name ?? 'unknown',
        manifestPath: alert.dependency.manifest_path ?? '',
        ruleId: alert.security_advisory.ghsa_id,
        summary: alert.security_advisory.summary,
        htmlUrl: alert.html_url,
        fixable,
        fixStrategy: fixable ? 'upgrade' : null,
        recommendedVersion: firstPatched?.identifier ?? '',
    }
}
```

### 4.3 Severity 映射

Dependabot severity 值 `'critical' | 'high' | 'medium' | 'low'` 与 `AlertSeverity` 类型完全对齐，直接透传，无需转换。

（Code Scanning 的 `error/warning/note/none` 四值映射在 `packages/core/src/alerts/index.ts` 的 `mapCodeScanningSeverity` 中处理，T301 时调用。）

### 4.4 `fixable` 与 `fixStrategy` 判定逻辑

```
first_patched_version !== null
    ├── true  → fixable: true,  fixStrategy: 'upgrade', recommendedVersion: identifier
    └── false → fixable: false, fixStrategy: null,       recommendedVersion: ''
```

**边界情况**：

| 场景 | 表现 | 处理 |
|------|------|------|
| `first_patched_version` 为 `null` | 无可升级版本 | `fixable: false`，交由报告层标注"需人工研判" |
| `first_patched_version.identifier` 为 major 版本跨越大 | `recommendedVersion: '3.0.0'`（例） | 不在此层判断 major 升级风险，由 T105 修复器负责安全校验 |
| `security_advisory.vulnerabilities` 包含多个版本范围 | `security_vulnerability` 为当前依赖的具体匹配项，优先使用它而非数组第一个元素 | 使用 `security_vulnerability`，不遍历 `vulnerabilities[]` |
| `dependency.package` 为 `undefined` | `packageName` / `packageEcosystem` 兜底为 `'unknown'` | 不抛异常，允许后续过滤/报告层处理 |

---

## 5. 数据流

```
createGitHubClient({ token })
        │
        ▼
  Octokit 实例
        │
        ▼
fetchDependabotAlerts(client, { owner, repo })
        │
        ├─► octokit.paginate(listAlertsForRepo, { owner, repo, state: 'open', per_page: 100 })
        │       │
        │       ├─► 成功 → DependabotAlert[]
        │       │       │
        │       │       └─► map(normalizeAlert) → NormalizedSecurityAlert[]
        │       │
        │       └─► 失败 → mapGitHubError(error, context)
        │                        │
        │                        └─► throw AppError(code, message, details)
        │
        └─► 返回 NormalizedSecurityAlert[]
```

### 5.1 调用链（M1 完整上下文）

```typescript
// 伪代码：未来 T109 CLI 入口
const octokit = createGitHubClient({ token })
const { data: repo } = await octokit.rest.repos.get({ owner, repo })
const defaultBranch = repo.default_branch

const alerts = await fetchDependabotAlerts(octokit, { owner, repo })

// 填补 defaultBranch
const enriched = alerts.map(a => ({ ...a, defaultBranch }))
```

### 5.2 `defaultBranch` 获取策略

| 阶段 | 方案 | 理由 |
|------|------|------|
| M1 | 调用方（T109 CLI 入口）调用 `octokit.rest.repos.get` 获取，再注入到告警列表 | `dependabot-fetcher` 保持单一职责（只拉告警），不额外请求仓库 API |
| M2+ | 若后续需要在大批量场景减少 API 调用，可在此函数内部用 `repos.get` 获取并在内部注入 | 性能优化，不影响接口契约 |

---

## 6. 拉取策略（M1：全量拉取）

### 6.1 策略说明

- 每次调用拉取 **所有** `state=open` 的告警
- 不做增量标记（不记录"上次已处理到第几条"）
- 不存储处理状态（每个 run 独立、无状态）

### 6.2 为什么 M1 不需要增量

| 理由 | 说明 |
|------|------|
| 调用频率低 | M1 为手动触发（`dependfix report/fix --repo`），不是定时任务 |
| 告警数量小 | 单仓库 Dependabot open 告警通常 < 100 条 |
| 状态由 GitHub 维护 | 修复后的告警 GitHub 侧自动变为 `fixed`，下次 run 不会拉取 |
| 避免状态管理复杂度 | 无状态设计简化实现和测试 |

### 6.3 增量扩展点（M3+）

M3 若需要定时运行并区分"新增告警"和"已有告警"：

- 利用 `sort: 'created'` + `direction: 'asc'` 按创建时间排序
- 利用 `created` 参数过滤 `created>=上次运行时间`（GitHub API 支持 `since` 语义但 Dependabot alerts 端点目前不直接支持 `since` 参数，可用 `sort` + `direction` + 客户端截断替代）
- 实现时机：M4 多仓库或 M6 平台定时扫描

---

## 7. 异常处理

### 7.1 错误来源与映射

所有异常统一通过 T102 `mapGitHubError(error, context)` 转为 `AppError`。`context` 参数包含仓库标识。

| 场景 | HTTP 状态码 | `AppError.code` | 触发条件 |
|------|:---:|------|------|
| Token 无效或过期 | 401 | `AUTHENTICATION_FAILED` | `RequestError` + status 401 |
| 限流 | 403 | `RATE_LIMITED` | `RequestError` + status 403 + `X-RateLimit-Remaining: 0` |
| Token 无 `dependabot_alerts:read` 权限 | 403 | `PERMISSION_DENIED` | `RequestError` + status 403（非限流） |
| 仓库不存在 | 404 | `REPO_NOT_FOUND` | `RequestError` + status 404 |
| GitHub API 内部错误 | 4xx/5xx | `GITHUB_API_ERROR` | `RequestError` + 其他状态码 |
| 网络不可达 | — | `NETWORK_ERROR` | 非 `RequestError`（DNS 失败、超时等） |

### 7.2 调用方错误处理示例

```typescript
try {
    const alerts = await fetchDependabotAlerts(octokit, { owner: 'foo', repo: 'bar' })
    // 处理告警...
} catch (error) {
    if (error instanceof AppError) {
        // 根据 error.code 决定：跳过仓库、终止运行、记录日志
        logger.error({ code: error.code, repository: 'foo/bar' }, error.message)
    }
    // 继续处理下一个仓库或向上抛
}
```

### 7.3 `context` 格式约定

```
`fetch dependabot alerts for ${owner}/${repo}`
```

示例：`'fetch dependabot alerts for facebook/react'`

---

## 8. 测试策略

### 8.1 单元测试（`packages/cli/src/github/dependabot-fetcher.test.ts`）

使用 `nock` 拦截 HTTP 层，复用 T102 已引入的 `nock` 依赖（不新增 devDep）。

#### 测试场景

| # | 场景 | nock 配置 | 验证 |
|---|------|----------|------|
| 1 | 正常拉取 2 条告警 | `.reply(200, fixture: 2 alerts)` | 返回 `NormalizedSecurityAlert[]`，长度 2 |
| 2 | 字段映射正确性 | `.reply(200, fixture: 1 alert)` | 逐一验证 `id`/`severity`/`packageName`/`fixable`/`fixStrategy`/`recommendedVersion` 等 12 个字段 |
| 3 | `first_patched_version` 不为 null → fixable=true | `.reply(200, fixture: fixable alert)` | `fixable: true`, `fixStrategy: 'upgrade'` |
| 4 | `first_patched_version` 为 null → fixable=false | `.reply(200, fixture: non-fixable alert)` | `fixable: false`, `fixStrategy: null` |
| 5 | 空仓库无告警 | `.reply(200, [])` | 返回 `[]`，不抛异常 |
| 6 | 分页多页 | `.reply(200, page1, { Link: next })` + `.reply(200, page2)` | 返回合并后的完整列表 |
| 7 | 401 认证失败 | `.reply(401)` | 抛 `AppError('AUTHENTICATION_FAILED')` |
| 8 | 403 限流 | `.reply(403, {}, { 'x-ratelimit-remaining': '0' })` | 抛 `AppError('RATE_LIMITED')` |
| 9 | 403 权限不足 | `.reply(403)` | 抛 `AppError('PERMISSION_DENIED')` |
| 10 | 404 仓库不存在 | `.reply(404)` | 抛 `AppError('REPO_NOT_FOUND')` |
| 11 | `dependency.package` 缺失 | `.reply(200, fixture: missing package)` | `packageName: 'unknown'`, `packageEcosystem: 'unknown'` |
| 12 | `manifest_path` 缺失 | `.reply(200, fixture: missing manifest)` | `manifestPath: ''` |

### 8.2 静态 Fixture（`packages/cli/src/github/__fixtures__/dependabot-alerts.json`）

提供至少 5 条真实 Dependabot API 响应样例（与 T901 共享同一 fixture 文件）：

| # | 覆盖场景 |
|---|---------|
| 1 | critical + fixable（`lodash` 从 `4.17.20` 升到 `4.17.21`） |
| 2 | high + fixable（`express` 从 `4.18.1` 升到 `4.18.2`） |
| 3 | medium + non-fixable（`minimist`，无 patched version） |
| 4 | high + fixable（`axios`，major 升级 `0.x` → `1.x`） |
| 5 | critical + fixable（`@babel/traverse`，scoped package） |

Fixture 路径（相对 `packages/cli/`）：
```
src/github/__fixtures__/dependabot-alerts.json
```

> 注：此 fixture 同时服务于 T103（fetcher 测试）和 T901（样例数据任务），避免重复创建。

### 8.3 集成测试

- 可选：在 fetcher 测试中复用 T102 `client.test.ts` 的 nock 模式，模拟"客户端 → fetcher → normalize"完整链路
- M1 不额外写集成测试文件，现有 fetcher 单元测试 + fixture 已覆盖核心路径

### 8.4 测试依赖

```json
// packages/cli/package.json — 已有，无需新增
{
    "devDependencies": {
        "nock": "^14.0.16"  // T102 已引入
    }
}
```

---

## 9. 实现文件清单

| 文件 | 说明 |
|------|------|
| `packages/cli/src/github/dependabot-fetcher.ts` | `fetchDependabotAlerts()` + `normalizeAlert()` 私有函数 |
| `packages/cli/src/github/dependabot-fetcher.test.ts` | 12 个单元测试（nock HTTP 拦截） |
| `packages/cli/src/github/__fixtures__/dependabot-alerts.json` | 5 条 Dependabot API 响应样例 |
| `packages/cli/src/github/index.ts` | 新增 `dependabot-fetcher` 的 re-export |

> 不新增 npm 依赖。所有依赖（`@octokit/rest`, `@dependfix/core`, `nock`）已在 T102 中引入。

---

## 10. 非目标（M1 不做）

- 不拉取 Code Scanning alerts（M3 T301）
- 不拉取已 `dismissed` / `fixed` / `auto_dismissed` 的告警
- 不实现增量拉取（全量拉取，不做 `since` / `cursor` 类标记）
- 不在此层获取 `defaultBranch`（由上层调用 `octokit.rest.repos.get` 后填入）
- 不在 `NormalizedSecurityAlert` 中持久化 Dependabot 原始响应
- 不引入 `@octokit/plugin-throttling`（M2 在 T102 处统一引入）
- 不实现多仓库并发拉取（M4 T401）
- 不判断 `relationship: 'transitive'` 并区别处理（属于修复策略域，T105 负责）
