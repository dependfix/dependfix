# 待办积压 (Backlog)

> 本文档存放 M5 及之后阶段的详细任务。当前阶段（M4）的任务见 [todo.md](todo.md)。

---

## M4 增强候选（未排期）

> 2026-08-06 M3 归档时从阶段遗留 / 观察点整理，非 M4 本期范围（M4 核心为多仓库治理 T401-T404，见 [todo.md](todo.md)）。按主题分组，随运行反馈再评估上收。

### 工具链与锁文件

- **C1 pnpm 11 不读 `package.json#pnpm.overrides` 假成功风险**（Review Gate 遗留）
  - 状态：🔶 待评估
  - 内容：无 pnpm-workspace.yaml 的仓库，`applyVersionedOverrides` 回退写 package.json 会假成功（install 通过但 override 被忽略）。建议 pnpm 大版本探测 + 警告（本仓库有 workspace.yaml 不受影响）
  - 来源：版本化 overrides 复盘 Review Gate（2026-08-06）
- **C2 verifyFrozenLockfile 仍用裸 pnpm 验证**（T305 遗留）
  - 状态：🔶 待评估
  - 内容：verify 可能架空 PIN_TOOLCHAIN 固定版本（旧版 runner 场景）；建议 verify 与策略命令同版本
  - 来源：T305 Review Gate（2026-08-05）
- **C3 漂移检测弱代理**（T305 遗留）
  - 状态：🔶 待评估
  - 内容：lockfileVersion 漂移检测为相对对比（before/after），非严格"声明版本一致性"校验
  - 来源：T305 Review Gate（2026-08-05）
- **C4 pnpm catalog 依赖的 override 行为未实测**（G3 遗留）
  - 状态：🔶 待评估
  - 内容：使用 pnpm catalog 声明的依赖，版本化 overrides 是否生效未实测
  - 来源：G3 处理记录（2026-08-05）

### 安全与输入边界

- **C5 resolveWithinWorkDir 未处理符号链接逃逸**（安全项）
  - 状态：🔶 待评估
  - 内容：攻击者可控 repo 内容场景下，路径解析可能逃出工作目录
  - 来源：M3 收尾审查登记（2026-08-05）

### 报告与统计口径

- **C6 PR body 64KB 上限**（T304 遗留）
  - 状态：🔶 待评估
  - 内容：大仓库建议区块行数可能使 PR body 接近 GitHub 64KB 上限（告警级输出无上限）
  - 来源：T304 Review Gate（2026-08-05）
- **C7 报告统计口径 alertsConverged**（G3 遗留）
  - 状态：🔶 待评估
  - 内容：`alertsSkipped` 混合多种语义，需独立字段（如 alertsConverged）分离"跳过"与"已收敛"
  - 来源：G3 处理记录（2026-08-05）
- **C8 per-source 错误隔离**（T301 遗留）
  - 状态：🔶 待评估
  - 内容：并行源任一失败目前整体硬失败（已拉取的 Dependabot 结果丢失）；演进为 warn + 仅弃该源（需确认语义）
  - 来源：T301 Review Gate（2026-08-05）
- **C9 summary 字段未渲染**（T304 遗留）
  - 状态：🔶 待评估
  - 内容：告警 summary 已收集未渲染（JSON 可见；报告/PR body 如需摘要列可加）
  - 来源：T304 Review Gate（2026-08-05）

### 覆盖策略

- **C10 根直接依赖 + lockfile 告警覆盖损失**（G3 遗留）
  - 状态：🔶 待评估
  - 内容：根直接依赖 + lockfile manifest 告警一律跳过；可细化为"推荐版本 < 根锁定版本才跳过"
  - 来源：G3 处理记录（2026-08-05）
- **C11 monorepo 成员包直接依赖盲区**（G3 遗留）
  - 状态：🔶 待评估
  - 内容：isRootDirectDependency 仅读根 package.json，成员包直接依赖未识别
  - 来源：G3 处理记录（2026-08-05）
- **C12 major overrides 确认机制**（G3 遗留）
  - 状态：🔶 已评估，暂不实现（2026-08-05）
  - 内容：major overrides 自动拦截不实现（逐包验证 + 回滚已兜底）
  - 来源：G3 处理记录

### 架构与性能

- **C13 app/helpers ↔ cli/helpers 值级循环依赖**（M3 收尾引入反向边）
  - 状态：🔶 待评估（与 M5 T505 CLI 解耦关联）
  - 内容：quickVerifyProject ↔ validateVerifyCommands 运行时安全；建议下沉公共层或回调注入
  - 来源：M3 收尾审查登记（2026-08-05）
- **C14 多 cs 告警逐告警全项目 lint 性能**（T303 遗留）
  - 状态：🔶 待评估
  - 内容：多 code-scanning 告警时逐个跑全项目 lint；可合并验证
  - 来源：T303 Review Gate（2026-08-05）

### Code Scanning 规则体系

- **C15 B 类规则真实仓库样本核对**（T302 遗留）
  - 状态：🔶 待评估
  - 内容：B 类列表覆盖 js/py/java 精选集，其余语言（go/ruby/csharp/cpp）落 C 兜底；需真实仓库 API 样本核对规则 id 格式与变体分布
  - 来源：T302 Review Gate（2026-08-05）
- **C16 规则分类配置化**（T302 声明扩展点）
  - 状态：🔶 待评估
  - 内容：规则分类从常量表升级为可配置（文件 / env / 平台界面）
  - 来源：T302 设计（2026-08-05）

### M4 非目标演进项

- **C17 内容嗅探判断技术栈**：T401 非目标（首版 topic/dependabot.yml 探测）；内容扫描成本与 token 面需评估
- **C18 名单正则引擎**：T403 非目标（首版 glob 通配）
- **C19 报告保留策略**：T404 非目标（容量治理：归档上限 / 清理策略）

---

## M5: AI Breaking Change 研判

目标：引入 AI 能力，对依赖升级后的不兼容问题进行自动研判，生成修复方案并通过 PR 提交。

### T501 实现 Changelog / Release Notes 采集

- 优先级：`P1`
- 依赖：T105
- 交付物：从依赖包获取 changelog 的能力。
- 任务内容：
  - [ ] 从 npm registry / GitHub Release 获取 changelog。
  - [ ] 解析 markdown 格式 changelog，提取 breaking changes 条目。
  - [ ] 缓存已获取的 changelog 数据。
- 完成定义：
  - [ ] 能根据包名和版本号自动获取对应的 changelog 内容。

### T502 实现 AI 研判引擎

- 优先级：`P1`
- 依赖：T501, T107
- 交付物：基于 LLM 的 breaking change 分析能力。
- 任务内容：
  - [ ] 封装多 AI 提供商 API（OpenAI、Anthropic、DeepSeek 等）。
  - [ ] 设计 AI 研判的 system prompt（硬编码，不接受用户输入）。
  - [ ] 构建研判输入上下文（changelog + CI 失败日志 + 受影响文件 diff）。
  - [ ] 定义研判结果结构化输出 schema（问题分类、修复方案、代码 patch、置信度）。
- 完成定义：
  - [ ] 给定一组升级失败日志，AI 能输出结构化的研判结果。

### T503 实现修复方案生成器

- 优先级：`P1`
- 依赖：T502
- 交付物：将 AI 研判转换为可执行修复 PR 的能力。
- 任务内容：
  - [ ] 将 AI 生成的代码 patch 应用到工作分支。
  - [ ] 若研判结果为"锁定版本"，生成版本锁定配置。
  - [ ] 若研判结果为"等待上游"，生成说明文档。
  - [ ] 将所有变更提交为修复 PR，默认不自动合并。
- 完成定义：
  - [ ] AI 研判结果能稳定转换为可审查的 PR。

### T504 AI 输出安全校验与质量门

- 优先级：`P1`
- 依赖：T503
- 交付物：AI 输出安全与质量校验流程。
- 任务内容：
  - [ ] 对 AI 生成的代码进行 lint 校验。
  - [ ] 对 AI 生成的代码进行 typecheck 校验。
  - [ ] 若校验失败，记录原因并回退到建议模式。
  - [ ] 限制 AI 单次 patch 影响范围（如最多修改 5 个文件）。
- 完成定义：
  - [ ] AI 生成的代码通过质量门才能被提交为 PR。

### T505 CLI 解耦重构（平台化前置）

- 优先级：`P1`
- 依赖：T109
- 交付物：`packages/cli` 的编排逻辑与 CLI 入口解耦。
- 任务内容：
  - [ ] 将 `runCli()` 中 `process.env` / `console.log` 紧耦合抽离为可注入依赖。
  - [ ] 抽象 `createPipeline(deps)` 接口，local 和 platform 模式共用同一编排核心。
- 完成定义：
  - [ ] 本地 CLI 模式行为不变，platform 模式可通过注入不同的 logger / config resolver 使用同一编排逻辑。

---

## M6: 最小平台 MVP

目标：交付一个可独立部署的集中管理平台的最小可用版本。

### T601 平台项目骨架搭建

- 优先级：`P1`
- 依赖：T505
- 交付物：Nuxt 4 全栈项目（`apps/platform/`）。
- 任务内容：
  - [ ] Nuxt 4 项目初始化，配置 TypeScript、PrimeVue、SCSS。
  - [ ] better-auth 认证集成（邮箱密码登录）。
  - [ ] TypeORM + SQLite 数据库初始化。
  - [ ] Docker Compose 开发/部署配置。
- 完成定义：
  - [ ] `docker compose up` 可拉起完整平台。

### T602 仓库与凭据管理

- 优先级：`P1`
- 依赖：T601
- 交付物：仓库 CRUD + 凭据加密存储。
- 任务内容：
  - [ ] Repository 实体与 CRUD API。
  - [ ] Credential 实体，AES-256-GCM 加密存储；凭据类型支持 classic PAT / fine-grained PAT / GitHub App（app-id + private-key），Dependabot alerts 读取必须显式授权（GITHUB_TOKEN 不可用，见 G2）。
  - [ ] Web UI：仓库列表、添加/编辑/删除。
- 完成定义：
  - [ ] 可通过 Web UI 管理仓库和关联凭据。

### T603 扫描触发与结果存储

- 优先级：`P1`
- 依赖：T602, T505
- 交付物：手动触发扫描 + 结果持久化。
- 任务内容：
  - [ ] ScanRun / ScanResult 实体设计。
  - [ ] Web UI 触发单仓库扫描，复用 `packages/cli` 编排逻辑。
  - [ ] 扫描结果写入 SQLite。
- 完成定义：
  - [ ] 可从 Web UI 对单个仓库触发扫描并查看结果。

### T604 仪表板与告警视图

- 优先级：`P1`
- 依赖：T603
- 交付物：仪表板 + 告警筛选视图。
- 任务内容：
  - [ ] 仪表板：仓库数、告警数、已修复数。
  - [ ] 告警视图：按仓库/严重级别/来源筛选。
  - [ ] 扫描历史列表。
- 完成定义：
  - [ ] 用户登录后可查看全局告警状态。

### T605 MCP Server 骨架（`@dependfix/mcp`）

- 优先级：`P1`
- 依赖：T505, T109
- 交付物：MCP Server 项目骨架 + 2 个只读 tool。
- 任务内容：
  - [ ] `packages/mcp` 初始化，配置 tsdown 构建。
  - [ ] 集成 `@modelcontextprotocol/sdk`。
  - [ ] 实现 `fetch_alerts` tool：拉取 Dependabot 告警。
  - [ ] 实现 `get_last_report` tool：读取最近 JSON 报告。
- 完成定义：
  - [ ] 可通过 `npx @dependfix/mcp` 启动并注册 tool。
- 设计文档：[MCP Server 设计](../design/governance/mcp-server.md)

### T606 MCP 写入 tool + CLI 互操作

- 优先级：`P2`
- 依赖：T605
- 交付物：`run_scan` + `fix_dependency` tool。
- 任务内容：
  - [ ] 实现 `run_scan` tool（复用 `DependfixApp` 程序化接口）。
  - [ ] 实现 `fix_dependency` tool（复用 `overrideTransitiveDependency`）。
  - [ ] 验证 MCP tool 结果与 CLI 输出一致性。
- 完成定义：
  - [ ] AI 助手可通过 MCP tool 完成完整扫描修复闭环。

> **T605 / T606** 是 CLI + Skills 自动化路径的基础设施。完成后可通过 `security-alert-remediator` skill 直接调用 MCP tool，代替手写 CLI 命令。

---

## M7: 企业级平台增强

目标：补齐多租户、高可用与跨平台能力。

### T701 RBAC 权限管理

- 优先级：`P2`
- 依赖：M6
- 交付物：角色权限管理系统。
- 任务内容：
  - [ ] 实现角色模型：Admin、Org Admin、Repo Admin、Viewer。
  - [ ] Admin：全局配置、用户管理。
  - [ ] Org Admin：管理组织下仓库。
  - [ ] Repo Admin：管理特定仓库修复策略。
  - [ ] Viewer：只读查看报告。
- 完成定义：
  - [ ] 不同角色只能执行其权限范围内的操作。

### T702 任务队列与并发控制

- 优先级：`P2`
- 依赖：M6
- 交付物：基于 BullMQ + Redis 的任务调度系统。
- 任务内容：
  - [ ] 集成 BullMQ + Redis 实现任务队列。
  - [ ] 并发控制：同一仓库同一时间仅一个扫描任务。
  - [ ] 优先级队列：手动触发 > webhook > 定时。
  - [ ] 任务去重：重复任务在队列中合并。
  - [ ] 失败重试策略：指数退避、最大重试可配。
- 完成定义：
  - [ ] 多仓库同时请求扫描时，任务按优先级和队列策略正确调度。

### T703 跨平台 Git 支持

- 优先级：`P2`
- 依赖：M6
- 交付物：支持 GitLab / Bitbucket 仓库连接。
- 任务内容：
  - [ ] GitLab PAT 认证与 API 集成。
  - [ ] Bitbucket PAT 认证与 API 集成。
  - [ ] 仓库级别配置（包管理器、忽略列表、自定义命令）。
  - [ ] 仓库连接状态监控。
- 完成定义：
  - [ ] 能通过 Web UI 添加 GitLab / Bitbucket 仓库。

### T704 定时扫描与批量处理

- 优先级：`P2`
- 依赖：T702
- 交付物：定时调度 + 批量执行 + 聚合报告。
- 任务内容：
  - [ ] cron 定时扫描配置。
  - [ ] 按组织/团队/标签批量选择仓库。
  - [ ] 批量扫描任务合并调度。
  - [ ] 跨仓库结果聚合统计。
- 完成定义：
  - [ ] 能配置定时任务并对多仓库批量执行。

### T705 生产级部署

- 优先级：`P2`
- 依赖：T702, T703
- 交付物：生产环境部署方案。
- 任务内容：
  - [ ] PostgreSQL 数据库迁移与适配。
  - [ ] Kubernetes + Helm Chart 部署方案。
  - [ ] 监控与告警集成（Sentry）。
- 完成定义：
  - [ ] 可通过 Helm Chart 部署到 Kubernetes 集群。

### T706 MCP Skill 集成与发布

- 优先级：`P2`
- 依赖：T606, M6
- 交付物：MCP Server 正式发布 + Skill 集成。
- 任务内容：
  - [ ] `@dependfix/mcp` 发布到 npm。
  - [ ] 更新 `security-alert-remediator` skill，对接 MCP tool。
  - [ ] 编写 MCP 接入文档与 Skill 编排示例。
- 完成定义：
  - [ ] 用户可通过 AI 助手对话式完成安全告警修复闭环。

---

## M2 增强候选（未排期）

> 2026-08-02 T208-T211 设计评审中确定的"未来评估项"，当前不做。

### B1 PR 关闭评论与 label 标记

- 状态：🔶 待评估
- 内容：关闭旧 PR 时发 comment 说明取代关系；创建 PR 时加 label `dependfix`（两者均需 `issues: write` 权限，比当前 `pull-requests: write` 权限面宽）
- 触发条件：PR 数量增长影响 `pulls.list` 查重性能，或用户需要 PR 列表可过滤/可检索时评估
- 来源：T210 设计评审（2026-08-02），用户确认"未来可以考虑增强，目前不做"

### B2 固定分支单线设计

- 状态：🔶 待评估（M6 平台部署时）
- 内容：独立平台部署后修复频率上升，需要一个固定修复分支（如 `dependfix/auto-fix`）避免频繁向 master 提交 PR；届时需与 T210 指纹方案整合（分支复用/重建策略、force push 语义）
- 来源：T210 设计评审（2026-08-02），用户明确"有这个需求但不是现在"

### B3 Dependabot 式分支命名（包名入分支名）

- 状态：✅ 已评估，暂不采用
- 结论：Dependabot 为单包单 PR（`dependfix/npm_and_yarn/<pkg>-<from>-<to>`），包名可作分支名；dependfix 为聚合 PR（一次修多个依赖），包名列表入分支名会超长（GitHub 分支名限 256 字符）且内容一变名就换，可读性收益有限。包名与版本已在 PR 标题（升级数）与 body（完整表格）中完整呈现，符合用户直觉
- 触发条件：未来出现"单包单 PR"模式需求时重新评估
- 来源：T210 设计评审（2026-08-02）

---

## 横切任务（后续阶段）

### T904 文档同步

- 优先级：`P0`
- 依赖：随功能推进持续进行
- 交付物：README、方案文档、使用说明同步更新。
- 任务内容：
  - [ ] 当 CLI 参数稳定后补使用文档。
  - [ ] 当 GitHub Action 落地后补 workflow 使用说明。
  - [ ] 当平台功能交付后补平台部署与使用文档。
- 完成定义：
  - [ ] 文档与实现保持同步，没有明显失真。
