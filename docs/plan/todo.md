# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M39 进行中**——平台视图体验与可观测补强（2026-10-09 用户决策方案 A / 6 原子条目） |
| 下一阶段（未授权） | 无——M39 闭环后再按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 评估 backlog 候选池 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M38 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M38 已归档；M39 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M39: 平台视图体验与可观测补强（2026-10-09 用户决策方案 A / M39.1~M39.6）

> **阶段定位**：承接 M38 平台执行模型隔离归档后的平台视图体验与可观测阶段。来源为 2026-10-08 定时扫描批量失败排查中用户在同一批反馈的 8 项平台问题（扫描页按状态筛选与聚合分页、扫描历史弹窗关闭按钮与日志区高度、告警视图按包聚合、运行日志下载、PR Check 启用、环境事件覆盖）——这 8 项按类型平衡归并为 6 原子（M39.1~M39.6）。同批排查另有「既有基线失败被误判为运行失败」的引擎口径缺陷 1 项，已按 [§3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 可用性插队例外先行修复（`e5c59b8`，口径见 [dependency-fixer.md §12.6](../design/modules/dependency-fixer.md)），不计入本阶段；其衍生的 3 项运行时可靠性候选（部署产物版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）留 [backlog.md](backlog.md)。backlog 批次共登记 9 项候选 = 6 项上收 M39 + 3 项保留。
> **类型平衡**：🎨 用户体验 3（M39.1 + M39.2 + M39.3）+ 🚀 能力扩展 2（M39.4 + M39.5）+ 🛡️ 可观测与治理 1（M39.6）= 6 原子，接近 [规划规范 §1.1 类型平衡建议](../standards/planning.md#11-硬性约束)（🧪 无独立条目——测试随 M39.3 视觉 / e2e 基线重建与各条目内嵌，缺口已显式标注）。
> **§3.4 三重交叉核验**（2026-10-09 启动批次实测，**0 项重复评估**）：① **todo-archive 扫描**——6 项候选在 `todo-archive.md` + `archive/*.md` 无对应已闭环标注（历史命中均为邻近主题：M14.2 的「后端分页」针对 `/api/runs` 与 `RepoHistoryDialog` 列表、M16 深链 query 仅 `?repository=` / `?run=`、M24.1 PR Check MVP 为实现链路而非启用链路、M11 audit_event 为通知维度、M31.2 为 alerts rowGroup 迁移本身）；② **git log**——`git log --all --grep` 无「日志下载 / 批量下载 / 扫描页筛选 / PR Check 启用 / 环境事件覆盖 / 按包聚合」对应修复 commit（`da148f8` 仅为本批候选登记）；③ **代码 anchor**——`scans.vue:471-647` byRepo 聚合表无任何筛选 / 无分页、`scan-history/summary.get.ts:135-138` 仅收 `repositoryId`、`repo-history-dialog.vue:331-342` + `:385` 冗余 body 关闭按钮 + 固定日志区高度、`alerts.vue:327-329` 排序键仅 `_severityRank`、`api/schedules/index.ts:56-67` 与 `[id].ts:63-73` 未落库 `kind`、`scan-orchestrator.service.ts:467-532` 仅 sandbox 事件。
> **用户决策点**（2026-10-09 裁定）：**D1 候选组合 = 方案 A**——用户报告的 8 项归并为 6 原子（🎨 3 + 🚀 2 + 🛡️ 1）；运行时可靠性衍生的 3 项候选（部署产物版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）留在 [backlog.md](backlog.md) 待评估。
> **不做什么（阶段级）**：不改引擎修复 / 验证业务语义（M39.3 仅改前端分组口径，不动 per-alert 模型与 `take(500)` 窗口）；不改 `/api/runs` 既有契约与 runs 列表三筛选语义；不引入新组件库 / 对象存储 / 外部告警系统；不实现 GitHub App 的 pr-check 路径（当前仅 PAT）；不改 sandbox 执行器行为；不改变更权限模型。

- **M39.1**（P2，🎨 用户体验）扫描页筛选与分页优化
  - **目标**：让「按仓库聚合」表可按最近状态筛选并分页，并使两表不再上下堆叠导致单屏信息过载；消除「只能按项目筛选」的体感。
  - **优先级**：P2
  - **范围**：`apps/platform/app/pages/scans.vue`（byRepo 表新增状态筛选 + 分页或上限 + 两表分区 / Tab 展示）；`apps/platform/server/api/scan-history/summary.get.ts`（新增状态查询参数 + 分页 / 上限口径）；`apps/platform/i18n/locales/{zh-CN,en-US}.json`；`apps/platform/tests/e2e/`（scans 用例）。
  - **验收标准**：
    - [x] `GET /api/scan-history/summary` 支持按 `lastStatus` 过滤（非法值 400）；过滤作用于**聚合结果**（每个仓库最近一次运行状态），筛选后 `repositories` 与全量中该状态的集合**精确相等**（定向单测：集合一致性 + 专用仓库前置 + `totals` / `window` 不受影响 + `repositoryId` 组合 AND）
    - [x] byRepo 表不再一次性渲染全部仓库：**口径定稿 = 客户端分页**（受控 `page` / `rows`，默认 10、可选 10/25/50）；聚合列表窗口有界（≤ 500 run），无需服务端分页
    - [x] 两表改 **CaomeiTabs** 分区（「全部运行」/「按仓库」，默认「全部运行」）；runs 表既有 状态 / 失败阶段 / 建议 三筛选与服务端分页语义不变（全量 e2e 180 passed 回归通过）
    - [x] i18n 双语 key parity（`pnpm run i18n:audit`：Missing parity 0）；新增筛选 / 分页 e2e 用例通过（scans case 5）
    - [x] `pnpm lint`（0 error）+ `pnpm typecheck`（7 包 Done）0 error；`pnpm --filter @dependfix/platform test` 全量 1628 passed | 9 skipped
  - **D 阶段决策留痕（2026-10-09，用户裁定）**：① byRepo 分页 = **客户端分页**（不引入服务端 page/total，API 形状最小）；② 两表布局 = **CaomeiTabs 分区、默认「全部运行」**（与既有首屏 e2e 语义一致）；③ 窗口耦合口径 = 筛选仅作用于聚合结果、`byStatus`/`totals`/`window` 保持窗口全量，并在 UI 加「统计窗口」提示（`scans.byRepo.windowHint`）显式标注边界；④ 「仅查看此仓库」行操作切到「全部运行」分区（不改变 `?repository=` 深链语义）。
  - **不做什么**：不改 runs 列表三筛选与分页；不改 500 run 聚合窗口口径本身（仅在其上叠加筛选 / 分页）；不新增服务端实体或迁移；不改 `?repository=` / `?run=` 深链语义。
  - **依赖**：M37.1 失败分类三列与三维筛选（已闭环）；`scan-history/summary` 现有 `byStatus` / `totals` 口径。
  - **交付物**：预计 2-3 commits（feat(platform) summary 参数 + 前端筛选分页 / 分区 + docs(plan) 收口）；文件 4-5（`summary.get.ts` / `scans.vue` / e2e / i18n ×2）。
  - **实际交付（2026-10-09）**：拆 3 commits——`feat(platform)` 后端（`summary` 端点 `lastStatus` 筛选 + 错误码 + i18n + 单测，单测随修复点入库）/ `feat(platform)` 前端（`scans` 页 Tabs 分区 + byRepo 筛选 + 客户端分页 + 窗口提示 + e2e）/ `docs(plan)` 收口；文件 9（`summary.get.ts` / `summary.get.test.ts` / `localized-error.ts` / `localized-error.test.ts` / i18n ×2 / `scans.vue` / `scans.e2e.test.ts`）。
  - **风险与缓解措施**：① 筛选与「最近 500 run 聚合窗口」耦合，窗口外仓库不可见 → D 阶段前定稿口径并在 UI 显式标注窗口边界；② byRepo 分页需定义稳定排序 → 复用既有 `runCount DESC, lastRunAt DESC`；③ 改 Tab 属结构变更 → 当前视觉基线未覆盖 scans 页（仅 alerts / repos / pr-checks / dialog-import-repos / login），无需重建基线，须在实现时复核。

- **M39.2**（P3，🎨 用户体验）扫描历史弹窗体验（冗余关闭按钮 + 日志区高度）
  - **目标**：移除 run 模式下 body 的冗余「× 关闭」按钮；让执行日志区随弹窗可用空间自适应，避免告警 / 结果较多时日志可视区域过小。
  - **优先级**：P3
  - **范围**：`apps/platform/app/components/repo-history-dialog.vue`（移除 `331-342` 的 body 关闭按钮 + `385` 的 `height: 200px` 固定日志区改自适应）；同构的 `apps/platform/app/components/run-detail-dialog.vue`（若日志区实现同构则一并收敛口径）。
  - **验收标准**：
    - [x] run 模式不再渲染 body「× 关闭」按钮（移除 `repo-history-dialog` 的 body 关闭按钮；关闭仅走弹窗 header `×` 与 Esc）；history 模式「返回列表」不受影响（e2e case 3 断言 body 无「关闭」按钮 + header × 可见）。**执行期发现**：`repo-history-dialog` 当前仅被 `scans.vue` 以 `query-key='run'` 挂载 → history 模式（list 视图 / 「返回列表」）**不可达**（`repos.vue` 历史入口已改为跳 `/scans?repository=`），该项以「未触碰 + 不可达」满足；已修正组件陈旧注释并登记 backlog 候选（history 模式 / legacy 页去留）
    - [x] 日志滚动区高度自适应：**口径定稿 = 视口比例 clamp**（`height: clamp(240px, 40vh, 520px)`，两弹窗同口径）——下限 240px 保证可视区不小于旧 200px，上限 520px 避免大屏过高，中档 40vh 随弹窗 85vh 预算缩放（e2e case 3 断言可视高度 > 200）
    - [x] 窄视口问题**在本条内修复**：根因 = inline `:style="{width:'720px'}"` 压过 `:breakpoints` 的样式表规则（inline 恒胜，故既有 breakpoints 为死代码）→ 改用 caomei 设计钩子 `--caomei-dialog-width: 720px`（基类 `width: min(90vw, var(--caomei-dialog-width, 480px))` + `@media (width<=640px)` 全宽规则天然响应式），两弹窗一并收敛并移除失效的 `:breakpoints`（e2e case 6 断言 480px 视口下弹窗宽度 ≤ 480）
    - [x] `pnpm lint`（0 error）+ `pnpm typecheck`（7 包 Done）0 error；相关 e2e 全过（scans 8 passed；全量 e2e 见证据）
  - **D 阶段决策留痕（2026-10-09，用户裁定）**：① 日志区自适应 = 视口比例 clamp（非 min-height+flex / 非可拖拽）；② 窄视口 `:style width` 问题在本条内修复。**执行期修正留痕**：用户选项描述设想「复用 run-detail-dialog 的 breakpoints」，实测发现 inline `:style` 宽度优先级压过 breakpoints 样式表规则（两个弹窗的 breakpoints 均为死代码）→ 改为 caomei 设计钩子 `--caomei-dialog-width`（单调响应、无 breakpoints 语义突变），达成同一目标「窄视口不溢出」。**同源衍生**：门禁脚本未排除 Playwright 产物（`playwright-report` / `test-results`）致本地误报 → 按 §3.1 登记 backlog §候选评估中（不带阶段编号），不在本条扩范围。
  - **不做什么**：不改日志的数据获取与格式化（`GET /api/runs/[id]` 的 `logs[]` / `logsText`）；不改 history 模式的分页与列表；不新增下载入口（属 M39.4）。
  - **依赖**：无（纯前端）；`CaomeiDialog` 0.5.0 的 `85vh` 上限与 body 滚动语义（`node_modules/caomei-ui` dialog 样式）。
  - **交付物**：预计 1-2 commits（fix(platform) 弹窗体验 + 必要时 docs(plan)）；文件 1-2。
  - **实际交付（2026-10-09）**：拆 4 commits——`fix(platform)`（两弹窗：移除 body 关闭按钮 + 日志区 clamp 自适应 + `--caomei-dialog-width` 响应式宽度）/ `test(platform)`（scans e2e case 3 扩展 + case 6 窄视口）/ `docs(plan)`（todo 闭环 + backlog 登记门禁产物排除缺口与弹窗 history 模式死代码）/ `docs(standards)`（platform.md §7.4 登记 `--caomei-dialog-width` 钩子）；文件 6（`repo-history-dialog.vue` / `run-detail-dialog.vue` / `scans.e2e.test.ts` / `todo.md` / `backlog.md` / `platform.md`）。
  - **风险与缓解措施**：自适应高度可能与弹窗既有 85vh 预算交互 → 以「日志区可伸缩、结果表不被挤压」为验收锚点，配合手动尺寸核验；若改动触及 alerts 弹窗视觉基线则同步重建。

- **M39.3**（P2，🎨 用户体验）告警视图「按包」聚合跨 severity 重复分组修正
  - **目标**：同一包跨多档 severity 时不再出现多个同名分组头（现状 nodemailer 同时出现在 high 与 medium），并把聚合语义定稿为「一个包一组」或「按 severity 分区」之一。
  - **优先级**：P2
  - **范围**：`apps/platform/app/pages/alerts.vue`（分组 / 排序口径：`groupRowsBy` / `multiSortMeta` / `groupCounts` / `expandedPackages` / 组头 Tag）；`apps/platform/app/utils/alerts-view.ts` + `alerts-view.test.ts`（组排序键纯函数 `summarizePackageGroups` + 单测，自 `alerts.vue` 抽离以避免其继续膨胀）；`apps/platform/tests/visual/helpers/fixtures.ts`（数据集改可表达跨档 severity）+ 受影响视觉基线重建；`apps/platform/tests/e2e/alerts-rowgroup.e2e.test.ts` + `apps/platform/tests/e2e/helpers/fixtures.helper.ts`；文档口径三处（`docs/standards/testing.md`、`docs/design/governance/caomei-ui-migration.md §15.10`、`fixtures.ts` 注释）并同步同源 `docs/standards/platform.md §7`。
  - **验收标准**：
    - [x] 同一包跨档 severity 时只出现一个分组头；**判据定稿（2026-10-09 D 阶段）=「一个包一组」**——组按该包最高 severity 降序（同级按包名升序），组内 severity 降序；组头展示包名 + 告警数 + 最高级别 Tag（另一档「按 severity 分区」未采用：不消除用户报告的同名分组头）
    - [x] 分组头计数与展开 / 折叠状态在同一包内自洽（`groupCounts` 按包键计数，一组一键）
    - [x] e2e `alerts-rowgroup` 新增跨档用例（`同一包跨 severity 只渲染一个分组头`：断言唯一 lodash 分组头 + 计数自洽 + 组头 Tag + 用户按其它列排序后仍连续）；视觉数据集新增跨档包 `nodemailer`（high + medium）并按 `--update-snapshots=all` 重建 alerts 4 张基线
    - [x] 三处文档口径同步（`testing.md` §6.7 数据确定性 / `caomei-ui-migration.md` §15.10 第 7 条 / `fixtures.ts` 注释），并同步 §同源 `platform.md` §7 分组连续性条款；不再将跨档拆组描述为「既有行为」
    - [x] `pnpm --filter @dependfix/platform test`（全量 1625 passed | 9 skipped）+ 定向 e2e（alerts-rowgroup 12 + sortable 4 = 16 passed）+ 视觉 11 passed；`pnpm lint`（0 error）+ `pnpm typecheck`（7 包 Done）0 error
  - **D 阶段决策留痕（2026-10-09）**：① 聚合语义 = 一个包一组（见上）；② 实现 = 不新增列 / 不改后端，改为「严重级别」列在按包模式返回**组排序键** `最高级别 rank × STRIDE − 包名升序序号`（组间唯一）——同包行共享同值且键唯一 → 任何排序下同包相邻（`summarizePackageGroups` 纯函数 + 单测；`onUpdateMultiSortMeta` 在按包模式把组键固定为第一排序键，等价迁移前 PrimeVue 自动保留 `groupRowsBy` 首键的行为）；③ 视觉基线 `--update-snapshots=all` 重建 + mutation 标定（3 处全击杀：M1 严重级别列 accessor 改回行级 rank → 新 e2e 渲染出 2 个 lodash 分组头 + 视觉 alerts light/dark 基线失败；M2 `onUpdateMultiSortMeta` 去掉补键 → 新 e2e「按其它列排序后仍唯一」断言失败；M3 组排序键去掉包名序号 → 新 e2e 失败；复现口径：每处 `pnpm --filter @dependfix/platform build` 后 `TMPDIR=/dev/shm playwright test alerts-rowgroup -g 跨 severity`，视觉用 `--config=playwright.visual.config.ts -g alerts`）。
  - **不做什么**：不改 alerts 后端查询与 `take(500)` 口径；不改 per-alert 模型与 `scan-reconcile`；不引入新组件库；不改「按仓库」视图分组（仅修「按包」）。
  - **依赖**：M31.2 alerts rowGroup 迁移（`69ecad1`，已归档）；caomei-ui 0.5.0 的相邻行分组实现（`displayEntries`）。
  - **交付物**：预计 2-3 commits（fix(platform) 聚合口径 + test(platform) 视觉 / e2e 基线 + docs 收口）；文件 4-6。
  - **实际交付（2026-10-09）**：3 commits（`fix(platform)` 组排序键口径 + `test(platform)` e2e / 视觉 fixture 与 4 张基线 + `docs(plan/standards)` 收口）；文件 15（含 4 张基线 PNG）——超 §1.1「10 文件」阈值，拆分依据：fix / test / docs 三类改动各自独立可回滚（测试与基线同 commit 以保证「提交态自洽」，docs 与实现解耦）；源码逻辑仅 2 文件（`alerts.vue` + `alerts-view.ts`），无服务端改动。
  - **风险与缓解措施**：① 「一个包一组」与「severity 降序」UX 目标存在张力（severity 为主键必然拆组）→ D 阶段前定稿（包为主键 + 组内展示最高级别）；② 外部库为相邻行分组，若无法在不改库前提下实现值分组，需评估服务端聚合或客户端自行分组（决策留痕）；③ 视觉基线重建须用 `=all` 口径并做 mutation 标定（防假绿）。

- **M39.4**（P2，🚀 能力扩展）运行日志下载与批量下载
  - **目标**：支持单个 run 与按当前筛选条件的批量执行日志导出（现状仅「复制」，平台全仓无下载实现）。
  - **优先级**：P2
  - **范围**：单 run 导出形态（新增 `apps/platform/server/api/runs/[id]/logs.get.ts` 带 `Content-Disposition`，或前端由 `logsText` 生成 Blob，D 阶段前定稿）；批量导出（新增端点或前端聚合，D 阶段前定稿）；`apps/platform/app/components/repo-history-dialog.vue` / `run-detail-dialog.vue`（下载入口）；i18n 双语；文档。
  - **验收标准**：
    - [x] 单 run 可下载日志（**服务端端点** `GET /api/runs/[id]/logs`，txt 附件名 `run-<id>.txt`），内容与 `logsText` 同源（同一 `parseLogEntries` / `formatLogEntries`；定向端点单测断言正文 + `Content-Disposition`）
    - [x] 批量下载按当前筛选条件导出（**服务端端点** `GET /api/runs/logs-export`，与 `/api/runs` 共用 `runsFilterSchema` + `buildRunsWhere`，合并单 txt）；**硬上限**（运行数 100 / 总字节 5 MiB）+ 超限 **413** 明确报错（定向单测：超运行数 / 超字节两分支）
    - [x] 未认证 / 跨组织访问被拒（`requireAuth` + 单 run `requireOrgResource`；批量经 `buildRunsWhere` 注入 `repository.organizationId` 隔离；e2e 未认证 401 + 单测组织隔离用例）
    - [x] i18n 双语 parity；前端下载入口在无日志时隐藏（两弹窗日志区已由 `v-if="detail.logs.length > 0"` 包裹，下载按钮随之隐藏）
    - [x] `pnpm lint`（0 error）+ `pnpm typecheck`（7 包 Done）0 error；`pnpm --filter @dependfix/platform test` 全量 1648 passed | 9 skipped
  - **D 阶段决策留痕（2026-10-10，用户裁定）**：① 单 run 导出 = **服务端端点**（txt 附件，非前端 Blob）；② 批量导出 = **服务端端点 + 合并单 txt**（不引入 zip 依赖、不做前端聚合）；③ 超限 = **硬上限 + 明确报错（413）**（运行数 100 / 总字节 5 MiB，提示缩小筛选）。
  - **不做什么**：不改日志采集（`MemoryLogger.maxEntries` 1000）与落库形态（`logs_json`）；不引入对象存储或异步大导出任务队列；不动 `GET /api/runs` 列表契约。
  - **依赖**：`ScanRun.logsJson`（迁移 `1800000000002`）；`GET /api/runs/[id]` 的 `logs` / `logsText` 口径。
  - **实际交付（2026-10-10）**：拆 4 commits——`feat(platform)`（后端：`runs-query.ts` 共享筛选层 + `/api/runs` 改用共享层 + 单 run / 批量导出端点 + 错误码 + 413 statusMessage + 端点单测 + vitest `setHeader` stub + i18n）/ `feat(platform)`（前端：`utils/download.ts` 下载 helper + 两弹窗下载入口 + scans 批量导出按钮）/ `test(platform)`（scans e2e 导出入口 + 未认证 401）/ `docs(plan)`（todo 闭环 + backlog 登记 scans.vue 体量候选）；共 16 文件（后端 7 + 前端 4 + i18n 2 + e2e 1 + 文档 2）。**拆分依据**：超 §1.1「10 文件」阈值，按 后端 / 前端 / e2e / 文档 四类独立可回滚拆分（各 commit ≤ 10 文件）；属单模块（`apps/platform`）增量、无架构变更、净增 < 800 行，未触发 governance 设计稿硬阈值。
  - **审计（2026-10-10）**：standard 2 分区并发 Pass（parA 后端/测试 0B/3W/6S；parB 前端/e2e/文档 0B/1W/5S；evidence：`artifacts/review-gate/2026-10-10-m39.4-parA.md` / `-parB.md`）→ 收口 4 warning（RG-W01 parA 批量组织隔离用例改为无 `repositoryId` 导出真正依赖组织维度 / RG-W02 parA 单 run 守卫断言第二参 = 仓库 `organizationId` + 补 403 透传用例 / RG-W03 parA `codeSet` 改 `satisfies Record<ServerErrorCode, true>` 强制穷举 / RG-W01 parB 补 `download.test.ts` 单测 + e2e 已认证导出断言）+ 应用 suggest（`repositoryId.max(64)`、去冗余导出、`download.ts` 注释与 `revokeObjectURL` 时点、组织守卫口径注释）→ R2 quick Pass（4 warning 修复点全关闭，含 mutation 击杀；evidence：`-r2.md`）。
  - **风险与缓解措施**：① 批量体积（每 run 上限 1000 条 × N run）→ 运行数 + 总字节双硬上限 + 逐 run 追加即早停（413 不 OOM）；② 新增端点属接口新增（非契约重写）→ 复用 `requireAuth` / `requireOrgResource` / 共享筛选层，未触发设计先行闸门；③ 浏览器大响应下载 → 服务端生成、前端 `fetch` + Blob 触发下载（读 `Content-Disposition` 附件名）。

- **M39.5**（P2，🚀 能力扩展）PR Check 监测启用链路打通
  - **目标**：让 `pr-check` 类型 schedule 可被创建与启用，使「PR Checks」页产生数据（现状三重闸门导致从未启用：表单无 `kind`、API 未落库 `kind`、`ACTION_STATUS_MONITOR_ENABLED` 无入口）。
  - **优先级**：P2
  - **范围**：`apps/platform/server/api/schedules/index.ts` + `[id].ts`（落库并回读 `kind`）；同文件 `toView`；`apps/platform/app/pages/schedules.vue`（`kind` 选择器）；`apps/platform/app/types/platform.ts`（`ScheduleView`）；`apps/platform/server/services/scheduler/scheduler.service.ts`（总开关形态）；`apps/platform/.env.example` + `docs/standards/platform.md §11`（env 表）；e2e（schedules-crud）。
  - **验收标准**：
    - [x] `POST` / `PATCH /api/schedules` 落库 `kind`，`GET` 回读 `kind`（含 `pr-check`）；e2e 覆盖 `kind` 往返（创建 `pr-check` → 详情回读 → PATCH 改回 `scan`；未传 `kind` 默认 `scan` 向后兼容）
    - [x] schedules 表单可选择 `kind`（CaomeiSelect；`pr-check` 时隐藏扫描模式 / 严重级别并显示说明）；`pr-check` 保存后 `triggerSchedule` 走 `ActionStatusMonitor` 链路（定向单测：`ACTION_STATUS_MONITOR_ENABLED=true` → `ActionStatusMonitor.pollOnce` 被调用且不触发 `executeBatchRun`）
    - [x] 总开关启用路径明确：**D 阶段定稿 = 仅 env + 文档（不新增 admin 设置项）** + 未启用时 UI 提示（只读端点 `GET /api/schedules/monitor-status` 暴露开关状态，schedules 页在存在 pr-check 计划且开关关闭时展示警示横幅；手动触发返回 `skipped` 时给出 warning 提示）
    - [x] `docs/standards/platform.md §11` 补 `ACTION_STATUS_MONITOR_ENABLED` 行（含默认值 `false`、启用前提与「需重启」口径）
    - [x] `pnpm lint`（0 error）+ `pnpm typecheck`（7 包 Done）0 error；定向 test + e2e（schedules-crud + schedules）全过
  - **D 阶段决策留痕（2026-10-09，用户裁定）**：① 总开关启用路径 = **仅 env + 文档**（维持进程级 env 单一事实源，不新增 admin 设置项 / 不引入 DB 持久化与迁移——与条目「不改 `ActionStatusMonitor` 实体」一致）；② 未启用可观测提示 = **UI banner + 触发时提示**（经服务端只读端点暴露，而非公开 runtimeConfig——避免「构建期烘焙的公开配置」与「运行时 `process.env`」口径漂移）。
  - **不做什么**：不实现 GitHub App 凭据的 pr-check（当前仅 classic / fine-grained PAT，留后续阶段）；不改 `ActionStatusMonitor` 轮询与 `PRCheck` 实体；不改 CI check 判定规则；不改既有 schedule 默认 `kind='scan'` 的向后兼容。
  - **依赖**：M24.1 PR Check MVP（已归档）；`Schedule.kind` 列（迁移 `1800000000001`）；`resolveRepositoryIds` 选择器。
  - **实际交付（2026-10-10）**：拆 4 commits——`feat(platform)`（后端：`kind` 落库 / 回读 + 总开关 helper + monitor-status 只读端点 + 单测）/ `feat(platform)`（前端：`kind` 选择器 + `ScheduleTriggerResult` 共享类型 + 列表 `kind` 列 + 未启用 banner / 触发提示 + i18n 双语 + e2e）/ `docs(standards)`（`platform.md §11` env 行）/ `docs(plan)`（todo 闭环 + backlog 登记设计快照陈旧候选）；源码 6 文件（`schedules/index.ts` / `schedules/[id].ts` / `monitor-status.get.ts` / `scheduler.service.ts` / `schedules.vue` / `types/platform.ts`）+ 测试 4（单测 ×2 文件 + 新端点单测 + e2e ×2）+ i18n ×2 + 文档 2（`platform.md` / `backlog.md`）。
  - **审计（2026-10-10）**：standard 2 分区并发 Pass（parA 后端/文档 0B/0W/3S；parB 前端/i18n/e2e 0B/1W/3S；evidence：`artifacts/review-gate/2026-10-10-m39.5-parA.md` / `-parB.md`）→ 收口 RG-W01（共享 `ScheduleTriggerResult` + 显式 `scan` 分支 + 未识别 kind 兜底提示）、RG-S1（monitor-status 单测补 `requireRole(['admin','org_admin'])` 断言）、RG-S01/S02（e2e 头注释 + popover 显式可见性等待）、RG-S3（backlog 登记 `platform-scheduled-batch.md` 设计快照陈旧候选）；RG-S2 以「同批入库提交态自洽」满足，RG-S03（`PR check` 大小写）维持仓库既有口径。
  - **风险与缓解措施**：① 总开关为进程 env、不可热更 → D 阶段定稿 env-only + 文档明确需重启，并在 UI 侧可见（已落地）；② `kind` 落库后须保证既有 schedule 不受影响（默认值 + e2e 回归）；③ pr-check schedule 的仓库范围语义须与 scan 一致（复用 `resolveRepositoryIds`，单测覆盖）。

- **M39.6**（P3，🛡️ 可观测与治理）环境事件覆盖扩展
  - **目标**：让「环境事件」页在默认 container 执行器下也能记录真实环境 / 运行时事件；消除无写入点的事件类型。
  - **优先级**：P3
  - **范围**：`apps/platform/server/services/scan-orchestrator.service.ts`（`recordEnvAuditEvent` 事件源扩展）；`apps/platform/server/entities/audit-event.ts`（事件类型 / 写入点）；`apps/platform/app/pages/env-events.vue`（类型下拉与共享 `audit_event` 全量类型口径统一）；`apps/platform/server/services/notification/`（新事件通知策略）；定向测试。
  - **验收标准**：
    - [x] container 执行器下的「环境 / 运行时异常」按定稿口径落 `AuditEvent`（**判据定稿**：环境事件 = 执行器 / 执行环境健康信号；单次运行结果类（`execution_timeout` / `clone_timeout` / `execution_failed` / `push_failed`）只记失败分类，不额外记环境事件）→ 新增 `container_unavailable`（container 路由与 sandbox 降级回退点共用 `runContainerExecutor` helper 先探测 `isAvailable()`，false → 事件 + run failed）
    - [x] `docker_daemon_down` 二选一 → **判据定稿 = 从事件枚举移除**（无写入点死类型；sandbox daemon 不可用已由 per-run `sandbox_degraded` 覆盖）；从 `AuditEventType` / `AUDIT_EVENT_TYPES` / 前端下拉 / i18n 清出（`type` 列 `varchar(64)` 无 DB 枚举约束，无需迁移）
    - [x] `env-events.vue` 类型下拉与 `audit_event` 全量类型口径一致 → **判据定稿 = 展示全量 5 类**（`sandbox_unavailable` / `sandbox_degraded` / `container_unavailable` / `ai_config_update` / `verify_commands_update`，与实体 / API 同源）
    - [x] 新事件的通知策略明确 → **判据定稿 = 类型白名单**（环境异常类 `sandbox_unavailable` / `sandbox_degraded` / `container_unavailable` 发通知；配置留痕类 `ai_config_update` / `verify_commands_update` 仅落库不发）；抽出 `notification/policy.ts` 的 `shouldNotifyEnvEvent`（`notifyEnvEvent` 入口判定，未白名单默认不发），单测 + 探针渠道用例双重守护
    - [x] `pnpm lint`（0 error）+ `pnpm typecheck`（7 包 Done）0 error；`pnpm --filter @dependfix/platform test`（定向）全过（167 passed）；全量 vitest 237 passed | 2 skipped；coverage 4 维全过（branches 82.56%）；env-events e2e 11 passed
  - **不做什么**：不改 sandbox 执行器行为；不引入新通知渠道；不改 `audit_event` 既有字段语义（如新增类型需加迁移）；不改执行器选择 / 降级链。
  - **依赖**：`scan-orchestrator` executorKind 路由与降级链（M11 T1005 已闭环）；`notifyEnvEvent` 通知链（M11 已闭环）。
  - **D 阶段决策留痕（2026-10-10，用户裁定）**：① 边界 = 环境事件聚焦「执行器 / 执行环境健康」，单次运行结果类只记失败分类（不双重记录）；② container 事件源 = run 前探测 `ContainerExecutor.isAvailable()`，false → `container_unavailable`(error) + run failed；③ `docker_daemon_down` **从枚举移除**（不保留无写入点死类型）；④ 类型下拉展示全量 5 类（与实体 / API 同源）；⑤ 通知策略 = 类型白名单（环境异常类发 / 配置留痕类仅留痕不发）。
  - **实际交付（2026-10-10）**：拆 4 commits——`feat(platform)`（后端：`audit-event` 枚举收敛 + `notification/policy.ts` 白名单 + `notifyEnvEvent` 入口判定 + `scan-orchestrator` 抽 `runContainerExecutor` helper 并覆盖 container / sandbox 回退两点 + `run-failure-classify` 补码）/ `feat(platform)`（前端：`env-events.vue` 下拉全量 + i18n 双语）/ `test(platform)`（单测 ×3 文件 + e2e）/ `docs(plan)`（todo 闭环 + backlog）；共 13 文件（后端 5 + 前端 3 + 测试 5）+ backlog。**拆分依据**：超 §1.1「10 文件」阈值，按 后端 / 前端+i18n / 测试 / 文档 四类独立可回滚拆分（各 commit ≤ 10 文件）；属单模块增量、净增 < 800 行，未触发 governance 硬阈值。
  - **审计（2026-10-10）**：standard 2 分区并发 R1 Pass（parA 后端/单测 0B/2W/3S；parB 前端/i18n/e2e 0B/1W/2S；evidence：`artifacts/review-gate/2026-10-10-m39.6-parA.md` / `-parB.md`）→ 收口 RG-W1（补跑 coverage 4 维）/ RG-W2（sandbox 降级回退点未探测 container → 抽 `runContainerExecutor` helper 统一 + 补单测）/ RG-S2（`repositoryId` 注释去已移除类型举例）/ RG-S3（audit-only 分支注释语义）/ parB RG-W01（typeOptions mutation 击杀 e2e）/ parB RG-S02（补类型标签渲染 e2e）→ R2 quick Pass（0B/0W；新增 1 条非阻塞观察 RG-S4「sandbox 回退路径未落 `logsJson`，HEAD 同源非回归」已登记 backlog）；RG-S1（块级合规）/ parB RG-S01（下拉口径无单一事实源，由 e2e 计数 + 文案守护）接受不改。
  - **交付物**：2-3 commits（预估）；**实际 4 commits / 13 文件**（拆分为 后端 / 前端+i18n / 测试 / 文档）。
  - **风险与缓解措施**：① 事件语义与「运行失败分类」重叠（如 `clone_timeout` 已属 `failure_stage=clone`）→ D 阶段前定稿边界（环境事件聚焦执行环境健康，失败分类聚焦单次运行结果）；② 通知量放大 → info / warn 级默认不发通知或聚合并去重；③ 类型下拉与全量类型口径统一可能改变既有页面行为 → 页面文案显式说明过滤口径。

---

## 当前阶段收口清单（阶段进行中，用于归档前自检）

- [ ] M39.1 / M39.2 / M39.3 / M39.4 / M39.5 / M39.6 全部闭环
- [ ] 阶段级质量门：`pnpm lint` + `pnpm typecheck` + 定向测试 + `pnpm check:docs` + `pnpm check:orphan-ids`
- [ ] 归档前置：`git rev-list HEAD ^origin/master --count` 实证高度；`todo.md` → 占位态 + `todo-archive.md §M39` 新增
