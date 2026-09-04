# C22 PAT 无感升级评估（M18.0 评估报告）

> **状态**：评估报告（M18.0 P0 docs only 子阶段）；2026-08-29 落地
> **范围**：C22 GitHub App BYO App 模式实施前的 PAT 路径兼容性评估；输出推荐方案 + 落地步骤 + 风险矩阵
> **关联决策**：M18 P 阶段 3 用户决策（2026-08-29）—— ① M18.0 独立子阶段（A 决策）；② fixtures 仅 mock 无真实 App（C 决策，**用户已接受风险**）；③ M18.x 治理批次合并入 C22 子阶段顺手做（B 决策）

## 1. 背景与目标

C22 GitHub App BYO App 模式实施（M18 阶段）需要在 [`packages/engine/src/github/client.ts`](../../../packages/engine/src/github/client.ts) 引入 `AuthProvider` 抽象层以支持双认证路径（PAT + GitHub App installation token）。当前 `createGitHubClient({ token: string })` 是唯一认证入口，需评估改造方案对现有 PAT 调用方的兼容性影响。

**评估目标**：

1. 精确盘点现有 PAT 调用方（生产 + 测试）
2. 输出 3 个候选方案对比 + 推荐
3. 提供推荐方案的完整落地步骤
4. 风险矩阵 + 验收标准 + 时间盒预估
5. 决策 C（fixtures 仅 mock）的风险承担方明确登记

**不做的事**（重申范围边界）：

- 不实施代码改动（M18.0 是 P0 docs only 子阶段；实施由 M18.1 接手）
- 不发布 dependfix 自身为官方 GitHub App（C22-future 战略候选）
- 不立即做 Manifest flow 一键创建（A7b 仅评估）

## 2. 现有 PAT 路径影响面精确盘点

### 2.1 生产代码调用点（6 个文件 / 6 处调用）

| 文件 | 行 | 当前签名 | 改造方式 |
|:---|:---|:---|:---|
| [`packages/engine/src/app/repo-alerts.ts`](../../../packages/engine/src/app/repo-alerts.ts) | 117 | `createGitHubClient({ token, retry })` | 改为 `{ auth: fromPat(token, retry) }` |
| [`packages/engine/src/app/index.ts`](../../../packages/engine/src/app/index.ts) | 696 | `createGitHubClient({ token, retry })` | 同上 |
| [`apps/platform/server/services/executor/container-executor.ts`](../../../apps/platform/server/services/executor/container-executor.ts) | 139 | `createGitHubClient({ ... })` | 同上 |
| [`packages/mcp/src/tools/discover-repos.ts`](../../../packages/mcp/src/tools/discover-repos.ts) | 39 | `createGitHubClient({ token })` | 同上 |
| [`packages/mcp/src/tools/fetch-alerts.ts`](../../../packages/mcp/src/tools/fetch-alerts.ts) | 40 | `createGitHubClient({ token })` | 同上 |
| [`packages/mcp/src/tools/cleanup-branches.ts`](../../../packages/mcp/src/tools/cleanup-branches.ts) | 44 | `createGitHubClient({ token })` | 同上 |

### 2.2 测试文件调用点（8 个文件）

**A 类：直接调用 `createGitHubClient`（5 个文件 / 15 处）**

| 文件 | 调用行 | 调用形式 |
|:---|:---|:---|
| [`packages/engine/src/github/client.test.ts`](../../../packages/engine/src/github/client.test.ts) | 20 / 34 / 53 / 81 / 102 / 119 / 134 / 153 / 173 / 193 / 223（11 处）| `{ token: 'test-token' }` 7 处 + `{ token, retry }` 多行 4 处 |
| [`packages/engine/src/github/dependabot-fetcher.test.ts`](../../../packages/engine/src/github/dependabot-fetcher.test.ts) | 14 | `{ token, retry }` |
| [`packages/engine/src/github/code-scanning-fetcher.test.ts`](../../../packages/engine/src/github/code-scanning-fetcher.test.ts) | 11 | `{ token }` |
| [`packages/engine/src/github/code-quality-fetcher.test.ts`](../../../packages/engine/src/github/code-quality-fetcher.test.ts) | 11 | `{ token }` |
| [`packages/engine/src/github/repository-discovery.test.ts`](../../../packages/engine/src/github/repository-discovery.test.ts) | 10 | `{ token }` |

**B 类：mock `createGitHubClient`（3 个文件）**

| 文件 | mock 模式 | 改造方式 |
|:---|:---|:---|
| [`packages/mcp/src/tools/discover-repos.test.ts`](../../../packages/mcp/src/tools/discover-repos.test.ts) | `vi.mock('@dependfix/engine')` + `vi.mocked(createGitHubClient)` | mock 改为接受 `{ auth }` 或保留（向后兼容包装内仍调用） |
| [`packages/mcp/src/tools/cleanup-branches.test.ts`](../../../packages/mcp/src/tools/cleanup-branches.test.ts) | 同上 | 同上 |
| [`apps/platform/server/services/executor/platform-delivery.test.ts`](../../../apps/platform/server/services/executor/platform-delivery.test.ts) | `vi.mocked(engineMock.createGitHubClient)` + `mockReturnValue` + `toHaveBeenCalledWith({ token })`（行 86 + 行 136）| mock 改为 `toHaveBeenCalledWith({ auth: expect.any(Object) })` 或保留 token 字段验证 |

### 2.3 类型定义（`packages/engine/src/github/client.ts:16-32`）

```typescript
export interface OctokitClientOptions {
    /** GitHub Personal Access Token */
    token: string
    baseUrl?: string
    retry?: RetryPolicyOptions
}
```

唯一认证字段 `token: string`。改造后 `OctokitClientOptions` 增加 `auth?: AuthProvider` 字段；`token?: string` 标记 `@deprecated` 保留作为向后兼容包装输入。

### 2.4 JSDoc 示例（2 处需同步更新）

- [`packages/engine/src/github/client.ts:45`](../../../packages/engine/src/github/client.ts) — `const octokit = createGitHubClient({ token: 'ghp_xxxx' })`
- [`packages/engine/src/github/dependabot-fetcher.ts:48`](../../../packages/engine/src/github/dependabot-fetcher.ts) — 同上

### 2.5 影响面汇总

- **新增文件**：9 个（`packages/engine/src/auth/` 目录 8 个 + `packages/engine/src/github/__tests__/test-auth.ts` 1 个）
- **修改文件**：16 个（6 生产 + 5 直接调用测试 + 3 mock 测试 + 1 类型定义 + 1 JSDoc 同步 + 1 JSDoc 同步 — 实际 14 修改文件，container-executor-pr.test.ts 算入 mock 测试）

> 注：原 M18 P 阶段估算"9 测试 + 2 app"为初版低估；精确盘点后修正为 **6 生产 + 8 测试 + 2 JSDoc + 1 类型定义 = 17 文件涉及**。

## 3. 三方案对比

| 维度 | A 抽象层包装 | **B AuthProvider 注入（推荐）** | C 重载函数 |
|:---|:---:|:---:|:---:|
| 调用方改动 | 0 | 6 生产 + 8 测试 | 0 |
| 长期维护 | ❌ 两套 API 长期并存 | ✅ 长期单一入口 | ⚠️ TS overload 难维护 |
| 类型推断 | ✅ | ✅ | ⚠️ 复杂（union type） |
| 测试改造风险 | 0 | 中（1 处 helper 抽取降低重复）| 0 |
| 与 M18.1 AuthProvider 抽象层天然对齐 | ❌ 需要再改造 | ✅ 一次到位 | ❌ 需要再改造 |
| 长期扩展 App scope 探测（token-scope.ts） | ⚠️ 需独立模块 | ✅ 注入统一入口便于扩展 | ⚠️ 需独立模块 |
| 与 [`@octokit/auth-app`](https://github.com/octokit/auth-app.js) 库契约对齐 | ❌ | ✅ | ⚠️ |

**方案 A 不推荐理由**：M18.1 已经计划新建 `packages/engine/src/auth/` 抽象层；方案 A 会导致"短期 0 摩擦但长期双 API 维护成本"，与 M18 P 阶段"长期单一入口"目标冲突。

**方案 C 不推荐理由**：TS overload 在 union type 下推断容易出错（实测多个 monorepo 项目的 [@octokit/*](https://github.com/octokit) 包采用 discriminated union 而非 overload，理由相同）；且方案 C 的 0 调用方改动优势被方案 B 的 helper 抽取抵消。

**方案 B 推荐理由**：

1. 与 M18.1 C22.1 基础层天然对齐（AuthProvider 抽象层一次到位）
2. 长期单一入口，便于扩展 App scope 探测与 installation token 缓存层
3. 测试改造 1 处 helper 抽取（`createTestPatAuth()`）降低 5 个直接调用测试文件的重复
4. 类型推断清晰（`AuthProvider` 是 discriminated union，`authProvider: 'pat' | 'github-app'`）
5. 与 `@octokit/auth-app` 库契约对齐（库返回 `{ token, createdAt, expiresAt, ... }` 可直接映射到 `AuthProvider.getGitCredential()`）

## 4. 推荐方案 B 完整落地步骤

### 4.1 新建 `packages/engine/src/auth/` 目录

```
packages/engine/src/auth/
├── auth-provider.ts                     # AuthProvider 接口 + 类型导出
├── pat-provider.ts                      # PatAuthProvider 实现（PAT 路径）
├── app-provider.ts                      # AppAuthProvider 实现（GitHub App 路径；M18.1 主实施）
├── installation-token-cache.ts          # installation token 缓存层（1h 滑窗 + 5min 提前刷新）
├── auth-provider.test.ts                # 接口契约 + fromPat/fromApp helper 单测
├── pat-provider.test.ts                 # PAT provider 单测
├── app-provider.test.ts                 # App provider 单测（M18.1 主测试）
└── installation-token-cache.test.ts     # 缓存层单测（1h 滑窗 + 5min 提前刷新 + 失败重试）
```

### 4.2 AuthProvider 接口设计

```typescript
// packages/engine/src/auth/auth-provider.ts

/**
 * GitHub 认证抽象层。
 *
 * 支持 PAT（classic / fine-grained）与 GitHub App installation token 两种认证路径。
 * 调用方通过 getOctokit() 获取已认证的 Octokit 实例；
 * 通过 getGitCredential() 获取推送/clone 用的 Git 凭据；
 * 通过 getCommitAuthor() 获取 commit author 信息（GitHub App 路径走动态 bot identity；PAT 路径返回硬编码）。
 *
 * authProvider 字段用于审计与调试（区分 PAT vs App 路径）。
 */
export interface AuthProvider {
    /** 获取已认证的 Octokit 实例（baseUrl / retry 在工厂方法一次性注入） */
    getOctokit(): Octokit

    /** 获取推送 / clone 用的 Git 凭据（用户名 + token） */
    getGitCredential(): { username: string; token: string }

    /** 获取 commit author 信息（App 路径 = {app_id}+{bot_login}[bot]；PAT 路径 = dependfix[bot]） */
    getCommitAuthor(): { name: string; email: string }

    /** 认证路径标识（用于审计 + 调试） */
    readonly authProvider: 'pat' | 'github-app'
}

/** PAT 工厂函数（保留现有 `{ token, retry }` 行为；内部包装 Octokit 构造与限流重试） */
export function fromPat(token: string, options?: { retry?: RetryPolicyOptions }): AuthProvider

/** GitHub App 工厂函数（M18.1 实施；本评估仅占位） */
export function fromApp(
    params: { appId: string; privateKey: string; installationId: string },
    options?: { retry?: RetryPolicyOptions },
): AuthProvider
```

### 4.3 createGitHubClient 签名变更

```typescript
// packages/engine/src/github/client.ts

import { type AuthProvider, fromPat } from '../auth/auth-provider'

export interface OctokitClientOptions {
    /**
     * 认证抽象层（M18.1 实施后唯一推荐入口）。
     * 调用方应通过 `fromPat(token)` 或 `fromApp(params)` 构造。
     */
    auth?: AuthProvider

    /**
     * @deprecated 使用 `auth` 替代。
     * 保留作为向后兼容包装输入；若提供则内部委托给 `fromPat(token)`。
     * 计划在 M19+ 评估移除。
     */
    token?: string

    /** API 基地址。默认 `https://api.github.com`。 */
    baseUrl?: string
    /** API 限流 / 次要限流指数退避重试策略。默认 maxRetries=3。 */
    retry?: RetryPolicyOptions
}

export function createGitHubClient(options: OctokitClientOptions): Octokit {
    // 向后兼容：token 存在时委托给 fromPat
    const auth = options.auth
        ?? (options.token ? fromPat(options.token, { retry: options.retry }) : undefined)
    if (!auth) {
        throw new Error('createGitHubClient: must provide either `auth` (AuthProvider) or `token` (deprecated)')
    }

    const client = new Octokit({
        auth: auth.getGitCredential().token,
        baseUrl: options.baseUrl ?? 'https://api.github.com',
    })

    const maxRetries = options.retry?.maxRetries ?? 3
    if (maxRetries > 0) {
        applyRetryPolicy(client, {
            maxRetries,
            baseDelayMs: options.retry?.baseDelayMs ?? 1000,
            maxBackoffMs: options.retry?.maxBackoffMs ?? MAX_BACKOFF_MS_DEFAULT,
        })
    }

    return client
}
```

### 4.4 测试 helper 抽取

```typescript
// packages/engine/src/github/__tests__/test-auth.ts（新建）

import { fromPat, type AuthProvider } from '../../auth/auth-provider'

/**
 * 测试 PAT factory helper。
 *
 * 提供统一的 `createTestPatAuth()` 入口降低 5 个直接调用测试文件的重复。
 * 默认 token = 'test-token'；retry 禁用避免测试副作用。
 */
export function createTestPatAuth(token = 'test-token'): AuthProvider {
    return fromPat(token, { retry: { maxRetries: 0 } })
}
```

5 个直接调用测试文件改造示意（按统一模式）：

```typescript
// Before
const octokit = createGitHubClient({ token: 'test-token' })

// After
import { createTestPatAuth } from '../__tests__/test-auth'  // 或相对路径
const octokit = createGitHubClient({ auth: createTestPatAuth() })
```

### 4.5 6 生产调用点改造示意

```typescript
// Before (e.g. packages/mcp/src/tools/discover-repos.ts:39)
const client = createGitHubClient({ token })

// After
import { fromPat } from '@dependfix/engine/auth'
const client = createGitHubClient({ auth: fromPat(token) })
```

> 注：`@dependfix/engine` 子路径导出（`@dependfix/engine/auth`）需在 `packages/engine/package.json` `exports` 字段声明；M18.1 实施时同步调整。

### 4.6 3 个 mock 测试改造示意

```typescript
// 方案 1（推荐）：保留 mock `createGitHubClient`，验证输入为 `{ auth }`
// container-executor-pr.test.ts:86
expect(engineMock.createGitHubClient).toHaveBeenCalledWith({
    auth: expect.any(Object),  // PAT provider 实例
    // token 字段不再存在
})

// 方案 2（备选）：mock 改为 AuthProvider 层
vi.mock('@dependfix/engine/auth', () => ({
    fromPat: vi.fn(),
}))
```

推荐**方案 1**：mock 边界保持在 `createGitHubClient` 层；只验证 `{ auth }` 输入；保留与生产行为一致的契约。

### 4.7 commit 拆分纪律（M17.4 教训）

预计 3 commits（避免单批 >10 文件超规）：

- `refactor(engine)`：**AuthProvider 抽象层 + createGitHubClient 签名 + 8 测试改造 + 6 生产调用点**（预估 14 文件 / 超 10 阈值 → 拆 2 commits）
  - commit 1：`refactor(engine)` AuthProvider 抽象层（5 新增 + createGitHubClient 签名变更 + JSDoc 同步）= 8 文件
  - commit 2：`refactor(engine+test)` 6 生产调用点 + 5 直接调用测试改造 = 11 文件（依赖 commit 1 的 AuthProvider 接口）
- `feat(engine)`：**pat-provider 实施 + 单测**（含 pat-provider.test.ts + auth-provider.test.ts）= 2 新增
- `feat(engine)`：**app-provider 实施 + installation token 缓存层 + 单测**（M18.1 主实施）= 4 新增

A 阶段 audit 阈值：commit 1 quick depth（基础层骨架）/ commit 2 standard depth（测试改造涉及 11 文件）/ commit 3 standard depth（M18.1 主实施）。

## 5. 风险矩阵

### 5.1 兼容性风险

| 风险 | 等级 | 缓解措施 |
|:---|:---:|:---|
| 现有 PAT 用户行为变化 | 低 | `{ token }` deprecated 包装保留；行为零变化；M17.1 C38 encryptionKey 标准化已建立"无感升级"先例 |
| 既有 fetch 接口签名变化 | 中 | 6 生产调用点全部同模式改造；diff 收敛（commit 2 集中处理）|
| 第三方调用方破坏 | 低 | `OctokitClientOptions` 字段增加不删除；`token` 标记 deprecated 但仍可用 |

### 5.2 测试改造风险

| 风险 | 等级 | 缓解措施 |
|:---|:---:|:---|
| 8 测试文件改造引入回归 | 中 | helper 抽取 `createTestPatAuth()` 统一模式；A 阶段 standard depth audit 实证 |
| 3 mock 测试（mcp + container-executor）行为变化 | 中 | mock 边界保持在 `createGitHubClient` 层；只验证 `{ auth }` 输入而非具体 provider 实例（§4.6 方案 1）|
| JSDoc 示例与生产不一致 | 低 | 同步更新 2 处 JSDoc（commit 1 内一并处理）|

### 5.3 类型推断风险

| 风险 | 等级 | 缓解措施 |
|:---|:---:|:---|
| `OctokitClientOptions.auth?: AuthProvider` 与 `token?: string` 共存歧义 | 低 | 显式 `?? fromPat(...)` 包装；类型层面 `auth` 优先；构造时缺两字段抛错 |
| AuthProvider 抽象层类型契约不严 | 中 | `auth-provider.test.ts` 接口契约单测覆盖 fromPat/fromApp/getOctokit/getGitCredential/getCommitAuthor 路径 |

### 5.4 长期维护风险

| 风险 | 等级 | 缓解措施 |
|:---|:---:|:---|
| deprecated 包装长期保留变成"事实标准" | 中 | lint 规则禁止新代码使用 `{ token }`（仅测试 + 迁移期允许）；A 阶段 audit suggest 跟踪 |
| AuthProvider 接口演进出 breaking change | 低 | 接口设计保留 `options?: { baseUrl?: string; retry?: ... }` 扩展点 |
| `@octokit/auth-app` 库升级回归（决策 C 风险） | 中 | 见 §5.5 |

### 5.5 决策 C fixture 仅 mock 风险承担方

**M18 P 阶段用户决策 C**（2026-08-29）：e2e 不创建真实 dependfix GitHub App fixture，完全依赖 mock JWT signing + `getInstallationOctokit` 拦截。

**风险描述**：违反"防升级回归"目的——mock 后测的不是 `@octokit/auth-app` 真实行为；该库升级若改变 installation token 缓存 / rate limit / JWT 签名边界行为，e2e 无法捕获。

**风险承担方**：**用户已接受**（决策 C 显式记录于 [todo.md §M18 3 用户决策固化](../../plan/todo.md) + [backlog.md §C22 §M18 实施状态](../../plan/backlog.md)）。

**缓解措施**：

1. 单测聚焦 `@octokit/auth-app` 库 mock 输出契约（`app-provider.test.ts` 覆盖 `getInstallationOctokit` 输入输出契约 + `installation-token-cache.test.ts` 覆盖 1h 滑窗 + 5min 提前刷新 + 失败重试）
2. A 阶段 review gate 重点检查"库 mock 契约与官方文档是否对齐"
3. 监控 [`@octokit/auth-app` changelog](https://github.com/octokit/auth-app.js/releases)（M19+ 评估是否恢复真实 fixture）
4. M18.4 e2e 全链路验证后，将 `@octokit/auth-app` 版本钉定（pnpm overrides）+ CI 依赖审计纳入

## 6. 验收标准

### 6.1 M18.0 本子阶段（评估报告）

- ✅ 现有 PAT 调用方精确盘点（6 生产 + 8 测试 + 2 JSDoc + 1 类型定义 = 17 文件）
- ✅ 3 方案对比 + 推荐 B（AuthProvider 注入）
- ✅ 推荐方案完整落地步骤（§4.1-4.7）
- ✅ 风险矩阵（§5.1-5.5）
- ✅ 决策 C 风险承担方明确登记（§5.5）
- ✅ 时间盒预估（§7）
- ✅ 精确改动清单（附录 A）

### 6.2 M18.1 实施验收标准（前置条件）

- `pnpm --filter @dependfix/engine typecheck` 0 error（**实测**，非 Done 输出 —— M17.4 commit 2 audit Reject 教训）
- `pnpm --filter @dependfix/engine lint` 0 error
- `pnpm --filter @dependfix/engine test` 全过（baseline + 新增单测）
- `pnpm --filter @dependfix/mcp typecheck` 0 error（mcp 6 调用点）
- `pnpm --filter @dependfix/mcp test` 全过
- `pnpm --filter @dependfix/platform typecheck` 0 error（platform 1 调用点 + credential 扩展）
- `pnpm --filter @dependfix/platform test` 全过
- `pnpm run check:docs` OK（链接与锚点）
- 编号标记扫描 0 命中（`rg -n "T\d{3}|P[0-3](?:-[0-9])?|C\d+|G\d|R\d|M\d+|B\d" packages/engine/src packages/cli/src packages/mcp/src apps/platform/server`）

### 6.3 M18.2-M18.4 验收标准（后续子阶段）

按 M18 P 阶段锁定方案逐项验证，详见 [todo.md §M18 5 子阶段验收](../../plan/todo.md)。

## 7. 时间盒预估（M18.1 实施工作量）

| 子任务 | 工作量预估 | 备注 |
|:---|:---:|:---|
| §4.1 新建 `packages/engine/src/auth/` 目录 | 30 分钟 | 6 文件骨架（不含测试）|
| §4.2 AuthProvider 接口设计 | 1 小时 | 含类型契约与 JSDoc |
| §4.3 createGitHubClient 签名变更 | 1 小时 | 含向后兼容包装 + 类型扩展 |
| §4.4 测试 helper 抽取 | 30 分钟 | `createTestPatAuth()` |
| §4.5 6 生产调用点改造 | 1 小时 | 同模式批量 + `@dependfix/engine/auth` 子路径导出 |
| §4.6 3 mock 测试改造 | 30 分钟 | mock 边界保持在 createGitHubClient 层 |
| §4.5 + §4.6 + JSDoc 同步总测试改造 | 1.5 小时 | 8 测试文件 |
| pat-provider 实施 + 单测 | 1 小时 | 简单包装，主要是测试覆盖 |
| app-provider 实施 + 单测（M18.1 主实施）| 3 小时 | JWT signing + getInstallationOctokit + 公钥指纹校验 |
| installation-token-cache 实施 + 单测（M18.1）| 2 小时 | 1h 滑窗 + 5min 提前刷新 + 失败重试 |
| 3 commits + A 阶段 audit | 1 小时 | 1 standard depth × 2 + 1 quick depth |
| **总计** | **~12 小时 / 1.5 工作日** | — |

注：原 M18 P 阶段估算"~11 commits"为阶段总投入预估；本评估报告聚焦 M18.1 单一子阶段，故时间盒包含 M18.1 全部实施内容（commit 1 + commit 2 + commit 3）。

## 8. 关键决策回顾（2026-08-29）

1. **方案选择 B（AuthProvider 注入）**：与 M18.1 C22.1 基础层天然对齐；长期单一入口；测试改造 helper 抽取降低重复
2. **PAT 路径保留硬编码 commit author**：用户决策 PAT 路径行为零变化（`getCommitAuthor()` 返回 `{ name: 'dependfix[bot]', email: 'dependfix[bot]@users.noreply.github.com' }`）
3. **fixtures 仅 mock**（决策 C）：用户接受风险；缓解措施 = 单测聚焦库 mock 输出契约 + changelog 监控 + 版本钉定
4. **deprecated 包装保留 1 个版本周期**：M18.1 实施后标记 `@deprecated`；M19+ 评估是否移除
5. **commit 拆分**：commit 1（AuthProvider 抽象层 8 文件）+ commit 2（6 生产 + 5 直接调用测试 = 11 文件，超 10 阈值需 audit standard depth）+ commit 3（App provider + cache = 4 文件）—— 避开 M17.4 单批 >10 文件教训

## 附录 A：精确改动清单

### A.1 新增文件（9 个）

```
packages/engine/src/auth/auth-provider.ts                          # AuthProvider 接口 + fromPat/fromApp
packages/engine/src/auth/pat-provider.ts                           # PatAuthProvider 实现
packages/engine/src/auth/app-provider.ts                           # AppAuthProvider 实现（M18.1 主实施）
packages/engine/src/auth/installation-token-cache.ts               # 缓存层（M18.1）
packages/engine/src/auth/auth-provider.test.ts                     # 接口契约单测
packages/engine/src/auth/pat-provider.test.ts                      # PAT provider 单测
packages/engine/src/auth/app-provider.test.ts                      # App provider 单测（M18.1）
packages/engine/src/auth/installation-token-cache.test.ts          # 缓存层单测（M18.1）
packages/engine/src/github/__tests__/test-auth.ts                  # 测试 helper（createTestPatAuth）
```

### A.2 修改文件（14 个）

```
# 生产代码（6）
packages/engine/src/app/repo-alerts.ts                                        # 行 117
packages/engine/src/app/index.ts                                              # 行 696
apps/platform/server/services/executor/container-executor.ts                  # 行 139
packages/mcp/src/tools/discover-repos.ts                                      # 行 39
packages/mcp/src/tools/fetch-alerts.ts                                        # 行 40
packages/mcp/src/tools/cleanup-branches.ts                                    # 行 44

# 测试文件（5 直接调用 + 3 mock）
packages/engine/src/github/client.test.ts                                     # 11 处
packages/engine/src/github/dependabot-fetcher.test.ts                         # 行 14
packages/engine/src/github/code-scanning-fetcher.test.ts                      # 行 11
packages/engine/src/github/code-quality-fetcher.test.ts                       # 行 11
packages/engine/src/github/repository-discovery.test.ts                       # 行 10
packages/mcp/src/tools/discover-repos.test.ts                                 # mock 调整
packages/mcp/src/tools/cleanup-branches.test.ts                               # mock 调整
apps/platform/server/services/executor/container-executor-pr.test.ts          # mock + toHaveBeenCalledWith 调整（行 86 + 行 136）

# 类型定义 + JSDoc 同步（3）
packages/engine/src/github/client.ts                                          # OctokitClientOptions 接口 + 函数签名 + JSDoc 行 45
packages/engine/src/github/dependabot-fetcher.ts                              # JSDoc 行 48
packages/engine/package.json                                                  # exports 字段声明 '@dependfix/engine/auth' 子路径
```

### A.3 不变更文件（已有占位）

```
apps/platform/server/entities/credential.ts                  # Credential.type 已枚举 'github-app'（行 17）；M18.1 仅扩展字段
apps/platform/server/schemas/credential.ts                   # credentialSchema 已允许 type='github-app'（行 6）；M18.1 仅扩展字段
packages/engine/src/github/token-scope.ts                    # 已有 best-effort scope 警告；M18.1 扩展 App installation token 探测
packages/engine/src/github/pr-creator.ts                     # 行 60-61 BOT_NAME/BOT_EMAIL 硬编码；M18.2 改造为动态
```

---

**报告版本**：v1（2026-08-29 M18.0 P0 docs only 评估子阶段产出）

**下一步**：M18.1 D 阶段按本报告 §4 落地步骤实施（预计 1.5 工作日 / 3 commits + 1 standard depth + 1 quick depth audit）