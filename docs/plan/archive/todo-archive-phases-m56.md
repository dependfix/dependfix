# 待办归档分片：M56 1.0 后平台可信与运行成本收口

> 本分片由 2026-11-09 M56 阶段归档批次从 [todo.md](../todo.md) 迁出；正文保留规划、执行记录与收口口径，相对链接按新位置重指。
> 对应路线图详情见 [roadmap-phases-m56.md](roadmap-phases-m56.md)；本批经验沉淀见 [experience-archive §八十五](../../design/governance/experience-archive-§79-§85-ops-release.md#八十五、m56-归档批次经验沉淀-平台生命周期-三态跳过-静默失败探测-querybuilder-排序-e2e-fixtures-幂等-分片追加)。

---

> **归档摘要**：6 原子全部闭环（M56.1 PR Check 生命周期与结论筛选 / M56.2 扫描页排序与时间区间 / M56.3 0 写入后验证三态 / M56.4 checkpoint 失败分类与中止档 / M56.5 经验归档 §70-§84 分片拆分 / M56.6 规范三文件瘦身），阶段窗口首父链 **38 commits**（M56 规划与执行 22 + Dependabot 15 + 沙箱执行器复用评估 1，不占原子编号）、唯一 diff **98 文件 / +4945 −2414**（含依赖升级，`git rev-list --first-parent --count b484a567^..HEAD` / `git diff --shortstat b484a567^..HEAD`，2026-11-09 实测）。
> **推送终态（2026-11-09 归档时点）**：M56.1-M56.6 全部已推送（`origin/master` = `36a0a84d`）；本批归档 / 沉淀 commit 待推送（核验：`git rev-list HEAD ^origin/master --count`）。
> **证据来源**：各原子执行记录与验收证据见正文；设计口径见 [pr-build-deploy-signals.md §3.11](../../design/governance/pr-build-deploy-signals.md)、[dependency-fixer-records.md §12.9](../../design/modules/dependency-fixer-records.md)、[run-failure-taxonomy.md §5.9](../../design/governance/run-failure-taxonomy.md)；经验沉淀见 experience-archive §八十五。

---
## M56：1.0 后平台可信与运行成本收口（2026-11-08 规划）

**阶段目标**：收口 1.0 发布后第一批「用户可感 + 运行成本 + 文档债」——平台侧告警与列表恢复可信（PR Check 生命周期、扫描页排序与时间区间），引擎侧不再为 0 写入付终验成本且回滚降级可观测，文档侧把已进 warning 带的分片与规范预算收回来。

**用户决策（2026-11-08）**：方向取 A（平台告警可信与列表体验）+ B（运行时可靠性）+ D（文档与规范治理）混编；受 [§1.1](../../standards/planning.md#_1-1-硬性约束) 的 5-6 项上限约束，各取最高价值项组成 6 原子。**沙箱执行器「复用还是弃用」单列裁定**，不纳入本阶段（P1 决策项，改变规模）。

**容量基线**（测量方：执行角色，P 阶段预估；分母供 [§3.1.1](../../standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) 再平衡使用）：

- 6 原子 / 14-20 commits / 35-50 文件 / 1750-3000 行（= 各原子「交付物」逐条求和，不设倍数口径）。
- **类型平衡**：🎨2（M56.1 / M56.2）+ 🚀1（M56.3）+ 🛡️1（M56.4）+ 📚2（M56.5 / M56.6）；M56.1 兼 🛠️。测试覆盖内嵌各原子的「范围 / 验收标准」，不单列 🧪 原子。
- 执行期插队批次累计 ≥3 或插队工作量 ≥ 本基线 50% 时触发再平衡。

**执行顺序**：M56.6 → M56.1 → M56.2 → M56.3 → M56.4 → M56.5。

- M56.6（规范瘦身）先行：为 M56.1 / M56.2 可能新增的 `platform.md` 条款与设计指针腾预算，避免中途触发字符阻断。
- M56.1 / M56.2 同属平台列表面，但分别落在 PR Check 与运行列表，可独立验收。
- M56.3 依赖 M55.2 已落地的 `hasWork` 判据；M56.4 依赖 M51.5 的 checkpoint 异步化与取消期语义。

**上游证据**：

- PR Check：用户 2026-11-08 对 `/pr-checks` 截图提出关闭态与结论筛选（候选登记 `d89090c2`，代码锚点见原子条目）。
- 扫描页：用户 2026-10-30 截图需求「至少支持开始时间列排序 + 时间区间筛选」。
- 0 写入成本：M55.2 收口残余（`verificationPassed` 与零告警成功信号冲突）。
- checkpoint 降级：平台运行日志（导出文件）`runs-logs-20261101-062859.txt`（本地采集、未入库）同页 4 次 `git stash create exited with code 1`，日志无 stderr 尾部。
- 文档债：`check:doc-governance` 实测 `platform.md` 27,995 / 30,000 字符；`check:doc-size` 实测经验归档 §70-§99 分片 536 行（warning 带）。

**§3.4 阶段启动交叉核验（2026-11-08 实测）**：① 归档扫描六个主题 → **无同题闭环命中**（仅 M55 候选登记与 M51/M55 的「已登记 backlog」描述；另 M39/M50 扫描页与 M46 checkpoint 为同域非同题）；② `git log --oneline -- <候选相关路径>` + `git log --all --grep` 六个主题 → 无同题修复批次（仅候选登记与 M55.4 批 0 外移提交）；③ 代码 / 文档 anchor 实测——`polling-source.ts:34/66-70` 只拉 `state: open`、`pr-check.ts` 无生命周期列、`runs/index.get.ts:94` 仅 `createdAt DESC`、`verification-checkpoint.ts:78-84` 仅 warn、`release.yml` 无 `pnpm audit` 步骤（安全面由 `check:release-security` 覆盖）、`platform.md` 字符实测；④ backlog 六条候选前提与代码一致，`repositoryUpdateSchema.partial()` 候选已被 M55.4 闭环（本批移除）。

### M56.1 [P2 🎨🛠️] PR Check 生命周期状态与结论筛选

- **目标**：关闭 / 合并的 PR 不再伪装成 firing 告警，列表能区分 PR 生命周期并按结论筛选；历史信号只读可追溯。
- **优先级**：P2（告警噪声与可信度；用户 2026-11-08 实测提出）。
- **范围**：
  - 采集与存储：`apps/platform/server/services/monitor/polling-source.ts`（`34` / `66-70` 增补关闭态通道）、`apps/platform/server/entities/pr-check.ts`（生命周期列）、新迁移（列 + 索引）。
  - 视图与 API：`apps/platform/server/utils/pr-check-view.ts`（`prState` 派生）、`apps/platform/server/api/pr-checks/summary.get.ts:34`（firing 计数口径）、`apps/platform/server/api/pr-checks/index.get.ts:28` / `37-39` / `61-62`（`conclusion` 参数接线校验）。
  - 前端与文案：`apps/platform/app/pages/pr-checks.vue:93-130`（筛选接线 + 状态标签）、`apps/platform/i18n/locales/{zh-CN,en-US}.json`。
  - 测试：`apps/platform/server/api/pr-checks/*.test.ts`（按需新增）、`apps/platform/tests/e2e/pr-checks.e2e.test.ts`。
- **验收标准**：
  1. 关闭 / 合并的 PR 显示 `closed` / `merged` 标签，且不再计入 `summary.firing`（列表与统计口径一致）。
  2. 构造「PR 关闭时 CI 红」→ 下一次 polling 后该行 `prState=closed` 且 `alertFiring=false`；`acknowledgedAt` 保留。
  3. 按结论筛选（如 `failure`）→ 请求带 `conclusion=failure`，列表结果与所选结论一致；未知结论值返回 400。
  4. 关闭 PR 仍可展开查看历史信号（只读，不新增写路径）。
  5. 定向单测覆盖状态派生与计数口径；e2e 覆盖「筛选 → 关闭态标签」。
- **不做什么**：不纳入按作者筛选（用户 2026-11-08 明确延后）；不改三源信号归一化与归因口径；不改 per-PR-head 数据模型；不做 webhook 实时通道。
- **依赖**：PR Check 三源采集与 `pr-check-view` 单一视图口径；与 G3.5「PR Check 真实 polling」验证路径同域。**设计稿**：实体 + 迁移 + API 视图变更，需在 [pr-build-deploy-signals.md](../../design/governance/pr-build-deploy-signals.md) 补「PR 生命周期」小节后再实现。
- **执行记录（2026-11-09）**：落库口径 = `pr_state`（open/closed/merged/unknown，迁移默认 unknown）+ 条件 UPDATE 同步全部 HEAD 行；`PollingSource.fetchPrLifecycles` = open 列表命中 + 非命中 `pulls.get` 区分 merged/closed（404 按 closed），单轮上限 50、fail-open；`summary.firing` / `acknowledged` 排除终态；`GET /api/pr-checks` 非法 `conclusion` 返回 400；前端新增结论筛选与 PR 状态列；e2e 覆盖「筛选 → 关闭标签 → 展开历史信号」，视觉基线同批重建；定向单测覆盖生命周期解析 / 监控器状态机 / 计数口径 / 客户端枚举一致性。实际 32 文件 / +910 −28（含 6 个单测文件与 2 张视觉基线），拆 6 个 commit 交付。
- **交付物**：3-5 commits / 8-12 文件 / 400-700 行。**子批次与独立验收点**（§1.1 拆分依据）：① 数据与视图（实体 + 迁移 + polling + `pr-check-view` + `summary`）→ AC1 / AC2；② API 与前端（`index.get` 校验 + 页面 + i18n）→ AC3 / AC4；③ 测试与基线（定向单测 + e2e + 视觉如受影响）→ AC5。
- **风险与缓解**：额外拉 closed PR 增加 GitHub API 调用 → `limit` + 节流（复用 `TERMINAL_REPOLL_QUIET_MS` 思路）；存量行回填失败留下 `unknown` → 视图 fail-open 展示并标注；关闭态与 `reuse` 路径交互 → 用例锁定「关闭后不重开告警」。

### M56.2 [P2 🎨] 扫描页「全部运行」排序与时间区间筛选

- **目标**：`/scans` 的「全部运行」表支持按开始时间服务端排序与 `from` / `to` 时间区间筛选，导出与列表同源；不引入「只排当前页」的假排序。
- **优先级**：P2（用户 2026-10-30 实测需求）。
- **范围**：
  - 查询契约：`apps/platform/server/utils/runs-query.ts`（schema 增 `from` / `to` + `from <= to` 校验；`buildRunsWhere` 用 `MoreThanOrEqual` / `LessThanOrEqual`；实现改为 QueryBuilder `applyRunsWhere` / `applyRunsOrder`，见执行记录）、`apps/platform/server/api/runs/index.get.ts`（`sortBy` / `sortOrder` 白名单 + `order` 映射，缺省仍 `createdAt DESC`）、`apps/platform/server/api/runs/logs-export.get.ts`（筛选描述与排序同源）。
  - 前端：`apps/platform/app/pages/scans.vue`（`filters` 增 `from` / `to`、受控排序 `sortField` / `sortOrder` / `@sort`、翻页保留参数、`clearFilters` 复位）、`apps/platform/i18n/locales/{zh-CN,en-US}.json`。
  - 测试：`apps/platform/server/api/runs/index.get.test.ts`、`apps/platform/server/api/runs/runs-logs.test.ts`、`apps/platform/tests/e2e/scans.e2e.test.ts`、`apps/platform/tests/e2e/sortable.e2e.test.ts`。
- **验收标准**：
  1. 点击「开始时间」表头 → 请求带 `sortBy=startedAt&sortOrder=asc|desc`，跨页顺序正确（第 1 页末条时间 ≥ 第 2 页首条），再次点击可回到默认序。
  2. 设定 `from` / `to` → 请求带 ISO 参数、`total` 与可见行同时收窄、自动回第 1 页、翻页保留参数、「清除筛选」复位。
  3. 非法区间（`from > to` / 非 ISO / 超长）→ API 400 且前端有可读提示，单测覆盖。
  4. 导出当前页 / 全部：文件头含 `# 筛选：from=...` / `# 筛选：to=...`，导出集合与顺序与列表同源（抽样断言）。
  5. `apps/platform` e2e（scans + sortable）全绿；视觉基线如受影响同批重建。
- **不做什么**：不改 `/api/runs` 既有返回结构（保持 `{items,total,page,pageSize}`）；不改「按仓库」tab 的「最近状态」筛选语义；不做多列排序；不动 `repo-history-dialog` / 运行详情 dialog 的取数。
- **依赖**：与候选「列表页筛选 / 分页能力的共享抽取」的关系——本阶段**不抽** composable，避免范围膨胀；该候选保持待评估（触发条件不变）。**设计稿**：`/api/runs` 查询契约变更，需在 [api.md §4](../../standards/api.md) 或独立 governance 小节登记排序 / 区间参数与 NULL 语义后再实现。
- **执行记录（2026-11-09）**：`runs-query.ts` 新增 `from` / `to`（ISO 8601 + 时区，闭区间、`from > to` → 400）与 `runsSortShape`（`createdAt` / `startedAt`；缺省 `createdAt DESC`，显式 `createdAt` 也支持 asc/desc）；`applyRunsWhere` / `applyRunsOrder` 由列表与导出共用，`startedAt` 排序 NULL 固定末尾（跨 SQLite / MySQL / PostgreSQL 同口径，计算列 `addSelect` 后按别名排序），并列按 `createdAt DESC, id DESC` 稳定翻页。列表 / 导出均走 QueryBuilder，导出文件头追加 `# 筛选：from/to`。前端 `scans.vue` 增加区间选择（`CaomeiDatePicker` + 时间）、受控服务端排序、非法区间本地提示、翻页 / 筛选保留参数、清除复位；排序三态清除回默认序。`scans.vue` 行数增长明确接受 `max-lines` warning 并在此登记（平台告警预算内）。api.md §4.1 登记排序 / 区间 / NULL 语义，并记录「DataTable 未暴露 manualSorting，当前页二次排序」的 UI 已知边界。实际 12 文件 / +506 −62（含 1 张视觉基线）/ 4 commits（后端 / 前端 / 文档 / 并列排序断言校正；终态复算，含本条记录）。
- **交付物**：3-4 commits / 9-10 文件 / 500-800 行。
- **风险与缓解**：`startedAt` 无索引（`BaseEntity` 仅 `createdAt` / `updatedAt`）→ 全表扫描 + 排序，当前 500 运行规模可接受；写明升索引触发阈值（运行数 > 5,000 或查询 > 1s）。缺省序保持不变（避免历史 NULL 行位置突变）。`scans.vue` 继续增长 → 同批抽筛选区子组件，或明确接受 `max-lines` warning 并在条目内登记。

### M56.3 [P2 🚀] 0 写入运行的后验证三态门禁

- **目标**：`verificationPassed` 拆成「已验证 / 已跳过（含原因）」三态；「有告警但 0 写入」的运行跳过终验，不再付基线 + 后验证的双跑成本，同时零告警仓库的既有成功信号与 exit code 不回归。
- **优先级**：P2（M55.2 收口残余；预算与成本）。
- **范围**：`packages/core/src/report/types.ts`（三态字段与兼容说明）、`packages/engine/src/app/result-assembly.ts`、`packages/engine/src/runners/verification-gate.ts:74-78`、`packages/engine/src/app/repo-fix.ts:143` / `repo-fix-finalize.ts:189`、平台运行详情与 Markdown 报告的跳过原因渲染；定向单测与 exit code 矩阵用例。
- **验收标准**：
  1. 构造「有告警但全部未写入」仓库 → 跳过后验证，结果带 `skipped('no-write')`，报告与平台详情单列原因。
  2. 零告警仓库行为不变 → 仍按既有成功信号处理，exit code 与 `verificationPassed` 语义回归用例全绿。
  3. 预算跳过（`BUDGET_EXHAUSTED`）仍不交付、不回滚，且与 `no-write` 原因可区分。
  4. 混合运行（部分写入 + 部分失败）不因三态拆分误判为通过。
  5. 全量 `packages/engine` 与 `packages/core` 定向测试通过；exit code 既有用例零回归。
- **不做什么**：不改 30 分钟单仓上限；不改基线红交付降级三档；不新增第四态；不把「跳过」折叠为「通过」。
- **依赖**：M55.2 的 `hasWork` 判据与 `verificationSkipped='budget'` 现有字段。
- **执行记录（2026-11-09）**：`verificationSkipped` 扩为 `'budget' | 'no-write'`（`VERIFICATION_SKIP_REASONS` 单点声明）；收尾判据改用**实际写入**（`alertsCount > 0` 且 `fixed === 0 && !lockfileRepaired`，预算可用时；判据完整口径见 [dependency-fixer-records.md §12.9](../../design/modules/dependency-fixer-records.md#_12-9-验证链与既有失败基线-默认链-既有失败归因-零告警按需采样)），预算已耗尽时优先记 `budget`（`hasBudgetForNextStep` 无副作用判定）。0 写入仓库跳过后验证，结果写 `verificationPassed=undefined` + `verificationBlocking=false` + `verificationSkipped='no-write'`：无改动即无可归因失败，该仓库无交付内容、不回滚、不记 `VERIFICATION_FAILED`，也不阻断同一运行内其他仓库的交付；`budget` 跳过仍阻断交付（`verificationBlocking=true`，改动未验证），两者按原因可区分（门禁 warn 文案含原因、退出码用例覆盖 exit 0 / 1 边界）。`RunSummary` 新增 `verificationsSkipped` + `verificationSkippedByReason`；Markdown 新增 `Verification Skipped` 段与 Summary 行；平台运行详情（`repo-history-dialog` / `run-detail-dialog`）新增「验证跳过」与按原因 tooltip，e2e `scans` case 10 覆盖。零告警仓库仍走修复后验证（成功信号不变）。实际 34 文件 / +873 −87 / 3 commits（core+engine+mcp / 平台渲染 / 文档）：文件数与新增行数均超「8-12 文件 / 400-700 行」预算，原因是同一行为变更横跨报告模型、引擎判定与门禁、平台披露与 e2e、文档口径复扫；按「一个逻辑变更一个 commit」拆 3 个提交（首个提交 19 文件 / +683 −76，跨提交依赖合批优先于文件数，其余两个提交均低于 10 文件阈值）。基线采样面同步收窄为「可写工作」（可修复依赖 / 成员清单 / 自动修复模板告警），全部不可修复的告警不再付基线成本。
- **交付物**：3-4 commits / 8-12 文件 / 400-700 行。
- **风险与缓解**：三态拆分影响多仓 exit code 归因 → 先写「零告警 / 0 写入 / 预算跳过 / 混合」四类矩阵用例再改实现；下游消费方（报告 / 平台 / CLI 摘要）逐处核对，避免新增字段被静默忽略。

### M56.4 [P2 🛡️] 验证 checkpoint 失败不再静默降级

- **目标**：`git stash create` 失败时不再只 warn 后继续；给出可判定的失败分类、`ROLLBACK_GRANULARITY_DEGRADED` 审计与证据快照，并按分类决定继续或中止。
- **优先级**：P2（4 次实测失败且无 stderr 尾部，回退基线可能缺失）。
- **范围**：`packages/engine/src/app/verification-checkpoint.ts:70-110`（失败分类 + 快照）、回滚路径的降级审计发射、`docs/design/governance/run-failure-taxonomy.md`（类别口径）、定向单测。
- **验收标准**：
  1. 人为制造 `git stash create` 失败 → 报告出现粒度降级条目（`ROLLBACK_GRANULARITY_DEGRADED`），不静默继续。
  2. 失败时同时留 `stderr` 尾部 + `git status --porcelain` + `git rev-parse HEAD` 快照。
  3. 分类判据成文：索引锁 / 权限 / 磁盘 → 中止；无改动 / 非 git 工作区 → 降级继续。
  4. 正常路径仍每变更单元一个 checkpoint，既有用例全绿。
- **不做什么**：不重写 `git stash create` 为其它存储机制；不改回滚粒度本身的单元定义；不把降级写成失败（不改变 exit code 语义，除明确中止档）。
- **依赖**：M51.5 的 checkpoint 异步化与取消期语义（未启动静默 / 已启动留痕）。
- **执行记录（2026-11-09）**：`verification-checkpoint.ts` 新增文本快路径 `classifyCheckpointFailure` + 结构化探测 `probeWorktreeHealth`（git dir 的 `index.lock` 与写探针 errno；索引锁 / 权限失败时 `git stash create` 实测静默退出 1，纯文本判不出）+ `resolveCheckpointFailure` / `classifyProbeError`；新鲜索引锁（< 5s，可能为并发短锁）先重试一次。失败统一记 `ROLLBACK_GRANULARITY_DEGRADED`（stderr 尾部 + `git status --porcelain`（保留行首空格、保留开头）+ `git rev-parse HEAD`，异常路径 stderr 可为空），abort 档再 `requestAbort` + `recordRunAbort`（`ABORTED` 计入退出码，交付闸门据此不提交 / 不建 PR）；`RepoFixCtx.checkpointFailures` 以 `仓库:分类` 做 run 级去重。选择性回滚的「后续失败」判定改用实质性错误数（排除审计类降级条目），整仓回滚截断审计时保留该条。新增两个测试文件（分类表 / 同仓与跨仓去重；真实 git 索引锁 → 探测中止、审计类降级不误伤选择性回滚）；正常路径用例零改动。实际 8 文件 / +555 −13 / 2 commits（引擎 / 文档；终态复算，含本条记录）；文件数超「4-6」预算的原因是真实 git 形态与 mock 分类表必须分文件（前者不能 mock `runGit`）。
- **交付物**：2-3 commits / 4-6 文件 / 200-350 行。
- **风险与缓解**：分类误判导致中止过多 → 默认「降级继续」，仅索引损坏 / 权限 / 磁盘明确中止；中止档需在 PR 与报告中给出可操作提示。

### M56.5 [P3 📚] 经验归档 §70-§99 分片拆分

- **目标**：把 536 行的 `experience-archive-§70-§99-delivery-platform.md` 按 `^##` H2 边界拆为两片（§七十-§七十八 / §七十九-§八十四），各 ≤400 行，编号不变、原文零丢失、外链全部重指。
- **优先级**：P3（warning 带已触发，继续增长会进强制分片）。
- **范围**：`docs/design/governance/experience-archive-§70-§99-delivery-platform.md`、新增两个分片、`docs/design/governance/experience-archive.md`（主题索引 §编号归属）、全仓外链重指。
- **验收标准**：
  1. 两分片行数各 ≤400，主文件保留分片索引与范围说明。
  2. 拆分保真：原文非空行序列零丢失（[§4.4 第 17 条](../../standards/planning.md#_4-4-大批量归档批次操作规范) 口径）。
  3. 外链全部指向新分片且锚点命中；`check:docs` 0 error、`gates:docs` 20 项通过。
  4. 条目编号与主题索引归属不变，不重写正文。
- **不做什么**：不重写 / 压缩条目正文；不改编号；不合并条目。
- **依赖**：无（纯文档批次）。
- **执行记录（2026-11-09）**：按 `^##` 边界（`## 七十九、` 为切点）拆为 `experience-archive-§70-§78-delivery-correctness.md`（399 行）与 `experience-archive-§79-§84-ops-release.md`（140 行，后在沉淀批追加 §八十五 时同批改名为 §79-§85）；原文件保留为分片索引（12 行：原文标题 / 引语 / 分隔线 + 实测范围说明 + 两片索引），标题与文件名沿用建立时上界并注明实测范围 §七十-§八十四。**保真核验**：以 `git show HEAD:<原文件>` 的非空行序列对比「索引文档（去掉范围说明与索引表）+ A 片（去头部）+ B 片（去头部）」，352 行逐行相等、零丢失。外链重指 6 处：`experience-archive.md` 分片索引拆两行；`archive-log` 的 §八十三（带锚点）→ B 片、§八十一 → B 片、§七十六 / §七十三 → A 片；`mirror-manifest` 增两行（主文件改注为分片索引）。backlog 命名口径候选同步为「部分处置」。证据：`gates:docs` 20 项（check:docs 八类 / 锚点产物核验 / 镜像 4 篇 + 未镜像 67 篇）、`check:doc-size` 两片 399 / 140 均健康（experience-archive 536 行 warning 消除）、`lint-md` 通过。实际 9 文件 / +557 −537（含本条记录）/ 计划 1 commit（拆分本体与索引 / 外链重指同批，锚点原子性）。
- **交付物**：1-2 commits / 3-5 文件 / 100-200 行。
- **风险与缓解**：外链遗漏 → 拆前全仓 `rg` 检索分片路径并列出所有落点，拆后复扫；切片错位 → 按 `^##` 标题边界而非行号。

### M56.6 [P2 📚] 规范三文件瘦身与预算回填

- **目标**：把贴近上限的三份规范收回到有真实余量——`platform.md` 字符 ≤26,500、`ai-collaboration.md` / `git.md` 行数各 ≤190（至少 10 行余量），且不删除任何 hard requirement 的唯一权威声明。
- **优先级**：P2（下一次增补即可能触发字符阻断）。
- **范围**：`docs/standards/platform.md`（27,995 / 30,000 字符）、`docs/standards/ai-collaboration.md`（200 行）、`docs/standards/git.md`（200 行）；可下沉内容迁入对应设计稿并以一行指针回链；检查点矩阵与引用同步。
- **验收标准**：
  1. `platform.md` 字符 ≤26,500；`ai-collaboration.md` / `git.md` 行数各 ≤190（`wc -l` 实测，至少 10 行余量）。
  2. `pnpm run check:doc-governance` 阻断 0，且三文件不再出现字符 / 行数 warning。
  3. `development.md §5.1` 规则条数不增（≤24）；下沉内容在目标文档完整声明一次，原处只留一行指针。
  4. 全仓引用（含 `en-US` 镜像与检查点矩阵）重指后 `gates:docs` 20 项通过。
- **不做什么**：不删除 hard requirement 的唯一权威声明；不为瘦身改语义或放宽阈值；不新增规则条目。
- **依赖**：M55.4 批 0 已完成 `platform.md §10.6` 外移（本次继续找可下沉段）。
- **执行记录（2026-11-09）**：实际 11 文件 / 5 commits（4 个交付 commit 按 AI 细则 / 平台细则 / 行数收敛 / 计划登记拆分，另 1 个审计修复 commit 修正章节顺序 / 引用 / 行数结构；交付物预估偏差在此说明）；`platform.md` 27,995 → 23,495 字符（低于 24,000 健康上限，0 warning）、`ai-collaboration.md` 200 → 188 行、`git.md` 200 → 185 行。落点：平台 caomei 接线细则 → `caomei-ui-migration.md §16`；队列锁参数与观测 → `executor-process-isolation.md §9.1`；failure_* 写入 / 回填与部署版本戳 → `run-failure-taxonomy.md §5.12`；AI 阶段归档 / 自检 / 审计校准 / CI 修复 / git 隔离 → 新增 `ai-delivery-protocols.md`。另将 M56.1 引入的 `pr-build-deploy-signals.md` 401 行压回 400 行。`development.md §5.1` 条数未变（未新增规则），`gates:docs` 20 项通过。
- **交付物**：2 commits / 3-5 文件 / 150-250 行。
- **风险与缓解**：下沉造成双写 → 按「规范单点声明」只留一行指针；引用遗漏 → 改后 `rg` 全仓复扫 + `check:docs`。

---

## 阶段收口要求（M56）

- **质量门**：逐原子 `pnpm run lint:check`（涉样式时另跑 `lint:css:check`）+ `pnpm typecheck` + 定向测试。
- 改 `packages/*/src` 后先 `pnpm -r build` 再 typecheck；M56.1 / M56.2 跑 platform e2e + 视觉回归（受影响页面）+ `gates:docs`。
- **Review Gate**：每原子至少一轮 `Code Auditor`（standard；M56.1 因实体 / 迁移 / API 面升 deep），Reject 须闭环复审。
- **证据**：每个原子留定向测试输出；M56.3 留 exit code 矩阵用例；M56.5 留拆分保真比对；M56.6 留字符 / 行数实测前后值。
- **不做**：不把「沙箱执行器复用 / 弃用」夹带进本阶段；不宣称 G3 / G4 门槛通过；不为通过门禁放宽阈值。
- **归档**：按 [规划规范 §4](../../standards/planning.md) 迁出为 `todo-archive-phases-m56.md` + 索引行 + roadmap 状态同步。

