# 系统架构

> 状态: ✅ 已落地（2026-08-05 修正——对齐当前实现；早期规划见 git 历史）

## 项目组成

dependfix 由以下子项目组成（标 ✅ 的已落地，其余为规划中）：

```
dependfix/
├── packages/
│   ├── core/            # ✅ 核心业务逻辑库 @dependfix/core（告警模型/过滤/报告/日志/工具链）
│   ├── engine/          # ✅ 执行引擎 @dependfix/engine（github 采集/fixers 修复/config/编排内核，cli/mcp/platform 共享）
│   ├── cli/             # ✅ CLI 入口 dependfix（bin/参数解析/runner 薄壳/skills）
│   ├── github/          # ✅ 已并入 packages/engine/src/github/（client/fetcher/pr-creator）
│   ├── action/          # ✅ 已并入根 action.yml（Composite Action，M2 落地）
│   └── mcp/             # ✅ MCP Server @dependfix/mcp（M6 落地，依赖 engine）
├── action.yml           # ✅ GitHub Composite Action 入口（M2 已落地）
├── apps/platform/       # ✅ Nuxt 全栈管理平台（Web UI + REST API，M6 落地，依赖 engine）
└── docs/                # ✅ VitePress 文档站
```

> 注：M0 规划中的 `packages/github` 曾于 2026-08-05 目录收敛并入 `packages/cli/src/github/`（当时仅 cli 一个消费方）；**2026-08-09 修订**——mcp/platform 成为第二个/第三个消费方后，"应用层互相依赖（mcp → cli）"导致依赖连带膨胀与版本耦合，`github/` 与执行核心（fixers/config/app）拆入共享引擎包 `@dependfix/engine`（方案 B，见 [todo.md](../../plan/todo.md) 进行中任务），cli 薄壳化。`packages/action` 维持根 action.yml 形式。

## 总体方案

采用"统一编排器 + 告警采集器 + 修复执行器 + 报告器"的分层设计。

```mermaid
flowchart TD
    A[运行入口 CLI / GitHub Action] --> B[任务编排器]
    B --> C[仓库列表解析器]
    B --> D[GitHub 告警采集器]
    D --> D1[Dependabot Alerts]
    D --> D2[Code Scanning Alerts]
    B --> E[过滤与优先级引擎]
    E --> F[修复规划器]
    F --> G1[依赖升级修复器]
    F --> G2[pnpm frozen-lockfile 修复器]
    F --> G3[Code Scanning 建议/半自动修复器]
    G1 --> H[验证执行器]
    G2 --> H
    G3 --> H
    H --> I[分支与 PR 管理器]
    H --> J[报告生成器]
```

## 功能模块

### 入口层

- CLI 入口
- GitHub Action 入口
- 统一参数解析器

### 配置层

- 环境变量加载
- 仓库级配置读取
- 默认策略合并

### GitHub 集成层

- 认证与 API 客户端（PAT 路径 + GitHub App installation token 路径双轨；详见 [C22 PAT 无感升级评估](./c22-pat-backward-compat.md)）
- 告警拉取
- 仓库发现
- 分支、提交、PR、评论操作

### 核心域层

- 告警标准化模型
- 过滤与优先级模型
- 修复规划模型
- 执行结果模型

### 执行层

- 仓库克隆与工作目录管理
- 包管理器命令执行
- 质量门执行
- 失败回滚与清理

### 报告层

- 汇总统计
- 单仓库明细
- 告警-修复映射
- 失败原因归类

## 仓库列表获取

### 手动指定

- CLI 参数
- 环境变量
- 配置文件中的显式列表

### 自动发现

- organization / owner
- topic
- 默认分支
- 是否 archived / disabled
- 是否包含 `package.json` 或 `pnpm-lock.yaml`

首期优先支持"手动指定 + 基于 owner 自动发现"。

## 修复优先级

默认按以下顺序执行：

1. Critical 的依赖漏洞
2. High 的依赖漏洞
3. 会阻塞 CI 的 lockfile 问题
4. 可模板化处理的 code scanning 问题
5. 其余问题只输出建议

## 运行模式

### 本地直接运行

- `report-only`：只拉取告警并生成报告
- `fix`：执行修复但不推送
- `fix-and-pr`：执行修复并推送分支 / 创建 PR

### GitHub Action 运行

触发方式：`workflow_dispatch`、`schedule`

输入参数：owner / organization、repositories、severity-threshold、mode、max-repos、dry-run

## 专用 Agent 设计

### 角色定位

负责安全告警自动修复的任务编排：

- 拉取并统一标准化 GitHub 安全告警
- 根据配置决定要处理哪些仓库、哪些告警、哪些修复策略
- 调用对应技能完成采集、过滤、修复、验证和报告
- 在失败时给出结构化原因

### 输入

- GitHub Token / GitHub App 凭证
- 目标仓库列表或自动发现参数
- 修复策略配置
- 严重级别过滤规则
- 运行模式：`report-only`、`fix`、`fix-and-pr`

### 输出

- 每个仓库的执行结果
- 已修复告警列表
- 未修复告警列表及原因
- 创建的分支、提交、PR、评论链接
- Markdown 报告与 JSON 报告

### 决策原则

- 默认先修复高收益、低风险问题
- 默认优先修复依赖问题，其次修复 lockfile 问题，最后处理可模板化的 code scanning 问题
- 当验证失败、升级跨度过大或需要业务判断时，停止自动提交，仅输出建议

## pnpm frozen-lockfile 自动修复

### 触发条件

- 修复依赖漏洞后安装失败
- 单独执行验证时 `pnpm i --frozen-lockfile` 失败
- 检测到 `package.json` 与 `pnpm-lock.yaml` 不一致

### 修复流程

1. 固定 Node 与 pnpm 版本
2. 读取并记录失败日志，识别是否属于 lockfile 漂移问题
3. 在工作分支中执行 lockfile 修复命令
4. 再次执行 `pnpm i --frozen-lockfile`
5. 若通过，进入后续 lint/build/typecheck/test
6. 若仍失败，输出分类原因并停止自动提交

### 实现要点

- 在 GitHub Actions 中显式固定 pnpm 版本
- 在仓库配置中允许声明推荐 pnpm 版本
- 记录 lockfile diff 摘要
- 支持 `packageManager` 字段作为优先版本来源

## 报告设计

### Markdown 报告

- 运行元信息：时间、模式、阈值、仓库数
- 汇总统计：扫描仓库数、命中告警数、已修复数、失败数、跳过数
- 按仓库明细
- 按严重级别统计
- 按告警来源统计
- 失败原因分类
- 生成的 PR / 分支链接

### JSON 报告

- `runId`
- `startedAt` / `finishedAt`
- `config`
- `summary`
- `repositories[]`
- `alerts[]`
- `actions[]`
- `errors[]`

## 技术选型

技术选型与 [momei](https://github.com/CaoMeiYouRen/momei) 项目保持一致，优先复用已验证的成熟方案。

### 全栈平台（apps/platform）

| 类别 | 选型 | 来源 |
|------|------|------|
| 框架 | Nuxt 4（全栈 SSR + API Routes） | momei |
| 语言 | TypeScript（strict mode） | — |
| 包管理 | pnpm（workspace monorepo） | momei |
| UI 组件 | caomei-ui（自建；M31 完成 PrimeVue 4 迁移并卸载其依赖） | — |
| 样式方案 | SCSS + BEM，暗色模式通过 `.dark` 类切换 | momei |
| 国际化 | @nuxtjs/i18n（prefix_and_default 策略） | momei |
| 认证 | better-auth（邮箱 + 第三方登录） | momei |
| ORM | TypeORM + TypeORM Adapter | momei |
| 数据库 | SQLite（开发）/ MySQL / PostgreSQL | momei |
| 任务队列 | BullMQ + Redis | — |
| 日志 | winston（结构化 JSON 日志） | momei |
| 监控 | Sentry（@sentry/nuxt）——已采用（M65.1；DSN 空即关闭，见 [platform-observability.md](./platform-observability.md)） | momei |
| PWA | @vite-pwa/nuxt——未采用（momei 复用参考，不在此表承诺） | momei |

> 标「未采用」的行只保留 momei 参考出处，当前代码与依赖中不存在；其余 momei 行的采用状态以 [技术栈指南](../../guide/tech-stack.md) 为准。

### 库（packages/*）

| 类别 | 选型 |
|------|------|
| 构建 | tsdown（输出 ESM + CJS + dts） |
| 测试 | Vitest |
| E2E | Playwright |
| Lint | ESLint（eslint-config-cmyr） |
| 类型检查 | tsc --noEmit |
| 样式检查 | stylelint（stylelint-config-cmyr） |
| 提交规范 | commitlint（commitlint-config-cmyr） + commitizen |
| 版本发布 | 自研 release 脚本（`release:plan` 推导 + `release:version` 版本提升 + `release:publish` 发布，见[发布管线设计](./release-pipeline.md)与[发布指南](../../guide/release.md)）+ `pnpm changelog`（conventional-changelog-cmyr-config 生成日志） |

### 文档站（docs/）

| 类别 | 选型 |
|------|------|
| 框架 | VitePress |
| 国际化 | VitePress 内置 i18n（root + /en/ 前缀） |
| 主题 | 默认主题 |
| 搜索 | 本地搜索 |

## 分片索引（迁出章节）

| 分片 | 章节范围 | 主题 |
|:--|:--|:--|
| [architecture-platform.md](./architecture-platform.md) | §11 - §13 | 平台架构（apps/platform） / 主要风险与应对 / 端到端 AI 研判集成（M26 阶段） |
