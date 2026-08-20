# 规划文档深度归档治理

本文档负责定义 `roadmap.md`、`todo.md` 与 `todo-archive.md` 的深度归档管理规则。

## 1. 阈值定义

### `todo.md`

- 健康窗口: `<= 500` 行。
- warning 触发: `501 - 600` 行。
- 强制分片: `> 600` 行。

### `roadmap.md`

- 健康窗口: `<= 800` 行。
- warning 触发: `801 - 900` 行。
- 强制分片: `> 900` 行。

### `todo-archive.md`

- 健康窗口: `<= 500` 行。
- warning 触发: `501 - 700` 行。
- 强制分片: `> 700` 行。

## 2. 主窗口保留策略

- `roadmap.md`：保留当前阶段规划、最近阶段的审计归档摘要。更早阶段迁移到 `archive/roadmap-phases-*.md` 分片。
- `todo-archive.md`：保留最近 `3 - 5` 个已归档阶段的完整块。更早阶段迁移到 `archive/todo-archive-phases-*.md` 分片。

## 3. 阶段归档流程

1. 确认当前阶段全部任务已完成
2. 将已完成任务从 `todo.md` 移入 `todo-archive.md`
3. 更新 `roadmap.md` 中对应里程碑状态
4. 若触发行数阈值，按阶段区间切分归档分片
5. 更新 `archive/index.md` 索引

## 4. 当前基线（2026-08-20 C53 + M11 启动归档批次后）

- `roadmap.md`: 健康窗口（158 行）。M0-M10 全部归档，Milestone 概述表 10 阶段 + 详细章节覆盖 M0-M10；M11 启动子任务在 [backlog.md §M11](../backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动) 登记。
- `todo.md`: 健康窗口（23 行）。无活跃阶段任务，全部 backlog 候选在 `backlog.md` 独立追踪。顶部 banner 标注 C53 + M11 已启动。
- `todo-archive.md`: warning 窗口（574 行，501-700 阈值）。主窗口保留最近 6 个批次（略超 3-5 策略，下次归档批次优先迁出 M8：**M11 启动 + C53 收口（2026-08-20）** / M10 / T912 / 2026-08-19 平台可用性 PR1-PR3 / 2026-08-19 batch-runs 增强 C54+C55 / 2026-08-20 平台 UI 增强 C59-C61）。下个归档批次达到 700 阈值时触发分片迁出。
- `backlog.md`: warning 窗口（536 行，临界 500 阈值）。C53 标记正式关闭 + M11 阶段登记新增；后续仍 backlog 项：C30 / T1005 / C28 / C53-后-A/B/C / C36 / C37 / D1-D8 / T701-e2e / C33 / SAML / B1-B2 / T905 / C21-C24 / C34 / T705/T703 / branches 阈值冲刺（启动条件已满足）/ C56/C57/C58 平台 UX。
- 分片记录：
  - `[todo-archive-phases-m0-m1.md](todo-archive-phases-m0-m1.md)`（M0 / M1，2026-08-07 迁出，115 行）
  - `[todo-archive-phases-m2-m55.md](todo-archive-phases-m2-m55.md)`（M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5，2026-08-14 迁出，T906 执行，398 行）
  - `[todo-archive-phases-m6-m7-t711.md](todo-archive-phases-m6-m7-t711.md)`（M6 / M7.1 / M7.2 / T711，2026-08-20 neat-freak 批次迁出，211 行；**M8 仍在主窗口未迁出**——下次归档批次达到 700 阈值时再触发分片）

## 5. 近期归档批次登记

| 批次 | 归档日期 | 关联 backlog | 归档位置 |
|:--|:--|:--|:--|
| C53 + M11 启动（A 模式 push + PR 闭环） | 2026-08-20 | C53（已闭环）+ M11 启动 | [todo-archive.md §C53](../todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档) + [backlog.md §M11](../backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动) |
| M10 + T912 主体（沙箱容器 + SMTP 邮件） | 2026-08-20 | C26 + T912-3 → C28 | [todo-archive.md §M10](../todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](../todo-archive.md#t912-smtp-邮件发送器主体收口t912-3-待排) |
| 2026-08-20 平台 UI 增强（C59-C61） | 2026-08-20 | C59+C60+C61 | [todo-archive.md §2026-08-20 平台 UI 增强](../todo-archive.md#2026-08-20-平台-ui-增强c59-c61) |
| 2026-08-19 batch-runs 增强（C54+C55） | 2026-08-19 | C54+C55 | [todo-archive.md §2026-08-19 batch-runs 增强](../todo-archive.md#2026-08-19-batch-runs-增强c54c55) |
| 2026-08-19 平台可用性（PR1-PR3） | 2026-08-19~20 | C47+C48+C52+C46+C49+C50+C51 | [todo-archive.md §2026-08-19 平台可用性批次](../todo-archive.md#2026-08-19-平台可用性批次pr1-pr3) |
