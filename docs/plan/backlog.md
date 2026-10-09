# 待办积压 (Backlog)

> 本文档维护尚未进入正式阶段执行面的统一候选池，按 **长期主线任务** / **周期性回归验证层** / **短期与一次性候选任务** / **已知边界与 known-issue** 四象限区分。当前阶段任务见 [todo.md](todo.md)；已闭环归档见 [todo-archive.md](todo-archive.md)。
>
> **维护规则**：
> 1. 新功能需求、非阻塞优化与长期治理事项优先写入本文件，而不是直接写入 `todo.md`；已闭环条目从 backlog 移除，由 [todo-archive.md](todo-archive.md) 统一维护。
> 2. backlog 必须区分四类：长期主线（可跨阶段保留）/ 周期性回归验证层（健康检查层）/ 短期与一次性候选（评估后上收或关闭）/ 已知边界与 known-issue（CI / 浏览器兼容性等持续观察项）。
> 3. 长期主线被某阶段抽取后不删除主线卡片，只补记当前状态与下一次可切片方向；**若该主线验收条件已达成 / 目标被某阶段闭环，则按 [规划规范 §4.4 第 11 条](../standards/planning.md#44-大批量归档批次操作规范)「长期主线卡闭环同步」整卡删除或改写状态**。
> 4. 周期性回归验证层不是"一个任务"，而是所有长期主线的健康检查层；它按固定节奏运行，不参与阶段切片容量竞争。
> 5. 短期候选正式上收阶段后从 backlog 移除；评估为"暂不实现"的候选直接关闭并在归档中保留决策记录。
> 6. 当前仓库的 backlog 以中文为唯一事实源。

## 长期主线任务（可跨阶段保留）

> **状态口径**：进行中 / 观察中 / 暂停 / 已关闭。

### 主线 #1：network-audit 默认白名单持续扩展问题（G1）

- **目标**：把 network-audit 默认白名单从"按次新增"演进为"按域名 / SRI 哈希 / 输出区分"的可持续治理方案，避免每次构建工具跨 major 升级都需补白名单。
- **状态**：观察中。
- **下一次可切片方向**（任一触发时重新评估）：
  1. 构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）—— **候选方向 3（命令输出 URL 与真实外联区分）落地后优先级降低**：合法外联不会再被误判，新增白名单诉求应转为"真实注册表域"申请而非"构建工具文档站"
  2. 按 SRI 哈希钉资源（推荐域动态发现）
- **验收**：默认白名单不再按次新增；verification 阶段合法外联不被误判（已达成）；剩余候选方向（SRI 哈希钉定等）任一实施或主线整体评估为长期保留后关闭本主线条目（候选方向 3「命令输出 URL 与真实外联区分」已落地，不单独构成关闭条件）

## 周期性回归验证层

> **定位**：本层不是"一个任务"，而是所有长期主线的健康检查层。它不产生直接改进，只验证"没有回退"。按固定节奏执行，不参与阶段切片容量竞争。

### 固定执行入口（当前）

| 节奏 | 入口 | 最小固定组合 | 触发条件 |
|:---|:---|:---|:---|
| 阶段收口前 | `pnpm check:docs` + `pnpm run test:coverage` + `pnpm lint` + `pnpm typecheck` + `pnpm --filter @dependfix/platform exec playwright test` | 检查归档批次合入未引入回归 | 每次阶段归档前 |
| CI 端到端 | 上述 5 项 + `pnpm build` | 裁决合并 | PR 合并前 / commit 推送后 |

> **扩面候选**（待评估）：周级 `pnpm regression:weekly` 与发版前 `pnpm regression:pre-release` 入口未建立；当前依赖 CI 端到端裁决。

### 覆盖矩阵（每条长期主线的回归覆盖状态）

| 长期主线 | 阶段收口覆盖 | CI 端到端覆盖 |
|:---|:---|:---|
| #1 network-audit 默认白名单 | ✅ `packages/engine/src/runners/verification-runner.test.ts` + `network-audit.test.ts` | ✅ `pnpm run` verification job |

> 标注 `—` 的条目表示当前缺少自动化回归覆盖，是后续回归层扩面的候选方向。

### 漂移路由规则

回归验证发现的问题不自行修复，而是按以下规则路由到对应长期主线或短期候选：

| 回归发现问题 | 路由目标 |
|:---|:---|
| network-audit 真实注册表域新增诉求 / 命令输出 URL 阻断 regression | → 长期主线 #1（network-audit 默认白名单） |
| CI 失败 | → 当前阶段批次（无活跃阶段时登记 backlog 远期） |

## 短期 / 一次性候选任务（上收后去重）

> 共享说明：本区块条目当前均处于"候选评估中"或"延期暂缓"状态；正式上收阶段后从 backlog 移除并归档至 [todo-archive.md](todo-archive.md)。评估为"暂不实现"的候选直接关闭。

### 候选评估中（待评估 / 本阶段延后项）

> **2026-10-08 M38 启动批次上收（已随 2026-10-09 M38 归档）**：M38（平台执行模型隔离）从本区块上收 4 项候选——① `scan.post` failover 未透传 reuse → M38.3；② e2e 全页卡片计数断言解耦 → M38.4；③ `scan-queue.ts` 注释 jobId 口径 → M38.5；④ schedule 表单复用 `scan-options` 口径 → M38.6（按维护规则 5「短期候选正式上收阶段后从 backlog 移除」清出）。`distill-wisdom` 计数假阴性与 `tech-stack` 依赖表行级不一致按条目容量控制（5-6 项）保留待评估。按 [规划规范 §3.4](../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估教训--2026-09-10) 三重交叉核验 0 项重复评估（见 [todo-archive.md §M38](todo-archive.md#m38-平台执行模型隔离m381m386-全部已闭环--2026-10-09-归档)）。
>
> **2026-10-06 M37 启动批次上收（方案 B，已随 2026-10-08 M37 归档）**：本区块原有 6 项候选全部上收至 M37（M37.1 运行失败分类与筛选 / M37.2 扫描偏好记忆 / M37.3 写回与信号残余 / M37.4 版本口径），另 M36.1 检测脚本未接入 CI 门禁随批上收为 M37.5；三重交叉核验 0 项重复评估。详见 [todo-archive.md §M37](todo-archive.md#m37-运行可观测性与体验记忆m371m376-全部已闭环--2026-10-08-归档)。
>
> 存量候选说明：更早批次（M36 方案 A）已随 2026-10-05 M36 归档批次完整闭环归档，见 [todo-archive.md §M36](todo-archive.md#m36-治理债清仓--可观测性与测试稳定性m361m3610-全部已闭环--2026-10-05-归档)。

- **运行失败「受约束重试入口」（M37 延后，保留待评估）** —— M37.1 已落地「分类 + 筛选 + 展示」（`failure_code` / `failure_stage` / `failure_kind` 三列 + 三维筛选 + 阶段展示）；设计稿 §5.5 的「仅 `transient` 可一键重试」入口（含非终态守卫 / 同仓库去重 / `retriedFromRunId` 审计来源）按用户 2026-10-06 决策自 M37.1 范围延后（M37 已于 2026-10-08 闭环归档）。**现状锚点**：[run-failure-taxonomy.md §5.5](../design/governance/run-failure-taxonomy.md)。触发条件：① 分类 + 筛选上线后确认重试诉求；② 用户明确要求受约束重试。

- **扫描偏好服务端跨设备默认（M37 延后，保留待评估）** —— M37.2 已落地方案 C 混合（localStorage 设备级：上次选择 + 可选配置化默认 + 重置）；服务端用户 / 组织级默认偏好（跨设备、可管理，需实体 / API / 设置页，预计触发 governance 文档）按用户 2026-10-06 决策自 M37.2 范围延后（M37 已于 2026-10-08 闭环归档）。**现状锚点**：`apps/platform/app/composables/use-scan-preferences.ts`（M37.2 新增后）。触发条件：① 用户实测多设备切换痛点；② 组织级统一默认诉求。

- **push 侧 `pre-push` 钩子隔离（待评估）** —— M37.6 A 阶段审计 RG-S1 衍生：M37.6 仅隔离 commit 侧 hooks（`--no-verify` 不作用于 `git push`），被修复仓库若安装依赖 `npx` 的 `pre-push` 钩子，理论上可在 push 阶段复现同类失败（`packages/engine/src/github/pr-creator.ts` 的 `pushBranch` 与平台侧 `pushFixBranch` 均未加隔离）。M37.6 边界显式排除 push / PR 交付链，故未在本批处理。
  - **待评估点**：① 生产日志中是否存在 `pre-push` 导致的交付失败实例（当前已观测失败均为 `pre-commit` / `commit-msg`）；② 若存在，隔离选型（`git push --no-verify`）与 commit 侧是否共用常量。
  - **触发条件**：生产日志出现 `pre-push` 失败，或用户要求 push 侧一并隔离。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **tech-stack 平台依赖表与 `apps/platform/package.json` 行级不一致（待评估）** —— M37.4 同源复核发现：`docs/guide/tech-stack.md` 核心框架表按 `^X.x` 粗粒度声明平台依赖，但其中 `@lucide/vue` 行写 `^1.48`（声明为 `^1.49.0`，区间仍覆盖但口径不同步）；`pinia` / `@vueuse/core` / `@vueuse/nuxt` / `@sentry/nuxt` / `@vite-pwa/nuxt` 5 行在 `apps/platform/package.json` 与 `nuxt.config.ts` 模块列表中**均无对应声明与引用**（疑似模板期占位行）。M37.4 范围仅限 caomei-ui 版本口径（其余「不做什么」显式排除），故未在本批处理。
  - **待评估点**：① 逐行核对整表与 `package.json` / `nuxt.config` 的对应关系；② 删除无引用行 vs 补声明（若确为规划中的能力）；③ 是否统一为「不写具体版本号，指向 package.json」以减少同类漂移。
  - **触发条件**：依赖变更需要核对文档时；或用户要求清理文档依赖表。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`distill-wisdom` 对「日期+类型」格式活跃条目的计数假阴性（待评估）** —— M37 归档批次发现：`.session/wisdom.md` 活跃条目按 `- **[YYYY-MM-DD] [type] 标题**：正文` 书写时，`scripts/distill-wisdom.mjs` 的条目标题解析正则（`- **[type-id]** 标题`）不匹配 → `pnpm distill:wisdom --check` 输出 `0 active entries`（假阴性），会掩盖「已超 20 条阈值」的状态；本批次已按脚本可解析格式（历史摘要行 `- **[type-id]** 摘要 → 详见 [path]`）重写并全量蒸馏至 0，故当前不受影响。
  - **待评估点**：① 是否让脚本同时容忍 `**[日期] [类型] …**` 形态，或在蒸馏机制文档中统一规定条目格式；② `--check` 是否增加「解析到 0 条但文件存在条目样式」的显式告警（防假阴性再次静默通过）。
  - **触发条件**：下次 session 写入活跃条目时（沿用日期+类型写法即复现）；或用户要求加固脚本。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **队列 worker 进程按 role 跳过周期插件（待评估）** —— M38.1 独立 worker 进程形态的已知边界：worker 与 HTTP 进程共享同一 Nitro 产物，会重复启动 `stale-cleanup` / 启动期备份等周期插件（均幂等，代价为重复 DB 查询与日志）。
  - **待评估点**：引入 `DEPENDFIX_ROLE`（server / worker）让 worker 跳过 HTTP-only 插件；或按 `inProcessWorker` 条件跳过（注意单进程形态下该值为 true，不能跳过）。
  - **触发条件**：周期插件重复造成可观测噪声或资源浪费时；或用户要求。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **队列 worker 进程崩溃自动重启（待评估）** —— M38.1 独立 worker 进程形态的已知边界：worker 为容器内后台进程（entrypoint `&`），崩溃后无自动重启，队列任务由 `stale-cleanup` 兜底（窗口约 30 分钟）。
  - **待评估点**：entrypoint 侧看护循环（等待后拉起）；或改用进程管理器（s6-overlay / supervisord）；或拆为多容器 + `restart: unless-stopped`（需 DB 支持多写者）。
  - **触发条件**：出现 worker 崩溃导致任务挂起实例；或用户要求。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **reuse 路径与同仓库去重合并叠加时误置既有 run 为 failed（待评估）** —— M38.3 A 阶段审计的**范围外观察**（**非本批引入**）：`scan.post.ts` 的 reuse 路径若 `queue.add` 返回 `reused: true`（同仓库已有进行中任务 → 去重合并），会把被复用的 `pendingRun`（即用户指定的既有终态 run）置 `status='failed'` 并落库；而 reuse 校验只拒绝「被复用 run 自身 running」，不检查仓库是否存在其他进行中任务，故该组合可复现（用户指定的历史 run 被意外标记失败）。
  - **待评估点**：① `reused: true` 且走 reuse 路径时是否改为「不改既有 run 状态，仅提示已合并」；② 或在 reuse 校验阶段前置拒绝「同仓库存在进行中任务」（409）。
  - **触发条件**：生产出现「复用 + 去重合并」误标 failed 实例；或用户要求。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **严重级别展示策略统一（`Critical` vs `critical`）（待评估）** —— M38.6 同源点穷举发现（**预存差异，非本批引入**）：同一 `severityThreshold` 值在各界面展示策略不一致——
  - **大驼峰 + `all` 走 i18n**：`scanSeverityOptions`（选项单一事实源）/ `batch-runs.vue` 的 `severityLabel`；
  - **小写直通 + `all` 走 i18n**：`run-view.ts` 的 `runThresholdLabel` / `scans.vue` 运行列表的阈值列（2 处）；
  - **raw 直通（连 `all` 都不翻译）**：`alert-run-sidebar.vue` 的 `row.severityThreshold` 渲染 / `repos/[id]/runs.vue` 的阈值列（legacy 页，保留兼容）/ `repo-history-dialog.vue` 的历史 run 阈值列（**在用**，`scans.vue` 挂载）（共 3 处）。
  - **非同源（已排除）**：`env-events.vue` 的 `severityOptions`（词表 `all/info/warn/error/critical` + 独立 `envEvents.*` i18n 命名空间，属环境事件严重度而非扫描阈值）；`alerts.vue` 的 `severityOptions`（词表含 `Low` / `Unknown`，`all` 在首位）。
  - **待评估点**：① 是否统一为大驼峰（对齐选项口径）；② 是否统一走 `scanSeverityOptions` 查找（单一事实源）；③ 若差异属有意（不同 UI 语境）则需在规范中显式声明而非隐式保留。
  - **触发条件**：UI 一致性巡查；或用户反馈级别展示不统一。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

> **2026-10-09 运行失败根因评估批次（共登记 9 项候选 → 上收 6 项 M39）**：来源为 2026-10-08 定时扫描批量失败的用户报告与逐项排查。该批次共登记 9 项候选——6 项源自用户报告的 8 项平台问题（扫描页筛选分页 / 日志下载 / 弹窗体验 / 告警按包聚合 / PR Check 启用链路 / 环境事件覆盖），3 项由引擎归因口径缺陷排查衍生（部署版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）；「既有基线失败被误判为运行失败（exit code 归因口径）」的引擎缺陷已按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 可用性插队例外先行修复（`e5c59b8`，口径见 [dependency-fixer.md §12.6](../design/modules/dependency-fixer.md)）。2026-10-09 用户决策（方案 A）上收上述 6 项至 M39（扫描页筛选分页 → M39.1 / 扫描历史弹窗 → M39.2 / 告警按包聚合 → M39.3 / 运行日志下载 → M39.4 / PR Check 启用链路 → M39.5 / 环境事件覆盖 → M39.6），按维护规则 5 从本文件清出（三重交叉核验 0 项重复评估，见 [todo.md §M39](todo.md#m39-平台视图体验与可观测补强2026-10-09-用户决策方案-a--m391m396)）；未上收 3 项保留待评估。

- **部署产物版本戳 / 陈旧校验（待评估）** —— 背景：2026-10-08 一批 `COMMIT_FAILED` 的失败命令缺少 M37.6 引入的 `--no-verify`（`packages/engine/src/github/pr-creator.ts:221-235`），证明运行时产物早于该修复（陈旧镜像）。当前无任何手段在运行时确认「部署产物对应哪个 commit」：无健康端点、无版本戳、构建流水线未注入 build arg。
  - **待评估点**：① 构建期注入 commit / 版本（Docker `ARG` + 运行时 ENV / 端点返回）；② `/api/health` 或启动日志暴露；③ 是否作为发布流水线门禁（镜像内 engine 产物核对关键隔离参数）。
  - **触发条件**：再次出现「已修复但线上仍复现」的陈旧产物误判。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **失败 run 落 summary 快照（列表告警数误导）（待评估）** —— 现状：`scan-orchestrator.service.ts` 仅在 `completed` / `degraded` 分支写 `summaryJson`；`failed` run 不落 summary，导致「全部运行」列表的「告警数 / 已修复」恒显示 0，掩盖失败前实际扫到的告警（本次排查中即被该现象干扰）。
  - **待评估点**：① failed run 是否落一份 summary 快照（引擎已产出 `result.summary`）用于展示；② 与「失败不写半截结果」原则的边界（summary 快照 vs 结果明细）。
  - **现状锚点**：`apps/platform/server/services/scan-orchestrator.service.ts:378-422`。
  - **触发条件**：用户要求失败 run 展示扫描到的告警数。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **执行超时可配置化（待评估）** —— 现状：单仓库执行超时写死 30 分钟（`container-executor.ts:40` `DEFAULT_EXECUTION_TIMEOUT_MS`），无 env 可调（仅 `CLONE_TIMEOUT_MS` 可调）；队列 Worker 锁时长与之对齐（`SCAN_WORKER_LOCK_OPTIONS`）。2026-10-08 有 caomei-ui 因超 30 分钟判 `execution_timeout`。另：`withTimeout` 超时后底层 `app.run()` 含同步 `execFileSync`，不可取消，workDir 在 finally 被清理，存在僵尸执行窗口。
  - **待评估点**：① 是否引入 `EXECUTION_TIMEOUT_MS`（env + 锁时长联动）或仓库级覆盖；② 超时后的执行 / 清理语义；③ 是否优先依赖 M38 worker 进程隔离消除锁续期根因后再评估。
  - **现状锚点**：`apps/platform/server/services/executor/container-executor.ts:40,291,527-537`、`apps/platform/server/services/queue/scan-worker.ts:59-71`。
  - **触发条件**：重负载仓库超时成为常态；或用户要求放宽上限。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **代码门禁脚本未排除 Playwright 生成产物（待评估）** —— 现象（2026-10-09 本地验证实测）：`scripts/check-orphan-ids.mjs` 的 `EXCLUDED_DIRS` 未包含 `playwright-report` / `test-results`，本地跑过 e2e 后 HTML 报告内的 minified 依赖 bundle（`playwright-report/trace/assets/codeMirrorModule-*.js`）被纳入扫描并误报规划编号形态；`scripts/check-docs.mjs` 同理把 `test-results/**/error-context.md`（Playwright 失败产物）计入 md 扫描面（本地实测 148 → 152）。CI 因门禁步骤先于 e2e 产物生成而不受影响，但本地验证会被产物污染（须先清理产物才能取得干净门禁）。
  - **待评估点**：① 两个脚本的产物排除面是否统一补 `playwright-report` / `test-results`（与既有 `.output` / `coverage` / `dist` 同类）；② 是否改为统一「尊重 `.gitignore`」的排除策略以避免逐个补目录。
  - **触发条件**：本地跑过 e2e 后执行门禁脚本出现产物误报；或用户要求加固脚本。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`repo-history-dialog` history 模式与 legacy `/repos/[id]/runs` 页疑似无入口死代码（待评估）** —— 现象：全仓仅 `scans.vue` 以 `:query-key="'run'"` 挂载 `repo-history-dialog`；`repos.vue` 的历史入口已改为跳 `/scans?repository=`，故组件的 history 模式（list 视图 / 「返回列表」分支 / `queryKey='history'` 默认值）当前**不可达**；legacy 页 `app/pages/repos/[id]/runs.vue` 亦无站内链接（其注释引用的 backlog 删除候选已不存在）。二者由本次弹窗体验改动的「history 模式不受影响」验收口径间接暴露。
  - **待评估点**：① 删除 history 模式分支 + 收敛组件为单一 run 模式（减法）；② 或恢复 history 挂载点（若确有按仓库浏览历史的需求，可复用扫描页 `/scans?repository=` 路径）；③ legacy `/repos/[id]/runs` 页是否随 history 模式一并删除。
  - **触发条件**：组件 / 页面维护（如再次改动 `repo-history-dialog`）；或用户要求清理死代码。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`platform-scheduled-batch.md` 设计快照端点表 / 实体清单陈旧（待评估）** —— 现象：设计稿 `docs/design/governance/platform-scheduled-batch.md §6.1` 的定时计划 CRUD 端点表未登记新增的 `GET /api/schedules/monitor-status`（M39.5 新增的只读总开关状态端点），§3.1 实体清单仍无 `Schedule.kind` 列（`kind` 于 M24.1 引入时即未回填，属既有漂移）。该稿状态为「🔶 设计先行」快照，若后续被当作 API 契约参考会漏看新端点。
  - **待评估点**：① 是否将 design 快照视为需持续同步的契约（补 §6.1 端点表 + §3.1 实体字段）；② 或明确定位为「时点快照」并在阶段归档时统一回填。
  - **触发条件**：后续以该文档为 API 契约参考产生歧义；或用户要求同步设计稿。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

> 本区块保留 M37 执行期延后项（受约束重试入口 / 服务端跨设备偏好）+ 审计与复核衍生的待评估候选（push 侧 hooks 隔离 / tech-stack 依赖表行级不一致 / `distill-wisdom` 计数假阴性 / 门禁脚本产物排除缺口 / 弹窗 history 模式与 legacy 页死代码 / `platform-scheduled-batch.md` 设计快照端点表陈旧）+ M38.1 独立 worker 形态衍生候选（按 role 跳过周期插件 / worker 崩溃自动重启）+ M38.3 审计范围外观察（reuse 路径与去重合并叠加误置 failed）+ M38.6 同源点穷举候选（严重级别展示策略统一）+ 2026-10-09 运行失败根因评估批次未上收 3 项（部署版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）；该批次其余 6 项已于 2026-10-09 上收 M39（扫描页筛选分页 / 日志下载 / 弹窗体验 / 告警按包聚合 / PR Check 启用链路 / 环境事件覆盖，见上方批次说明）；2026-10-08 M38 启动批次已上收 4 项（`scan.post` failover / e2e 卡片计数 / `scan-queue.ts` 注释 / schedule 选项口径），M37 启动前原有 6 项已随 M37 闭环归档（见上方批次说明）。

### 待上收候选（评估完成，等待用户决策）

> 本节为「评估完成、等待用户决策」候选的暂存区；候选**不含 `M\d+` 阶段编号**（[规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)）。

- **hooks 隔离的规范锚点与单一事实源命名收敛**（P3，🛡️ 治理）—— M37.6 A 阶段审计 RG-W1 衍生：`packages/engine/src/github/git-signing.ts` 已扩展为「签名 + hooks」双语义（新增导出 `GIT_COMMIT_HOOKS_ISOLATION_ARGS`，经 `github/index.ts` re-export 属公开 API），但 `docs/standards/git.md` §3.8 仍仅声明两个签名常量，规范面与实现面出现职责漂移；文件名亦不再与「签名 + hooks」双语义一致。
  - **决策点（待用户裁定）**：① 是否在 `docs/standards/git.md` §3.8 扩展 hooks 隔离子节（或新建独立锚点）；② 是否将 `git-signing.ts` 更名为 `git-isolation.ts` 并同步 §3.8 路径引用（含 engine `github/index.ts` re-export 与平台侧 import）。
  - **现状锚点**：`packages/engine/src/github/git-signing.ts:2`（JSDoc 双语义）+ `docs/standards/git.md:168`（§3.8 标题仅签名）。
  - **不做什么**：不改隔离参数取值与行为；不改 `--no-verify` 选型。
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 `M\d+` 阶段编号**：等待用户明确决策启动。

> **2026-10-06 上收批次（2 项，本小节清空）**：来源为 2026-10-05 / 10-06 生产运行日志根因分析（BullMQ 锁续期失败 / 目标仓库 husky 阻断自动 commit）。2 项候选为同批次评估产出并**即时上收，未在本文件留存候选条目**（故无「移出前」条目可对照；完整评估证据见 [todo-archive.md §M37](todo-archive.md#m37-运行可观测性与体验记忆m371m376-全部已闭环--2026-10-08-归档) M37.6 条目与 [roadmap.md](roadmap.md) M38 段关键依据 anchor）。经用户明确授权，按维护规则 5「短期候选正式上收阶段后从 backlog 移除」清出并留本批次说明：①「目标仓库 git hooks 隔离（自动 commit 不再被 husky 阻断）」→ **M37.6**（P1，按 §3.1 可用性插队例外追加至进行中阶段 M37；三重交叉核验 0 项重复）；②「平台队列执行隔离（消除引擎同步阻塞导致的 BullMQ 锁续期失败）」→ **M38 独立阶段**（2026-10-06 用户授权开阶段，首个交付为方案 ①/②/③ 选型设计先行稿；实施条目待设计稿定稿后按类型平衡补齐）。

> **历史上收记录**：4 项（本地 devEx `data/` 产物污染 / 视觉回归容差对同明度色相与灰度替换不敏感 / 非弹窗表单 label↔控件间距 / PrimeUI 设计先行稿与索引陈旧）已于 2026-09-30 经用户决策上收，按维护规则 5 从本文件移除（登记位置见 [todo-archive.md §M34](todo-archive.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)）。

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm + Sentry）—— 2026-08-12 用户指示暂缓排期
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **caomei-ui 0.x → 1.0 升级回归** —— 库处于 0.x（原精确锁定 `0.3.0`）。**2026-09-30 用户指定目标版本 `0.5.0` → 恢复条件①达成，`0.5.0` 升级（含弹窗内 Select 面板裁剪 / 层级修复）已上收 M34.2 并随该阶段归档**。**剩余观察**：`1.0.0` 发布后的正式升级回归（恢复条件①的 1.0 分支）与「平台需跟进新组件能力」「用户明确恢复」两条触发条件。届时按 M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration.md)）做回归；**升级回归的像素兜底已就位**（M32.5 落地的视觉回归基线 `apps/platform/tests/visual/`，覆盖 alerts / repos / pr-checks / dialog-import-repos / login，口径见 [测试规范 §6.7](../standards/testing.md)）
- **ScanResult 数据层去重（upsert 唯一索引）** —— 2026-09-02 M23.3 决策暂缓：应用层去重（fingerprint + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）已实施且满足当前业务需求；恢复条件：出现"fix 复用同一 `scan_run_id` 跨次刷新"或"历史 fixStatus 跨次保留"需求时迁移到数据层 upsert（关联 [archive/todo-archive-phases-m23.md §M23](archive/todo-archive-phases-m23.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)）

### 远期登记 / 未排期增强候选

按主题分组：

#### MCP 能力

- **C37** 语言偏好多设备同步（当前仅单一设备语言偏好；多设备切换需重新设置；触发：用户实测反馈多设备用户；前置：服务端 API i18n 基础已 M16.3 + M17.x + M24.1 完整闭环）

#### 多组织 / 多租户

- **D1** repo_admin + RepositoryAccess（实现仓库级 admin 角色区别于全局 admin；当前 owner 角色对仓库控制粒度不足；关联：C22 GitHub App 验证身份）
- **D3** 多租户组织体系（支持多个组织/org 共存；当前 single-org 模型限制 org 切换；前置：D1 仓库级权限；触发：org 场景用户痛点）
- **SAML 2.0 SSO**（D2 username 等待 SAML SSO 上后再决定 username 模型；当前 better-auth OIDC 优先）

#### 用户管理

- **D8** remove-user 关联资源检查（无 user→resource 关联时暂不需要；前置：先有 D1 资源关联表）

#### PR 管理

- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）

#### Code Scanning 规则体系

- **C15 Code Scanning B 类规则真实仓库样本核对（第二阶段）** —— 2026-09-11 M28.3 第一阶段已闭环（commit `99302b5`：`sample-collector.mjs` 采集脚本 + 32 种子仓库跨 5 语言 fixture 占位 + 报告框架 `docs/research/code-scanning-b-class-samples.md`）；**剩余未闭环**：实际 GitHub API 样本采集 + 按需规则分级修正（`go/*` / `ruby/*` 补 `SUGGESTED_RULES`）。
  - **恢复条件**：CI / staging 环境具备 `GITHUB_TOKEN` 时执行 `node packages/engine/src/code-scanning/scripts/sample-collector.mjs --output=real-samples.json`，再据采集结果修正规则分级。
  - **不做**：不改 A/B/C 分层结构；不在无真实样本时臆测规则 id 变体。
  - **关联**：[todo-archive.md §M28](todo-archive.md#m28-治理债清理--能力扩展m281-m285-全部已闭环--2026-09-11-归档)（M28.3 第一阶段记录）+ [docs/research/code-scanning-b-class-samples.md](../research/code-scanning-b-class-samples.md)（报告框架）
  - **按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 不带 M\d+ 阶段编号**：等待用户明确决策启动

#### 网络优化

- **C68 Git 代理 / 镜像方案** —— 2026-09-04 实测发现：部分仓库（momei 25MB / caomei-auth 9MB）clone 持续超时（120s+），而大仓库（rss-impact-web 215MB）反而 12s 完成。根因：服务器到 GitHub CDN 网络质量差（实测 GitHub 下载速度 14KB/s vs 通用网络 629KB/s）。当前临时方案（超时 300s + 重试 3 次 + partial clone `--filter=blob:none`）可缓解但不治本。**只有代理才能根本解决网络问题**（tarball API 仍走 GitHub 域名，同样受限）。候选方案：
  - **方案 A：HTTP 代理** —— 配置 `http.proxy` / `https.proxy` 指向代理服务器；需运维提供代理基础设施
  - **方案 B：GitHub 镜像** —— 使用 GitHub Enterprise 镜像或自建 Git 镜像（如 Gitea/GitLab mirror）
  - **方案 C：Git 缓存代理** —— 部署 git-proxy 或 gitcache 缓存已 clone 的仓库，后续请求走缓存
  - **触发条件**：① 用户部署环境有可用代理；② clone 超时成为频繁阻塞问题；③ 运维提供镜像基础设施
  - **验收**：momei / caomei-auth clone 耗时 < 30s；无 TLS 错误；超时率 < 5%

#### 工作流

- **T905** git worktree 并行开发预案（触发条件：多 agent 并行开发成为常态；当前单 agent 工作流无需启用）

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

### T704 async 定时触发

定时任务真实环境验证（**实施部分已由 M21.5 闭环** —— commit `9850e24` schedules CRUD e2e 6 case + `b9e35f7` BullMQ upsertJobScheduler 短间隔集成测试 `describe.skipIf` 门控）：

- 真实 Redis >= 5 环境下 `TEMP_REDIS_INTEGRATION=true` 跑 BullMQ 集成测试
- staging / 后台服务下的调度轮询体验与 stale state 处理验证

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

## 已知边界与 known-issue

### SQLite 单文件脆弱性 + TypeORM synchronize 风险（持续观察）

- **背景**：2026-09-01 `apps/platform/data/dependfix.sqlite` 业务数据被清空事故（详见 [经验归档 §五十](../design/governance/experience-archive-§49-§57-recent-investigation.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)）。代码内无清空路径，最可能清空来源在代码外部（shell / CI / 运维）。
- **防御现状**：事故防御加固已完成（M22 全部 6 原子条目闭环，详见 [archive/todo-archive-phases-m22.md §M22](archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)；启动期备份 / db-restore / db-doctor / synchronize + migrationsRun 双 opt-in / e2e fixtures 双门控），规范见下方"规范挂接"。
- **持续观察项**：
  - TypeORM 1.x 升级 / 替换为 0.3.x（1.x 已停止维护）—— 当前无明确上收时机，待后续评估
  - PostgreSQL 多写者迁移 —— 当前 single-org 模型限制（依赖 D3 多租户组织体系上线），D3 未上收
  - better-sqlite3 WAL 模式启用 + auto-checkpoint 调整（减少断电时数据丢失风险）—— 已落地 `journal_mode=WAL`，但 better-sqlite3 库升级路径未评估
  - SQLite 文件 inode 监控（`fs.watch` 检测 .sqlite 文件被外部 rm / rename 触发紧急备份）—— 与启动期备份互补，可作后续加固
- **规范挂接**：[development.md §5.1.18](../standards/development.md) + [§5.1.19](../standards/development.md) + [platform.md §3.6](../standards/platform.md) + [§3.7](../standards/platform.md) + [security.md §2.1](../standards/security.md)

### E2E global-setup 串行场景 ECONNRESET 根因（持续观察）

- **已落地（部分闭环）**：~~候选 ②（Nitro h3 async generator）~~ 已 M24.2 commit `bbb8f30` 判定非根因；~~候选 ③（SQLite WAL + `busy_timeout`）~~ 已 M23.1 commit `2ffaa45` 治本落地；候选 ④（fixtures API 节流）为 M24.2 commit `bbb8f30` 登记的经验性 follow-up；helper 层兜底 `maxRetries: 2` 已 M22.7 commit `f617b56` 落地。
- **剩余未闭环**：候选 ① better-auth 1.7 transaction 关闭时序 —— 诊断基础设施已 M27.5 commit `b252f93` 落地（`AUTH_TRACE=1` / `E2E_TEST=true` 双开关），待 CI 复现一次确认是否仍存在 ECONNRESET。
- **触发条件**：CI E2E job 再次出现 global-setup 末尾 `DELETE /api/e2e/fixtures` → `ECONNRESET` 时，开启 `AUTH_TRACE=1` 跑一次定位；如复现 fixture 并发问题按经验性模板 `apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流（见 [platform.md §3.7.1](../standards/platform.md#371-fixtures-api-无节流默认--经验性节流方案)）。

### tsdown hash:false 下 entry 与共享 chunk 文件名冲突（持续观察）

- **背景**：2026-09-28 修复 engine 多 entry（`index` + `auth`）构建产物的 dts 入口错位——`hash: false` 时 entry 与共享 dts chunk 争用 `index.d.mts`，入口声明被挤出 `index2.d.mts`，而 `packages/engine/package.json#types` 指向 `index.d.mts`，导致 `apps/platform` 解析不到 engine 导出（TS2305）。
- **已落地**：engine `tsdown.config.ts` 用 `outputOptions.chunkFileNames` 把 chunk 统一隔离到 `chunks/` 子目录，entry 名保持稳定（chunk 名解析用 `chunk.name.slice(0, -2)` 而非占位符，规避 tsdown 升级回归）。
- **持续观察项**：`packages/core` / `packages/cli` / `packages/mcp` 当前无名为 `index` 的共享 chunk（dist 无 `index2` 冲突），故未做预防性改动；若未来某包出现「多 entry 共享 dts 声明」形成名为 `index` 的共享 chunk，需同样加入 `outputOptions` chunk 隔离。
- **触发条件**：任一 `packages/*` 构建后 `dist/` 出现 `index2.d.mts` / `index2.mjs`，或下游对该包类型解析报 TS2305。

### apps/platform `.output` 不随根构建脚本重建（操作提醒）

- **背景**：根构建脚本 `pnpm -r --filter "./packages/*" build` 不含 `apps/platform`，`.output` 需单独构建。
- **影响**：类型侧由 `nuxt typecheck` 覆盖；但涉及 `packages/*/dist`（如 engine chunk 结构）变更后，容器 / 运行时冒烟前需重建 `apps/platform/.output`，否则可能引用旧产物。
- **触发条件**：① 需要容器 / 运行时冒烟验证依赖 `packages/*/dist` 的变更时；② 跑 `apps/platform` e2e 或**视觉回归**（`pnpm --filter @dependfix/platform test:visual`，M32.5）前——两者都跑 `.output` 产物，源码改动不重建则验证的是旧产物（假绿；M32.1 / M32.5 均实证）。

### 依赖审计豁免复核（node-forge / braces，持续观察）

- **背景**：2026-10-05 weekly regression 因 `security:audit-deps` 阻断失败——node-forge ≤ 1.4.0（GHSA-86w9-cpqp-85rv）与 braces ≤ 3.0.3（GHSA-vfj7-8cjw-p6xm）为 high，但 advisory 声明的 patched 版本（1.4.1 / 3.0.4）**尚未发布**，overrides / `pnpm update` 无法解析。经用户决策（方案 A，调整为配置文件实现）在 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) `audit.ignore` 显式豁免。
- **机制与复核**：以 `pnpm-workspace.yaml` `audit.ignore` 显式豁免（只过滤列表内编号，未列入的新漏洞仍使 `pnpm audit` exit 1）；机制、禁止项与复核条件以 [security.md §5.7](../standards/security.md#57-无可用修复版本漏洞的审计豁免auditignore2026-10-05) 为唯一权威，本条不重复。
- **复核条件**：node-forge 发布 > 1.4.0 或 braces 发布 > 3.0.3 后，移除 `pnpm-workspace.yaml` 对应条目并复跑 `pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org`。
- **触发条件**：每周回归 / 依赖升级 / 上游发布修复版本时复查。
- **可选增强**：以调度任务自动比对 `npm view node-forge version` / `npm view braces version` 探测上游修复发布，避免豁免长期挂账（暂未实现）。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | **M39**（平台视图体验与可观测补强）进行中——6 原子条目见 [todo.md §M39](todo.md#m39-平台视图体验与可观测补强2026-10-09-用户决策方案-a--m391m396)；上一阶段 M38 已闭环归档，见 [todo-archive.md §M38](todo-archive.md#m38-平台执行模型隔离m381m386-全部已闭环--2026-10-09-归档) |
| 下一阶段（未授权） | 无——M39 闭环后按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 评估本文档候选池后由用户决策 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近阶段完整段 + 指针段；M0-M38 已归档；早期阶段见 [archive/](archive/)） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M38 已归档；M39 进行中） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
