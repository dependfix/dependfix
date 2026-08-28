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

## 4. 当前基线（2026-08-28 M17 阶段归档后）

- `roadmap.md`: 健康窗口（约 325 行，< 800 阈值）。M0-M17 全部归档；Milestone 概述表 18 阶段按时间顺序排列（M0→M17）；M17 行新增（已完成 2026-08-28 归档 / 9 commits 含 session 收尾已全部推送 ahead=0）；当前阶段任务指针 L316 更新（ahead=0 已全部推送 + 等待 M18）；M17 段新增详细实施状态段（与 M16 段风格对齐）。
- `todo.md`: 健康窗口（约 69 行，< 500 阈值）。M17 任务清单 + §M17 拆分依据与实施路径 整段（L20-L96）已迁出至 [todo-archive.md §M17](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)；顶部 banner 切换为"M17 全部 6 子阶段已闭环归档（2026-08-28）— 等待 M18" + ahead=0（9 commits 含 session 收尾已全部推送至 origin/master 校正 session 文件 stale 描述）；保留待人工验收 3 项真实环境验证（T701/T702/T704）+ 发布管线收尾随可用性推进。
- `todo-archive.md`: **健康窗口（约 673 行，< 700 分片阈值）**。主窗口保留最近 5 个批次（回到"3-5 个阶段"健康策略）：**2026-08-28 M17 安全与可用性收口（M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 全部已闭环 / 9 commits 含 session 收尾已全部推送 ahead=0）/ 2026-08-28 M16 平台可用性深化（M16.1+M16.2+M16.3+M16.4+M16.5 已实施 / M16 全部闭环）/ 2026-08-26 M15 扫描历史详情侧栏增强（UX-R2）/ 2026-08-26 M14 platform release 通道闭环 + UX 反馈跟进（M14.1+M14.2+M14.3+M14.x+M14.y）/ 2026-08-26 M13 治理 + UX 反馈 + 网络治理 + Code Scanning（M13.1+M13.2+M13.3+M13.4）** + M12/M8/C53/M11 推进批次指针段。M17 段含 6 子任务闭环清单 + 验收 + 治理记录 + 关键决策 + 关键经验（8 条 pattern/principle 沉淀至 standards + code-auditor.agent.md）+ 待迁移经验（C39/S-5/C34/S1/S2/S3/S4 + wait 待迁移清单）。**本批次同期动作**：M12（19 commits / C65-A/B/C/D 4 子批次 + CI 修复 + network-audit + 收口）从 todo-archive.md 主窗口预防性迁出至新分片 [todo-archive-phases-m12.md](todo-archive-phases-m12.md)（M17 段 152 行新增后主窗口 738 行超 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略）。
- `backlog.md`: 健康窗口（267 行，< 500 阈值）。本批次清理 4 个已闭环条目：**C38 encryptionKey 标准化 / S-2 authedCookieHeader 抽取 / S-4 better-auth admin viewer role check 单测补强 / 服务端 API i18n 范围外扩展**（已由 M17 全部 6 子阶段闭环落地）—— 主条目从 §服务端凭据加密路径 / §测试基础设施清理 / §测试覆盖补强 段"已上收 M17.x"标注段按 backlog 维护规则 5 短期候选正式上收后从 backlog 主条目迁出（保留 [§M17 启动批次](#) 历史归档指针段描述）；同时把 §M17 闭环整理记录追加到状态 banner（**2026-08-28 闭环整理（M17 归档批次）**）覆盖 §M17 启动批次标注段。**未删**：S-5（调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理）/ C39（standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步）/ C34（存量规范严格约束挂接盘点）/ S1（`SCAN_PENDING_MERGED` 死代码）/ S2（`detectServerLocale` 缺 `?locale=` URL query 支持）/ S3（S-4 `update-user` 端点 viewer 403 矩阵延后）/ S4（S-4 admin 200 双向断言延后）——M17 audit suggest 延后候选保留；已知边界 / 长期主线 / 周期性回归验证层 / C33 / C36 / C37 / D1-D8 / T701-e2e / SAML / B1-B2 / T905 / C22-C24 / G1 等不变。
- 分片记录：
  - `[todo-archive-phases-m0-m1.md](todo-archive-phases-m0-m1.md)`（M0 / M1，2026-08-07 迁出，115 行）
  - `[todo-archive-phases-m2-m55.md](todo-archive-phases-m2-m55.md)`（M2 / M3 / M4 / M4.5 / M4.6 / M5 / M5.5，2026-08-14 迁出，T906 执行，398 行）
  - `[todo-archive-phases-m6-m7-t711.md](todo-archive-phases-m6-m7-t711.md)`（M6 / M7.1 / M7.2 / T711 / M8，2026-08-20 neat-freak 批次 + M8 补入，293 行）
  - `[todo-archive-phases-m11.md](todo-archive-phases-m11.md)`（**M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 推进批次 / 2026-08-20 e2e 修复批次（C62+C63+C64+chore，2026-08-26 M15 归档批次预防性迁出）**，2026-08-20 M11 归档批次迁出；2026-08-26 e2e 修复批次迁出补入）
  - `[todo-archive-phases-m10-c53-c59c61.md](todo-archive-phases-m10-c53-c59c61.md)`（**M10 / T912 / C53 / 2026-08-20 平台 UI 增强 C59-C61，2026-08-28 M16 归档批次预防性迁出**——M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略）
  - `[todo-archive-phases-m12.md](todo-archive-phases-m12.md)`（**M12 平台 UX 一致性 + i18n 治理（19 commits / C65-A 5 + C65-B 2 + standards check:docs 1 + C65-C 2 + C65-D 5 + CI 修复 1 + CI 稳定性 1 + network-audit 2），2026-08-28 M17 归档批次预防性迁出**——M17 段 152 行新增后主窗口 738 行超 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略）

## 5. 近期归档批次登记

| 批次 | 归档日期 | 关联 backlog | 归档位置 |
|:--|:--|:--|:--|
| **2026-08-28 M17 阶段归档（安全与可用性收口 M17.1+M17.2+M17.3+M17.4+M17.5+M17.6 全部闭环）** | **2026-08-28** | **M17 全部 6 子阶段闭环**：M17.1 T1701 C38 encryptionKey 标准化统一 `NUXT_ENCRYPTION_KEY` 路径（service 直读 env → runtimeConfig；8 文件 / +58/-30；关键 commit `b0d3ac0 fix(platform)`）/ M17.2 T1702 credentials 服务端 API i18n（2 文件 throw 改造 + 既有测试调整；7 文件 / +90/-14；关键 commit `5f66a08 refactor(api)`）/ M17.3 T1703 schedules 服务端 API i18n（3 文件 throw 改造 + 既有测试调整；8 文件 / +93/-18；关键 commit `90549a0 refactor(api)`）/ M17.4 T1704 batch-runs + repos batch 服务端 API i18n（5 文件 throw 改造 + 字典 + helper + codeSet 测试；按 13 文件超 10 阈值拆 2 commits：commit 1 `98fd47d refactor(api)` 9 文件字典 + helper + API throw 改造 / commit 2 `a1c7c4e test(platform)` 4 文件既有测试 message→code 断言调整 + audit standard depth Reject 后补修）/ M17.5 T1705 S-2 `authedCookieHeader` 抽取至 `tests/e2e/helpers/`（纯重构 + 用户指令 lint auto-fix 接受；拆 2 commits：commit 1 `466b142 refactor(e2e)` 4 文件 helper 抽取 / commit 2 `fc0b175 chore(platform)` 1 文件 ESLint array-type 自动修复）/ M17.6 T1706 S-4 better-auth admin viewer 403 矩阵补强（5 端点 viewer 403 单测；1 文件 / +98；关键 commit `56df374 test(e2e)`）/ session 收尾治理 commit `9bdb2dc chore(plan+standards)`（6 子阶段闭环状态登记 + 8 条经验教训沉淀 + backlog 锚点修复；7 文件 / +41/-26）**；**9 commits 已全部推送至 origin/master（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测——校正 session 文件 stale `ahead=8` 描述；M17.1 1 + M17.2 1 + M17.3 1 + M17.4 2 + M17.5 2 + M17.6 1 + session 收尾 1）；含 M17.4 commit 2 audit standard depth Reject 1 次后针对性补修闭环（M17 session 关键教训——nuxt typecheck 不实测不能信 Done 输出）；8 轮独立 Review Gate Pass（M17.1 standard + M17.2 quick + M17.3 quick + M17.4 standard × 2 含 1 次 Reject + M17.5 quick × 2 + M17.6 quick + session 收尾 quick）；**本批次清理 backlog 4 个已上收 M17 主条目（C38 encryptionKey 标准化 / S-2 authedCookieHeader 抽取 / S-4 better-auth admin viewer role check 单测补强 / 服务端 API i18n 范围外扩展，按 backlog 维护规则 5 短期候选正式上收后从 backlog 主条目迁出至历史归档指针段）；保留 audit suggest 延后候选 S-5（`process.env.ENCRYPTION_KEY` 死代码清理）/ C39（standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步）/ C34 / S1 / S2 / S3 / S4 登记 backlog；**同期预防性迁出 M12 至新分片 [todo-archive-phases-m12.md](todo-archive-phases-m12.md)**（M17 段 152 行新增后主窗口 738 行超 700 分片阈值，预防性迁出与 M16 批次预防性迁出 M10/T912/C53/C59-C61 同源策略） | **[todo-archive.md §M17](../../plan/todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档) + [roadmap.md §M17](../../plan/roadmap.md#m17-安全与可用性收口已完成-2026-08-28-归档) + [backlog.md §已闭环阶段 M0-M17](../../plan/backlog.md)** |
| **2026-08-28 M16 阶段归档（平台可用性深化 M16.1+M16.2+M16.3+M16.4+M16.5 全部闭环）** | **2026-08-28** | **M16 全部 5 子任务闭环**：M16.1 UX-R3 `/scans` 独立页面 + `/api/runs` organizationId 隔离 + `/api/scan-history/summary` + 5 case e2e（关键 commit `b8e54a6` 后端 + `db1f64b` e2e + `f9cb1da` 收口 + `acfdc8d8` 后续补测）/ M16.2 C66-D alerts "立即修复此仓库" 入口（reuseScanRunId + AlertRunSidebar 抽取 + useFixNow composable + 7 case 单测 + 3 case e2e；关键 commit `d656dc3` 后端 + `ccfa33c` 前端 + `5a3b31a` composable + `5e9c3c1` 测试 + `8675608` 收口）/ M16.3 C36 服务端 API 错误消息 i18n（createLocalizedError helper + detectServerLocale + serverErrors 字典 16 code × 双语 + 31 case 单测 + 7 case e2e；关键 commit `a573df3` helper + `b604f79` guard/repos + `e9c406e` runs + `ace07a8` e2e + `01dc7cd` 收口——5 commits）/ M16.4 PrimeVue hydration 主线 #1 缓解（alerts 迁移 useAsyncData + useRequestFetch + buildAlertsQuery 抽取 + 2 fixme 全取消 + SSR 锁定 test；关键 commit `96c8446` utility + `21b2267` alerts 迁移 + `039a987` e2e + `01dc7cd` 收口——4 commits）/ M16.5 T701-e2e 管理端点集成测试补强（auth-self-guard 23 case + 三角色鉴权 16 case + 16 case e2e + ENCRYPTION_KEY 兜底；关键 commit `3072587` auth-self-guard + `6889a74` 三角色鉴权 + `a6b2b27` 三 e2e + `7c28ac8` ENCRYPTION_KEY 兜底 + `31bed27` 收口——5 commits）**；19 commits 已全部推送至 origin/master（ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测；M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5；含 kebab-case rename refactor `acfdc8d8` 触发的 CI Coverage 修复批次）；CI run #33068271005 Coverage job 触发 80% 阈值失败，已通过 M16 新代码补测批次恢复至 80.27% → 85.67%；5 轮独立 Review Gate Pass（M16.1 standard / M16.2 standard 2 轮 / M16.3 standard / M16.4 standard / M16.5 standard）；**本批次清理 backlog UX-R3 主条目（迁至历史归档指针段）+ 新增 M16.5 audit backlog（C38 ENCRYPTION_KEY 标准化 / S-2 authedCookieHeader helpers 抽取 / S-4 better-auth admin 端点 viewer role check 单测补强）+ M16.3 audit suggest 范围外扩展（`/api/credentials/*` 等端点未本地化）——M16.6+ 候选**；**同期预防性迁出 M10 / T912 / C53 / 2026-08-20 平台 UI 增强 C59-C61 至新分片 todo-archive-phases-m10-c53-c59c61.md**（M16 段 110 行新增前主窗口 618 行接近 700 分片阈值，预防性迁出与 M15 归档批次同源策略） | **[todo-archive.md §M16](../../plan/todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档) + [roadmap.md §M16](../../plan/roadmap.md#m16-平台可用性深化已完成-2026-08-28-归档) + [backlog.md §已闭环阶段 (M0-M16)](../../plan/backlog.md)** |
| **2026-08-26 M15 阶段归档（扫描历史详情侧栏增强 UX-R2）** | **2026-08-26** | **M15.1 UX-R2 4 子任务全部闭环（UX-R2-A `1112017` 实施：Sidebar 5 列运行元数据 + RunDetailDialog 新增 + utility 抽取 + i18n 7 键 + `runs.statusDegraded` / UX-R2-B 按执行器条件渲染 Run URL / UX-R2-C `1112017` 一并交付 RunDetailDialog 复用 `GET /api/runs/:id` / UX-R2-D `0a60e3d` 实施：16 case 单测覆盖 6 utility 所有分支 + 2 case e2e 覆盖 Sidebar 元数据 + URL 条件渲染）**；3 commits ahead 待用户推送：`5c65177` P 阶段 docs + `1112017` feat 实施（5 文件 / +425/-12，实证 `git show --stat`）+ `0a60e3d` test 覆盖（2 文件 / +251，实证 `git show --stat`）；2 轮 code-auditor quick depth Pass（Round 1 Reject 1 blocker B1 `alertsFound` 误用 → Round 2 Pass + 4 suggest）；**本批次清理 backlog UX-R2 主条目（迁至历史归档指针段）+ 同期 §2026-08-20 e2e 修复批次从 todo-archive.md 主窗口预防性迁出至分片（700 行阈值前）** | **[todo-archive.md §M15](../../plan/todo-archive.md#m15-扫描历史详情侧栏增强ux-r2已闭环) + [roadmap.md §M15](../../plan/roadmap.md#m15-扫描历史详情侧栏增强ux-r2已完成-2026-08-26-归档) + [backlog.md §已闭环阶段 (M0-M15)](../../plan/backlog.md)** |
| **2026-08-26 M14 阶段归档（platform release 通道闭环 + UX 反馈跟进）** | **2026-08-26** | **M14 4 子阶段全部闭环（M14.1 T1310 F 阶段闭环 + M14.2 UX-R1 扫描历史分页 + M14.3 M13.4 T1403 follow-up + M14.x neat-freak 批次）+ M14.y 依赖批量治理（4 个 dependabot major PR）**；19 commits 已全部落地（ahead=0 实证 `git rev-list HEAD ^origin/master --count`）；本批次清理 backlog UX-R1 主条目（迁至历史归档指针段） | **[todo-archive.md §M14](../../plan/todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环) + [roadmap.md §M14](../../plan/roadmap.md)** |
| **2026-08-26 M13 阶段归档（治理 + UX 反馈 + 网络治理 + Code Scanning）** | **2026-08-26** | **M13 4 子阶段全部闭环（M13.1+T1301+T1302+T1303+T1304 / M13.2+T1305+T1306+T1309 / M13.3+T1307+T1308 / M13.4+T1401+T1402+T1403）+ T1310 部分 ahead 已提交**；26 commits 已推送至 origin/master（ahead=3 仅 M13.4 三 commits 待用户推送） | **[todo-archive.md §M13](../../plan/todo-archive.md#m13-治理--ux-反馈--网络治理--code-scanning已闭环) + [roadmap.md §M13](../../plan/roadmap.md#m13-治理--ux-反馈--网络治理--code-scanning已完成-2026-08-26-归档)** |
| **2026-08-21 M12 阶段归档（平台 UX + i18n 治理）** | **2026-08-25** | **M12 4 子批次全部闭环（C65-A/B/C/D 9 子任务） + CI 修复 + 网络审计白名单追加**；19 commits 全部推送至 origin/master（ahead=0） | **[archive/todo-archive-phases-m12.md](todo-archive-phases-m12.md) + [roadmap.md §M12](../../plan/roadmap.md#m12-平台-ux-一致性--i18n-治理已完成-2026-08-21-归档)**（2026-08-28 M17 归档批次预防性分片迁出 todo-archive.md 主窗口） |
| 2026-08-20 e2e 修复批次（C62 + C63 + C64 + chore） | 2026-08-20 | 修复批（非新功能）：CI 32382730911 code-scanning #23/#24/#25 + CI 32383730911 6 e2e 失败 + PrimeVue 4 + Nuxt hydration 兼容性 | [archive/todo-archive-phases-m11.md §2026-08-20 e2e 修复批次](../../plan/archive/todo-archive-phases-m11.md#2026-08-20-e2e-修复批次c62--c63--c64--chore)（2026-08-26 M15 归档批次从 todo-archive.md 主窗口预防性迁出至分片） |
| 2026-08-20 M11 推进批次（C58 + C-ENV + T1005 + C28 + C56/C57 + C53-后） | 2026-08-20 | M11 全部子任务 | [archive/todo-archive-phases-m11.md §M11 推进批次](todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) |
| C53 + M11 启动（A 模式 push + PR 闭环） | 2026-08-20 | C53（已闭环）+ M11 启动 | [archive/todo-archive-phases-m10-c53-c59c61.md §C53](todo-archive-phases-m10-c53-c59c61.md#c53-平台集成模式-fix-修复结果推送远程已归档) + [archive/todo-archive-phases-m11.md §M11 推进批次](todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建) |
| M8 迁入分片 + T1005 落地（sandbox 路由接线） | 2026-08-20 | M8 段 + T1005（sandbox 路由接线） | [archive/todo-archive-phases-m6-m7-t711.md §M8](todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档) |
| M10 + T912 主体（沙箱容器 + SMTP 邮件） | 2026-08-20 | C26 + T912-3 → C28 | [archive/todo-archive-phases-m10-c53-c59c61.md §M10](todo-archive-phases-m10-c53-c59c61.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t9123--c28-联动) |
| 2026-08-20 平台 UI 增强（C59-C61） | 2026-08-20 | C59+C60+C61 | [todo-archive.md §2026-08-20 平台 UI 增强](../../plan/todo-archive.md#2026-08-20-平台-ui-增强c59-c60-c61) |
| 2026-08-19 batch-runs 增强（C54+C55） | 2026-08-19 | C54+C55 | [archive/todo-archive-phases-m11.md §2026-08-19 batch-runs 增强](todo-archive-phases-m11.md#2026-08-19-batch-runs-增强c54c55) |
| 2026-08-19 平台可用性（PR1-PR3） | 2026-08-19~20 | C47+C48+C52+C46+C49+C50+C51 | [archive/todo-archive-phases-m11.md §2026-08-19 平台可用性批次](todo-archive-phases-m11.md#2026-08-19-平台可用性批次pr1-pr3--c51) |
