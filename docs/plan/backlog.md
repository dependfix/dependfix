# 待办积压 (Backlog)

> 统一候选池，按 **长期主线任务** / **周期性回归验证层** / **短期与一次性候选任务** / **已知边界与 known-issue** 四象限区分。当前阶段见 [todo.md](todo.md)；已闭环阶段见 [todo-archive.md](todo-archive.md) 索引。
>
> **维护规则**（唯一权威声明见 [规划规范 §2.3](../standards/planning.md#_2-3-待办积压) + [§3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)）：本文件只保留候选正文、状态与触发条件，不复制批次叙事；上收后从本文件移除，闭环记录由 `archive/` 分片与 `archive-log.md` 维护；长期主线卡在目标达成或被阶段闭环时整卡删除或改写状态。

## 长期主线任务（可跨阶段保留）

> **状态口径**：进行中 / 观察中 / 暂停 / 已关闭。

### 主线 #1：network-audit 默认白名单持续扩展问题（G1）

- **目标**：把 network-audit 默认白名单从"按次新增"演进为"按域名 / SRI 哈希 / 输出区分"的可持续治理方案，避免每次构建工具跨 major 升级都需补白名单。
- **状态**：观察中（**「注册表域预置 + 动态发现生效 registry」方向已随 2026-10-11 M42 阶段闭环（M42.1）**；其余方向保留待评估）。
- **下一次可切片方向**（任一触发时重新评估）：
  1. 构建工具生态文档站类目预置白名单（rolldown.rs / swc.rs / rust-lang.org 等）—— 新增白名单诉求应转为"真实注册表域"申请而非"构建工具文档站"
  2. 按 SRI 哈希钉资源（推荐域动态发现）
  3. ~~**注册表域预置 + 动态发现生效 registry**（镜像站 / 企业私服被 deny-by-default 拦死 → install 失败 + 全量回滚）~~ —— **已随 2026-10-11 M42 阶段闭环（M42.1：`380e8f4` + `47f7c42` + `39df76d`）**；剩余方向保留待评估。
- **验收**：默认白名单不再按次新增；verification 阶段合法外联不被误判；剩余候选方向（SRI 哈希钉定等）任一实施或主线整体评估为长期保留后关闭本主线条目
- **2026-11-21 新增暴露面（M64.2 后）**：`NODE_USE_ENV_PROXY=1` 随审计代理注入后，Node 内置 `http/https/fetch` 也真走代理，工具链二进制 CDN 首次进入拦截面——`nodejs.org`（node-gyp 头文件）、`cdn.playwright.dev` / `playwright.azureedge.net`、`binaries.prisma.sh` 未在默认白名单，目标仓库含这些下载步骤时会 502 并被判 `network_violation`。触发：出现此类合法验证失败，或再次评估白名单治理方向时；处置方向同本主线（按需登记具体域并补测试，或推进 SRI / 配置面发现）。

## 周期性回归验证层

> **定位**：本层不是"一个任务"，而是所有长期主线的健康检查层。它不产生直接改进，只验证"没有回退"。按固定节奏执行，不参与阶段切片容量竞争。

### 固定执行入口（当前）

| 节奏 | 入口 | 最小固定组合 | 触发条件 |
|:---|:---|:---|:---|
| 阶段收口前 | `pnpm check:docs` + `pnpm run test:coverage` + `pnpm run lint:check` + `pnpm run lint:css:check` + `pnpm typecheck` + `pnpm --filter @dependfix/platform exec playwright test` | 检查归档批次合入未引入回归 | 每次阶段归档前 |
| CI 端到端 | 上述 5 项 + `pnpm build` | 裁决合并 | PR 合并前 / commit 推送后 |

> **回归入口状态（2026-10-26 核对）**：三个 profile（`regression:weekly` / `regression:pre-release` / `regression:phase-close`）+ [`.github/workflows/regression-weekly.yml`](../../.github/workflows/regression-weekly.yml) 已接线；证据落点 `artifacts/regression/current.md`（gitignored，CI 上传）。**剩余待评估**：① 发版前入口与 [`.github/workflows/release.yml`](../../.github/workflows/release.yml) 的接线口径；② 阶段收口入口是否替换「阶段收口前」手写五项组合。

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

> **候选池概览（2026-11-26 issue #284 登记后复算）**：本区 **15 项**（`### 候选评估中` 段内 `^- \*\*` 逐行计数；M68 上收 5 条后由 20 复算）；每次上收 / 新增 / 移出后按段内实测更新本句与首行，不保留历史链路。P 标签覆盖不全（未标注者评估时补，不默认升级）；1.0 分档见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)。
> **1.0 门槛与分档**：分档、门槛判定与批次计划单点声明于 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)（2026-10-30 冻结口径，不随候选上收收缩；本文件不重复维护数字）。

- **PR 回环有界重试（P2 🚀，2026-10-30 M51.3 用户裁定延后）** —— 设计稿 `pr-feedback-loop.md` §8 保留 `FeedbackRetryDispatcher` 契约（同 PR 失败后重新触发既有修复链，需配额与触发面）；平台当前无「同 PR 重试」入口，`retryFailed` 开启时每仓库每进程只 warn 一次。待评估：补触发面（API / UI）+ 配额后再实施。触发：出现「PR 红后无人处理、需自动重试」的实际需求时。
- **批次续跑并发原子性（P3 🛠️，2026-11-21 M64.4 登记）** —— `POST /api/batch-runs/[id]/resume` 的「无进行中子项 / 无 running 派生批次」为读后写检查，两个并发请求可同时通过（async 由队列 jobId 去重兜底为 `SCAN_PENDING_MERGED`，sync 会重复执行一轮）。触发：出现并发续跑导致的重复执行，或引入多实例调度；处置方向：事务内条件插入 / 部分唯一索引 / advisory lock。
- **镜像脚本只覆盖根 scripts 单一形态**（M48.2 边界）—— `pnpm --filter` / 递归 / env 前缀 / corepack 钉定只披露不执行；触发：目标仓库 CI 大量使用这些形态导致「本地假绿」再现。
- **白名单内运行前未提交改动的归属**（M48.4 边界）—— 白名单内文件（典型 `package.json`）若在运行前已有用户改动，会与本次修复一并提交；触发：出现「PR 混入无关改动」的用户反馈时评估。
- **`pnpm_audit` 的 token-free 回退意图与实现不一致（P2 🛡️）**—— `pnpm-audit.tool.ts` 注释与产品意图是「无 GitHub token 或 403 场景」的本地回退，但实现保留 `requireToken()`，缺失 `GITHUB_TOKEN` 时直接返回 `ok:false`；当前 README / tool description 已按实际行为修正。待评估：移除 `requireToken()`（或改为可选 token），补无 token 用例，恢复真正回退。触发：无 token 环境需要 pnpm-audit 回退时。

- **扫描偏好服务端跨设备默认（延后，保留待评估）** —— **来源**：[issue #136](https://github.com/dependfix/dependfix/issues/136)（该 issue 的设备级需求已随 M37.2 交付，2026-10-15 关闭；本条保留其范围外的服务端默认部分）。设备级方案 C 混合（localStorage：上次选择 + 可选配置化默认 + 重置）已落地；服务端用户 / 组织级默认偏好（跨设备、可管理，需实体 / API / 设置页，预计触发 governance 文档）按用户 2026-10-06 决策延后。**现状锚点**：`apps/platform/app/composables/use-scan-preferences.ts`。触发条件：① 用户实测多设备切换痛点；② 组织级统一默认诉求。

- **镜像白名单：企业私服自带独立 CDN 域的补录（待评估）** —— 现象：镜像源动态发现只覆盖「配置面 registry 键的 host」；企业私服 tarball 若 302 到**独立 CDN 域**（与 registry 不同域），该域不在预置清单内 → 仍被 deny-by-default 拦截（交付时已登记为已知限制，需显式 `DEPENDFIX_ALLOWED_DOMAINS`）。
  - **待评估点**：① 是否按 302 `Location` 自动补录 CDN 域（可从审计记录观测补录）；② 或维持显式配置；③ 自动补录的安全边界（是否需用户确认）。
  - **触发条件**：出现企业私服 CDN 域被拦的实例；或用户要求自动化。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **升级探针合批与门禁回滚粒度联动（待评估，P2 🛠️）** —— 现象：M46.3 已做基线完整链与按变更单元回滚，但未做探针合批；合批会改变回滚单元、验证次数与失败回退语义。
  - **待评估点**：① 合批后的回滚单元（batch vs probe）；② 与 `verificationBlocking` 归因的衔接；③ 失败回退逐包的语义保持。
  - **触发条件**：单仓安装次数成为主要耗时；或回滚粒度仍不足。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

**2026-10-27 决策**：Axiom 后续评估；其余 1.0 后。P 标签仅表优先级，新增 P1 未纳入 1.0 分档。

- **Axiom 远程日志聚合（P2 🛠️，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：本地日志统一后按需把 warn/error 与关键事件推到 Axiom。**范围**：`@axiomhq/winston`、动态 import、Axiom env、异常转发、runId / jobId、脱敏单测。**验收**：① 未配置零出网；② 配置后可按 runId / jobId 检索；③ 不重复推送 `MemoryLogger`；④ 脱敏通过。**不做**：不重做本地日志；不迁移全部 console。**依赖**：本地日志统一完成；Axiom 账号。**交付物**：3-5 commits / 8-12 files / 300-500 行。**风险**：成本 → 只推 warn/error；ESM → 动态 import。

**2026-10-30 批量运行超时复盘派生**（来源：`runs-logs-20261030-000646.txt` 第 1 页 10 条运行，2 条 `execution_timeout` + 1 条无日志失败；不占阶段编号）：

- **Nuxt / 框架类仓库默认验证链缺 `prepare` 前置（待评估，P2 🛠️）** —— 现象：`quick-verify` 默认链 `install → lint → build → typecheck → test` 中 lint 早于 build，`.nuxt/tsconfig.json` 未生成，ESLint 在约 2GB 堆上限 OOM（momei 两次复现，GC 挣扎 4-5 分钟）。待评估：① 探测 `nuxt.config.*` 时插入 `nuxt prepare`；② 或在仓库创建 / 导入时按框架写 `verifyCommands` 模板；③ monorepo 根脚本下 prepare 的落点；④ OOM 是否作为独立诊断信号（命令级 OOM 独立诊断信号已随 M62.2 上收，本候选不重复验收）。验收（草案）：Nuxt 仓库默认链 lint 不再 OOM，prepare 失败有独立日志与报告条目。不做：不为单仓硬编码框架判断（探测失败安全回退）。触发：再次出现框架前置缺失导致的 OOM / 假红。

- **契约抽取器覆盖 `@Column(() => X)` 嵌入列与 env 解构（P3 🛠️，2026-10-31 M53.1 收口登记）** —— `check-contract-freeze` 的实体抽取覆盖 `@Column` 系列 / `@ManyToOne`+`@JoinColumn` / `@Entity`，遇到 `@Embedded`、`@ManyToMany` join table、env 解构与非字面量 `readEnv` 实参已 fail-closed（`extractor-coverage`），但**无 `@Embedded` 的 `@Column(() => X)` 嵌入列**未进哨兵：抽取会产出错误列名并与清单产生差异（响亮失败，不会静默漏键）。待评估：扩展抽取器（递归嵌入类型 / `getMetadataArgsStorage` 元数据）或把该形态纳入 fail-closed 哨兵。触发：仓库首次引入嵌入实体或该形态列。
- **en-US 设计文档全量镜像（P2 📚，2026-10-30 M52 规划登记）** —— 现状：en 设计镜像仅 4 篇，zh 设计文档 67 篇（含 M44.4 拆分分片）；M52.3 只做「结构映射 + 索引补全」，不重译全文。待评估：1.0 后是否按「分片 → 镜像」逐篇补齐（成本随拆分增加、双维护风险高），或长期维持映射清单 + 关键路径翻译。触发：1.0 后文档国际化需求，或用户反馈英文站信息不足时。

- **发布链自动更新 major tag（P3 🚀，2026-11-15 登记；用户倾向不实施）** —— **状态**：已决策倾向不实施，仅保留恢复触发条件。背景：GitHub 官方与主流 action 按「每次发布把 `vN` 移到当前发布提交」维护（2026-11-15 实测）；本项目 2026-11-15 决策采用「具体版本 + Dependabot bump」，`v1` 冻结在 1.1.0（标签漂移影响可复现性与供应链审计）。
  - **待评估点**：`release.yml` 增「semver 比较 → 仅当前 major 最大版本时 `git tag -fa vN` + force push」，需定义幂等 / immutable releases 兼容 / 回滚口径。
  - **触发条件**：用户希望恢复 `@v1` 滚动便利；或逐仓 bump 成本不可接受。
  - **验收标准（草案，仅恢复实施时适用）**：① `vN` 指向当前 major 最大版本（semver 非字典序）；② 已指向 HEAD 跳过；③ immutable releases 开启时显式失败；④ 回滚命令与演练记录成文。
  - **不做**：不改变「具体版本」示例口径；默认不实施。
  - **风险与缓解**：可变引用削弱可复现性 → 仅作便利入口；force push 失败留中间态 → 步骤置于 tag 推送之后并 fail-fast。

- **backlog 容量治理：分片或健康预算复核（P3 📚 治理，2026-11-21 issue #269 研判登记）** —— 现状：健康字符余量已近零（实测见 `archive/index.md §4`），新增候选与字段规范化都会贴顶。**待评估**：① 按「长期主线 / 短期候选 / 已知边界」拆到独立文件或 archive 分片；② 或复核 §4.2 健康预算（须同源改 `doc-governance.md §4.2` 与 `archive/index.md §4`）；③ 再评估候选条目字段规范化（issue #269 本批延后项）。**验收**：拆分后 `check-doc-governance` 0 新增 warning、跨文件链接 0 死链。**不做**：不靠调高阈值绕过压缩。**触发**：下一次新增候选触发 warning。

- **backlog 候选池双轴评分（重要度 × 紧急度）与前向迁移（P2 📚 治理，2026-11-26 issue #284 研判登记）** —— **目标**：候选池排序从一维 P 标签迁到 1-5 重要 / 紧急 + 四象限建议，`P0-P3` 保留为阶段内交付优先级，消除两套未分工口径。**范围**：`planning.md §2.5` 优先级条 + 新增评分小节（两轴锚点 / 象限动作 / 复评触发）；backlog 15 条候选行加行内「重要 N / 紧急 N / 建议」标签（保留 8 要素 prose，不重排为表）；快速评估象限的结论写入候选行内「结论：不采纳 / 延后 + 日期 + 证据」；阶段登记记录写分数，`todo.md` 不复制。**验收**：① 规范含评分小节与 P / 双轴分工；② 新登记候选必填两轴与建议，存量 4 条未标注按单批 ≤4 分批复补（不要求一次性全量），复评后 15 条全覆盖；③ 每行至少一项可复算依据；④ 快速评估结论有落点、不悬置；⑤ `check-doc-governance` 0 新增 warning、`gates:docs` 22；⑥ 无「象限 = 启动授权」。**不做**：不做 P↔双轴自动换算；象限不自动排期 / 启动；不改插队清单与「不自动升级」；不新增独立 standards 文件；不回改已归档阶段；不把候选列表重排成表。**依赖**：issue #284 / 上游提案 `c350725`；现有 15 条候选（11 带 P、4 未标注）与 backlog 约 3.4 万字符预算（`node scripts/check-doc-governance.mjs --json`，UTF-16 口径）。**交付物**：3-4 commits / 5-7 files / 250-450 行（planning + backlog + 候选机检 + 基线）。**风险**：字符余量约 11.1k（45,000 健康上限，见 doc-governance §4.2）→ 贴顶前先压缩历史记录；行内标签保 prose → 不丢 8 要素；分数主观 → 锚点 + 季度复评。

### 待上收候选（评估完成，等待用户决策）

> 本节为「评估完成、等待用户决策」候选的暂存区；候选**不含 `M\d+` 阶段编号**（[规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)）。

- **`git-signing.ts` 更名为 `git-isolation.ts`（待评估）**（P3，🛡️ 治理）—— 背景：该模块已承载「签名 + hooks」双语义（4 个隔离常量），但文件名仍只表达「签名」。
  - **本批已闭环的部分**：决策点「是否在 `docs/standards/git.md §3.8` 扩展 hooks 隔离子节」已于 2026-10-13 M43.5 落地——§3.8 改为「签名 + hooks，commit / push 双向隔离」单表 + 4 常量清单 + push 侧 `--no-verify` 口径；`code-quality-checklist` 对应矩阵行同步扩展。
  - **待评估点**：是否将 `packages/engine/src/github/git-signing.ts` 更名为 `git-isolation.ts` 并同步 `github/index.ts` re-export（公开 API）、平台侧 import、测试与 `git.md §3.8` 的路径引用。**未纳入 M43.5** 的理由：触及公开 API re-export 与平台侧多处 import，宜单独批次以保持改动面可控。
  - **触发条件**：下次改动该模块 / 公开 API 面时；或治理批次收敛模块命名时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **定时发布启用（2026-11-15 评估完成；用户选方案 A：先发 1.1.0，观察 2 周后启用）**（P2 🚀）—— 启用清单 8 项现状（2026-11-15 实测）：① 1.0 门槛（1.0 已发布，G3 pending / G4 豁免延续）；② 安全告警门禁（本地 PASS，CI 有 `GH_PAT`）；③ Trusted Publisher（1.0.0 OIDC 发布成功）；④ Workflow 权限就位；⑤ **直推 master 未实测**（`gh api` 实测 master 无分支保护，机制可行）；⑥ 版本与日志一致（`verify:changelog` 绿、`release:plan` 可推导）；⑦ 回滚预案未演练；⑧ `v1` 冻结在 `1.1.0`（2026-11-15 决策，不随发布漂移；启用定时发布时无需依赖滚动 tag）。
  - **已知口径**：发布提交 `chore(release): x.y.z [skip ci]` 由 `GITHUB_TOKEN` 推送，不触发 Test / CodeQL / Pages（GitHub 防递归 + `[skip ci]`），发布内容只由 `release.yml` 内部门禁覆盖。
  - **启用前置**：M67.3「发布工作流无变更周空跑短路」已闭环（2026-11-26 归档，见 [todo 归档分片](archive/todo-archive-phases-m67.md)）；1.1.0 发布后观察 2 周；`on.push` 继续保留注释，待 schedule 稳定后再评估。
  - **回填要求**：首个定时窗口 run id、auto-version 提交 hash、三项未证实项结论写入本条目后再关闭。

### 延期 / 暂缓项

- **管理端代他人重发验证邮件（admin-only + 操作者审计）**（P2 🛠️，**2026-11-13 用户决定延后**）—— 背景：better-auth `/send-verification-email` 在有会话时要求 `session.user.email === body.email`（否则 400 `EMAIL_MISMATCH`），管理端代发无法复用原生端点；当前用户列表只展示未验证标签，用户到登录页自助重发。**延后原因**：用户判断「代他人触发邮件」的逻辑仍需重新推敲（权限、滥用面、与自助恢复的边界）。恢复条件：用户完成方案思考并明确授权；届时按「admin-only 端点 + 操作者审计 + 双维度限流」评估。手动置位 `email_verified` 已另行决定**不提供**（2026-11-13）。

- **T705 生产级部署**（PostgreSQL + Helm）—— 2026-08-12 用户指示暂缓排期
- **自托管 Umami 流量统计**（P3 🎨，1.0 后暂缓）—— 管理台用户量小；M65.1 落地后 Sentry 路由 transaction 可覆盖页面访问与性能，流量来源 / 留存价值不足以抵消额外服务与脚本成本（届时按 Sentry 实际数据重新评估）。触发：需要产品级使用分析且 Sentry 数据不足，或平台转为多租户 SaaS。详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **ScanResult 数据层去重（upsert 唯一索引）** —— 决策暂缓：应用层去重（fingerprint + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）已实施且满足当前业务需求；恢复条件：出现"fix 复用同一 `scan_run_id` 跨次刷新"或"历史 fixStatus 跨次保留"需求时迁移到数据层 upsert
- **兼容路由 `/repos/[id]/runs` 与 `repo-history-dialog` history 模式物理删除**（P3 🛠️，**2026-11-15 判定暂缓**）—— 现状：兼容路由无应用内入口，但仍是 `<repo-ai-toggle>`（仓库级 AI 研判开关）的唯一挂载点；history 模式（列表视图）应用内无挂载点，`/repos?history={id}` 也无页面解析，属死代码。**暂缓原因**：直接删页会丢失 AI 开关配置 UI。恢复条件：先把 AI 开关迁移到仓库表单 / 设置页（需 UX 决策），再删除兼容路由与 history 分支（保留 `run` 模式）。

### 远期登记 / 未排期增强候选

按主题分组：

#### MCP 能力

- **C37** 语言偏好多设备同步（当前仅单一设备语言偏好；多设备切换需重新设置；触发：用户实测反馈多设备用户；前置：服务端 API i18n 基础已就绪）

#### 多组织 / 多租户

- **D1** repo_admin + RepositoryAccess（实现仓库级 admin 角色区别于全局 admin；当前 owner 角色对仓库控制粒度不足；关联：C22 GitHub App 验证身份）
- **D3** 多租户组织体系（支持多个组织/org 共存；当前 single-org 模型限制 org 切换；前置：D1 仓库级权限；触发：org 场景用户痛点）
- **SAML 2.0 SSO**（D2 username 等待 SAML SSO 上后再决定 username 模型；当前 better-auth OIDC 优先）

#### 用户管理

- **D8** remove-user 关联资源检查（无 user→resource 关联时暂不需要；前置：先有 D1 资源关联表）

#### PR 管理

- **B2** 固定分支单线设计（独立平台部署后修复频率上升，需要固定修复分支如 `dependfix/auto-fix` 避免频繁向 master 提交 PR；触发：v1.0.0 后 M12 平台 UX 修复链路上线；关联：T210 指纹方案整合复用/重建策略 + force push 语义）
- **平台侧同告警尝试计数**（平台交付链固定 `fix` 模式 + `platform-delivery` 建 PR，不产出也不读取 PR 正文尝试标记 → 平台建的 dependfix PR 关闭后不消耗尝试额度；CLI / Action 侧已闭环，平台侧需先允许平台执行 fix-and-pr 或改用独立计数载体。当前计数偏小属 fail-open，不会误跳过）

#### Code Scanning 规则体系

- **C15 Code Scanning B 类规则真实仓库样本核对（第二阶段）** —— 第一阶段（`sample-collector.mjs` 采集脚本 + 32 种子仓库跨 5 语言 fixture 占位 + 报告框架 `docs/research/code-scanning-b-class-samples.md`）；**剩余未闭环**：实际 GitHub API 样本采集 + 按需规则分级修正（`go/*` / `ruby/*` 补 `SUGGESTED_RULES`）。
  - **恢复条件**：CI / staging 环境具备 `GITHUB_TOKEN` 时执行 `node packages/engine/src/code-scanning/scripts/sample-collector.mjs --output=real-samples.json`，再据采集结果修正规则分级。
  - **不做**：不改 A/B/C 分层结构；不在无真实样本时臆测规则 id 变体。
  - **关联**：[docs/research/code-scanning-b-class-samples.md](../research/code-scanning-b-class-samples.md)（报告框架）
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 M\d+ 阶段编号**：等待用户明确决策启动

#### 网络优化

- **C68 Git 代理 / 镜像方案** —— 2026-09-04 实测发现：部分仓库（momei 25MB / caomei-auth 9MB）clone 持续超时（120s+），而大仓库（rss-impact-web 215MB）反而 12s 完成。根因：服务器到 GitHub CDN 网络质量差（实测 GitHub 下载速度 14KB/s vs 通用网络 629KB/s）。当前临时方案（超时 300s + 重试 3 次 + partial clone `--filter=blob:none`）可缓解但不治本。**只有代理才能根本解决网络问题**（tarball API 仍走 GitHub 域名，同样受限）。候选方案：
  - **方案 A：HTTP 代理** —— 配置 `http.proxy` / `https.proxy` 指向代理服务器；需运维提供代理基础设施
  - **方案 B：GitHub 镜像** —— 使用 GitHub Enterprise 镜像或自建 Git 镜像（如 Gitea/GitLab mirror）
  - **方案 C：Git 缓存代理** —— 部署 git-proxy 或 gitcache 缓存已 clone 的仓库，后续请求走缓存
  - **触发条件**：① 用户部署环境有可用代理；② clone 超时成为频繁阻塞问题；③ 运维提供镜像基础设施
  - **验收**：momei / caomei-auth clone 耗时 < 30s；无 TLS 错误；超时率 < 5%

#### 工作流

- **T905** git worktree 并行开发预案（触发条件：多 agent 并行开发成为常态；当前单 agent 工作流无需启用）
- **engines 与 CI 运行时一致性门禁（P3 🛠️，2026-11-19 登记）** —— 单测断言 `semver.satisfies(process.versions.node, rootEngines)`，防止 `lts/*` 漂移；22/24 线仍无 CI 覆盖，可选 matrix。触发：下一次 LTS 切换或 engines 下限调整。

#### M62 归档残余（2026-11-19 登记）

- **展示与性能残余（P3 🎨🛠️）** —— `/scans` 单 run 详情（`repo-history-dialog`）未展示资源 / OOM 项；报告 `## Command OOM` 段未区分 `preExisting`；`assessLockfileWork` 与链路重复读 lockfile / manifest（性能项）。触发：下一阶段评估平台可观测面或告警多的仓库成本。

#### M63 归档残余（2026-11-20 登记）

- **v1 契约与跨库残余（P3 🛠️📚）** —— 契约快照只比对字段集合 / 分页上限（类型由 TS 与契约测试约束）；MySQL / PostgreSQL 未起真库验证组织 join；dashboard 每次全量聚合（读面放大后评估缓存）；`acknowledgedByUserId` / `upstreamId` 是否收敛进 v1 字段清单待评估。触发：v1 接入外部看板或读量上升时。
- **MCP remote 残余（P3 🚀）** —— `discover_repos` 的 `topics` / `hasDependabotConfig` 为占位默认值（已标 `probed: false`）；remote 告警过滤判据为复制 core 而非共享导出；超时 env 直接读 `process.env`、单测不可注入。触发：remote 后端进入日常使用或 core 过滤口径变更时。
- **日志聚合边界（P3 🎨）** —— 200 组上限下最坏聚合文本约 427 KB / JSON 约 833 KB（v1 由 pageSize 兜底）；`/root.`、`/app.js` 因右边界取舍不归一（非误伤）；日志头部无视觉基线、暗色 tag 对比度未测。触发：日志样本规模或外部消费方增长时。

## 待人工验收（真实环境，随可用性推进）

> 以下条目为需真实环境（外部凭据 / 真实 Redis / staging 等）的验证任务，保留随可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub OAuth 登录闭环（需 OAuth App 凭据）；**Google 暂不可测**：无可用 Google 账号、无法登录 Google Cloud Console 取凭据（2026-11-01 用户说明）→ `retry_condition` = 获得可用 Google 账号；2026-11-01 已决策接受未测并披露；G3.0 仍为 `pending`（无证据），资源到位后补测
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

### PR Check 真实 polling（总开关启用后）

- `ACTION_STATUS_MONITOR_ENABLED=true` 下的真实 polling 链路（手动触发端点 + 定时计划触发）需真实 GitHub 凭据与网络：
  验证「按 credential 聚合 → Octokit → 轮询写入 PRCheck」端到端；单次仓库上限与截断披露行为一并观察。

### T704 async 定时触发

定时任务真实环境验证：

- 真实 Redis >= 5 环境下 `TEMP_REDIS_INTEGRATION=true` 跑 BullMQ 集成测试
- staging / 后台服务下的调度轮询体验与 stale state 处理验证

### 沙箱执行器真实全链取证（2026-11-14 M59 归档登记）

- 需真实 GitHub token + 可达出站网络（`github.com` / registry）环境跑一次完整 `fix-and-pr`：容器内 clone → 安装 → 修复 → 验证 → 推送 → 建 PR，核对 `runUrl` / `prNumber` / 网络审计记录。
- 现有证据仅到 bootstrap 级（gated `sandbox-fix-real.test.ts`，占位 token 走 401），本机 `github.com` 出站被阻断，CI 无 token。
- **M59.2 残余（同批登记）**：沙箱自包含交付的 gated e2e 两分支（fix 无 PR / fix-and-pr 建 PR）与交付失败分支清理，均需真实容器 + token 取证；实现已交付，未取得证据即不得声称已闭环。
- 前置：先在目标环境确认沙箱可用（自检端点与部署形态见 [执行器部署与观测 §7.10](../design/governance/executor-sandbox-deployment-observability.md#_7-10-可用性自检与降级原因-m60-4-2026-11-15)）。

### 沙箱可用性自检与 opt-in 构建取证（2026-11-15 M60.4 归档登记）

- **gated report-only**：需 rootless daemon + `SANDBOX_E2E_TOKEN`，在 `WITH_DOCKER_CLI=true` 镜像下跑通一次 report-only 并核对 `GET /api/sandbox/self-check` 返回 `available: true`；当前环境无 rootless socket（仅 rootful daemon）且无 token，`sandbox-report` gated 用例按 env skip（未证实项）。
- **opt-in 构建取证**：`WITH_DOCKER_CLI=true` 真实构建平台镜像，核对容器内 `docker --version`、默认构建 `docker_cli_missing` 与 opt-in 后自检可用；Dockerfile 分支尚未实跑。
- 前置：部署形态矩阵与命令见 [quick-start.md](../guide/quick-start.md)「部署形态与可行执行器」。

### M63 真实平台 remote 联调（2026-11-20 归档登记）

- 需真实平台实例 + `dfk_` key（read scope）与被纳管仓库，验证 `fetch_alerts` / `history` / `get_last_report` / `get_run_logs` 的 remote 结果、组织隔离与真实 429；M63 的 mcp 测试仅覆盖 mock HTTP。

### M65 可观测性真实联调（2026-11-23 归档登记）

- **Sentry**：需真实 DSN / 项目，验证事件送达、配额与 Web Vitals 实采；当前仅覆盖「未配置零出网」与封装后的脱敏 / 信封字段用例。
- **provider 日志**：需真实 Vercel / Cloudflare 只读 token + 项目目标，验证日志尾部、401 / 429 / 超时降级与配额；Vercel 跨团队需 `teamId`、Cloudflare 预览构建可能不在列表首页（已知边界）。
- **uptime / 反向代理**：真实外部 HTTP 探针与编排器 readinessProbe 未联调；`pg` / `mysql` 后端 readiness 与迁移未实测（当前为 SQLite 单测 + 本机容器取证）。
- **SMTP**：真实黑洞（接受连接不响应）与多收件人累计时长未实测；当前仅锁定 transport 三超时取值与周报节拍断言。

### M62 真实仓库 baseline 对比（2026-11-19 归档登记）

- 需 `github.com` 出站可达环境，按 M62.1 同命令集对 momei / rss-impact-server 复跑基线与短路链，核对 AC①（≥50%）真实读数；现有读数为本地夹具 81.9%。

### M62 验收措辞裁决（2026-11-19 归档登记）

- M62.1 AC②（独立词汇表 `BASELINE_SKIP_REASONS` vs 原文 `verificationSkippedByReason` 家族）与 M62.2 AC②④（标签「运行级 OOM」、失败率按状态分布解释）在执行期已按更优口径落地并经审计认可，需用户确认后回写条目原文；未确认前不在后续阶段复用旧措辞。

### 收尾未 settle 复发观察（2026-11-19 登记）

- **已于 2026-11-19 定位并修复**（M62.6）：根因为外联审计代理 `stop()` 在 CONNECT 隧道 upgrade 后等不到 `server.close()` 回调；修复与复现读数见 [M62 归档分片](archive/todo-archive-phases-m62.md) 与 [执行进程隔离 §8.6](../design/governance/executor-process-isolation.md#_8-6-残余与观察项)。
- **本条目只保留观察判据**：之后含外联（registry / GitHub）的 fix 运行若仍出现 `execution_timeout` 且宽限期未落定，先读执行日志的「诊断分类」行——`未 settle 句柄` 说明有新的未关闭句柄（按「运行期句柄」清单定位）；`在管子进程` 说明有未纳入进程树终止的孙进程；两类「无法归类」按 backlog 旧分流（`采集不可用` 先修探针、`无净增` 抓 `ps -ef --forest` 查未返回的异步等待）。
- 历史样本（保留判读价值）：`6875bb2e09401dec`（momei，2026-11-13）空窗 5m20s、在管受管子进程 0 个、最后受管命令 `git rev-parse --abbrev-ref HEAD`。

### M67.3 定时发布空跑实测（2026-11-26 归档登记）

- **未证实项**：`release.yml` 的 `probe` job 尚无真实 `schedule` run——无变更轮次是否在 install 前短路（release job skipped、run 绿）、有变更轮次的步骤集合与时长对照均待实测。
- **前置**：定时发布启用仍需用户按 [release.md](../guide/release.md) 启用清单授权并取消 `schedule` 注释。
- **回填方式**：首个 `schedule` 无变更 run 与首个有变更 run 各记录 run id、job 状态、步骤数；写回 [release-pipeline §4.8](../design/governance/release-pipeline.md#_4-8-无变更周空跑短路-2026-11-25-d3-决策)。

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

## 已知边界与 known-issue

### 出站审计代理的明文代理路径未纳入隧道登记集（2026-11-19 登记，持续观察）

- M62.6 只登记并销毁 CONNECT 隧道的两端 socket；明文 HTTP 代理路径的上游 `proxyReq` 不在该集合内，停止时依赖 `CONNECT_TIMEOUT_MS` 收尾（单运行生命周期内低风险）。
- 触发条件：再次出现收尾未落定且诊断分类为「未 settle 句柄」时，先核对明文代理路径；回填方式 = 为 `proxyReq` 补登记 + 关闭上限用例。

### SQLite 单文件脆弱性 + TypeORM synchronize 风险（持续观察）

- **背景**：2026-09-01 `apps/platform/data/dependfix.sqlite` 业务数据被清空事故（详见 [经验归档 §五十](../design/governance/experience-archive-§49-§69-recent-investigation.md#五十、sqlite-数据库业务数据被清空-开发环境不可恢复事故-2026-09-01)）。代码内无清空路径，最可能清空来源在代码外部（shell / CI / 运维）。
- **防御现状**：事故防御加固已完成（启动期备份 / db-restore / db-doctor / synchronize + migrationsRun 双 opt-in / e2e fixtures 双门控），规范见下方"规范挂接"。
- **持续观察项**：
  - TypeORM 1.x 升级 / 替换为 0.3.x（1.x 已停止维护）—— 当前无明确上收时机，待后续评估
  - PostgreSQL 多写者迁移 —— 当前 single-org 模型限制（依赖 D3 多租户组织体系上线），D3 未上收
  - better-sqlite3 WAL 模式启用 + auto-checkpoint 调整（减少断电时数据丢失风险）—— 已落地 `journal_mode=WAL`，但 better-sqlite3 库升级路径未评估
  - SQLite 文件 inode 监控（`fs.watch` 检测 .sqlite 文件被外部 rm / rename 触发紧急备份）—— 与启动期备份互补，可作后续加固
- **规范挂接**：[工程实践判例 EP-16](../design/governance/engineering-practice-notes.md) + [EP-17](../design/governance/engineering-practice-notes.md) + [platform.md §3.6](../standards/platform.md) + [§3.7](../standards/platform.md) + [security.md §2.1](../standards/security.md)

### E2E global-setup 串行场景 ECONNRESET 根因（持续观察）

- **已落地（部分闭环）**：~~候选 ②（Nitro h3 async generator）~~ 已 M24.2 commit `bbb8f30` 判定非根因；~~候选 ③（SQLite WAL + `busy_timeout`）~~ 已 M23.1 commit `2ffaa45` 治本落地；候选 ④（fixtures API 节流）为 M24.2 commit `bbb8f30` 登记的经验性 follow-up；helper 层兜底 `maxRetries: 2` 已 M22.7 commit `f617b56` 落地。
- **剩余未闭环**：候选 ① better-auth 1.7 transaction 关闭时序 —— 诊断基础设施已 M27.5 commit `b252f93` 落地（`AUTH_TRACE=1` / `E2E_TEST=true` 双开关），待 CI 复现一次确认是否仍存在 ECONNRESET。
- **触发条件**：CI E2E job 再次出现 global-setup 末尾 `DELETE /api/e2e/fixtures` → `ECONNRESET` 时，开启 `AUTH_TRACE=1` 跑一次定位；如复现 fixture 并发问题按经验性模板 `apps/platform/server/utils/fixtures-throttle.ts` 加 100ms 节流（见 [platform.md §3.7.1](../standards/platform.md#_3-7-1-fixtures-api-无节流默认-节流触发条件)）。

### tsdown hash:false 下 entry 与共享 chunk 文件名冲突（持续观察）

- **背景**：2026-09-28 修复 engine 多 entry（`index` + `auth`）构建产物的 dts 入口错位——`hash: false` 时 entry 与共享 dts chunk 争用 `index.d.mts`，入口声明被挤出 `index2.d.mts`，而 `packages/engine/package.json#types` 指向 `index.d.mts`，导致 `apps/platform` 解析不到 engine 导出（TS2305）。
- **已落地**：engine `tsdown.config.ts` 用 `outputOptions.chunkFileNames` 把 chunk 统一隔离到 `chunks/` 子目录，entry 名保持稳定（chunk 名解析用 `chunk.name.slice(0, -2)` 而非占位符，规避 tsdown 升级回归）。
- **持续观察项**：`packages/core` / `packages/cli` / `packages/mcp` 当前无名为 `index` 的共享 chunk（dist 无 `index2` 冲突），故未做预防性改动；若未来某包出现「多 entry 共享 dts 声明」形成名为 `index` 的共享 chunk，需同样加入 `outputOptions` chunk 隔离。
- **触发条件**：任一 `packages/*` 构建后 `dist/` 出现 `index2.d.mts` / `index2.mjs`，或下游对该包类型解析报 TS2305。

### apps/platform `.output` 不随根构建脚本重建（操作提醒）

- **背景**：根构建脚本 `pnpm -r --filter "./packages/*" build` 不含 `apps/platform`，`.output` 需单独构建。
- **影响**：类型侧由 `nuxt typecheck` 覆盖；但涉及 `packages/*/dist`（如 engine chunk 结构）变更后，容器 / 运行时冒烟前需重建 `apps/platform/.output`，否则可能引用旧产物。
- **触发条件**：① 需要容器 / 运行时冒烟验证依赖 `packages/*/dist` 的变更时；② 跑 `apps/platform` e2e 或**视觉回归**（`pnpm --filter @dependfix/platform test:visual`，M32.5）前——两者都跑 `.output` 产物，源码改动不重建则验证的是旧产物（假绿；M32.1 / M32.5 均实证）。

### 发布后镜像冒烟与历史 tag 巡检：主通道已证实、失败分支待样本（持续观察）

- **背景**：M58.4 新增 `docker.yml` 的 `post-release-smoke`（amd64 / arm64 原生 runner 拉镜像跑 `/api/health` 断言 + 历史 tag 巡检）。
- **已验证（2026-11-15，1.1.0 发布 run `43696172095`）**：① `ubuntu-24.04-arm` 原生 runner 实跑 success；② 私有 GHCR `packages: read` 登录与拉取 success；③ 历史 tag 巡检在 **amd64 腿** success（工作流条件 `matrix.arch == 'amd64'`，arm64 腿不执行该步；全量历史 checkout；summary 正文 API 不可读）；④ 两架构 `/api/health` 均为 `{"version":"1.1.0","commit":"80883880…","schema":"ok"}`。
- **仍未证实**：冒烟失败分支的 Job Summary / `::warning::` 可见性（本轮无失败样本）。
- **回填方式**：下次出现失败样本时补该分支证据；在此之前不得把「失败可见性」记为已验证。
- **触发条件**：出现冒烟失败 run 时，取该 run 的 Job Summary 与 `::warning::` 输出回填 [发布管线设计 §4.6](../design/governance/release-pipeline.md#_4-6-发布后镜像冒烟与历史-tag-巡检-2026-11-12-m58-4)。

### ACR 个人版在 arm64 主机的按 tag 拉取未实测（持续观察）

- **背景**：M58.5 收口镜像通道口径时确认：ACR 个人版按 tag 的行为依推送路径而变（0.5.0 buildx 多平台直推 → amd64 主机按 tag 得单架构；1.0.0 起 digest 合成 → registry API 回读为双平台 index，run `42381362295` 4/4）。本环境无 arm64 主机，未实测 arm64 客户端按 tag 的实际拉取结果。
- **未证实项**：arm64 主机 `docker pull <ACR tag>`（含 `--platform=linux/arm64`）是否可拿到 arm64 镜像。
- **回填方式**：在 arm 环境一次性取证，结论写回 [发布管线设计 §4.7](../design/governance/release-pipeline.md#_4-7-镜像通道矩阵与-acr-架构边界-2026-11-12-m58-5)；未回填前 ACR 继续记为「amd64 备份通道」，不得写成 arm64 运行证据。
- **触发条件**：具备 arm64 主机或需要把 ACR 作为 arm64 分发通道时。

### 宿主级 OOM 与 cgroup 标记无法解释（持续观察）

- **背景**：M46.4 的资源采集只覆盖容器 cgroup（v2/v1）；宿主级 OOM（未设容器 limit）不保证被 cgroup 捕获。M59.4 只扩展「sandbox / action 执行器 + 异常路径快照」，不采宿主 `dmesg` / `journalctl -k` 关联。
- **触发条件**：OOM 再次发生且 cgroup 标记无法解释，或 sandbox 成为主执行路径。
- **回填方式**：需要时单列候选（宿主 OOM 归因口径 + 可观测面），不得在资源采集扩展中顺手夹带。

### Redis 同步降级时 HTTP 进程执行安装的启动提示缺口（持续观察）

- **背景**：队列 Redis 不可用会同步降级，HTTP 进程也会执行安装；当前启动探测无法预知该状态，M59.4 不覆盖此提示面（原「执行资源采集覆盖面扩展」候选的第 ④ 点）。
- **触发条件**：同步降级再次发生且用户无法从启动日志 / 健康端点判断。
- **回填方式**：单列候选（启动期探测 + 运行提示），或并入平台可观测性批次。

### 全量 vitest 偶发失败（单次未复现，持续观察）

- **背景**：2026-10-14 M44.4 批次② 的一次全量 `pnpm test` 出现失败，但输出被调用方截断、失败明细未捕获；随后同一工作区（仅文档与注释变更）连续多次复跑均全绿，未能复现（按 [AI 协作规范 §4.7](../standards/ai-collaboration.md) 阶段 3 登记根因观察项）。
- **持续观察项**：① 再次出现时须捕获完整失败明细后定位（首要假设：vitest worker 并发 / 资源竞争；其次：既有时序敏感用例）；② 长期不复现则维持观察。
- **触发条件**：再次出现同形失败（本地或 CI）。

### 平台 e2e 偶发等待超时（scan-config / repos-crud，持续观察）

- **背景**：2026-10-26 M49.2a 依赖升级后连续两次运行 `pnpm --filter @dependfix/platform test:e2e`，`scan-config.e2e.test.ts` 的「扫描偏好：记住上次选择（重开 + 刷新生效）」均为 1 flaky（等待仓库行可见超时，重试通过）。M49.2b 升级 nuxt 4.6.2 后：第一轮除 scan-config 外新增 1 例 `repos-crud.e2e.test.ts`「删除仓库：列表移除」flaky（重试通过）；第二轮仅 scan-config flaky，其余 204 例全绿。
- **持续观察项**：① scan-config 超时点在 `openScanConfig` 的 `.caomei-data-table__row` 可见性（15s）；② repos-crud 为删除后列表刷新时序。首要假设均为 SSR hydration / 行渲染时序，其次为上一轮 e2e 数据库残留导致列表排序漂移；再次出现时保留 `test-results/` 的 error-context 与截图后定位。
- **触发条件**：运行 `apps/platform` e2e（`test:e2e`）时再次命中上述用例。

### caomei-ui 1.4.0 浮层 inert 隔离吞掉面板外首击（2026-11-22 登记，持续观察）

- **背景**：caomei-ui 1.4.0 起 Select / MultiSelect / AutoComplete 展开态会给面板外兄弟节点补 `inert` + `aria-hidden`。真实用户在面板外点击的第一下只会关闭面板：文档级 `pointerdown` 先释放隔离，但事件目标已落到 `body`，被点元素收不到该次点击（第二次点击才生效）。
- **影响面**：当前仅 `repos` 仓库表单的「来源类型」多选需要「选中后点别处收合」；其余 Select 为单选，选中即收合。平台 e2e 已改为点字段内触发器 `.caomei-multi-select__icon` 收合（`repos-crud.e2e.test.ts`），未为上游 a11y 设计做兜底封装。
- **持续观察项**：① 用户反馈「多选展开时点保存需要两次」类问题；② 上游是否调整首击语义或隔离范围。届时按 [升级 §15.18](../design/governance/caomei-ui-migration-upgrades.md#_15-18-caomei-ui-1-4-0-升级实证-2026-11-22) 复核，若上游修复则删除本条并撤回 e2e 手势适配。
- **触发条件**：出现上述用户反馈 / 上游发布相关变更 / 再次升级 caomei-ui 时。

### 依赖审计豁免复核（minimatch，持续观察）

- **背景**：2026-10-05 weekly regression 因 `security:audit-deps` 阻断失败——node-forge ≤ 1.4.0（GHSA-86w9-cpqp-85rv）与 braces ≤ 3.0.3（GHSA-vfj7-8cjw-p6xm）为 high，但 advisory 声明的 patched 版本（1.4.1 / 3.0.4）**尚未发布**，overrides / `pnpm update` 无法解析。经用户决策（方案 A，调整为配置文件实现）在 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) `audit.ignore` 显式豁免。
- **机制与复核**：以 `pnpm-workspace.yaml` `audit.ignore` 显式豁免（只过滤列表内编号，未列入的新漏洞仍使 `pnpm audit` exit 1）；机制、禁止项与复核条件以 [security.md §5.7](../standards/security.md#_5-7-无可用修复版本漏洞的审计豁免-audit-ignore-2026-10-05) 为唯一权威，本条不重复。
- **复核条件**：消费者上游改用 minimatch ≥ 11.0.1（或 eslint / readdir-glob / typescript-estree 放弃 v3/v5/v10 API）后，移除 `pnpm-workspace.yaml` 对应条目并复跑 `pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org`。glob 同类条目已于 2026-10-31 通过 `overrides.glob` 升到 `^14.0.3` 验证通过后移除。
- **复核记录（2026-10-17）**：周回归 `38929908272` 新增 3 critical / 5 high（`simple-git` ×2 / `@simple-git/argv-parser` / `shell-quote` / `seroval`，均经 `apps/platform > nuxt > @nuxt/devtools|@nuxt/vite-builder`）——patched 版本均已发布，按「升级优先」用锁文件提升闭合（`@nuxt/devtools` 3.4.3 / `seroval` 1.6.9 / `shell-quote` 1.12.0），**未新增豁免条目**；本清单两条仍按上述复核条件保持活跃。
- **复核记录（2026-10-26，M49.2a）**：braces 条目对应 advisory `GHSA-vfj7-8cjw-p6xm` 已于 2026-10-23 **撤回**（`withdrawn_at`），advisory 撤回后该路径不再有有效漏洞 → 移除 `audit.ignore` 条目与 §5.7 行；node-forge 最新版仍为 1.4.0（`npm view node-forge version`），继续豁免。
- **转正记录（2026-10-27，M49.3）**：prod 审计已转阻断（`--ignore-registry-errors --registry=https://registry.npmjs.org`）；`audit.ignore` 保留 node-forge（latest 1.4.0，仍无修复版本），§5.6 clean 判据改为阻断步骤 exit 0 且日志含审计结果行（ignored 不参与阻断）。
- **发布门禁关联**：§5.9 台账当前为空（node-forge 已修复）；在册 minimatch 为 moderate，按 §5.9 不入台账。若该条升级为 high，须以 `hard-fix` 登记 [`.github/release-security-exemptions.json`](../../.github/release-security-exemptions.json) 并同步本节。
- **触发条件**：每周回归 / 依赖升级 / 上游发布修复版本时复查。
- **复核记录（2026-10-31，Test run 41160837415 修复）**：node-forge 1.4.2 发布（2026-10-27）→ 升 `node-forge: ^1.4.2` 并移除 `GHSA-86w9-cpqp-85rv`（§5.7 行与 §5.9 台账同步清空）；`nuxt` 4.6.2 → 4.6.3 修复 `@nuxt/vite-builder` / `@nuxt/nitro-server` / `nuxt` 三条 moderate；glob 通过 `overrides.glob: ^14.0.3`（build / e2e / 视觉验证通过）移除 `GHSA-3g3m-2fjr-6pw4`，未挂豁免；仅保留 `GHSA-g3hv-75wg-m249`（minimatch，消费者仍用 v3/v5/v10 API）。另观察 `deepmerge` 4.3.1 low（advisory patched 4.3.2 尚未发布，不阻断、不入台账）。
- **可选增强**：以调度任务自动比对 `npm view <pkg> version` 探测上游修复发布，避免豁免长期挂账（暂未实现）。

### 依赖审计豁免复核（picomatch，持续观察）

- **背景（2026-11-18）**：`master` push 的 Test job（run `44148812786`）在 prod 阻断审计失败——新发布的 `GHSA-fc5q-39xc-vjpf`（picomatch ≤ 4.0.7，**high**，单分支重复 extglob 的 ReDoS）声明 patched `>=4.0.8`，但 registry 最新仍为 4.0.7（4.0.8 未发布），overrides / `pnpm update` / `pnpm audit --fix` 均无法落地。依赖路径：`apps/platform > @nuxtjs/i18n > @intlify/unplugin-vue-i18n > @rollup/pluginutils / tinyglobby > picomatch`（构建期工具链，不进请求处理路径）。
- **处置**：按 [security.md §5.9](../standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策) 以 `no-fix` 登记 [`.github/release-security-exemptions.json`](../../.github/release-security-exemptions.json)（维护者 2026-11-18 确认 high 可豁免），并同步 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) `audit.ignore`（§5.7：high 须先尝试修复，确无可用修复版本时按 §5.9 台账登记后方可入 `audit.ignore`）。本地复跑 prod 审计：`1 moderate (1 ignored) | 1 high (1 ignored)`，exit 0。
- **复核条件**：picomatch `>=4.0.8` 发布后加 `overrides.picomatch` 升到该线 → 复跑 `pnpm audit --prod --audit-level=moderate --registry=https://registry.npmjs.org` 通过 → 移除 `audit.ignore` 条目与 §5.9 台账条目并回填本节复核记录。
- **现状说明（2026-11-18）**：`check:release-security` 实跑 PASS（critical 0 / high 0），台账条目暂为 **stale warning**——仓库 Dependabot 尚未生成该 advisory 的告警行（advisory 已发布、告警未同步）；待告警生成后自动匹配，stale 警告消失。
- **触发条件**：每周回归 / 依赖升级 / `npm view picomatch version` 变化时复查。

### 依赖安全补丁的 overrides 钉定（vue-i18n 家族 / seroval，持续观察）

- **背景（2026-10-29）**：prod 阻断审计因 `vue-i18n` 家族（`GHSA-83rm-6c8r-g728`，high）与 `seroval`（`GHSA-f86p-h4j2-7qgj` / `GHSA-9wx9-5pv9-3349`，moderate）失败；advisory 声明的最小修复版本为 `vue-i18n` 家族 11.4.14、`seroval` 1.6.11（`GHSA-f86p-h4j2-7qgj` 的 patched 是 1.6.11，`GHSA-9wx9-5pv9-3349` 为 1.6.10）。
- **处置**：仅在 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) `overrides` 按上述版本线钉定（`vue-i18n` 与 `@intlify/*` 用 `^11.4.14`，`seroval` 用 `~1.6.11` 收在同一 minor）；未使用 `audit.ignore` 豁免，未改动 `minimumReleaseAge`（该配置单位为分钟，本场景不构成解析障碍）。
- **范围事实**：`seroval` 钉在 `~1.6.11`（latest 已到 1.7.x，跨 minor 不会被自动采纳），`vue-i18n` 家族钉在 `^11.4.14`；同范围内的新补丁由 `pnpm update` 正常跟进，跨 minor 或放宽范围需要人工修改此处。
- **复核条件**：上游在 `vue-i18n` 家族或 `seroval` 发布新的安全修复时，评估升至该版本并同步此条；连续两个发布周期无新 advisory 时可评估放宽为上游范围。
- **触发条件**：周回归 / 依赖升级 / 审计失败定位到上述包时。

---

### 沙箱路径超时日志回传不全（2026-11-18 登记，持续观察）

- 现象：`sandbox-executor` 仅在 `transportExitCode === 124` 且容器有输出时回传 `logsJson`；`125`（镜像不可用）与「未回传显式结果」分支不回传，落库后 `logs_json` 为空，运行详情与导出只剩「无执行日志」。容器执行器超时路径不受影响（catch 恒带 `logsJson`）。
- 影响：沙箱超时 / 镜像不可用的现场不可离线归因，且与容器路径的取证口径不一致；本机库 3 条沙箱 run 的 `logs_json` 均为 null（2 条命中上述分支）。
- 处置：待评估「空输出也回传诊断行（退出码 / 阶段 / 镜像引用）」的补全方案，避免与「结果缺失」混淆；登记为无阶段编号候选，随下次沙箱批次承接。

### 归档链接与 MCP 归档取数的两类盲区（2026-11-16 登记，持续观察）

- **归档链接**：`check:docs` 的 links 面已覆盖 `docs/plan/archive/**` 并修净 file-dead / 锚点形态，但仍有两类盲区：① 目标在 `docs/` 之外的相对链接在 GitHub 可跳转、VitePress 产物 404（`links` 只核磁盘路径）；② 链接文字点名已迁出章节（如 `§M7.2` / `C66-C`）而目标仅为文件顶部，门禁只看目标存在性。处置：下次归档批次或文档站治理时统一改为 GitHub 绝对 URL 或在规范声明源码路径以仓库视图为准；全归档面同类外链未逐一计数。
- **MCP `get_last_report`**：实现取报告目录字典序最后一个 `.json`，标准归档布局下恒为顶层 `index.json`（趋势索引），不是最近 RunResult；REFERENCES 已按实际行为描述。需要单次 RunResult 时改为跳过 `index.json` 并递归取最新 `summary.json`，同步补月目录用例与断言行。

### 设计文档「文件级指针」漂移（2026-11-23 登记，持续观察）

- 现象：设计稿写「见 `todo.md` Mxx 执行记录」但阶段归档后该段已迁出；`check:docs` 只核文件存在，核不出内容指针漂移。本批已修 `pr-build-deploy-signals.md` 一处，另有 `platform-page-decomposition.md` / `override-protect-policy.md` / `sandbox-security-governance.md` / `c22-manifest-flow-feasibility.md` / `architecture.md` 等存量指针待复扫。
- 处置：下次归档批次或文档治理批次按「`todo.md` + 段号文本（无 `#`）」形态全仓复扫并改指归档分片；评估把该形态写入 §4.4 第 2 / 19 条复扫清单。

### 可观测性尾部事件与规范文档预算（2026-11-23 登记，持续观察）

- **Sentry 尾部事件**：worker `exit(1)` 崩溃路径可能丢尾部事件——进程在事件入队后立即退出时未等待 flush；当前无复现样本，恢复条件为出现崩溃 run 缺尾部事件。
- **规范文档预算**：`docs/standards/platform.md` 字符数超 24,000 健康线（2026-11-23 实测仍超；M65.1 时点为 24,299），随下一次规范压缩批次等量压缩，不靠调高阈值绕过。

### M66 阶段残余（2026-11-25 登记，持续观察）

- **engine `auth-flow.test.ts` 偶发超时**：连续全量中出现 1 次 `expected 501 to be 401` 的 10s 超时（单跑 13 passed，与 M66 改动无 import 关系）；判为既有 flake。恢复条件：CI 复现或下次触及该文件时一并定性，不阻塞发布。
- **`docs/guide/deployment.md` 行数零余量**：实测恰好 500 行（健康窗口 ≤500），下一次新增部署内容会进入 warning 带；处置：新增前先把「提交卫生」旁支外移或等量压缩，不调阈值。
- **Dependabot moderate #127（minimatch）**：默认分支现存 1 个 moderate 告警，不阻断发布门禁（`check:release-security` 只拦 critical / 未豁免 high）；随下一依赖批次升级处理。该告警的豁免口径沿本文件「依赖审计豁免复核（minimatch）」小节，不在此重复。

### M67 阶段残余（2026-11-26 登记，持续观察）

- **基线红载体真实 API 与执行器作用域**：M67.2 的 issue / 草稿 PR 载体只经 server 单测 + 页面 e2e 组合验证（无稳定「基线红」夹具，真实 GitHub 创建未端到端）；`sandbox` / `github-action` 执行器不消费仓库级 `baselineRedCarrier`（UI 已按 container 条件展示，文档已声明）。恢复条件：出现可用基线红目标仓或需要把载体扩展到其它执行器时，补真实 API 取证与执行器接入。
- **视觉基线随表单字段变化**：M67.2 新增字段使 `dialog-select-open` light/dark 重建；后续若调整仓库表单布局，需按 [testing §6.7](../standards/testing.md#_6-7-视觉回归-截图识别层-apps-platform) 重新取证，不把本次基线当作布局冻结。
- **定时发布启用仍未上收**：M67.3 已提供无变更周短路（probe job），但 `release.yml` 的 `schedule` 仍按启用清单保持注释；真实无变更 / 有变更轮次对照见本文件 §待人工验收「M67.3 定时发布空跑实测」。

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | M68 运行面安全与镜像供应链（2026-11-26 规划，5 原子，见 [todo.md](todo.md)）；插队容量治理见 [planning.md §3.1.1](../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) |
| 下一阶段（未规划） | 按本文件候选池重新评估（15 条候选 + 2 条待上收）；M59 / M60 / M63 / M65 / M67 残余留在本文件；**1.1.0 已于 2026-11-15 发布**，定时发布启用仍在「待上收候选」段等待观察窗口 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M67 已归档） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
