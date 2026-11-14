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

> **候选池概览（2026-11-13 运行日志复盘后复算）**：本区 **41 项**（`### 候选评估中` 段内 `^- \*\*` 逐行计数）；M58 规划阶段上收 6 条为 5 原子（47 → 41）；M59 规划上收 4 条（沙箱 fix 出站策略 / 取消落定与清理 / force-fail 与续用起点写 / 资源采集扩展；41 → 37），另聚合 1 条 M57.1/M58.4 残余（镜像内 sandbox 双架构冒烟），不占候选计数；2026-11-12 运行日志复盘登记 2 条 P1（红仓库 baseline 短路 / 子进程 OOM 信号分离；37 → 39）；2026-11-13 追加 1 条 P2（peer-only 同 major 修复回退；39 → 40）；2026-11-13 M59 插队再平衡移出 M59.5（40 → 41；该项原为「聚合 1 条 M57.1/M58.4 残余、不占候选计数」，移出后转为正式候选并计入），「无写入」结论语义与状态一致性已按用户授权作为 M59 追加临时待办，不占候选计数。P 标签覆盖不全（未标注者评估时补 P 标签，不默认升级）；本文件不维护分档统计，1.0 分档只见 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)。
> **1.0 门槛与分档**：分档、门槛判定与批次计划单点声明于 [release-1.0-readiness.md](../design/governance/release-1.0-readiness.md)（2026-10-30 冻结口径，不随候选上收收缩；本文件不重复维护数字）。

- **备份 `.tmp` 清扫缺年龄门槛（P3 🛠️，2026-10-31 M53.2 收口登记）** —— `cleanupOldBackups` 对 `*.bak.tmp` 无条件回收；单实例串行路径不可达冲突，但并发 `db:restore` 或多实例共卷启动时可能删掉对端正在写的临时文件（rename ENOENT → 该轮快照丢失，fail-open 后仅剩日志）。待评估：加入 `mtime < now - 10min` 年龄门槛或按 PID 命名临时文件。触发：启用多实例 / 多容器共享数据卷，或出现并发恢复需求时。
- **`check:release-security` 输出缺少采集时点（P3 🛠️，2026-11-03 预发布检查发现；2026-11-08 复核）** —— 告警汇总行与 PASS / FAIL 行都不带采集时间，落盘为发布证据时无法自证时点（只能靠文件 mtime 推断）；脚本当前无 `--json` 模式。**范围**：输出首行加 ISO 时间戳。**验收**：输出含采集时点，单测锁定。**不做**：不改告警判定与 fail-closed 语义、不新增 `--json`。**触发条件**：下次改动该脚本，或再次需要以该输出作为发布证据。
- **镜像构建冗余（P2 🚀，2026-11-07）** —— ① 每架构对三 registry 各构建一次（digest 相同，冷缓存最慢 41m32s）；② 发布提交被 push 与派发各构建一次。待评估：单次多 name 推送 / 复用 digest / push 腿跳过 release 提交。
- **PR 回环有界重试（P2 🚀，2026-10-30 M51.3 用户裁定延后）** —— 设计稿 `pr-feedback-loop.md` §8 保留 `FeedbackRetryDispatcher` 契约（同 PR 失败后重新触发既有修复链，需配额与触发面）；平台当前无「同 PR 重试」入口，`retryFailed` 开启时每仓库每进程只 warn 一次。待评估：补触发面（API / UI）+ 配额后再实施。触发：出现「PR 红后无人处理、需自动重试」的实际需求时。
- **门户面板左缘亚像素抖动（P2 🧪，2026-10-31 M52.4 收口登记）** —— `dialog-select-open-dark` 基线在连续 `--update-snapshots=all` 下约 1/10 轮出现 99 px / maxΔ2 的边缘窄带差异（bbox x 476-483 × y 303-723，位于门户面板左缘），低于门禁（`maxDiffPixels` 100 / `threshold` 0.1 → maxDelta 352）但仅剩 1 px 预算。已排除「update 落帧不稳定」这一主因（`waitForVisualStable` 已加两帧一致检查，全量集合 3/3 恒定）。待评估：定位面板定位的亚像素来源（门户定位取整 / 滚动条宽度），或对该基线改用元素级取景。触发：该基线偶发红，或差异放大到接近 / 超过 100 px。
- **验证跳过的交付可观测性（残余：`deliverySkips` 家族登记；P3 🎨，2026-11-09 更新）** —— 报告 `Verification Skipped` 段 + Summary 行、平台运行详情「验证跳过」与按原因 tooltip 已落地（`budget` / `no-write` 可区分），「修了 N 条、交付 0 条」可从报告与详情直接判读。残余：是否需要在 `deliverySkips` 家族里登记该跳过原因（当前独立 `verificationSkippedByReason`）。触发：出现「跳过原因需在交付载体（issue / 草稿 PR）中体现」的反馈时。
- **平台侧交付载体（issue / 草稿 PR，P2 🎨）** —— 引擎 `fix-and-pr` 已按基线红档位产出载体（issue / 草稿 PR），平台执行链（`fix + commit` + `platform-delivery`）目前只记录 `summary.deliverySkipped*` 并在运行列表 / 详情展示；待评估：平台在交付决策处复用同一失败指纹开 issue / 创建草稿 PR，并补仓库级配置写入面（当前仅 env `DEPENDFIX_ON_BASELINE_RED`，UI / API 不暴露）。触发：平台用户反馈「基线红只有标签、没有可跟踪载体」时。口径见 [pr-delivery-closure.md §16.7](../design/governance/pr-delivery-closure.md#_16-7-已知边界)。
- **镜像脚本只覆盖根 scripts 单一形态**（M48.2 边界）—— `pnpm --filter` / 递归 / env 前缀 / corepack 钉定只披露不执行；触发：目标仓库 CI 大量使用这些形态导致「本地假绿」再现。
- **白名单内运行前未提交改动的归属**（M48.4 边界）—— 白名单内文件（典型 `package.json`）若在运行前已有用户改动，会与本次修复一并提交；触发：出现「PR 混入无关改动」的用户反馈时评估。
- **`dependfix-remediator` REFERENCES 的 MCP 状态与入参映射过期（M49.4 边界；2026-11-12 复核）** —— `@dependfix/mcp` 已发布 1.0.0，但 REFERENCES 仍写「当前 MCP Server 未发布」：**2 份受版本控制副本**（`skills/dependfix-remediator/REFERENCES.md`、`packages/skills/dependfix-remediator/REFERENCES.md`）+ **1 份 `.gitignore` 生成产物**（`packages/cli/sandbox/skills/dependfix-remediator/REFERENCES.md`，由 `packages/skills/**` 复制，重建即覆盖，不单独修改）；2026-11-12 `rg --no-ignore` 实测三处均命中（默认 `rg` 仅 2 份受控文件；候选原写 2 份）。4 tool 能力映射表入参名已过期（文档 `owner` / `severityThreshold` / `includeCodeScanning`、`repo` / `createPr`、`dryRun` / `repo` ↔ 实际 `repo` / `severity` / `code_scanning`、`workDir` / `packageName` / `fix_type`、`dry_run` / 空 schema）；另有 4 个已注册 tool（`discover_repos` / `cleanup_branches` / `history` / `pnpm_audit`）完全未出现在 REFERENCES 中（原 4 tool 子集为刻意保留的最小集，扩面需决策）。触发：F2 技能文档批次，或下次修改 MCP schema 时。
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

- **列表页筛选能力的共享抽取（待评估）** —— 现象：`repos.vue` 与 `batch-runs.vue` 各自实现客户端筛选 + 重置（形态相近但字段与语义不同），`scans.vue` 另有按仓库筛选；三处筛选样板重复。展示口径统一批次（M42.5）判定两页形态尚未完全一致，故先页面内实现。**分页面板已收敛**：`use-table-pagination` 统一了受控 `page` / `rows`、刷新期间抑制自动回首页、越界收敛与显式回首页（`repos` / `batch-runs` / `pr-checks`；`scans` 服务端分页保留自身 `first` 口径），本候选只剩筛选 / 搜索面。
  - **待评估点**：① 抽取 `useClientTableFilter`（搜索关键字 + 筛选态 + 重置 + 过滤结果）的收益与形态约束；② 或仅抽「搜索 + 重置」最小面；③ 与组件内建分页、`use-table-pagination` 的职责边界（分页状态已抽出，筛选组合式只消费结果行数）。
  - **触发条件**：第四处列表页需要同类能力时；或筛选逻辑变更需多处同步时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **设置页严重级别查找与展示标签 helper 收敛（待评估）** —— 现象：`settings.vue` 内联实现 `find((option) => option.value === x)?.label ?? x`，与展示口径单一事实源的 helper 等价；该批次判定其已满足「同源查找」故未动。
  - **待评估点**：① 收敛到同一 helper（需处理设置页使用本地 computed 选项数组的差异）；② 或保持等价实现并注明。
  - **触发条件**：选项数组结构变更时；或设置页重构时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **镜像白名单：企业私服自带独立 CDN 域的补录（待评估）** —— 现象：镜像源动态发现只覆盖「配置面 registry 键的 host」；企业私服 tarball 若 302 到**独立 CDN 域**（与 registry 不同域），该域不在预置清单内 → 仍被 deny-by-default 拦截（交付时已登记为已知限制，需显式 `DEPENDFIX_ALLOWED_DOMAINS`）。
  - **待评估点**：① 是否按 302 `Location` 自动补录 CDN 域（可从审计记录观测补录）；② 或维持显式配置；③ 自动补录的安全边界（是否需用户确认）。
  - **触发条件**：出现企业私服 CDN 域被拦的实例；或用户要求自动化。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **归档目录内 file-dead 相对链接前缀治本（待评估）** —— 现象：`docs/plan/archive/**` 的历史相对链接存在**目录前缀错误**（如从 `docs/plan/archive/` 引出 `../standards/…` 或 `../../design/governance/…`，实际应为 `../../standards/…` / `../../docs/design/governance/…`）；`check:docs` 的 links 面（file-dead）对该目录整体豁免（见 [md-walk 决策注释](../../scripts/shared/md-walk.mjs)），故长期不可见。
  - **待评估点**：① 是否对归档目录做一次路径前缀重指（使 `archive-anchors` 的跨文档锚点子集真正生效，消除该永久盲区）；② 或维持豁免并保留注释登记为既定边界。
  - **触发条件**：归档链接前缀批次立项；或用户要求清理归档死链。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **经验归档分片范围声明口径与段序（待评估；2026-11-09 部分处置）** —— 现象：分片命名存在两套口径。M56.5 已把 §70-§99 分片拆为 §70-§78 / §79-§85 两片（**按实测范围命名**；§八十五 沉淀追加时同批改名），原文件保留为分片索引（文件名保留建立时上界并加实测范围说明）。残余：`experience-archive-§29-§35-integration.md` 内 `## 三十二、` 段排在 `## 二十九、` 之前（段序异常，范围本身齐备）；以及索引文件是否改按实测范围重命名的口径选择。M44.3 已把 `§49` 分片的「文件名 / H1 / 内容范围」三方对齐，本条为同源剩余口径。
  - **待评估点**：① 统一「分片范围 = 实测内容范围」还是「= 建立时规划上界」并写入分片维护约定；② 段序是否按编号归位。
  - **触发条件**：新增 / 扩容经验分片时；或用户要求清理归档排序。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`caomei-ui-migration.md` 存量超标的保序拆分（待评估；2026-11-12 实测 1073 行）** —— 现象：`docs/design/governance/caomei-ui-migration.md` 实测 **1073 行**（2026-11-12 `wc -l`；候选原登记 940 行，其后 §15 继续增长），治理设计阈值 ≤400 / 强制分片 >700，由 [check-doc-size 豁免表](../../scripts/check-doc-size.mjs) 逐条登记（理由：阈值入表时即超标、入链面广、§15 迁移实证需保序）。本批已产出拆分方案：**主文档保留 §1-§11**（拆分时点实测 387 行 + 分片索引，仍 ≤400）、**分片 A = §12-§14**（上收触发条件 / 关联文档 / 文档元数据）、**分片 B = §15.1-§15.10**（169 行）、**分片 C = §15.11-§15.15**（339 行）（§15 内部按子节保序切分，三处分片均 ≤400）；落点命名 `<slug>-<主题>.md` 同级；拆分后须移除豁免表条目并重指入链（§15 被 experience-archive / caomei-ui-migration 迁移评估 §15.x 等引用）。**拆分时须按 2026-11-12 实测重新核算各段行数**（原方案数字为旧时点）。
  - **待评估点**：① 是否按上述方案执行（独立内容治理批次）；② 或维持豁免（当前状态）并在豁免理由中保留「待该批次落地后移除此条」。
  - **触发条件**：启动独立内容治理批次时；或该文档再次增量更新时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **`architecture.md` 技术选型表含未采用的 momei 复用项（待评估）** —— 现象：`docs/design/governance/architecture.md` §技术选型表列出「监控 | Sentry（`@sentry/nuxt`）| momei」「PWA | `@vite-pwa/nuxt` | momei」等条目，而在全仓无依赖声明与源码引用（M44.6 已核对 `apps/platform/{package.json,nuxt.config.ts,app,server}`；`docs/design/governance/architecture.md` 等文档级提及属复用参考表，非声明）。该表有「来源」列显式标注 momei（属复用参考而非「当前已采用」断言），但读者可能误读为现状。
  - **待评估点**：① 加一句口径说明（表为 momei 复用参考，未采用项不在此表承诺）；② 或对未采用项加「未采用 / 暂缓」标注（Sentry 见 [第三方可观测性评估](../research/2026-10-27-third-party-observability-evaluation.md)，winston 行对应同文档 §现状：平台 logger 已实现但未接线）。
  - **触发条件**：下次改动 `architecture.md` 或技术选型复核批次。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **M44 蒸馏新增条款的检查点挂接与配套收敛（待评估；2026-11-08 复核）** —— 矩阵已挂接 §4.4 第 3 / 13-15 / 21-24 / 26 / 27 条，**仍缺** §4.4 第 16-20 条、`testing.md §6.12`、`documentation.md §6`（「断言复现运行期真实条件」「非门禁面缺陷」）三类行，`code-auditor.agent.md` 必查项同样缺；另有 2 条 pattern 未落任何权威文档（「门禁规则扩面前先跑一次性探针量化分布」「E2E 取证临时仓库不要软链 node_modules」），及 3 处新条与既有条款主题重叠（`documentation.md §6` 量化断言 ↔ `planning.md §2.5`；`documentation.md §6` 引用范围措辞 ↔ 同节覆盖面声明；`planning.md §4.4` 第 18 条 ↔ 第 3 条）。
  - **待评估点**：① 补挂缺失的三类检查点行；② 2 条未落点 pattern 补写落点（或改判废弃）；③ 3 处重叠改为交叉引用收窄。
  - **触发条件**：下次改动上述规范文件 / 文档门禁扩面 / 阶段归档批次。
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

- **通知严重级别标签的跨 runtime 单点化（待评估，P3 🛠️）** —— 现象：`Critical` / `High` 标签存在三处口径——`apps/platform/app/utils/scan-options.ts`（前端单一事实源）、`apps/platform/server/services/notification/business-templates.ts`（邮件模板 zh / en 各一份）与 i18n 模板占位符；服务端无法直接 import app 层 util，M50.2 只能保证前端与 i18n 侧同源。**待评估点**：① 是否下沉到 `packages/core` 共享常量并让邮件模板消费；② 或维持现状（前端单点 + 服务端注释互指 + 用例锁定）；③ 与 i18n 占位符拼接口径的关系。**触发条件**：再次改动通知文案，或新增第三处严重级别消费方。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **邮件传输超时与周报节拍约束显式化（待评估，P2 🛠️）** —— 现象：`apps/platform/server/services/mailer/transport.ts` 的 `SMTPTransport.Options` 未声明 `connectionTimeout` / `socketTimeout` / `greetingTimeout`，当前靠 nodemailer 默认值（socket≈10 分钟）与周报 15 分钟检查间隔的隐式大小关系兜底；M50.3 引入重入守卫后，若某次发送永不 settle 且默认值或节拍被改动，周报会永久停摆（旧行为只是噪声）。**待评估点**：① 是否显式声明三个超时并在注释里锁定「必须小于周报检查间隔」；② 是否在启动期做一次配置断言（超时 < 节拍），失败 warn；③ 与平台请求超时 / 队列预算的口径是否统一。**触发条件**：调整周报节拍 / nodemailer 升级 / 再次出现周报停摆。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

**2026-10-30 批量运行超时复盘派生**（来源：`runs-logs-20261030-000646.txt` 第 1 页 10 条运行，2 条 `execution_timeout` + 1 条无日志失败；不占阶段编号）：

- **Nuxt / 框架类仓库默认验证链缺 `prepare` 前置（待评估，P2 🛠️）** —— 现象：momei 的 `quick-verify` 执行默认 `pnpm lint` 时 ESLint OOM（`Mark-Compact` 至约 1.95GB 后 `FATAL ERROR: Ineffective mark-compacts near heap limit`，GC 挣扎约 4 分钟才退出），与 `packages/engine/src/helpers/index.ts:86-90` 注释已记录的形态一致：默认链 `install → lint → build → typecheck → test` 中 lint 早于 build，`.nuxt/tsconfig.json` 尚未生成。平台侧该仓库未配置 `verifyCommands`，故走默认链。**待评估点**：① 引擎默认链是否在探测到 `nuxt.config.*` 时插入 `nuxt prepare`（影响全部仓库链口径）；② 或平台在新建 / 导入仓库时按框架写入 `verifyCommands` 模板（不污染默认链）；③ monorepo 根脚本形态（`pnpm -r --filter "./packages/*" lint`）下 prepare 应落在根还是各成员；④ OOM 的子进程退出应否作为独立诊断信号（当前只表现为 `exit code 1`）。**验收标准（草案）**：Nuxt 仓库在无自定义配置下 lint 不再 OOM；prepare 步骤失败有独立日志与报告条目。**不做**：不为单个仓库硬编码框架判断（探测失败须安全回退默认链）。**触发条件**：再次出现框架前置步骤缺失导致的 OOM / 假红。**2026-11-01 复现（2 例）**：`momei` 两次运行（2026-10-31T22:44 / 2026-11-01T05:15）均在 quick-verify 阶段以同一形态 OOM（`Mark-Compact 1947.0 (1961.6) MB` → `FATAL ERROR: Ineffective mark-compacts near heap limit`，GC 挣扎约 5 分钟）；容器与仓库脚本均未设 `NODE_OPTIONS` / `--max-old-space-size`（Node 默认 old-space ≈2GB），且基线阶段同命令已红（`exit code 1`）→ 属「链序 + 环境堆上限」双重因素，非本次升级引入。

- **契约抽取器覆盖 `@Column(() => X)` 嵌入列与 env 解构（P3 🛠️，2026-10-31 M53.1 收口登记）** —— `check-contract-freeze` 的实体抽取覆盖 `@Column` 系列 / `@ManyToOne`+`@JoinColumn` / `@Entity`，遇到 `@Embedded`、`@ManyToMany` join table、env 解构与非字面量 `readEnv` 实参已 fail-closed（`extractor-coverage`），但**无 `@Embedded` 的 `@Column(() => X)` 嵌入列**未进哨兵：抽取会产出错误列名并与清单产生差异（响亮失败，不会静默漏键）。待评估：扩展抽取器（递归嵌入类型 / `getMetadataArgsStorage` 元数据）或把该形态纳入 fail-closed 哨兵。触发：仓库首次引入嵌入实体或该形态列。
- **en-US 设计文档全量镜像（P2 📚，2026-10-30 M52 规划登记）** —— 现状：en 设计镜像仅 4 篇，zh 设计文档 67 篇（含 M44.4 拆分分片）；M52.3 只做「结构映射 + 索引补全」，不重译全文。待评估：1.0 后是否按「分片 → 镜像」逐篇补齐（成本随拆分增加、双维护风险高），或长期维持映射清单 + 关键路径翻译。触发：1.0 后文档国际化需求，或用户反馈英文站信息不足时。

**2026-11-08 上游提案研判派生**（来源：`cmyr-skills-agents` 治理提案对照与本仓 AI 资产核对；不占阶段编号）：

- **AI 基建机检补强（P2 🛠️，2026-11-08 上游提案研判登记）** —— skill frontmatter / `metadata.internal`、`references` 索引、镜像符号链接、技能文档死链均已合规但**无机检**。**待评估**：① 新增 `check-ai-governance`（frontmatter 必填 + `references` / 镜像链接可达）并注册 `DOC_GATES` 复用 `gates:docs` 单入口，不另开 `ai:check` CI job；② `cmyr-skills-agents` 的 `docs/proposals/2026-11-02-governance-check-alignment.md` 中 #5 弃用引用 / #6 能力标记 optOut（无机器可读 deprecated 清单；跨仓读台账成第二事实源）。**触发**：新增或合并 skill、`references` 调整、回写上游台账时。

**2026-11-12 运行日志复盘派生**（来源：`runs-logs-20261112-143354.txt` 第 1 页 50 条运行，2 次交付 / 3 次 `execution_timeout`；不占阶段编号）：

- **红仓库 baseline 预失败后的短路（P1 🛠️，2026-11-12 运行日志复盘登记）** —— 现象：`CaoMeiYouRen/momei` 每轮 pre-fix baseline 20-21 分钟，`lint` / `build` / `typecheck` / `test` 全部预失败，随后 post-fix 验证按 `pre-existing` 全量豁免（`quick-verify` 直接 skip），baseline 只产出「不归因」；`CaoMeiYouRen/rss-impact-server` 同形（baseline 9-18 分钟，`test` 每轮 `timed out`）。两仓合计占该窗口 63% 机时（227/358 分钟），仅贡献 2 次交付中的 1 次；全窗口约 48% 时长是 pre-fix baseline。**待评估点**：① 短路口径（同一命令已红即跳过全部后续命令，还是只跳过依赖它的命令）；② 与 `onBaselineRed` / `verificationSkippedByReason` 的衔接（跳过原因需能与「预算耗尽」「无写入」区分）；③ 短路后报告与平台详情如何表达「未跑 ≠ 通过」；④ 红仓库是否需降频（每 N 轮重建一次 baseline）。**验收标准（草案）**：红仓库单轮耗时下降 ≥ 50%；跳过项全部带原因且报告可判读；非红仓库链条零回归。**不做**：不改验证链条数与顺序本身（[repo-execution-limits.md](../design/governance/repo-execution-limits.md) 边界），不为单仓硬编码。**触发条件**：再次出现红仓库吃满执行预算或 `execution_timeout`。

- **子进程 OOM 信号与运行终止的状态分离（P1 🛠️，2026-11-12 运行日志复盘登记）** —— 现象：同一「子进程 OOM」信号在日志里落成三种终态——`rss-impact-server` 在 2026-11-06 / 11-10 / 11-11 标 `OOM 终止：是`（峰值 RSS 2883-2994 MB）但终态 `completed` + `exitCode:0`，11-07 同形运行 `failed`；`momei` 的 lint OOM（`Mark-Compact 1947.0 (1961.6) MB` → `FATAL ERROR: ... heap limit`）则吃满 30 分钟上限报 `execution_timeout`。`OOM 终止` 字面读作 run 级终止，与实际「命令级 OOM + 基线豁免放行」不符。**待评估点**：① 归因字段拆分（run 级 `oomKilled` vs 命令级 OOM，后者带命令名与退出码）；② 命令级 OOM 是否阻断交付（当前按 pre-existing 豁免放行）；③ 平台列表 / 详情的展示口径（命令级 OOM 不计入运行失败率）；④ 与 2026-10-30 条 ④「OOM 子进程退出应作独立诊断信号」合并评估，不重复实现。**验收标准（草案）**：同一信号只落一个字段层级，`completed` 运行不再出现「OOM 终止」字样；`execution_timeout` 与其子进程 OOM 可分别判读。**不做**：不采宿主级 OOM / `dmesg`（[已知边界](#宿主级-oom-与-cgroup-标记无法解释-持续观察) 已单列）；不改 30 分钟上限口径。**触发条件**：再次出现「completed + OOM」并置，或 OOM 与超时仍不可区分。

**2026-11-13 运行日志复盘派生**（来源：`runs-logs-20261113-045612.txt` 第 1 页；不占阶段编号）：

- **peer-only 同 major 修复回退到 manifest 直接依赖（P2 🛠️，2026-11-13 登记）** —— 现象：`rss-to-memos-sync` 的 vite 8.3.1 → ^8.3.3 属同 major，经 versioned overrides 应用后验证提示 `peer-only instances do not follow pnpm overrides`，回滚并按「无写入」收尾；`sharp-cloud-uploader` 在 2026-11-06 同一形态（8.1.0 < 8.1.6，override 未生效）。现有路径只在 overrides 层面尝试，未回退到「提升声明该包的 manifest 直接依赖」，因此同 major 可修告警也交付不了。**待评估点**：① override 未覆盖 peer-only 时改为提升根 / 成员 manifest 的直接依赖（含锁定范围与回滚单元）；② 或稳定输出「需人工」并附具体文件与版本建议；③ 与 `peer-only` / `override-protected` skipped 口径及「无写入」结论的关系。**触发条件**：再次出现同 major 可修但 overrides 失效（peer-only / 非依赖树可达）。

**2026-11-13 阶段容量再平衡移出**（来源：M59 同日三批插队命中 §3.1.1 阈值 1，用户确认移出；不占阶段编号）：

- **沙箱镜像双架构自包含冒烟与安全姿态（P2 🚀📚，2026-11-13 因插队再平衡移出）** —— 原 M59.5。**目标**：镜像内 sandbox 自包含入口在 amd64 / arm64 都可运行，发版后自动取证；安全姿态（rootful / userns / 网络面）单一口径成文。**范围**：`apps/platform/docker/smoke-test.sh` 新增 sandbox 入口断言（容器内 `node /app/sandbox/bin.mjs --version` + `skills doctor`），由构建期冒烟与 `post-release-smoke` 共同消费并把结果写入 Job Summary（构建期 `Dockerfile:181-186` 的 sandbox 自检已存在，属依赖而非新增）；`docs/design/governance/executor-sandbox.md` / `executor-sandbox-implementation.md` / `sandbox-security-governance.md` 翻转 fix 放行后的状态、网络面偏离、rootful / userns 边界；`docs/guide/deployment.md` 按需补运行面提示。**验收标准**：① amd64 构建期冒烟与 arm64 发版后原生冒烟均通过（无发布窗口时记「未证实」），注入回归（移除 `/app/sandbox/skills` 或改坏版本串）使断言失败以证明灵敏；② `post-release-smoke` Job Summary 含 sandbox 入口断言结果，失败仅告警不改发布结论；③ 三篇设计稿同批翻转且无 stale 表述；④ `pnpm run gates:docs` 20 项通过。**不做**：不改镜像构建架构与 QEMU 口径；不重建历史镜像；不引入 rootless 之外的新隔离机制。**依赖**：M59.1 / M59.2 闭环（沙箱 fix 放行与自包含交付）；M58.4 的 `post-release-smoke` 与 `scan-image-tags`；构建期双架构自检见 `apps/platform/Dockerfile:181-186`（`e548c332`，run `43156533556` 双架构 success）。**交付物**：2-3 commits / 6-8 files / 200-350 行。**风险与缓解**：arm runner 成本 → 仅构建期与发版冒烟各一次；文档状态翻转遗漏 → 按检查点矩阵三处同源扫描。**触发条件**：M59.1 / M59.2 闭环后，或出现发布窗口需要 arm64 取证时；或镜像 sandbox 入口出现回归怀疑。**移出原因**：依赖 M59.1/M59.2 完成、且发版后取证受发布窗口约束，是当前阶段延期成本最低的原子（用户 2026-11-13 确认）。

- **沙箱 fix 的 undici 直连外联纳入连接级拦截（评估 `NODE_USE_ENV_PROXY`）**（P2 🛡️）—— 背景：2026-11-13 M59.1 落地运行级审计代理后，尊重代理 env 的工具（pnpm / git / npm CLI）已被 deny-by-default 拦截；Node 内置 fetch / undici 默认不读代理 env，此类直连只能靠命令输出 URL 提取留痕（仅 audit、不构成违规，见 [security.md §5.3.1](../standards/security.md)）。
  - **待评估点**：① Node 24+ `NODE_USE_ENV_PROXY=1` 对 `fetch` / undici 的实际覆盖范围与副作用（需最小对照实验）；② 对未支持该开关的 Node 版本的回退策略（注入全局 dispatcher 需改被测仓库代码，不可行）；③ 是否只对沙箱 fix 路径启用，避免影响 CLI 本地运行。
  - **触发条件**：出现「恶意依赖脚本用 fetch 外带数据」的实际案例；或 Node 版本基线统一到 24+ 之后。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **外联审计在既有代理环境下的注入失效可见化**（P3 🛡️）—— 背景：2026-11-13 M59.1 的运行级审计代理在宿主/容器已有 `HTTP(S)_PROXY` 时不覆盖用户代理（稳定性优先），此时 deny-by-default 不生效，但平台第二道闸仍按配置判「策略就位」。
  - **待评估点**：① 在结果 / 运行详情标注「代理未被注入（环境已有代理）」；② `NO_PROXY` 改为追加而非替换既有值；③ 是否对沙箱 fix 路径强制要求「注入生效」（拒绝在既有代理环境运行）。
  - **触发条件**：部署环境统一经过企业代理 / 网关时；或需要按 run 统计「审计实际覆盖面」时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **沙箱 install 网络不可达的快速失败与预算透传**（P2 🛠️，2026-11-14 线上 `execution_timeout` 复盘登记）—— 背景：沙箱容器不继承宿主 `~/.npmrc`，直连 `registry.npmjs.org` 被阻断时 `pnpm install` 停在 TCP 连接阶段（ETIMEDOUT）而非快速失败；随后 `lint / build / typecheck / test` 每条命令各自耗满命令超时，最终整仓 `execution_timeout` 且结果缺失。已交付 `SANDBOX_NPM_REGISTRY`（注入 `pnpm_config_registry` / `npm_config_registry` + 自动并入白名单）与超时输出回传。
  - **待评估点**：① 安装前对生效 registry 做 5s 连通性预检（容器内 TCP 探测），不可达即报可读错误而非进入安装；② 把平台执行预算（`deadlineAt`）透传给容器内 CLI，让验证链在预算见底时主动收口并回传部分结果；③ 外层 `withTimeout` 触发（adapter 卡死）时同样带回已捕获输出。
  - **触发条件**：出现除 npm registry 之外的安装源不可达案例（私有 registry / 代理环境），或再次出现「超时但结果缺失」的运行。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

### 待上收候选（评估完成，等待用户决策）

> 本节为「评估完成、等待用户决策」候选的暂存区；候选**不含 `M\d+` 阶段编号**（[规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)）。

- **`git-signing.ts` 更名为 `git-isolation.ts`（待评估）**（P3，🛡️ 治理）—— 背景：该模块已承载「签名 + hooks」双语义（4 个隔离常量），但文件名仍只表达「签名」。
  - **本批已闭环的部分**：决策点「是否在 `docs/standards/git.md §3.8` 扩展 hooks 隔离子节」已于 2026-10-13 M43.5 落地——§3.8 改为「签名 + hooks，commit / push 双向隔离」单表 + 4 常量清单 + push 侧 `--no-verify` 口径；`code-quality-checklist` 对应矩阵行同步扩展。
  - **待评估点**：是否将 `packages/engine/src/github/git-signing.ts` 更名为 `git-isolation.ts` 并同步 `github/index.ts` re-export（公开 API）、平台侧 import、测试与 `git.md §3.8` 的路径引用。**未纳入 M43.5** 的理由：触及公开 API re-export 与平台侧多处 import，宜单独批次以保持改动面可控。
  - **触发条件**：下次改动该模块 / 公开 API 面时；或治理批次收敛模块命名时。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

- **批次级「继续执行未完成项」入口（待评估）**（P2 🎨 用户体验）—— 背景：2026-10-18 用户报告宿主机重启导致批量任务中断，明确希望「至少给用户一个选项：直接结束还是继续执行」；同批已落地 P0（僵尸任务终结 + 去重键释放 + 触发自愈 + worker 慢重试），用户裁定本入口作为后续批次，形态选**批次级继续执行**（否决「新状态 + 启动弹窗」与「仅保留单条重试」）。
  - **待评估点**：① 入口落点（失败批次行内按钮 vs 展开详情）与二次确认文案；② 重启范围（仅 `orphan_run` / transient 且未完成子项 vs 全部失败子项）；③ 承载形态（复用 `executeBatchRun` 创建新 BatchRun 保留审计链 vs 复用原批次）；④ 与现有单条 `POST /api/runs/[id]/retry` 的关系（是否抽取共享「未完成项」判定）。
  - **触发条件**：用户要求该交互；或再次出现宿主机重启后的批量恢复诉求。
  - **按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 不带 `M\d+` 阶段编号**：等待评估与用户决策。

### 延期 / 暂缓项

- **管理端代他人重发验证邮件（admin-only + 操作者审计）**（P2 🛠️，**2026-11-13 用户决定延后**）—— 背景：better-auth `/send-verification-email` 在有会话时要求 `session.user.email === body.email`（否则 400 `EMAIL_MISMATCH`），管理端代发无法复用原生端点；当前用户列表只展示未验证标签，用户到登录页自助重发。**延后原因**：用户判断「代他人触发邮件」的逻辑仍需重新推敲（权限、滥用面、与自助恢复的边界）。恢复条件：用户完成方案思考并明确授权；届时按「admin-only 端点 + 操作者审计 + 双维度限流」评估。手动置位 `email_verified` 已另行决定**不提供**（2026-11-13）。

- **T705 生产级部署**（PostgreSQL + Helm；Sentry 已拆出为独立候选，见上文）—— 2026-08-12 用户指示暂缓排期
- **自托管 Umami 流量统计**（P3 🎨，1.0 后暂缓）—— 管理台用户量小，Sentry 路由 transaction 已覆盖页面访问与性能；流量来源 / 留存价值不足以抵消额外服务与脚本成本。触发：需要产品级使用分析且 Sentry 数据不足，或平台转为多租户 SaaS。详见 [评估](../research/2026-10-27-third-party-observability-evaluation.md)。
- **T703 跨平台 Git**（GitLab + Bitbucket）—— 2026-08-12 用户指示暂缓排期
- **caomei-ui 0.x → 1.0 升级回归** —— 库处于 0.x（平台当前 `0.6.0`，2026-10-11 由 dependabot 升级、2026-10-12 完成升级回归，见 [caomei-ui-migration.md §15.15](../design/governance/caomei-ui-migration.md#_15-15-caomei-ui-0-6-0-升级回归实证-插队热修-2026-10-12)）。**剩余观察**：`1.0.0` 发布后的正式升级回归与「平台需跟进新组件能力」「用户明确恢复」两条触发条件。届时按 M31 迁移期实证索引（[caomei-ui-migration.md §15](../design/governance/caomei-ui-migration.md)）做回归；**升级回归的像素兜底已就位**（视觉回归基线 `apps/platform/tests/visual/`，覆盖 alerts / repos / pr-checks / dialog-import-repos / login，口径见 [测试规范 §6.7](../standards/testing.md)）
- **ScanResult 数据层去重（upsert 唯一索引）** —— 决策暂缓：应用层去重（fingerprint + occurrenceCount / firstSeenAt / lastSeenAt / affectedRunIds）已实施且满足当前业务需求；恢复条件：出现"fix 复用同一 `scan_run_id` 跨次刷新"或"历史 fixStatus 跨次保留"需求时迁移到数据层 upsert

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

### 发布后镜像冒烟与历史 tag 巡检的真实性待首个发布 run 验证（持续观察）

- **背景**：M58.4 新增 `docker.yml` 的 `post-release-smoke`（amd64 / arm64 原生 runner 拉镜像跑 `/api/health` 断言 + 历史 tag 巡检），本环境无法真实派发发布工作流（会实际发版）。
- **未证实项**：① `ubuntu-24.04-arm` 原生 runner 首次运行；② 私有 GHCR 包 `packages: read` 读取；③ 历史 tag 巡检在全量历史 checkout 下的实际输出；④ 冒烟失败时 Job Summary / `::warning::` 的可见性。
- **回填方式**：首个带 `platform_version` 的发布派发后，把 run id 与两架构结论回填 [发布管线设计 §4.6](../design/governance/release-pipeline.md#_4-6-发布后镜像冒烟与历史-tag-巡检-2026-11-12-m58-4)；未回填前该面不得记为「已验证」。
- **触发条件**：下一次 `release.yml` 派发 `docker.yml`（`platform_version` 非空）。

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
| 当前阶段活跃任务 | **M59 沙箱 fix 与执行可靠性**（2026-11-12 规划，4 原子 + 3 批插队；原 M59.5 于 2026-11-13 再平衡移出，见 [todo.md](todo.md)）；插队容量治理见 [planning.md §3.1.1](../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) |
| 下一阶段（未规划） | 用户 2026-11-12 决策「全部纳入、分四期」：第三期「平台减法与页面治理」→ 第四期「文档与 AI 治理」 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M58 已归档；M59 进行中） |
| 长期主线 / 候选 / 待人工验收 / 已知边界 | 本文档（按四象限结构） |
| 历史归档索引 | [archive/index.md](archive/index.md) |
