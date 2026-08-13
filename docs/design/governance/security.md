# 安全设计

## 认证体系

### 技术选型

使用 [better-auth](https://www.better-auth.com/) 作为认证框架，配合 TypeORM Adapter 实现数据库持久化。

### 支持的登录方式

| 方式 | 优先级 | 说明 |
|------|:------:|------|
| 邮箱 + 密码 | P0 | 基础认证 |
| 邮箱验证 | P0 | 注册后验证邮箱 |
| GitHub OAuth | P1 | 第三方登录（可选） |
| Google OAuth | P1 | 第三方登录（可选） |
| Magic Link | P2 | 免密码登录 |
| 双因素认证 | P2 | TOTP + 备用码 |

### 插件清单

| 插件 | 用途 |
|------|------|
| username | 用户名注册/登录 |
| magicLink | 魔法链接登录 |
| emailOTP | 邮件验证码 |
| twoFactor | 双因素认证 |
| admin | 管理员角色 |
| jwt | JWT 令牌 |
| genericOAuth | 通用 OAuth 配置 |
| openAPI | API 文档自动生成 |
| captcha | Cloudflare Turnstile 验证码 |

### 会话管理

- 会话持久化到数据库（`storeSessionInDatabase: true`）
- Cookie 缓存策略：`compact`
- 过期时间：30 天
- 更新频率：每天
- JWT 算法：EdDSA / Ed25519

### 第三方 OAuth 配置

```typescript
const socialProviders = {
  github: process.env.GITHUB_CLIENT_ID ? {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  } : undefined,
  google: process.env.GOOGLE_CLIENT_ID ? {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  } : undefined,
}
```

未配置的环境变量将自动禁用对应登录方式。

### Auth Middleware

- `server/middleware/auth.ts`：解析请求中的 session
- 不主动 401 — 由各 API handler 自行决定是否需要认证
- 提供 `requireAuth` / `requireAdmin` 守卫函数

## 安全与审计要求

- 不在日志和报告中输出明文令牌
- 对 GitHub Token 权限进行最小化控制
- 对自动提交与 PR 创建保留显式开关
- 对自动修复动作保留 dry-run 模式
- 对高风险升级保留人工确认机制

## 修复执行安全（沙箱与恶意依赖防护）

dependfix 的修复执行本质是"拉取并执行不可信代码"，执行隔离与凭据防护是**安全基线的组成部分**（更新依赖不能引入新漏洞）：

- **权威基线**：[安全规范 §5.3 修复执行安全](../../standards/security.md)（必须级条款，单点声明）
- **专项治理**：[沙箱与恶意依赖防护治理](./sandbox-security-governance.md)（2026-08-14 评估结论、威胁链、治理登记 C26/C38-C43）
- **执行器设计与威胁建模**：[executor-sandbox.md](./executor-sandbox.md)（Executor 契约与风险表）
- **凭据加密存储**：T602 已交付（AES-256-GCM，解密仅执行时内存、凭据最小化），实现见 `apps/platform/server/services/credential.service.ts`（C28 完整章节补登记见 [backlog](../../plan/backlog.md)）

## Prompt 注入防护

为防止恶意用户注入指令，采取以下措施：

### 触发权限限制

- 只有仓库管理员（admin）可触发 AI 分析流程
- `workflow_dispatch` 需要 write 以上权限
- 不接受来自 Issue comment 或 PR comment 的触发命令
- schedule 触发不依赖外部输入

### 输入沙箱化

- AI 分析输入仅包含：changelog 原文、CI 失败日志、受影响的文件 diff
- 不接受自由文本输入
- 对 changelog 内容做结构性校验（过滤 HTML/JS/Shell 注入标记）

### 指令隔离

- AI 的系统提示词硬编码，不接受用户自定义
- 外部内容（changelog 等）作为 data 字段传入，与系统指令严格分离
- 使用 OpenAI/Anthropic API 的 system/user 角色分离策略

### 输出约束

- AI 输出需通过 schema 校验（结构化 JSON），不接受自由格式输出
- 生成的代码 patch 需经过 lint/typecheck 等质量门验证

## 独立平台部署安全

### 架构概览

```
┌──────────────────────────────────────────────┐
│              Dependfix Platform                │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐   │
│  │ Web UI   │  │ REST API │  │ CLI Tool  │   │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘   │
│       └──────────────┼──────────────┘          │
│              ┌───────┴───────┐                 │
│              │  Auth & RBAC  │                 │
│              └───────┬───────┘                 │
│  ┌───────────────────┼────────────────────┐    │
│  │  ┌────────┐  ┌────┴────┐  ┌────────┐  │    │
│  │  │ Git    │  │  Task   │  │ Report │  │    │
│  │  │ Repo   │  │  Queue  │  │ Engine │  │    │
│  │  │ Mgr    │  │  (MQ)   │  │        │  │    │
│  │  └────────┘  └────┬────┘  └────────┘  │    │
│  │  ┌────────────────┴────────────────┐   │    │
│  │  │      Fix Execution Engine       │   │    │
│  │  │  (Dependency + Code + AI Fix)   │   │    │
│  │  └─────────────────────────────────┘   │    │
│  └─────────────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### RBAC 权限模型

| 角色 | 权限范围 |
|------|----------|
| Admin | 全局配置、用户管理 |
| Org Admin | 管理组织下所有仓库 |
| Repo Admin | 管理特定仓库修复策略 |
| Viewer | 只读查看报告 |

### Git 仓库管理

- 支持连接 GitHub / GitLab / Bitbucket 仓库
- 支持 Personal Access Token / OAuth App 认证
- 仓库级别配置（包管理器、忽略列表、自定义验证命令）

### 任务队列

- 使用消息队列（如 BullMQ + Redis）管理修复任务
- 同一仓库同一时间最多一个修复任务在执行
- 优先级队列：security alerts > dependency updates > routine checks
- 任务去重：同一仓库的重复提交在队列中合并
- 失败重试策略：指数退避，最大重试次数可配

### 批量处理

- 支持按组织/团队/标签批量选择仓库
- 批量修复任务合并为一次调度
- 结果聚合报告（跨仓库统计）

### 部署方式

- Docker Compose 单机部署（适合小团队）
- Kubernetes 集群部署（适合企业）
- 提供 Helm Chart
