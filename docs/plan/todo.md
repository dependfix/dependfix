# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：待确定（M21 已全部完成，等待下一阶段规划）

> **状态**：M21 阶段全部 4 项闭环（2026-08-31 归档）。M21.1 + M21.2（🛡️ 治理 2 项，已闭环）+ M21.4（🚀 能力扩展 1 项，已闭环）+ M21.5（🧪 测试 1 项，已闭环）= 4 项，符合 [planning.md §1.1 ≤5-6 项硬上限](../standards/planning.md)。M21.3 段为重复登记（S-5 已由 M18.x commit `878ae1a` 闭环），已从 M21 P 阶段规划批次删除并迁 backlog 历史归档指针段。
>
> **M21 完成摘要**：4 子阶段 11 atomic commits 实施 + 4 docs 收口 commits = **15 commits** 已全部落地；ahead=0（`git rev-list HEAD ^origin/master --count` 2026-08-31 实测）。详见 [todo-archive.md §M21](todo-archive.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)。
>
> **M20 完成摘要**：5 子阶段（M20.1/M20.3/M20.5/M20.6/M20.7）全部闭环，8 commits 已落地。详见 [todo-archive.md §M20](todo-archive.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)。
>
> **下一阶段规划**：M22 P 阶段规划待用户触发后启动；候选池从 [backlog.md](backlog.md) §短期 / 一次性候选任务 按"类型平衡"原则（技术债 ≥ 1 + 能力扩展 ≥ 1 + 用户体验 ≥ 2 + 测试覆盖 ≥ 1）选取 5 项左右。
>
> **待人工验收**：T701/T702/T704 真实环境验证（backlog.md §待人工验收）随可用性推进；T704 实施部分已由 M21.5 闭环（schedules CRUD e2e + BullMQ upsertJobScheduler 集成测试），真实环境验证保留待真实 GitHub API / staging 环境推进。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md) |
| 未排期 / 延期 / 远期 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |