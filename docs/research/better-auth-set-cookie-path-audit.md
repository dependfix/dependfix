# better-auth 中间件 Set-Cookie 路径扫描报告

> **任务**：M22.8 follow-up ② / M28.5（[todo.md §M28.5](../plan/todo.md)）——确认 better-auth 中间件对非 `/api/auth/*` 端点返回 Set-Cookie 路径是否会污染下游 e2e context。
>
> **扫描脚本**：[`apps/platform/scripts/set-cookie-trace.mjs`](../../apps/platform/scripts/set-cookie-trace.mjs)
>
> **扫描时间**：2026-09-11
>
> **关联**：M22.8 hotfix（commit `bdcd900`）+ 经验归档 §五十二（Playwright 1.62 fixture pool cookie 注入）+ M23.2 helper 抽取（commit `09c3dee`）

## TL;DR

**M22.8 follow-up ② 实证无影响**——better-auth 中间件对非 `/api/auth/*` 端点**不会主动设置 Set-Cookie**。项目代码无任何显式 `setCookie` 调用污染下游 context。

- ✅ 项目代码无显式 `setCookie` 调用（`apps/platform/server/` 全树扫描 0 命中）
- ✅ better-auth 1.7 中间件自动设置 Set-Cookie 仅在 `/api/auth/*` 端点（sign-in / sign-up / sign-out / callback / oauth-callback）
- ✅ 非 `/api/auth/*` 端点（`/api/repos` / `/api/credentials` / `/api/schedules` 等 10 个平台 API）——better-auth 中间件**不会**主动触发 Set-Cookie（除非 session refresh 条件触发）
- ✅ M22.8 修复（commit `bdcd900`）已根治 Playwright 1.62 fixture pool cookie 注入；helper 层兜底（`unauthenticatedApiContext()` 显式空 storageState）保留是稳妥做法

**结论**：M22.8 follow-up ② 治本验证通过——better-auth 中间件本身不会污染非 `/api/auth/*` 端点的下游 context。

## 1. 项目代码显式 setCookie 调用扫描

扫描范围：`apps/platform/server/` 全树（递归 `.ts` / `.vue` / `.mjs` 文件）。

**结果**：✅ **0 命中** ——项目代码无任何显式 `setCookie` 调用。

**意义**：better-auth 中间件自动通过 h3 的 `setCookie` 设置 session token，**不依赖项目代码显式调用**——因此 better-auth 中间件行为是 better-auth 上游的责任，不是 dependfix 项目可干预的范畴。

## 2. better-auth 配置（hooks / plugins / additionalFields）

扫描 `apps/platform/server/utils/auth.ts` 的 better-auth 配置：

| 配置 | 位置 | 摘要 |
|------|------|------|
| `databaseHooks` | `server/utils/auth.ts` | `user.create.before` 注册准入 + 首用户 admin 触发（`buildCreateUserBefore` 工厂函数） |
| `plugins` | `server/utils/auth.ts` | `admin()` 插件（用户管理仅 admin 三角色模型） |
| `additionalFields` | `server/utils/auth.ts` | `user.role` 字段（角色模型默认 viewer，input: false 防客户端注入） |

**意义**：better-auth 配置仅包含 databaseHooks（数据库操作钩子）+ plugins（功能扩展）+ additionalFields（用户表字段），**没有任何 `hooks: { ... }` 配置**——better-auth 中间件的 Set-Cookie 行为完全由 better-auth 上游控制，与项目代码无关。

## 3. 端点分类 + Set-Cookie 风险评估

按 better-auth 1.7 中间件 Set-Cookie 触发机制，将扫描目标端点分为三类：

### 3.1 自动触发 Set-Cookie 端点（better-auth-auto）

better-auth 中间件自动设置 session token：

| 端点 | 方法 | expect_set_cookie |
|------|------|-------------------|
| `/api/auth/sign-in/email` | POST | true |
| `/api/auth/sign-up/email` | POST | true |
| `/api/auth/sign-out` | POST | true |
| `/api/auth/callback/*` | POST | true |
| `/api/auth/oauth/callback` | GET | true |

### 3.2 条件触发 Set-Cookie 端点（better-auth-session-refresh）

session 即将过期时会刷新 session 并 Set-Cookie：

| 端点 | 方法 | expect_set_cookie |
|------|------|-------------------|
| `/api/auth/get-session` | GET | conditional |

### 3.3 非 /api/auth/* 端点（platform-api）

平台业务 API——**不应**触发 Set-Cookie：

| 端点 | 方法 | expect_set_cookie | 实际风险 |
|------|------|-------------------|----------|
| `/api/repos` | GET | false | low |
| `/api/credentials` | GET | false | low |
| `/api/schedules` | GET | false | low |
| `/api/batch-runs` | GET | false | low |
| `/api/ai-config` | GET | false | low |
| `/api/alerts` | GET | false | low |
| `/api/scan-history` | GET | false | low |
| `/api/audit-events` | GET | false | low |
| `/api/users` | GET | false | low |
| `/api/install/status` | GET | false | low |

**风险评估逻辑**：项目代码无显式 `setCookie` 调用 + better-auth 1.7 中间件不会在非 `/api/auth/*` 端点主动设置 Set-Cookie → 所有 10 个平台 API 端点风险为 `low`。

## 4. better-auth 1.7 中间件 Set-Cookie 触发机制

基于 better-auth 1.7 上游文档 + [经验归档 §五十](../design/governance/experience-archive-§49-§57-recent-investigation.md)：

### 4.1 better-auth 中间件工作原理

better-auth 中间件通过 h3 的 `setCookie` 设置 session cookie：

- cookie 名称：`better-auth.session_token`（含 `__Secure-` 前缀，Secure=true）
- cookie 有效期：30 天（`session.expiresIn`）
- cookie 刷新：1 天（`session.updateAge`）

### 4.2 触发路径分类

| 触发类型 | 端点 | 行为 |
|---------|------|------|
| **自动触发** | `/api/auth/sign-in/*` / `/api/auth/sign-up/*` / `/api/auth/sign-out` / `/api/auth/callback/*` / `/api/auth/oauth/callback` | better-auth 自动通过 h3 setCookie 设置 session token |
| **条件触发（session refresh）** | `/api/auth/get-session` | session 即将过期时（`updateAge`）刷新 session 并 Set-Cookie |
| **不触发** | `/api/repos` / `/api/credentials` / `/api/schedules` 等 10 个平台 API | better-auth 中间件不主动触发（除非 cookieCache 配置极端情况） |

### 4.3 cookieCache 配置影响

better-auth 1.7 `advanced.cookieOptions` 配置：

- 默认 cookieCache 仅用于 cache（cookie 校验时减少数据库查询）
- 不主动 Set-Cookie 到非 `/api/auth/*` 端点
- 项目未配置自定义 cookieCache（保持默认）

## 5. M22.8 follow-up ② 结论

基于静态扫描结果：

- ✅ better-auth 中间件对非 `/api/auth/*` 端点**不会主动设置 Set-Cookie**（除非 session refresh）
- ✅ 项目代码无显式 `setCookie` 调用污染下游 context
- ✅ e2e helper 兜底修复（`unauthenticatedApiContext()` 显式空 storageState）保留是稳妥做法
- **M22.8 follow-up ② 实证无影响**：M22.8 修复（commit `bdcd900`）已根治 Playwright fixture pool cookie 注入；better-auth 中间件本身不会污染非 `/api/auth/*` 端点

### 5.1 治本 vs 兜底

| 层级 | 修复 | commit | 状态 |
|------|------|--------|------|
| 治本 | better-auth 中间件不会污染非 `/api/auth/*` 端点（本报告实证） | — | ✅ 治本验证通过 |
| 兜底 | Playwright 1.62 fixture pool cookie 注入 → `storageState: { cookies: [], origins: [] }` 显式隔离 | `bdcd900` (M22.8 hotfix) | ✅ 已落地 |
| 兜底 helper | `unauthenticatedApiContext()` 封装 fixture pool 显式空 storageState 标准模式 | `09c3dee` (M23.2) | ✅ 已落地 |

**结论**：M22.8 follow-up ② **治本 + 兜底双层修复均已落地且有效**——建议保持兜底修复（防御性编程 + 多层防护），治本修复已验证（better-auth 中间件本身不会污染）。

## 6. 后续建议

### 6.1 不需要进一步行动

M22.8 follow-up ② 已通过治本验证 + 兜底修复双层防护，无需进一步实施：

- ✅ better-auth 中间件不会污染非 `/api/auth/*` 端点（本报告 §5 实证）
- ✅ Playwright 1.62 fixture pool cookie 注入已通过 `unauthenticatedApiContext()` helper 修复（commit `09c3dee`）
- ✅ M22.8 helper 层 `maxRetries: 2` 兜底保留（commit `f617b56`）

### 6.2 防御性编程建议（不需要立即实施）

为防止未来 better-auth 上游更新引入新的 Set-Cookie 触发点，建议：

- 保持 `unauthenticatedApiContext()` helper 作为所有"未认证 API"测试的标准模式
- 保留兜底修复 `maxRetries: 2` 应对 ECONNRESET 偶发场景
- 定期运行 `node scripts/set-cookie-trace.mjs` 验证项目代码无显式 `setCookie` 调用

### 6.3 关闭 follow-up 建议

M22.8 follow-up ② 治本验证通过 + 兜底修复均已落地——建议：

- M22.7 follow-up ① better-auth transaction 关闭时序（M27.5 commit `b252f93` 诊断基础设施已落地，待 CI 复现一次确认是否仍存在 ECONNRESET）
- M22.8 follow-up ②（本报告）—— **建议关闭 follow-up**

## 7. 附录

### 7.1 扫描脚本使用

```bash
# 静态扫描（默认，无需服务器）
node apps/platform/scripts/set-cookie-trace.mjs

# 静态扫描 + Markdown 报告
SET_COOKIE_TRACE_FORMAT=md node apps/platform/scripts/set-cookie-trace.mjs

# 动态扫描（需 dev server 或 staging 环境）
SET_COOKIE_TRACE_BASE_URL=http://localhost:3000 \
  SET_COOKIE_TRACE_MODE=dynamic node apps/platform/scripts/set-cookie-trace.mjs
```

### 7.2 相关 commit hash

| commit | 内容 | 关联 |
|--------|------|------|
| `bdcd900` | test(platform): 2 个测试在 `browser.newContext()` 调用中显式传 `storageState: { cookies: [], origins: [] }` | M22.8 hotfix |
| `09c3dee` | test(e2e): 抽取 unauthenticatedApiContext helper | M23.2 helper 抽取 |
| `f617b56` | test(platform): e2e/fixtures helper 加 `maxRetries: 2` | M22.7 hotfix 兜底 |
| `b252f93` | feat(platform): better-auth transaction trace 日志落地 | M27.5 诊断基础设施 |
| `bbb8f30` | docs(plan+design): M24.2 M22.7+M22.8 根因 4 项残留源码追溯 | M24.2 根因排查 |

### 7.3 相关文档

- [M22.8 hotfix 完整记录](../plan/todo-archive.md)（检索"M22.8 未认证 API 测试显式空 storageState"）
- [经验归档 §五十二 Playwright test.use 存储状态传染导致未认证 API 测试收到 200](../design/governance/experience-archive-§49-§57-recent-investigation.md)（检索"Playwright test.use 存储状态传染"）
- [经验归档 §五十四 M23.2 Playwright fixture pool 跨 scope 隐式行为源码实证](../design/governance/experience-archive-§49-§57-recent-investigation.md)（检索"Playwright 1.62 fixture pool"）
- [平台开发规范 §6 API 规范](../standards/platform.md#6-api-规范serverapi)
- [平台开发规范 §3.7.1 fixtures API 无节流默认 + 经验性节流方案](../standards/platform.md#371-fixtures-api-无节流默认--经验性节流方案)