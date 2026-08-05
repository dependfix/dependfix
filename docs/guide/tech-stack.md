# 技术栈详解

本项目技术选型与 [momei](https://github.com/CaoMeiYouRen/momei) 对齐，优先复用已验证的成熟方案。

## 运行时

| 组件 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | >= 20 LTS | 运行环境 |
| pnpm | 最新稳定版 | 包管理器 + workspace monorepo |

## Monorepo 结构

采用 `packages/<name>` 命名规范（npm 包名带 `@dependfix/` scope）：

| 子包 | npm 名 | 类型 | 构建 |
|------|--------|------|------|
| packages/core | `@dependfix/core` | 内部库 | tsdown |
| packages/cli | `dependfix` | CLI（unscoped） | tsdown |
| packages/github | `@dependfix/github` | 内部库 | tsdown |
| packages/action | `@dependfix/action` | Action | tsdown |
| packages/mcp | `@dependfix/mcp` | MCP Server | tsdown |
| apps/platform | — | Nuxt 应用 | Nuxt 构建 |

> 命名规范：CLI / 可执行入口使用 unscoped 名称，内部库使用 `@dependfix/*` scope。

## 全栈平台（apps/platform）

### 核心框架

| 依赖 | 版本 | 用途 |
|------|------|------|
| nuxt | ^4.x | 全栈框架 |
| vue | ^3.5 | UI 框架 |
| vue-router | ^5.x | 路由 |
| @primevue/core + primevue | ^4.x | UI 组件库 |
| @primeuix/themes | ^2.x | 主题引擎 |
| @nuxtjs/i18n | ^10.x | 国际化 |
| @vueuse/core + @vueuse/nuxt | ^14.x | 组合式工具 |
| @sentry/nuxt | ^10.x | 错误监控 |
| @vite-pwa/nuxt | ^1.x | PWA 支持 |

### 认证

| 依赖 | 用途 |
|------|------|
| better-auth | 认证核心 |
| @better-auth/sso | SSO / 第三方登录 |
| better-auth-localization | 认证 UI 多语言 |

### 数据库与 ORM

| 依赖 | 用途 |
|------|------|
| typeorm | ORM 框架 |
| reflect-metadata | TypeORM 装饰器依赖 |
| class-transformer + class-validator | 实体校验 |
| better-sqlite3 | SQLite（开发/测试） |
| pg | PostgreSQL（生产） |
| mysql2 | MySQL（生产备选） |

### 任务队列

| 依赖 | 用途 |
|------|------|
| bullmq | 任务队列 |
| ioredis | Redis 客户端 |

### 工具

| 依赖 | 用途 |
|------|------|
| zod | 数据校验 |
| dayjs | 日期处理 |
| lodash-es | 工具函数 |
| winston | 结构化日志 |
| nodemailer | 邮件发送 |
| dompurify + sanitize-html | XSS 防护 |

## 库（packages/*）

### 构建与测试

| 工具 | 用途 |
|------|------|
| tsdown | TypeScript 库打包（Rolldown 驱动） |
| vitest | 单元测试 / 集成测试 |
| playwright | E2E 测试 |
| tsc --noEmit | 类型检查 |

### 代码质量

| 工具 | 配置 |
|------|------|
| eslint | `eslint-config-cmyr` |
| stylelint | `stylelint-config-cmyr` |
| commitlint | `commitlint-config-cmyr` |
| lint-staged | 暂存区自动 lint |
| husky | Git hooks 管理 |

### 版本管理

| 工具 | 用途 |
|------|------|
| @changesets/cli | 子包独立版本管理 + npm 发布（开发者显式声明 bump 类型） |
| conventional-changelog + conventional-changelog-cmyr-config | CHANGELOG 生成（`pnpm changelog`，momei 同款格式） |
| commitizen + cz-conventional-changelog-cmyr | 交互式提交 |

### 发布策略

根包（`dependfix-monorepo`）是 pnpm workspace 壳，不交付任何产物，不参与版本发布。

子包（`@dependfix/core`、`dependfix`）通过 changesets 独立发版：

| 动作 | 命令 |
|------|------|
| 创建 changeset | `pnpm changeset` |
| 消费 changeset 并 bump 版本 | `pnpm changeset:version` |
| 生成 CHANGELOG（根级 + 包级） | `pnpm changelog` |
| 发布到 npm | CI 中 `pnpm changeset publish`（OIDC 免 token 认证） |

版本号各自独立，`@dependfix/core` 升级时通过 `updateInternalDependencies: "patch"` 自动 bump `dependfix` CLI 的 patch 版本。

### 工具链事实（2026-08 蒸馏自 Session Wisdom，训练数据易过时）

> 以下条目为跨 session 验证有效的工具链事实，详见 [Session Wisdom 蒸馏机制](../design/governance/session-wisdom-distillation.md)。

- **pnpm overrides 写入位置版本差异**：pnpm v11 将 `overrides` 从 `package.json#pnpm.overrides` 迁移到 `pnpm-workspace.yaml`。做法：检测 `pnpm-workspace.yaml` 是否存在——存在则写 workspace yaml，不存在则回退 `package.json#pnpm.overrides`（文件存在性检测比版本号判断更稳健）。
- **pnpm overrides 版本化 key 是生产惯例**：多版本共存时分别覆盖——`"path-to-regexp@0.1.12": "^0.1.13"`（精确版本）、`"body-parser@1": "^1.20.6"`（大版本）、`"ajv@^6.0.0": "^6.14.0"`（范围）三种 selector。实现要点：**只覆盖与 target 同 major 且低于目标的实例**（跨 major 会破坏子工作区且根 lint 无法验证）；同包多 GHSA 取 recommendedVersion 最高者。
- **发布工具链关键事实**：npm OIDC trusted publishing 需 npm CLI >= 11.5.1 + Node >= 22.14，**包的初始版本无法用 OIDC 发布**（npm/cli#8544，需先手动发一次）；pnpm v11 publish 原生实现不走 npm CLI（11.0.3 曾有 OIDC 回归，已修复）；changesets 2.31.1 在 pnpm 项目 spawn pnpm publish（自动替换 workspace:*），`changelog: false` 可禁用 changelog 生成；conventional-changelog 8.x 模板引擎与旧式 preset（cmyr-config 3.x Handlebars）**不兼容**需锁 ^7，`transformCommit` 必须组合 `defaultCommitTransform` 否则破坏 tag 分段；版本标题日期用 HEAD commit 的 **UTC** 日期（`toISOString`）而非生成当天，保证 CI 重跑幂等；GitHub Actions 中 GITHUB_TOKEN 的 push **不会触发其他 workflow**（防递归），runner 默认无 git 身份需显式配置。
- **0.x 版本语义**：0.x 本身即"开发期不稳定"语义；npm 默认不安装 prerelease 版本反而阻碍预览测试（npx 拿不到）。稳定信号来自 1.0.0（届时启用 v1 滚动 tag）；预览期直接发 latest + GitHub Release 标 pre-release 即可。
- **Windows 开发环境行尾纪律**：PowerShell `Set-Content` 批量替换引入 CRLF（26 行噪音 diff）→ 用 .NET `ReadAllText/WriteAllText`（UTF8 no BOM）保持 LF；改后立即 `git diff` 检查行尾；CRLF 噪音单独 chore 提交（`统一行尾为 LF`）。

## 文档站（docs/）

| 工具 | 用途 |
|------|------|
| vitepress | 文档站点生成 |
| 内置 i18n | 多语言文档 |
| 本地搜索 | 离线全文搜索 |

## AI 基建（从 momei 复用）

以下规范和方法论从 momei 项目继承：

| 规范 | 来源 | 说明 |
|------|------|------|
| PDTFC+ 工作流 | `docs/standards/ai-collaboration.md` | Plan → Do → Audit → Validate → Test → Finish |
| 搜索优先原则 | `docs/standards/ai-collaboration.md` | 修复失败 ≥ 2 次时先搜索外部信息 |
| 验证矩阵 | `docs/standards/ai-collaboration.md` | V0(范围) → V1(lint) → V2(测试) → V3(E2E) → V4(性能) → RG(审查) |
| 质量门 | `AGENTS.md` | lint + typecheck + build + test + code-review |
| 文档标准 | `docs/standards/documentation.md` | 单 H1、无跳级标题、Mermaid 图表、VitePress 容器 |
| 安全红线 | `docs/standards/security.md` | 不修改 .env、不硬编码密钥、推送前确认 |

> 详细规范内容参见 momei 项目 `docs/standards/` 目录，本项目文档继承相同约定。
