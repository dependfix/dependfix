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

## 4. 当前基线（2026-08-20 neat-freak 归档批次后）

- `roadmap.md`: 健康窗口（143 行）。M0-M9 全部归档，无新增归档批次。
- `todo.md`: 健康窗口（147 行）。活跃任务：M10 独立沙箱容器 P1 进行中（T1001 B1+B2 已 commit）+ T912 SMTP 邮件发送器（主体完成 + T912-3 待排）。
- `todo-archive.md`: 健康窗口（358 行）。主窗口保留最近 5 个批次：M8 / M9 / 2026-08-19 平台可用性 PR1-PR3 / 2026-08-19 batch-runs 增强 C54+C55 / 2026-08-20 平台 UI 增强 C59-C61。符合"主窗口保留 3-5 个阶段"策略。
- `backlog.md`: 健康窗口（494 行）。2026-08-19~20 闭环批次（12 个 C 项）已删除详细描述并归档至 `todo-archive.md`，主文档仅保留 `## 2026-08-19~20 平台 UX/可用性闭环批次汇总` 段作为索引。仍 backlog 项：C30 / C26 / C28 / M9 后续 / C36 / C37 / D1-D8 / T701-e2e / C33 / SAML / B1-B2 / T905 / C21-C24 / C34 / T705/T703 / branches 阈值冲刺。
- 分片记录：
  - `[todo-archive-phases-m0-m1.md](todo-archive-phases-m0-m1.md)`（M0 / M1，2026-08-07 迁出，115 行）
  - `[todo-archive-phases-m2-m55.md](todo-archive-phases-m2-m55.md)`（M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5，2026-08-14 迁出，T906 执行，398 行）
  - `[todo-archive-phases-m6-m7-t711.md](todo-archive-phases-m6-m7-t711.md)`（M6 / M7.1 / M7.2 / T711，**2026-08-20 neat-freak 归档批次迁出，211 行**）

## 5. 近期归档批次登记

| 批次 | 归档日期 | 关联 backlog | 归档位置 |
|:--|:--|:--|:--|
| 2026-08-19 平台可用性（PR1-PR3） | 2026-08-19~20 | C47+C48+C52+C46+C49+C50+C51 | [todo-archive.md §2026-08-19 平台可用性批次](../todo-archive.md#2026-08-19-平台可用性批次pr1-pr3) |
| 2026-08-19 batch-runs 增强（C54+C55） | 2026-08-19 | C54+C55 | [todo-archive.md §2026-08-19 batch-runs 增强](../todo-archive.md#2026-08-19-batch-runs-增强c54c55) |
| 2026-08-20 平台 UI 增强（C59-C61） | 2026-08-20 | C59+C60+C61 | [todo-archive.md §2026-08-20 平台 UI 增强](../todo-archive.md#2026-08-20-平台-ui-增强c59-c61) |
