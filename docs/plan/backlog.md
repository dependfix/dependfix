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
  3. ~~**注册表域预置 + 动态发现生效 registry**（镜像站 / 企业私服被 deny-by-default 拦死 → install 失败 + 全量回滚）~~ —— **已随 2026-10-11 M42 阶段闭环（M42.1：`380e8f4` + `47f7c42` + `39df76d`，预置常见镜像源 + 从配置面动态发现生效 registry + 治理决议登记）**；剩余方向（构建工具生态文档站类目 / SRI 哈希钉定）保留待评估。
- **验收**：默认白名单不再按次新增；verification 阶段合法外联不被误判；剩余候选方向（SRI 哈希钉定等）任一实施或主线整体评估为长期保留后关闭本主线条目

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

> **候选池概览（2026-10-30 实测）**：本区 56 项（2026-10-30 上收 M51 九项 / F2 七项后实测；含 M50.2 / M50.3 复审衍生候选 + 2026-10-29 批量运行超时复盘派生 4 项 + 2026-10-30 用户实测派生 2 项（PR 正文 `From` 恒空、扫描页排序与时间区间）+ M51 收口登记 2 项（G8 指标采集脚本、PR 回环有界重试）；F2 上收 7 项见 [M52](todo.md)；另 1 项设计定稿后按用户裁定转入 §延期 / 暂缓项）；P 标签覆盖不全（未标注者评估时补 P 标签，不默认升级）；本文件不维护分档统计，1.0 分档只见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)；未标注候选评估时补 P 标签，不默认升级。
> **1.0 门槛与分档**：P0 23 / P1 8 / 1.0 后 15 的分档、门槛判定与批次计划见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)；本区候选在未上收前保持候选状态，上收后按批次从本表移除。

- **PR 回环有界重试（P2 🚀，2026-10-30 M51.3 用户裁定延后）** —— 设计稿 `pr-feedback-loop.md` §8 保留 `FeedbackRetryDispatcher` 契约（同 PR 失败后重新触发既有修复链，需配额与触发面）；平台当前无「同 PR 重试」入口，`retryFailed` 开启时每仓库每进程只 warn 一次。待评估：补触发面（API / UI）+ 配额后再实施。触发：出现「PR 红后无人处理、需自动重试」的实际需求时。
- **1.0 G8 产品指标采集脚本（P1 🛠️，2026-10-30 M51 收口登记）** —— 台账 G8（近 30 个 PR 的 CI 绿率 / 人工介入率 / 误关率）原归属「F1 采集实现 + G 引用」，但 M51 六原子未产出统计脚本，F1 已闭环后该前置悬空。待评估：在 F2 或 G 前补统计脚本 + 证据口径（取数来源 `ScanRun` / `PRCheck` / 关闭原因字段）。触发：F2/G 规划时。
- **zh quick-start CLI 表缺 `--ai*` 等已实现参数（P2 📚，2026-10-31 M52.2 收口登记）** —— en 侧已按代码补齐 `--ai` / `--ai-api-key` / `--ai-provider` / `--ai-model` / `--ai-base-url` / `--ai-api-url` / `--ai-trigger` 等行（`packages/cli/src/cli/index.ts` 实际存在），但 zh 事实源 `docs/guide/quick-start.md` 的 CLI 表未列（M52.2 约定不改 zh 事实源内容，只在 en 侧保留事实）。影响：中文读者看不到 AI 研判相关参数，两侧表格体例分叉。待评估：在下一批中文事实源更新中补齐（同时核对 Action 输入表与 CLI 表的一致性）。触发：中文文档下一轮更新时。
- **列表查询缺并列次键（P2 🛠️，2026-10-30 同 pattern 扫描）** —— alerts 原始列表已补 `result.id DESC` 次键（M51.6）；同一 pattern 已确认 6 处：`api/runs/index.get.ts`（分页 `skip/take` + 仅 `createdAt DESC`，翻页可能重复 / 丢失）、`api/runs/[id].get.ts`（`order: { severity }`，扫描详情弹窗有视觉基线）、`api/audit-events/index.get.ts`（`createdAt DESC` + `take(500)`）、`api/pr-checks/index.get.ts`、`api/notifications/index.get.ts`、`api/batch-runs/index.get.ts`（`createdAt DESC` + `take(50)`）；`repos` / `schedules` / `credentials` 等其余列表待逐处评估。影响：主排序键并列时行序取决于数据库返回顺序，同一查询两次可能不同（视觉基线 / 截断集合抖动，当前未暴露属潜伏）。待评估：统一口径「列表查询必须显式次键（唯一列 DESC）」并逐处补齐。触发：任一列表页出现视觉抖动或分页重复 / 丢失时。
- **平台 typecheck 未覆盖 `.nuxt/tsconfig.node.json`（P2 🛠️，2026-10-30 审计发现）** —— `pnpm --filter @dependfix/platform typecheck`（`nuxt typecheck`）静默 exit 0，未覆盖 `.nuxt/tsconfig.json` 引用的 node 项目；实测该路径下 `nuxt.config.ts` 有 2 个既有类型错误（icon `rel: 'alternate icon'` 不在允许联合、i18n `locales` 声明为 readonly 与可变 `LocaleObject[]` 不兼容），另有 `.nuxt/tsconfig.node.json` 自身的 `emitDecoratorMetadata` / `experimentalDecorators` 组合告警。影响：`nuxt.config.ts` 一类配置错误长期不在门禁内。待评估：修掉 2 个错误后把该 project 纳入 typecheck 脚本（`vue-tsc -p .nuxt/tsconfig.json`）。触发：下次修改 `nuxt.config.ts` 或平台门禁治理批次。
- **预算跳过的交付可观测性（P2 🎨）** —— 运行预算不足导致终验跳过时，引擎已写 `BUDGET_EXHAUSTED` 审计并置 `RepositoryResult.verificationSkipped='budget'`，但 Markdown 报告不单独渲染该字段、平台运行详情也不展示；「修了 N 条、交付 0 条」只能从 Errors 表追溯。待评估：报告与平台展示「验证跳过（预算）」并在 `deliverySkips` 家族里登记该跳过原因。触发：出现「预算耗尽但用户不知道为何没交付」的反馈时。
- **平台侧交付载体（issue / 草稿 PR，P2 🎨）** —— 引擎 `fix-and-pr` 已按基线红档位产出载体（issue / 草稿 PR），平台执行链（`fix + commit` + `platform-delivery`）目前只记录 `summary.deliverySkipped*` 并在运行列表 / 详情展示；待评估：平台在交付决策处复用同一失败指纹开 issue / 创建草稿 PR，并补仓库级配置写入面（当前仅 env `DEPENDFIX_ON_BASELINE_RED`，UI / API 不暴露）。触发：平台用户反馈「基线红只有标签、没有可跟踪载体」时。口径见 [pr-delivery-closure.md §16.7](../design/governance/pr-delivery-closure.md#_16-7-已知边界)。
- **镜像脚本只覆盖根 scripts 单一形态**（M48.2 边界）—— `pnpm --filter` / 递归 / env 前缀 / corepack 钉定只披露不执行；触发：目标仓库 CI 大量使用这些形态导致「本地假绿」再现。
- **白名单内运行前未提交改动的归属**（M48.4 边界）—— 白名单内文件（典型 `package.json`）若在运行前已有用户改动，会与本次修复一并提交；触发：出现「PR 混入无关改动」的用户反馈时评估。
- **`dependfix-remediator` REFERENCES 的 MCP 状态与入参映射过期**（M49.4 边界）—— `skills/` 与 `packages/skills/` 两份同文 `REFERENCES.md` 仍写「当前 MCP Server 未发布」，能力映射表入参名（`owner` / `severityThreshold` / `includeCodeScanning`）与当前 MCP schema（`repo` / `severity` / `code_scanning`）不一致；4 tool 检测子集为刻意最小集，保留。触发：F2 技能文档批次，或下次修改 MCP schema 时。
- **`SandboxExecutor` 真实引擎执行仍为占位（P1 🛡️，恢复 sandbox 入口前必须闭环）**—— `apps/platform/server/services/executor/sandbox-executor.ts` 的 `buildCmd` 仅回显最小 `RunResult`（exitCode 0 / 0 告警），不启动 dependfix 引擎；M10 T1001 已落隔离基础设施、M38 已落执行进程隔离。影响：选择 `executorKind=sandbox` 的扫描曾为假成功。**平台入口已于 2026-10-27 临时关闭**（UI 禁用 / API 拒绝新写入 / 存量仓库强制降级 `container` + degraded `sandbox_entry_disabled`）；真实执行闭环后恢复入口。待办：实现 sandbox 内自包含 CLI 入口 + git clone / pnpm install / 引擎执行 / 结果回传，补真实容器 e2e。触发：恢复 sandbox 入口前必须完成。**复用 / 弃用判据**：恢复入口前决定「复用（补自包含入口 + 真实 e2e）」或「弃用（删除 executor / 沙箱 env / UI 残留）」；未决定前保持入口关闭。
- **`pnpm_audit` 的 token-free 回退意图与实现不一致（P2 🛡️）**—— `pnpm-audit.tool.ts` 注释与产品意图是「无 GitHub token 或 403 场景」的本地回退，但实现保留 `requireToken()`，缺失 `GITHUB_TOKEN` 时直接返回 `ok:false`；当前 README / tool description 已按实际行为修正。待评估：移除 `requireToken()`（或改为可选 token），补无 token 用例，恢复真正回退。触发：无 token 环境需要 pnpm-audit 回退时。
- **周回归审计在 registry 故障时假绿（M49.3 边界，P2 🛡️）**—— 阻断命令按 AC1 在 registry 故障时 exit 0；`security:audit-deps` 在周回归仅按 exit code 判过，若 registry 故障且日志无审计结果行，run 会 success 但未实际审计。当前 §5.6 / 检查点已要求「证据 run 须含审计结果行」；待评估：为 `security:audit-deps` 增加输出断言（无结果行则非零）或落盘校验。触发：出现 registry 故障窗口或周回归连续 success 但日志无审计结果时。
- **`repositoryUpdateSchema.partial()` 注入默认值导致 PUT 静默重置字段（P1 🛡️，2026-10-27 审计发现）**—— Zod 4.6.7 实测 `repositoryUpdateSchema.parse({ note: 'x' })` 会注入 `platform: 'github'` / `defaultBranch: 'main'` / `packageManager: 'pnpm'` / `executorKind: 'container'`；任何只改 note / tags 的 PUT 会把 `github-action` 仓库静默重置为 container（defaultBranch / packageManager 同理）。影响：数据完整性与执行器误重置。待修复：update 专用无默认字段 schema，或 API 层按原始 body 键应用；补「PUT 省略 executorKind 不改动存量 github-action」用例。当前 UI 提交全量字段，暂不触发；API 直连调用方需注意。触发：API 直连部分更新导致字段被重置，或 update 语义修复批次。
- **回归窗口 new-entry 插入点嵌套进上一条受管块（P2 🛡️，2026-10-27 审计发现）**—— `upsertRegressionWindowContent` 以第一条 `## YYYY-MM-DD` 标题为插入点，但该标题被上一条 `<!-- regression-window:start:id -->` 包裹；本地累积 / 重跑最旧 id 时新块嵌套进旧块标记区间（a→b→a 三次 upsert 后仅剩 1 块）。CI 每次全新 checkout 仅写 1 条不受影响；历史 `docs/reports/regression/current.md` 已呈嵌套（`0b0ff93b` 前）。待修复：锚点改为第一条记录 start 标记之前（无标记回退 `##`），补「不同 id 顺序 upsert 生成同级块 + 最旧 id 重跑不丢后续块」单测。触发：本地连续回归或修复窗口结构时。

- **运行面漏洞检测：镜像基底 / 运行时二进制 / OS 包（待研究）** —— 背景（2026-10-22）：Node 24.18.1 基础镜像在 2026 年 10 月 21 日安全公告（CVE-2026-111497 Brotli 越界写、105483 / 106069 TLS 主机名校验绕过等）后仍只能靠**外部人工巡检**发现——Dependabot 未配置 docker 生态、基底此前为 digest 裸写（本轮已改为 tag + digest，但仍为手工钉定、无漂移与漏洞追踪）、`pnpm audit` 只覆盖 npm 依赖、GitHub 侧告警源为 Dependabot / Code Scanning / Code Quality findings（最后一类为代码静态分析），本地回退仅 `pnpm-audit`（同属 npm 依赖）；运行面与 OS 包无任何告警源。本批新增的 `check-node-version.mjs` 是**静态下限闸门**：只有人工抬升基线后才会拦截，**不能发现基线之后新披露的 CVE**。
  - **待研究问题**：① dependfix 自身的运行面（Docker 基底 / Node 二进制 / apk 包 / CI 运行时）能否自动检测并按严重级别分级？② 同一能力能否产品化，成为 dependfix 对**被管理仓库**的新告警源——扫描目标仓 Dockerfile / `.nvmrc` / `engines.node` 与已知运行时漏洞比对，复用现有验证链与 PR 创建提修复 PR？
  - **候选机制**（需比较权威数据源与误报成本）：
    1. **CI 周期任务**：解析 `FROM` 的 tag + digest → 采集镜像内 `process.versions` / `apk info -v` → 与 Node CHANGELOG、Alpine secdb 比对；漂移时开 issue 或失败
    2. **SBOM + 容器扫描**：`syft` 生成镜像 SBOM，`trivy` / `grype` 按 CVE 分级；产物可归档、可审计（对 OS 包与语言依赖有覆盖；对 tarball Node 与内嵌依赖不可见，不能替代机制 1）
    3. **Dependabot docker 生态**：`FROM image:tag@digest` 形态下自动提 digest PR（只覆盖基底发布，不覆盖运行时 CVE）
    4. **产品化 runtime alerts**：目标仓 Dockerfile / engines / `.nvmrc` 解析 + 漏洞库比对，作为 Dependabot / Code Scanning 之外的第三类告警源
  - **数据源实测（2026-10-22，时点快照）**：
    - **Node 运行时（官方 tarball / 镜像）**：主线映射用 `nodejs/node` 的 `CHANGELOG_Vxx.md`（`24.22.1` 段含 `CVE-2026-111497`）与 nodejs.org 安全公告；`dist/index.json` 无 CVE 编号，但有 `security` 布尔与内嵌版本字段（openssl / uv / zlib / v8），可用于判「是否安全补丁版」。**反例（不能只按发行版生态映射判官方 tarball 版本）**：OSV 的发行版生态（如 Debian）在公告当日即可有 CVE → `nodejs` 映射，但对应的是发行版打包的 node，不等于官方 tarball 版本。
    - **apk 包**：Alpine secdb（`secdb.alpinelinux.org/v3.24/{main,community}.json`）的 `pkg.secfixes`（修复版本 → CVE 列表）；OSV 的 `Alpine:v3.24` 生态提供等价查询（条目形如 `ALPINE-CVE-*`）。两者都不覆盖官方 tarball 的 Node（镜像内 `apk info -e nodejs` 不存在）。
    - **滞后 / 不可用源（时点事实）**：NVD 在 111497 发布当日 `vulnStatus=Received` 且 `configurations` 为空；MITRE 记录把受影响产品标为 Google Brotli（分支区间 1.0.3–<1.0.10 / 1.1.0–<1.1.1 / 1.2.0–<1.2.1），不是 Node.js；GitHub Advisory 无 node 运行时条目（该 CVE 的 `GHSA-9v8h-qqgm-4m35` 当日已收录且为 critical，但 `vulnerabilities` 为空、无包映射，故不产生 Dependabot 告警）；endoflife.date 只有版本 / EOL。
    - **内嵌依赖**（OpenSSL / undici / SQLite / c-ares）：编进 Node 二进制，OS 包扫描不可见。`process.versions` 只用于采集清单，**不能单独作为判定依据**——内嵌库可能因 cherry-pick 修复而版本号不变（实测 brotli 1.2.0 仍在受影响区间，但 `24.22.1` 已修）；判定以 Node 发布版本 + CHANGELOG 已修 CVE 为准。
    - **分层覆盖（按层，不是优先级）**：① 运行时层（`process.versions` 采集 + Node CHANGELOG 判定）→ ② apk 层（`apk info -v` + secdb / OSV）→ ③ SBOM + trivy / grype（OS 包批量；对 tarball Node 与内嵌依赖不可见，不能替代 ①）。
  - **其余前置评估点**：扫描工具的引入成本（镜像体积 / CI 时长 / 许可证）与结果噪声；误报与豁免口径（与 `pnpm-workspace.yaml` 的 `audit.ignore` 如何统一）；与 `check-node-version.mjs` 静态基线的关系（动态发现 → 提 PR 抬升基线，而非替代基线）。
  - **触发条件**：下一次 Node / Alpine 安全公告；或需要为被管理仓库新增运行时告警源时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **PR Check 三源信号的 provider 原生日志富化（待评估）** —— 现象：M43.2 已完成三源（Checks + Commit Statuses + Deployments）归一化、聚合状态与失败源清单，但失败详情只到 provider / 信号层，**无 provider 原生 API 日志**（D2 裁定首批不做，留后续增量）。待评估点：是否接入 Vercel / Cloudflare / GitHub Actions 的原生失败日志拉取（需 provider 凭据承载面 + 配额控制 + 输出脱敏 + 单行 JSON 膨胀控制）。触发条件：用户报告「信号已失败但无日志可看」时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`alerts.vue` 存在一处闲置的 `useFixNow()` 解构（待评估）** —— 现象：`apps/platform/app/pages/alerts.vue` 顶部解构 `{ fixingRunId, fixError, fixSuccess, triggerFix }` 但全文件未使用（真正的「立即修复此仓库」入口在子组件 `alert-run-sidebar.vue`），伴随的注释也仍在描述已抽走的流程；该孤立实例同样不消费后加的 `fixMerged`。
  - **待评估点**：① 直接删除该解构 + 收敛注释（零行为风险）；② 或反向确认是否存在未接线的预期入口（若存在则补齐而非删除）。
  - **触发条件**：下次改动 `alerts.vue` 时（该文件已处 max-lines warning 带，顺带减法更划算）。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **扫描偏好服务端跨设备默认（延后，保留待评估）** —— **来源**：[issue #136](https://github.com/dependfix/dependfix/issues/136)（该 issue 的设备级需求已随 M37.2 交付，2026-10-15 关闭；本条保留其范围外的服务端默认部分）。设备级方案 C 混合（localStorage：上次选择 + 可选配置化默认 + 重置）已落地；服务端用户 / 组织级默认偏好（跨设备、可管理，需实体 / API / 设置页，预计触发 governance 文档）按用户 2026-10-06 决策延后。**现状锚点**：`apps/platform/app/composables/use-scan-preferences.ts`。触发条件：① 用户实测多设备切换痛点；② 组织级统一默认诉求。

- **`repo-history-dialog` history 模式与 legacy `/repos/[id]/runs` 页疑似无入口死代码（待评估）** —— 现象：全仓仅 `scans.vue` 以 `:query-key="'run'"` 挂载 `repo-history-dialog`；`repos.vue` 的历史入口已改为跳 `/scans?repository=`，故组件的 history 模式（list 视图 / 「返回列表」分支 / `queryKey='history'` 默认值）当前**不可达**；legacy 页 `app/pages/repos/[id]/runs.vue` 亦无站内链接（其注释引用的 backlog 删除候选已不存在）。
  - **待评估点**：① 删除 history 模式分支 + 收敛组件为单一 run 模式（减法）；② 或恢复 history 挂载点（若确有按仓库浏览历史的需求，可复用扫描页 `/scans?repository=` 路径）；③ legacy `/repos/[id]/runs` 页是否随 history 模式一并删除。
  - **触发条件**：组件 / 页面维护（如再次改动 `repo-history-dialog`）；或用户要求清理死代码。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`platform-scheduled-batch.md` 设计快照端点表 / 实体清单陈旧（待评估）** —— 现象：设计稿 `docs/design/governance/platform-scheduled-batch.md §6.1` 的定时计划 CRUD 端点表未登记新增的 `GET /api/schedules/monitor-status`（只读总开关状态端点），§3.1 实体清单仍无 `Schedule.kind` 列。该稿状态为「🔶 设计先行」快照，若后续被当作 API 契约参考会漏看新端点。
  - **待评估点**：① 是否将 design 快照视为需持续同步的契约（补 §6.1 端点表 + §3.1 实体字段）；② 或明确定位为「时点快照」并在阶段归档时统一回填。
  - **触发条件**：后续以该文档为 API 契约参考产生歧义；或用户要求同步设计稿。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`scans.vue` / `alerts.vue` / `repos.vue` 体量超 `max-lines` 上限（待评估）** —— 现象（2026-10-24 `wc -l` 实测）：`apps/platform/app/pages/scans.vue` 1001 行、`alerts.vue` 900 行、`repos.vue` 840 行，均 >800 触发 `max-lines` warning。当前 lint 以 `--max-warnings 10` 通过，未阻断。
  - **待评估点**：① 抽取运行列表筛选工具栏（模板约 60 行）为独立组件，或抽 `exportLogs` 到 composable；② 是否一并治理 `alerts.vue` / `repos.vue`；③ 是否收紧 `max-lines` 阈值或引入 per-file 例外。
  - **触发条件**：三页继续增长致 warning 逼近上限；或用户要求清理。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **列表页筛选 / 分页能力的共享抽取（待评估）** —— 现象：`repos.vue` 与 `batch-runs.vue` 各自实现客户端筛选 + 重置 + 内建分页（形态相近但字段与语义不同），`scans.vue` 另有按仓库客户端分页实现；三处筛选 / 分页样板重复。展示口径统一批次（M42.5）判定两页形态尚未完全一致，故先页面内实现。
  - **待评估点**：① 抽取 `useClientTableFilter`（搜索关键字 + 筛选态 + 重置 + 过滤结果）的收益与形态约束；② 或仅抽「搜索 + 重置」最小面；③ 与组件内建分页的边界（分页本身不抽）。
  - **触发条件**：第四处列表页需要同类能力时；或筛选逻辑变更需多处同步时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **扫描页「全部运行」表按开始时间排序 + 时间区间筛选（待评估，P2 🎨，2026-10-30 用户需求）** —— 来源：用户对 `/scans` 页截图提出「表格希望支持排序，至少支持开始时间列；筛选加上按时间区间（按仓库 tab 下的参照处理）」。
  - **现状与根因（分析结论，未改代码）**：① 「全部运行」表是**服务端分页**——`apps/platform/app/pages/scans.vue:754-767` 用 `lazy` + `:total-records` + `@page`，`runs` 只含当前页 `pageSize` 行（默认 10），`/api/runs` 固定 `order: { createdAt: 'DESC' }`（`server/api/runs/index.get.ts:94`）且**无排序参数**，`runListColumns`（`scans.vue:468-478`）无一列标 `sortable`；② 「按仓库」tab 能排序是因为它消费**全量数组** `summary.repositories` 后再由组件内建排序 / 分页（`scans.vue:456-462` 的 `sortable: true` + `:page/:rows` + `@page`）；③ **不能照搬该形态**——caomei DataTable 只有 `manualPagination`（`node_modules/caomei-ui/dist/components/data-table/data-table.js:300`），排序恒为客户端 TanStack 排序本地 `data`（`:197-260`，无 `manualSorting`），lazy 下点表头只会重排当前 10 行（假排序）；正确形态是受控排序（`sortField` / `sortOrder` / `@sort`，`dist/components/data-table/types.d.ts:201-209`）+ 服务端 `orderBy`；④ 时间区间可**一处两生效**——`GET /api/runs` 与 `GET /api/runs/logs-export` 共用 `runsFilterSchema` + `buildRunsWhere`（`server/utils/runs-query.ts:44-110`），但导出文件头 `describeFilters`（`logs-export.get.ts:32-45`）需同步补；⑤ 参照口径修正：**「按仓库」tab 自身没有时间区间控件**（只有「最近状态」下拉 + 窗口提示，`scans.vue:616-628`），平台内唯一现成先例是环境事件页 `from` / `to`（`env-events.vue:48-51`、`:148-158`、`:246-260`，`datetime-local` → 前端转 ISO → 请求带参），runs 侧需驱动 refetch 而非本地 computed。
  - **范围（预计 9-10 文件，2026-10-30 `rg -n` 定位实测；测量方：执行角色）**：`apps/platform/app/pages/scans.vue`（`filters` 增 `from`/`to`、`hasActiveFilters`/`clearFilters`/`watch(filters)` 复位、`fetchRuns` 与 `exportLogs` 的 query、列 `sortable`、受控排序绑定与 `@sort`、翻页保留排序参数）；`apps/platform/server/utils/runs-query.ts`（schema 增 `from`/`to` + `from <= to` 校验，`buildRunsWhere` 用 `MoreThanOrEqual`/`LessThanOrEqual`）；`server/api/runs/index.get.ts`（`sortBy`/`sortOrder` 白名单 + `order` 映射，缺省仍 `createdAt DESC`）；`server/api/runs/logs-export.get.ts`（筛选描述与导出排序与列表同源）；`apps/platform/i18n/locales/{zh-CN,en-US}.json`（新标签与错误文案）；测试 `server/api/runs/index.get.test.ts`、`server/api/runs/runs-logs.test.ts`（文件头筛选描述）、`tests/e2e/scans.e2e.test.ts`、`tests/e2e/sortable.e2e.test.ts`。
  - **待评估点**：① 排序字段白名单：仅 `startedAt`，还是连 `createdAt` / `finishedAt` / 告警数 / 已修复一起；缺省序是否仍 `createdAt DESC`（避免上线即改变既有列表观感）。② 时间维度语义：`startedAt`（开始时间，可空——`entities/scan-run.ts:82-83`）还是 `createdAt`（入队时间）；`pending` / `running` / 旧数据无 `startedAt` 时，区间过滤与排序 NULL 位置（建议 NULL 不命中区间、排序恒排末尾）。③ 顶部 4 卡与「按仓库」聚合是否也应用区间（`scan-history/summary` 固定 `SUMMARY_RUN_LIMIT = 500` 窗口）：联动会改写「总运行数」语义，不联动则出现「列表已筛、卡片未筛」的口径分裂。④ 「导出全部筛选结果」是否随区间收窄（影响 `MAX_EXPORT_RUNS = 100` 的 413 边界与菜单文案）。⑤ 控件形态：`datetime-local`（env-events 先例）还是快捷区间（24h / 7d / 30d）+ 自定义；本地时区 → ISO 转换与 `d()` 展示口径一致。⑥ 是否与既有候选「列表页筛选 / 分页能力的共享抽取」同批抽 composable，避免再添一处样板。
  - **验收标准（草案）**：① 点击「开始时间」表头 → 请求带 `sortBy=startedAt&sortOrder=asc|desc`，跨页顺序正确（第 1 页末条时间 ≥ 第 2 页首条），再次点击可回到默认序（三态归零口径待定）；② 设定 `from`/`to` → 请求带 ISO 参数、`total` 与可见行同时收窄、自动回第 1 页、翻页保留参数、「清除筛选」复位；③ 非法区间（`from > to` / 非 ISO / 超长）→ API 400 且前端有可读提示，单测覆盖；④ 导出当前页 / 全部：文件头含 `# 筛选：from=...` / `# 筛选：to=...`，导出集合与顺序与列表同源（抽样断言）；⑤ `apps/platform` e2e（scans + sortable 用例）全绿。
  - **不做**：不改 `/api/runs` 既有返回结构（保持 `{items,total,page,pageSize}`）；不改「按仓库」tab 的「最近状态」筛选语义；不做多列排序；不动 `repo-history-dialog` / 运行详情 dialog 的取数。
  - **风险与依赖**：① `startedAt` **无索引**（`BaseEntity` 仅 `createdAt` / `updatedAt`，`ScanRun` 上 `@Index` 只覆盖 `repositoryId` / `status` / `batchRunId`）→ 排序与区间为全表扫描 + 排序，当前 500 运行规模可接受，需在条目内写明升索引的触发阈值。② 缺省序若改成 `startedAt DESC`，历史 NULL `startedAt` 行位置会突变。③ 本批会让 `scans.vue` 继续增长，与既有候选「`scans.vue` 体量超 `max-lines`」相互放大，宜同批抽筛选区子组件或明确接受 warning。④ 文件数约 10 > 5，按 [设计文档硬阈值](../design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement) 「建议有」设计稿，实施时视是否触碰 API 契约而决定。⑤ 关联候选：条目「列表页筛选 / 分页能力的共享抽取」、「`scans.vue` / `alerts.vue` / `repos.vue` 体量超 `max-lines`」。
  - **触发条件**：用户确认该交互进入排期；或下次改动 `/api/runs` 查询面 / 扫描页筛选区时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **设置页严重级别查找与展示标签 helper 收敛（待评估）** —— 现象：`settings.vue` 内联实现 `find((option) => option.value === x)?.label ?? x`，与展示口径单一事实源的 helper 等价；该批次判定其已满足「同源查找」故未动。
  - **待评估点**：① 收敛到同一 helper（需处理设置页使用本地 computed 选项数组的差异）；② 或保持等价实现并注明。
  - **触发条件**：选项数组结构变更时；或设置页重构时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **镜像白名单：企业私服自带独立 CDN 域的补录（待评估）** —— 现象：镜像源动态发现只覆盖「配置面 registry 键的 host」；企业私服 tarball 若 302 到**独立 CDN 域**（与 registry 不同域），该域不在预置清单内 → 仍被 deny-by-default 拦截（交付时已登记为已知限制，需显式 `DEPENDFIX_ALLOWED_DOMAINS`）。
  - **待评估点**：① 是否按 302 `Location` 自动补录 CDN 域（可从审计记录观测补录）；② 或维持显式配置；③ 自动补录的安全边界（是否需用户确认）。
  - **触发条件**：出现企业私服 CDN 域被拦的实例；或用户要求自动化。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **归档索引表格行的成对错位强调（`**；**` 形态，待评估）** —— 现象：`docs/plan/archive/index.md` 的 M16 / M17 等历史归档行内含 `` `**；**` ``（成对但无强调语义，渲染为加粗分号），系早期批次书写惯例遗留；此类 `**` 计数为**偶数**，`check-docs` 的 `emphasis` 规则按定义只覆盖**未配对**（奇数计数）形态（[文档规范 §2](../standards/documentation.md) 已把「成对但语义错位」声明为显式盲区）。
  - **待评估点**：① 是否统一清理（涉及多行同形，宜独立批次以保持归档排版一致）；② 或维持现状并在规范注释中作为盲区实例保留。
  - **触发条件**：归档索引再次批量编辑时；或用户要求清理归档排版。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **归档目录内 file-dead 相对链接前缀治本（待评估）** —— 现象：`docs/plan/archive/**` 的历史相对链接存在**目录前缀错误**（如从 `docs/plan/archive/` 引出 `../standards/…` 或 `../../design/governance/…`，实际应为 `../../standards/…` / `../../docs/design/governance/…`）；`check:docs` 的 links 面（file-dead）对该目录整体豁免（见 [md-walk 决策注释](../../scripts/shared/md-walk.mjs)），故长期不可见。
  - **待评估点**：① 是否对归档目录做一次路径前缀重指（使 `archive-anchors` 的跨文档锚点子集真正生效，消除该永久盲区）；② 或维持豁免并保留注释登记为既定边界。
  - **触发条件**：归档链接前缀批次立项；或用户要求清理归档死链。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **经验归档分片范围声明口径与段序（待评估）** —— 现象：分片命名存在两套口径——`experience-archive-§70-§99-delivery-platform.md` 按「建立时规划上界」命名（实际内容仅至 `## 七十二、`），而 `§1-§21` / `§49-§69` 等按**实测内容范围**命名；另 `experience-archive-§29-§35-integration.md` 内 `## 三十二、` 段排在 `## 二十九、` 之前（段序异常，范围本身齐备）。M44.3 已把 `§49` 分片的「文件名 / H1 / 内容范围」三方对齐，本条为同源剩余口径。
  - **待评估点**：① 统一「分片范围 = 实测内容范围」还是「= 建立时规划上界」并写入分片维护约定；② 段序是否按编号归位。
  - **触发条件**：新增 / 扩容经验分片时；或用户要求清理归档排序。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`caomei-ui-migration.md` 存量超标的保序拆分（待评估）** —— 现象：`docs/design/governance/caomei-ui-migration.md` 940 行（治理设计阈值 ≤400 / 强制分片 >700），由 [check-doc-size 豁免表](../../scripts/check-doc-size.mjs) 逐条登记（理由：阈值入表时即超标、入链面广、§15 迁移实证需保序）。本批已产出拆分方案：**主文档保留 §1-§11**（实测 387 行 + 分片索引，仍 ≤400）、**分片 A = §12-§14**（上收触发条件 / 关联文档 / 文档元数据）、**分片 B = §15.1-§15.10**（169 行）、**分片 C = §15.11-§15.15**（339 行）（§15 内部按子节保序切分，三处分片均 ≤400）；落点命名 `<slug>-<主题>.md` 同级；拆分后须移除豁免表条目并重指入链（§15 被 experience-archive / caomei-ui-migration 迁移评估 §15.x 等引用）。
  - **待评估点**：① 是否按上述方案执行（独立内容治理批次）；② 或维持豁免（当前状态）并在豁免理由中保留「待该批次落地后移除此条」。
  - **触发条件**：启动独立内容治理批次时；或该文档再次增量更新时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`architecture.md` 技术选型表含未采用的 momei 复用项（待评估）** —— 现象：`docs/design/governance/architecture.md` §技术选型表列出「监控 | Sentry（`@sentry/nuxt`）| momei」「PWA | `@vite-pwa/nuxt` | momei」等条目，而在全仓无依赖声明与源码引用（M44.6 已核对 `apps/platform/{package.json,nuxt.config.ts,app,server}`；`docs/design/governance/architecture.md` 等文档级提及属复用参考表，非声明）。该表有「来源」列显式标注 momei（属复用参考而非「当前已采用」断言），但读者可能误读为现状。
  - **待评估点**：① 加一句口径说明（表为 momei 复用参考，未采用项不在此表承诺）；② 或对未采用项加「未采用 / 暂缓」标注（Sentry 见 [第三方可观测性评估](../research/2026-10-27-third-party-observability-evaluation.md)，winston 行对应同文档 §现状：平台 logger 已实现但未接线）。
  - **触发条件**：下次改动 `architecture.md` 或技术选型复核批次。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`docs/standards/ai-collaboration.md` 已处 200 行健康上界（待评估）** —— 现象：该文档当前 200 行（`docs/standards/*.md` 阈值：≤200 健康 / 201-400 warning），M44 归档批次新增审计条款时因越界被迫改落 `testing.md §6.12`。**待评估点**：① 下次需扩条时先做结构压缩（合并同源小节）；② 或按 [文档规范 §3](../standards/documentation.md#_3-文档行数阈值) 拆分子文档（如「审计协议」独立篇）。**触发条件**：下次需向该文档新增条款时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **M44 蒸馏新增条款的检查点挂接与配套收敛（待评估）** —— 现象：M44 阶段归档批次蒸馏新增 12 条严格约束（`planning.md §4.4` 第 16-20 条 / `testing.md §6.12` / `documentation.md §6` 五条），但 `code-quality-checklist.md` 的「规范条款 review 检查点矩阵」与 `code-auditor.agent.md` 必查项**均无对应行**（R1 分区 B 审计标记为「待补挂」）；另有 2 条 pattern 未落任何权威文档（「门禁规则扩面前先跑一次性探针量化分布」「E2E 取证临时仓库不要软链 node_modules」），及 3 处新条与既有条款主题重叠（`documentation.md §6` 量化断言 ↔ `planning.md §2.5`；`documentation.md §6` 引用范围措辞 ↔ 同节覆盖面声明；`planning.md §4.4` 第 18 条 ↔ 第 3 条）。
  - **待评估点**：① 矩阵 / agent 必查项补挂（建议至少覆盖 §4.4 第 16/18 条、`testing.md §6.12`、`documentation.md §6`「断言复现运行期真实条件」「非门禁面缺陷」）；② 2 条未落点 pattern 补写落点（或改判废弃）；③ 3 处重叠改为交叉引用收窄。
  - **触发条件**：下次改动上述规范文件 / 文档门禁扩面 / 阶段归档批次。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **独立 installer 容器 / runtime 工具链移出（待评估，P2 🛡️ 安全 / 🚀 体积）** —— 背景（2026-10-18）：runtime 阶段补 `python3 make g++` 以支持目标仓库原生模块的 `node-gyp` 回退；审计实测同 digest 基础镜像下 content size +约 110MB、`docker images` disk +约 421MB（`/usr` +约 303MB），同时扩大了不可信仓库可用的编译面。工具链本身也不是充分条件：node headers / prebuild 源需可达，部分模块另需 `linux-headers`（当前未装）。
  - **待评估点**：① 是否把安装依赖拆到独立 installer 容器 / 阶段（只在该阶段保留工具链，主 runtime 仍只含 `.output`）；② 若保留在 runtime，是否补 `linux-headers` / 预置 node-gyp headers 缓存，并加镜像体积门禁；③ 与 pnpm store 持久化事项（本阶段已上收）的卷 / 缓存策略联动。
  - **触发条件**：镜像体积 / 安全评审要求收敛编译面；或再次出现「预编译包下载失败 + 缺 headers / 工具链」的原生构建失败。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`ai-collaboration.md` / `platform.md` / `git.md` 均处 200 行上限的瘦身（待评估）** —— 现象：三文件行数均恰为 200（规范健康窗口上限），本批增补未越线但已零余量，任何后续增补都会进入 warning 带。**待评估点**：① 逐文件找可合并 / 可下沉段（重复表述、历史注记、可由设计稿承载的实现细节）；② 是否把长期稳定段迁入 design 后留一行指针；③ 瘦身不得删除 hard requirement 的唯一权威声明。**触发条件**：任一文件需再次增补时（先瘦身再增补）。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **仓库级 `allowMajorUpgrade` 开关（待评估，P2 🚀）** —— 现象：平台侧硬编码 `false`，跨 major 告警一律跳过；M46.2 已做披露但未放开升级（源候选在 M46 上收时保留的残余点）。
  - **待评估点**：① 仓库级开关（默认关）+ 完整验证 + AI 研判兜底；② 与交付守卫 / 基线的交互；③ 风险阈值与回滚边界。
  - **触发条件**：用户要求自动处理跨 major；或跨 major 告警占比持续升高。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **升级探针合批与门禁回滚粒度联动（待评估，P2 🛠️）** —— 现象：M46.3 已做基线完整链与按变更单元回滚，但未做探针合批；合批会改变回滚单元、验证次数与失败回退语义。
  - **待评估点**：① 合批后的回滚单元（batch vs probe）；② 与 `verificationBlocking` 归因的衔接；③ 失败回退逐包的语义保持。
  - **触发条件**：单仓安装次数成为主要耗时；或回滚粒度仍不足。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **执行资源采集覆盖面扩展（待评估，P2 🛠️）** —— 现象：M46.4 已采集 Linux cgroup v2/v1 内存上限 / 峰值 / `oom_kill`，但宿主级 OOM（未设容器 limit）不保证被 cgroup 捕获；sandbox / github-action 执行器未接入采集；容器 `executeRun` 抛错时监控快照丢弃；Redis 同步降级时 HTTP 进程也会执行安装，启动探测无法预知。
  - **待评估点**：① 宿主 OOM 与 `journalctl -k` / `dmesg` 的关联口径；② sandbox / action 执行器的资源面；③ 异常路径快照保留；④ 同步降级信号接入启动 / 运行提示。
  - **触发条件**：OOM 再次发生且 cgroup 标记无法解释；或 sandbox / action 成为主执行路径。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

**2026-10-27 决策**：本地日志已上收 M49 追加临时待办（不占编号）；Sentry 官方 SaaS；Axiom 后续；其余 1.0 后。P 标签仅表优先级，新增 P1 未纳入 1.0 分档。

- **平台 Sentry 错误 / 性能 / 日志接入（P1 🛠️，官方 SaaS，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：官方 Sentry SaaS 补齐错误、性能（transaction + LCP / CLS / INP）与 warn/error 日志，无 DSN 零出网。**范围**：`@sentry/nuxt`、client/server config、`sourcemaps.disable`、`shared/utils/sanitize.ts` 抽取、≤10 处生命周期日志、脱敏。**验收**：① 无 DSN 零出网；② 浏览器 / API 500 / worker 异常带 release / commit / route；③ token / Cookie / URL / OAuth `code`·`state` 不进入事件与日志；④ `dataCollection` 关闭 URL query / GraphQL；⑤ Web Vitals 与采样率 env 可调；⑥ sourcemaps 默认关闭；⑦ 全量门禁通过。**不做**：Replay、source map 上传、CLI / Action 遥测、Umami / Clarity / GA / 百度、consoleLoggingIntegration。**依赖**：SaaS 项目与 DSN；Nuxt 4.6 兼容性 D 阶段验证。**交付物**：4-6 commits / 10-15 files / 500-800 行。**风险**：采集面宽 → 显式关闭 + 脱敏。

- **Axiom 远程日志聚合（P2 🛠️，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：本地日志统一后按需把 warn/error 与关键事件推到 Axiom。**范围**：`@axiomhq/winston`、动态 import、Axiom env、异常转发、runId / jobId、脱敏单测。**验收**：① 未配置零出网；② 配置后可按 runId / jobId 检索；③ 不重复推送 `MemoryLogger`；④ 脱敏通过。**不做**：不重做本地日志；不迁移全部 console。**依赖**：本地日志统一完成；Axiom 账号。**交付物**：3-5 commits / 8-12 files / 300-500 行。**风险**：成本 → 只推 warn/error；ESM → 动态 import。

- **平台健康检查与外部 uptime 接入（P2 🛠️，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：进程死亡 / 容器未启动 / DB 不可用可发现。**范围**：`Dockerfile` HEALTHCHECK、`deployment.md` 探针口径、鉴权 `/api/health/details`。**验收**：① `docker inspect` healthy；② liveness 200 / readiness 异常非 200；③ 文档可复现；④ 公开端点无新增敏感字段。**不做**：不暴露 DB / Redis 细节；不绑定商业服务；不改运行模型。**交付物**：2-3 commits / 5-8 files / 150-250 行。**风险**：误判 → start-period + 重试；信息面 → 详情鉴权。

**2026-10-28 发布门禁残余**：

- **release.yml 补齐 prod 依赖审计阻断（P1 🛡️）** —— `test.yml` 有 prod 阻断 + 全量信号，`release.yml` 不含审计 → 审计红的提交仍可发版。**目标**：release 与 Test 审计口径一致。**范围**：release 增加 blocking（同 [security.md §5.6](../standards/security.md)）与全量信号。**验收**：① 阻断步骤日志含审计结果行；② registry 不可达 exit 0 不假绿；③ 本地 / CI 基线各一次。**不做**：不改命令与 ignore。**交付物**：1 commit / 1-2 files / 20-40 行。
- **release 构建范围与 Test 对齐（P2 🛠️）** —— release 只跑 `pnpm run build`（packages），Test 含 platform 构建 → 平台构建失败只在 Docker 阶段暴露。**目标**：发布前可发现或登记边界。**范围**：release build 对齐或 release.md 记录理由。**验收**：① 破坏 platform 构建时前置门禁失败（或边界有据）；② 发布时长增量 < 2min。**不做**：不改 Docker 链。

**2026-10-29 发布工具链残余**（不占阶段编号）：

- **CHANGELOG 新鲜度门禁（P2 🛠️）** —— 现象：`verify-changelog` 只校验版本段存在，发布提交若在 changelog 生成后又有新 commit，段内会缺条目但门禁仍绿（2026-10-29 实测：发布提交的根级 CHANGELOG 缺其父提交条目）。**目标**：发布前能发现「版本段存在但内容陈旧」。**范围**：`verify-changelog` 增加可选 `--max-lag`（比较段内最后 commit 与 HEAD 距离）或发布流程在 `changelog` 后强制 clean 检查；`release.yml` 接线。**验收**：① changelog 后新增 commit 时门禁非零；② 正常发布不误报；③ CI 基线一次。**不做**：不改 changelog 生成算法。**交付物**：1 commit / 3-5 files / 80-150 行。

- **本地发布通道不执行发布前安全门禁（P1 🛡️，M49.5 发现）** —— `check:release-security` 只接在 `release.yml`；本地备用通道 `pnpm release:publish --otp` 无门禁调用，0.6.0 即经该通道发布（门禁脚本存在但未执行）。**目标**：任一路径发布前都跑同一门禁。**范围**：`release-publish` 内调用门禁（或拒绝无 `--skip-security` 之外的绕过），[release.md](../guide/release.md) 备用通道步骤同步。**验收**：① 无 token / 有 critical 时本地发布中止；② `--skip-security` 需显式且记录理由；③ CI 通道行为不变。

- **0.6.0 发布物 `--version` 报 0.1.0（P0 🛡️，随 0.6.1 修复）** —— `packages/cli/src/cli/runner.ts` 的 `meta.version` 曾硬编码 `0.1.0`，`npx dependfix@0.6.0 --version` 实测返回 0.1.0；修复 `8fd83fc3`（读 `package.json` + 包名校验 + 兜底 `0.0.0-unknown` + 一致性用例）已提交、未推送未发布。**触发**：0.6.1 发布后复核 `npx dependfix@latest --version` 与全局安装。

- **0.6.0 发布后 master 3 连绿窗口未完成（P0 📚，G4 起点）** —— 发布提交 `efaa555f` 的 Test run `40744772890` success（E2E / Coverage / Visual 同步 success），但此后仅 1 次；G4 要求连续 20 次 push 绿或 2 周无红。**触发**：后续 push 累计；任一次红需按 §5.6 / G4 口径记录归因。

- **Docker `platform-0.4.0` tag 与镜像 health 待复核（P2 🚀，M49.5 残余）** —— `workflow_dispatch` `40745976335` 的 QA 与 smoke 步骤 success（哨兵 build-arg → `/api/health` 端到端），多架构推送与 ACR / Jenkins 步骤在归档时仍在执行，`updatedAt` 停滞于 2026-10-28T18:35:56Z（疑似挂起）。**目标**：确认 `platform-0.4.0` tag 存在且镜像可启动。**验收**：① 三 registry 均有该 tag；② `docker run` 后 `/api/health` 200；③ run 结论 success。

- **通知严重级别标签的跨 runtime 单点化（待评估，P3 🛠️）** —— 现象：`Critical` / `High` 标签存在三处口径——`apps/platform/app/utils/scan-options.ts`（前端单一事实源）、`apps/platform/server/services/notification/business-templates.ts`（邮件模板 zh / en 各一份）与 i18n 模板占位符；服务端无法直接 import app 层 util，M50.2 只能保证前端与 i18n 侧同源。**待评估点**：① 是否下沉到 `packages/core` 共享常量并让邮件模板消费；② 或维持现状（前端单点 + 服务端注释互指 + 用例锁定）；③ 与 i18n 占位符拼接口径的关系。**触发条件**：再次改动通知文案，或新增第三处严重级别消费方。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **邮件传输超时与周报节拍约束显式化（待评估，P2 🛠️）** —— 现象：`apps/platform/server/services/mailer/transport.ts` 的 `SMTPTransport.Options` 未声明 `connectionTimeout` / `socketTimeout` / `greetingTimeout`，当前靠 nodemailer 默认值（socket≈10 分钟）与周报 15 分钟检查间隔的隐式大小关系兜底；M50.3 引入重入守卫后，若某次发送永不 settle 且默认值或节拍被改动，周报会永久停摆（旧行为只是噪声）。**待评估点**：① 是否显式声明三个超时并在注释里锁定「必须小于周报检查间隔」；② 是否在启动期做一次配置断言（超时 < 节拍），失败 warn；③ 与平台请求超时 / 队列预算的口径是否统一。**触发条件**：调整周报节拍 / nodemailer 升级 / 再次出现周报停摆。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

**2026-10-30 批量运行超时复盘派生**（来源：`runs-logs-20261030-000646.txt` 第 1 页 10 条运行，2 条 `execution_timeout` + 1 条无日志失败；不占阶段编号）：

- **修复前基线与修复后验证的双跑成本收敛（待评估，P2 🚀）** —— 现象：momei 单仓 30m04s（基线 20m14s → 合批验证 5m10s → 逐包 4m31s 后 abort）、rss-impact-server 单仓 35m38s（基线 18m36s → 后验证 16m53s），**两次运行的修复产出均为 0**（一次合批回滚、一次跨 major 跳过 + lockfile 已合规）。根因候选三条：① `ensureVerificationBaseline` 以「有告警」判 `hasWork`（`packages/engine/src/app/repo-fix-finalize.ts:37`），「有告警但修不了 / 跨 major 跳过」仍采样基线并跑完整后验证；② `quickVerifyProject` 不接收基线（`packages/engine/src/helpers/index.ts:93`），对基线已红的命令逐包重跑；③ 后验证链对 0 写入运行无短路。**待评估点**：① `hasWork` 是否改判「本次实际产生写操作 / 待执行修复数 > 0」；② quick-verify 与后验证是否按基线跳过「已知红」命令（只留痕不阻断）及由此丢失的「该命令新失败」检出如何披露；③ `noChanges` 豁免目前只覆盖「无告警」形态，是否扩展到「0 写入」。**验收标准（草案）**：构造「有告警但 0 写入」仓库 → 日志不再出现基线采样与后验证全链；构造「基线 lint 红」仓库 → 逐包验证不再执行该命令、且不因它回滚正确升级；两次运行耗时下降有前后对照数据（同一仓库同规模告警）。**不做**：不降低验证链覆盖面（跳过仅限基线已红命令，且必须在报告单列）。**触发条件**：批量运行再次出现「0 修复但耗尽单仓预算」；或调整验证链预算口径时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **Nuxt / 框架类仓库默认验证链缺 `prepare` 前置（待评估，P2 🛠️）** —— 现象：momei 的 `quick-verify` 执行默认 `pnpm lint` 时 ESLint OOM（`Mark-Compact` 至约 1.95GB 后 `FATAL ERROR: Ineffective mark-compacts near heap limit`，GC 挣扎约 4 分钟才退出），与 `packages/engine/src/helpers/index.ts:86-90` 注释已记录的形态一致：默认链 `install → lint → build → typecheck → test` 中 lint 早于 build，`.nuxt/tsconfig.json` 尚未生成。平台侧该仓库未配置 `verifyCommands`，故走默认链。**待评估点**：① 引擎默认链是否在探测到 `nuxt.config.*` 时插入 `nuxt prepare`（影响全部仓库链口径）；② 或平台在新建 / 导入仓库时按框架写入 `verifyCommands` 模板（不污染默认链）；③ monorepo 根脚本形态（`pnpm -r --filter "./packages/*" lint`）下 prepare 应落在根还是各成员；④ OOM 的子进程退出应否作为独立诊断信号（当前只表现为 `exit code 1`）。**验收标准（草案）**：Nuxt 仓库在无自定义配置下 lint 不再 OOM；prepare 步骤失败有独立日志与报告条目。**不做**：不为单个仓库硬编码框架判断（探测失败须安全回退默认链）。**触发条件**：再次出现框架前置步骤缺失导致的 OOM / 假红。

- **验证 checkpoint 创建失败静默降级（待评估，P2 🛡️）** —— 现象：momei 运行中 `[rollback] failed to create verification checkpoint for CaoMeiYouRen/momei (versioned-override:moment): Command failed: git stash create ...`，引擎仅 `warn` 后继续应用 `moment` override（`packages/engine/src/app/verification-checkpoint.ts:96-104`）。影响：后续所有逐包升级在**无回退基线**状态下进行，失败后无法回到干净工作区；既有 `ROLLBACK_GRANULARITY_DEGRADED` 类别在该路径未发射。**待评估点**：① 失败原因分类（`git stash create` 写失败 / `index.lock` 残留 / 非 git / 磁盘或权限）并区分「可继续」与「应中止」；② 是否发射 `ROLLBACK_GRANULARITY_DEGRADED` 审计并计入报告；③ checkpoint 不可用时是否禁止后续写操作（fail-closed）还是仅降级并持续告警。**验收标准（草案）**：人为制造 `git stash create` 失败 → 报告出现粒度降级条目且不静默继续；正常路径仍每单元一个 checkpoint。**触发条件**：再次出现 checkpoint 创建失败，或运行结束留有半截工作区。

- **运行日志导出缺失败归因字段（待评估，P3 🛠️）** —— 现象：`api/runs/logs-export.get.ts` 只导出 `logsJson`，失败运行无日志时仅输出「（无执行日志）」；`errorJson.code`（`orphan_run` / `container_unavailable` / `orchestration_failed` / `execution_timeout`）、`failureStage` / `failureKind`、`resourceJson`（`oomKilled` / `peakRss`）与 build 回执均未导出，离线复盘无法归因（本次 push-all-in-cloud 失败即无法判定）。**待评估点**：① 是否在每个 run 小节标题下追加 error / failure 三列（无则省略）；② 无日志时是否追加 `resourceJson` 摘要与 build 回执；③ 与 `MAX_EXPORT_BYTES` 上限的关系（增量远小于日志正文）。**验收标准（草案）**：导出含一条 `execution_timeout` 运行 → 文件里可见其错误码与阶段；无日志运行 → 可见失败归因而非空白。**触发条件**：下次离线复盘失败运行。

- **PR 正文 `Upgraded Dependencies` 表 `From` 恒空 + `Strategy` 误标 `direct`（待评估，P2 🛠️，2026-10-30 用户实测）** —— 现象：真实 PR `CaoMeiYouRen/tinyfish-mcp#83` / `#78`、`cmyr-skills-agents#17`、`cookie-cloudflare#82`、`better-bytes#246`、`picgo-plugin-optimization#151` 的该表 `From` 列全部空白、`Strategy` 列一律 `direct`（6/6 命中，2026-10-30 逐 PR `gh pr view --json body` 实测，测量方：执行角色）。**根因（已定位，未修改代码）**：① 这些行全部来自「版本化 overrides」路径——告警 `manifestPath === 'pnpm-lock.yaml'` → `packages/engine/src/app/repo-fix.ts:334-470`，PR diff 只改 `pnpm-workspace.yaml#overrides` + `pnpm-lock.yaml`（`cookie-cloudflare#82` 的 To 为 `^6.28.1, ^7.29.1`，是该路径 `targets.join(', ')` 独有形态），而该路径在 `repo-fix.ts:413`（dry-run）/ `:470`、`packages/engine/src/app/repo-fix-batch.ts:106`、`packages/engine/src/fixers/dependency/index.ts:571` 一律写 `fromVersion: ''`（原设计口径：多实例无单一来源版本）；② 渲染层 `packages/engine/src/github/pr-creator.ts:662-663` 用 `u.fromVersion ?? '-'`，空串原样输出成空单元格，`packages/core/src/report/markdown-generator.ts:236` / `:481` 同病（报告侧 `Repositories` 表 `From` 同样空白）；③ `pr-creator.ts:650-658` 的策略映射缺 `versioned-override` 分支，落默认值 `direct`，掩盖「只钉 overrides、manifest 声明未动」的事实（审计误导性高于空白本身）；④ `aggregateUpgradeActions`（`pr-creator.ts:522-528`）合并同键 action 时只更新 `toVersion` / `isMajor` / `strategy`，未按注释「from 取最早的起点」回填 `fromVersion`，首个空值动作会让后续真实值失效。**修复素材已在手**：`readExistingOverrides(ctx.workDir)`（`repo-fix.ts:365`，旧 override 值）与 `readLockfileVersions(lockfilePath, packageName)`（`repo-fix.ts:341`、`helpers/index.ts:189`，旧锁定版本），无需新增 lockfile 读取。**待评估点**：① 数据侧在 action 记录真实旧值（含多实例形态，如 `4.13.9 → ^4.13.11`、`^4.7.9 → ^4.7.10`），还是仅在渲染侧把空串降级为 `—` / `n/a (overrides)`；② `versioned-override` 的展示文案（如 `pnpm overrides (versioned)`）与报告 / PR 正文是否同源；③ 聚合合并是否回填 `fromVersion`（取首个非空值）；④ 是否同步修正报告 markdown 的 `From` 列（同一空串口径）。**验收标准（草案）**：① 构造「lockfile 告警 → 版本化 overrides」运行 → PR 正文该行 `From` 非空或显式 `—`、`Strategy` 不再显示 `direct`；② 构造「直接依赖 manifest 升级」运行 → 行为不回退（`pr-creator.test.ts:1241-1242` 仍绿）；③ 同一包先空值后真值的动作序列 → 聚合行 `From` 取到真值；④ 报告 markdown `Repositories` 表与 PR 正文口径一致。**不做**：不改变版本化 overrides 的修复语义 / 写盘位置 / 提交面白名单判定；不为填 `From` 新增 lockfile 解析调用。**触发条件**：下次改动 PR 正文或报告渲染层；或用户要求修复该展示口径时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **en-US 设计文档全量镜像（P2 📚，2026-10-30 M52 规划登记）** —— 现状：en 设计镜像仅 4 篇，zh 设计文档 67 篇（含 M44.4 拆分分片）；M52.3 只做「结构映射 + 索引补全」，不重译全文。待评估：1.0 后是否按「分片 → 镜像」逐篇补齐（成本随拆分增加、双维护风险高），或长期维持映射清单 + 关键路径翻译。触发：1.0 后文档国际化需求，或用户反馈英文站信息不足时。
### 待上收候选（评估完成，等待用户决策）

> 本节为「评估完成、等待用户决策」候选的暂存区；候选**不含 `M\d+` 阶段编号**（[规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)）。

- **`git-signing.ts` 更名为 `git-isolation.ts`（待评估）**（P3，🛡️ 治理）—— 背景：该模块已承载「签名 + hooks」双语义（4 个隔离常量），但文件名仍只表达「签名」。
  - **本批已闭环的部分**：决策点「是否在 `docs/standards/git.md §3.8` 扩展 hooks 隔离子节」已于 2026-10-13 M43.5 落地——§3.8 改为「签名 + hooks，commit / push 双向隔离」单表 + 4 常量清单 + push 侧 `--no-verify` 口径；`code-quality-checklist` 对应矩阵行同步扩展。
  - **待评估点**：是否将 `packages/engine/src/github/git-signing.ts` 更名为 `git-isolation.ts` 并同步 `github/index.ts` re-export（公开 API）、平台侧 import、测试与 `git.md §3.8` 的路径引用。**未纳入 M43.5** 的理由：触及公开 API re-export 与平台侧多处 import，宜单独批次以保持改动面可控。
  - **触发条件**：下次改动该模块 / 公开 API 面时；或治理批次收敛模块命名时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **孤儿清理终态被迟到 worker 覆盖（待评估）**（P2 🛡️ 技术债）—— 现象：清理侧以「条件更新（WHERE status IN pending/running）」把 run 置 `failed` 后，仍在执行的 worker 若随后完成，`runScanInternal` 的最终 `save` 会整行写回，可能把终态覆盖为 `completed` / `failed`；当前以 active 锁过期 + job remove 降低概率，未根治。**关联**：[队列僵尸任务终结与去重键释放设计 §9](../design/governance/queue-stale-recovery.md#_9-边界与残余风险)。
  - **待评估点**：① 编排层最终写库改为条件更新（仅当库中仍为 `pending` / `running`）；② 或在 `save` 前重读状态并短路；③ 与 `reuse` / `force-fail` 路径的兼容（复用路径需要重置终态字段，不能简单短路）。
  - **触发条件**：再次出现清理后终态被覆盖的实例；或下一次队列可靠性批次。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **批次级「继续执行未完成项」入口（待评估）**（P2 🎨 用户体验）—— 背景：2026-10-18 用户报告宿主机重启导致批量任务中断，明确希望「至少给用户一个选项：直接结束还是继续执行」；同批已落地 P0（僵尸任务终结 + 去重键释放 + 触发自愈 + worker 慢重试），用户裁定本入口作为后续批次，形态选**批次级继续执行**（否决「新状态 + 启动弹窗」与「仅保留单条重试」）。
  - **待评估点**：① 入口落点（失败批次行内按钮 vs 展开详情）与二次确认文案；② 重启范围（仅 `orphan_run` / transient 且未完成子项 vs 全部失败子项）；③ 承载形态（复用 `executeBatchRun` 创建新 BatchRun 保留审计链 vs 复用原批次）；④ 与现有单条 `POST /api/runs/[id]/retry` 的关系（是否抽取共享「未完成项」判定）。
  - **触发条件**：用户要求该交互；或再次出现宿主机重启后的批量恢复诉求。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

### 延期 / 暂缓项

- **T705 生产级部署**（PostgreSQL + Helm；Sentry 已拆出为独立候选，见上文）—— 2026-08-12 用户指示暂缓排期
- **自托管 Umami 流量统计**（P3 🎨，1.0 后暂缓）—— 管理台用户量小，Sentry 路由 transaction 已覆盖页面访问与性能；流量来源 / 留存价值不足以抵消额外服务与脚本成本。触发：需要产品级使用分析且 Sentry 数据不足，或平台转为多租户 SaaS。详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **C30 Publish Docker build job 失败排查** —— 2026-08-18 用户决策暂缓（双平台构建 23m 2s 成功证明当前 docker.yml 可稳定工作）；恢复条件：① master 分支 push 频率显著提升；② 镜像实际发布成为强需求（v1.0.0 正式发布前）；③ 用户明确恢复
- **caomei-ui 0.x → 1.0 升级回归** —— 库处于 0.x（平台当前 `0.6.0`，2026-10-11 由 dependabot 升级、2026-10-12 完成升级回归，见 [caomei-ui-migration.md §15.15](../design/governance/caomei-ui-migration.md#_15-15-caomei-ui-0-6-0-升级回归实证-插队热修-2026-10-12)）。**剩余观察**：`1.0.0` 发布后的正式升级回归与「平台需跟进新组件能力」「用户明确恢复」两条触发条件。届时按 M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration.md)）做回归；**升级回归的像素兜底已就位**（视觉回归基线 `apps/platform/tests/visual/`，覆盖 alerts / repos / pr-checks / dialog-import-repos / login，口径见 [测试规范 §6.7](../standards/testing.md)）
- **ScanResult 数据层去重（upsert 唯一索引）** —— 决策暂缓：应用层去重（fingerprint + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）已实施且满足当前业务需求；恢复条件：出现"fix 复用同一 `scan_run_id` 跨次刷新"或"历史 fixStatus 跨次保留"需求时迁移到数据层 upsert

- **仓库级执行预算与超时配置**（P2 🚀🛠️，1.0 门槛批次暂缓）—— 2026-10-30 用户裁定 **B：不在本批上收，随 1.0 门槛批次一起排期**。设计稿已定稿（D1 封顶默认 60 分钟且可配置 / D2 权限沿用 `admin/org_admin` / D3 与 PUT partial 修复同批，AC1-AC9 与批 1-2 文件清单齐备）：[仓库级执行预算与超时配置设计](../design/governance/repo-execution-limits.md)。恢复条件：1.0 门槛批次启动，或用户明确授权上收；上收前不得进入 D 阶段。

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

## 待人工验收（真实环境，随可用性推进）

> 以下条目为需真实环境（外部凭据 / 真实 Redis / staging 等）的验证任务，保留随可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
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

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

## 已知边界与 known-issue

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

### 全量 vitest 偶发失败（单次未复现，持续观察）

- **背景**：2026-10-14 M44.4 批次② 的一次全量 `pnpm test` 出现失败，但输出被调用方截断、失败明细未捕获；随后同一工作区（仅文档与注释变更）连续多次复跑均全绿，未能复现（按 [AI 协作规范 §4.7](../standards/ai-collaboration.md) 阶段 3 登记根因观察项）。
- **持续观察项**：① 再次出现时须捕获完整失败明细后定位（首要假设：vitest worker 并发 / 资源竞争；其次：既有时序敏感用例）；② 长期不复现则维持观察。
- **触发条件**：再次出现同形失败（本地或 CI）。

### 平台 e2e 偶发等待超时（scan-config / repos-crud，持续观察）

- **背景**：2026-10-26 M49.2a 依赖升级后连续两次运行 `pnpm --filter @dependfix/platform test:e2e`，`scan-config.e2e.test.ts` 的「扫描偏好：记住上次选择（重开 + 刷新生效）」均为 1 flaky（等待仓库行可见超时，重试通过）。M49.2b 升级 nuxt 4.6.2 后：第一轮除 scan-config 外新增 1 例 `repos-crud.e2e.test.ts`「删除仓库：列表移除」flaky（重试通过）；第二轮仅 scan-config flaky，其余 204 例全绿。
- **持续观察项**：① scan-config 超时点在 `openScanConfig` 的 `.caomei-data-table__row` 可见性（15s）；② repos-crud 为删除后列表刷新时序。首要假设均为 SSR hydration / 行渲染时序，其次为上一轮 e2e 数据库残留导致列表排序漂移；再次出现时保留 `test-results/` 的 error-context 与截图后定位。
- **触发条件**：运行 `apps/platform` e2e（`test:e2e`）时再次命中上述用例。

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

### 依赖安全补丁的 overrides 钉定（vue-i18n 家族 / seroval，持续观察）

- **背景（2026-10-29）**：prod 阻断审计因 `vue-i18n` 家族（`GHSA-83rm-6c8r-g728`，high）与 `seroval`（`GHSA-f86p-h4j2-7qgj` / `GHSA-9wx9-5pv9-3349`，moderate）失败；advisory 声明的最小修复版本为 `vue-i18n` 家族 11.4.14、`seroval` 1.6.11（`GHSA-f86p-h4j2-7qgj` 的 patched 是 1.6.11，`GHSA-9wx9-5pv9-3349` 为 1.6.10）。
- **处置**：仅在 [pnpm-workspace.yaml](../../pnpm-workspace.yaml) `overrides` 按上述版本线钉定（`vue-i18n` 与 `@intlify/*` 用 `^11.4.14`，`seroval` 用 `~1.6.11` 收在同一 minor）；未使用 `audit.ignore` 豁免，未改动 `minimumReleaseAge`（该配置单位为分钟，本场景不构成解析障碍）。
- **范围事实**：`seroval` 钉在 `~1.6.11`（latest 已到 1.7.x，跨 minor 不会被自动采纳），`vue-i18n` 家族钉在 `^11.4.14`；同范围内的新补丁由 `pnpm update` 正常跟进，跨 minor 或放宽范围需要人工修改此处。
- **复核条件**：上游在 `vue-i18n` 家族或 `seroval` 发布新的安全修复时，评估升至该版本并同步此条；连续两个发布周期无新 advisory 时可评估放宽为上游范围。
- **触发条件**：周回归 / 依赖升级 / 审计失败定位到上述包时。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | **M52 文档平价与验证收口（1.0-F2）** — 4 原子 + 1 批追加临时待办，见 [todo.md](todo.md)；插队容量治理见 [planning.md §3.1.1](../standards/planning.md) |
| 下一阶段（已授权，待规划） | **G 发布工程**（M53；台账见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M51 已归档；M52 进行中；G 待规划） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
