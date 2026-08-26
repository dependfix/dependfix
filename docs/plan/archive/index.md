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

## 4. 当前基线（2026-08-26 M15 阶段归档后）

- `roadmap.md`: 健康窗口（约 268 行，< 800 阈值）。M0-M15 全部归档；Milestone 概述表 16 阶段按时间顺序排列（M0→M15）；M15 行从"进行中（M15.1）"改为"已完成（2026-08-26 归档 / ahead 部分待用户推送）"；M15 段 §侧栏增强 标题从"（进行中）"改为"（**已完成 2026-08-26 归档**）"含 4 子任务全部闭环；M16 候选 UX-R3 待 P 阶段规划（不在本批次范围）。
- `todo.md`: 健康窗口（已切换为 M15 已闭环 / M16 候选待启动）。M15 实施 ahead 3 commits（`5c65177` P 阶段 docs + `1112017` feat 实施 + `0a60e3d` test 覆盖）按 [规划规范 §4.4 §5 ahead 实证](../../docs/standards/planning.md) `git rev-list HEAD ^origin/master --count` 动态核验（不写死具体数字以免 staleness）；ahead 部分待用户推送；保留待人工验收 3 项真实环境验证（T701/T702/T704）+ 发布管线收尾随可用性推进。
- `todo-archive.md`: **健康窗口（约 620 行，≤ 700 分片阈值内）**。主窗口保留最近 7 个批次（3-5 策略略超但仍合规）：**2026-08-26 M15 扫描历史详情侧栏增强（UX-R2）/ 2026-08-26 M14 platform release 通道闭环 + UX 反馈跟进（M14.1+M14.2+M14.3+M14.x+M14.y）/ 2026-08-26 M13 治理 + UX 反馈 + 网络治理 + Code Scanning（M13.1+M13.2+M13.3+M13.4）/ 2026-08-21 M12 平台 UX 一致性 + i18n 治理 / C53 / 2026-08-20 平台 UI 增强 C59-C61 / 2026-08-20 M11 推进批次**。M15 段含 4 子任务闭环清单 + 验收 + 治理记录 + 关键决策 + 关键经验 + 待迁移经验（3 commits ahead 落地 + 本批次归档 1 atomic commit）。**本批次同期动作**：§2026-08-20 e2e 修复批次（C62+C63+C64+chore）从 todo-archive.md 主窗口迁出至 [todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（主窗口 700 行分片阈值前的预防性迁出）。
- `backlog.md`: 健康窗口（267 行，< 500 阈值）。本批次清理 1 个已闭环条目：**UX-R2 扫描历史详情 Sidebar 增强**（已由 M15 闭环落地）—— 主条目从 §扫描历史与详情 UX 段迁出至历史归档指针段（已闭环阶段 M0-M14 → M0-M15）；同时把 §2026-08-20 e2e 修复批次相关引用从 `todo-archive.md` 主窗口主条目迁出至 `archive/todo-archive-phases-m11.md` 分片（更新 `### 已知边界与 known-issue` 段引用）。**未删**：已知边界 / 长期主线 / 周期性回归验证层 / C33 / C36 / C37 / D1-D8 / T701-e2e / SAML / B1-B2 / T905 / C22-C24 / C34 / G1 / UX-R3 等。
- 分片记录：
  - `[todo-archive-phases-m0-m1.md](todo-archive-phases-m0-m1.md)`（M0 / M1，2026-08-07 迁出，115 行）
  - `[todo-archive-phases-m2-m55.md](todo-archive-phases-m2-m55.md)`（M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5，2026-08-14 迁出，T906 执行，398 行）
  - `[todo-archive-phases-m6-m7-t711.md](todo-archive-phases-m6-m7-t711.md)`（M6 / M7.1 / M7.2 / T711 / M8，2026-08-20 neat-freak 批次 + M8 补入，293 行）
  - `[todo-archive-phases-m11.md](todo-archive-phases-m11.md)`（**M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次 / 2026-08-20 e2e 修复批次（C62+C63+C64+chore，2026-08-26 M15 归档批次预防性迁出）**，2026-08-20 M11 归档批次迁出；2026-08-26 e2e 修复批次迁出补入）

## 5. 近期归档批次登记

| 批次 | 归档日期 | 关联 backlog | 归档位置 |
|:--|:--|:--|:--|
| **2026-08-26 M15 阶段归档（扫描历史详情侧栏增强 UX-R2）** | **2026-08-26** | **M15.1 UX-R2 4 子任务全部闭环（UX-R2-A `1112017` 实施：Sidebar 5 列运行元数据 + RunDetailDialog 新增 + utility 抽取 + i18n 7 键 + `runs.statusDegraded` / UX-R2-B 按执行器条件渲染 Run URL / UX-R2-C `1112017` 一并交付 RunDetailDialog 复用 `GET /api/runs/:id` / UX-R2-D `0a60e3d` 实施：16 case 单测覆盖 6 utility 所有分支 + 2 case e2e 覆盖 Sidebar 元数据 + URL 条件渲染）**；3 commits ahead 待用户推送：`5c65177` P 阶段 docs + `1112017` feat 实施（5 文件 / +425/-12，实证 `git show --stat`）+ `0a60e3d` test 覆盖（2 文件 / +251，实证 `git show --stat`）；2 轮 code-auditor quick depth Pass（Round 1 Reject 1 blocker B1 `alertsFound` 误用 → Round 2 Pass + 4 suggest）；**本批次清理 backlog UX-R2 主条目（迁至历史归档指针段）+ 同期 §2026-08-20 e2e 修复批次从 todo-archive.md 主窗口预防性迁出至分片（700 行阈值前）** | **[todo-archive.md §M15](../../plan/todo-archive.md#m15-扫描历史详情侧栏增强ux-r2已闭环) + [roadmap.md §M15](../../plan/roadmap.md#m15-扫描历史详情侧栏增强ux-r2已完成-2026-08-26-归档) + [backlog.md §已闭环阶段 (M0-M15)](../../plan/backlog.md)** |
| **2026-08-26 M14 阶段归档（platform release 通道闭环 + UX 反馈跟进）** | **2026-08-26** | **M14 4 子阶段全部闭环（M14.1 T1310 F 阶段闭环 + M14.2 UX-R1 扫描历史分页 + M14.3 M13.4 T1403 follow-up + M14.x neat-freak 批次）+ M14.y 依赖批量治理（4 个 dependabot major PR）**；19 commits 已全部落地（ahead=0 实证 `git rev-list HEAD ^origin/master --count`）；本批次清理 backlog UX-R1 主条目（迁至历史归档指针段） | **[todo-archive.md §M14](../../plan/todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环) + [roadmap.md §M14](../../plan/roadmap.md)** |
| **2026-08-26 M13 阶段归档（治理 + UX 反馈 + 网络治理 + Code Scanning）** | **2026-08-26** | **M13 4 子阶段全部闭环（M13.1+T1301+T1302+T1303+T1304 / M13.2+T1305+T1306+T1309 / M13.3+T1307+T1308 / M13.4+T1401+T1402+T1403）+ T1310 部分 ahead 已提交**；26 commits 已推送至 origin/master（ahead=3 仅 M13.4 三 commits 待用户推送） | **[todo-archive.md §M13](../../plan/todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环) + [roadmap.md §M13](../../plan/roadmap.md#m13-治理--ux-反馈--网络治理--code-scanning已完成-2026-08-26-归档)** |
| **2026-08-21 M12 阶段归档（平台 UX + i18n 治理）** | **2026-08-25** | **M12 4 子批次全部闭环（C65-A/B/C/D 9 子任务） + CI 修复 + 网络审计白名单追加**；19 commits 全部推送至 origin/master（ahead=0） | **[todo-archive.md §M12](../../plan/todo-archive.md#m12-平台-ux-一致性--i18n-治理已归档) + [roadmap.md §M12](../../plan/roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档)** |
| 2026-08-20 e2e 修复批次（C62 + C63 + C64 + chore） | 2026-08-20 | 修复批（非新功能）：CI 32382730911 code-scanning #23/#24/#25 + CI 32383730911 6 e2e 失败 + PrimeVue 4 + Nuxt hydration 兼容性 | [archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](../../plan/archive/todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（2026-08-26 M15 归档批次从 todo-archive.md 主窗口预防性迁出至分片） |
| 2026-08-20 M11 推进批次（C58 + C-ENV + T1005 + C28 + C56/C57 + C53-后） | 2026-08-20 | M11 全部子任务 | [todo-archive.md §M11 推进批次](../../plan/todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) + [archive/todo-archive-phases-m11.md](todo-archive-phases-m11.md) |
| C53 + M11 启动（A 模式 push + PR 闭环） | 2026-08-20 | C53（已闭环）+ M11 启动 | [todo-archive.md §C53](../../plan/todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档) + [todo-archive.md §M11 推进批次](../../plan/todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) |
| M8 迁入分片 + T1005 落地（sandbox 路由接线） | 2026-08-20 | M8 段 + T1005（sandbox 路由接线） | [todo-archive.md §C53 顶部 banner](../../plan/todo-archive.md) + [archive/todo-archive-phases-m6-m7-t711.md §M8](todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档) |
| M10 + T912 主体（沙箱容器 + SMTP 邮件） | 2026-08-20 | C26 + T912-3 → C28 | [todo-archive.md §M10](../../plan/todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](../../plan/todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动) |
| 2026-08-20 平台 UI 增强（C59-C61） | 2026-08-20 | C59+C60+C61 | [todo-archive.md §2026-08-20 平台 UI 增强](../../plan/todo-archive.md#2026-08-20-平台-ui-增强c59-c60-c61) |
| 2026-08-19 batch-runs 增强（C54+C55） | 2026-08-19 | C54+C55 | [archive/todo-archive-phases-m11.md §2026-08-19 batch-runs 增强](todo-archive-phases-m11.md#2026-08-19-batch-runs-增强c54c55) |
| 2026-08-19 平台可用性（PR1-PR3） | 2026-08-19~20 | C47+C48+C52+C46+C49+C50+C51 | [archive/todo-archive-phases-m11.md §2026-08-19 平台可用性批次](todo-archive-phases-m11.md#2026-08-19-平台可用性批次pr1-pr3--c51) |
