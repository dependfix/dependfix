# 当前阶段任务（M6：最小平台 MVP）

> M0-M5.5 已完成并归档，见 [todo-archive.md](todo-archive.md) 与 [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)。
> **M5.5（2026-08-07 归档）**：T506-T508 全部交付（929 tests），产品 skill `dependfix-remediator` npx skills 生态主通道 + 自研兜底安装器 + MCP 双后端扩展点落地。

---

## 当前状态

- **进行中阶段**：M6（最小平台 MVP）已于 2026-08-07 完成正式规划（决策见下），任务定义如下。
- **下一阶段**：M7（企业级平台增强），任务定义见 [backlog.md §M7](backlog.md#m7-企业级平台增强)。
- **已知边界**：M5.5 的 npx skills GitHub 源端到端验证（主通道 + 全链质量门）依赖 CI 端到端裁决（本机 clone github.com 网络受限），推送后复跑确认。

## M6: 最小平台 MVP

### 规划决策（2026-08-07 用户确认）

1. **执行深度（Q1）**：平台扫描以 **A 模式（完整修复链路）** 为主——平台容器内置 git/node/pnpm 工具链，复用 `DependfixApp` 程序化接口完整执行；**B 模式（触发目标仓库 GitHub Action）** 为降级（服务器配置较低时），并需评估使用方式/体验/成本。
2. **执行模型（Q2）**：**同步执行**先行（请求内完成，前端 loading），阻塞时间过长再演进后台异步（M7 T702 BullMQ 正式承接）。
3. **MCP（Q3）**：保留在 M6（原 T605/T606 **合并**为本阶段 T605——容量约束"进一出一"，同为 `@dependfix/mcp` 交付物，拆回不阻塞）。
4. **沙箱（Q4=A）**：执行器抽象 + 容器内执行（平台 Docker 容器即沙箱，恶意依赖升级风险面评估入设计文档）；独立沙箱容器 / GitHub Action 后端仅设计不实现。
5. **Action 降级触发（Q5=B）**：平台实现对已配置 action 的仓库触发 `workflow_dispatch`（需 `actions: write`）；**结果回填为已知边界**（action 输出 → 平台结果存储是独立难题，登记 backlog，不在 M6 解决）。
6. **平台定位**：平台 = 触发器/调度器 + 结果展示（控制面）；修复执行（数据面）可在平台容器 / 独立沙箱 / GitHub Action，以 Executor 抽象隔离。
7. **平台结构参考**：`apps/platform/` 对齐 momei 项目结构（Nuxt 全栈：`server/api` + `server/services` + `server/database` + better-auth + TypeORM + SQLite），技术选型见 [architecture.md](../design/governance/architecture.md)。

### T601 平台项目骨架搭建

- 优先级：`P1`
- 依赖：T505（`DependfixApp` 解耦已完成）
- 交付物：`apps/platform/` Nuxt 4 全栈项目 + Docker Compose。
- 任务内容：
  - [ ] `apps/platform/` Nuxt 4 初始化（TypeScript strict、`<script setup>`），`pnpm-workspace.yaml` 增加 `apps/*`
  - [ ] PrimeVue 4 + `@primeuix/themes` + SCSS（BEM），暗色模式 `.dark` 类切换
  - [ ] better-auth 集成（邮箱密码登录，TypeORM Adapter，会话数据库持久化 30 天；SMTP 未配置时邮箱验证自动跳过——对齐"未配置自动禁用"模式）
  - [ ] TypeORM + SQLite 初始化（`server/database/sqlite/`，momei 结构参考）
  - [ ] Dockerfile（多阶段 alpine 镜像：构建含 git/pnpm 工具链，运行时最小化；基础镜像固定 digest）+ `docker-compose.yml`（SQLite 数据卷）
  - [ ] env 隔离约束（T905 预案生效）：`PORT` 可配、DB 文件路径独立
  - [ ] 容器内执行器依赖闭包约束登记（T603 前置）：runtime 镜像仅含 `.output` + cli/core dist，cli 运行时依赖（@octokit/rest/zx/fs-extra 等）与 git/pnpm 命令的解析方案在 T603 设计时确定（复制闭包 / cli 全打包 noExternal / 独立执行容器三选一）
- 非目标：页面业务功能（T602-T604 承接）、i18n / PWA / Sentry（M7）
- 完成定义：
  - [ ] `docker compose up` 可拉起完整平台（登录页可访问）
  - [ ] 本机 `pnpm dev` 启动 + better-auth 注册登录闭环
  - [ ] 根 `pnpm lint` / `pnpm typecheck` 通过（含平台）

### T602 仓库与凭据管理

- 优先级：`P1`
- 依赖：T601
- 交付物：Repository CRUD + Credential 加密存储 + Web UI。
- 任务内容：
  - [x] Repository 实体（owner/repo/platform/defaultBranch/packageManager/credentialId）与 CRUD API（Zod 校验）
  - [x] Credential 实体：type（classic-pat / fine-grained-pat / github-app），AES-256-GCM 加密存储（`ENCRYPTION_KEY` 平台级密钥），解密仅在执行时 worker 内存中；Dependabot alerts 读取必须显式凭据（GITHUB_TOKEN 不可用，见 [G2 处置记录](todo-archive.md#g2-处置记录github_token-无法访问-dependabot-alerts)）
  - [x] Web UI：仓库列表、添加/编辑/删除；凭据管理页
- 非目标：org 级仓库自动发现/同步（repo-sync，后续增强）、GitHub App installation token 生成链路（C22 评估项）、RBAC（M7）
- 完成定义：
  - [x] 可通过 Web UI 管理仓库和关联凭据（增删改查闭环）
  - [x] DB 中 token 为密文（直查 sqlite 验证），解密单元测试通过

### T603 扫描触发与结果存储

- 优先级：`P1`
- 依赖：T602、T505、**T607（设计先行）**
- 交付物：ScanRun/ScanResult 持久化 + 同步扫描执行（Executor 容器内执行）+ Web UI 触发与结果查看。
- 任务内容：
  - [x] ScanRun（repoId/mode/severityThreshold/status/startedAt/finishedAt/summary）与 ScanResult 实体设计
  - [x] Executor 抽象落地（T607 契约）：`ContainerExecutor`（默认，平台容器内置工具链，clone + 执行 `DependfixApp` + 结果回填）
  - [x] 同步执行模型（Q2）：请求内执行，前端 loading，失败 → `failed` 状态，不写半截结果（原子写）
  - [x] Web UI 触发单仓库扫描 + 结果/报告查看
- 非目标：后台异步队列/并发控制（M7 T702）、独立沙箱容器执行（T607 设计，M7 实现）
- 完成定义：
  - [x] 可从 Web UI 对单个仓库触发扫描并查看结构化结果
  - [x] 扫描结果持久化 SQLite，重启平台后仍可查看

### T604 仪表板与告警视图

- 优先级：`P1`
- 依赖：T603
- 交付物：仪表板 + 告警筛选视图 + 扫描历史。
- 任务内容：
  - [x] 仪表板：仓库数、告警数（按严重级别）、已修复数、最近扫描
  - [x] 告警视图：按仓库/严重级别/来源筛选
  - [x] 扫描历史列表与详情（由 T603 runs.vue 承载：仓库级扫描历史页 + 详情 Dialog）
- 非目标：趋势图表、通知（M7）、导出
- 完成定义：
  - [x] 用户登录后可查看全局告警状态并筛选

### T605 MCP Server（原 T605 + T606 合并）

- 优先级：`P1`
- 依赖：T505、T109（`DependfixApp` 程序化接口）
- 交付物：`packages/mcp`（`@dependfix/mcp`）+ 4 个 tool + CLI 一致性断言。
- 任务内容：
  - [ ] `packages/mcp` 初始化，tsdown 构建（ESM + CJS + dts）
  - [ ] 集成 `@modelcontextprotocol/sdk`（stdio 传输）
  - [ ] `fetch_alerts`（只读）：拉取 Dependabot 告警，schema 见 [mcp-server.md](../design/governance/mcp-server.md)（T508 预留核对点）
  - [ ] `get_last_report`（只读）：读取最近 JSON 报告
  - [ ] `run_scan`（写入）：复用 `DependfixApp` 程序化接口，默认 `report-only`
  - [ ] `fix_dependency`（写入）：复用 `overrideTransitiveDependency` 升级逻辑
  - [ ] 验证 MCP tool 结果与 CLI 输出一致性（T508 一致性断言清单承接）
- 非目标：npm 发布与 skill 双后端集成（M7 T706）、多传输（http/SSE）、凭据管理（读环境变量，见设计文档 §4.3）
- 完成定义：
  - [ ] 可通过 `npx @dependfix/mcp` 启动并注册 4 个 tool
  - [ ] MCP tool 与 CLI 输出一致性测试通过

### T607 执行器设计与沙箱评估（设计先行 + Action 触发实现）

- 优先级：`P1`（设计部分先于 T603 实现；Action 触发实现依赖 T601）
- 依赖：T601
- 交付物：执行器/沙箱设计文档 + `ActionTriggerExecutor` 实现 + Action 降级接入评估结论。
- 任务内容：
  - [x] **设计文档**（先于 T603）：恶意依赖升级威胁建模（install scripts / postinstall / 构建链投毒 / 凭据泄露风险面）+ 执行器方案矩阵（平台容器 / 独立沙箱容器 / GitHub Action / 临时目录）+ Executor 接口契约（执行后端可插拔）——见 [executor-sandbox.md](../design/governance/executor-sandbox.md)
  - [x] `ActionTriggerExecutor`：对已配置 action 的仓库触发 `workflow_dispatch`（需 `actions: write`，凭据复用仓库关联 Credential；目标 workflow 文件名在仓库配置中声明）
  - [x] B 模式接入评估：目标仓库添加 action 的使用方式/体验/成本结论（已写入 [executor-sandbox.md §5](../design/governance/executor-sandbox.md)；**结果回填登记 backlog C25，不在 M6 实现**）
  - [x] `mcp-server.md` 里程碑编号修正（T606/T607 → 本阶段 T605 合并口径，见规划决策 3）
- 非目标：独立沙箱容器执行实现（M7）、action 结果回填（backlog 登记）
- 完成定义：
  - [x] 设计文档经 Review Gate 通过（威胁建模 + 方案矩阵 + Executor 契约）
  - [x] 对配置了 action 的仓库，平台可触发 `workflow_dispatch` 并返回触发结果
  - [x] B 模式接入成本评估结论落盘（含权限面与体验分析）

---

## M6 阶段验证矩阵（规划期）

| 证据落点 | 说明 |
|:--|:--|
| `docker compose up` 冒烟 | T601 完成定义（登录页可访问） |
| CRUD API 测试 + 加密解密单测 | T602 完成定义 |
| Executor 单测（mock `DependfixApp`）+ API 集成测试 | T603 完成定义 |
| 组件测试 + UI 冒烟 | T604 完成定义 |
| MCP tool 注册冒烟 + 一致性断言测试 | T605 完成定义 |
| 沙箱设计文档 Review Gate + `workflow_dispatch` 触发实测 | T607 完成定义 |
