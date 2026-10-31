# 项目架构设计 分片：平台架构与端到端 AI 研判集成（architecture.md §11-§13）

> 本分片自 [architecture.md](./architecture.md) 按连续尾部章节迁出（章节编号全局唯一、跨文件稳定）；文中 `§N` 除显式标注文件路径者外，均指本分片或主文档的同名章节。

## 平台架构（apps/platform）

平台分两个阶段交付：

- **M6（最小平台 MVP）**：仓库 CRUD + 凭据管理 + 手动扫描 + 仪表板 + 单用户 + Docker Compose/SQLite（已交付 2026-08-08）
- **M7.1（认证与用户体系）**：RBAC 三角色（admin/org_admin/viewer）+ 用户管理 + 个人界面 + 认证扩展（AUTH_MODE 互斥：OIDC SSO / GitHub·Google OAuth / 域名黑白名单）；单组织模型（默认组织）——规划定稿 + 设计先行完成（2026-08-09）
- **M7.2（平台能力深化）**：BullMQ/Redis 任务队列 + 定时批量 + i18n + 生产部署（PostgreSQL/Helm/Sentry）+ 跨平台 Git + MCP 发布（见 [archive/todo-archive-phases-m6-m7-t711.md §M7.2](../../plan/archive/todo-archive-phases-m6-m7-t711.md#m7-2-平台能力深化-已归档)）

### 分层架构

```
apps/platform/
├── pages/                    # Vue 3 页面
│   ├── dashboard/            # 总览仪表板
│   ├── repos/                # 仓库管理（列表/详情/配置）
│   ├── alerts/               # 告警视图（按仓库/按严重级别/按来源）
│   ├── runs/                 # 执行历史与报告
│   └── settings/             # 组织设置、凭据管理
├── server/
│   ├── api/                  # REST API
│   │   ├── repos/            # CRUD + 触发扫描
│   │   ├── alerts/           # 查询、过滤、修复状态
│   │   ├── runs/             # 扫描历史、报告
│   │   └── auth/             # better-auth
│   ├── services/             # 业务逻辑层
│   │   ├── repo-sync.service    # 仓库自动发现与同步
│   │   ├── scan-orchestrator    # 扫描编排（调用 core 包）
│   │   ├── credential.service   # Token 加密/解密
│   │   └── notification.service # 通知
│   └── queue/                # BullMQ（M7）
└── packages/shared/          # 前后端共享类型
```

### 核心数据模型

```
Organization (id / name / plan / createdAt)
  └── 1:N → Repository
              ├── owner / repo / platform(github)
              ├── defaultBranch / packageManager
              ├── credentialId → Credential (encryptedToken)
              └── 1:N → ScanRun
                          ├── mode / severityThreshold / status
                          ├── startedAt / finishedAt / summary
                          └── 1:N → ScanResult
                                      ├── alertId / source / severity
                                      ├── packageName / fixable / fixStrategy
                                      └── recommendedVersion / errorMessage
```

### 平台与现有 packages 的关系

```
packages/cli (dependfix)
    → 被 apps/platform/server/services/scan-orchestrator 引用
    → 平台模式下不用 CLI 参数解析，直接调用编排核心
    → 需要将 runCli 拆为"纯函数编排"和"CLI 入口"两层（T505）

packages/core (@dependfix/core)
    → apps/platform 直接依赖
    → 共享类型：NormalizedSecurityAlert, ToolchainInfo, ExecutionSummary
```

### 扫描调度策略（M7）

```
触发方式：
├── 手动触发（Web UI 点击）
├── 定时触发（cron，组织级配置）
└── 批量触发（选择多个仓库一次执行）

并发控制：
├── 全局最大并发数（如 5）
├── 单仓库互斥（同仓库同时只能一个扫描）
└── 优先级：手动 > 定时 > 批量
```

### 前端

- Vue 3 Composition API + `<script setup lang="ts">`
- caomei-ui + 自定义主题（暗色模式支持）
- SCSS + BEM 命名规范
- 移动端做适当响应式优化，但不是首要目标

### 后端

- Nuxt Server Routes 作为 REST API
- better-auth 处理认证会话
- TypeORM 实体 + 数据库迁移
- SQLite（M6 开发/部署）/ PostgreSQL（M7 生产）
- Zod 校验输入
- BullMQ + Redis 任务调度（M7）

### 凭据安全

- GitHub 凭据（PAT 或 GitHub App PEM 私钥）使用平台级密钥（环境变量 `NUXT_ENCRYPTION_KEY`）做 AES-256-GCM 加密后存储——M17.1 C38 标准化 + M18.3 接入 GitHub App 路径
- 凭据类型双轨并存：
  - **PAT 路径**（默认）：`type='classic-pat' | 'fine-grained-pat'`，加密字段 `encryptedToken`，commit author 固定 `dependfix[bot]`
  - **GitHub App 路径**（自部署多仓 org 推荐）：`type='github-app'`，加密字段 `encryptedPrivateKey`（PEM 私钥），commit author 动态生成 `{app_id}+{bot_login}[bot]@users.noreply.github.com`（GitHub App 协议要求）
- 解密仅在任务执行时、在 worker 内存中进行，用完即丢弃；token / privateKey 明文永不落库、永不进日志、永不进前端响应（API 返回 `hasToken` 布尔）
- 完整设计与落地步骤见 [C22 PAT 无感升级评估](./c22-pat-backward-compat.md)
- M6 单用户模式下凭据管理简化；M7 多用户模式下按组织隔离

### 暗色模式

- 通过 `<html>` 上的 `.dark` CSS class 切换
- caomei-ui 主题按 `caomeiUI.darkMode: 'class'` 跟随 `<html>` 上的 `.dark` 切换
- SCSS 使用 `:global(.dark) .selector` 覆盖样式
- 跟随系统偏好 + 用户手动切换

### 国际化（M7）

- 最低支持：简体中文（zh-CN，默认）+ 英文（en-US）
- 可扩展：zh-TW、ja-JP、ko-KR
- URL 策略：`prefix_and_default`（zh-CN 无前缀，en-US 加 `/en`）
- 语言检测：Cookie + 浏览器偏好 + URL

> M7.2 T708 任务定义与验收见 [M7.2](../../plan/archive/todo-archive-phases-m6-m7-t711.md#m7-2-平台能力深化-已归档)。

### 认证

- better-auth 为核心
- M6：邮箱密码 + 邮箱验证（单用户模式）
- M7 扩展（设计详见 [platform-auth-users.md](platform-auth-users.md)，2026-08-09 定稿）：
  - 插件：admin（用户管理，M7.1 启用）、genericOAuth（OIDC SSO，M7.1 启用）；username、magicLink、emailOTP、twoFactor、jwt 为架构预设但**未排期**（username 明确不启用——设计决策 D2）
  - 第三方登录：GitHub OAuth、Google OAuth（可选，未配置环境变量时自动禁用对应登录方式）
  - 未配置的第三方登录方式自动禁用，不阻塞启动
  - **部署模式互斥（2026-08-09 M7 规划决策）**：`AUTH_MODE=enterprise|public` 二选一，不混合——`enterprise`（企业内部）：OIDC SSO（better-auth `genericOAuth`，Azure AD / Okta / Keycloak / Google Workspace）+ 邮箱域名白名单注册准入；`public`（公开平台）：GitHub / Google OAuth + 邮箱域名黑名单注册准入。SAML 2.0 不实现（登记 backlog）
- 数据库适配器：TypeORM Adapter
- 会话：数据库持久化 + Cookie，过期 30 天，每日更新
- JWT 算法：EdDSA / Ed25519
- RBAC：M7 实现角色模型（Admin / Org Admin / Repo Admin / Viewer）

详见 [安全设计](security.md)。

## 主要风险与应对

| 风险 | 应对 |
|------|------|
| 自动修复误伤业务 | 默认只创建分支/PR 不自动合并；限制 major 升级；强制最小验证 |
| GitHub API 限流 | 批量分页拉取；并发控制；报告中记录被限流情况 |
| lockfile 修复不稳定 | 固定 Node 与 pnpm 版本；保存安装日志与 lockfile diff |
| Code Scanning 范围过大 | 首期只开放白名单规则；未命中白名单只做建议输出 |
| AI 研判误判 | AI 修复代码必须通过 install/lint/build/typecheck/test；PR 不自动合并；置信度低于阈值时仅输出建议；限制 patch 范围 |
| Prompt 注入攻击 | 限制触发权限为管理员；输入仅限结构化数据；系统指令硬编码；外部内容做清洗 |
| 多租户安全 | 仓库间数据隔离；用户 Token 加密存储；操作审计日志完整记录 |
| **监测系统 vs 自动合并解耦**（M24.1 关键决策 D8）| 依赖监测系统（PRCheck）**不**阻断 mergify 自动合并决策：`mergify 负责通过即合`（按同批全部 PR job 的 `check-success` 触发 rebase merge：Test / Coverage / E2E / Visual Regression）；`PRCheck 负责失败即显`（监测 + alert firing + ack UI）——两条链路**互不干扰**，监测 alert firing 仅记录 alert_event 写库 + UI 告警，**不**修改 check 状态 / **不**修改 mergify 的 `check-success` 判定。**根因**：监测系统目标是"用户感知"（失败即显 + ack），合并系统目标是"通过即合"（check 通过即合）——两类系统目标正交，强行耦合会导致监测 bug（如 alert firing 偶发）阻塞 mergify 合并。**M24.1 实施**：`.github/mergify.yml` 注释明确边界 + dependfix README + experience-archive §五十六 三处同步。详见 [经验归档 §五十六 M24.1 关键决策 D8（experience-archive.md §五十六段）](../governance/experience-archive.md) + [.github/mergify.yml 注释](../../../.github/mergify.yml)。 |


## apps/platform 端到端 AI 研判集成（M26 阶段）

apps/platform 管理平台作为 dependfix 内部运维与公开部署的核心入口，承担 AI breaking change 研判能力的端到端联通职责。引擎层（`packages/engine/src/ai/`）M5 已闭环（commit `3475e6e`），CLI / MCP / GitHub Action 三条用户路径全部支持 `--ai` 系列参数；M26 阶段将能力补齐到 apps/platform 平台（点 "扫描" 即可启用 AI 研判 + 可观测用量与评估结果）。

完整设计先行稿：[platform-ai-integration.md](./platform-ai-integration.md)；阶段切片见 [M26](../../plan/archive/todo-archive-phases-m26.md) + [archive/todo-archive-phases-m26.md §M26.1](https://github.com/dependfix/dependfix/blob/master/docs/plan/archive/todo-archive-phases-m26.md#m261-p1--能力--ux-m252b-应用层10-commits--1130-行--standard-depth-audit)（M26 阶段 2026-09-10 完整闭环 + 归档；M26.1 应用层 10 commits / ~1130 行）。

### 数据模型扩展（M25.2a commit `1c65582`）

- `Organization.aiApiKeyEncrypted`（text, nullable）：AES-256-GCM 加密的 AI API Key（复用 `ENCRYPTION_KEY` + `Credential.encryptedToken` 同源加密）
- `Organization.aiProvider`（varchar(32)，默认 `'openai-compatible'`）：与 engine 层 `AiConfig.provider` 对齐
- `Organization.aiModel`（varchar(100)，默认 `'deepseek-v4-flash'`）：与 engine 层 `AiConfig.model` 对齐
- `Organization.aiBaseUrl`（varchar(255)，nullable）：OpenAI 兼容端点覆盖
- `Organization.aiApiUrl`（varchar(255)，nullable）：Anthropic 端点覆盖
- `Repository.aiEnabled`（boolean，默认 `false`）：单仓库 AI 研判开关
- `Repository.aiTrigger`（enum(16)，默认 `'both'`）：触发范围 `failure` / `major` / `both`
- `ScanRun.aiConfigSnapshot`（JSON）：本次扫描实际使用的 AI 配置快照（apiKey 脱敏为 `hasApiKey` 布尔，便于审计回溯）

**加密策略**：`runScanInternal` 阶段从 `Organization.aiApiKeyEncrypted` 内存解密注入 `RuntimeConfig.ai.apiKey`，用后即弃；日志与错误响应走 `maskSecrets` 脱敏。

### 调用链透传

```
PATCH /api/organizations/[id]/ai-config     → Organization.ai* 字段更新
POST   /api/repos/[id]/ai-config             → Repository.aiEnabled / aiTrigger 更新
POST   /api/repos/[id]/scan
    { aiEnabled?, aiTrigger? }                → 运行时 override
    → scan-orchestrator service
        → resolveAiConfig(request, repo, org)
            ├── aiEnabled = request.aiEnabled ?? repo.aiEnabled ?? false
            ├── aiTrigger = request.aiTrigger ?? repo.aiTrigger ?? 'both'
            └── apiKey   = decrypt(org.aiApiKeyEncrypted)
        → ContainerExecutor.execute(ctx)
            ├── ...ctx.config
            └── ai: { provider, model, apiKey, trigger, baseUrl, apiUrl }
                → DependfixApp.run()
                    → assessBreakingChange()        # M5 已闭环
                        → RunResult.aiUsage
                            { calls, inputTokens, outputTokens,
                              totalTokens, estimatedCostUsd }
```

### 合并优先级（API override > Repository 默认 > Organization 共享）

- `aiEnabled`：API 请求 `aiEnabled` > `Repository.aiEnabled` > `false`
- `aiTrigger`：API 请求 `aiTrigger` > `Repository.aiTrigger` > `'both'`
- `provider` / `model` / `apiKey` / `baseUrl` / `apiUrl`：仅取 Organization 级（仓库级无 override）

错误规则：`aiEnabled=true` 但 Organization 未配 Key → `400 AI_KEY_REQUIRED`；`aiEnabled=true` 但 `Repository.aiEnabled=false` 且 API 未显式传 `aiEnabled` → 拒绝（防误启用）。

### 三执行器一致性（M25.2a commit `7250ec1`）

`container` / `sandbox` / `github-action` 三执行器同步透传 `RuntimeConfig.ai`：

- **container**：通过 `...ctx.config` 展开自动透传
- **sandbox**：通过 `DEPENDFIX_AI_*` env vars 注入（仅 `aiEnabled=true` 时注入避免空字符串覆盖默认值）
- **github-action**：通过 `workflow_dispatch inputs` 透传（与 `action.yml` 7 个 `ai-*` inputs 对齐）

**A 阶段 audit 必查项**：每加一个 RuntimeConfig 新字段必须三执行器都验证（不一致会埋 "未来 sandbox 启用后才发现 AI Key 透传缺失" 的坑）。

### 应用层 API 契约（M26.1 commit `40db65a`）

| 端点 | 方法 | 权限 | 行为 |
|---|---|---|---|
| `/api/organizations/[id]/ai-config` | PATCH | admin / org_admin | 更新 Organization.ai*；API Key 明文 → AES-256-GCM 加密；响应不回显 apiKey 明文（仅返回 `hasAiApiKey`）|
| `/api/repos/[id]/ai-config` | GET | viewable | 返回 Repository + Organization + effective 三段配置；凭据最小化（响应不含 apiKey 明文）|
| `/api/repos/[id]/ai-config` | POST | admin / org_admin | 更新 Repository.aiEnabled / aiTrigger；启用时校验 Organization 已配 Key |

写操作（PATCH / POST）通过 `AuditEvent.type='ai_config_update'` 登记审计（payloadJson 含 before/after diff + apiKey 明文脱敏）；AuditEventType union 已扩展 `ai_config_update` 值（M26.1 commit `40db65a` 同步）。

### UI 集成（M26.1 commit `80138b1` + `d7fb63b`）

- **Organization AI 配置表单**（`ai-config-form.vue`）：Provider / Model / API Key (Password) / Base URL / Anthropic URL 5 字段 + 保存按钮 + 已配置 Badge（i18n `ai.orgSection` 段）
- **仓库 AI 研判开关**（`repo-ai-toggle.vue`）：Switch + trigger 三选项 Select + Organization 未配 Key 时降级为禁用 + 警告 Message（`apps/platform/app/pages/repos/[id]/runs.vue` 顶部挂载）
- **扫描对话框 AI override 折叠面板**（`scan-config-dialog.vue`，M26.1 后续 commit 实施）：运行时覆盖仓库默认 + trigger 选项 + Organization 未配 Key 时禁用
- **RunDetailDialog AI 用量 section**：5 字段（calls / inputTokens / outputTokens / totalTokens / estimatedCostUsd）v-if 条件渲染（未启用 AI 时整段隐藏）；i18n `ai.usageSectionTitle` 段
- **alerts 视图 AI 评估列**：evaluated / skipped 二态 Tag（`ai.alertsEvaluatedTag` / `ai.alertsSkippedTag`）

### 治理验收（与 engine 层一致）

- AI 输出必须通过 `install` / `lint` / `build` / `typecheck` / `test`（沿用 [§AI 研判误判处理](#主要风险与应对) 现有治理基线）
- AI 生成的 PR 不自动合并（与 [standards/index.md §AI 研判默认不自动合并](../../standards/index.md) 一致）
- 置信度低于阈值仅输出建议（engine 层 `safety-gate.ts` 已实施）
- AI API Key 日志脱敏（复用 `packages/engine/src/ai/secrets.ts:maskSecrets`）
- 仓库级 `aiEnabled=false` 时 API 请求 override 也被拒绝（防止误启用）
- 三执行器同步透传 audit 必查项（新增 RuntimeConfig 字段必须三执行器都验证）

### 关联文档

- [platform-ai-integration.md](./platform-ai-integration.md) — M26 阶段完整设计先行稿（4 API 端点 + UI + i18n + docs）
- [platform-auth-users.md](./platform-auth-users.md) — Organization 实体扩展基线（M7.1 已落地）
- [platform-scheduled-batch.md](./platform-scheduled-batch.md) — 定时扫描链路，AI 研判可统一应用
- [sandbox-security-governance.md](./sandbox-security-governance.md) — AI 研判在供应链防护的角色
- [experience-archive.md §五十六（M24.1 关键决策 D8）](../../design/governance/experience-archive-§49-§69-recent-investigation.md) — 监测系统 vs 自动合并解耦
