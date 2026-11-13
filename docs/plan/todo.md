# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M59 沙箱 fix 与执行可靠性**（2026-11-12 规划；5 原子） |
| 下一阶段（未规划） | 用户 2026-11-12 四期决策第三期「平台减法与页面治理」；第四期「文档与 AI 治理」；候选不预先分配阶段编号 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M58 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M58 已归档；M59 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M59 沙箱 fix 与执行可靠性

> **目标**：把沙箱从「只跑 report-only」推进到「可在容器内自包含执行 fix / fix-and-pr 并交付」，同时收口三类执行可靠性缺口（取消落定与工作目录竞态、run 起点条件写、资源采集覆盖面）；镜像面补双架构自包含入口冒烟与安全姿态文档。
> **来源**：用户 2026-11-12 四期决策第二期「沙箱 fix 与执行可靠性」（同日决策：交付模型取 **A 沙箱内完全自包含**、四项可靠性全部纳入，见下方决策记录）；backlog 上收 4 条候选（沙箱 fix 出站白名单代理 / 取消后落定与清理竞态 / force-fail 与续用整行写回 / 执行资源采集扩展）+ 聚合 1 条 M57.1 / M58.4 残余（镜像内 sandbox 入口双架构冒烟与安全姿态）。
> **用户决策（2026-11-12）**：① 交付模型 = 容器内 clone + fix + commit + push + PR，平台只接收结果；② 执行可靠性四项全部纳入本阶段。
> **容量基线（逐原子交付物求和，执行角色预估口径）**：19-25 commits / 55-75 files / 2500-3800 行。**类型平衡**：主类型 🛡️3（M59.1 / M59.2 / M59.3）+ 🛠️1（M59.4）+ 🚀1（M59.5，兼 📚 次标签）；🧪 内嵌各原子（M59.1 新增测试文件 3-4 / M59.3 新增用例 ≥6）；🎨 缺口显式标注——源于用户 2026-11-12「四项全部纳入」决策（非 AI 裁剪），UX 面由第三期「平台减法与页面治理」承接。
> **执行顺序**：M59.1 → M59.2 → M59.3 → M59.4 → M59.5（先放开沙箱执行面，再补自包含交付，随后收口运行状态与资源可观测，最后做镜像双架构取证与文档）。**2026-11-13 插队**：追加临时待办「运行结论语义与状态一致性」先于 M59.1 执行（用户决策；不分配阶段编号，容量评估见该条目正文，未触发再平衡）。
> **D 阶段决策点**：D1 出站代理启动位置（默认容器内 CLI 进程内复用 network-audit，不引入 sidecar）；D2 交付失败时远端分支清理归属（默认平台依据结果 branch 名清理，容器内不重复清理）；D3 取消宽限期策略（默认保持 10s 上限 + 未落定则延迟清理并落 `_pending` 诊断，不做无限延长）；D4 action 执行器资源采集口径（默认显式标注「不适用」并保持字段存在，不采集宿主）。
> **§3.4 阶段启动交叉核验（2026-11-12 实测）**：① 归档扫描 `sandbox fix|出站白名单|取消后落定|force-fail|资源采集|sandbox 冒烟` → 无同题闭环（M57.1 仅 report-only，其镜像内 `/app/sandbox` 构建期自检已覆盖双架构、M58.4 仅镜像 health、M10 T1002 仅验证链、M46.4 仅 container、M57.2 仅终态写回）；② `git log --oneline -- <相关路径>` + `git log --all --grep="sandbox fix|egress|force-fail|资源采集"` → 无同题实现批次；③ 代码 anchor：`sandbox-executor.ts:30` 仅 `report-only`、`:114-134` 第二道闸、`scan-orchestrator.service.ts:449` 降级判定、`engine-run.ts` 的 `ABORT_GRACE_MS=10_000`、`container-executor.ts:496/521/524` 宽限后仍清理、`force-fail.post.ts:84` 整行 save、`scan-orchestrator.service.ts:273-318` 续用起点整行 save、`resource-usage` 仅 container 接入；④ backlog 4 条候选前提与当前代码一致，残余聚合项见 M57.1 / M58.4 归档正文；⑤ backlog 上收 4 条（41 → 37），速查表与基线同步。

### M59.1 沙箱 fix 自包含执行与出站策略（P1 🛡️）

- **目标**：sandbox 容器内可完成 clone → 安装 → 修复 → 验证的 fix 执行链；尊重代理 env 的工具在连接级走 deny-by-default 白名单（非白名单 502 拒绝），undici 直连由命令输出 URL 提取归类违规，违规在执行结果与平台可见；执行面仍不挂载宿主目录。
- **范围**：
  - `apps/platform/server/services/executor/sandbox-executor.ts`：`buildSpec` 注入代理/白名单与最小 token；`buildCmd` 增加容器内 bootstrap（`git clone` 到 `/tmp/repo` 后 `cd` 执行 CLI fix）；`SANDBOX_ALLOWED_MODE` 第二道闸**收紧为策略判定并保留拒绝分支**（未注入代理 / allowlist 为空时 fix 仍返回 `sandbox_fix_requires_egress_policy` 且不 clone）。
  - `apps/platform/server/services/scan-orchestrator.service.ts:449`：fix / fix-and-pr 不再因 `sandbox_fix_requires_egress_policy` 降级；保留 sandbox 不可用降级，事件语义同步（`orchestrator:719-769`）。
  - 引擎出站审计：`packages/engine/src/runners/network-audit.ts` + `packages/engine/src/fixers/*`（安装链注入代理 env，与验证链同源）；`packages/core` 的 `RunResult` **需新增**外联审计字段（引擎侧现为 `verification-runner.ts` 的 `networkAudit` / `networkViolations`，平台零消费）。
  - 平台结果面：结果持久化 + 执行详情 / 导出展示 fix 路径的外联违规与 allowlist 命中摘要（新增数据面，不是只改展示）。
- **验收标准**：
  1. sandbox + `fix` 在夹具仓库完成容器内 clone + 安装 + 修复 + 验证，宿主无工作目录、无挂载（`docker inspect` 断言）。
  2. 尊重代理的客户端访问非白名单域名被连接级拦截（502）；undici 直连由输出 URL 提取判定。两类都进入结果 `networkViolations` 并在执行详情与导出可见；违规不写成「成功」。
  3. 白名单命中（registry / GitHub API / 镜像站）不误报；仓库级 registry 发现（`registry-discovery`）扩展域在沙箱内同样生效。
  4. `report-only` 行为不回归；sandbox 不可用仍降级 container 并保留 `sandbox_unavailable` 事件；直连外联负例（绕过代理 env）必须落违规且不计成功。
  5. `pnpm run lint:check` / `pnpm typecheck` / 定向 vitest / gated sandbox e2e 通过；`packages/*/src` 改动后先 `pnpm -r build`。
- **不做什么**：不做 push / PR（归 M59.2）；不改 container 执行语义与镜像非 root 基线；不引入宿主挂载；不放宽 `report-only` 的告警源白名单。
- **依赖**：M57.1 自包含入口（`/app/sandbox/bin.mjs` + `--result-json`）；`network-audit` 验证链实现；M10 T1002 代理设计。
- **交付物**：6-8 commits / 19-25 files（executor 3 / engine 4-6 / core 2-3 / platform 持久化·详情·导出与测试 7-9 / 文档 3-4）/ 1000-1400 行。
- **风险与缓解**：代理 env 只覆盖尊重代理的工具（undici 直连）→ 以命令输出 URL 提取 + 违规判定冗余；token 暴露面 → 仅注入本次运行凭据、日志脱敏、结果不回传 token；容器内 clone 网络抖动 → 复用 clone 超时/重试口径并在结果归因。

### M59.2 沙箱 fix 自包含交付与失败副作用（P1 🛡️）

- **目标**：容器内完成 commit → push 修复分支 →（`fix-and-pr`）创建 PR，平台接收 branch / PR URL；取消或交付失败时远端分支与工作区副作用可清理、可观测。
- **范围**：
  - `sandbox-executor.ts` + `packages/cli`：`fix-and-pr` 参数与结果契约（branch / prUrl / commitSha / `delivery: pushed|pr-created|none`）在沙箱内产出并经 `--result-json` 回传；沙箱内 `fix` 的 push 语义等价于现 `platform-delivery` 的 push 段，**branch 名复用平台 fingerprint 单一来源**（容器内不另造命名）。
  - `apps/platform/server/services/executor/platform-delivery.ts`：沙箱结果已含交付时不重复 push/PR（与 container 路径同源守卫）。
  - `scan-orchestrator.service.ts`：分支 / PR 副作用记录与失败清理（M57.2 残余：分支与 PR 副作用不随失败回滚）；取消路径分支清理。
  - 测试：沙箱 gated e2e（fix 无 PR / fix-and-pr 建 PR 两分支）、失败清理用例。
- **验收标准**：
  1. `fix`：修复后仅 push 分支（`delivery: pushed`），结果含 branch 与 commit SHA，平台落库并在详情展示；过渡态（M59.1 已合入、本原子未完成）结果标 `delivery: none`，不得写成已交付。
  2. `fix-and-pr`：创建 PR 并回传 URL；平台不再二次创建 PR、不重复 push（守卫有正 / 反向用例）。
  3. PR 创建失败或取消：按 D2 决策清理远端分支（或保留并标注原因），副作用在审计事件中可见。
  4. container 路径交付行为零回归（既有 platform-delivery 用例全绿）。
  5. lint / typecheck / 定向 vitest / gated e2e 通过。
- **不做什么**：不改 GitHub 权限模型与 App / PAT 通道；不改 PR 正文模板；不引入新的凭据存储。
- **依赖**：M59.1；引擎既有 commit / push / PR 链；`platform-delivery` 现有边界。
- **交付物**：4-5 commits / 12-16 files / 500-800 行。
- **风险与缓解**：双路径交付重复执行 → 结果契约显式标注 deliveredBy，平台侧 fail-closed 守卫；失败清理误删他人分支 → 只清理本次结果声明的 branch。

### M59.3 运行状态一致性：取消落定与起点条件写（P2 🛡️）

- **目标**：取消后引擎落定与工作目录清理不再竞态；force-fail 与续用起点写不再复活已终态 run。
- **范围**：
  - `apps/platform/server/services/executor/engine-run.ts` + `container-executor.ts:496/521-524`：未落定时输出存活受管子进程数 / 最后启动命令，延迟清理并落 `_pending` 诊断（D3 决策）。
  - `apps/platform/server/api/batch-runs/[id]/force-fail.post.ts:84` 与 `scan-orchestrator.service.ts:273-318`：改用条件更新（仅 `pending` / `running` 可写 + `affected` 断言），与 `scan-run-state` 共用 helper。
  - 测试：取消竞态用例（受管子进程存活）、force-fail 对终态 run、续用对 failed run 三组正 / 反向用例。
  - commit 拆分：取消落定 / 清理面 2 commits + 起点条件写面 2 commits，避免单批大 diff 越过 10 文件阈值。
- **验收标准**：
  1. 构造基线阶段中止：日志给出未落定原因（存活受管子进程数 + 最后命令）；workDir 清理不早于子进程全部退出，或延迟清理并留 `_pending` 证据。
  2. force-fail 作用于已终态 run：`affected=0`、状态不变、不发重复通知、输出结构化跳过事件。
  3. 续用起点写只允许 `pending` / `running`；对 `failed` 行 affected=0 且不改变状态。
  4. 既有终态写回守卫（M57.2）与取消语义用例零回归。
  5. lint / typecheck / 定向 vitest 通过。
- **不做什么**：不改 30 分钟执行上限口径；不改 force-fail 入口权限与语义；不做无限宽限。
- **依赖**：M57.2 终态条件写；`executor-process-isolation.md` 取消契约；`queue-stale-recovery.md §9` 残余。
- **交付物**：4-5 commits / 10-14 files / 450-700 行。
- **风险与缓解**：延迟清理导致磁盘累积 → `_pending` 沿用 24h 保留与清扫；动态宽限拉长队列占用 → 保持 10s 上限 + 强杀兜底，只延迟清理不延迟返回。

### M59.4 执行资源采集扩展（P2 🛠️）

- **目标**：sandbox 执行器与异常路径也能产出资源快照；action 执行器对「不适用」显式标注而非静默缺失。
- **范围**：
  - `apps/platform/server/utils/resource-usage.ts`：采集口径与字段复用；sandbox 容器 stats / cgroup 读取接缝。
  - `apps/platform/server/services/executor/sandbox-executor.ts`、`action-trigger-executor.ts`、`container-executor.ts:296-301`（异常路径快照保留）。
  - 平台运行详情 / 导出：资源字段对新执行器生效（无 UI 改动优先复用现有展示）。
- **验收标准**：
  1. sandbox 执行必采 `memoryMaxBytes` + `peakRssBytes`（`oomKilled` 允许因内核/daemon 能力缺失记 unavailable）；字段缺失必须给 unavailable 原因，不写 0。
  2. 执行抛错 / 超时路径保留快照（不再因 finally 丢弃）。
  3. action 执行器结果显式 `resource: { unavailableReason }` 或等价字段，UI / 导出不显示为 0。
  4. container 既有资源读数零回归。
  5. lint / typecheck / 定向 vitest 通过。
- **不做什么**：不采宿主级 OOM 与 `dmesg` 关联（保留 backlog）；不改 30 分钟上限；不为 action 执行器引入宿主采集。
- **依赖**：M46.4 资源采集实现；M57.1 的 sandbox 真实执行路径（report-only 即可，fix 放行不是前提）。
- **交付物**：3-4 commits / 8-12 files / 350-550 行。
- **风险与缓解**：docker stats 采样开销 → 低频采样 + 超时保护；字段缺失被读成 0 → 显式 unavailableReason + 视图断言。

### M59.5 沙箱镜像双架构自包含冒烟与安全姿态（P2 🚀📚）

- **目标**：镜像内 sandbox 自包含入口在 amd64 / arm64 都可运行，发版后自动取证；安全姿态（rootful / userns / 网络面）单一口径成文。
- **范围**：
  - `apps/platform/docker/smoke-test.sh`：新增 sandbox 入口断言（容器内 `node /app/sandbox/bin.mjs --version` + `skills doctor`），由构建期冒烟与 `post-release-smoke` 共同消费；`.github/workflows/docker.yml` 的 `post-release-smoke` 把该断言结果写入 Job Summary。构建期 `Dockerfile:181-186` 的 sandbox 自检已存在（M57.1，`e548c332`），作为依赖而非本批新增。
  - `docs/design/governance/executor-sandbox.md`、`executor-sandbox-implementation.md`、`sandbox-security-governance.md`：fix 放行后的状态、网络面偏离收口、rootful / userns 边界与已知限制。
  - `docs/guide/deployment.md`（如需）：运行面提示。
- **验收标准**：
  1. `smoke-test.sh` 新增 sandbox 断言后，amd64 构建期冒烟与 arm64 发版后原生冒烟均通过（arm64 档由 `post-release-smoke` 取证；无发布窗口时按阶段收口要求记「未证实」）；注入回归（移除镜像内 `/app/sandbox/skills` 或改坏版本串）使断言失败，证明其灵敏。
  2. 发版后 `post-release-smoke` 的 Job Summary 含 sandbox 入口断言结果；失败仅告警不改发布结论。
  3. 三篇设计稿状态 / 偏离 / 已知限制同批翻转且无 stale 表述（`rg` 复核）。
  4. `pnpm run gates:docs` 20 项通过。
- **不做什么**：不改镜像构建架构与 QEMU 口径；不重建历史镜像；不引入 rootless 之外的新隔离机制。
- **依赖**：M59.1 / M59.2；M58.4 的 `post-release-smoke` 与 `scan-image-tags`；构建期双架构自检见 `apps/platform/Dockerfile:181-186`（`e548c332`，run `43156533556` 双架构 success）。
- **交付物**：2-3 commits / 6-8 files / 200-350 行。
- **风险与缓解**：arm runner 成本 → 仅构建期与发版冒烟各一次；文档状态翻转遗漏 → 按检查点矩阵三处同源扫描。

### 质量门

- 逐原子：`pnpm run lint:check`（涉样式另跑 `lint:css:check`）+ `pnpm typecheck` + 定向 vitest；改 `packages/*/src` 后先 `pnpm -r build` 再 typecheck；含测试改动的原子至少跑一次 workspace 全量 `pnpm test`。
- 执行器 / 沙箱改动：引擎 + 平台定向套件 + gated sandbox e2e（`SANDBOX_E2E=true`）；发布链改动记录一次 `release:preflight` 或 dry-run 证据。
- 文档面：`pnpm run gates:docs`（20 项）+ 设计稿改动跑 `check:doc-size` / `check:doc-governance` 无新增 warning。
- 阶段收口：`regression:phase-close` + A 阶段 Review Gate 放行 + 推送后 CI 回执。

### 阶段收口要求

- M59.1-M59.5 全部闭环，验收证据落 `artifacts/`（gitignored）并在归档块引用命令与 run id。
- 沙箱 fix 的负例必须留痕：非白名单外联被拦 / 交付失败分支清理 / 取消未落定 / force-fail 终态不变各一组。
- 未验证项（arm runner 首跑、真实 GHCR 拉取、真实目标仓库 PR）写「未证实」并登记 backlog，不以「设计已覆盖」替代。

### 追加临时待办（不占阶段条目编号）：运行结论「无写入」语义与状态一致性修复（P1 🛡️）

> **来源与授权**：2026-11-13 用户提交 `runs-logs-20261113-045612.txt`（733 条运行第 1 页）复盘后明确授权插队并优先于 M59 原子执行。按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)「追加临时待办」口径登记：追加在阶段末尾、不分配编号、不占既有条目位置。

- **目标**：让「本次无写入」只表示「告警确实都处理完了」，而不是把「全部被拦截 / 前置失败 / 回滚」一并说成无事可做；同时消除「有提交却判 failed」的状态矛盾。
- **现象（2026-11-13 第 1 页实证）**：
  1. 有告警的 completed 运行 21 条全部 0 写入；仅 1 条实际提交（`cmyr-skills-agents` undici overrides），且该 run 平台态为 `failed / orchestration_failed`，日志却是 `completed exitCode 0` + `Committed fix changes`。
  2. 4 条运行 pristine install 因 `ERR_PNPM_BROKEN_LOCKFILE ... duplicated mapping key` 失败、依赖升级链已跳过，随后仍输出 `Lockfile already compliant — no repair needed`（`picgo-plugin-optimization` / `hono-template` / `rsshub-never-die` / `tinyfish-mcp`）——基线失败与「已合规」在 1.7s 内自相矛盾。
  3. 单包多告警逐条打印：`rss-image-download` 12 条 nodemailer、`auto-backup-database` 13 条、`rss-resources-download` 13 条，日志无法判读「12 条 = 1 个包」。
  4. 运行级终点只有 `[skip] Verification ... no writes in this run`，不汇总拦截构成；报告侧已有 `alertOutcomes` / `summary.skipped`（cross-major / subdirectory-manifest / peer-only / override-protected），但日志与平台运行详情没有把它变成结论。
- **范围（≤10 文件）**：
  - `packages/engine/src/fixers/pnpm/index.ts`：定位 `classifyLockfileFailure` 与基线安装结论不一致的输入 / 时序；前置失败时不得返回「合规」。
  - `packages/engine/src/app/repo-fix-finalize.ts`：收官结论改为「0 修复 + 按原因汇总」，`no-write` 保留为「未验证」原因，不再作为唯一结论。
  - `packages/core/src/report/alert-outcomes.ts`（或同级聚合 helper）：按包聚合 skipped（同包取最高 target + 条数），供日志与报告共用。
  - `apps/platform/app/components/run-detail-dialog.vue` + i18n：运行详情展示拦截构成与交付状态。
  - 对应单测 / e2e。
- **验收标准**：
  1. 四类样本可重放或单测命中：12 条 nodemailer → 日志 / 报告聚合为 1 个包 + 12 条被拦截；4 个 broken lockfile → 不再出现 `Lockfile already compliant`；vite peer-only → 明确「需人工」原因；undici 提交 run → 状态与交付字段一致。
  2. 存在 blocked / failed 告警的运行，报告与运行详情不得把「无写入」作为唯一结论；`verificationSkipped='no-write'` 语义不变（只描述未验证），另设告警处置汇总。
  3. 同一包多条告警在日志与报告中聚合为一行。
  4. `pnpm run lint:check` / `pnpm typecheck` / 定向 vitest / `check:contract-freeze` 通过；报告字段变化同步契约冻结清单。
- **不做**：不放宽跨 major 自动升级门槛；不自动修目标仓库 `pnpm-lock.yaml` 损坏（只诊断 + 提示人工）；不改验证链条数与顺序；peer-only 的「改 manifest 直接依赖」修复路径单列 backlog（见候选），不在本项夹带。
- **依赖与风险**：日志 / 报告文案变更会触及既有断言与平台导出，须同批更新；聚合改变 skipped 计数口径，须在 [dependency-fixer-records.md](../design/modules/dependency-fixer-records.md) 与契约冻结清单同步；若 `classifyLockfileFailure` 根因落在基线工作区差异（执行器面），改动面可能越过 10 文件阈值 → 按设计文档硬阈值补 governance 设计稿或拆批。
- **交付物**：6-8 commits / 8-11 files / 500-750 行。
- **容量影响评估（§3.1.1）**：约 20-30% 阶段基线（分母 19-25 commits / 2500-3800 行）；累计插队 1 批（<3）；无既定外部窗口冲突 → 不触发再平衡；执行顺序置于 M59.1 之前。
- **§3.4 交叉核验（2026-11-13）**：① 归档扫描 `无写入|no writes|no-write|Lockfile already compliant` → M56 已闭环 `verificationSkipped='no-write'`（仅验证跳过原因）与 M51 `deliverySkips`，均不含「逐告警处置汇总 / 前置失败与合规互斥」；② `git log --oneline -- packages/engine/src/app/repo-fix-finalize.ts packages/engine/src/fixers/pnpm/index.ts` → 最近为 `7a3df7f8`（0 写入跳过后验证），无本项实现；③ 代码 anchor：`repo-fix-finalize.ts:131-145`（no-write 仅看 `fixed===0 && !lockfileRepaired`）、`helpers.ts:543-566`（classify ok → "already compliant"）、`pnpm/index.ts:548-553`（ok → `changed:false`）、`repo-fix.ts:160-180`（install 基线失败只跳过升级链）、`upgrade-alert.ts:116-119`（peer-only 记 skipped）。

---

## 上一阶段

M58（发布链可信收口）已于 2026-11-12 归档：执行记录见 [archive/todo-archive-phases-m58.md](archive/todo-archive-phases-m58.md)，路线图详情见 [archive/roadmap-phases-m58.md](archive/roadmap-phases-m58.md)，本批经验沉淀见 [experience-archive §八十七](../design/governance/experience-archive-§79-§85-ops-release.md#八十七、m58-归档批次经验沉淀-发布执行器内嵌门禁与-token-产物所在工作流验证-文档机制断言取证-工作流级负例)。
