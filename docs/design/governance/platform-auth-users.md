# 平台认证与用户体系设计（M7.1 T701/T707）

> 状态：✅ 设计定稿（2026-08-09，待 Review Gate 审计）
> 任务归属：[todo.md §M7.1](../../plan/todo.md) T701（RBAC + 用户管理 + 个人界面）与 T707（认证扩展）
> 关联文档：[architecture.md 认证/国际化节](architecture.md)、[security.md](security.md)、[M7 规划决策（backlog.md §M7）](../../plan/backlog.md#m7-企业级平台增强)

## 1. 背景与目标

M6 最小平台 MVP 为单用户封闭模式（邮箱密码 + 首用户 admin + `REGISTRATION_DISABLED`）。M7.1 将平台从"单用户封闭"推进为"多用户 + 部署模式化认证"：

- **T701**：用户管理（列表/禁用/角色分配）、角色模型、个人界面。
- **T707**：第三方登录——企业模式（OIDC SSO + 邮箱域名白名单）与公开模式（GitHub/Google OAuth + 邮箱域名黑名单），部署模式互斥二选一（规划决策 D1/D2/D3）。

**非目标**（登记 backlog）：多租户（多组织）、邀请注册、审计日志、SAML 2.0、magic link / email OTP / 2FA / JWT 插件、组织管理 UI、T708 i18n（仅预留语言偏好联动点）。**username 插件与组织成员关系为对 T701 原文的微调**（详见 §11 决策点 2/3，需用户确认）。

## 2. 现状基线（M6 实测）

| 项 | 现状 |
|---|---|
| better-auth | 1.6.26；`emailAndPassword`（`disableSignUp` 由 `REGISTRATION_DISABLED` 控制）+ `user.additionalFields.role`（默认 `'user'`，`input: false` 防注入）+ 首用户 admin（`databaseHooks.user.create.before` count==0 置 `role='admin'`）+ 会话 30 天 |
| 守卫 | `server/utils/guard.ts`：`requireAuth`（401）/ `requireAdmin`（403，全局 role==='admin'） |
| 实体 | `User`（含 role/banned）；**无 Organization 实体**；`Repository` / `Credential` 均为全局数据（无组织归属） |
| 认证 API | `server/api/auth/[...].ts` 透传 `auth.handler` |
| 适配器 | 自定义 `typeorm-adapter.ts`（`createAdapterFactory`，按表名解析实体，雪花 ID 兜底）——新增实体须注册进 `server/database/index.ts` 的 `entities` 数组 |
| Schema | 开发环境 `synchronize: true` 自动建表（无 migration 基础设施；生产需 `DATABASE_SYNCHRONIZE=true`） |
| 前端 | `app/utils/auth-client.ts`（`createAuthClient`）、`app/middleware/auth.ts`（未登录跳 `/login`）、`login.vue` / `register.vue` / `layouts/default.vue` / `use-session.ts` |

**关键缺口**：组织概念未落地（Org Admin 角色无载体）；角色仅全局 admin/user；注册策略为全局布尔开关。

## 3. 设计决策

### 3.1 部署模式互斥（D1）

`AUTH_MODE` 环境变量（缺省 `public`，与当前开放注册语义对齐；enterprise 场景必须显式设置）：

| 模式 | 登录方式 | 注册准入 | 适用 |
|---|---|---|---|
| `enterprise` | 邮箱密码 + OIDC SSO | 白名单 `ALLOWED_EMAIL_DOMAINS`（空 = 关闭邮箱注册） | 企业内部单实例 |
| `public` | 邮箱密码 + GitHub / Google OAuth | 开放注册，黑名单 `BLOCKED_EMAIL_DOMAINS` 拒绝 | 公开平台 |

- **域名名单应用于所有注册渠道**（含 OAuth/SSO 自动开通账户）：enterprise 的 OIDC 用户邮箱域名不在白名单时拒绝开通（防止 IdP 未收口的邮箱进入）；public 的 GitHub/Google 用户邮箱命中黑名单时拒绝开通。语义统一、准入一致。
- `REGISTRATION_DISABLED` 保留为**总开关叠加层**（true 时所有注册渠道关闭，含自动开通；登录不受影响）。
- 未配置的登录方式自动禁用（沿用 M6 既有模式：SMTP 未配置跳过邮箱验证）。

### 3.2 组织模型：单组织 + 默认组织

- 新增 `Organization` 实体（最小形态：`id / name / createdAt`）。
- `Repository` / `Credential` 增加 `organizationId` 列（**声明为可空列**：开发默认 SQLite + `synchronize` 场景下，`ALTER TABLE ADD COLUMN` 不允许无默认值 NOT NULL 列，存量库加 NOT NULL 列会导致启动失败；应用层统一强制非空，见 §8 生命周期）。
- **存量数据迁移**：启动时确保默认组织存在（`dependfix-default`，名称 "Default"）；存量 Repository/Credential 自动挂入默认组织（幂等初始化，见 §8）。
- **多租户（多组织）登记 backlog**：M7.1 单组织下，Org Admin 角色作用于默认组织（= 组织内全部仓库/凭据）；成员/邀请/团队模型（better-auth organization 插件）不启用。

理由（减法模式）：单组织 + 全局角色已覆盖 M7.1 需求（企业内部/公开平台均为单实例单组织）；organization 插件引入 4 张新表 + 多组织 API 面 + adapter 适配，属 M7.1 非目标；多租户成为真实需求时再评估。

### 3.3 角色模型

全局角色（`user.role`），单组织下作用域覆盖默认组织：

| 角色 | 权限 | 备注 |
|---|---|---|
| `admin` | 用户管理（列表/禁用/角色分配）、全局配置、全部仓库/凭据管理 | 首用户自动 admin（保留 M6 行为） |
| `org_admin` | 组织下仓库/凭据管理、扫描触发、报告查看 | M7.1 单组织 = 全部仓库 |
| `viewer` | 只读查看（仪表板/告警/报告） | **默认注册角色** |

- **`repo_admin` 角色 M7.1 不实现**（对原 T701 定义的微调，见 §11 决策点 1）：仓库级权限需要 `RepositoryAccess` 关联表（多租户语义），单组织下与 org_admin 权限面重复；登记 backlog。
- 存量 `role='user'` 迁移为 `'viewer'`（§8）。
- 角色防注入保持 `input: false`；角色分配仅经 admin 管理 API。

### 3.4 better-auth 插件选型

| 能力 | 方案 | 依据（1.6.26 类型确认） |
|---|---|---|
| 用户管理 | **admin 插件** | `/admin/list-users`（分页 + searchQuery）、`/admin/set-role`、`/admin/ban-user`、`/admin/unban-user`、`/admin/remove-user`；`roles` 可自定义角色与权限 |
| 组织 | **自建 Organization 实体**（非 organization 插件） | 见 §3.2 |
| OIDC SSO | **genericOAuth 插件** | `config: GenericOAuthConfig[]`：`discoveryUrl`（OIDC discovery 自动发现）/ `issuer` + `requireIssuerValidation` / `clientId` / `clientSecret` / `scopes`；多 provider 数组 |
| GitHub / Google | 主配置 **socialProviders**（标准用法） | 未配置的 provider 自动隐藏（延续"未配置自动禁用"模式） |
| 个人界面 | 内置 API | `/link-social`、`listUserAccounts`、`unlinkAccount`、`changeEmail`、`changePassword` |
| username | **不启用**（非目标） | 用户管理按 email/name 即可 |

## 4. 数据模型

```
Organization (id / name / createdAt)
  └── 1:N → Repository (+ organizationId FK；逻辑非空，物理可空列，时序见 §8.1)
  └── 1:N → Credential (+ organizationId FK；逻辑非空，物理可空列，时序见 §8.1)

User (better-auth 默认 + role)
  └── role: 'admin' | 'org_admin' | 'viewer'（存量 'user' → 'viewer'）

Account / Session / Verification（better-auth 标准，不变）
```

变更清单：

| 文件 | 变更 |
|---|---|
| `server/entities/organization.ts` | **新增**：Organization 实体（BaseEntity 风格） |
| `server/entities/repository.ts` | 增加 `organizationId` 列（nullable）+ `ManyToOne(Organization)` |
| `server/entities/credential.ts` | 增加 `organizationId` 列（nullable）+ `ManyToOne(Organization)` |
| `server/database/index.ts` | entities 数组注册 Organization |
| `server/utils/organization.ts` | **新增**：`ensureDefaultOrganization()`（幂等创建默认组织 + 存量数据填充）+ `resolveOrganizationId()`（解析当前组织的唯一来源，创建路径填充用） |

## 5. 认证配置矩阵（env）

| env | 类型 | 影响 |
|---|---|---|
| `AUTH_MODE` | `enterprise \| public`（缺省 public） | 登录方式与注册准入策略 |
| `REGISTRATION_DISABLED` | boolean（保留） | 总开关：关闭所有注册渠道 |
| `ALLOWED_EMAIL_DOMAINS` | 逗号分隔（enterprise） | 白名单；空 = 关闭邮箱注册 |
| `BLOCKED_EMAIL_DOMAINS` | 逗号分隔（public） | 黑名单 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | public | GitHub OAuth；未配置自动隐藏 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | public | Google OAuth；未配置自动隐藏 |
| `OIDC_DISCOVERY_URL` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | enterprise | OIDC SSO（支持 `OIDC_ISSUER` / `OIDC_AUTHORIZATION_URL` / `OIDC_TOKEN_URL` / `OIDC_USERINFO_URL` / `OIDC_SCOPES` 覆盖，兼容无 discovery 的 IdP） |

> runtimeConfig 私有侧挂载（`authMode` / `allowedEmailDomains` / `blockedEmailDomains` / `oidc.*` / `github.*` / `google.*`），与现有 `authSecret` / `smtpEnabled` / `registrationDisabled` 并列；生产禁止默认密钥校验延续 `assertAuthSecret`。

## 6. API 与权限守卫

### 守卫扩展（`server/utils/guard.ts`）

- `requireAuth`（现有，不变）
- `requireRole(event, roles: Role[])`：取代 `requireAdmin`（`requireAdmin` 改为 `requireRole(event, ['admin'])` 的别名，向后兼容）
- `requireOrgResource(event, resourceOrganizationId)`：仓库/凭据写操作校验资源归属组织（单组织下即校验 organizationId === 默认组织；多租户扩展点）

### 业务 API 调整（角色门槛显式化）

| API | 角色门槛 | 变更 |
|---|---|---|
| `server/api/auth/[...].ts` | 公开 | 透传不变（admin 插件路由 `/api/auth/admin/*` 由插件内置守卫，`adminRoles: ['admin']` 与三角色模型对齐，见 §11 决策点 7） |
| `server/api/users/index.get.ts` / `[id].patch.ts` / `[id].delete.ts` | **写 = admin 读 = admin** | **新增**：代理 admin 插件（list-users / set-role / ban / unban / remove-user），`requireRole('admin')`；Zod 校验 + 统一错误语义（越权 403、资源不存在 404、业务冲突 409） |
| `server/api/repos/index.ts` / `credentials/index.ts` POST（创建） | **admin / org_admin** | `requireRole(['admin', 'org_admin'])` + `resolveOrganizationId()` 填充 organizationId（创建无资源 id，无归属校验对象） |
| `server/api/repos/[id].ts` / `credentials/[id].ts` PUT / DELETE | **admin / org_admin** | `requireRole(['admin', 'org_admin'])` + `requireOrgResource`（校验资源归属默认组织） |
| `server/api/repos/[id]/scan.post.ts` | **admin / org_admin** | `requireRole(['admin', 'org_admin'])` + `requireOrgResource` |
| `server/api/repos/*` / `credentials/*` / `alerts` / `runs` / `dashboard` 读 | **登录可读（含 viewer）** | `requireAuth`；按组织过滤（单组织行为不变） |
| `server/api/me/*`（个人界面） | **登录（本人）** | **新增**：`requireAuth`；基于 better-auth changePassword / changeEmail / listUserAccounts / link-social / unlinkAccount（详见 §7） |

> 写操作从 M6 的 `requireAuth` 收紧为 `requireRole(['admin', 'org_admin'])` 是**预期行为变更**（viewer 只读），见 §8.2 披露。

### 注册准入实现

`auth.ts` 的 `databaseHooks.user.create.before` 扩展：按 `AUTH_MODE` 校验 `user.email` 域名——

```
enterprise: 白名单非空且 email 域名 ∉ 白名单 → 抛错拒绝
public:     email 域名 ∈ 黑名单 → 抛错拒绝
REGISTRATION_DISABLED=true: 拒绝所有注册渠道——邮箱密码路径由
            emailAndPassword.disableSignUp 原生拦截（better-auth sign-up.mjs
            抛 BAD_REQUEST）；OAuth/SSO 自动开通路径 disableSignUp 不生效
            （callback.mjs / generic-oauth routes.mjs 中 disableSignUp 为
            provider 级 disableImplicitSignUp，非全局开关），统一由本 hook
            显式检查 REGISTRATION_DISABLED 拦截
```

- **单一拦截点假设已实证**：better-auth `createOAuthUser` 与 `createUser` 均经 `createWithHooks(data, 'user')` 触发 `user.create.before`，OAuth/SSO 自动开通与邮箱注册同源拦截；`REGISTRATION_DISABLED` 总开关、域名名单均在 hook 内判断（任何新注册渠道接入不会绕过准入）。
- **email 缺失 fail-closed**：OAuth/SSO 用户信息无 email（如 GitHub 私有邮箱）时**拒绝开通**（不静默放行、不生成占位邮箱）。
- **错误语义**：hook 抛错包装为 4xx（`EMAIL_DOMAIN_NOT_ALLOWED` → 403 + 用户可读提示），不落 500；`user.create.before` 抛 `APIError`（better-auth 支持）而非裸 Error。

## 7. 前端设计

| 页面 | 变更 |
|---|---|
| `login.vue` | 按 `AUTH_MODE` 展示登录方式（enterprise：邮箱密码 + OIDC 按钮；public：邮箱密码 + GitHub/Google 按钮）；未配置方式自动隐藏（服务端注入 `authOptions` 到 `useRuntimeConfig().public`） |
| `register.vue` | 展示注册策略提示（enterprise 白名单域提示）；`REGISTRATION_DISABLED` 时隐藏入口 |
| `users.vue` **新增** | 用户管理（admin）：列表/搜索、启用/禁用、角色分配（Dropdown：admin/org_admin/viewer） |
| `settings.vue`（个人界面）**新增** | 个人资料（name/email 展示）、修改密码、邮箱修改、第三方账号绑定状态（public 模式展示 GitHub/Google 绑定/解绑；enterprise 展示 OIDC 绑定状态）、语言偏好占位（T708 联动点） |
| `layouts/default.vue` | 导航按角色显示（admin 可见用户管理入口）；登录用户显示头像/姓名（含登出入口） |
| `middleware/auth.ts` | 保留未登录跳转；页面级角色守卫（`definePageMeta` 扩展 `roles`，`middleware/auth.ts` 内校验 role） |

## 8. 迁移与兼容

### organizationId 生命周期（B1 修复后定稿）

1. **建列**：synchronize 阶段 `organizationId` 为可空列（SQLite 约束：存量表不能加无默认值 NOT NULL 列；实测 `server/database/index.ts` L33/L37 开发默认 better-sqlite3 + `synchronize = isDev`）。
2. **初始化**（`ensureDefaultOrganization()`，幂等，`ensureDatabaseInitialized` 后调用）：无 Organization 时创建默认组织；`UPDATE repository SET organization_id = <default> WHERE organization_id IS NULL`；同 Credential。
3. **应用层强制非空**：创建路径（POST repos/credentials）经 `resolveOrganizationId()` 填充，杜绝新数据无归属（已实锤 M6 创建路径 `server/api/repos/index.ts` L69-79 仅 `repo.create({...})`，无组织概念——T701-1 必须为所有创建路径补填充）；更新/删除路径经 `requireOrgResource` 校验。
4. **验收用例**：SQLite 存量库（预置数据 + 无 organization_id 列）→ 启动 synchronize 建列 → 初始化填充 → 断言存量数据 organization_id 非空；新建数据 organization_id 非空。

### 其余迁移与兼容

1. **角色迁移**：`UPDATE user SET role = 'viewer' WHERE role = 'user'`（幂等；better-auth schema 层 user.role 默认值改为 `'viewer'`）。
2. **兼容性声明（修正）**：
   - 读操作行为不变（单组织下不过滤、viewer 可读）。
   - **写操作权限收紧是预期行为变更**：M6 仅 `requireAuth`（任何登录用户可创建仓库/凭据）→ M7.1 收紧为 `requireRole(['admin', 'org_admin'])`；存量 `role='user'` 用户迁移为 viewer 后将失去写权限——此变更随决策点向用户披露（§11 决策点 3）。
   - `REGISTRATION_DISABLED` 语义保留；首用户 admin 逻辑保留；SMTP 未配置自动跳过邮箱验证保留。
3. **回滚**：删除 Organization 表与归属列即可回到 M6 形态（开发期 synchronize 场景）；生产 PostgreSQL（M7.2 T705）前不引入 migration 框架，迁移脚本在 T705 一并落地。

## 9. 测试方案

| 测试 | 覆盖 |
|---|---|
| 权限矩阵（核心） | 三角色 × 主要 API（users/repos/credentials/runs/dashboard/me）访问矩阵用例：admin 全通、org_admin 管理仓库/凭据（写）、viewer 只读（写被拒 403）、未登录 401；创建路径角色门槛 + organizationId 填充断言 |
| 注册准入 | enterprise 白名单命中/未命中；public 黑名单命中/未命中；REGISTRATION_DISABLED 总开关；hook 拒绝路径（注册 + OAuth/SSO 自动开通）；email 缺失 fail-closed（拒绝开通）；拒绝错误为 4xx 非 500 |
| 认证流 | OIDC discovery 配置冒烟（mock discovery 端点）；GitHub/Google OAuth callback 冒烟（mock provider）；未配置方式隐藏 |
| 用户管理 | list-users 分页/搜索；set-role 越权拒绝（非 admin 403）；ban/unban 后会话失效；remove-user 级联行为（名下有关联资源时拒绝删除，见 §11 决策点 8） |
| 个人界面 | changePassword / changeEmail / listUserAccounts / link-social / unlinkAccount 闭环 |
| 迁移 | **SQLite 存量迁移实验**（B1 验收）：预置存量数据 + 无 organization_id 列 → 启动 synchronize 建列 → 初始化填充 → 断言存量 organization_id 非空；角色 'user'→'viewer' 迁移幂等 |
| 类型/质量门 | `pnpm typecheck` + `pnpm lint` + 定向 vitest（`apps/platform`） |

## 10. 实施拆分（对齐 todo.md §M7.1）

| 子任务 | 内容 | 提交粒度 |
|---|---|---|
| T701-1 数据层 | Organization 实体 + Repository/Credential.organizationId + 默认组织初始化（含 SQLite 存量迁移验收用例，§8.1 步骤 4）+ 角色迁移 + guard 扩展（requireRole/requireOrgResource）+ 权限矩阵测试 | 2-3 个提交 |
| T701-2 用户管理 | admin 插件接入 + `/api/users/*` 代理 + users.vue + 导航角色控制 | 2-3 个提交 |
| T701-3 个人界面 | `/api/me/*` + settings.vue + 布局头部用户区 | 2 个提交 |
| T707-1 部署模式与准入 | AUTH_MODE/域名名单 env + runtimeConfig + before hook 准入 + 登录页模式感知 | 2 个提交 |
| T707-2 OAuth | GitHub/Google socialProviders + 自动开通 + 登录页按钮 | 1-2 个提交 |
| T707-3 OIDC SSO | genericOAuth 插件接入 + OIDC_* env + 自动开通 + enterprise 登录页按钮 | 2 个提交 |

> 每子任务独立 Review Gate；单提交 diff 上限对齐经验归档 §二十四（新增 > 5 文件即再拆分）。

## 11. 风险与待确认决策点

| # | 决策点 | 建议 | 阻塞性 | 影响 |
|---|---|---|---|---|
| 1 | **repo_admin 角色 M7.1 不实现**（对 T701 原文微调） | 三角色（admin/org_admin/viewer）先行，repo_admin + RepositoryAccess 登记 backlog | **是** | 权限矩阵测试按三角色编写；T701-2 交付物范围 |
| 2 | **username 插件不启用**（对 T701 原文微调：T701 子任务 1 原文含 "`username`"） | 用户管理按 email/name 展示；username 登记 backlog | **是** | 无 user.username 字段与用户名设置 UI |
| 3 | **组织成员关系降级为单组织归属**（对 T701 原文微调：T701 验收含 "组织成员关系落地"） | Organization 实体仅 id/name/createdAt，无 member 表；成员关系 = Repository/Credential 的 organizationId 归属；多租户（organization 插件 + 成员/邀请）登记 backlog | **是** | todo.md T701 验收"组织成员关系落地"的重新解读（落地形态 = 资源归属 + 默认组织，非 membership 表）；**存量 user→viewer 迁移后写权限收回**（原 M6 任意登录用户可写，现收紧为 admin/org_admin，见 §8.2） |
| 4 | 单组织模型 + 默认组织迁移（organizationId 可空列 + 应用层强制非空） | 采纳 | 否 | 多租户登记 backlog（better-auth organization 插件届时评估） |
| 5 | 域名黑白名单应用于所有注册渠道（含 OAuth/SSO 自动开通）；email 缺失 fail-closed | 采纳 | 否 | 准入语义统一，hook 单一拦截点 |
| 6 | enterprise 模式邮箱密码注册：白名单为空 = 关闭邮箱注册；REGISTRATION_DISABLED 保留为总开关 | 采纳 | 否 | 注册策略矩阵 |
| 7 | admin 插件 `adminRoles: ['admin']`，与三角色模型对齐；`/api/auth/admin/*` 与 `/api/users/*` 代理双轨权限一致 | 采纳 | 否 | 避免双轨权限漂移（org_admin/viewer 不触发 admin 端点） |
| 8 | remove-user 级联：用户名下存在仓库/凭据关联时拒绝删除（409，提示先转移/删除资源） | 采纳 | 否 | 数据完整性；用户管理 API 错误语义 |
| 9 | 登录方式列表经 runtimeConfig public 注入前端（未配置隐藏） | 采纳 | 否 | 无硬编码 provider 列表 |
| 10 | SMTP 未配置时 OAuth/SSO 用户 emailVerified 视为 true（better-auth 默认），邮箱密码用户维持现状（不强制验证） | 采纳 | 否 | 与 M6 行为一致 |

**安全注意**：OIDC `requireIssuerValidation: true`（防 issuer 混淆）；OAuth/SSO 自动开通账户默认 viewer 角色；角色字段 `input: false` 持续防注入；`AUTH_SECRET` 生产校验不变；注册准入 hook 抛错包装为 4xx（`EMAIL_DOMAIN_NOT_ALLOWED` → 403）而非 500。
