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

## 4. 当前基线（2026-08-25 M12 阶段归档后）

- `roadmap.md`: 健康窗口（190 行，< 800 阈值）。M0-M12 全部归档，Milestone 概述表 12 阶段；M12 段从"规划中/未启动"改为"已完成 2026-08-21 归档"含完整子任务清单 + 关键决策；M11 重复段已清理（避免 wisdom #107 重复段标题问题）。
- `todo.md`: 健康窗口（62 行）。M12 阶段完整闭环，顶部 banner 标注"当前无活跃阶段任务" + 19 commits 全部推送至 origin/master（ahead=0，git rev-list HEAD ^origin/master --count 核验）；仅保留"待人工验收"3 项真实环境验证（T701/T702/T704 + 发布管线收尾）随可用性推进。
- `todo-archive.md`: **健康窗口（约 480 行，< 500 阈值）**。主窗口保留最近 5 个批次（3-5 策略范围上限）：**2026-08-21 M12 平台 UX 一致性 + i18n 治理** / 2026-08-20 e2e 修复批次（C62+C63+C64+chore）/ C53 收口（2026-08-20）/ 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次摘要。
- `backlog.md`: 健康窗口（约 545 行，warning 阈值 500-700 区间但内容有效）。本批次清理 2 大段：①"2026-08-21 平台 UX 反馈批次评估（C65 待启动）"（10 项 #1-#10 + C65 拆分方案 + 跨条目绑定，约 138 行）—— 已闭环全部转 M12 4 子批次；②"## M12: 平台 UX 一致性 + i18n 治理（待启动）"（依赖图 + 推荐启动顺序 + 4 子批次规划详情 + 验收标准 + 非目标 + 风险登记，约 165 行）—— M12 已闭环；③ C35（pnpm audit registry 指定，已闭环 2026-08-18）。**未删：known-issue 段、待迁移经验段、M2/M4/M5.5/M6/M7/MCP/M11/横切任务各阶段段**。后续仍 backlog 项：T705/T703/C30/C33/C36/C37/D1-D8/T701-e2e/SAML/B1-B2/T905/C21-C24/C34/G1 network-audit。
- 分片记录：
  - `[todo-archive-phases-m0-m1.md](todo-archive-phases-m0-m1.md)`（M0 / M1，2026-08-07 迁出，115 行）
  - `[todo-archive-phases-m2-m55.md](todo-archive-phases-m2-m55.md)`（M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5，2026-08-14 迁出，T906 执行，398 行）
  - `[todo-archive-phases-m6-m7-t711.md](todo-archive-phases-m6-m7-t711.md)`（M6 / M7.1 / M7.2 / T711 / M8，2026-08-20 neat-freak 批次 + M8 补入，293 行）
  - `[todo-archive-phases-m11.md](todo-archive-phases-m11.md)`（**M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次详细**，2026-08-20 M11 归档批次迁出）

## 5. 近期归档批次登记

| 批次 | 归档日期 | 关联 backlog | 归档位置 |
|:--|:--|:--|:--|
| **2026-08-21 M12 阶段归档（平台 UX + i18n 治理）** | **2026-08-25** | **M12 4 子批次全部闭环（C65-A/B/C/D 9 子任务） + CI 修复 + 网络审计白名单追加**；19 commits 全部推送至 origin/master（ahead=0） | **[todo-archive.md §M12](../../plan/todo-archive.md#m12-平台-ux-一致性--i18n-治理已归档) + [roadmap.md §M12](../../plan/roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档)** |
| 2026-08-20 e2e 修复批次（C62 + C63 + C64 + chore） | 2026-08-20 | 修复批（非新功能）：CI 32382730911 code-scanning #23/#24/#25 + CI 32383730911 6 e2e 失败 + PrimeVue 4 + Nuxt hydration 兼容性 | [todo-archive.md §2026-08-20 e2e 修复批次](../../plan/todo-archive.md#2026-08-20-e2e-修复批次-c62-c63-c64-chore) |
| 2026-08-20 M11 推进批次（C58 + C-ENV + T1005 + C28 + C56/C57 + C53-后） | 2026-08-20 | M11 全部子任务 | [todo-archive.md §M11 推进批次](../../plan/todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) + [archive/todo-archive-phases-m11.md](todo-archive-phases-m11.md) |
| C53 + M11 启动（A 模式 push + PR 闭环） | 2026-08-20 | C53（已闭环）+ M11 启动 | [todo-archive.md §C53](../../plan/todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档) + [todo-archive.md §M11 推进批次](../../plan/todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) |
| M8 迁入分片 + T1005 落地（sandbox 路由接线） | 2026-08-20 | M8 段 + T1005（sandbox 路由接线） | [todo-archive.md §C53 顶部 banner](../../plan/todo-archive.md) + [archive/todo-archive-phases-m6-m7-t711.md §M8](todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档) |
| M10 + T912 主体（沙箱容器 + SMTP 邮件） | 2026-08-20 | C26 + T912-3 → C28 | [todo-archive.md §M10](../../plan/todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](../../plan/todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动) |
| 2026-08-20 平台 UI 增强（C59-C61） | 2026-08-20 | C59+C60+C61 | [todo-archive.md §2026-08-20 平台 UI 增强](../../plan/todo-archive.md#2026-08-20-平台-ui-增强c59-c60-c61) |
| 2026-08-19 batch-runs 增强（C54+C55） | 2026-08-19 | C54+C55 | [archive/todo-archive-phases-m11.md §2026-08-19 batch-runs 增强](todo-archive-phases-m11.md#2026-08-19-batch-runs-增强c54c55) |
| 2026-08-19 平台可用性（PR1-PR3） | 2026-08-19~20 | C47+C48+C52+C46+C49+C50+C51 | [archive/todo-archive-phases-m11.md §2026-08-19 平台可用性批次](todo-archive-phases-m11.md#2026-08-19-平台可用性批次pr1-pr3--c51) |
