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
    - [ ] `GET /api/scan-history/summary` 支持按 `lastStatus` 过滤（非法值返回 400），筛选后 `repositories` 与该状态的仓库集合一致（定向单测断言）
    - [ ] byRepo 表不再一次性渲染全部仓库：实现分页或显式上限（口径与实现方式在 D 阶段前定稿并写入本条证据）
    - [ ] 两表改 Tab 切换或等价分区展示；runs 表既有 状态 / 失败阶段 / 建议 三筛选与服务端分页语义不变（e2e 回归通过）
    - [ ] i18n 双语 key parity（`pnpm run i18n:audit` 无新增差异）；新增筛选 / 分页 e2e 用例通过
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；`pnpm --filter @dependfix/platform test`（定向）全过
  - **不做什么**：不改 runs 列表三筛选与分页；不改 500 run 聚合窗口口径本身（仅在其上叠加筛选 / 分页）；不新增服务端实体或迁移；不改 `?repository=` / `?run=` 深链语义。
  - **依赖**：M37.1 失败分类三列与三维筛选（已闭环）；`scan-history/summary` 现有 `byStatus` / `totals` 口径。
  - **交付物**：预计 2-3 commits（feat(platform) summary 参数 + 前端筛选分页 / 分区 + docs(plan) 收口）；文件 4-5（`summary.get.ts` / `scans.vue` / e2e / i18n ×2）。
  - **风险与缓解措施**：① 筛选与「最近 500 run 聚合窗口」耦合，窗口外仓库不可见 → D 阶段前定稿口径并在 UI 显式标注窗口边界；② byRepo 分页需定义稳定排序 → 复用既有 `runCount DESC, lastRunAt DESC`；③ 改 Tab 属结构变更 → 当前视觉基线未覆盖 scans 页（仅 alerts / repos / pr-checks / dialog-import-repos / login），无需重建基线，须在实现时复核。

- **M39.2**（P3，🎨 用户体验）扫描历史弹窗体验（冗余关闭按钮 + 日志区高度）
  - **目标**：移除 run 模式下 body 的冗余「× 关闭」按钮；让执行日志区随弹窗可用空间自适应，避免告警 / 结果较多时日志可视区域过小。
  - **优先级**：P3
  - **范围**：`apps/platform/app/components/repo-history-dialog.vue`（移除 `331-342` 的 body 关闭按钮 + `385` 的 `height: 200px` 固定日志区改自适应）；同构的 `apps/platform/app/components/run-detail-dialog.vue`（若日志区实现同构则一并收敛口径）。
  - **验收标准**：
    - [ ] run 模式不再渲染 body「× 关闭」按钮（仅保留弹窗 header `×` 与 Esc 关闭）；history 模式「返回列表」不受影响
    - [ ] 日志滚动区高度自适应（min-height + flex / 视口比例 / 可拖拽三选一，D 阶段前定稿）：结果与告警较多时日志可视高度显著大于现状
    - [ ] 窄视口（≤ 640px）下 `:style width: 720px` 覆盖响应式的问题一并评估——在本条范围内则修复，否则登记 backlog
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；相关 e2e 全过
  - **不做什么**：不改日志的数据获取与格式化（`GET /api/runs/[id]` 的 `logs[]` / `logsText`）；不改 history 模式的分页与列表；不新增下载入口（属 M39.4）。
  - **依赖**：无（纯前端）；`CaomeiDialog` 0.5.0 的 `85vh` 上限与 body 滚动语义（`node_modules/caomei-ui` dialog 样式）。
  - **交付物**：预计 1-2 commits（fix(platform) 弹窗体验 + 必要时 docs(plan)）；文件 1-2。
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
    - [ ] 单 run 可下载日志（txt 或 json，附件名含 runId），内容与 `logsText` / `logs[]` 一致（定向端点单测断言）
    - [ ] 批量下载按当前筛选条件导出（多文件打包或合并单文件，形态定稿后落证据），含体积上限与超限提示（不 OOM）
    - [ ] 未认证 / 跨组织访问被拒（复用 `requireAuth` + 组织隔离，与 `/api/runs/[id]` 同口径）
    - [ ] i18n 双语 parity；前端下载入口在无日志时禁用或隐藏
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；`pnpm --filter @dependfix/platform test`（定向）全过
  - **不做什么**：不改日志采集（`MemoryLogger.maxEntries` 1000）与落库形态（`logs_json`）；不引入对象存储或异步大导出任务队列；不动 `GET /api/runs` 列表契约。
  - **依赖**：`ScanRun.logsJson`（迁移 `1800000000002`）；`GET /api/runs/[id]` 的 `logs` / `logsText` 口径。
  - **交付物**：预计 2-3 commits（feat(platform) 单 run 下载 + 批量导出 + docs(plan)）；文件 4-6（API ×2 / 前端 ×2 / e2e / i18n）。
  - **风险与缓解措施**：① 批量体积（每 run 上限 1000 条 × N run）→ 设上限 + streaming / 逐 run 追加；② 新增端点属接口新增（非契约重写）——若 D 阶段判定触发设计先行闸门，则先落设计稿；③ 浏览器大响应下载 → 优先服务端流式或分页拉取。

- **M39.5**（P2，🚀 能力扩展）PR Check 监测启用链路打通
  - **目标**：让 `pr-check` 类型 schedule 可被创建与启用，使「PR Checks」页产生数据（现状三重闸门导致从未启用：表单无 `kind`、API 未落库 `kind`、`ACTION_STATUS_MONITOR_ENABLED` 无入口）。
  - **优先级**：P2
  - **范围**：`apps/platform/server/api/schedules/index.ts` + `[id].ts`（落库并回读 `kind`）；同文件 `toView`；`apps/platform/app/pages/schedules.vue`（`kind` 选择器）；`apps/platform/app/types/platform.ts`（`ScheduleView`）；`apps/platform/server/services/scheduler/scheduler.service.ts`（总开关形态）；`apps/platform/.env.example` + `docs/standards/platform.md §11`（env 表）；e2e（schedules-crud）。
  - **验收标准**：
    - [ ] `POST` / `PATCH /api/schedules` 落库 `kind`，`GET` 回读 `kind`（含 `pr-check`）；e2e 覆盖 `kind` 往返
    - [ ] schedules 表单可选择 `kind`；`pr-check` 保存后 `triggerSchedule` 走 `ActionStatusMonitor` 链路（`ACTION_STATUS_MONITOR_ENABLED=true` 时，定向单测断言）
    - [ ] 总开关启用路径明确：env 文档化 + 未启用时的可观测提示（UI 或日志）；是否新增 admin 设置项在 D 阶段前定稿
    - [ ] `docs/standards/platform.md §11` 补 `ACTION_STATUS_MONITOR_ENABLED` 行（含默认值与前提）
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；定向 test + e2e（schedules-crud）全过
  - **不做什么**：不实现 GitHub App 凭据的 pr-check（当前仅 classic / fine-grained PAT，留后续阶段）；不改 `ActionStatusMonitor` 轮询与 `PRCheck` 实体；不改 CI check 判定规则；不改既有 schedule 默认 `kind='scan'` 的向后兼容。
  - **依赖**：M24.1 PR Check MVP（已归档）；`Schedule.kind` 列（迁移 `1800000000001`）；`resolveRepositoryIds` 选择器。
  - **交付物**：预计 2-3 commits（feat(platform) `kind` 落库 + 表单 + env 文档 + e2e + docs(plan)）；文件 5-7。
  - **风险与缓解措施**：① 总开关为进程 env、不可热更 → 文档明确需重启，并在未启用时输出可定位日志（现状已有 warn，需在 UI 侧可见）；② `kind` 落库后须保证既有 schedule 不受影响（默认值 + e2e 回归）；③ pr-check schedule 的仓库范围语义须与 scan 一致（复用 `resolveRepositoryIds`）。

- **M39.6**（P3，🛡️ 可观测与治理）环境事件覆盖扩展
  - **目标**：让「环境事件」页在默认 container 执行器下也能记录真实环境 / 运行时事件；消除无写入点的事件类型。
  - **优先级**：P3
  - **范围**：`apps/platform/server/services/scan-orchestrator.service.ts`（`recordEnvAuditEvent` 事件源扩展）；`apps/platform/server/entities/audit-event.ts`（事件类型 / 写入点）；`apps/platform/app/pages/env-events.vue`（类型下拉与共享 `audit_event` 全量类型口径统一）；`apps/platform/server/services/notification/`（新事件通知策略）；定向测试。
  - **验收标准**：
    - [ ] container 执行器下的「环境 / 运行时异常」按定稿口径落 `AuditEvent`（事件集与「运行失败分类」的边界在 D 阶段前定稿，避免同一现象双重记录）
    - [ ] `docker_daemon_down` 二选一：落地启动探测写入，或从事件枚举移除（不保留无写入点的死类型）
    - [ ] `env-events.vue` 类型下拉与共享 `audit_event` 全量类型（含 `ai_config_update` / `verify_commands_update`）口径一致（展示或显式过滤，二者择一并在页面说明）
    - [ ] 新事件的通知策略明确（发 / 不发及级别），`notifyEnvEvent` 行为有定向测试守护
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；`pnpm --filter @dependfix/platform test`（定向）全过
  - **不做什么**：不改 sandbox 执行器行为；不引入新通知渠道；不改 `audit_event` 既有字段语义（如新增类型需加迁移）；不改执行器选择 / 降级链。
  - **依赖**：`scan-orchestrator` executorKind 路由与降级链（M11 T1005 已闭环）；`notifyEnvEvent` 通知链（M11 已闭环）。
  - **交付物**：预计 2-3 commits（feat(platform) 事件覆盖 + 前端口径统一 + docs(plan)）；文件 4-6。
  - **风险与缓解措施**：① 事件语义与「运行失败分类」重叠（如 `clone_timeout` 已属 `failure_stage=clone`）→ D 阶段前定稿边界（环境事件聚焦执行环境健康，失败分类聚焦单次运行结果）；② 通知量放大 → info / warn 级默认不发通知或聚合并去重；③ 类型下拉与全量类型口径统一可能改变既有页面行为 → 页面文案显式说明过滤口径。

---

## 当前阶段收口清单（阶段进行中，用于归档前自检）

- [ ] M39.1 / M39.2 / M39.3 / M39.4 / M39.5 / M39.6 全部闭环
- [ ] 阶段级质量门：`pnpm lint` + `pnpm typecheck` + 定向测试 + `pnpm check:docs` + `pnpm check:orphan-ids`
- [ ] 归档前置：`git rev-list HEAD ^origin/master --count` 实证高度；`todo.md` → 占位态 + `todo-archive.md §M39` 新增
