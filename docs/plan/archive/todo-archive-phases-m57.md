# 待办归档分片：M57 执行面可信与发布验证收口

> 本分片由 2026-11-10 M57 阶段归档批次从 [todo.md](../todo.md) 迁出；正文保留规划、执行记录与收口口径，相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m57.md](roadmap-phases-m57.md)；本批经验沉淀见 [experience-archive §八十六](../../design/governance/experience-archive-§79-§85-ops-release.md#八十六、m57-归档批次经验沉淀-并列次键用例区分度-终态条件写-门禁未知态-受管块插入-视觉连带)。

---

> **归档摘要**：5 原子 + 3 条追加临时待办全部闭环（M57.1 沙箱执行器复用 report-only 真实执行 / M57.2 队列终态条件写 / M57.3 回归与审计真实性 / M57.4 平台 typecheck 覆盖 node config / M57.5 列表并列次键；追加：线上 schema 漂移恢复清单 + 启动期检测 / 仓库表单错误定位与时长单位 / 新建仓库跨大版本默认值 env），M57.6（发布后镜像运行时冒烟）按 §3.1.1 再平衡移出至 backlog。阶段窗口首父链 **32 commits**、唯一 diff **139 文件 / +4165 −1054**（`git rev-list --first-parent --count fcce9c5f^..HEAD` / `git diff --shortstat fcce9c5f^..HEAD`，2026-11-10 归档实测）。
> **推送终态（2026-11-10 归档时点）**：5 原子与 3 条追加项全部已推送（`origin/master` = `5d6ad40a`，三次推送的 Test workflow 均 success）；本批归档 / 沉淀 commit 待推送（核验：`git rev-list HEAD ^origin/master --count`）。
> **回归记录口径**：本批未跑真实周回归 / phase-close 回归（回归窗口最新条目为 M57.3 的编排 dry-run，自身标注「不代表真实回归执行结果」）；放行依据为三次推送的 Test 结论（run 42804103768 / 42813511725 / 42825971834 均 success）与各原子定向读数；`security:audit-deps` 结论未按 [安全规范 §5.6 判据](../../standards/security.md) 单独取证（Test job 为退出码判定），归档不据此宣称依赖面 clean。
> **审计终态**：M57.4 standard Pass / M57.5 standard Pass / M57.2 deep Pass（含复审）/ M57.1 deep Pass（R1 A 分区 Pass、B 分区 Reject → R2 Reject → R3 quick Pass）/ M57.3 deep Reject → R2 deep Pass → R3 quick Pass；追加项各一轮 standard / deep 审计后放行（schema 漂移 R1 Reject → R2/R3 Pass；表单时长 R1 三分区 Pass → R2/R3 Pass；跨大版本默认值 R1 两分区 Reject → R3 Pass）。逐条证据见正文各条「执行记录 / 审计」段。

---
## M57：执行面可信与发布验证收口（2026-11-09 规划）

**阶段目标**：把「执行端可信」从平台视图回收到运行时底座——沙箱执行器恢复 report-only 真实执行，队列终态不再被迟到 worker 覆盖，回归与审计门禁不再假绿，平台静态检查与列表顺序可复算；仓库表单错误可定位到字段、时长以可读单位配置（平台与引擎环境变量同步支持单位写法）。

**用户决策（2026-11-09）**：方向 A（执行面可信收口）；沙箱执行器「复用」已于 2026-11-09 裁定，本阶段只放行 report-only，fix / fix-and-pr 继续降级到 container。

**容量基线**（测量方：执行角色，P 阶段预估；分母供 [§3.1.1](../../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 再平衡使用）：

- 5 原子 / 15-22 commits / 35-51 文件 / 1750-2900 行（= 各原子「交付物」逐条求和，不设倍数口径；2026-11-09 再平衡移出 M57.6 后的口径；不含追加临时待办（~554 / ~800-1050 / ~150-220 行）的增量）。
- **类型平衡**：🛡️3（M57.1 / M57.2 / M57.3）+ 🛠️2（M57.4 / M57.5）；测试覆盖内嵌各原子「范围 / 验收标准」，不单列 🧪 原子。发布冒烟（原 🚀🧪）已按下述再平衡移出；本批按用户 2026-11-09 方向 A 以执行面可信为主。
- 执行期插队批次累计 ≥3 或插队工作量 ≥ 本基线 50% 时触发再平衡。

**执行顺序**：M57.4 → M57.5 → M57.2 → M57.3 → M57.1。

- 前 4 项为小步可信度回补，可先恢复静态检查 / 分页稳定 / 队列终态 / 回归门禁；沙箱需独立 rootless daemon 与最长验证窗口，放最后避免阻塞阶段。
- M57.3 合并「周回归 registry 假绿」与「回归窗口插入点」两项（同属回归工具真实性，独立验收点保留）。
- M57.1 的 fix / fix-and-pr 放行依赖出站白名单代理接入沙箱执行路径（T1002 代理候选），不在本阶段。

**容量再平衡（2026-11-09，§3.1.1 阈值 2）**：已完成的生产事故插队（schema 漂移，~554 行）+ 同日同批用户授权追加（表单错误定位与时长单位 ~800-1050 行 + 新建仓库跨大版本默认值 ~150-220 行）累计 1504-1824 行，对再平衡前原基线 2000 行下界为 75%-91%（对当前基线 1750-2900 行下界为 86%-104%）。按用户 2026-11-09 决策移出最低优先级原子 M57.6（发布后镜像运行时冒烟）至 [backlog](../backlog.md)（保留 8 要素并标注移出原因），阶段保留 5 原子 + 2 批追加临时待办（3 个条目：生产事故 schema 漂移 / 表单错误定位与时长单位 / 新建仓库跨大版本默认值；后两项同批授权）；插队批次 2（< 3），移出后满足再平衡要求。

**上游证据**：

- M51.6 残余：列表查询并列次键（`api/runs/[id].get.ts` 等 5 处仅 `createdAt` / `severity` 排序）。
- M51 残余：平台 typecheck 未覆盖 `.nuxt/tsconfig.node.json`（实测 TS5052 + `nuxt.config.ts` 2 个既有错误）。
- M49.3 边界：周回归 `security:audit-deps` 在 registry 故障时假绿；M44 回归窗口插入点嵌套进上条受管块。
- 2026-11-05 镜像复核：`platform-0.5.0` 在 ACR 解析为单架构；arm64 未做运行时冒烟。
- 2026-11-09 用户裁定：沙箱执行器复用（自包含入口 + report-only 真实执行 + 入口恢复）。

**§3.4 阶段启动交叉核验（2026-11-09 实测）**：① 归档扫描 → 七项候选均只作为 M51 / M55 残余登记，无已闭环同题；② `git log` 相关路径 → 无实现提交（沙箱仍 `echo` 占位、编排层仍整行 `save`、发布安全脚本无采集时点）；③ 代码 anchor → `sandbox-executor.ts:208` 占位 `echo`、`scan-orchestrator.service.ts:509` 整行 `save`、`scripts/shared/regression-window.mjs` 插入点、`.nuxt/tsconfig.node.json` 实测 TS5052、5 处列表仅单键排序；④ 前提与 backlog 一致（沙箱入口三闸仍在：编排降级 / UI 强制迁移 / 文档状态）；⑤ backlog 同步——7 项候选上收（6 项自候选评估中 + 1 项自待上收候选；「周回归假绿」与「回归窗口插入点」合并为 M57.3），候选池 50 → 44。

### M57.1 [P1 🛡️] 沙箱执行器复用：report-only 真实执行

- **状态**：✅ 已闭环（2026-11-10；审计 R3 quick Pass）。

- **目标**：sandbox 在独立 rootless 容器内真跑引擎，结果契约与 `ContainerExecutor` 同构；先只放行 report-only，fix / fix-and-pr 在代理接入前继续降级。
- **优先级**：P1（用户 2026-11-09 裁定复用；当前 `buildCmd` 是 echo 占位 → 假成功）。
- **范围**：
  - 自包含入口：`packages/cli` 增 sandbox 打包目标（`noExternal` 内联 + 复制 skills 静态目录）、`DEPENDFIX_SKILLS_DIR` 覆盖、`apps/platform/Dockerfile` 复制到 `/app/sandbox/`。
  - 真实执行：CLI 增 `--result-json`（显式 `{exitCode, result}`，不复用报告副产物 `summary.json`）→ `buildCmd` 改 clone → 运行 CLI → 读结果；`parseRunResult` 契约不变。
  - 入口恢复：移除编排 / schema / UI 三处入口闸、补 i18n 与 `quick-start.md` / `deployment.md` 入口状态段、提供可选 `sandbox-daemon` compose 片段（示例级，不纳入本原子验收）、gated e2e（`SANDBOX_E2E=true`，与 container 结果对照）。
  - 既有设计稿与镜像同步：`executor-sandbox.md` 状态 / 缺口段、`executor-sandbox-implementation.md` 的「入口关闭 / 恢复后目标形态」四处、`docs/i18n/en-US/guide/quick-start.md` 镜像、两处「缺口见 backlog」指针改指 M57.1 条目（既有 governance 设计稿更新，不新写设计稿；归档后条目见本分片）。
  - 降级守卫：`executorKind=sandbox` 且模式非 report-only 时降级 container，并记 `sandbox_fix_requires_egress_policy`。
- **验收标准**：
  1. 无 workspace `node_modules` 时 `node /app/sandbox/bin.mjs --version` 与平台一致、skills doctor 通过。
  2. report-only 返回真实 `RunResult`（fixture 告警数与 container 一致）。
  3. API / UI 可恢复 sandbox 入口且无 `sandbox_entry_disabled`；e2e 覆盖 report-only 真实执行。
  4. 降级矩阵不回归：daemon 不可用 → degraded；运行期 errno → failed；fix 模式 → degraded + `sandbox_fix_requires_egress_policy`。
  5. 安全基线逐项核验（非 root 100:100 / 不挂 docker.sock / 网络 / cgroup / 超时）+ 威胁建模评审。
- **不做什么**：不把 T1002 代理接入 sandbox 执行路径（另条候选）；不做 K8s / Helm；不自动安装 daemon；不改 container / action 路径；不为单可信仓库默认启用。
- **依赖**：外部 rootless daemon（quick-start 已有步骤）；`SANDBOX_RUNTIME` / `SANDBOX_IMAGE` 既有；T1002 代理接入是 fix 模式放行的前置。
- **交付物**：6-9 commits / 17-23 文件 / 900-1400 行。
- **子批次与独立验收点**（§1.1 拆分依据，单原子 >10 文件 / 800 行）：① 自包含入口 + `--result-json` + 真实执行 → AC1 / AC2；② 入口恢复 + 设计稿 / 镜像 / 指针同步 + 降级守卫 + 安全基线 → AC3 / AC4 / AC5。
- **执行记录（2026-11-10）**：① 自包含入口——新增 `packages/cli/tsdown.sandbox.config.ts`（`deps.alwaysBundle` 内联运行期依赖 + `copy` 包清单与 `skills/dependfix-remediator`，输出 `packages/cli/sandbox/` 并 gitignore），`package.json` 增 `build:sandbox`；`resolveProductSkillSourceDir` 支持 `DEPENDFIX_SKILLS_DIR`（含 skill 的根目录），`resolveCliVersion` 增 `./package.json` 候选（沙箱产物同目录读取）。② 结果契约——CLI 增 `--result-json <path>`，执行后写 `{exitCode, result}`；写失败 fail-closed（exit 1），不复用 `summary.json`。③ 真实执行——`SandboxExecutor.buildCmd` 改为 `sh -c` 内运行 `node /app/sandbox/bin.mjs report-only --repo ... --result-json /tmp/result.json`，凭据仅走 env；结果经 stdout 哨兵回传并解析（缺失 / 非 JSON / 结构非法 / transport 矛盾均 `execution_failed`），**不挂载宿主目录**（平台容器与宿主 daemon 路径视角不一致，bind mount 在命名卷部署下必然失败）；`buildSpec` 网络固定 `bridge`（report-only 需访问 GitHub API，且不执行目标仓库代码；`alertSource` 非 `github-dependabot` fail-closed），report-only 不注入 AI Key；`execute()` 对非 report-only 返回 `sandbox_fix_requires_egress_policy`（第二道闸）。④ 入口恢复——移除 repository / scan schema 的 sandbox 拒绝、编排层强制降级、UI disabled 与存量迁移、retry 归一；编排层恢复 report-only 路由（`SandboxExecutor` + `sandboxLimits` + 执行上限），fix / fix-and-pr 降级 `container` + `sandbox_fix_requires_egress_policy`（只落库不通知）；`sandbox_unavailable` 启动降级照常通知。⑤ 镜像——Dockerfile builder 增 `build:sandbox`、minifier 复制 `/app/sandbox`，runtime 构建期自检 `--version` 非 unknown + skills doctor 可用；镜像引用优先 `SANDBOX_IMAGE` / 平台 `DEPENDFIX_IMAGE`（compose 注入；本地构建覆盖文件同步），不再默认指向发布链路不存在的 tag。⑥ 文档——executor-sandbox 状态 / 路由 / 镜像 / 部署片段、sandbox-security-governance §7.1 基线核验、quick-start zh/en、deployment zh/en、platform §3.8。**口径偏差**：report-only 不需要 git clone（告警走 GitHub API，与 `ContainerExecutor` 同源），clone 随 fix 模式放行（T1002 前置）；本原子只放行 report-only，故未实现 clone 分支。**证据**：bundle 1.4 MB、`node /app/sandbox/bin.mjs --version` = 1.0.0（无 workspace node_modules）、skills doctor 0 error；镜像内非 root 冒烟通过；真实 gated e2e（container / sandbox 同仓库 report-only，`severity-threshold=all`）两者均返回 2 条告警（minimatch medium / deepmerge low），`tests/e2e/sandbox-report.e2e.test.ts` 1 passed；`repos-crud` 12 passed；platform 189 files / 2470 passed / 9 skipped；CLI 176 passed；根 typecheck 7 项目通过；lint 0 error（root 8 warning / platform 4 warning）；`gates:docs` 20 项通过。**审计**：R1 分区 A deep **Pass**（RG-W1~W6 / S1~S3）、B deep **Reject**（B1 宿主路径 bind mount 在命名卷部署下不可回传 + B2 默认镜像不在发布链路）→ 修复（去宿主挂载 + stdout 哨兵 + 镜像链 `DEPENDFIX_IMAGE`）→ R2 A deep **Pass**、B deep **Reject**（新增 B3：`docker-compose.yml` 缩进致 YAML 非法）→ 修复 + compose CI 门禁 → R3 quick **Pass**（B3 closed；4 项收尾已修净）。审计记录本地保留于 `artifacts/review-gate/2026-11-10-m57-1-sandbox.md`（artifacts 不入库）。 **实际交付物**：7 commits / 63 文件 / +1126 −695 行（含测试与文档；超原 17-23 文件预估的原因是 schema/API/UI/e2e 用例随入口恢复同步改写）。
- **风险与缓解**：bundle 动态 `require` / 可选依赖 / `--version` 读 `package.json` → 冒烟三连（版本 / skills / 一次 report-only）；镜像体积 → 用 bundle 不用 `pnp`；daemon 环境差异 → 降级矩阵用例。

### M57.2 [P2 🛡️] 队列终态不被迟到 worker 覆盖

- **状态**：✅ 已闭环（2026-11-10；审计 R1 deep Pass，0 blocker；RG-W1~W3 / RG-S1~S7 已修净）。

- **目标**：清理侧（孤儿回收 / 超时）把 run 置 `failed` 后，仍在执行的 worker 不得用整行 `save` 覆盖终态。
- **优先级**：P2（队列可靠性；已有清理后终态被覆盖的实例）。
- **范围**：`apps/platform/server/services/scan-orchestrator.service.ts`（最终写库改条件更新 / 重读短路）、`scan-queue.ts` 相关路径、定向单测与集成用例、`platform.md` / 设计口径同步。
- **验收标准**：
  1. 构造「清理先置 failed + worker 后完成」→ 终态保持 failed / 不被覆盖，且留审计说明。
  2. 正常路径（pending/running）完成写回不回归；`reuse` 与 `force-fail` 路径兼容。
  3. 条件更新用读取时状态（乐观锁）或「仅 pending/running 才写」，有 `affected` 断言。
- **不做什么**：不改队列驱动 / 重试语义；不改 force-fail 入口；不引入分布式锁。
- **依赖**：M38 队列进程隔离；[开发规范 §5.1 规则表 5.1.36](../../standards/development.md) 条件 UPDATE 口径。
- **交付物**：2-3 commits / 3-5 文件 / 150-300 行。
- **执行记录（2026-11-10）**：新增 `persistRunTerminalState`（`scan-orchestrator.service.ts`）——正常完成与 catch-all 两处终态写回由整行 `save` 改为条件更新：只写终态迁移列（status / finishedAt / summary / error / runUrl / exitCode / 环境性失败数 / 资源四列 / 失败分类三列 / logs / prNumber / updatedAt），`WHERE id = :id AND status IN ('pending','running')`；`affected = 0` 时**不改库**，回读库内终态行作为返回值（回执与真实状态一致）、**跳过终态通知**（清理侧已就同一 run 发过，避免重复投递），并输出 `run_terminal_write_skipped` 结构化告警（runId / repositoryId / attemptedStatus / observedStatus）；留痕选进程日志而非 `audit_event`，因后者语义边界只收执行器 / 环境健康、配置留痕与对外副作用。`affected` 缺省按成功处理，与 `stale-cleanup` 既有口径一致。用例独立成 `scan-orchestrator-terminal.test.ts`（编排主用例文件已接近 `max-lines` 上限）：① 执行期间模拟清理侧条件更新为 `failed` → 迟到 worker 正常完成；② 同前置 + executor 抛错；两例断言终态、失败归因、`finishedAt`、`summaryJson` 不被回写、告警含 attempted / observed、且通知不重复；③ 正常路径（pending → completed）不回归且通知只发一次；④ `reuse=true` 复用终态行后本轮写入生效、旧失败快照已重置。mutation 3/3（两处改回整行 `save` → ①② 失败；移除 `written` 守卫 → ① 的通知断言失败）。**实际规模**：6 文件（5 改 + 1 新增测试文件）/ +337 −12（`git diff --numstat` +94/−12，新测试文件 243 行；含 `platform.md` 指针条、`queue-stale-recovery §9` 残余翻转、backlog 候选与候选池复算、本条记录）。证据：定向 47 passed（新文件 4 例 + 主用例文件 43 例）；platform 全量 190 files / 2479 passed / 9 skipped；`lint:check` 0 error（root 8 / platform 4 存量 warning，平台上限 11）；`typecheck` exit 0；`gates:docs` 20 项；`lint-md:check` 通过。**残余**：① 条件更新之前的 `reconcileAlerts` 仍按本次执行结果写告警明细，跨 run 一致性由下一次扫描 reconcile 收敛；② 本次执行已产生的分支 / PR 副作用不回滚；③ force-fail 端点自身仍是整行 `save`（反向竞态）→ 已登记 backlog 候选。
- **风险与缓解**：条件写过严会吞正常完成 → 以「重读 + 仅未终态才写」双保险，并用正常路径用例锁定。

### M57.3 [P2 🛡️] 回归与审计真实性

- **状态**：✅ 已闭环（2026-11-10；审计 R1 deep Reject → 修复 → R2 deep Pass → R3 quick Pass，0 blocker；N1 / S1~S3 已修净）。

- **目标**：周回归的 `security:audit-deps` 在 registry 故障时不再上报通过；回归窗口新 entry 不再嵌套进上一条受管块。
- **优先级**：P2（门禁假绿；日志结构污染）。
- **范围**：`scripts/regression/run-periodic-regression.mjs`（registry 故障识别 → `unknown / pending` 而非 pass）、`scripts/shared/regression-window.mjs`（插入点改顶层）、单测与夹具、`testing.md` / `planning.md` 口径同步。
- **验收标准**：
  1. 模拟 registry 故障（非 0 + registry 特征）→ 步骤结果不是 pass（unknown / pending + 可见告警）。
  2. 连续写入两个窗口 entry → 后者为顶层 `## YYYY-MM-DD`，不嵌套、既有内容零改动。
  3. 单测覆盖 registry 故障 / 正常通过 / 插入点三种形态；`regression:weekly` 试运行不回归。
- **不做什么**：不改周回归命令集与 profile；不改窗口日志字段（除插入点）。
- **依赖**：M49.3 边界；M44 回归窗口初始化。
- **交付物**：3-4 commits / 4-6 文件 / 250-450 行。
- **执行记录（2026-11-10）**：① registry 假绿——`run-periodic-regression.mjs` 新增 `detectIndeterminateReason`（编排层内联标记，不再单独导出仅供测试的批量映射）：仅对 `security:audit-deps` 生效，命中 registry 网络特征（`ERR_PNPM_META_FETCH_FAIL` / `ETIMEDOUT` / `EAI_AGAIN` / `ENOTFOUND` / `ERR_SOCKET_TIMEOUT` / `fetch failed` 等）或「exit 0 但缺审计结论行」时标为 `indeterminate`；汇总层在 `ok` 判定前先分流为 warning（`结论未知`），**不冒充 blocker**（registry 抖动不整批阻断），也不再触发 blocker 短路；证据文档写 `结果: UNKNOWN` + `未知原因`、回归窗口写 `label=UNKNOWN`、JSON artifact 增 `indeterminate` / `indeterminateReason`，并新增「UNKNOWN 不升级 blocker 但必须 warning 可见」的 blocker 规则行。② 窗口嵌套——`regression-window.mjs` 插入点改为「首个受管块 `<!-- regression-window:start:` 标记」与「首个 `YYYY-MM-DD` 标题」中更早者（受管块的 `##` 日期标题在块内，只按标题定位会把新块插进上一条的 start/end 之间）；实测旧逻辑已在本地 `artifacts/regression/current.md` 留下 4 start / 4 end 全配对但三层嵌套交叉的受管块（阅读面只剩最外层标题）。③ 文档——`testing.md §6.9` 增「退出码 0 ≠ 通过（UNKNOWN 与 PASS 分离）」与「受管证据块插入必须顶层」两条，`planning.md §4.1` 增「回归记录结论强度」（UNKNOWN 不得作为归档放行证据）。用例：窗口新增 2 例（受管块在前插入到标记之前、连续写入两条为顶层且旧内容零改动），回归新增 14 例（registry 故障 exit 0 / 非 0、真实回显 + 漏洞行、真实回显 + 无结论行、ANSI 着色结论行、噪音 + 已取得结论、真实漏洞非 0、干净、非 audit 步骤、dry-run、真实回显漏洞失败汇总为 Reject、证据与窗口 UNKNOWN 可见性、汇总 warning 分流）；mutation 复核 4 组（插入点回退为标题定位 → 窗口 2 例失败；重加开关名特征并去掉回显剥离 → 回显用例失败；移除「结论行优先」→ 干净审计与噪音用例失败；移除 ANSI 剥离 → 着色用例失败）。**试运行**：`pnpm regression:weekly -- --dry-run` → `Review Gate: Prepared`，窗口新条目落顶层、既有条目未被嵌套。**实际规模**：9 文件 / +405 −10（脚本 2 / 测试 2 / 规范 2 / 检查点矩阵 1 / 周回归 workflow 1 / todo 记录 1）。证据：定向 72 passed（两个脚本测试文件）；`scripts/**` 全量 53 files / 1101 passed；`lint:check` 0 error（root 8 / platform 4 存量 warning）；`typecheck` exit 0；`gates:docs` 20 项（`lint:md:check` 通过）。**审计**：R1 deep **Reject**（RG-B1：`ignore-registry-errors` 是开关名而非故障信号——`pnpm run` 把整条命令回显进捕获输出，把它当特征会让每次真实执行都命中，真实漏洞失败被降级为 UNKNOWN 放行）→ 修复：删除该特征、新增 `stripCommandEcho` 剥离以 `$` / `>` 开头的回显行、非 0 分支改为「有结论行即以结论为准」；RG-W1 补真实回显形态夹具（含回显 + 漏洞行 / 含回显 + 无结论行）、RG-W2 补 `code-quality-checklist` 矩阵行、RG-W3 `summary.indeterminate` + 证据 / 窗口 / Job Summary 暴露未知步骤计数、RG-S1/S2 收口。R2 复审出 N1（`FORCE_COLOR` 下结论数字被 ANSI 包裹 → 真实漏洞失败可被误判未知）→ `stripCommandEcho` 增 ANSI 剥离 + 对应用例；同时补「真实回显 + 漏洞失败 → 汇总 Reject」整合断言。mutation 复核：重加开关名特征并移除回显剥离 → 回显用例失败；移除「结论行优先」→ 干净审计与噪音用例失败。
- **风险与缓解**：fail-closed 会阻断周回归 → 用 `unknown / pending` 显式状态，仅在真实失败时阻断。

### M57.4 [P2 🛠️] 平台 typecheck 覆盖 node config

- **状态**：✅ 已闭环（2026-11-09；审计 R1 standard Pass 后按 W 项修复并拆为 3 commits，见「执行记录」）。

- **目标**：`pnpm --filter @dependfix/platform typecheck` 实际检查 `.nuxt/tsconfig.node.json`，并修掉两个既有错误。
- **优先级**：P2（配置面长期不在门禁内）。
- **范围**：`apps/platform/package.json`（typecheck 脚本，脚本内先 `nuxt prepare` 且 CI 同序，可实证）、`nuxt.config.ts`（icon `rel` 联合、i18n locales readonly）、CI 注释 / 文档。
- **验收标准**：
  1. 在 node project 注入一个类型错误 → typecheck 非 0（当前会静默放过）。
  2. 两个既有错误清零；`emitDecoratorMetadata` / `experimentalDecorators` 组合告警必须通过显式 tsconfig override（或等价配置）消除，不得以文档说明代替修复。
  3. CI 增量耗时可控（记录前后实测）。
- **不做什么**：不关闭 strict / 不扩大 `skipLibCheck`；不改 Nuxt 大版本。
- **依赖**：无（`nuxt prepare` 已在 CI 链内）。
- **执行记录（2026-11-09）**：`nuxt typecheck` 只查主 project，新增 `apps/platform/tsconfig.node.json`（extends 生成的 node project，覆盖 `experimentalDecorators`）并把平台 typecheck 脚本改为 `nuxt typecheck && vue-tsc --noEmit -p tsconfig.node.json`；修复两个既有错误——favicon PNG 兜底由 `rel="alternate icon"` 改标准 `rel="icon"`（按 type / sizes 选择），`i18n.locales` spread 时显式复制可变数组（保留 `nuxtI18n` 的 `as const` 字面量）。负例实证：node project 注入 `const probe: string = 42` → `vue-tsc` exit 2（此前 `nuxt typecheck` 静默放过）；修复后 `pnpm --filter @dependfix/platform typecheck` exit 0（约 23s；纯 `nuxt typecheck` 约 19s + node 段约 2.5-2.9s）。`docs/guide/tech-stack.md` 同步覆盖说明。实际 5 文件（含新增 tsconfig）/ 3 commits（fix / build / docs）。
- **交付物**：2-3 commits / 3-5 文件 / 200-350 行。
- **风险与缓解**：`nuxt typecheck` 内部先 `writeTypes` 生成 `.nuxt`（含 `tsconfig.node.json`），wrapper 的 base 恒存在；CI 已有 prepare 步骤，顺序与本地一致。

### M57.5 [P2 🛠️] 列表查询并列次键

- **状态**：✅ 已闭环（2026-11-10；审计 standard Pass，0 blocker；W 项已修净）。

- **目标**：家族共 6 处列表在主排序键并列时顺序稳定（`runs/index` 已由 M56.2 覆盖，本原子补 5 处），分页不重不漏。
- **优先级**：P2（视觉 / 截断集合抖动潜伏；M51.6 同 pattern 残余）。
- **范围**：`api/runs/[id].get.ts`（severity）、`api/audit-events/index.get.ts`、`api/pr-checks/index.get.ts`、`api/notifications/index.get.ts`、`api/batch-runs/index.get.ts`（共 5 处新增；`runs/index` 已在 M56.2 完成）、对应单测；若新增检查点口径则同步 `code-quality-checklist` 矩阵（不新增条目则不登记）。
- **验收标准**：
  1. 并列主键时两次查询顺序一致（`createdAt DESC, id DESC` / `severity ASC, id DESC`）。
  2. 分页翻页不重复 / 不丢失；`take(N)` 截断集合稳定。
  3. 6 处均有并列用例（5 处新增 + 1 处沿用既有 `runs/index` 用例）；既有接口返回结构不变。
- **不做什么**：不改筛选语义 / 返回结构；不统一抽列表 composable；不评估 / 不覆盖 `repos` / `schedules` / `credentials` 等其余列表（另条候选）。
- **依赖**：M51.6 已确立的次键口径。
- **交付物**：2-3 commits / 8-12 文件 / 250-400 行。
- **执行记录（2026-11-10）**：5 处补次键——`runs/[id]` 结果明细 `severity ASC, id DESC`；`audit-events` / `pr-checks`（`createdAt DESC, id DESC`，`take(500)` 窗口）；`notifications`（`createdAt DESC, id DESC`，分页）；`batch-runs`（`createdAt DESC, id DESC`，`take(50)` 窗口）；`runs/index` 沿用 M56.2 既有实现，未改。用例统一按「同毫秒并列 + 插入顺序 ≠ id 倒序」构造：`notifications` 显式指定主键解耦插入序与主键序（否则 SQLite 并列返回序可能恰等于 id 倒序，用例失去区分度）、按 `pageSize=1` 翻三页验证不重不漏；`batch-runs` 以 52 行完全并列验证截断窗口固定取 id 最大的 50 行（最小 2 行必被截掉）；`pr-checks` / `audit-events` / `runs` 详情按并列顺序断言并复跑一次确认顺序一致。mutation 5/5（逐处移除次键 → 对应用例各自失败）。连带面：结果明细行序变更使 `scans-run-detail-light` 视觉基线检出 2065 px（ratio 0.01）差异 → 同批重建基线，更新后连跑两次通过、全量视觉 21 passed。`docs/standards/api.md §4` 平台覆盖进度由「见 backlog」改为逐处清单 + 非排他的「已知仍未纳入」口径（`repos` / `schedules` / `credentials`、`scan-history/summary` 统计窗口、`batch-runs/[id]` 子运行列表）。**实际规模**：13 文件 / +199 −5（10 个 ts + 1 张视觉基线 + 2 份文档；文件数超 §1.1 的 10 文件阈值，已按 fix / docs 拆 3 个 commit）。证据：定向 54 passed；platform 全量 2475 passed / 9 skipped；e2e scans / env-events / notifications 27 passed；`lint:check` exit 0（0 error / 4 存量 warning）；`typecheck` exit 0；platform build exit 0；`gates:docs` 20 项；新增行编号标记 0 命中。
- **风险与缓解**：次键为 `id`（主键）无需新索引；`runs/[id]` 有视觉基线 → 详情弹窗复跑视觉。

### 追加临时待办（不占阶段条目编号）：线上 schema 漂移恢复清单 + 启动期漂移检测

- **来源 / 授权**：2026-11-09 用户报告 `https://dependfix.dev` 多页面 `Server Error`，服务端日志 `SQLITE_ERROR: no such column: ScanRun.execution_timeout_ms`（生产可用性事故，属插队例外清单第 3 类），用户明确授权「先写恢复清单，再落地启动期漂移检测 + 测试」。
- **评估结论**：根因 = 线上库 pending migration 未执行（`3000000000000` / `3000000000001` / `3100000000000`，库停在 2026-10-30 schema）；部署 commit `38c35ad0` 已含迁移，`/api/health` = `drift` 前无任何启动期信号。范围收敛为「运维恢复清单 + 只读检测 + health 状态枚举」，不改迁移语义、不做启动阻断。
- **目标**：让「存量库缺列」在启动期与部署自检中可见，并给出可复制的恢复步骤。
- **范围**：`docs/guide/deployment.md` + en-US 镜像（恢复清单 / 故障排查行）；`docs/standards/platform.md` §3.3 / §10.7；`server/database/schema-drift.ts`（检测 + 状态）、`server/database/index.ts`（启动接线）、`server/api/health.get.ts`（`schema` 字段）与对应测试。
- **验收标准**：① 缺列 / 缺表 / 多列三种形态的检测用例通过，自定义 `entityPrefix` 生效；② `synchronize=true` 与 worker 进程跳过、检测异常 fail-open；③ `/api/health` 返回 `schema: ok|drift|unknown` 且无表名 / 列名；④ `pnpm run check:docs` 0 error、`lint-md` 0、定向 vitest 全绿。
- **不做什么**：不做启动阻断 / 自动修复；不检测索引 / 类型差异；不新增公开端点；不在 health 暴露 schema 明细。
- **依赖**：2026-11-09 生产事故取证；`server/database/migrations/*` 为 schema 事实源。
- **交付物**：2 commits / 11 文件 / ~554 行（doc 清单 + 代码与测试 + review 修复；行数按 `git diff` + 新增文件行数实测）。
- **风险与缓解**：检测误报（视图 / 特殊表）→ 只比对 `tableType=regular` 与实体声明列；启动成本 → 冷启动一次、跳过 worker 与 synchronize；信息面 → health 仅状态枚举。
- **残余**：`docker/smoke-test.sh` 的 `schema` 字段断言并入 [backlog](../backlog.md)「发布后镜像运行时冒烟」候选（只断言存在，不锁 `ok`）。
- **容量影响（§3.1.1）**：~2 commits / 11 文件 / ~554 行；本阶段第 1 个插队批次。与第 2 批累计后触发阈值 2，阶段头已记录再平衡结论（移出 M57.6）。

### 追加临时待办（不占阶段条目编号）：仓库表单错误定位与时长单位友好输入

- **来源 / 授权**：2026-11-09 用户提供保存失败截图并明确要求：① 错误提示指明字段、表单报红、提示移入模态框、给出合法时间范围；② 时长默认不要填毫秒长数字，参照 momei 用 `ms` 工具包转换，用户手动配置的时间 / 时长环境变量同步支持。属 [规划规范 §3.1](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 清单外**用户明确授权追加**（不分配阶段编号、不占既有条目位置）。
- **评估结论**：现状 = 服务端 zod issues 已透传（`data.issues`）但前端只取 `message`（"参数校验失败"），字段错误丢失且上抛到表格上方；表单时长以纯分钟文本录入，env 仅接受纯数字毫秒（`parseInt` 还会把 `600ms` 截成 600）。范围收敛为「表单错误可见 + 时长可读 + env 单位兼容」，不改时长存储契约（仍为毫秒）、不改队列 / 执行语义。
- **目标**：① 保存失败在弹窗内展示并定位到字段（红框 + 行内文案 + 首个错误聚焦）；② 时长输入支持 `30m` / `1h` / `90s`，纯数字按分钟兼容，并显示合法范围提示；③ 平台与引擎 / CLI 的时长环境变量支持 `ms` 工具包写法（纯数字按毫秒兼容），非法 / 越界回退默认并告警。
- **范围**：
  - 共享解析：`packages/core/src/utils/duration.ts`（`parseDurationMs` / `formatDurationMs`，`ms@2.1.3` + `@types/ms`）与单测。
  - 表单：`repo-form-dialog.vue`（客户端校验、服务端 issues → 字段映射、弹窗内 `CaomeiMessage`、`invalid` + 行内错误、范围小字）；`repos.vue` 移除表单级页面错误；`/api/settings/execution-limits` 增补 `bounds` 供前端提示与校验。
  - 平台 env：`server/utils/execution-limits.ts`、`services/executor/container-executor.ts`、`plugins/stale-cleanup.ts`、`services/queue/queue-mode.ts`。
  - 引擎 env：`config/index.ts`（`PR_CHECK_TIMEOUT_MS` / `PR_CHECK_RUN_BUDGET_MS` / `JOB_BUDGET_MS` / `MAX_BACKOFF_MS`）、`runners/verification-runner.ts`、`fixers/install-timeouts.ts`。
  - 文档：`docs/guide/configuration.md`（+ en 镜像）、`apps/platform/.env.full.example`、`docs/design/governance/repo-execution-limits.md`、`docs/standards/development.md`（时长 env 规则）、`docs/i18n/en-US/design/mirror-manifest.md`、新治理设计稿（跨 `packages/core` + `packages/engine` + `apps/platform`，按设计文档阈值补写）。
- **验收标准**：
  1. 构造 400（字段非法 / 执行上限超封顶 / 子项超执行上限）→ 弹窗内出现错误摘要与对应字段行内文案 + `invalid` 态，表格上方不再出现该错误；首个错误字段获得焦点。
  2. 时长字段输入 `45` / `45m` / `1h` / `90s` 均换算为预期毫秒；`abc` / `0` / `-5` 判非法并报红；编辑回显为可读单位（`45m` / `1h`）。
  3. 每个时长字段下方显示合法范围（执行上限用动态封顶值），并提示纯数字按分钟。
  4. env `EXECUTION_TIMEOUT_MS=30m` 与 `1800000` 等效；`DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS=2h` 生效；`DEPENDFIX_VERIFY_TIMEOUT_MS=90s` / `DEPENDFIX_INSTALL_TIMEOUT_MS=5m` / `JOB_BUDGET_MS=25m` 等价于对应毫秒；非法 / 越界回退默认并写警告。
  5. 单测覆盖纯数字 / 单位 / 非法 / 越界；e2e 更新为 `45m` 并新增错误定位断言；视觉基线（如受影响）复跑。
  6. `pnpm run lint:check` / `pnpm typecheck` / 定向测试 / `pnpm -r build` / `gates:docs` 全绿。
- **不做什么**：不改仓库级 / 全局时长的毫秒存储契约与 API 字段名；不改队列与执行语义；不把 `ms` 用于非时长数字（并发 / 重试次数等）；不新增语言；不重写整个表单为 schema 驱动。
- **依赖**：momei `utils/shared/duration.ts` 作为参考；`ms@^2.1.3` + `@types/ms`；M57.4 已恢复的平台 typecheck 门禁。
- **交付物**：6-7 commits / 40-48 文件 / 1000-1250 行（实测约 1213 行）。
- **风险与缓解**：纯数字语义歧义（表单分钟 vs env 毫秒）→ 字段小字与 env 文档分别写明；客户端校验与服务端 schema 漂移 → 范围值由只读端点下发，服务端仍为最终裁决，issues 回映射兜底；`ms` v2 为 CJS → 平台 / 核心均显式声明依赖，客户端与服务端各走自己的绑定。
- **容量影响（§3.1.1）**：预估 800-1050 行，实测约 1213 行（原基线 2000 行的 60.6%）；与第 1 批累计约 1767 行（88%），触发阈值 2，按用户 2026-11-09 决策移出 M57.6 → backlog。
- **执行记录（2026-11-09）**：共享解析落 `packages/core/src/utils/duration.ts`（`ms@2.1.3` + `@types/ms`），平台 / 引擎 6 处时长 env 全部改走 `parseDurationMs`（纯数字按毫秒兼容；非法 / 越界回退默认，引擎运行期解析器输出一次 warn）；表单改为可读单位输入（纯数字按分钟），服务端 issues 映射到字段行内错误 + 弹窗内摘要 + 首个错误聚焦，只读端点补 `bounds` 供范围提示。实测：`45m` / `1800000` 等价、`5m` / `300000` 等价；e2e 覆盖客户端与服务端两种定位路径；单测 4642 passed / 10 skipped，e2e 12 passed，视觉 4 passed，lint / typecheck / build / `gates:docs` 全绿。

### 追加临时待办（不占阶段条目编号）：新建仓库「允许跨大版本升级」默认值环境变量

- **来源 / 授权**：2026-11-09 用户要求为「允许跨大版本升级」增加环境变量，设置新建仓库的开关默认值（默认仍关闭，可手动开启）。
- **批次归属**：与上一项同属 2026-11-09 同一轮用户授权请求（同一会话、同一表单字段、连续提出），不计为第 3 个插队批次；阶段头维持「2 批」。
- **评估结论**：既有架构刻意不提供引擎 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` env、Action 无 input（防 CI 自动跨线）。本项只新增平台部署的新建仓库默认值，不构成引擎运行期 env 通道；既有仓库保持原值。
- **目标**：平台部署可用运行期 `NUXT_PUBLIC_ALLOW_MAJOR_UPGRADE_DEFAULT` / 构建期 `ALLOW_MAJOR_UPGRADE_DEFAULT` 把新建仓库开关默认设为开启；默认 `false`。
- **范围**：`nuxt.config.ts` public 默认值（显式优先解析）；`api/repos/index.ts` 单个创建默认；`api/repos/batch.post.ts` 批量导入同口径 + 审计；`repo-form-dialog.vue` 新增表单初始化与默认开启提示；i18n；`tests/setup-nuxt-server.ts` 与 API 用例；`configuration.md`（zh/en）/ `platform.md §6.3` / `contract-freeze §8.3` / `quick-start`（zh/en）/ `.env.full.example`。
- **验收标准**：① 未设置 env 时新建仓库仍为 `false`；② env=true 时单个创建与批量导入的新建仓库均为 `true`，且各登记一条 `major_upgrade_policy_update`；③ 请求体显式 `false` 优先；④ 既有仓库与编辑回显不变；⑤ 引擎 CLI/Action 通道与 `DEPENDFIX_ALLOW_MAJOR_UPGRADE` 仍不存在；⑥ lint / typecheck / build / 定向测试 / e2e / `gates:docs` 全绿。
- **不做什么**：不改引擎 `RuntimeConfig.allowMajorUpgrade` 全局默认；不给 Action 增加 input；不批量改写既有仓库。
- **依赖**：`nuxt.config.ts` public 配置约定；`runtimeConfig` 运行期覆盖；`batch.post.ts` 创建路径。
- **交付物**：2 commits / 20 文件（代码 10 / 文档 9 / 环境示例 1）/ ~160 行。
- **风险与缓解**：默认开启放大跨线升级面 → 仅新建仓库、显式 `false` 优先、创建审计留痕；构建期 / 运行期变量混淆 → 文档分列并标注；批量导入遗漏 → 同口径实现并补用例。

---

## 阶段收口要求（M57）

- **质量门**：逐原子 `pnpm run lint:check`（涉样式时另跑 `lint:css:check`）+ `pnpm typecheck` + 定向测试。
- 改 `packages/*/src` 后先 `pnpm -r build` 再 typecheck；改平台页面 / 详情时跑受影响 e2e 与视觉回归。
- **Review Gate**：每原子至少一轮 `Code Auditor`（standard；M57.1 因打包 / 容器 / 入口三闸升 deep），Reject 须闭环复审。
- **证据**：M57.1 留 bundle 三连冒烟 + gated e2e；M57.2 留竞态用例；M57.3 留 registry 故障与插入点用例；M57.4 留注入负例；M57.5 留并列排序用例；追加项留弹窗内字段定位 e2e + env 单位单测。
- **不做**：不把 T1002 代理接入夹带进 M57.1；不宣称 fix 模式可用于 sandbox；不为通过门禁放宽阈值。
- **归档**：按 [规划规范 §4](../../standards/planning.md) 迁出为 `todo-archive-phases-m57.md` + 索引行 + roadmap 状态同步。

---
