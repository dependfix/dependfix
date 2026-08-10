# 当前阶段任务（M7.1：认证与用户体系）

> M0-M6 已完成并归档，见 [todo-archive.md](todo-archive.md) 与 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)。
> **M7 规划定稿（2026-08-09）**：拆 M7.1 认证与用户体系 / M7.2 平台能力深化；规划决策（AUTH_MODE 互斥二选一 / OIDC / 执行顺序）与 M7.2 任务定义见 [backlog.md §M7](backlog.md#m7-企业级平台增强)。

---

## M7.1: 认证与用户体系

### T701 RBAC 权限管理 + 用户管理 + 个人界面

- 优先级：`P2`
- 依赖：M6；设计文档 [platform-auth-users.md](../design/governance/platform-auth-users.md)（2026-08-09 Review Gate Pass）
- 交付物：角色权限系统 + 用户管理界面 + 个人设置界面。
- 实现内容：
  - [x] 子任务 1（数据层）：单组织归属（Organization 实体 + Repository/Credential.organizationId + 默认组织初始化 + 存量迁移）；角色模型（**Admin / Org Admin / Viewer 三角色**，repo_admin 登记 backlog——决策 D1）；better-auth `admin` 插件（**不含 username——决策 D2**）；角色迁移（存量 'user' → 'viewer'）+ guard 扩展（requireRole / requireOrgResource）+ 权限矩阵测试
  - [x] 子任务 2（管理 UI）：用户列表/搜索、启用/禁用、角色分配 + server 中间件与页面路由守卫
  - [x] 子任务 3（个人界面）：个人资料（头像/显示名）、修改密码/邮箱、第三方账号绑定、语言偏好（与 T708 联动）
- 非目标：审计日志、邀请注册机制（登记 backlog）、T707 的第三方登录本身、repo_admin/username/多租户成员体系（登记 backlog，设计决策 D1/D2/D3）。
- 验收：
  - [x] 权限矩阵测试：三角色登录后仅能访问权限范围内的 API 与页面（viewer 写操作 403）——guard 层 11 例覆盖函数语义（admin 全通、org_admin 放行 [admin,org_admin] 拒 admin-only、viewer 403、未登录 401）；页面级守卫经浏览器验证（非 admin 访问 /users 跳 /dashboard）；端点级矩阵登记 backlog 补强
  - [x] Admin 可完成用户管理闭环（列表/禁用/角色分配）；用户可编辑个人资料与偏好——浏览器验证 8/8 通过（用户列表/角色 Dropdown/禁用删除、个人设置五卡片、绑定账号过滤、修改资料/密码/邮箱）
  - [x] 组织归属落地（决策 D3 解读）：Repository/Credential 挂 organizationId + 默认组织迁移（SQLite 存量用例），凭据按组织归属隔离（架构文档 M7 预设）——organization.test.ts 8 例实证（存量填充/幂等/并发安全/归属不覆盖/角色迁移）
  - [x] 写操作权限收紧为 admin/org_admin（预期行为变更，存量 user→viewer 披露）——repos/credentials/scan 写路径全部 requireRole(['admin','org_admin']) + requireOrgResource；设计文档 §8.2 披露
- 任务粒度：3 个子任务独立提交（对齐经验归档 §二十四）。

### T707 认证扩展：OIDC SSO / GitHub·Google OAuth / 邮箱域名黑白名单

- 优先级：`P2`
- 依赖：T701；设计文档 [platform-auth-users.md](../design/governance/platform-auth-users.md)（2026-08-09 Review Gate Pass，§5 env 矩阵 / §6 准入实现 / §10 实施拆分）
- 交付物：多登录方式 + 部署模式互斥配置 + 注册准入控制。
- 实现内容：
  - [x] 子任务 1（部署模式与准入）：`AUTH_MODE=enterprise|public` 互斥配置（缺省 public）；注册策略从 `REGISTRATION_DISABLED` 演进——保留为总开关（关闭所有注册渠道，OAuth/SSO 自动开通路径由 `user.create.before` hook 显式拦截）；邮箱域名白名单（enterprise）/ 黑名单（public）注册拦截（hook 单一准入点，覆盖邮箱注册与自动开通全渠道）；OAuth/SSO email 缺失 fail-closed（拒绝开通）
    - 执行步骤：
      - [x] 新增 `apps/platform/server/utils/email-domain.ts`：`extractDomain(email)` / `isEmailDomainAllowed(email, mode, list)` 纯函数（不依赖 DataSource，便于单元测试）
      - [x] `apps/platform/nuxt.config.ts` runtimeConfig 扩展：私有 `authMode` / `allowedEmailDomains`（逗号分隔转数组）/ `blockedEmailDomains`；public `authMode`（供前端登录页模式感知）
      - [x] `apps/platform/server/utils/auth.ts`：`buildAuth` options 接收 `authMode` / `allowedEmailDomains` / `blockedEmailDomains`；`getAuth` 从 runtimeConfig 注入；启动校验 `authMode ∈ {enterprise, public}`（非法值抛错）
      - [x] `apps/platform/server/utils/auth.ts` `databaseHooks.user.create.before` 准入检查顺序（设计决策点 11）：① 首用户 admin（`count==0` → 设置 `role='admin'` → **直接返回，不走准入检查**）→ ② `REGISTRATION_DISABLED=true` 抛 `APIError` 4xx 拦截全渠道（邮箱已由 disableSignUp 前置拦截，此处兜底 OAuth/SSO 自动开通） → ③ `!user.email` fail-closed 抛 `APIError('EMAIL_REQUIRED')` → ④ enterprise 白名单未命中 / public 黑名单命中抛 `APIError('EMAIL_DOMAIN_NOT_ALLOWED')` 403）
      - [x] `apps/platform/server/utils/auth.ts` `disableSignUp` 保持仅 `registrationDisabled`（**P1-1 修订**：enterprise 白名单空**不**合并进 disableSignUp——sign-up 端点级拦截发生在 hook 之前，会阻断首用户 admin bootstrap；白名单准入统一由 `user.create.before` hook 拒绝（决策点 6/11，hook 单一准入点））
      - [x] `apps/platform/app/pages/register.vue`：enterprise + 白名单非空时展示"仅接受 @域名 邮箱"提示；`REGISTRATION_DISABLED` 时隐藏注册入口（已有错误提示映射，补入口隐藏）
      - [x] `apps/platform/app/pages/login.vue`：读 `useRuntimeConfig().public.authMode`，为 OAuth/SSO 按钮预留占位容器（子任务 1 仅搭骨架，按钮本体在子任务 2/3 填充）
      - [x] `apps/platform/.env.example` 补充 `AUTH_MODE` / `ALLOWED_EMAIL_DOMAINS` / `BLOCKED_EMAIL_DOMAINS` 注释样例
      - [x] 新增 `apps/platform/server/utils/email-domain.test.ts`：纯函数边界（空名单、大小写、子域、多域、email 缺失）
      - [x] 新增 `apps/platform/server/utils/auth-access.test.ts`：hook 准入路径单元测试（mock `userRepo.count` + 注入 user）——REGISTRATION_DISABLED 拒绝、email 缺失拒绝、enterprise 白名单命中/未命中、public 黑名单命中/未命中、首用户 admin 不被准入拦截覆盖
    - 受影响文件：`server/utils/email-domain.ts`（新）/ `server/utils/auth.ts` / `nuxt.config.ts` / `app/pages/{login,register}.vue` / `.env.example` / `server/utils/email-domain.test.ts`（新）/ `server/utils/auth-access.test.ts`（新）
    - 技术约束：
      - hook 抛 better-auth `APIError` 而非裸 Error，保证 4xx 非 500（`EMAIL_DOMAIN_NOT_ALLOWED` → 403）
      - `user.create.before` 是邮箱注册与 OAuth/SSO 自动开通的单一拦截点（设计文档 §6 实证：`createOAuthUser` 与 `createUser` 均经 `createWithHooks`）
      - 边界条件已确认（决策点 6 修订 + 决策点 11，2026-08-10 用户确认）：enterprise 白名单为空 = 完全关闭自动开通（邮箱 `disableSignUp` + OIDC hook 拒绝），仅允许 admin 手动创建与首用户路径（首用户经 hook `count==0` 放行，不走准入检查）
    - 提交粒度：2 个提交（① server 准入逻辑 + 单元测试；② 前端模式感知 + env 文档）
  - [x] 子任务 2（OAuth）：GitHub OAuth + Google OAuth（public 模式；未配置对应环境变量时自动禁用该登录方式，不阻塞启动；登录方式列表经 runtimeConfig public 注入前端）
    - 执行步骤：
      - [x] `apps/platform/nuxt.config.ts` runtimeConfig 扩展：私有 `github.clientId` / `github.clientSecret` / `google.clientId` / `google.clientSecret`（从 env）；public `githubAvailable` / `googleAvailable`（由 env 是否配置决定，前端按钮显隐；仅基于根级 env 判断，与服务端读取通道一致）
      - [x] `apps/platform/server/utils/auth.ts`：`buildAuth` options 增加 github/google 配置；`socialProviders` 条件化注入（`clientId` 均存在才加该 provider，未配置不阻塞启动、不暴露端点），返回值走 better-auth 主配置（非插件）
      - [x] `apps/platform/app/utils/auth-client.ts`：socialProviders 客户端无需额外插件（`signIn.social` 原生支持 github/google）
      - [x] `apps/platform/app/pages/login.vue`：`authMode === 'public'` && `githubAvailable` → 显示"GitHub 登录"按钮；`googleAvailable` → "Google 登录"按钮；`@click` 调 `authClient.signIn.social({ provider: 'github', callbackURL: '/dashboard' })`（按钮决策提取为 `app/utils/social-providers.ts` 纯函数 + 5 例单测）
      - [x] `apps/platform/.env.example` 补充 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`（含回调 URL 由请求 Host 推断的说明）
      - [x] e2e `apps/platform/tests/e2e/auth.e2e.test.ts` 补按钮可见性用例（authMode=public + 未配置 env → 隐藏；配置 → 显示由单测覆盖，真实 provider 闭环登记人工验收）
    - 受影响文件：`server/utils/auth.ts` / `nuxt.config.ts` / `app/pages/login.vue` / `.env.example` / `tests/e2e/auth.e2e.test.ts`
    - 技术约束：
      - 回调 URL 由 better-auth 固定为 `${baseURL}/api/auth/callback/{provider}`（不可被客户端覆盖；与 `NUXT_PUBLIC_BETTER_AUTH_URL` 联动，反代/容器部署需对齐）
      - OAuth 自动开通走 `user.create.before` hook（与子任务 1 准入协同：域名黑名单 + email 缺失 fail-closed 自动生效）
      - OAuth 用户默认 viewer 角色（admin 插件 `defaultRole: 'viewer'` 已设）
    - 提交粒度：1-2 个提交（① server socialProviders 条件化 + 配置；② 前端按钮 + e2e 可见性）
  - [x] 子任务 3（OIDC SSO）：enterprise 模式；better-auth `genericOAuth` 插件（`OIDC_DISCOVERY_URL` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`，支持 `OIDC_ISSUER` 等覆盖，`requireIssuerValidation: true`）；登录页多方式展示与禁用态联动
    - 执行步骤：
      - [x] `apps/platform/nuxt.config.ts` runtimeConfig 扩展：私有 `oidc.discoveryUrl` / `oidc.clientId` / `oidc.clientSecret` / `oidc.issuer` / `oidc.authorizationUrl` / `oidc.tokenUrl` / `oidc.userInfoUrl` / `oidc.scopes`（仅 discoveryUrl/clientId/clientSecret 必需，其余覆盖）；public `oidcAvailable`（由 `OIDC_DISCOVERY_URL` 是否配置决定；实际实现为 discovery/issuer + clientId + clientSecret 齐全）
      - [x] `apps/platform/server/utils/auth.ts`：`plugins` 数组条件化新增 `genericOAuth({ config: [{ providerId: 'oidc', discoveryUrl, clientId, clientSecret, scopes: ['openid','profile','email'], requireIssuerValidation: true, ...覆盖项 }] })`（`oidcEnabled` 条件与前端 `oidcAvailable` 同构；discovery 存在时覆盖手动端点；issuer 同时配置时作强校验值）
      - [x] `apps/platform/app/utils/auth-client.ts`：`plugins` 新增 `genericOAuthClient()`（客户端 OIDC 登录类型面；better-auth/client/plugins 导出，未配置 OIDC 时无副作用）
      - [x] `apps/platform/app/pages/login.vue`：`authMode === 'enterprise'` && `oidcAvailable` → 显示"OIDC SSO 登录"按钮；`@click` 调 `authClient.signIn.social({ provider: 'oidc', callbackURL: '/dashboard' })`（social-providers.ts 扩展 oidcAvailable 分支 + 2 例单测）
      - [x] `apps/platform/.env.example` 补充 `OIDC_DISCOVERY_URL` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` / `OIDC_ISSUER` / `OIDC_SCOPES` 等（含 RFC 9207 iss 回显前置说明）
      - [x] 测试：OIDC discovery 配置冒烟（mock discovery 端点返回标准 OIDC config，断言 provider 注册）；自动开通走 hook 准入校验——**降级**：真实 IdP 全链路验证依赖真实凭据，登记人工验收（P3-3）；前端决策由 social-providers 单测覆盖
      - [x] e2e `apps/platform/tests/e2e/auth.e2e.test.ts` 补 OIDC 按钮可见性用例（enterprise 模式 + 未配置 → 隐藏；配置 → 显示）——e2e 覆盖未配置隐藏（当前 env），配置显示由单测覆盖
    - 受影响文件：`server/utils/auth.ts` / `nuxt.config.ts` / `app/utils/auth-client.ts` / `app/pages/login.vue` / `.env.example` / `tests/e2e/auth.e2e.test.ts`
    - 技术约束：
      - `requireIssuerValidation: true` 防 issuer 混淆（设计文档 §11 安全注意）
      - 回调 URL 由 better-auth 固定为 `${baseURL}/api/auth/oauth2/callback/oidc`
      - 覆盖项支持无 discovery 的 IdP（手动声明 `authorizationUrl` / `tokenUrl` / `userInfoUrl`）
      - `overrideUserInfo` 默认 false（不在每次登录覆盖本地用户资料，对齐"一旦本地用户创建即稳定"语义）
      - 客户端必须注册 `genericOAuthClient()`，否则 `signIn.social({ provider: 'oidc' })` 无对应类型面
    - 提交粒度：2 个提交（① server genericOAuth 插件 + 配置；② 前端按钮 + auth-client 插件 + e2e 可见性）
- 非目标：SAML 2.0（登记 backlog）、magic link / email OTP / 2FA / JWT 插件（架构预设，未排期）、OIDC 自动开通账户的域名匹配细节（随白名单策略随子任务 1 落地）。
- 验收：
  - [ ] enterprise 模式：OIDC 登录闭环；非白名单域名邮箱注册被拒（403 `EMAIL_DOMAIN_NOT_ALLOWED` 非 500）
  - [ ] public 模式：GitHub / Google 登录闭环；黑名单域名邮箱注册被拒；email 缺失拒绝开通
  - [ ] `REGISTRATION_DISABLED=true` 时所有注册渠道（含 OAuth/SSO 自动开通）均拒绝
  - [ ] 未配置的登录方式在登录页自动隐藏/禁用，不阻塞启动
  - [ ] 单元测试：`email-domain.test.ts` + `auth-access.test.ts` 全过；e2e 按钮可见性用例通过
- 任务粒度：3 个子任务独立提交（总 5-6 提交，单批 ≤ 10 文件 / ≤ 800 行新增，对齐经验归档 §二十四）。
- 风险与对策：
  - **better-auth 1.6.26 genericOAuth 插件 API 形态**：已用 context7 v1.6.23 文档复核 `discoveryUrl` / `requireIssuerValidation` / `overrideUserInfo` 默认 false；实现时再验 `genericOAuthClient` 客户端类型面与 `signIn.social` provider id 匹配
  - **首用户 admin 路径与准入顺序**（决策点 11 已确认，2026-08-10）：首用户 admin 设置在 hook 开头先于准入检查（`count==0` → 设置 `role='admin'` → **直接返回，不走** `REGISTRATION_DISABLED`/域名名单/email 缺失检查）；确保系统在任何 `AUTH_MODE`/名单配置（含 enterprise 白名单空）下都能创建首个管理员。`disableSignUp` 条件化合并 `registrationDisabled || (enterprise && 白名单空)` 时，首用户在开放期注册不受影响（`disableSignUp` 仅拦截邮箱注册表单，首用户注册后可关闭）
  - **OAuth 回调与生产 cookie 前缀**：wisdom 记录生产模式 `__Secure-` cookie 前缀 + Origin 校验；OAuth 回调跨域需确认 Origin 头处理（better-auth 1.6.26 已对无 Origin 头拒绝）
  - **e2e 不可真实走 OAuth/SSO**：仅验证按钮可见性 + mock callback 冒烟；真实 provider 登录闭环依赖手动验收或 staging 环境
- 复用与基线锚点：
  - 设计文档权威：[platform-auth-users.md §5 env 矩阵](../design/governance/platform-auth-users.md) / [§6 准入实现](../design/governance/platform-auth-users.md) / [§10 实施拆分](../design/governance/platform-auth-users.md)
  - 现状基线：T701 已落地 admin 插件（三角色 + `defaultRole: 'viewer'`）+ `databaseHooks.user.create.before`（首用户 admin）+ changeEmail 配置；`settings.vue` `PROFILE_LABELS` 已前瞻预留 github/google/oidc
  - better-auth API（context7 1.6.23 复核）：`socialProviders` 主配置 / `genericOAuth({config:[...]})` 插件 / `signIn.social({provider, callbackURL})` 客户端；回调 URL 由 better-auth 固定为 `${baseURL}/api/auth/callback/{provider}`（social）与 `${baseURL}/api/auth/oauth2/callback/{providerId}`（genericOAuth）
  - 测试基建：单元 `server/utils/*.test.ts`（无 auth-access 测试需新建）；e2e `tests/e2e/auth.e2e.test.ts` + `helpers/auth.helper.ts`（global-setup 注册 admin/viewer）
  - 邮件发送器三处回调空实现（M6 既有降级模式，已登记 backlog）——T707 不引入邮件依赖，OAuth/SSO 自动开通 `emailVerified` 视为 true（better-auth 默认，设计决策点 10）

---

## 当前状态

- **规划状态**：M7 规划定稿（64efbb3e）→ M7.1 任务上收（23a9058b）→ 设计先行 [platform-auth-users.md](../design/governance/platform-auth-users.md) 完成（b0a0d33b，Review Gate 两轮 Pass）→ 决策 D1/D2/D3 用户确认（ac4ef8c0）。**T701 全部完成**（提交 5811e524 + 8d515aa8 + 2c2620e6 + dc712df1 + ce36ec37 + a115e351 + 781d3fa5）：子任务 1/2/3 与全部验收点落地，浏览器视觉验证 8/8 PASS（含 SSR 会话修复）。**平台增强（2026-08-10，未排期上收）**：仓库批量导入（GitHub 仓库列表多选导入，`GET /api/repos/importable` + `POST /api/repos/batch` + repos.vue 批量导入对话框）；platform e2e 测试基建（Playwright 22 用例覆盖全部页面关键功能点 + CI e2e job）。**T707 规划已细化**（2026-08-10）：子任务 1/2/3 执行步骤、受影响文件清单、技术约束、风险与对策、复用基线锚点均已落地本文件 T707 段落，可进入 D 阶段实施 T707-1。
- **已知边界**：
  - M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
  - Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
  - security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
  - 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
