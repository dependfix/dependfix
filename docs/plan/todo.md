# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M35 实现与审计完成**（批量运行终态兜底对账，2026-10-02 用户授权启动；待阶段归档） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M34 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M34 已归档 + M35 启动） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段

### M35: 批量运行终态兜底对账 + 进度可见性修复（M35.1~M35.6）

> **阶段摘要**：2026-10-02 用户报告「批量运行页面中卡住（超时）的任务不显示进度，必须手动展开才真正查询」，并要求评估超时补偿机制失效原因与手动展开更新状态原理的合理性。根因排查（生产库 17 条 BatchRun / 94 条 ScanRun 逐条核对）确认：**BatchRun 终态与进度计数只能被详情接口 `GET /api/batch-runs/[id]` 触发惰性聚合**（原设计 §5.2「方案 A 轮询更新」），而 `stale-cleanup` 的 BatchRun 分支要求「至少一个 stale 子 ScanRun」，对「子项全部终态但父批次未被查看」与「零子项」两类主失败模式完全无覆盖 → 父批次永久 `running`、进度停留在 0、`finishedAt` 被污染为首次查看时间。经用户明确授权开阶段，采用**周期兜底对账 + 详情实时聚合双通道**方案。
>
> **6 原子条目**（类型平衡 🚀 1 / 🛠️ 3 / 🎨 1 / 📚 1）：
>
> - **M35.1** [P2 🚀 能力扩展] 周期兜底对账服务 `batch-reconciler.ts`
> - **M35.2** [P2 🛠️ 技术债] 写回逻辑收敛为共享 `applyBatchAggregation` + 周期插件接线
> - **M35.3** [P2 🛠️ 技术债] `finishedAt` 语义修正为真实完成时间 + sync 模式立即聚合终结
> - **M35.4** [P3 🎨 用户体验] 前端 `batch-runs.vue` 轮询注释与口径修正
> - **M35.5** [P3 🛠️ 数据订正] 存量 `finishedAt` 订正脚本（dry-run 默认）
> - **M35.6** [P3 📚 文档治理] 设计口径与索引同步
>
> **类型平衡复核**：[规划规范 §1.1](../standards/planning.md#11-硬性约束) 建议 🎨 用户体验 + 🛡️ 技术债 + 🚀 能力扩展 + 🧪 测试覆盖：本批 🚀 1 + 🛠️ 3 + 🎨 1 + 📚 1；**🧪 测试覆盖无独立条目**（测试随各条目内嵌：M35.1/M35.2/M35.3 单测 + M35.5 脚本单测），缺口显式标注。
>
> **§3.4 / §1.7 交叉核验结论**（本次为「用户直接决策」路径，非 backlog 上收；仍按三重核验确认无重复评估、无前提矛盾）：① todo-archive 表格扫描 `rg -n "BatchRun|批量运行.*(聚合|终态)|stale-cleanup|finishedAt" docs/plan/todo-archive.md docs/plan/archive/` 无「已闭环的同类修复」条目（仅 M20.x ScanResult 与 M24 PR Check 邻近域）；② `git log --all --oneline --grep="reconcileRunningBatchRuns\|batch-reconciler"` 无命中（本批首次实现）；③ 代码 anchor：`batch-runs.vue` 的 `refreshOpenDetails` 仅遍历 `detailMap` 已展开行、`stale-cleanup.ts` BatchRun 分支要求 `In(staleBatchRunIds)`、`[id].get.ts` 为唯一写回点——三点与根因描述一致。结论：**0 项重复评估**。
>
> **关键决策**：
>
> - **D1**（2026-10-02 用户授权）：新增 M35 阶段修复（[规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径），方案 = 周期兜底对账 + 详情实时聚合双通道。
> - **D2**：对账复用既有周期插件 `stale-cleanup.ts`（5 分钟节拍，长驻 Docker 部署可靠），不引入 Worker 回调（保持原设计的低耦合）。
> - **D3**：`finishedAt` 取 `max(子项 finishedAt)`；无子项批次无真实完成时间，孤儿兜底时取兜底时刻并披露边界。
> - **D4**：零子项且超 30 分钟的 `running` 批次视为孤儿 → `failed`（触发进程在建子项前异常 / 子仓库级联删除），与 `stale-cleanup` 孤儿语义对齐；零子项 + running 属「终态未定」，任何通道都不得按 `completed` 收敛。
>
> **范围边界（不做什么）**：不改 `BatchRun` 状态集合与既有 `failed` 终态保护口径；不引入 Worker 回调；不改详情接口返回结构；零子项孤儿无真实完成时间，不伪造历史时刻。

#### M35.1 [P2 🚀 能力扩展] 周期兜底对账服务 `batch-reconciler.ts`

- **目标**：补齐「父批次终态只由查看触发」的缺口——周期扫描全部 `running` BatchRun，聚合子 ScanRun 并写回终态/进度，使终结从「看才发生」变为「到时间就发生」。
- **优先级**：P2（用户可见缺陷 + 数据一致性；非插队例外 3 类，经用户直接授权开阶段）。
- **范围**：新增 `apps/platform/server/services/batch/batch-reconciler.ts` + 单测。
- **验收标准**：
  - [x] 子项全部终态 + 父 `running` → `completed`，且 `finishedAt = max(子项 finishedAt)`
  - [x] 子项仍有 `pending/running` → 仅写回计数，状态保持 `running`
  - [x] 零子项 + 创建超 30 分钟 → `failed`；未超阈值 → 保持不动（async 建子项窗口）
  - [x] 已终态（completed/failed）批次不在扫描范围
  - [x] 并发保护：写回为条件更新（仅当库中仍为 `running`），不覆盖并发 `force-fail` 的 `failed` 终态；写回触发 `updatedAt` 以驱动前端增量 reconcile
  - [x] `In(...)` 分批（避免 SQLite 变量上限 / 大列表），单测 + 定向测试通过
- **不做什么**：不引入 Worker 回调；不改 `BatchRun` 状态集合。
- **依赖**：`[id].get.ts` 现有聚合写回逻辑（作为口径来源）。
- **交付物**：1 atomic commit（`feat(platform)` 对账服务 + 单测）。
- **风险与缓解**：`running` 批次堆积时批量查询规模风险；缓解：`In` 分批 + 仅扫 `running`（集合天然小）。

#### M35.2 [P2 🛠️ 技术债] 写回逻辑收敛为共享 `applyBatchAggregation` + 周期插件接线

- **目标**：消除「详情接口 / 周期对账 / sync 立即终结」三处重复写回逻辑，降低漂移；把对账接入既有周期插件。
- **优先级**：P2。
- **范围**：新增 `batch-writeback.ts`（共享写回，含「零子项 + running 不收敛」护栏）；改造 `[id].get.ts` 复用；`batch-executor.ts` sync 分支复用；`plugins/stale-cleanup.ts` 接线（先清孤儿、后对账，各任务独立 try/catch 避免相互跳过）。
- **验收标准**：
  - [x] 详情接口与对账服务共用同一写回函数（`applyBatchAggregation`）
  - [x] `failed` 终态保护、`running → completed` 流转、`finishedAt` 仅首次写入等行为与改造前一致（回归用例）
  - [x] 插件三类任务（孤儿清理 / 对账 / `_pending` workdir 清理）互不阻塞
  - [x] 新增 `applyBatchAggregation` 直接单测（含「finishedAt 已存在不被改写」分支）
- **不做什么**：不变更详情接口返回结构；不在对账中引入 Worker 回调。
- **依赖**：M35.1（对账服务）。
- **交付物**：1 atomic commit（`refactor(platform)` 写回收敛 + 插件接线 + 单测）。
- **风险与缓解**：收敛时的行为差异；缓解：先补行为回归用例再重构。

#### M35.3 [P2 🛠️ 技术债] `finishedAt` 语义修正 + sync 立即聚合终结

- **目标**：`finishedAt` 反映真实完成时间而非聚合触发时刻（避免审计/报表失真）；sync 模式串行结束即终态化，不等查看。
- **优先级**：P2（数据正确性）。
- **范围**：`batch-aggregate.ts` 新增 `resolveBatchFinishedAt`；`batch-executor.ts` sync 分支结束即聚合（`runs.length > 0` 守卫，零子项交由对账）。
- **验收标准**：
  - [x] `finishedAt = max(子项 finishedAt)`；无带 `finishedAt` 子项回退当前时刻
  - [x] 已终态批次既有 `finishedAt` 不被改写
  - [x] sync 模式串行结束后批次立即 `completed`（`finishedAt` = 真实值），不依赖查看/对账
  - [x] `[id].get.ts` 首次终结同样取真实完成时间
- **不做什么**：不改 `ScanRun.finishedAt` 写入链路；不为零子项伪造历史时刻。
- **依赖**：M35.1/M35.2。
- **交付物**：1 atomic commit（`fix(platform)` finishedAt 真实化 + sync 立即终结 + 单测）。
- **风险与缓解**：存量 `finishedAt` 已被污染；缓解：由 M35.5 一次性脚本订正。

#### M35.4 [P3 🎨 用户体验] 前端 `batch-runs.vue` 轮询注释与口径修正

- **目标**：注释与实现一致（删除「轮询详情即触发后端聚合」的错误表述）；确认列表进度无需展开即可反映（由服务端对账 + 列表轮询承载）。
- **优先级**：P3（注释级，无可见逻辑变更）。
- **范围**：`apps/platform/app/pages/batch-runs.vue` 注释/口径。
- **验收标准**：
  - [x] 注释准确描述「列表值由服务端周期对账写回 + 列表轮询拉取；已展开行额外拉详情实时聚合」
  - [x] 展开详情、手动刷新、60s 轮询行为不变（既有 e2e/单测不回归）
- **不做什么**：不改模板、样式、交互逻辑；不改轮询节拍。
- **依赖**：M35.1。
- **交付物**：并入相关 commit（注释级）。
- **风险与缓解**：无（注释级）。

#### M35.5 [P3 🛠️ 数据订正] 存量 `finishedAt` 订正脚本

- **目标**：把被「查看时刻」污染的存量 `finishedAt` 恢复为 `max(子项 finishedAt)`。
- **优先级**：P3（一次性数据订正；生产实证 4 条污染 + 4 条毫秒/秒级漂移）。
- **范围**：新增 `apps/platform/server/database/scripts/backfill-batch-finished-at.ts` + 单测 + `package.json` 脚本（`db:backfill:batch-finished-at[:dry-run]`）。
- **验收标准**：
  - [x] 默认 dry-run（不写库）；`--apply` 需 `y/N` 二次确认；事务回滚
  - [x] 仅订正**非 running** 批次（防止过早写入 running 批次）；无带 `finishedAt` 子项的批次跳过（不伪造）
  - [x] 多子项取 max 有单测；`running + 部分子项终态` 有「跳过」单测
  - [x] dry-run 对真实库输出可审阅（扫描 17 / 需订正 8 / 跳过无子项 3 / 跳过 running 0 实证）
- **不做什么**：不修改 `ScanRun`；不订正 `running` 批次（交由对账）；不删除备份。
- **依赖**：M35.3（同一 `max(子项 finishedAt)` 口径）。
- **交付物**：1 atomic commit（`chore(platform)` 订正脚本 + 单测 + package.json）。
- **风险与缓解**：误写 running 批次；缓解：状态过滤 + 默认 dry-run + 二次确认。

#### M35.6 [P3 📚 文档治理] 设计口径与索引同步

- **目标**：把 §5.2 从「方案 A 轮询更新」更新为「详情实时聚合 + 周期兜底对账」双通道；同步实体注释与索引口径。
- **优先级**：P3。
- **范围**：`docs/design/governance/platform-scheduled-batch.md`（§4.2 / §5.2 / §9.1 等残留口径）、`batch-run.ts` / `batch-aggregate.ts` / `index.get.ts` / `batch-reconciler.ts` 注释、`docs/plan/todo.md` / `roadmap.md` / `backlog.md` / `docs/index.md` / `docs/i18n/en-US/index.md`。
- **验收标准**：
  - [x] 文档无残留「轮询更新 / 异步回调」过时表述（`rg -n "轮询更新|异步回调" docs/design/governance/platform-scheduled-batch.md` 清零）
  - [x] 源码注释口径与实现一致（`rg -n "方案 A|轮询更新" apps/platform/server` 对新改文件清零）
  - [x] `pnpm run check:docs` / `lint:md:check` / `docs:check:i18n` 通过；双语镜像语义等价
- **不做什么**：不改历史归档段正文；不重排文档结构。
- **依赖**：M35.1-M35.3（口径以最终实现为准）。
- **交付物**：并入相关 commit（docs）。
- **风险与缓解**：锚点/相对路径错误；缓解：改前后 `rg -n "^## "` 实证锚点 + check:docs 兜底。

---

> 下一阶段启动由用户明确决策后另行规划——候选池见 [backlog.md](backlog.md)，上收规则见 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)。
