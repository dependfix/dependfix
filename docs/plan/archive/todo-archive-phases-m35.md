# 待办事项归档分片 — M35

> 本分片自 [todo-archive.md](../todo-archive.md) 迁出（2026-10-10 M40 归档批次预防性分片迁出：M40 段新增后主窗口完整段将达 6 个，超 [archive/index.md](../archive/index.md) §2 定义的「3-5 个已归档阶段」上界；M35 是主窗口最早的完整段，按该健康策略预防性迁出）。
> 上级索引见 [archive/index.md](../archive/index.md)。当前活跃任务见 [todo.md](../todo.md)。

---

## M35: 批量运行终态兜底对账 + 进度可见性修复（M35.1~M35.6 全部已闭环 / 2026-10-02 归档）

> **归档日期**：2026-10-02
> **阶段摘要**：2026-10-02 用户报告「批量运行页面中卡住（超时）的任务不显示进度，必须手动展开才真正查询」，并要求评估超时补偿机制失效原因与手动展开更新状态原理的合理性。根因排查（生产库 17 条 BatchRun / 94 条 ScanRun 逐条核对）确认：BatchRun 终态与进度计数只由详情接口 `GET /api/batch-runs/[id]` 惰性聚合写回（原设计 §5.2「方案 A 轮询更新」）；`stale-cleanup` 的 BatchRun 分支要求「至少一个 stale 子 ScanRun」，对「子项全部终态但父批次未被查看」与「零子项」两类主失败模式无覆盖 → 父批次永久 `running`、进度停留在 0、`finishedAt` 被污染为首次查看时间。经用户 2026-10-02 明确授权开阶段（[规划规范 §3.1](../../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径），采用**周期兜底对账 + 详情实时聚合双通道**方案。**6 原子条目全部闭环**，覆盖 🚀 1 + 🛠️ 3 + 🎨 1 + 📚 1。
>
> - **M35.1** [P2 🚀 能力扩展] 周期兜底对账服务 `batch-reconciler.ts`（扫全部 `running` BatchRun 聚合写回终态/进度 + 零子项超阈值 orphan → `failed` + 条件写回防覆盖并发 `force-fail` + `In` 分批）—— `041b4df`
> - **M35.2** [P2 🛠️ 技术债] 写回收敛为共享 `applyBatchAggregation`（详情接口 / 对账 / sync 三处共用）+ 周期插件接线（先清孤儿、后对账，三类任务独立 try/catch）—— `222ca6d`
> - **M35.3** [P2 🛠️ 技术债] `finishedAt` 语义修正为真实完成时间（`max(子项 finishedAt)`，无子项回退当前时刻；真实化部分由 `222ca6d` 一并落地）+ sync 模式串行结束即聚合终结 —— `33d93dd`
> - **M35.4** [P3 🎨 用户体验] 前端 `batch-runs.vue` 轮询注释与口径修正 —— `8ae502c`
> - **M35.5** [P3 🛠️ 数据订正] 存量 `finishedAt` 订正脚本 `backfill-batch-finished-at.ts`（dry-run 默认 + `--apply` 二次确认 + 事务 + 仅非 running）—— `ae4b038`
> - **M35.6** [P3 📚 文档治理] 设计口径同步（`platform-scheduled-batch.md` §4.2 / §5.2 / §9.1 双通道口径）+ 规划索引口径登记 —— `d4ddf1f` + `db66f15`
>
> **commit 数量实证**：`git log master --first-parent --oneline` 自 M34 归档末 `291e4ab` 起按上列条目统计 = **7 commits**（`041b4df` / `222ca6d` / `33d93dd` / `ae4b038` / `8ae502c` / `d4ddf1f` / `db66f15`）；本归档批次另含归档 commits。归档时 `git rev-list HEAD ^origin/master --count` 实测 = 0（M35 全部 commits 已推送 `origin/master`）。
>
> **关键决策 D1-D4**（2026-10-02 用户授权 + 执行期敲定；完整记录见 [roadmap.md §M35](../roadmap.md#m35-批量运行终态兜底对账--进度可见性修复2026-10-02-用户授权启动--2026-10-02-已闭环--归档)）：
>
> - **D1**（2026-10-02 用户授权）：新增 M35 阶段修复（[规划规范 §3.1](../../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径），方案 = 周期兜底对账 + 详情实时聚合双通道
> - **D2**：对账复用既有周期插件 `stale-cleanup.ts`（5 分钟节拍，长驻 Docker 部署可靠），不引入 Worker 回调（保持原设计低耦合）
> - **D3**：`finishedAt` 取 `max(子项 finishedAt)`；无子项批次无真实完成时间，孤儿兜底时取兜底时刻并披露边界
> - **D4**：零子项且超 30 分钟的 `running` 批次视为孤儿 → `failed`（触发进程在建子项前异常 / 子仓库级联删除），与 `stale-cleanup` 孤儿语义对齐；零子项 + running 属「终态未定」，任何通道都不得按 `completed` 收敛
>
> **类型平衡复核**：🚀 能力扩展 1（M35.1）/ 🛠️ 技术债 + 数据订正 3（M35.2 / M35.3 / M35.5）/ 🎨 用户体验 1（M35.4）/ 📚 文档治理 1（M35.6）；**🧪 测试覆盖无独立条目**（测试随各条目内嵌：M35.1 / M35.2 / M35.3 单测 + M35.5 脚本单测），缺口显式标注。
>
> **范围边界（不做什么）**：不改 `BatchRun` 状态集合与既有 `failed` 终态保护口径；不引入 Worker 回调；不改详情接口返回结构；零子项孤儿无真实完成时间，不伪造历史时刻。
>
> **审计轮次**：2 分区并发 deep（P1 服务端 / P2 脚本 + 文档）；P1 第 1 轮 **Reject**（RG-B01：零子项经详情接口被固化 `completed`）→ 修复护栏 + 条件写回 + `In` 分块 + coverage + 编号清理 → 第 2 轮 Pass（残留 RG-W01R 登记 backlog）；P2 Pass（RG-W1 脚本仅终态 / RG-W2 设计 §4.2 / RG-W3「方案 A」歧义 / RG-W4 八要素 / RG-W5 源码注释 均已修复）。记录在 `artifacts/review-gate/`（gitignored）。
>
> **遗留观察项**：① `BatchRun` 写回的非原子竞态（详情 GET / sync 尾部 vs 并发 `force-fail`）已登记 backlog §候选评估中（M35.1 A 阶段 RG-W01R）；② backfill `--apply` 待用户在生产执行（脚本已入库）；③ 设计 §5.2 双通道语义以 M35.6 为现行口径。
>
> **关联**：[roadmap.md §M35](../roadmap.md#m35-批量运行终态兜底对账--进度可见性修复2026-10-02-用户授权启动--2026-10-02-已闭环--归档) + [backlog.md §候选评估中](../backlog.md)（非原子竞态候选）+ [archive/index.md §5 批次登记](../archive/index.md)
