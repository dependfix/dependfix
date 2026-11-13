# 规划文档深度归档治理

本文档负责定义 `roadmap.md`、`todo.md` 与 `todo-archive.md` 的深度归档管理规则。

## 1. 阈值引用（指向文档规范 §3）

本目录涉及文档的行数阈值以 [文档规范 §3 文档行数阈值](../../standards/documentation.md#_3-文档行数阈值) 为**唯一权威**（`todo.md` / `roadmap.md` / `todo-archive.md` 的取值见该表，本文件不再重复声明）。

## 2. 归档策略

- `roadmap.md`：保留里程碑概览与当前阶段；已闭环阶段详情迁移到 `archive/roadmap-phases-*.md` 分片（按阶段区间合并）。
- `todo-archive.md`：**只保留阶段索引**（按阶段倒序，覆盖 `archive/todo-archive-phases-*.md` 全部分片）；阶段正文一律在分片，批次操作记录在 `archive-log.md`。
- 索引结构由 `check-doc-governance` 机检：分片全覆盖、无重复、倒序、分片含阶段正文、索引不含阶段标题。

## 3. 阶段归档流程

1. 确认当前阶段全部任务已完成。
2. 将阶段正文写入 `archive/todo-archive-phases-<阶段>.md`（按 `^##` 边界切片，保留原文）。
3. 在 `todo-archive.md` §阶段索引追加一行（阶段 / 主题 / 分片 / 归档日期），保持倒序。
4. 更新 `roadmap.md` 中对应里程碑状态；已闭环阶段详情迁入 `archive/roadmap-phases-*.md`。
5. 在 `archive-log.md` 追加批次记录（日期 / 范围 / 结论 / commits / 导航）。
6. 运行 `check:docs` + `check:doc-governance` + `check:doc-size`，全绿后提交。

## 4. 当前基线（2026-11-13 M59 插队与再平衡后实测）

- `roadmap.md`：里程碑概览 + 当前阶段（**M59 沙箱 fix 与执行可靠性（2026-11-12 规划，4 原子 + 3 批插队；原 M59.5 于 2026-11-13 再平衡移出）**；`wc -l` 实测 97 行）；M0-M38 详情见 [roadmap-phases-m0-m38.md](roadmap-phases-m0-m38.md)，M39-M48 见 [roadmap-phases-m39-m48.md](roadmap-phases-m39-m48.md)，M49 见 [roadmap-phases-m49.md](roadmap-phases-m49.md)，M50 见 [roadmap-phases-m50.md](roadmap-phases-m50.md)，M51 见 [roadmap-phases-m51.md](roadmap-phases-m51.md)，M52 见 [roadmap-phases-m52.md](roadmap-phases-m52.md)，M53 见 [roadmap-phases-m53.md](roadmap-phases-m53.md)，M54 见 [roadmap-phases-m54.md](roadmap-phases-m54.md)，M55 见 [roadmap-phases-m55.md](roadmap-phases-m55.md)，M56 见 [roadmap-phases-m56.md](roadmap-phases-m56.md)，M57 见 [roadmap-phases-m57.md](roadmap-phases-m57.md)，M58 见 [roadmap-phases-m58.md](roadmap-phases-m58.md)。行数与字符预算见 [文档规范 §3](../../standards/documentation.md#_3-文档行数阈值) / [文档治理执行规范 §4.2](../../design/governance/doc-governance.md#_4-2-字符与密度预算)。
- `todo.md`：**M59 沙箱 fix 与执行可靠性**（`wc -l` 实测 208 行；4 原子 + 3 批追加临时待办 + 质量门 + 阶段收口要求）；M0-M58 全部归档；用户 2026-11-12 决策「全部纳入、分四期」，第三期「平台减法与页面治理」待 M59 归档后规划。1.0 门槛台账见 [release-1.0-readiness.md](../../design/governance/release-1.0-readiness.md)（1.0.0 已发布，转为发布记录）。
- `todo-archive.md`：**只保留阶段索引**（47 个阶段索引行，文件 58 行，覆盖 `archive/todo-archive-phases-*.md` 全部 47 个分片，倒序）；正文按阶段存放于分片，索引由 `check-doc-governance` 校验。
- `backlog.md`：长期主线 / 周期性回归验证层 / 短期候选 / 待人工验收 / 已知边界保持活跃；行数 410（`wc -l`，< 500 阈值）、字符 42,586（code point / `wc -m`，低于健康上限 45,000），候选条目数 **41**（`### 候选评估中` 段内 `^- \*\*` 机械复算；M59 上收 4 条候选 41 → 37，2026-11-12/13 新增 3 条 P1/P2 候选 37 → 40，2026-11-13 再平衡移出 M59.5 40 → 41）。
- `archive-log.md`：追加型批次日志；本文件与 `todo-archive.md` 不再承载批次流水账。

## 5. 批次记录

批次操作历史统一存放于 [archive-log.md](archive-log.md)（追加型日志；2026-10-26 由 `archive/index.md §4/§5` 与 `todo-archive.md` 的「主窗口保留范围」合并迁入）。

本文件只保留：阈值引用、归档策略、归档流程、当前基线。
