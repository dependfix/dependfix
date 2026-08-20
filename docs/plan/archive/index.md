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

## 4. 当前基线（2026-08-20 e2e 修复批次归档后）

- `roadmap.md`: 健康窗口（184 行）。M0-M11 全部归档，Milestone 概述表 11 阶段 + 详细章节覆盖 M0-M11（M11 已闭环）；e2e 修复批次为 M11 后续 fix 批，未引入新里程碑。
- `todo.md`: 健康窗口（55 行）。M11 全部闭环 + 2026-08-20 e2e 修复批次（C62/C63/C64 + chore）已归档；顶部 banner 标注 8 commits ahead（C63/C64 + chore）+ C62 三 commits 已随 M11 推送清单 + 3 轮审计闭环 + 验证矩阵（platform e2e 54 passed / 2 skipped / 0 failed）+ 1 项 known-issue 残留登记（PrimeVue 4 + Nuxt hydration）。
- `todo-archive.md`: **健康窗口（313 行，< 500 阈值）**。主窗口保留最近 4 个批次（3-5 策略范围）：**2026-08-20 e2e 修复批次（C62+C63+C64+chore）** / **C53 收口（2026-08-20）** / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次摘要。
- `backlog.md`: 健康窗口（480 行，< 500 阈值）。本批次未新增 backlog 项（修复批，非新功能）；M11 段保持已闭环；其他阶段（M2/M4/M5.5/M6/M7/MCP）段保持原样。后续仍 backlog 项：C30 / C33 / C36 / C37 / D1-D8 / T701-e2e / SAML / B1-B2 / T905 / C21-C24 / C34 / T705/T703。
- 分片记录：
  - `[todo-archive-phases-m0-m1.md](todo-archive-phases-m0-m1.md)`（M0 / M1，2026-08-07 迁出，115 行）
  - `[todo-archive-phases-m2-m55.md](todo-archive-phases-m2-m55.md)`（M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5，2026-08-14 迁出，T906 执行，398 行）
  - `[todo-archive-phases-m6-m7-t711.md](todo-archive-phases-m6-m7-t711.md)`（M6 / M7.1 / M7.2 / T711 / M8，2026-08-20 neat-freak 批次 + M8 补入，293 行）
  - `[todo-archive-phases-m11.md](todo-archive-phases-m11.md)`（**M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次详细**，2026-08-20 M11 归档批次迁出）

## 5. 近期归档批次登记

| 批次 | 归档日期 | 关联 backlog | 归档位置 |
|:--|:--|:--|:--|
| 2026-08-20 e2e 修复批次（C62 + C63 + C64 + chore） | 2026-08-20 | 修复批（非新功能）：CI 32382730911 code-scanning #23/#24/#25 + CI 32383730911 6 e2e 失败 + PrimeVue 4 + Nuxt hydration 兼容性 | [todo-archive.md §2026-08-20 e2e 修复批次](../../plan/todo-archive.md#2026-08-20-e2e-修复批次-c62-c63-c64-chore) |
| 2026-08-20 M11 推进批次（C58 + C-ENV + T1005 + C28 + C56/C57 + C53-后） | 2026-08-20 | M11 全部子任务 | [todo-archive.md §M11 推进批次](../../plan/todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) + [archive/todo-archive-phases-m11.md](todo-archive-phases-m11.md) |
| C53 + M11 启动（A 模式 push + PR 闭环） | 2026-08-20 | C53（已闭环）+ M11 启动 | [todo-archive.md §C53](../../plan/todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档) + [backlog.md §M11](../../plan/backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-已闭环) |
| M8 迁入分片 + T1005 落地（sandbox 路由接线） | 2026-08-20 | M8 段 + T1005（sandbox 路由接线） | [todo-archive.md §C53 顶部 banner](../../plan/todo-archive.md) + [archive/todo-archive-phases-m6-m7-t711.md §M8](todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档) |
| M10 + T912 主体（沙箱容器 + SMTP 邮件） | 2026-08-20 | C26 + T912-3 → C28 | [todo-archive.md §M10](../../plan/todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](../../plan/todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动) |
| 2026-08-20 平台 UI 增强（C59-C61） | 2026-08-20 | C59+C60+C61 | [todo-archive.md §2026-08-20 平台 UI 增强](../../plan/todo-archive.md#2026-08-20-平台-ui-增强c59-c60-c61) |
| 2026-08-19 batch-runs 增强（C54+C55） | 2026-08-19 | C54+C55 | [archive/todo-archive-phases-m11.md §2026-08-19 batch-runs 增强](todo-archive-phases-m11.md#2026-08-19-batch-runs-增强c54c55) |
| 2026-08-19 平台可用性（PR1-PR3） | 2026-08-19~20 | C47+C48+C52+C46+C49+C50+C51 | [archive/todo-archive-phases-m11.md §2026-08-19 平台可用性批次](todo-archive-phases-m11.md#2026-08-19-平台可用性批次pr1-pr3--c51) |
