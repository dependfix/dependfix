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

> **候选池概览（2026-11-16 M62 规划后复算）**：本区 **35 项**（`### 候选评估中` 段内 `^- \*\*` 逐行计数）；每次上收 / 新增 / 移出后按段内实测更新本句与首行，不保留历史链路。P 标签覆盖不全（未标注者评估时补，不默认升级）；1.0 分档见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)。
> **1.0 门槛与分档**：分档、门槛判定与批次计划单点声明于 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)（2026-10-30 冻结口径，不随候选上收收缩；本文件不重复维护数字）。

- **备份 `.tmp` 清扫缺年龄门槛（P3 🛠️，2026-10-31 M53.2 收口登记）** —— `cleanupOldBackups` 对 `*.bak.tmp` 无条件回收；单实例串行路径不可达冲突，但并发 `db:restore` 或多实例共卷启动时可能删掉对端正在写的临时文件（rename ENOENT → 该轮快照丢失，fail-open 后仅剩日志）。待评估：加入 `mtime < now - 10min` 年龄门槛或按 PID 命名临时文件。触发：启用多实例 / 多容器共享数据卷，或出现并发恢复需求时。
- **`check:release-security` 输出缺少采集时点（P3 🛠️，2026-11-03 预发布检查发现；2026-11-08 复核）** —— 告警汇总行与 PASS / FAIL 行都不带采集时间，落盘为发布证据时无法自证时点（只能靠文件 mtime 推断）；脚本当前无 `--json` 模式。**范围**：输出首行加 ISO 时间戳。**验收**：输出含采集时点，单测锁定。**不做**：不改告警判定与 fail-closed 语义、不新增 `--json`。**触发条件**：下次改动该脚本，或再次需要以该输出作为发布证据。
- **镜像构建冗余（P2 🚀，2026-11-07）** —— ① 每架构对三 registry 各构建一次（digest 相同，冷缓存最慢 41m32s）；② 发布提交被 push 与派发各构建一次。待评估：单次多 name 推送 / 复用 digest / push 腿跳过 release 提交。
- **PR 回环有界重试（P2 🚀，2026-10-30 M51.3 用户裁定延后）** —— 设计稿 `pr-feedback-loop.md` §8 保留 `FeedbackRetryDispatcher` 契约（同 PR 失败后重新触发既有修复链，需配额与触发面）；平台当前无「同 PR 重试」入口，`retryFailed` 开启时每仓库每进程只 warn 一次。待评估：补触发面（API / UI）+ 配额后再实施。触发：出现「PR 红后无人处理、需自动重试」的实际需求时。
- **门户面板左缘亚像素抖动（P2 🧪，2026-10-31 M52.4 收口登记）** —— `dialog-select-open-dark` 基线在连续 `--update-snapshots=all` 下约 1/10 轮出现 99 px / maxΔ2 的边缘窄带差异（bbox x 476-483 × y 303-723，位于门户面板左缘），低于门禁（`maxDiffPixels` 100 / `threshold` 0.1 → maxDelta 352）但仅剩 1 px 预算。已排除「update 落帧不稳定」这一主因（`waitForVisualStable` 已加两帧一致检查，全量集合 3/3 恒定）。待评估：定位面板定位的亚像素来源（门户定位取整 / 滚动条宽度），或对该基线改用元素级取景。触发：该基线偶发红，或差异放大到接近 / 超过 100 px。
- **验证跳过的交付可观测性（残余：`deliverySkips` 家族登记；P3 🎨，2026-11-09 更新）** —— 报告 `Verification Skipped` 段 + Summary 行、平台运行详情「验证跳过」与按原因 tooltip 已落地（`budget` / `no-write` 可区分），「修了 N 条、交付 0 条」可从报告与详情直接判读。残余：是否需要在 `deliverySkips` 家族里登记该跳过原因（当前独立 `verificationSkippedByReason`）。触发：出现「跳过原因需在交付载体（issue / 草稿 PR）中体现」的反馈时。
- **平台侧交付载体（issue / 草稿 PR，P2 🎨）** —— 引擎 `fix-and-pr` 已按基线红档位产出载体（issue / 草稿 PR），平台执行链（`fix + commit` + `platform-delivery`）目前只记录 `summary.deliverySkipped*` 并在运行列表 / 详情展示；待评估：平台在交付决策处复用同一失败指纹开 issue / 创建草稿 PR，并补仓库级配置写入面（当前仅 env `DEPENDFIX_ON_BASELINE_RED`，UI / API 不暴露）。触发：平台用户反馈「基线红只有标签、没有可跟踪载体」时。口径见 [pr-delivery-closure.md §16.7](../design/governance/pr-delivery-closure-history.md#_16-7-已知边界)。
- **镜像脚本只覆盖根 scripts 单一形态**（M48.2 边界）—— `pnpm --filter` / 递归 / env 前缀 / corepack 钉定只披露不执行；触发：目标仓库 CI 大量使用这些形态导致「本地假绿」再现。
- **白名单内运行前未提交改动的归属**（M48.4 边界）—— 白名单内文件（典型 `package.json`）若在运行前已有用户改动，会与本次修复一并提交；触发：出现「PR 混入无关改动」的用户反馈时评估。
- **`pnpm_audit` 的 token-free 回退意图与实现不一致（P2 🛡️）**—— `pnpm-audit.tool.ts` 注释与产品意图是「无 GitHub token 或 403 场景」的本地回退，但实现保留 `requireToken()`，缺失 `GITHUB_TOKEN` 时直接返回 `ok:false`；当前 README / tool description 已按实际行为修正。待评估：移除 `requireToken()`（或改为可选 token），补无 token 用例，恢复真正回退。触发：无 token 环境需要 pnpm-audit 回退时。

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

- **扫描偏好服务端跨设备默认（延后，保留待评估）** —— **来源**：[issue #136](https://github.com/dependfix/dependfix/issues/136)（该 issue 的设备级需求已随 M37.2 交付，2026-10-15 关闭；本条保留其范围外的服务端默认部分）。设备级方案 C 混合（localStorage：上次选择 + 可选配置化默认 + 重置）已落地；服务端用户 / 组织级默认偏好（跨设备、可管理，需实体 / API / 设置页，预计触发 governance 文档）按用户 2026-10-06 决策延后。**现状锚点**：`apps/platform/app/composables/use-scan-preferences.ts`。触发条件：① 用户实测多设备切换痛点；② 组织级统一默认诉求。

- **镜像白名单：企业私服自带独立 CDN 域的补录（待评估）** —— 现象：镜像源动态发现只覆盖「配置面 registry 键的 host」；企业私服 tarball 若 302 到**独立 CDN 域**（与 registry 不同域），该域不在预置清单内 → 仍被 deny-by-default 拦截（交付时已登记为已知限制，需显式 `DEPENDFIX_ALLOWED_DOMAINS`）。
  - **待评估点**：① 是否按 302 `Location` 自动补录 CDN 域（可从审计记录观测补录）；② 或维持显式配置；③ 自动补录的安全边界（是否需用户确认）。
  - **触发条件**：出现企业私服 CDN 域被拦的实例；或用户要求自动化。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **独立 installer 容器 / runtime 工具链移出（待评估，P2 🛡️ 安全 / 🚀 体积）** —— 背景（2026-10-18）：runtime 阶段补 `python3 make g++` 以支持目标仓库原生模块的 `node-gyp` 回退；审计实测同 digest 基础镜像下 content size +约 110MB、`docker images` disk +约 421MB（`/usr` +约 303MB），同时扩大了不可信仓库可用的编译面。工具链本身也不是充分条件：node headers / prebuild 源需可达，部分模块另需 `linux-headers`（当前未装）。
  - **待评估点**：① 是否把安装依赖拆到独立 installer 容器 / 阶段（只在该阶段保留工具链，主 runtime 仍只含 `.output`）；② 若保留在 runtime，是否补 `linux-headers` / 预置 node-gyp headers 缓存，并加镜像体积门禁；③ 与 pnpm store 持久化事项（本阶段已上收）的卷 / 缓存策略联动。
  - **触发条件**：镜像体积 / 安全评审要求收敛编译面；或再次出现「预编译包下载失败 + 缺 headers / 工具链」的原生构建失败。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **升级探针合批与门禁回滚粒度联动（待评估，P2 🛠️）** —— 现象：M46.3 已做基线完整链与按变更单元回滚，但未做探针合批；合批会改变回滚单元、验证次数与失败回退语义。
  - **待评估点**：① 合批后的回滚单元（batch vs probe）；② 与 `verificationBlocking` 归因的衔接；③ 失败回退逐包的语义保持。
  - **触发条件**：单仓安装次数成为主要耗时；或回滚粒度仍不足。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

**2026-10-27 决策**：本地日志已上收 M49 追加临时待办（不占编号）；Sentry 官方 SaaS；Axiom 后续；其余 1.0 后。P 标签仅表优先级，新增 P1 未纳入 1.0 分档。

- **平台 Sentry 错误 / 性能 / 日志接入（P1 🛠️，官方 SaaS，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：官方 Sentry SaaS 补齐错误、性能（transaction + LCP / CLS / INP）与 warn/error 日志，无 DSN 零出网。**范围**：`@sentry/nuxt`、client/server config、`sourcemaps.disable`、`shared/utils/sanitize.ts` 抽取、≤10 处生命周期日志、脱敏。**验收**：① 无 DSN 零出网；② 浏览器 / API 500 / worker 异常带 release / commit / route；③ token / Cookie / URL / OAuth `code`·`state` 不进入事件与日志；④ `dataCollection` 关闭 URL query / GraphQL；⑤ Web Vitals 与采样率 env 可调；⑥ sourcemaps 默认关闭；⑦ 全量门禁通过。**不做**：Replay、source map 上传、CLI / Action 遥测、Umami / Clarity / GA / 百度、consoleLoggingIntegration。**依赖**：SaaS 项目与 DSN；Nuxt 4.6 兼容性 D 阶段验证。**交付物**：4-6 commits / 10-15 files / 500-800 行。**风险**：采集面宽 → 显式关闭 + 脱敏。

- **Axiom 远程日志聚合（P2 🛠️，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：本地日志统一后按需把 warn/error 与关键事件推到 Axiom。**范围**：`@axiomhq/winston`、动态 import、Axiom env、异常转发、runId / jobId、脱敏单测。**验收**：① 未配置零出网；② 配置后可按 runId / jobId 检索；③ 不重复推送 `MemoryLogger`；④ 脱敏通过。**不做**：不重做本地日志；不迁移全部 console。**依赖**：本地日志统一完成；Axiom 账号。**交付物**：3-5 commits / 8-12 files / 300-500 行。**风险**：成本 → 只推 warn/error；ESM → 动态 import。

- **平台健康检查与外部 uptime 接入（P2 🛠️，1.0 后）** —— 详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。**目标**：进程死亡 / 容器未启动 / DB 不可用可发现。**范围**：`Dockerfile` HEALTHCHECK、`deployment.md` 探针口径、鉴权 `/api/health/details`。**验收**：① `docker inspect` healthy；② liveness 200 / readiness 异常非 200；③ 文档可复现；④ 公开端点无新增敏感字段。**不做**：不暴露 DB / Redis 细节；不绑定商业服务；不改运行模型。**交付物**：2-3 commits / 5-8 files / 150-250 行。**风险**：误判 → start-period + 重试；信息面 → 详情鉴权。

**2026-10-29 通知与邮件残余**（不占阶段编号）：

- **邮件传输超时与周报节拍约束显式化（待评估，P2 🛠️）** —— 现象：`apps/platform/server/services/mailer/transport.ts` 的 `SMTPTransport.Options` 未声明 `connectionTimeout` / `socketTimeout` / `greetingTimeout`，当前靠 nodemailer 默认值（socket≈10 分钟）与周报 15 分钟检查间隔的隐式大小关系兜底；M50.3 引入重入守卫后，若某次发送永不 settle 且默认值或节拍被改动，周报会永久停摆（旧行为只是噪声）。**待评估点**：① 是否显式声明三个超时并在注释里锁定「必须小于周报检查间隔」；② 是否在启动期做一次配置断言（超时 < 节拍），失败 warn；③ 与平台请求超时 / 队列预算的口径是否统一。**触发条件**：调整周报节拍 / nodemailer 升级 / 再次出现周报停摆。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

**2026-10-30 批量运行超时复盘派生**（来源：`runs-logs-20261030-000646.txt` 第 1 页 10 条运行，2 条 `execution_timeout` + 1 条无日志失败；不占阶段编号）：

- **Nuxt / 框架类仓库默认验证链缺 `prepare` 前置（待评估，P2 🛠️）** —— 现象：`quick-verify` 默认链 `install → lint → build → typecheck → test` 中 lint 早于 build，`.nuxt/tsconfig.json` 未生成，ESLint 在约 2GB 堆上限 OOM（momei 两次复现，GC 挣扎 4-5 分钟）。待评估：① 探测 `nuxt.config.*` 时插入 `nuxt prepare`；② 或在仓库创建 / 导入时按框架写 `verifyCommands` 模板；③ monorepo 根脚本下 prepare 的落点；④ OOM 是否作为独立诊断信号（命令级 OOM 独立诊断信号已随 M62.2 上收，本候选不重复验收）。验收（草案）：Nuxt 仓库默认链 lint 不再 OOM，prepare 失败有独立日志与报告条目。不做：不为单仓硬编码框架判断（探测失败安全回退）。触发：再次出现框架前置缺失导致的 OOM / 假红。

- **契约抽取器覆盖 `@Column(() => X)` 嵌入列与 env 解构（P3 🛠️，2026-10-31 M53.1 收口登记）** —— `check-contract-freeze` 的实体抽取覆盖 `@Column` 系列 / `@ManyToOne`+`@JoinColumn` / `@Entity`，遇到 `@Embedded`、`@ManyToMany` join table、env 解构与非字面量 `readEnv` 实参已 fail-closed（`extractor-coverage`），但**无 `@Embedded` 的 `@Column(() => X)` 嵌入列**未进哨兵：抽取会产出错误列名并与清单产生差异（响亮失败，不会静默漏键）。待评估：扩展抽取器（递归嵌入类型 / `getMetadataArgsStorage` 元数据）或把该形态纳入 fail-closed 哨兵。触发：仓库首次引入嵌入实体或该形态列。
- **en-US 设计文档全量镜像（P2 📚，2026-10-30 M52 规划登记）** —— 现状：en 设计镜像仅 4 篇，zh 设计文档 67 篇（含 M44.4 拆分分片）；M52.3 只做「结构映射 + 索引补全」，不重译全文。待评估：1.0 后是否按「分片 → 镜像」逐篇补齐（成本随拆分增加、双维护风险高），或长期维持映射清单 + 关键路径翻译。触发：1.0 后文档国际化需求，或用户反馈英文站信息不足时。

**2026-11-13 运行日志复盘派生**（来源：`runs-logs-20261113-045612.txt` 第 1 页；不占阶段编号）：

- **peer-only 同 major 修复回退到 manifest 直接依赖（P2 🛠️，2026-11-13 登记）** —— 现象：`rss-to-memos-sync` 的 vite 8.3.1 → ^8.3.3 属同 major，经 versioned overrides 应用后验证提示 `peer-only instances do not follow pnpm overrides`，回滚并按「无写入」收尾；`sharp-cloud-uploader` 在 2026-11-06 同一形态（8.1.0 < 8.1.6，override 未生效）。现有路径只在 overrides 层面尝试，未回退到「提升声明该包的 manifest 直接依赖」，因此同 major 可修告警也交付不了。**待评估点**：① override 未覆盖 peer-only 时改为提升根 / 成员 manifest 的直接依赖（含锁定范围与回滚单元）；② 或稳定输出「需人工」并附具体文件与版本建议；③ 与 `peer-only` / `override-protected` skipped 口径及「无写入」结论的关系。**触发条件**：再次出现同 major 可修但 overrides 失效（peer-only / 非依赖树可达）。

**2026-11-16 运行日志复盘派生**（来源：`runs-logs-20261116-043236.txt` 第 1 页 50 条运行，1 次 `push_failed` + 1 次 `execution_timeout` + 1 次 `sandbox_unavailable`；不占阶段编号）：

- **默认出站白名单补 `release-assets.githubusercontent.com`（P2 🛡️，2026-11-16 登记）** —— 现象：`momei` 11-13 baseline 记录 `outbound blocked by allowlist: CONNECT release-assets.githubusercontent.com:443`；`DEFAULT_ALLOWED_DOMAINS` 仅有 `github.com` / `api.github.com` / `objects.githubusercontent.com` / `raw.githubusercontent.com`。影响：走 GitHub Release 资产下载的安装 / 构建被拦；容器模式只记违规，沙箱 fix 模式会 `network_violation` 直接 failed。**待评估点**：① 加入单域（最小面）还是 `*.githubusercontent.com`；② 白名单扩面后的审计噪声与安全评审口径。**验收标准（草案）**：① 受影响仓库 baseline 不再出现该 CONNECT 拦截；② 负例（非白名单域）仍被拦并落 audit。**不做**：不放开任意 `*.githubusercontent.com`（除非评审通过）。**触发条件**：再次出现 GitHub Release 资产下载被拦；或沙箱 fix 因该域失败。

- **无补丁版本告警与 advisory 区间口径（P3 🛠️，2026-11-16 登记）** —— 现象：`deepmerge` 在 dependfix / push-all-in-cloud / momei / caomei-ui / rss-impact-server 反复出现，`first_patched_version=null`、range 4.2.0–4.3.1，升级永远修不了；另 `belowTarget` 含 advisory 范围外实例（minimatch 3.1.5 / 3.1.4、5.1.9 低于 >=7.0.0 下界），当前不影响结论但污染跳过计数。**待评估点**：① 为 `first_patched_version=null` 提供「无修复版本」结论 / 建议 dismiss，而不是每天 blocked；② 与报告「未修复」明细的关系（`belowTarget` 的 advisory 区间过滤已随 M62.3 上收，本候选不重复验收）。**验收标准（草案）**：① 无补丁版本告警有稳定结论且不重复刷屏；② 报告可判读。**不做**：不自动 dismiss 上游告警（需用户策略）。**触发条件**：同包无补丁告警连续多轮出现。

- **checkpoint `unknown` 失败的重试与证据（P3 🛠️，2026-11-16 登记）** —— 现象：dependfix ×3 + sharp-cloud-uploader 均报 `unknown — git stash create exited with code 1`，probe 未发现 index.lock / 权限 / 磁盘问题；已知 `git stash create` 对索引锁会静默 exit 1，probe 在失败后才跑，锁可能已释放。影响：仅失去单元级回滚（本页相关 run 多为 0 写入）。**待评估点**：① `unknown` 先重试一次（250ms 后）再降级；② 证据补 `git version` / 并发 git 提示；③ 与 checkpoint 降级口径的关系。**验收标准（草案）**：① 瞬时索引竞争不再落 `unknown`；② 真降级仍可判读；③ 选择性回滚用例零回归。**不做**：不把 `unknown` 升级为 abort。**触发条件**：`unknown` 连续出现或伴随真实回滚失败。

- **关闭 PR 的修复分支清理与 `push_failed` 细分（P2 🛠️，2026-11-16 登记）** —— 现象：本次 P0 已让同指纹残留分支可 lease 覆盖，但关闭 / supersede 的 PR 仍保留 `dependfix/auto-fix-*` 分支，持续占用远端命名；`push_failed` 继续固定 `deliver` + `unknown`（[run-failure-taxonomy §7](../design/governance/run-failure-taxonomy.md#_7-风险与开放问题) 决策），non-FF / auth / network 不可区分，需人工翻 `error.message`。**待评估点**：① PR 关闭 / supersede 时自动删除自有分支（或纳入 `cleanup-branches-auto` 的清理批次）；② push stderr 按 non-FF / auth / network 细分（仅在明确前缀时映射，避免脆弱解析）；③ 与「关闭 PR 不消耗尝试额度」口径的关系。**验收标准（草案）**：① 关闭 PR 后无残留自有分支（或有清理记录）；② `push_failed` 至少区分 non-FF / auth / network 三类；③ 非自有分支零误删。**不做**：不自动关闭 / 合并 PR；不解析非自有分支。**触发条件**：再次出现同指纹残留分支，或 `push_failed` 连续两轮仍需人工翻日志。

**2026-11-13 阶段容量再平衡移出**（来源：M59 同日三批插队命中 §3.1.1 阈值 1，用户确认移出；不占阶段编号）：

- **沙箱镜像双架构自包含冒烟与安全姿态（P2 🚀📚）** —— 目标：镜像内 sandbox 自包含入口在 amd64 / arm64 可运行并发版后自动取证；安全姿态单一口径成文。范围：`smoke-test.sh` 增 sandbox 入口断言（`node /app/sandbox/bin.mjs --version` + `skills doctor`），构建期冒烟与 `post-release-smoke` 共用并写 Job Summary；三篇 sandbox 设计稿翻转 fix 放行后状态；`deployment.md` 补运行面提示。验收：① 双架构冒烟通过（无窗口记未证实），注入回归证明灵敏；② Job Summary 含断言结果且失败仅告警；③ 设计稿无 stale；④ `gates:docs` 通过。不做：不改镜像架构 / QEMU；不重建历史镜像；不引入 rootless 之外的新隔离机制。依赖：M59.1/M59.2、M58.4 冒烟与巡检。触发：M59.1/M59.2 闭环后或需 arm64 取证时。

- **沙箱 fix 的 undici 直连外联纳入连接级拦截（评估 `NODE_USE_ENV_PROXY`）**（P2 🛡️）—— 背景：2026-11-13 M59.1 落地运行级审计代理后，尊重代理 env 的工具（pnpm / git / npm CLI）已被 deny-by-default 拦截；Node 内置 fetch / undici 默认不读代理 env，此类直连只能靠命令输出 URL 提取留痕（仅 audit、不构成违规，见 [security.md §5.3.1](../standards/security.md)）。
  - **待评估点**：① Node 24+ `NODE_USE_ENV_PROXY=1` 对 `fetch` / undici 的实际覆盖范围与副作用（需最小对照实验）；② 对未支持该开关的 Node 版本的回退策略（注入全局 dispatcher 需改被测仓库代码，不可行）；③ 是否只对沙箱 fix 路径启用，避免影响 CLI 本地运行。
  - **触发条件**：出现「恶意依赖脚本用 fetch 外带数据」的实际案例；或 Node 版本基线统一到 24+ 之后。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **外联审计在既有代理环境下的注入失效可见化**（P3 🛡️）—— 背景：2026-11-13 M59.1 的运行级审计代理在宿主/容器已有 `HTTP(S)_PROXY` 时不覆盖用户代理（稳定性优先），此时 deny-by-default 不生效，但平台第二道闸仍按配置判「策略就位」。
  - **待评估点**：① 在结果 / 运行详情标注「代理未被注入（环境已有代理）」；② `NO_PROXY` 语义统一（2026-11-14 现状：`runTrackedCommand` 已改为调用方值优先、不再注入回环；`verification-runner` 仍置空）——评估是否改为并集；③ 是否对沙箱 fix 路径强制要求「注入生效」（拒绝在既有代理环境运行）。
  - **触发条件**：部署环境统一经过企业代理 / 网关时；或需要按 run 统计「审计实际覆盖面」时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **沙箱 install 网络不可达的快速失败与预算透传**（P2 🛠️，2026-11-14 线上 `execution_timeout` 复盘登记）—— 背景：沙箱容器不继承宿主 `~/.npmrc`，直连 `registry.npmjs.org` 被阻断时 `pnpm install` 停在 TCP 连接阶段（ETIMEDOUT）而非快速失败；随后 `lint / build / typecheck / test` 每条命令各自耗满命令超时，最终整仓 `execution_timeout` 且结果缺失。已交付 `SANDBOX_NPM_REGISTRY`（注入 `pnpm_config_registry` / `npm_config_registry` + 自动并入白名单）与超时输出回传。
  - **待评估点**：① 安装前对生效 registry 做 5s 连通性预检（容器内 TCP 探测），不可达即报可读错误而非进入安装；② 把平台执行预算（`deadlineAt`）透传给容器内 CLI，让验证链在预算见底时主动收口并回传部分结果；③ 外层 `withTimeout` 触发（adapter 卡死）时同样带回已捕获输出。
  - **触发条件**：出现除 npm registry 之外的安装源不可达案例（私有 registry / 代理环境），或再次出现「超时但结果缺失」的运行。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **执行子进程的环境变量硬化（平台密钥 denylist / 基线 env 白名单）**（P1 🛡️，2026-11-14 插队修复登记）—— 背景：`runTrackedCommand` 恢复「继承父进程环境」后，container 执行器下目标仓库的 install / 验证 / 交付脚本可见平台进程 env（`NUXT_ENCRYPTION_KEY` / `AUTH_SECRET` / `DATABASE_*` / `SMTP_*` 等），与 [安全规范 §5.3](../standards/security.md) 「平台密钥不进执行进程」冲突。此为 M59.1 之前的既有暴露面，本次修复回归而非新开口。
  - **待评估点**：① 以 denylist（`NUXT_*` / `AUTH_SECRET` / `DATABASE_*` / `SMTP_*` / `DEPENDFIX_AI_*`）在基线 env 派生处过滤，保留 `PATH` / `HOME` / registry / store / 代理键；② 是否改为白名单派生（更严，但需枚举所有依赖 env 的工具链变量）；③ sandbox 执行器已是精选 env，是否把 container 路径对齐同一注入模型。
  - **触发条件**：container 执行器承接第三方 / 不可信仓库；或安全审计把该暴露面列为发布阻断项。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **发布工作流无变更周的空跑短路（P3 🛠️，2026-11-15 定时发布评估登记）** —— 现状：`release.yml` 的 `Auto version & changelog` 在无版本变更时 no-op，但其后的 `lint` / `gates:docs` / `typecheck` / `test` / `build` / `Build platform` / `release:preflight` 仍全量执行；1.0.0 发布 run（`42351775424`）5 分钟为未含 test / build 的旧流程，现行流程预计 20-30 分钟（测量方 = 2026-11-15 评估会话，按 job 步骤清单估算）。定时启用后无变更周将付同额成本。
  - **范围**：把 `release:plan` 探测提前到 install 之前（`node scripts/create-release-plan.mjs` 只读 git 历史，不依赖安装），无计划时输出 skip 并短路后续步骤（或拆 plan job + release job，`needs` 门控）；`workflow_dispatch` 路径必须保持全量执行。
  - **验收标准（草案）**：① 无变更轮次在 install 之前结束，日志含 `::notice::` 跳过原因（以「跳过的 step 数」与 run 时长佐证）；② 探测步骤**不得留下** `release-plan.md`（只读模式；否则 `release:plan` 下次会因文件已存在 exit 1）；③ 有变更轮次与现流程等价（dispatch 跑一次无副作用 run 回归，版本未 bump 时 publish 安全退出）；④ `verify:changelog` 与 `check:release-security` 相对顺序不变（仍在版本提升之后 / 发布之前）。
  - **不做**：不改版本推导与发布判定逻辑；不合并 schedule 与 workflow_dispatch 的步骤集。
  - **触发条件**：启用定时发布（本项为启用前置）。

- **发布链自动更新 major tag（P3 🚀，2026-11-15 登记；用户倾向不实施）** —— **状态**：已决策倾向不实施，仅保留恢复触发条件，不参与本批次上收。背景：GitHub 官方推荐每次发布把 `vN` 移到当前发布提交（major 变更新建 `vN+1`），实测主流 action（`actions/checkout` v7→v7.0.1 / `actions/setup-node` v7→v7.1.0 / `docker/build-push-action` v7→v7.4.0 / `softprops/action-gh-release` v3→v3.0.4 / `pnpm/action-setup` v6 annotated（v6.1.1））均按此维护（复现：`gh api repos/<owner>/<repo>/tags?per_page=5 --jq '.[] | "\(.name) \(.commit.sha[0:10])"'`，2026-11-15 实测）。本项目 2026-11-15 决策采用「具体版本 + Dependabot bump」，`v1` 已冻结在 1.1.0（理由：标签漂移影响可复现性与供应链审计）。
  - **待评估点**：是否在 `release.yml` 增加一步「比较 semver → 仅当新版本是当前 major 内最大版本时 `git tag -fa vN` + force push」；需同时定义幂等（已指向 HEAD 则跳过）、immutable releases 兼容（开启后禁止 force push）、回滚口径（`vN` 回退属破坏性）。
  - **触发条件**：用户希望恢复 `@v1` 滚动便利；或目标仓库数量增长导致逐仓 bump 引用成本不可接受。
  - **验收标准（草案，仅恢复实施时适用）**：① 发布后 `vN` 指向当前 major 内最大版本（semver 比较，非字典序）；② 已指向 HEAD 时跳过（幂等）；③ immutable releases 开启时显式失败并给处置；④ 回滚命令与演练记录成文。
  - **风险与缓解**：可变引用削弱可复现性 → 仅作为便利入口，用户可见示例仍给具体版本；force push 失败留中间态 → 步骤置于 tag 推送之后并 fail-fast。
  - **不做**：不改变现有「具体版本」示例口径；默认不实施。

### 待上收候选（评估完成，等待用户决策）

> 本节为「评估完成、等待用户决策」候选的暂存区；候选**不含 `M\d+` 阶段编号**（[规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)）。

- **`git-signing.ts` 更名为 `git-isolation.ts`（待评估）**（P3，🛡️ 治理）—— 背景：该模块已承载「签名 + hooks」双语义（4 个隔离常量），但文件名仍只表达「签名」。
  - **本批已闭环的部分**：决策点「是否在 `docs/standards/git.md §3.8` 扩展 hooks 隔离子节」已于 2026-10-13 M43.5 落地——§3.8 改为「签名 + hooks，commit / push 双向隔离」单表 + 4 常量清单 + push 侧 `--no-verify` 口径；`code-quality-checklist` 对应矩阵行同步扩展。
  - **待评估点**：是否将 `packages/engine/src/github/git-signing.ts` 更名为 `git-isolation.ts` 并同步 `github/index.ts` re-export（公开 API）、平台侧 import、测试与 `git.md §3.8` 的路径引用。**未纳入 M43.5** 的理由：触及公开 API re-export 与平台侧多处 import，宜单独批次以保持改动面可控。
  - **触发条件**：下次改动该模块 / 公开 API 面时；或治理批次收敛模块命名时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **定时发布启用（2026-11-15 评估完成；用户选方案 A：先发 1.1.0，观察 2 周后启用）**（P2 🚀）—— 启用清单 8 项现状（2026-11-15 实测）：① 1.0 门槛（1.0 已发布，G3 pending / G4 豁免延续）；② 安全告警门禁（本地 PASS，CI 有 `GH_PAT`）；③ Trusted Publisher（1.0.0 OIDC 发布成功）；④ Workflow 权限就位；⑤ **直推 master 未实测**（`gh api` 实测 master 无分支保护，机制可行）；⑥ 版本与日志一致（`verify:changelog` 绿、`release:plan` 可推导）；⑦ 回滚预案未演练；⑧ `v1` 冻结在 `1.1.0`（2026-11-15 决策，不随发布漂移；启用定时发布时无需依赖滚动 tag）。
  - **已知口径**：发布提交 `chore(release): x.y.z [skip ci]` 由 `GITHUB_TOKEN` 推送，不触发 Test / CodeQL / Pages（GitHub 防递归 + `[skip ci]`），发布内容只由 `release.yml` 内部门禁覆盖。
  - **启用前置**：先闭环「发布工作流无变更周的空跑短路」候选；1.1.0 发布后观察 2 周；`on.push` 继续保留注释，待 schedule 稳定后再评估。
  - **回填要求**：首个定时窗口 run id、auto-version 提交 hash、三项未证实项结论写入本条目后再关闭。

- **批次级「继续执行未完成项」入口（待评估）**（P2 🎨 用户体验）—— 背景：2026-10-18 用户报告宿主机重启导致批量任务中断，明确希望「至少给用户一个选项：直接结束还是继续执行」；同批已落地 P0（僵尸任务终结 + 去重键释放 + 触发自愈 + worker 慢重试），用户裁定本入口作为后续批次，形态选**批次级继续执行**（否决「新状态 + 启动弹窗」与「仅保留单条重试」）。
  - **待评估点**：① 入口落点（失败批次行内按钮 vs 展开详情）与二次确认文案；② 重启范围（仅 `orphan_run` / transient 且未完成子项 vs 全部失败子项）；③ 承载形态（复用 `executeBatchRun` 创建新 BatchRun 保留审计链 vs 复用原批次）；④ 与现有单条 `POST /api/runs/[id]/retry` 的关系（是否抽取共享「未完成项」判定）。
  - **触发条件**：用户要求该交互；或再次出现宿主机重启后的批量恢复诉求。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **平台对外只读观测 API + 日志查询 + MCP remote（2026-11-19 用户决策首批范围）**（P1 🚀）—— 背景：平台能力只能在 UI 后使用；且日志交给 AI 要靠手工导出，实测单次 178 KB / 1000 条中 989 条是同一条重复 warn。设计见 [platform-public-api.md](../design/governance/platform-public-api.md)。**用户决策**：首批必须含日志查询；只开只读面；MCP 复用 `@dependfix/mcp` 加 remote 后端。
  - **范围（期 1a，不依赖 API key）**：`shared/log-digest`（清洗 + 归一化分组 + error 不折叠）+ `MemoryLogger` 与沙箱执行器丢弃计数 + `ScanRun.logsDropped` 迁移 + 两处弹窗复制 / 下载增「聚合」档 + 脱敏 fixture。**边界**：1a 只交付「可粘贴」，不交付「免手动」。
  - **范围（期 1b）**：9 个 `GET /api/v1/*` 端点（含 logs 双视图）+ 共享视图层 + `ApiKey` / scope / 限流 / `ApiRequestLog` / 字段白名单 / 分页对象 / 契约守卫 + `docs/guide/api-v1.md`（详见设计稿 §6、§8）。
  - **范围（期 2）**：MCP `local|remote|auto` + 4 个工具走 remote（含 `get_run_logs`）+ `discover_repos` 降级 + 按 `data.code` 的错误映射。
  - **交付物（预估）**：1a 约 6-8 commits / 14-16 files / 700-900 行；1b 约 10-14 commits / 22-30 files / 1,400-2,000 行；期 2 约 4-6 commits / 8-12 files / 500-800 行。
  - **验收（1a）**：fixture grouped < 10 KB 且 2 条 error 均保留；warn `total=991` / `groupCount=3` / 最大组 `989`；`droppedBefore` 三态（NULL / 0 / >0）且 UI 提示；聚合文本可直接喂 AI；两处弹窗一致 + 原始档零回归；存量迁移列为 NULL。
  - **验收（1b）**：除 `/health` 外「无 key 且无会话」401、有会话按会话授权；缺 `read` 403 留痕；跨组织 403；限流 429；字段白名单负向断言；字段清单 + 发布物快照双守卫；集合端点分页；无 ACAO；`dfk_` 脱敏；key 管理六项；grouped 与 shared 同源；零回归 + 安全深度审计 Pass。
  - **风险与缓解**：key 泄露 → 高熵 + 哈希 + `dfk_` 脱敏 + 90 天 TTL + 每组织 10 把；情报外泄 → 字段白名单 + 体积上限 + 访问日志；契约漂移 → 字段常量 + 发布物快照；插件不兼容 → 自建回退；聚合误折叠 → error 不归一化 + `sample` 保留原文。
  - **前置**：`@better-auth/api-key` 与 `better-auth 1.7.22` 兼容性实测；`api.md §3` 信封漂移在 1b 订正或标注为历史声明。
  - **明确不做**：全量 CRUD 镜像；触发 / 批量 / 调度（期 3）；交付写（期 4）；内嵌 `/mcp`；`fix_dependency` / `pnpm_audit` 远端化；采集侧抑制重复 warn（改变原始语义）。
  - **触发条件**：需要不装 CLI / 不传 token 读平台结果；或 AI 需读平台日志与运行状态。

### 延期 / 暂缓项

- **管理端代他人重发验证邮件（admin-only + 操作者审计）**（P2 🛠️，**2026-11-13 用户决定延后**）—— 背景：better-auth `/send-verification-email` 在有会话时要求 `session.user.email === body.email`（否则 400 `EMAIL_MISMATCH`），管理端代发无法复用原生端点；当前用户列表只展示未验证标签，用户到登录页自助重发。**延后原因**：用户判断「代他人触发邮件」的逻辑仍需重新推敲（权限、滥用面、与自助恢复的边界）。恢复条件：用户完成方案思考并明确授权；届时按「admin-only 端点 + 操作者审计 + 双维度限流」评估。手动置位 `email_verified` 已另行决定**不提供**（2026-11-13）。

- **T705 生产级部署**（PostgreSQL + Helm；Sentry 已拆出为独立候选，见上文）—— 2026-08-12 用户指示暂缓排期
- **自托管 Umami 流量统计**（P3 🎨，1.0 后暂缓）—— 管理台用户量小，Sentry 路由 transaction 已覆盖页面访问与性能；流量来源 / 留存价值不足以抵消额外服务与脚本成本。触发：需要产品级使用分析且 Sentry 数据不足，或平台转为多租户 SaaS。详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **caomei-ui 0.x → 1.0 升级回归** —— 库处于 0.x（平台当前 `0.6.0`，2026-10-11 由 dependabot 升级、2026-10-12 完成升级回归，见 [caomei-ui-migration.md §15.15](../design/governance/caomei-ui-migration-upgrades.md#_15-15-caomei-ui-0-6-0-升级回归实证-插队热修-2026-10-12)）。**剩余观察**：`1.0.0` 发布后的正式升级回归与「平台需跟进新组件能力」「用户明确恢复」两条触发条件。届时按 M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration-mapping.md)）做回归；**升级回归的像素兜底已就位**（视觉回归基线 `apps/platform/tests/visual/`，覆盖 alerts / repos / pr-checks / dialog-import-repos / login，口径见 [测试规范 §6.7](../standards/testing.md)）
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

### 收尾未 settle 复发观察（2026-11-19 登记）

- **已于 2026-11-19 定位并修复**（M62.6）：根因是外联审计代理的 `stop()`——CONNECT 隧道 upgrade 后被移出 `closeAllConnections()` 的追踪集但仍计入 server 连接数，`server.close()` 因此永不回调，整轮运行被拖到 30 分钟上限。修复见 [执行进程隔离 §8.6](../design/governance/executor-process-isolation.md#_8-6-残余与观察项)；本地确定性复现与修复后落定读数见 todo M62.6 执行记录。
- **本条目只保留观察判据**：之后含外联（registry / GitHub）的 fix 运行若仍出现 `execution_timeout` 且宽限期未落定，先读执行日志的「诊断分类」行——`未 settle 句柄` 说明有新的未关闭句柄（按「运行期句柄」清单定位）；`在管子进程` 说明有未纳入进程树终止的孙进程；两类「无法归类」按 backlog 旧分流（`采集不可用` 先修探针、`无净增` 抓 `ps -ef --forest` 查未返回的异步等待）。
- 历史样本（保留判读价值）：`6875bb2e09401dec`（momei，2026-11-13）空窗 5m20s、在管受管子进程 0 个、最后受管命令 `git rev-parse --abbrev-ref HEAD`。

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

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段活跃任务 | **M62 运行日志复盘与执行成本收口**（2026-11-16 规划，6 原子，见 [todo.md](todo.md)）；插队容量治理见 [planning.md §3.1.1](../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) |
| 下一阶段（未规划） | 按本文件候选池重新评估（35 条）；M59 / M60 残余留在本文件；**1.1.0 已于 2026-11-15 发布**，定时发布启用仍在「待上收候选」段等待观察窗口 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M61 已归档；M62 进行中） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
