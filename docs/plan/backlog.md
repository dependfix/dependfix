# 待办积压 (Backlog)

> 本文档存放 M5 及之后阶段的详细任务。当前阶段（M4）的任务见 [todo.md](todo.md)。

---

## M4 增强候选（未排期）

> 2026-08-06 M3 归档时从阶段遗留 / 观察点整理，非 M4 本期范围（M4 核心为多仓库治理 T401-T404，见 [todo.md](todo.md)）。按主题分组，随运行反馈再评估上收。

### 工具链与锁文件

- **C20 文档 Markdown 格式门禁（lint:md）**——**已落地 2026-08-07**：参照 momei 引入 `@lint-md/cli@2.2.4`（根 `.lintmdrc` 规则裁剪与 momei 一致，关闭半角标点等规则）+ `pnpm lint:md`（--fix 本地）与 `pnpm lint:md:check`（CI 门禁，test.yml / release.yml）+ lint-staged `*.md` 挂载。已知边界：`.changeset/`、`.session/` 不在 glob 内（工具生成/本地记忆，与 momei 覆盖一致）；lint-md 无内置 node_modules 忽略（当前零影响，未来 packages 下新增非 symlink md 需注意）
- **C1 pnpm 11 不读 `package.json#pnpm.overrides` 假成功风险**（Review Gate 遗留）
  - 状态：🔶 待评估
  - 内容：无 pnpm-workspace.yaml 的仓库，`applyVersionedOverrides` 回退写 package.json 会假成功（install 通过但 override 被忽略）。建议 pnpm 大版本探测 + 警告（本仓库有 workspace.yaml 不受影响）
  - 来源：版本化 overrides 复盘 Review Gate（2026-08-06）
- **C2 verifyFrozenLockfile 仍用裸 pnpm 验证**（T305 遗留）——**已修复 2026-08-06**：默认验证命令链在显式 `toolchainPnpmVersion` 时 install 命令替换为 `corepack pnpm@<v> install --frozen-lockfile`（与 PIN_TOOLCHAIN 一致）。已知不对称：仅 packageManager 声明场景 verify 仍用裸 pnpm
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

- **C6 PR body 64KB 上限**（T304 遗留）——**已修复 2026-08-06**：generatePRBody 超 60KB（保守取 GitHub 64KB）时从尾部逐行截断（头部摘要保留）+ "Body truncated" 说明
- **C7 报告统计口径 alertsConverged**（G3 遗留）——**已修复 2026-08-06**：RunSummary 新增 `alertsConverged`（已收敛：当前锁定版本 >= 推荐 / lockfile 无脆弱实例），从 `alertsSkipped` 拆分；markdown 报告与 PR body Summary 表新增 Converged 行。**行为变化**：原计入 Skipped 的部分场景改计 Converged，Skipped 数字变小
- **C8 per-source 错误隔离**（T301 遗留）
  - 状态：🔶 待评估
  - 内容：并行源任一失败目前整体硬失败（已拉取的 Dependabot 结果丢失）；演进为 warn + 仅弃该源（需确认语义）
  - 来源：T301 Review Gate（2026-08-05）
- **C9 summary 字段未渲染**（T304 遗留）
  - 状态：🔶 待评估
  - 内容：告警 summary 已收集未渲染（JSON 可见；报告/PR body 如需摘要列可加）
  - 来源：T304 Review Gate（2026-08-05）

### 覆盖策略

- **C10 根直接依赖 + lockfile 告警覆盖损失**（G3 遗留）——**已修复 2026-08-06**：细化为按版本关系判定——推荐版本 >= 锁定版本 → 可安全修复（直接升级/精确 override 均不降级声明）；推荐 < 锁定或无版本信息 → 维持跳过。详见 [dependency-fixer.md §12.4](../design/packages/dependency-fixer.md)
- **C11 monorepo 成员包直接依赖盲区**（G3 遗留）——**已修复 2026-08-06**：直接依赖判定扩展为根 + workspace 成员包（pnpm-workspace.yaml packages glob 展开，支持字面/*/**）。已知限制：`!` 排除模式未处理（保守方向）、递归不跟随符号链接。详见 [dependency-fixer.md §12.5](../design/packages/dependency-fixer.md)
- **C12 major overrides 确认机制**（G3 遗留）
  - 状态：🔶 已评估，暂不实现（2026-08-05）
  - 内容：major overrides 自动拦截不实现（逐包验证 + 回滚已兜底）
  - 来源：G3 处理记录
  - 关联：**T405（2026-08-07）已实现 `--allow-major-upgrade` 跨线显式授权通道**，但语义不同——T405 针对"当前线内无修复版本"的跨线告警（仅直接依赖单版本自动升级，强制完整验证）；C12 指常规链路的 major overrides 自动拦截确认机制，仍不实现

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

### GitHub Code Quality（Standard findings）

- **C21 接入 Code Quality Standard findings 数据源**（2026-08-07 评估登记）
  - 状态：🔶 已评估，登记 backlog（用户决策：不阻塞 M5/M6；M5 后评估完整支持，最小报告接入可提前）
  - 内容：接入 `GET /repos/{owner}/{repo}/code-quality/findings`（确定性 CodeQL 质量规则：maintainability / reliability），新增 `source: 'code-quality'` 复用 `NormalizedSecurityAlert` 模型与 A/B/C 规则分层；首版 report-only（C 类默认），机械性规则白名单自动修复为演进项；规则分类器扩展（质量规则 id 为 `js/useless-assignment-to-local` 斜杠格式，与 CodeQL 安全规则同族，可复用 `classifyRule`）
  - **定价澄清（用户确认 2026-08-07）**：Standard findings（确定性 CodeQL 扫描）**免费跑**，仅消耗 Actions minutes；付费面为 **AI findings / Copilot Autofix**（消耗 AI credits）。公开报道口径（2026-07-20 GA，$10/active committer/月）与实际计费需实测校准
  - 与 Code Scanning 差异：目的（质量债 vs 安全漏洞）；severity（`error/warning/recommendation` + `category` vs `security_severity_level`）；UI（`/security/quality` vs `/security/code-scanning`）；权限（**`Code quality: read`** vs `security-events: read`——GitHub App UAT/IAT 均支持但需显式配置权限，GITHUB_TOKEN 可达性需实测）；分页（cursor `before/after` vs octokit.paginate Link header）
  - 前置（实测项）：IAT / GITHUB_TOKEN 对 `code-quality/findings` 的权限可达性；`state` 枚举值域；cursor 分页语义；action.yml 是否新增 `code-quality: read` 权限键
  - 来源：2026-08-07 评估（用户提问：Standard findings 与 Code Scanning 差异、是否支持）

### M4 非目标演进项

- **C17 内容嗅探判断技术栈**：T401 非目标（首版 topic/dependabot.yml 探测）；内容扫描成本与 token 面需评估
- **C18 名单正则引擎**：T403 非目标（首版 glob 通配）
- **C19 报告保留策略**：T404 非目标（容量治理：归档上限 / 清理策略）

### M4 残余风险登记（2026-08-06，T402-T404 Review Gate 移交）

> M4 交付时审计登记的 8 项残余风险，供后续阶段排期跟踪。
> **2026-08-06 修复状态**：R1/R2/R3/R5/R6/R7 已修复（提交后回链）；R8 原子写部分完成（多进程竞态移交 M6）。

- ~~**R1 写请求 429 重放**~~（**已修复**）：限流重试 hook 现仅对 GET/HEAD 生效，写请求（POST/PATCH/PUT/DELETE）不做限流重试（非幂等避免重放）。行为变化：写请求遇限流立即失败，需用户重跑
- ~~**R2 MAX_BACKOFF_MS 硬编码**~~（**已修复**）：`--max-backoff-ms` / `DEPENDFIX_MAX_BACKOFF_MS`（100-120000，默认 30000），Retry-After / reset / 指数退避均受此上限约束
- ~~**R3 Retry-After 头未解析**~~（**已修复**）：等待优先级改为 Retry-After（秒，受 maxBackoffMs 上限）→ x-ratelimit-reset → 指数退避
- **R4 CJS require p-queue ESM-only**（**已消除 2026-08-06，方案 A：全 ESM**）：消费面（CLI bin / Action / 仓库内 / 未来平台）均为 ESM，外部 CJS 编程式消费者为 0；两包改为单格式 `esm`（tsdown format 与 package.json exports 同步），R4 动态 import 兼容代码回退为静态 import。Node 22.12+ 原生 require(ESM) 兜底未来 CJS 消费者
- ~~**R5 topics 匹配大小写敏感**~~（**已修复**）：配置与仓库 topics 均 toLowerCase 归一化比较；mergeRepositories 大小写不敏感去重
- ~~**R6 glob ReDoS 面**~~（**已修复（加固）**）：`repoGlobToRegExp` 拒绝超长模式（>200 字符）；多通配符模式仍存在理论回溯面（受信配置 + 短输入，风险低），C18 正则引擎落地时需专项审计
- ~~**R7 损坏 index.json 覆盖即丢历史**~~（**已修复**）：解析失败的损坏索引先备份为 `index.json.corrupt-{ts}.bak` 再重建
- **R8 多进程 index 写竞态**（**部分完成**）：原子写已落地（临时文件 + rename，无半截文件）；双进程 read-modify-write 丢失更新在单进程 CLI 语义下不可达，平台化（M6+ 数据库化）消解

### M4 已知限制（P3 观察项，非阻塞）

> **2026-08-06 修复状态**：以下 5 项已落实（提交后回链）：小数截断（CLI + env 双入口）、merge 大小写去重、repoSlug 碰撞后缀、cleanup-branches 空归档条目跳过、cleanup-branches maxConcurrency 拒绝。

- ~~**--history 与运行参数并存**~~：CLI 短路优先 history，其余参数静默忽略；help 文档已注明互斥（configuration.md 配置项表）
- ~~**--max-concurrency / --max-retries 小数截断**~~（**已修复**）：CLI `parseIntegerFlag` + env `normalizeInteger` 均严格整数字面量校验（`2.5` 拒绝而非截断）
- ~~**mergeRepositories 大小写敏感**~~（**已修复**）：显式 `Owner/Repo` 与发现 `owner/repo` 视为同一仓库去重
- ~~**repoSlug 坍缩**~~（**已修复**）：同 run 内 slug 碰撞追加 `-2`/`-3` 后缀（`a/b-c` 与 `a-b/c` 不再相互覆盖）
- ~~**cleanup-branches 模式空归档条目**~~（**已修复**）：仓库维度为空时不更新 index.json（不累积 `repositories: []` 记录），summary.json 仍写盘
- ~~**cleanup-branches 模式 maxConcurrency 静默忽略**~~（**已修复**）：`maxConcurrency > 1` + cleanup-branches 配置校验 fail-fast
- **M4 参数未接入 Action**（**已修复 2026-08-06**）：action.yml 已接入 owner/repo-*/max-concurrency/max-retries 输入；建议每仓库单独配置 action 控制权限范围（见 quick-start/design 文档）
- **action artifact 体积**：归档结构（summary.json + 每仓库 md/json）随上传，artifact 略增

---

## M5: AI Breaking Change 研判

> **已转入 [todo.md §M5](todo.md#m5-ai-breaking-change-研判)（2026-08-07 启动规划）**：任务定义已细化（T501 采集 / T502 研判 / T503 生成 / T504 质量门 / T505 CLI 解耦），并列出 4 项待确认决策（AI 提供商 / 触发时机 / Token 来源 / 成本默认值）。下文保留 2026-08-02 原始草案供追溯，不再作为执行依据。

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
