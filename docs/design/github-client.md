# T102 设计稿：GitHub 客户端封装

> 对应任务: [T102 实现 GitHub 客户端封装](../plan/todo-archive.md)
>
> **选型结论**: 引入 `@octokit/rest`。M1-M4 累计需调用 ~15 个 GitHub REST 端点（跨 repos、dependabot、git、pulls、code-scanning、orgs 6 个 API 域），手写 fetch 封装在 M2（Git 低级操作: blob→tree→commit→ref→PR）会陡增维护成本。`@octokit/rest` 自带类型推导、`octokit.paginate()` 一行分页、内置认证，适合本项目。

---

## 1. 设计目标

- 封装 `Octokit` 实例化与错误映射，提供类型安全的 GitHub API 访问
- 认证失败、限流、权限不足、网络异常统一转为 `AppError`
- Mock 层使用 `nock` 拦截 HTTP 请求，不额外维护 Mock 客户端

---

## 2. 认证方式

### 2.1 PAT（Personal Access Token）

```typescript
import { createGitHubClient } from './github/client'

const octokit = createGitHubClient({ token: 'ghp_xxxx' })
```

`Octokit` 内置 `auth: token` 策略，自动设置 `Authorization: Bearer <token>` 头。

### 2.2 Token 权限要求

| 操作 | 所需 scope（classic） | 所需权限（fine-grained） |
|------|----------------------|--------------------------|
| 读取仓库基本信息 | `repo` 或 `public_repo` | `metadata: read` |
| 读取 Dependabot alerts | `security_events` 或 `public_repo` | `dependabot_alerts: read` |

### 2.3 过期处理

- 不主动检查 token 过期
- 请求返回 `401` 时，映射为 `AppError('AUTHENTICATION_FAILED', ...)`

---

## 3. 需调用的 API 端点（M1 范围）

| # | Octokit 方法 | HTTP | 用途 | 分页 |
|---|------|------|------|:---:|
| 1 | `octokit.rest.repos.get({ owner, repo })` | `GET /repos/{o}/{r}` | 仓库基本信息 | — |
| 2 | `octokit.rest.dependabot.listAlertsForRepo({ ... })` | `GET /repos/{o}/{r}/dependabot/alerts` | Dependabot 告警 | ✅ |
| 3 | `octokit.rest.rateLimit.get()` | `GET /rate_limit` | 限流诊断 | — |

M2-M4 新增端点直接用 `octokit.rest.*` 对应方法，无需改动客户端封装。

---

## 4. 核心接口设计

### 4.1 工厂函数

```typescript
// packages/cli/src/github/client.ts

import { Octokit } from '@octokit/rest'

export interface GitHubClientOptions {
    token: string
    /** API 基地址，默认 https://api.github.com */
    baseUrl?: string
}

export function createGitHubClient(options: GitHubClientOptions): Octokit {
    return new Octokit({
        auth: options.token,
        baseUrl: options.baseUrl ?? 'https://api.github.com',
    })
}
```

### 4.2 使用示例

```typescript
const octokit = createGitHubClient({ token: 'ghp_xxxx' })

// M1: 获取仓库信息
const repo = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })
// → 返回类型完全推导：RestEndpointMethodTypes['repos']['get']['response']

// M1: 拉取 Dependabot 告警（自动分页）
const alerts = await octokit.paginate(octokit.rest.dependabot.listAlertsForRepo, {
    owner: 'foo',
    repo: 'bar',
    state: 'open',
    per_page: 100,
})
// → 返回类型: RestEndpointMethodTypes['dependabot']['listAlertsForRepo']['response']['data'][]
```

### 4.3 设计决策

- 不封装 `Octokit` 为自定义类 → 直接暴露 `Octokit` 实例，调用方使用标准 Octokit API（`octokit.rest.*`）
- 类型完全来自 `@octokit/types` → 无需手写 `RepoInfo` / `DependabotAlert` 接口
- 标准化映射（Dependabot 原始类型 → `NormalizedSecurityAlert`）由 T103 `dependabot-fetcher.ts` 负责

---

## 5. 错误映射

### 5.1 错误码枚举

```typescript
// packages/core/src/errors/error-codes.ts (新增)

export const GITHUB_ERROR_CODES = [
    'AUTHENTICATION_FAILED',
    'PERMISSION_DENIED',
    'RATE_LIMITED',
    'REPO_NOT_FOUND',
    'GITHUB_API_ERROR',
    'NETWORK_ERROR',
] as const

export type GitHubErrorCode = typeof GITHUB_ERROR_CODES[number]
```

### 5.2 错误映射工具

```typescript
// packages/cli/src/github/errors.ts

import { AppError, type GitHubErrorCode } from '@dependfix/core'
import { RequestError } from '@octokit/request-error'

export function mapGitHubError(error: unknown, context: string): AppError {
    if (error instanceof RequestError) {
        switch (error.status) {
            case 401:
                return new AppError('AUTHENTICATION_FAILED',
                    `${context}: authentication failed (HTTP 401)`, { cause: error })
            case 403:
                if (error.response?.headers?.['x-ratelimit-remaining'] === '0') {
                    const resetAt = error.response.headers['x-ratelimit-reset']
                    return new AppError('RATE_LIMITED',
                        `${context}: rate limited, resets at ${resetAt}`, { cause: error })
                }
                return new AppError('PERMISSION_DENIED',
                    `${context}: permission denied (HTTP 403)`, { cause: error })
            case 404:
                return new AppError('REPO_NOT_FOUND',
                    `${context}: not found (HTTP 404)`, { cause: error })
        }
        return new AppError('GITHUB_API_ERROR',
            `${context}: ${error.message} (HTTP ${error.status})`, { cause: error })
    }

    // 网络错误（非 RequestError）
    if (error instanceof Error) {
        return new AppError('NETWORK_ERROR',
            `${context}: network error - ${error.message}`, { cause: error })
    }

    return new AppError('NETWORK_ERROR',
        `${context}: unknown error`, { details: { raw: String(error) } })
}
```

### 5.3 映射表

| HTTP 状态码 | 条件 | `AppError.code` |
|:---:|------|------|
| 401 | — | `AUTHENTICATION_FAILED` |
| 403 | `X-RateLimit-Remaining: 0` | `RATE_LIMITED` |
| 403 | 其他 | `PERMISSION_DENIED` |
| 404 | — | `REPO_NOT_FOUND` |
| 4xx/5xx | — | `GITHUB_API_ERROR` |
| 网络异常 | — | `NETWORK_ERROR` |

---

## 6. 分页策略

### 6.1 Octokit 内置分页

```typescript
// 自动翻页，合并所有结果
const allAlerts = await octokit.paginate(
    octokit.rest.dependabot.listAlertsForRepo,
    { owner, repo, state: 'open', per_page: 100 }
)
```

`octokit.paginate()` 内部：
- 解析 `Link` 响应头，自动请求下一页
- 返回合并后的完整数组
- 调用方可设置 `request` 选项来控制超时等

### 6.2 M1 分页行为

- `per_page: 100`（最大）
- 全量拉取，不做增量标记（M3 扩展 `since` 参数）

---

## 7. 限流策略

### 7.1 GitHub API 限额

| 认证方式 | 限额 |
|----------|------|
| 无认证 | 60 次/小时 |
| PAT 认证 | 5,000 次/小时 |

### 7.2 M1 处理

- M1 调用量低（单仓库 ≤ 10 页），不引入 `@octokit/plugin-throttling`
- 收到限流时通过 `mapGitHubError` 抛 `AppError('RATE_LIMITED')`，附带 `X-RateLimit-Reset` 时间戳
- M2/M4 多仓库场景再引入 throttling 插件

---

## 8. Mock 与测试策略

### 8.1 方案：`nock` 拦截 HTTP

```typescript
// packages/cli/src/github/client.test.ts

import nock from 'nock'
import { createGitHubClient } from './client'

const API_BASE = 'https://api.github.com'

describe('createGitHubClient', () => {
    afterEach(() => nock.cleanAll())

    it('returns repo info on success', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(200, { id: 1, full_name: 'foo/bar' })

        const octokit = createGitHubClient({ token: 'test-token' })
        const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })
        expect(data.full_name).toBe('foo/bar')
    })

    it('throws AUTHENTICATION_FAILED on 401', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(401, { message: 'Bad credentials' })

        // ...
    })
})
```

### 8.2 测试场景

| 场景 | nock 配置 | 验证 |
|------|----------|------|
| 正常响应 | `.reply(200, fixture)` | 数据完整性 |
| 认证失败 | `.reply(401)` | 抛 `AUTHENTICATION_FAILED` |
| 限流 | `.reply(403, {}, { 'x-ratelimit-remaining': '0' })` | 抛 `RATE_LIMITED` |
| 权限不足 | `.reply(403)` | 抛 `PERMISSION_DENIED` |
| 仓库不存在 | `.reply(404)` | 抛 `REPO_NOT_FOUND` |
| 网络错误 | `nock.disableNetConnect()` + 断网 | 抛 `NETWORK_ERROR` |

### 8.3 依赖

```json
{
    "devDependencies": {
        "nock": "^14.0.0"
    }
}
```

### 8.4 静态 Fixture（保留用于 T103 集成测试）

```
packages/cli/src/github/__fixtures__/
├── dependabot-alerts.json    # 5 条样例（覆盖 critical/high/medium、fixable/non-fixable）
├── repo-info.json            # 单仓库基本信息
└── empty-alerts.json         # 无告警
```

Fixture 给 T103 `dependabot-fetcher.test.ts` 使用，验证 Dependabot 原始类型 → `NormalizedSecurityAlert` 映射。

---

## 9. 实现文件清单

| 文件 | 说明 |
|------|------|
| `packages/cli/src/github/client.ts` | `createGitHubClient()` 工厂函数 |
| `packages/cli/src/github/errors.ts` | `mapGitHubError()` 错误映射 |
| `packages/cli/src/github/client.test.ts` | 6 场景单元测试（nock 拦截） |
| `packages/core/src/errors/error-codes.ts` | `GITHUB_ERROR_CODES` 枚举 |
| `packages/cli/package.json` | 新增 `@octokit/rest`（dep）+ `nock`（devDep） |

---

## 10. 非目标（M1 不做）

- 不实现 GitHub App / Installation Token 认证
- 不实现 `@octokit/plugin-throttling`（M2 引入）
- 不调用 Code Scanning 端点（M3）
- 不实现 `octokit.rest.repos.listForOrg()` 自动发现（M4）
- 不封装自定义类，直接暴露 `Octokit` 实例
