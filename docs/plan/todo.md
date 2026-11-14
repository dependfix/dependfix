# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M59 沙箱 fix 与执行可靠性**（2026-11-12 规划；4 原子 + 4 批插队，原 M59.5 于 2026-11-13 再平衡移出） |
| 下一阶段（未规划） | 用户 2026-11-12 四期决策第三期「平台减法与页面治理」；第四期「文档与 AI 治理」；候选不预先分配阶段编号 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（阶段索引 + [archive/](archive/) 分片；M0-M58 全部已归档） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M58 已归档；M59 进行中） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段：M59 沙箱 fix 与执行可靠性

> **目标**：把沙箱从「只跑 report-only」推进到「可在容器内自包含执行 fix / fix-and-pr 并交付」，同时收口三类执行可靠性缺口（取消落定与工作目录竞态、run 起点条件写、资源采集覆盖面）。镜像面双架构冒烟与安全姿态原 M59.5 已按 §3.1.1 再平衡移出 backlog（2026-11-13）。
> **来源**：用户 2026-11-12 四期决策第二期「沙箱 fix 与执行可靠性」（同日决策：交付模型取 **A 沙箱内完全自包含**、四项可靠性全部纳入，见下方决策记录）；backlog 上收 4 条候选（沙箱 fix 出站白名单代理 / 取消后落定与清理竞态 / force-fail 与续用整行写回 / 执行资源采集扩展）+ 聚合 1 条 M57.1 / M58.4 残余（镜像内 sandbox 入口双架构冒烟与安全姿态；**2026-11-13 再平衡移出 backlog**）。
> **用户决策（2026-11-12）**：① 交付模型 = 容器内 clone + fix + commit + push + PR，平台只接收结果；② 执行可靠性四项全部纳入本阶段。
> **容量基线（逐原子交付物求和，执行角色预估口径）**：17-22 commits / 49-67 files / 2300-3450 行（2026-11-13 再平衡后重算：M59.1 6-8 + M59.2 4-5 + M59.3 4-5 + M59.4 3-4；files 19-25 + 12-16 + 10-14 + 8-12；行 1000-1400 + 500-800 + 450-700 + 350-550）。**类型平衡**：主类型 🛡️3（M59.1 / M59.2 / M59.3）+ 🛠️1（M59.4）；🚀 缺口显式标注（原 M59.5 已移出 backlog）；🧪 内嵌各原子（M59.1 新增测试文件 3-4 / M59.3 新增用例 ≥6）；🎨 缺口显式标注——源于用户 2026-11-12「四项全部纳入」决策（非 AI 裁剪），UX 面由第三期「平台减法与页面治理」承接。
> **执行顺序**：M59.1 → M59.2 → M59.3 → M59.4（先放开沙箱执行面，再补自包含交付，随后收口运行状态与资源可观测）。**2026-11-13 插队**：追加临时待办「运行结论语义与状态一致性」先于 M59.1 执行（用户决策；不分配阶段编号，容量评估见该条目正文）。**同日第二批插队**：追加临时待办「未验证邮箱用户登录锁死与自助恢复」排在前一项之后、M59.1 之前（用户决策；不分配编号）。**同日第三批插队**：追加临时待办「SMTP 配置在容器运行时不生效」排在最前（用户决策；不分配编号；累计 3 批 → 命中 §3.1.1 阈值 1）。**容量再平衡（2026-11-13，用户确认）**：移出 M59.5 → backlog；插队 3 批（2026-11-13）。**同日第四批插队（2026-11-14）**：沙箱镜像不可配置导致线上执行失败（用户报障，blocker 级功能缺失）——阈值 1 已由 2026-11-13 再平衡消化，本次约占阶段基线 3-5%，不再触发新移出。
> **D 阶段决策点**：D1 出站代理启动位置（默认容器内 CLI 进程内复用 network-audit，不引入 sidecar）；D2 交付失败时远端分支清理归属（默认平台依据结果 branch 名清理，容器内不重复清理）；D3 取消宽限期策略（默认保持 10s 上限 + 未落定则延迟清理并落 `_pending` 诊断，不做无限延长）；D4 action 执行器资源采集口径（默认显式标注「不适用」并保持字段存在，不采集宿主）。
> **§3.4 阶段启动交叉核验（2026-11-12 实测）**：① 归档扫描 `sandbox fix|出站白名单|取消后落定|force-fail|资源采集|sandbox 冒烟` → 无同题闭环（M57.1 仅 report-only，其镜像内 `/app/sandbox` 构建期自检已覆盖双架构、M58.4 仅镜像 health、M10 T1002 仅验证链、M46.4 仅 container、M57.2 仅终态写回）；② `git log --oneline -- <相关路径>` + `git log --all --grep="sandbox fix|egress|force-fail|资源采集"` → 无同题实现批次；③ 代码 anchor：`sandbox-executor.ts:30` 仅 `report-only`、`:114-134` 第二道闸、`scan-orchestrator.service.ts:449` 降级判定、`engine-run.ts` 的 `ABORT_GRACE_MS=10_000`、`container-executor.ts:496/521/524` 宽限后仍清理、`force-fail.post.ts:84` 整行 save、`scan-orchestrator.service.ts:273-318` 续用起点整行 save、`resource-usage` 仅 container 接入；④ backlog 4 条候选前提与当前代码一致，残余聚合项见 M57.1 / M58.4 归档正文；⑤ backlog 上收 4 条（41 → 37），速查表与基线同步；2026-11-13 再平衡移出 M59.5（40 → 41）。

### M59.1 沙箱 fix 自包含执行与出站策略（P1 🛡️）

> **状态**：✅ 已闭环（2026-11-13 起，2026-11-14 结项；用户确认以当前证据结项）。已交付：运行级外联审计（安装链 / 验证链 / 交付命令共用代理与记录；`RunResult.networkAudit` / `networkViolations` / `summary.networkViolations|networkAudited`；报告 `Network Violations` 段、运行详情与导出披露；违规使出口码非 0 且运行判 `failed`）；沙箱 fix / fix-and-pr 放行（出站策略第二道闸、容器内 clone→CLI、allowlist env 注入；策略缺失落 `sandbox_egress_blocked` 审计事件且不通知，与「启动降级」的 `sandbox_degraded` 区分）；编排层不再对 fix 降级；`SANDBOX_CLONE_BASE_URL` 支持镜像 / 自建 Git 源（其 host 必须命中出站白名单，否则 `sandbox_clone_host_not_allowed`）。
>
> **真实容器取证（2026-11-14）**：`pnpm --filter dependfix build:sandbox` 重建 bundle → `FROM dependfix-platform:e2e + COPY packages/cli/sandbox` 生成镜像 → gated 用例 `server/services/executor/sandbox-fix-real.test.ts`（`SANDBOX_FIX_E2E=true`）通过（镜像 tag `dependfix-sandbox:local`，可用 `SANDBOX_FIX_E2E_IMAGE` 覆盖）：出站策略未被拒绝、容器内 `/tmp/repo` clone 成功、自包含 CLI 启动并经哨兵回传结构化结果（占位 token → API 401，`errors` 非空、exit≠0）、`spec.mounts` 为空；本环境 `github.com` 被网络策略阻断，clone 用 GitLab 公开夹具（用例变量 `SANDBOX_FIX_E2E_CLONE_BASE`，默认 `https://gitlab.com`，用例会把该 host 并入 allowlist——生产等价做法是写入 `DEPENDFIX_ALLOWED_DOMAINS`）。收口增量经 PR #242（Test / E2E / Coverage / Visual / CodeQL 全绿，merge `7430abdc`）。
>
> **结项口径（2026-11-14 用户确认）**：AC1 以「bootstrap 级真实容器取证 + token-gated 用例就位」结项——完整「clone → 安装 → 修复 → 验证」链的取证受环境与凭据约束（本机 `github.com` 出站被阻断，CI 无 token），未取得真实 token 证据；`tests/e2e/sandbox-fix.e2e.test.ts` 保持就位，具备凭据与环境时补跑即可，不需改代码。直连外联按 AC2 口径转 backlog 候选。

- **目标**：sandbox 容器内可完成 clone → 安装 → 修复 → 验证的 fix 执行链；尊重代理 env 的工具在连接级走 deny-by-default 白名单（非白名单 502 拒绝并判运行失败），命令输出中的 URL 只入审计记录（依据 [security.md §5.3.1](../standards/security.md)），undici 直连属已知边界（backlog 候选）；执行面仍不挂载宿主目录。
- **范围**：
  - `apps/platform/server/services/executor/sandbox-executor.ts`：`buildSpec` 注入代理/白名单与最小 token；`buildCmd` 增加容器内 bootstrap（`git clone` 到 `/tmp/repo` 后 `cd` 执行 CLI fix）；`SANDBOX_ALLOWED_MODE` 第二道闸**收紧为策略判定并保留拒绝分支**（未注入代理 / allowlist 为空时 fix 仍返回 `sandbox_fix_requires_egress_policy` 且不 clone）。
  - `apps/platform/server/services/scan-orchestrator.service.ts:449`：fix / fix-and-pr 不再因 `sandbox_fix_requires_egress_policy` 降级；保留 sandbox 不可用降级，事件语义同步（`orchestrator:719-769`）。
  - 引擎出站审计：`packages/engine/src/runners/network-audit.ts` + `packages/engine/src/fixers/*`（安装链注入代理 env，与验证链同源）；`packages/core` 的 `RunResult` **需新增**外联审计字段（引擎侧现为 `verification-runner.ts` 的 `networkAudit` / `networkViolations`，平台零消费）。
  - 平台结果面：结果持久化 + 执行详情 / 导出展示 fix 路径的外联违规与 allowlist 命中摘要（新增数据面，不是只改展示）。
- **验收标准**：
  1. sandbox + `fix` 在夹具仓库完成容器内 clone + 安装 + 修复 + 验证，宿主无工作目录、无挂载（`docker inspect` 断言）。**等价性依据**：gated 用例断言 `buildSpec(ctx).mounts` 为空，且 `DockerAdapter` 的挂载参数（`--mount` / `--volume`）都由 `spec.mounts ?? []` 循环生成、为空时不追加——两条合起来与 `docker inspect` 的 Mounts 为空等价，无需额外拉取容器元数据。
  2. 尊重代理的客户端访问非白名单域名被连接级拦截（502），进入结果 `networkViolations` 并在执行详情与导出可见；违规不写成「成功」（平台状态机判 `failed` / `network_violation`）。**口径对齐（2026-11-13）**：命令输出里的 URL 只入审计记录、不构成违规（[security.md §5.3.1](../../docs/standards/security.md) 2026-08-25 误报实证后定稿）；undici 直连绕过代理 env 属**已知边界**，纳入 backlog 候选（评估 `NODE_USE_ENV_PROXY` 路线），不在本原子内强行落地。
  3. 白名单命中（registry / GitHub API / 镜像站）不误报；仓库级 registry 发现（`registry-discovery`）扩展域在沙箱内同样生效。
  4. `report-only` 行为不回归；sandbox 不可用仍降级 container 并保留 `sandbox_unavailable` 事件。（直连外联负例见「不做什么」。）
  5. `pnpm run lint:check` / `pnpm typecheck` / 定向 vitest / gated sandbox e2e 通过；`packages/*/src` 改动后先 `pnpm -r build`。
- **不做什么**：不做 push / PR（归 M59.2）；不改 container 执行语义与镜像非 root 基线；不引入宿主挂载；不放宽 `report-only` 的告警源白名单；**不把命令输出 URL 判为违规**（`security.md §5.3.1`），**不为 undici 直连落连接级拦截**（已知边界，backlog 候选评估 `NODE_USE_ENV_PROXY`）。
- **依赖**：M57.1 自包含入口（`/app/sandbox/bin.mjs` + `--result-json`）；`network-audit` 验证链实现；M10 T1002 代理设计。
- **交付物**：6-8 commits / 19-25 files（executor 3 / engine 4-6 / core 2-3 / platform 持久化·详情·导出与测试 7-9 / 文档 3-4）/ 1000-1400 行。
- **风险与缓解**：代理 env 只覆盖尊重代理的工具（undici 直连 → 已知边界，输出 URL 仅审计）；token 暴露面 → 仅注入本次运行凭据、日志脱敏、结果不回传 token；容器内 clone 网络抖动 → 复用 clone 超时/重试口径并在结果归因。

### M59.2 沙箱 fix 自包含交付与失败副作用（P1 🛡️）

> **状态**：🚧 进行中（2026-11-14 起）。已交付：`RunResult.delivery` 契约（status / deliveredBy / branch / commitSha / prUrl / prNumber，可选字段）；引擎 fix 模式 `--push`（自包含 push + delivery 记录）与 fix-and-pr 的 `pushed` → `pr-created` 过渡；沙箱 `fix` 传 `--commit --push`、容器内 credential helper（token 不落 `.git/config`）、执行器按 delivery 映射 `runUrl` / `prNumber`；平台 `shouldPlatformDeliver` 双路径守卫（容器路径正 / 反向用例）；失败 / 取消后的 `dependfix/` 分支清理与 `delivery_branch_cleanup` 审计事件；`summaryJson.delivery` + 运行详情「交付」项。**待办（本原子内）**：gated e2e 两分支（fix 无 PR / fix-and-pr 建 PR）与失败清理的真实容器取证（需 token + `github.com` 可达）。

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

> **状态**：✅ 已闭环（2026-11-13）。取消未落定：记录存活受管子进程 / 最后受管命令 / 取消原因（`describeUnsettledRun`），工作目录移入 `_pending` 延迟清理（reason=`execution_timeout_unsettled`）而非当场删除；起点写回与 force-fail 均改为条件更新（`scan-run-start.ts` 乐观锁 + `affected` 断言 + 结构化跳过日志），批次行同口径。审计：standard **R1 Reject**（RG-B1 取消后计数恒 0）→ 修复 → **R2 Pass**（W7/W8 同批收口）。

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

> **状态**：✅ 已闭环（2026-11-14）。已交付：沙箱容器内 cgroup 采样（v2 / v1 双路径，200ms，覆盖容器内 clone + CLI；bootstrap 失败先回传读数再退出）；独立哨兵回传并在解析后从日志剥离；`buildSandboxResourceUsage` 统一口径（source 白名单、数值有限性校验、`oomKilled=null` 补原因；上限为哨兵 / `max` → null + `limitReason=unlimited`，缺失 / 空 → null 不带原因）；沙箱异常 / 超时 → 显式 unavailable；action 执行器所有返回带 `{ source: 'none', degradedReason }`；container 未预期抛错保留执行窗口快照并留 error 日志；gated 真实容器用例断言 `source !== none`、`samples>0`、`peakRssBytes>0` 且 `peak ≤ limit`。审计：standard **R1 Pass**（W1-W6 / S1-S7）→ 修复 → **R2 Pass**（W7 bootstrap 失败丢快照 + S8-S10 同批收口）。CI：PR #244 Test / E2E / Coverage / Visual / CodeQL 全绿，merge `52d6561d` 的 Test success。
>
> **残余（已披露）**：container 未预期抛错路径缺自动化用例（构造需 mock 内部抛出）；`--cgroupns=host` 等非默认 runtime 下读数会放大到父 cgroup（默认配置实测正常）；容器整体 OOM 被杀时采样器无法回传 → unavailable（物理边界，§7.9 已写明）。

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

### 质量门

- 逐原子：`pnpm run lint:check`（涉样式另跑 `lint:css:check`）+ `pnpm typecheck` + 定向 vitest；改 `packages/*/src` 后先 `pnpm -r build` 再 typecheck；含测试改动的原子至少跑一次 workspace 全量 `pnpm test`。
- 执行器 / 沙箱改动：引擎 + 平台定向套件 + gated sandbox e2e（`SANDBOX_E2E=true`）；发布链改动记录一次 `release:preflight` 或 dry-run 证据。
- 文档面：`pnpm run gates:docs`（20 项）+ 设计稿改动跑 `check:doc-size` / `check:doc-governance` 无新增 warning。
- 阶段收口：`regression:phase-close` + A 阶段 Review Gate 放行 + 推送后 CI 回执。

### 阶段收口要求

- M59.1-M59.4 全部闭环 + 3 批追加临时待办闭环，验收证据落 `artifacts/`（gitignored）并在归档块引用命令与 run id。
- 沙箱 fix 的负例必须留痕：非白名单外联被拦 / 交付失败分支清理 / 取消未落定 / force-fail 终态不变各一组。
- 未验证项（真实 GHCR 拉取、真实目标仓库 PR）写「未证实」并登记 backlog，不以「设计已覆盖」替代；arm runner 首跑随 M59.5 移出，由 backlog 候选承接。
- 归档时在 [archive/index.md](archive/index.md) 批次记录统计「插队批次数量（本阶段 4 批）/ 再平衡移出数量（1 项）」。

### 追加临时待办（不占阶段条目编号）：运行结论「无写入」语义与状态一致性修复（P1 🛡️）

> **状态**：✅ 已闭环（2026-11-13；`fix(deps)` 之外的 5 个 commit：core 报告聚合 / engine 锁文件前置不变式 / engine 运行结论 / platform 终态守卫 / 文档）。审计 deep **R1 Reject**（RG-B1 degraded 诊断被清空 + W1-W6）→ 修复 → **R2 Pass**（W1-W4 同批收口）。残余：真实 4 仓库重放未执行（以真实 pnpm 的 duplicated-key 修复 + known-broken 重建两例替代，见 `index-real-pnpm.test.ts`）；sandbox bundle 为旧副本（发版镜像重建）；`ERR_PNPM_LOCKFILE_*` 同族诊断码未全部纳入（登记 backlog）。

> **来源与授权**：2026-11-13 用户提交 `runs-logs-20261113-045612.txt`（733 条运行第 1 页）复盘后明确授权插队并优先于 M59 原子执行。按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)「追加临时待办」口径登记：追加在阶段末尾、不分配编号、不占既有条目位置。

- **目标**：让「本次无写入」只表示「告警确实都处理完了」，而不是把「全部被拦截 / 前置失败 / 回滚」一并说成无事可做；同时消除「有提交却判 failed」的状态矛盾，并保证 `pnpm-lock.yaml` 结构损坏可自动修复交付。
- **子目标（锁文件损坏自动修复，2026-11-13 用户明确要求）**：
  1. 内容一致的重复键 → 自动去重（保留其余条目与版本解析不变）；无法安全去重时备份后由 manifest 重建锁文件，并在报告标注 `packagesChanged` / `lockfileVersionChanged`。
  2. 成功判据只有一个：`pnpm install --frozen-lockfile` 通过；策略命令 exit 0 不算修复，不得据此收尾。
  3. 基线已判安装失败（含 `ERR_PNPM_BROKEN_LOCKFILE` 特征）时，禁止输出 `Lockfile already compliant`：要么本次修复并提交，要么显式 `PRECONDITION_FAILED` + 原因。
  4. 4 个实测仓库（`picgo-plugin-optimization` / `hono-template` / `rsshub-never-die` / `tinyfish-mcp`）在下一轮应自动产出 `chore(deps):` 锁文件修复提交（或 dry-run 可复现同一动作）。
- **现象（2026-11-13 第 1 页实证）**：
  1. 有告警的 completed 运行 21 条全部 0 写入；仅 1 条实际提交（`cmyr-skills-agents` undici overrides），且该 run 平台态为 `failed / orchestration_failed`，日志却是 `completed exitCode 0` + `Committed fix changes`。
  2. 4 条运行 pristine install 因 `ERR_PNPM_BROKEN_LOCKFILE ... duplicated mapping key` 失败、依赖升级链已跳过，随后仍输出 `Lockfile already compliant — no repair needed`（`picgo-plugin-optimization` / `hono-template` / `rsshub-never-die` / `tinyfish-mcp`）——基线失败与「已合规」在 1.7s 内自相矛盾。**本地复现（pnpm 11.28.5 / 10.5.2）**：`repairLockfile` 的 `REGENERATE` 策略可修复同形 duplicated mapping key（`changed:true`、`-3 lines`），说明修复能力已存在；缺的是「基线已判安装失败时不得走 compliant 捷径」与「in-place 策略无效时的结构兜底」。
  3. 单包多告警逐条打印：`rss-image-download` 12 条 nodemailer、`auto-backup-database` 13 条、`rss-resources-download` 13 条，日志无法判读「12 条 = 1 个包」。
  4. 运行级终点只有 `[skip] Verification ... no writes in this run`，不汇总拦截构成；报告侧已有 `alertOutcomes` / `summary.skipped`（cross-major / subdirectory-manifest / peer-only / override-protected），但日志与平台运行详情没有把它变成结论。
- **范围（≤10 文件）**：
  - `packages/engine/src/fixers/pnpm/index.ts`：① 定位 `classifyLockfileFailure` 与基线安装结论不一致的输入 / 时序（保留 run 目录取证）；② 新增结构损坏兜底策略 `REGENERATE_FROM_MANIFEST`（备份 → 移出损坏锁文件 → 由 manifest 重建 → frozen 验证，失败回滚）；③ 接入 `knownBrokenLockfile` 不变式（基线已判安装失败时禁用 compliant 捷径）。
  - `packages/engine/src/app/repo-fix-finalize.ts`：把基线安装失败（命令 + 诊断特征）透传给 `tryLockfileRepair`，并按「修复成功 / 复检通过 / 前置失败」三态输出；收官结论改为「0 修复 + 按原因汇总」，`no-write` 保留为「未验证」原因，不再作为唯一结论。
  - `packages/core/src/report/alert-outcomes.ts`（或同级聚合 helper）：按包聚合 skipped（同包取最高 target + 条数），供日志与报告共用。
  - `apps/platform/app/components/run-detail-dialog.vue` + i18n：运行详情展示拦截构成与交付状态。
  - 对应单测 / e2e。
- **验收标准**：
  1. 四类样本可重放或单测命中：12 条 nodemailer → 日志 / 报告聚合为 1 个包 + 12 条被拦截；4 个 broken lockfile → 修复成功且 `pnpm install --frozen-lockfile` 通过（`duplicated mapping key` fixture 覆盖「去重」与「重建」两条路径）；vite peer-only → 明确「需人工」原因；undici 提交 run → 状态与交付字段一致。
  2. 存在 blocked / failed 告警的运行，报告与运行详情不得把「无写入」作为唯一结论；`verificationSkipped='no-write'` 语义不变（只描述未验证），另设告警处置汇总。
  3. 同一包多条告警在日志与报告中聚合为一行。
  4. 基线已判安装失败的运行，日志 / 报告不得出现 `Lockfile already compliant`（grep 负例断言）；结构损坏修复产物必须带 `lockfile-repair` action（`success` + `changed`）与 diff 摘要。
  5. `pnpm run lint:check` / `pnpm typecheck` / 定向 vitest / `check:contract-freeze` 通过；报告字段变化同步契约冻结清单。
- **不做**：不放宽跨 major 自动升级门槛；不改验证链条数与顺序；peer-only 的「改 manifest 直接依赖」修复路径单列 backlog（见候选），不在本项夹带；结构损坏修复不得在无法安全去重时静默丢弃条目（重建路径必须标注 package 变化并在报告给出 diff 摘要）。
- **依赖与风险**：日志 / 报告文案变更会触及既有断言与平台导出，须同批更新；聚合改变 skipped 计数口径，须在 [dependency-fixer-records.md](../design/modules/dependency-fixer-records.md) 与契约冻结清单同步；若 `classifyLockfileFailure` 根因落在基线工作区差异（执行器面），改动面可能越过 10 文件阈值 → 按设计文档硬阈值补 governance 设计稿或拆批。
- **交付物**：7-10 commits / 9-12 files / 700-1000 行。
- **容量影响评估（§3.1.1）**：约 25-40% 阶段基线（再平衡前分母 19-25 commits / 2500-3800 行）；累计插队 1 批（<3）；无既定外部窗口冲突 → 不触发再平衡；执行顺序置于 M59.1 之前。
- **§3.4 交叉核验（2026-11-13）**：① 归档扫描 `无写入|no writes|no-write|Lockfile already compliant` → M56 已闭环 `verificationSkipped='no-write'`（仅验证跳过原因）与 M51 `deliverySkips`，均不含「逐告警处置汇总 / 前置失败与合规互斥」；② `git log --oneline -- packages/engine/src/app/repo-fix-finalize.ts packages/engine/src/fixers/pnpm/index.ts` → 最近为 `7a3df7f8`（0 写入跳过后验证），无本项实现；③ 代码 anchor：`repo-fix-finalize.ts:131-145`（no-write 仅看 `fixed===0 && !lockfileRepaired`）、`helpers.ts:543-566`（classify ok → "already compliant"）、`pnpm/index.ts:548-553`（ok → `changed:false`）、`repo-fix.ts:160-180`（install 基线失败只跳过升级链）、`upgrade-alert.ts:116-119`（peer-only 记 skipped）。

### 追加临时待办（不占阶段条目编号）：未验证邮箱用户登录锁死与自助恢复（P1 🛠️）

> **状态**：✅ 已闭环（2026-11-13；AC1 / AC2 / AC4 已落地，AC5 为「除相关 e2e 外通过」，**AC3 按用户 2026-11-13 决策延后**）。已交付：登录页按 `EMAIL_NOT_VERIFIED` 分流 + 重发入口、`sendOnSignIn` 自动补发、429 可读提示、纯分类器与 auth 断言。用户决策（2026-11-13）：管理端代他人重发**延后**（方案逻辑待重新推敲），登记 [backlog](backlog.md#延期-暂缓项) 暂缓项；手动置位 `email_verified` **不提供**。审计：R1 standard **Reject**（RG-B1 管理端必然 400 / RG-B2 SMTP 关时新增入口）→ 范围收缩 → R2 quick **Reject**（RG-B3 todo 未同步）→ R3 quick **Reject**（RG-B4 审计轨迹记录失真）→ 文本修正 → R4 quick **Pass**。残余：① 无「未验证登录 → 重发」e2e（默认 e2e 环境 `requireEmailVerification` 不可达，需专用 SMTP fixture）；② mailer fail-quiet 下「已发送」提示可能为假（既有邮件通道语义）；③ `sendOnSignIn` + 手动重发会重复发信（同一邮箱短时多封）。

> **来源与授权**：2026-11-13 用户提交登录失败截图（DevTools 响应体 `{ message: "Email not verified", code: "EMAIL_NOT_VERIFIED" }`；截图未显示状态码，better-auth 1.7.18 源码映射为 403）后明确授权插队到当前阶段。按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)「追加临时待办」口径登记：追加在阶段末尾、不分配编号、不占既有条目位置。

- **目标**：让「邮箱未验证」成为用户看得懂、能自救的状态，而不是被伪装成「邮箱或密码错误」、只能改库解封的死局。
- **现象与根因（2026-11-13 实读）**：`apps/platform/nuxt.config.ts`（当时 `:90`）`smtpEnabled: !!process.env.SMTP_HOST` → `apps/platform/server/utils/auth.ts:208` `requireEmailVerification: options.smtpEnabled`（`:251` `sendOnSignUp` 同源；`smtpEnabled` 已由第三批临时待办删除，改为运行时按 `smtpHost` 派生）→ better-auth 1.7.18 对 `email_verified = false` 的账号在 sign-in 抛 `APIError.from("FORBIDDEN", EMAIL_NOT_VERIFIED)`（`node_modules/better-auth/dist/api/routes/sign-in.mjs:350`，`better-call` 把 FORBIDDEN 映射为 403）。锁死成因：① 配置 SMTP 之前创建的存量账号；② 验证邮件发送失败被 fail-quiet 吞成日志（`auth.ts:253-270`）；③ 链接过期 / 一次性 token 已用；④（待验证假设）OAuth 账号 IdP 未返回邮箱时可能保持未验证，需实测 social 回调下 `requireEmailVerification` 是否同样生效（同错误码在 OAuth 回调路径也存在，`sign-in.mjs:206`）。无法自救的原因：`login.vue:66-68` 把任意 `signInError` 统一映射为 `invalidCredentials`；登录页无重发入口；`users.vue:265-269` 只渲染未验证标签，无重发 / 置位动作。
- **范围（源文件 ≤6 + 测试 1-2，合计 5-8 文件）**：
  - `apps/platform/app/pages/login.vue`：按 `signInError.code` 分支；`EMAIL_NOT_VERIFIED` 走独立文案 + 重发入口，其余错误保持现文案。
  - 先评估复用 better-auth 内建 `emailVerification.sendOnSignIn`（sign-in 被拒时自动重发，`sign-in.mjs:339-349`）；若满足需求则前端只补文案与提示，自建重发入口仅在「需明确提示 / 管理端触发」时保留。
  - `apps/platform/app/utils/auth-client.ts`（或同级 composable）：封装 `send-verification-email` 调用、频控与结果提示。
  - `apps/platform/app/pages/users.vue` + `apps/platform/i18n/locales/{zh-CN,en-US}.json`：用户列表仅保留未验证标签，**不提供**代他人重发（原生端点会话约束，见 AC3 与设计稿 §7）；手动置位仅在安全侧决策通过后实施。
  - `apps/platform/server/utils/auth.ts`（如需）：验证邮件发送失败从静默日志改为可观测（事件或注册响应 hint）。
  - 测试：`app/utils/auth-errors.ts` 纯分类器 5 例（正 / 反向）+ `auth.test.ts` 的 `sendOnSignIn` 双态断言；「未验证账号登录 → 重发」定向 e2e **未落地**（默认 e2e 环境 `requireEmailVerification` 由 `smtpHost` 派生、不可达，需专用 SMTP fixture），已登记残余。
- **验收标准**：
  1. 未验证账号登录：页面显示「邮箱未验证」类文案并提供重发，不显示「邮箱或密码错误」；密码错误仍显示原文案（正 / 反向用例各一）。
  2. 重发调用成功后有明确提示；重发端点受 better-auth 内置特殊规则限制 **60s / 3 次**（`rate-limiter/index.mjs:314-320`；`/sign-in*` 为 10s / 3 次，平台全局 60s / 60 次仅作兜底，`auth.ts:69-80`）时提示可读，不暴露内部错误码；E2E 因 `disableIpTracking` 不限流，429 路径需单测或生产口径验证。
  3. **按用户决策延后（2026-11-13）**：管理端代他人重发无法复用 better-auth 原生端点（会话内要求 `session.user.email === body.email`，否则 400 `EMAIL_MISMATCH`）→ 用户列表仅保留未验证标签并引导登录页自助恢复；代发方案延后（登录 [backlog](backlog.md#延期-暂缓项) 暂缓项），手动置位 `email_verified` 明确不提供。
  4. `NUXT_SMTP_HOST`（容器运行期名）未配置时行为零变化：无重发入口、无新增阻断、注册后直接可用。
  5. `pnpm run lint:check` / `pnpm typecheck` / 定向 vitest 通过；相关 e2e 未落地（见残余①）。
- **不做**：不放宽 `requireEmailVerification` 与 SMTP 开关的绑定语义；不改本项之外的认证流程；不做存量账号批量置 verified 的自动迁移（口径待评估，若需要单列）；不新增后端重发端点（复用 better-auth 既有端点）；重发入口只在「已确认凭证正确但邮箱未验证」的响应后出现，避免新增邮箱枚举面。
- **依赖**：better-auth 1.7.18 的 `emailVerification.sendOnSignIn` 与 `/send-verification-email` 端点（含内置特殊限流规则，`rate-limiter/index.mjs:306-320`）；平台全局 `rateLimit`（`auth.ts:69-80`）；执行顺序前置为「运行结论语义」临时待办之后、M59.1 之前。第三批临时待办已将 `getAuthInstance` 入参由 `smtpEnabled` 改为 `smtpHost`，本批按新签名实施。同题候选已于 2026-11-13 登记至 [backlog](backlog.md#待上收候选-评估完成-等待用户决策)「待上收候选」（管理端代他人重发验证邮件），为本条目的关联未闭环项。
- **风险与缓解**：邮件发送与限流交互 → 复用 better-auth 端点并做可读提示；i18n 双语文案 → 同批更新 `zh-CN` / `en-US`；管理端置位属安全决策 → 需用户确认后才实现；重发暴露「该邮箱已注册」的信息面 → 仅在 `EMAIL_NOT_VERIFIED` 响应后提供，文案统一为「若账号存在且未验证，验证邮件已发送」。
- **交付物（实际，2026-11-13）**：2 commits（代码 / 文档）/ 8 改 + 2 新增（`auth.ts` + `auth.test.ts`、`login.vue`、`auth-errors.ts` + 测试、i18n ×2、`platform-auth-users.md`、`backlog.md`、todo 本段）/ 约 150 行；未新增后端端点与 DB 契约。
- **容量影响评估（§3.1.1）**：约 10-15% 阶段基线（再平衡前分母 19-25 commits / 2500-3800 行）；累计插队 2 批（<3，未命中阈值 1）；阈值 2 按单批计（本批 10-15% < 50%，两批合计 35-55% 仅作参考）；剩余窗口可容纳 → 阈值 3 未命中，不触发再平衡；执行顺序置于「运行结论语义」之后、M59.1 之前。
- **§3.4 交叉核验（2026-11-13）**：① 归档扫描 `邮箱验证|EMAIL_NOT_VERIFIED|emailVerified|验证邮件|requireEmailVerification` → 仅 `todo-archive-phases-m6-m7-t711.md:33` 记「SMTP 未配置自动跳过邮箱验证」，无本项实现；② `git log --oneline -- apps/platform/app/pages/login.vue apps/platform/app/pages/users.vue apps/platform/server/utils/auth.ts` → 最近为 `ca0f82e9` 登录页品牌化 / `d0e4a497` trustedOrigins / `c2644ccf` 注释清理，无本项；③ 代码 anchor：`login.vue:66-68` 仍统一映射 `invalidCredentials`；`apps/platform/app` 层 `send-verification-email|sendVerificationEmail` 零命中，服务端仅 `auth.ts` 配置 + `auth.test.ts` 用例 + mailer 注释；`users.vue:265-269` 仅渲染标签。

### 追加临时待办（不占阶段条目编号）：SMTP 配置在容器运行时不生效（runtimeConfig 构建期烘焙）（P1 🛠️）

> **状态**：✅ 已闭环（2026-11-13；`94f36ed8` 代码修复 + 本批文档一致性收口；审计 R1 standard **Reject**（B1 文档「注入方式」块仍把邮件列为白名单外）→ 修复 → R2 quick **Pass**（W1 补「新 compose 同时到位」、S1 镜像归因、S2 置位手段同批收口））。残余：容器内真实 SMTP 投递冒烟未做（无凭据/未重建镜像，登记本条目残余）。

> **来源与授权**：2026-11-13 用户报告「本地已配置 SMTP、线上通知页显示 SMTP 未配置」，调查后明确选择方案 B（代码根治）并授权插队到当前阶段。按 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)「追加临时待办」口径登记：追加在阶段末尾、不分配编号、不占既有条目位置。

- **目标**：线上仅凭 `NUXT_SMTP_HOST`（+port/user/pass/from）即可生效，并消除「`smtpHost` 有值但 `smtpEnabled=false`」的行为割裂。
- **现象与根因（2026-11-13 实读）**：`nuxt.config.ts:85-90` 用 `process.env.SMTP_*` 生成 runtimeConfig 默认值 → 构建期求值并烘焙进产物（`.output/server/chunks/nitro/nitro.mjs` 实测 `"smtpHost": ""` / `"smtpEnabled": false`，`nitro.envPrefix: "NUXT_"`）；`Dockerfile:108` `COPY . .` 而 `.dockerignore:17` 排除 `.env*`，构建期无 SMTP 配置；`docker-compose.yml` 的 `environment:` 白名单无 SMTP 项。运行时普通 `SMTP_*` 既不进容器、也不会映射到 runtimeConfig → `EmailNotificationChannel.isAvailable()`（`email-channel.ts:29-31`，`Boolean(config.smtpHost)`）为 false → 通知页 `channelAvailable=false` 显示「SMTP 未配置」，mailer 走 `{delivered:false, mode:'noop'}`。本地 `nuxt dev` 每次启动重新求值 nuxt.config 并加载 `.env`，故正常。
- **范围（≤9 文件：源文件/配置 4 + 规范与文档 4 + 测试 1）**：
  - `apps/platform/server/utils/auth.ts`：删除 `smtpEnabled` 入参（`getAuthInstance` options 与 `getAuth` 调用处），改为运行时派生 `Boolean(config.smtpHost)` 传给 `buildAuth`；`buildAuth` 内部 `smtpEnabled` 语义不变。
  - `apps/platform/nuxt.config.ts`：删除 `smtpEnabled` key，注释改为「由服务端按 `smtpHost` 非空派生，运行期覆盖只认 `NUXT_SMTP_*`」。
  - `apps/platform/docker-compose.yml`：`environment:` 补 `NUXT_SMTP_HOST` / `NUXT_SMTP_PORT` / `NUXT_SMTP_USER` / `NUXT_SMTP_PASS` / `NUXT_SMTP_FROM`（`${SMTP_*}` 插值），注释写明运行时前缀规则。
  - `apps/platform/.env.full.example` + `docs/guide/configuration.md`（含 `docs/i18n/en-US/guide/configuration.md` 镜像）：SMTP 段区分「compose 插值名 `SMTP_*`」与「容器运行期名 `NUXT_SMTP_*`」，并注明不再需要 `NUXT_SMTP_ENABLED`。
  - `docs/standards/platform.md` §4.1 + `docs/design/governance/platform-auth-users.md` §11：认证配置口径由 `smtpEnabled` 改为按 `smtpHost` 运行时派生，与代码同批同步。
  - 测试：`apps/platform/server/utils/auth.test.ts` 补「`smtpHost` 非空 → `requireEmailVerification` / `sendOnSignUp` 为 true、`updateEmailWithoutVerification` 为 false」断言；保留现有 `smtpEnabled=false` 降级用例（改为空 host）。
- **验收标准**：
  1. 仅设 `NUXT_SMTP_HOST`（不设任何 `*_SMTP_ENABLED`）时，`requireEmailVerification` / `sendOnSignUp` 为 true、`updateEmailWithoutVerification` 为 false（单测断言，不依赖构建期 env）。
  2. `smtpHost` 为空时既有降级行为零变化（fail-quiet 回调 + noop 投递用例全绿）。
  3. `rg "smtpEnabled" apps/platform/nuxt.config.ts apps/platform/server/utils/auth.ts` 只剩 `buildAuth` 内部派生变量，无 runtimeConfig key 残留。
  4. compose `environment:` 含 5 个 `NUXT_SMTP_*` 且注释写明「运行时覆盖只认 NUXT_ 前缀」。
  5. 文档五处（`.env.full.example` / `configuration.md` / en-US 镜像 / `platform.md` §4.1 / `platform-auth-users.md` §11）不再把裸 `SMTP_*` 描述为容器运行期变量；`pnpm run check:docs` 通过。
  6. `pnpm run lint:check` / `pnpm typecheck` / 定向 vitest 通过；不涉及 `packages/*/src`，无需 `pnpm -r build`。
- **不做**：不改 SMTP 未配置时的降级语义；不引入独立 `SMTP_ENABLED` 开关（派生即可）；不改邮件模板、投递策略与通知渠道逻辑；不做 `NUXT_SMTP_PORT` 非数字的额外容错（超出本项范围）。
- **依赖**：无前置任务；口径依据 [platform.md §7.6](../standards/platform.md#_7-6-运行时-env-开关的-ui-状态暴露用只读端点) 与 [§10.4](../standards/platform.md#_10-4-队列模式自动降级必须含「消费者维度」) 的「runtimeConfig 只认 NUXT_ 前缀」既有规范；契约冻结清单只覆盖 DB 表列，删 `smtpEnabled` key 不触发契约变更。
- **风险与缓解**：删除 runtimeConfig key 会让「显式 `NUXT_SMTP_ENABLED=false` 关闭验证」这一非文档化用法失效 → 属预期收敛，文档同步说明；旧镜像已烘焙 `false` 需重建镜像才生效 → 交付说明标注；`smtpPort` 运行期覆盖为字符串的形态由 destr 解析为数字，无需额外处理。
- **交付物**：2-3 commits / 7-9 files（`auth.ts`、`nuxt.config.ts`、`docker-compose.yml`、`.env.full.example`、`configuration.md` ×2、`platform.md` §4.1、`platform-auth-users.md` §11、测试）/ 150-260 行。
- **容量影响评估（§3.1.1）**：约 5-15% 阶段基线（再平衡后分母 17-22 commits / 2300-3450 行）；累计插队 3 批 → 命中阈值 1；**再平衡已执行（用户确认 2026-11-13）**：移出 M59.5 至 backlog（见阶段头部「容量再平衡」行与 backlog「2026-11-13 阶段容量再平衡移出」）；阈值 2 单批 5% < 50%（若按累计口径并以再平衡前分母计，commits 约 48-89%、行约 28-65%，但阈值 1 已触发并完成再平衡，结论不变），阈值 3 未命中。
- **§3.4 交叉核验（2026-11-13）**：① 归档扫描 `smtpEnabled|SMTP_HOST|NUXT_SMTP` → `todo-archive.md` / `archive/*.md` 零命中（机制层认知见 [experience-archive §三十/§三十四](../design/governance/experience-archive-§29-§35-integration.md)，无本项实现）；② `git log --oneline -- apps/platform/nuxt.config.ts apps/platform/server/utils/auth.ts apps/platform/docker-compose.yml` → 最近为 `e548c332` 镜像沙箱入口 / `ace9307b` 跨大版本默认值 / `c9cc7e96` nuxt.config 类型修正，主题检索 `smtpEnabled|NUXT_SMTP` 仅 `6f009378`（better-auth 三邮件回调接入 mailer，即该 key 的引入批次），无修复；③ 代码 anchor：`nuxt.config.ts:90` 仍为 `!!process.env.SMTP_HOST`、`auth.ts:418` 仍传 `config.smtpEnabled`、`docker-compose.yml` environment 无 SMTP 项、产物 `nitro.mjs` 烘焙 `smtpHost: ""`。

---

### 追加临时待办（不占阶段条目编号）：沙箱镜像不可配置导致线上执行失败（P1 🛠️）

> **状态**：✅ 已闭环（2026-11-14；PR #245，merge `91c2e3e1`；审计 R1 Reject（UI 证据缺失）→ 补 e2e / 迁移 / 证伪用例 → R2 Pass）。根因：默认镜像名 `dependfix-platform:latest` 仅本地存在、仓库级无镜像字段。已交付仓库级 `sandboxImage`、语法校验、表单与编排接线、失败分类；e2e 覆盖显隐 / 校验 / 回显。

> **来源与授权**：2026-11-14 用户报告截图（`扫描执行失败（sandbox_image_unavailable）`）+ 明确要求「应该要可以配置 docker 镜像地址」。属 [规划规范 §3.1](../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 插队例外第 3 类（用户报告的 blocker 级功能缺失），按「追加临时待办」登记：不分配编号。

- **范围**：`Repository.sandboxImage` + 迁移与契约清单；`utils/docker-image.ts`；`schemas/repository.ts`；`api/repos/index.ts` / `[id].ts`；`scan-orchestrator.service.ts`（镜像优先级）；`run-failure-classify.ts`；`repo-form-dialog.vue` + `types/platform.ts` + 中英 i18n；迁移 / API / 编排 / 校验测试；configuration / quick-start / 设计稿 §7.2。
- **验收标准**：① 仓库级镜像优先于 `SANDBOX_IMAGE` → 默认（正 / 反向用例）；② 非法引用 400、空值归一为 null；③ 表单在 sandbox 执行方式下可见并可保存 / 回显，切换容器后隐藏；④ `sandbox_image_unavailable` 落 `runtime / deterministic`；⑤ `lint:check` / `typecheck` / 定向 vitest / e2e 通过。
- **不做**：不做镜像可达性预检（执行期 docker 拉取即判定）；不改沙箱非 root / cgroup / 超时基线；不引入 digest 强制（文档建议钉定）。
- **容量影响评估（§3.1.1）**：约 3-5% 阶段基线（约 25 文件 / ~250 行）；阶段累计插队 4 批；阈值 1 已于 2026-11-13 通过移出 M59.5 消化，本次不再触发新的再平衡；剩余验证预算按阶段质量门执行。

#### 后续：沙箱镜像与平台镜像解耦（✅ 2026-11-14）

> **状态**：PR #246（`5d4be34b`）双变体、#247（`36bd6c71`）三源、#248（`c62ebe59`）ACR 置末；Docker run `43570307949` 双架构 6 manifest 绿。
>
> **决策**：用户指出「只为沙箱却拉整个平台运行镜像不合理」，选择方案 A —— **同一 Dockerfile 多 target**（`sandbox` slim / `sandbox-full`，独立发布），默认镜像改为发布 slim 沙箱镜像（按平台构建版本取 tag）。本轮实施，不拆独立 workflow。

- **优先级**：P1（用户已确认本轮实施）。
- **范围**：Dockerfile（`cli-builder`、精简/共用工具链、`sandbox`+`sandbox-full` target）；docker.yml（两变体 smoke、三 registry digest/manifest、sandbox 裸版本 tag）；`sandbox-executor.ts` 默认镜像解析与测试；compose/env 示例/configuration/quick-start/设计稿 §7.2。
- **体积实测**：平台 815MB / slim 320MB / full 744MB；默认 slim，需源码编译回退用 `-full`。
- **验收标准**：① 两 target 均可 `--user 100:100` 运行（slim 另验无 g++）；② 均不触发 Nuxt 构建；③ 两变体推送三 registry + 双架构 manifest；④ 默认解析有单测；⑤ 门禁通过；⑥ 平台镜像与 `smoke-test.sh` 零回归。
- **不做**：不拆独立 workflow / Dockerfile；不移除平台镜像内的 `/app/sandbox`（保留显式指定兼容路径）；不做镜像版本握手（登记为后续候选）。
- **依赖**：`#245` 仓库级镜像字段；release 的 `platform_version`；ghcr/ACR 新镜像名推送权限。
- **交付物**：22 文件 / +550 −67（Dockerfile 1 / workflow 1 / 执行器与注释 7 / 配置与 i18n 5 / 文档 8）。
- **三源回退（追加）**：跟随平台 registry，回退 Docker Hub / ghcr / ACR；逐源 inspect/pull，全失败报 `sandbox_image_unavailable`。
- **残余**：arm64 冒烟、编译回退提示待后续。
- **容量影响评估（§3.1.1）**：同一临时待办的后续细化，不新增批次计数；发布链需 CI 取证。

## 上一阶段

M58（发布链可信收口）已于 2026-11-12 归档：执行记录见 [archive/todo-archive-phases-m58.md](archive/todo-archive-phases-m58.md)，路线图详情见 [archive/roadmap-phases-m58.md](archive/roadmap-phases-m58.md)，本批经验沉淀见 [experience-archive §八十七](../design/governance/experience-archive-§79-§85-ops-release.md#八十七、m58-归档批次经验沉淀-发布执行器内嵌门禁与-token-产物所在工作流验证-文档机制断言取证-工作流级负例)。

