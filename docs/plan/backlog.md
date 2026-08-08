# 待办积压 (Backlog)

> 本文档存放后续阶段与未排期增强候选。当前阶段任务见 [todo.md](todo.md)；已归档阶段见 [todo-archive.md](todo-archive.md)。


## M4 增强候选（未排期）

> 2026-08-06 M3 归档时从阶段遗留 / 观察点整理，非 M4 本期范围（M4 核心为多仓库治理 T401-T404，见 [todo-archive.md](todo-archive.md#m4-多仓库治理增强已归档)）。按主题分组，随运行反馈再评估上收。

### 工具链与锁文件

> 已闭环（2026-08-06/07 清理，记录见 [todo-archive.md §M4](todo-archive.md#m4-阶段治理记录2026-08-05--2026-08-06)）：C1 pnpm 11 overrides 假成功检测（12af197d）、C2 toolchainPnpmVersion 验证链（cf12e381）、C20 lint:md 文档门禁（47050e6e）。

- **C3 漂移检测弱代理**（T305 遗留）
  - 状态：🔶 待评估
  - 内容：lockfileVersion 漂移检测为相对对比（before/after），非严格"声明版本一致性"校验
  - 来源：T305 Review Gate（2026-08-05）
- **C4 pnpm catalog 依赖的 override 行为未实测**（G3 遗留）
  - 状态：🔶 待评估
  - 内容：使用 pnpm catalog 声明的依赖，版本化 overrides 是否生效未实测
  - 来源：G3 处理记录（2026-08-05）

### 报告与统计口径

> 已闭环（2026-08-06 清理，cf12e381）：C6 PR body 64KB 截断、C7 alertsConverged 口径拆分。

- **C8 per-source 错误隔离**（T301 遗留）
  - 状态：🔶 待评估
  - 内容：并行源任一失败目前整体硬失败（已拉取的 Dependabot 结果丢失）；演进为 warn + 仅弃该源（需确认语义）
  - 来源：T301 Review Gate（2026-08-05）
- **C9 summary 字段未渲染**（T304 遗留）
  - 状态：🔶 待评估
  - 内容：告警 summary 已收集未渲染（JSON 可见；报告/PR body 如需摘要列可加）
  - 来源：T304 Review Gate（2026-08-05）

### 覆盖策略

> 已闭环（2026-08-06 清理，10927851）：C10 lockfile 告警版本关系细化、C11 workspace 成员直接依赖识别。
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

### GitHub Organization 增强候选（2026-08-07 评估登记）

> 评估结论：M4 已交付 org 基础支持（`--owner` 发现走 `GET /orgs/{org}/repos`、过滤链、per-repo 告警拉取、直接推送分支建 PR、测试覆盖），基础可用。以下为评估后登记的增强项，按价值排序；README 已补 org 用法与权限说明。

- **C22 GitHub App / installation token 认证**（CLI 侧增强，org 场景安全性关键项）
  - 状态：🔶 待评估（关联 M6 T602）
  - 内容：当前仅支持 PAT（`GITHUB_TOKEN` / `DEPENDFIX_GITHUB_TOKEN` / `DEPENDFIX_ALERTS_TOKEN`）；架构文档声明输入含 "GitHub App 凭证"（[architecture.md](../design/governance/architecture.md)），但 [github-client.md](../design/packages/github-client.md) 明确"不实现 GitHub App / Installation Token 认证"。org 场景 PAT 痛点：classic PAT 需 `repo` 全量 scope（权限过大）；fine-grained PAT 需逐仓库配置 + 逐个 org 启用 SSO；个人 token 离职/轮换管理困难。GitHub App 价值：按仓库授权限、短时 token、org 管理员可控可审计
  - 实现路径：`createGitHubClient` 增加 app auth（appId + privateKey → JWT → installation token），或支持直接注入 installation token（后者近零成本，当前传任意有效 token 即可用，缺的是文档化 + 生成链路）
  - 关联：M6 T602 凭据管理已规划 GitHub App 凭据类型（app-id + private-key）；CLI 侧认证能力为其前置或并行增强
  - 来源：2026-08-07 GitHub Organization 支持评估
- **C23 发现规模上限 max-repos**（架构文档已规划未实现）
  - 状态：🔶 待评估
  - 内容：[architecture.md](../design/governance/architecture.md) 规划 `max-repos` 输入参数，代码未实现（grep 零命中）。大 org（数百仓库）一次性全量发现 + 逐仓库探测 `.github/dependabot.yml`（N 次 contents API），配额消耗与总耗时不可控；现有防护仅 concurrency（report-only 16）+ 限流重试 + probe 并发 5，无总量上限
  - 建议：发现层按配置上限截断（排序后截断保证确定性），或拆为分批处理
  - 来源：2026-08-07 GitHub Organization 支持评估
- **C24 org 级 alerts API 批量拉取**（优化项）
  - 状态：🔶 待评估（等真实大 org 用户痛点再动）
  - 内容：GitHub 提供 org 级 `GET /orgs/{org}/dependabot/alerts` 与 `GET /orgs/{org}/code-scanning/alerts`，当前按仓库逐仓拉取（listAlertsForRepo）。大 org 场景可显著减少 API 调用，但需按仓库重组结果 + defaultBranch 注入（org 级响应可能缺省分支上下文），复杂度上升
  - 来源：2026-08-07 GitHub Organization 支持评估

### M4 残余风险登记（2026-08-06，T402-T404 Review Gate 移交）

> M4 交付时审计登记的 8 项残余风险。
> **2026-08-07 清理**：R1-R7 已全部闭环（修复批次 3d19d499 / ac8ce5c7 / 965e68f3），记录见 [todo-archive.md §M4 治理记录](todo-archive.md#m4-阶段治理记录2026-08-05--2026-08-06)，本条仅保留 R8。

- **R8 多进程 index 写竞态**（**部分完成**）：原子写已落地（临时文件 + rename，无半截文件）；双进程 read-modify-write 丢失更新在单进程 CLI 语义下不可达，平台化（M6+ 数据库化）消解

### M4 已知限制（P3 观察项，非阻塞）

> **2026-08-07 清理**：7 项已闭环（--history 与运行参数并存、小数截断拒绝、merge 大小写去重、repoSlug 碰撞后缀、cleanup-branches 空归档跳过、cleanup-branches maxConcurrency 拒绝、M4 参数接入 Action），记录见 [todo-archive.md §M4 治理记录](todo-archive.md#m4-阶段治理记录2026-08-05--2026-08-06)，本条仅保留观察项。

- **action artifact 体积**：归档结构（summary.json + 每仓库 md/json）随上传，artifact 略增

## M5.5: Skill 编排（CLI 先行）

> **已归档（2026-08-07）**：T506-T508 全部完成，见 [todo-archive.md §M5.5](todo-archive.md#m55-skill-编排cli-先行已归档)。

## M6: 最小平台 MVP

> **已转入 todo.md（2026-08-07 规划）**：M6 任务明细与细化见 [todo.md §M6](todo.md#m6-最小平台-mvp)。规划决策（执行深度 A/B 双模式、同步执行、MCP 保留合并、沙箱设计先行、Action 触发实现）与 6 项任务（T601-T605 + T607，原 T605/T606 合并）已落盘。以下仅保留本阶段转移出的增强候选。

- **C25 M6 Action 触发结果回填**（T607 登记，Q5=B 已知边界）
  - 状态：✅ 已实现（2026-08-08）——`ActionResultFetcher`（轮询 run 完成 → 下载 `dependfix-report-{runId}` artifact → 解析 JSON 落库 ScanRun/ScanResult）；B 模式触发后同步等待结果，`completed` + 明细 / 结果未就绪 `dispatched` + runUrl / 触发失败 `failed`
  - 内容：平台触发 `workflow_dispatch` 后，action 输出（扫描/修复结果）回填到平台结果存储（ScanRun/ScanResult）——通过 artifact 下载通道（action.yml 已上传 `dependfix-report-{runId}`）
  - 来源：M6 规划（2026-08-07，Q5=B 评估+实现触发，回填边界）→ M6 增强（2026-08-08 用户要求自动拉取）
- **C26 独立沙箱容器执行实现**（T607 设计文档产出后的实现候选）
  - 状态：🔶 待评估（M7 候选）
  - 内容：平台容器即沙箱的最小实现（M6 T603 `ContainerExecutor`）之后，若恶意依赖升级威胁面评估结论需要更严格隔离，实现独立 worker 容器（每任务/每仓库容器，网络/文件系统隔离）；与 M7 T702 BullMQ worker 模型结合
  - 来源：M6 规划（2026-08-07，Q4=A 设计+最小实现，完整沙箱留后续）
- **C27 B 模式 runUrl 未定位状态语义**（M6 终审 W3 登记）
  - 状态：✅ 已闭环（2026-08-08，随 C25 实现联动解决）——orchestrator B 模式三分支：结果已拉取 `completed` + 明细 / 触发成功但结果未就绪 `dispatched` + runUrl / 触发失败 `failed`；`run_url_not_resolved` 不再误置 failed
  - 内容：`ActionTriggerExecutor` 触发 204 受理但轮询未定位 run 时返回 `run_url_not_resolved`，orchestrator 将 ScanRun 置 `failed`——UI 显示"扫描失败"，但 action 实际已在目标仓库运行，与事实不符。建议独立状态（如 `dispatched` + 提示"已触发，未能定位运行详情"）或前端按 error.code 区分展示；与 C25 结果回填联动评估
  - 来源：M6 终审（2026-08-08，deep Review Gate warning 3）
- **C28 security.md 补凭据加密存储章节**（M6 终审 W4 登记）
  - 状态：🔶 待评估（不阻塞 M6）
  - 内容：security.md 未登记 T602 凭据加密机制（ENCRYPTION_KEY / AES-256-GCM / 解密仅执行时内存 / 凭据最小化），加密设计散落 executor-sandbox.md §3 与 credential.service.ts 注释；安全设计文档应与实现同步补"凭据加密存储"一节
  - 来源：M6 终审（2026-08-08，deep Review Gate warning 4）

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
  - [ ] 并发控制：同一仓库同一时间仅一个扫描任务（**M6 已落地轻量版**：进程内同仓库互斥锁 `withRepoLock`，见 `apps/platform/server/services/repo-lock.ts`——单实例 FIFO 串行；M7 换 BullMQ 承接多实例/跨进程）。
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
- 依赖：T605, M6
- 交付物：MCP Server 正式发布 + Skill 双后端集成。
- 任务内容：
  - [ ] `@dependfix/mcp` 发布到 npm。
  - [ ] `dependfix-remediator` skill（M5.5）确认 MCP 双后端探测与映射（T508 验收）。
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

### 并行开发工作流：git worktree 预案（2026-08-07 评估落盘）

> **背景**：本轮尝试并行开发，同目录/同分支下多任务改动存在冲突风险；考虑引入 git worktree。momei 项目曾尝试 worktree 但效果一般（多目录互相同步成本、未提交的本地 env 在另一分支缺失导致启动失败）。
>
> **调研结论**（2026-08-07，pnpm 官方 worktree 文档 / trigger.dev 弃用复盘 / termdock 6 种故障模式）：
> - **CLI 阶段 worktree 可行但收益有限**：无端口/数据库/服务冲突，pnpm 全局 store 已启用（`D:\.pnpm-store\v11`），加 `enableGlobalVirtualStore: true` 后新 worktree 的 `pnpm install` 近瞬时、磁盘近零增量（npm 场景 2 worktree 烧 9.82GB 的反例在 pnpm 模式下不成立）
> - **M6 平台阶段将撞上"基础设施税"**（trigger.dev 弃用根因）：数据库/Redis/端口每 worktree 复制是噩梦；正确做法是单共享 DB + 每 worktree 独立 database + 独立端口（env 模板 `DB_NAME=<branch-slug>`、`PORT=<base+index>`）
> - **worktree 隔离文件系统层而非语义层**：热点文件冲突依然存在，且冲突发生在"没写过的代码"上；T505 解耦（app/pipeline.ts 独立文件）天然降低冲突面
> - **本项目特有坑**：`.agents/skills` / `.claude/skills` / `.claude/agents` / `.opencode/agents` 是绝对路径 symlink（指向 `.github/skills` / `.github/agents`，被 .gitignore 忽略）——worktree 新目录下链接缺失，agent 工具加载不到 skill / agent 定义。解法照搬 pnpm 官方：worktree 创建脚本从 common dir 重建 symlink
> - **故障模式映射**（termdock 6 类 → 本项目）：lockfile 分歧（高风险，约定依赖变更单侧发生）、index.lock（低）、branch 已 checkout（低）、merge 冲突（中，热点文件 `config/index.ts` / `app/index.ts` / `cli/index.ts`）、过期 worktree（低，禁止 rm -rf）、build cache 污染（低，tsdown dist 天然隔离）
>
> **方案矩阵**：
> | 选项 | 适用 | 成本 |
> |:--|:--|:--|
> | A. 维持现状（单目录顺序执行） | 当前单人单 agent 为主 | 零 |
> | B. pnpm 官方 worktree 模式（裸仓库 + enableGlobalVirtualStore + 初始化脚本） | 多 agent 并行成为常态 | 低，纯脚本无新依赖 |
> | C. GitButler 虚拟分支 | 多分支但少同文件冲突 | 中，新工具 + skill 改造，同文件冲突更危险 |
> | D. 每任务克隆 + 容器化 | 最大隔离 | 高 |
>
> **决策**：现阶段不引入（保持 A）；B 预案化——并行需求成为常态时按脚本启用，不临时踩坑。M6 的 env 隔离设计约束（独立 database/端口）在 T601/T602 设计时生效。

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

### T905 git worktree 并行开发预案（条件启用）

- 优先级：`P3`（触发条件：多 agent 并行开发成为常态，当前不执行）
- 依赖：T505（解耦降低冲突面）、M6 T601/T602（env 隔离约束）
- 交付物：worktree 初始化脚本 + 使用文档。
- 任务内容：
  - [ ] `pnpm-workspace.yaml` 启用 `enableGlobalVirtualStore: true`，验证新 worktree 安装近瞬时
  - [ ] `worktree:new` 脚本：`git worktree add` + env 模板复制（`.env.example` 提交 git，真实 env 不入库）+ skills/agents symlink 重建（`.agents/skills` / `.claude/skills` / `.claude/agents` / `.opencode/agents` → `.github/` 对应目录）+ `pnpm install`
  - [ ] M6 平台 env 隔离设计约束：单共享 DB 实例 + 每 worktree 独立 database + 端口基址偏移（`PORT=<base+index>`），随 T601/T602 落地；口径映射——T601 当前为 SQLite（单文件库）时即每 worktree 独立 db 文件，独立 database 约束随 T705 PostgreSQL 迁移生效
  - [ ] 冲突预防规范：lockfile 依赖变更单侧发生（merge 后 `pnpm install` 重生成）；热点文件单写者规则；新代码优先走新文件（配合 T505）；一律 `git worktree remove` 清理（禁 `rm -rf`）
- 完成定义：
  - [ ] 一条命令创建可用的 worktree（env + symlink + node_modules 就绪），agent 工具在新目录行为与主目录一致
  - [ ] 多 worktree 并行运行互不干扰（端口/DB/构建产物隔离）
