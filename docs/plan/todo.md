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
- 依赖：T701；设计文档 [platform-auth-users.md](../design/governance/platform-auth-users.md)（2026-08-09 Review Gate Pass）
- 交付物：多登录方式 + 部署模式互斥配置 + 注册准入控制。
- 实现内容：
  - [ ] 子任务 1（部署模式与准入）：`AUTH_MODE=enterprise|public` 互斥配置（缺省 public）；注册策略从 `REGISTRATION_DISABLED` 演进——保留为总开关（关闭所有注册渠道，OAuth/SSO 自动开通路径由 `user.create.before` hook 显式拦截）；邮箱域名白名单（enterprise）/ 黑名单（public）注册拦截（hook 单一准入点，覆盖邮箱注册与自动开通全渠道）；OAuth/SSO email 缺失 fail-closed（拒绝开通）
  - [ ] 子任务 2（OAuth）：GitHub OAuth + Google OAuth（public 模式；未配置对应环境变量时自动禁用该登录方式，不阻塞启动；登录方式列表经 runtimeConfig public 注入前端）
  - [ ] 子任务 3（OIDC SSO）：enterprise 模式；better-auth `genericOAuth` 插件（`OIDC_DISCOVERY_URL` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET`，支持 `OIDC_ISSUER` 等覆盖，`requireIssuerValidation: true`）；登录页多方式展示与禁用态联动
- 非目标：SAML 2.0（登记 backlog）、magic link / email OTP / 2FA / JWT 插件（架构预设，未排期）、OIDC 自动开通账户的域名匹配细节（随白名单策略随子任务 1 落地）。
- 验收：
  - [ ] enterprise 模式：OIDC 登录闭环；非白名单域名邮箱注册被拒（403 EMAIL_DOMAIN_NOT_ALLOWED 非 500）
  - [ ] public 模式：GitHub / Google 登录闭环；黑名单域名邮箱注册被拒；email 缺失拒绝开通
  - [ ] `REGISTRATION_DISABLED=true` 时所有注册渠道（含 OAuth/SSO 自动开通）均拒绝
  - [ ] 未配置的登录方式在登录页自动隐藏/禁用，不阻塞启动
- 任务粒度：3 个子任务独立提交。

---

## 当前状态

- **规划状态**：M7 规划定稿（64efbb3e）→ M7.1 任务上收（23a9058b）→ 设计先行 [platform-auth-users.md](../design/governance/platform-auth-users.md) 完成（b0a0d33b，Review Gate 两轮 Pass）→ 决策 D1/D2/D3 用户确认（ac4ef8c0）。**T701 全部完成**（提交 5811e524 + 8d515aa8 + 2c2620e6 + dc712df1 + ce36ec37 + a115e351 + 781d3fa5）：子任务 1/2/3 与全部验收点落地，浏览器视觉验证 8/8 PASS（含 SSR 会话修复）。**平台增强（2026-08-10，未排期上收）**：仓库批量导入（GitHub 仓库列表多选导入，`GET /api/repos/importable` + `POST /api/repos/batch` + repos.vue 批量导入对话框）；platform e2e 测试基建（Playwright 22 用例覆盖全部页面关键功能点 + CI e2e job）。**当前为 T707 实施前状态**（依赖 T701，待推进）。
- **已知边界**：
  - M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限）。
  - Publish Docker 工作流 build job 在 QEMU 双平台构建中 1h19m 被同 ref 新 push 取消，镜像构建 CI 链路未裁决通过，排查项见 [backlog.md §M6](backlog.md)（C30）。
  - security.md 凭据加密存储章节未补（[backlog.md §M6](backlog.md) C28）。
  - 平台 UI 暗色模式不可用（暂缓，后续优化，[backlog.md §M6](backlog.md) C29）。
