# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **暂无进行中阶段**（M32 能力扩展优先已于 2026-09-30 完整闭环 + 归档；下一阶段待用户决策） |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M32 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M32 已归档） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## 当前阶段

**暂无进行中阶段。** 上一阶段 M32（能力扩展优先）已于 2026-09-30 完整闭环并归档，详见
[todo-archive.md §M32](todo-archive.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档)。

下一阶段的候选池与评估状态见 [backlog.md](backlog.md)；按
[规划规范 §3.1 新需求默认走「评估 → backlog」原则](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)，
候选需经用户明确决策后才写入本文件的「当前阶段」。

---

### 阶段约定

- 每个原子条目闭环前必须通过 `pnpm lint` + `pnpm typecheck` + 定向测试；涉及打包 / 入口 / 导出变更时追加 `pnpm build`。
- 每条改动进入 A 阶段 `Code Auditor (代码审计员)` Review Gate；放行后方可进入 V / T / F。
- 提交按 [AGENTS.md §提交规范](../../AGENTS.md)（`conventional-committer` skill + 原子粒度）；推送仅限用户明确要求。
