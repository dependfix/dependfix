# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环阶段归档于 [todo-archive.md](todo-archive.md)；未排期 / 延期 / 远期 / 长期主线 / 已知边界登记于 [backlog.md](backlog.md)。

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 当前阶段任务 | **M38 进行中**——平台执行模型隔离（2026-10-08 设计先行稿定稿 / 6 原子条目） |
| 下一阶段（未授权） | 无——M38 闭环后再按 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement) 评估 backlog 候选池 |
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口 + [archive/](archive/) 分片；M0-M37 全部已归档） |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M37 已归档；M38 进行中） |
| 历史归档索引 | [archive/index.md](archive/index.md) |

---

## M38: 平台执行模型隔离（2026-10-06 用户授权 / 2026-10-08 设计先行稿定稿 / M38.1~M38.6）

> **阶段定位**：承接 M37 完整闭环归档后的独立治理阶段。2026-10-06 用户基于生产运行日志根因分析授权开阶段——消除平台 in-process BullMQ Worker 因引擎同步子进程调用阻塞主线程 event loop 导致的 `could not renew lock` / `Missing lock (code -2)`（锁过期 → job 被判 stalled 重排 → 潜在重复执行）。首个交付为方案 ①/②/③ 选型设计先行稿（[executor-process-isolation.md](../design/governance/executor-process-isolation.md)，2026-10-08 定稿）；经用户裁定方案 ①（BullMQ sandboxed processor）为主线 + 方案 ③（锁参数与观测）阶段内止血，方案 ②（独立子进程执行引擎）登记 backlog 长期演进。
> **类型平衡**：🛡️ 技术债与可靠性 2（M38.1 + M38.3）+ 🛠️ 可观测性 1（M38.2）+ 🧪 测试基建 1（M38.4）+ 📚 文档 1（M38.5）+ 🎨 用户体验 1（M38.6）= 6 原子，整体符合 [规划规范 §1.1 类型平衡原则](../standards/planning.md#11-硬性约束)（UX 独立条目 1 项，低于建议值 2，缺口已显式标注）。
> **§3.4 三重交叉核验**（2026-10-08 启动批次实测，**0 项重复评估**）：① **todo-archive 扫描**——4 项上收候选（`scan.post` failover / e2e 卡片计数 / `scan-queue.ts` 注释 / schedule 选项口径）在 `todo-archive.md` + `archive/*.md` 无已闭环标注（archive 中仅 `todo-archive-phases-m16-m17.md:183` 记录 reuse 参数**引入**实现 `d656dc3`，非本次"failover 透传 reuse"修复）；② **git log**——`git log --all --grep="reuse" / "卡片"` 无对应修复 commit，`f48bb74` 仅为候选登记；③ **代码 anchor**——`scan.post.ts:110` 未透传 reuse（同文件 118-120 同步路径显式透传）、`admin.e2e.test.ts:343` 仍为全页 `toHaveCount(7)` 计数断言、`scan-queue.ts:3` 注释仍写 `scan:{repositoryId}`、`schedules.vue:59/65` 仍为内联选项数组。
> **用户决策点**（2026-10-08 裁定）：① **D1 主线方案 = ①（sandboxed processor）为主线 + ③（锁参数与观测）止血**；② 方案 ② 登记 backlog 长期演进（依赖自包含 subprocess 入口缺口，见 [executor-sandbox.md §7.2](../design/governance/executor-sandbox.md)）；③ 条目容量控制 5-6 项——上收 4 项候选（①②⑤④），移出 ③ `distill-wisdom` 计数假阴性与 ⑥ `tech-stack` 依赖表行级不一致（留 [backlog.md](backlog.md)）。
> **不做什么（阶段级）**：不改引擎修复 / 验证业务语义；不改 `/api/runs` 等接口契约；不做执行器整体重构；不把引擎全部同步调用改异步（改由进程隔离兜底）；不在本阶段内改动 M37 交付面；不引入本设计未选定的新执行后端。

- **M38.1**（P1，🛡️ 可靠性）BullMQ sandboxed processor 执行隔离（2 子任务 a/b）
  - **目标**：消除平台 in-process Worker 因引擎同步子进程调用阻塞 event loop 导致的 BullMQ 锁续期失败，使 `scan` / `scheduled-scan` 两类 job 不再因主线程占满而被判 stalled 重排。
  - **优先级**：P1
  - **范围**：
    - **M38.1a** 隔离接线与打包路径：`apps/platform/server/services/queue/scan-worker.ts`（Worker 构造由内联 processor 改为 processor 文件路径，默认 `spawn`，`useWorkerThreads` 作可配项）+ 新增 processor 入口文件（承载 `defaultProcessor` 的 `job.name` 分发：`scan` → `runScanForRepository`；`scheduled-scan` → `triggerSchedule`）+ Nitro `.output` 打包配置（确保 processor 入口进入产物 + runtime 绝对路径解析）
    - **M38.1b** 子进程运行时与回传：processor 子进程应用上下文初始化（TypeORM 数据源 / Redis 连接 / `@dependfix/engine` 导入，每 Worker 一次复用）+ 日志与错误跨进程回传（job 返回值可序列化）+ `scan` / `scheduled-scan` 端到端回归
  - **验收标准**：
    - [ ] processor 入口文件进入 `apps/platform/.output` 产物且 runtime 绝对路径正确解析（构建产物实证）
    - [ ] **对照实证**：构造长时同步阻塞（模拟 `pnpm install` 级占用）时，旧形态（内联 processor）复现 `could not renew lock` / `Missing lock`，新形态同期无锁续期失败
    - [ ] `scan` + `scheduled-scan` 端到端结果与落库字段与现状一致（既有单测 / e2e 全过，无行为回归）
    - [ ] 子进程日志与错误可回传（失败归类不回归）；子进程异常退出归入 `execution_failed`
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；`pnpm --filter @dependfix/platform test` 全过
  - **不做什么**：不改引擎修复 / 验证业务语义；不改 `/api/runs` 等接口契约；不改 job 数据形状（`ScanJobData` / `ScheduledScanJobData`）；不做执行器整体重构；不把引擎同步调用改异步；不实现方案 ②（独立子进程执行引擎，登记 backlog）。
  - **依赖**：[executor-process-isolation.md §2.1 + §5 验证计划](../design/governance/executor-process-isolation.md)（2026-10-08 定稿）；M38.2（观测先行，提供对照基线）；BullMQ 官方 [Sandboxed processors](https://docs.bullmq.io/guide/workers/sandboxed-processors) 文档。
  - **交付物**：预期 3-4 commits（processor 入口 + Worker 接线 / 打包路径实证 / 上下文初始化 + 回传 + 回归 / 闭环登记）；预估 **5-8 文件 / ~350-550 行**（新领域 + 跨模块骨架任务，超 [规划规范 §1.1 任务粒度约束](../standards/planning.md#11-硬性约束)「> 5 文件即考虑拆分」线）→ 故拆 a（接线 + 打包路径）/ b（运行时 + 回传 + 回归），两子任务各有独立验收点与提交批次；文档 `platform.md` 队列执行拓扑口径 + 设计稿状态更新。
  - **风险与缓解措施**：① Nitro `.output` 打包路径解析为本条最大不确定点 → D 阶段前置实证（§5.1，先跑通单条链路再批量）；② 子进程 DB / Redis 连接数增加 → 单容器部署可接受 + BullMQ 每 Worker 复用子进程池；③ 子进程冷启动成本 → 每 Worker 一次而非每 job 一次。
- **M38.2**（P2，🛠️ 可观测性）Worker 锁参数显式化与 stalled / error 事件观测
  - **目标**：把 BullMQ 隐式默认锁参数显式化并对齐执行器超时，补齐 `stalled` / `error` 事件监听与结构化日志，把"静默锁过期"变为可告警事件（方案 ③ 止血，兼作 M38.1 对照基线）。
  - **优先级**：P2
  - **范围**：`apps/platform/server/services/queue/scan-worker.ts`（Worker 选项显式 `lockDuration` / `lockRenewTime` + `worker.on('stalled')` / `worker.on('error')` 结构化日志）+ `apps/platform/server/services/queue/scan-worker.test.ts`（事件注册与日志载荷用例）+ `docs/standards/platform.md`（队列执行拓扑与锁参数口径）。
  - **验收标准**：
    - [ ] `lockDuration` / `lockRenewTime` 显式配置，取值与 `ContainerExecutor.timeoutMs`（默认 30 分钟）对齐并注释理由
    - [ ] `stalled` / `error` 事件注册并输出结构化日志（含 jobId / runId / 事件类型）
    - [ ] 单测覆盖事件监听注册与日志载荷，经 mutation 核验非恒真
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error；平台 vitest 全过
  - **不做什么**：不引入外部告警系统集成（仅结构化日志）；不改 job 数据形状；不改队列降级矩阵语义。
  - **依赖**：[executor-process-isolation.md §2.3](../design/governance/executor-process-isolation.md)；`apps/platform/server/services/executor/container-executor.ts`（`timeoutMs` 默认 30 分钟）。
  - **交付物**：1-2 commits；文件 3（`scan-worker.ts` / `scan-worker.test.ts` / `platform.md`）。
  - **风险与缓解措施**：`lockDuration` 取值过大会拉长真崩溃时的 stalled 检测窗口 → 与执行器超时对齐 + 注释披露边界；M38.1 落地后 event loop 不再被业务阻塞，长 `lockDuration` 仅作兜底。
- **M38.3**（P3，🛡️ 缺陷修复）`scan.post` 队列 failover 降级未透传 `reuse`
  - **目标**：修正 `scan.post.ts` 入队失败降级同步执行时未透传 `reuse`，与同步路径 / worker 路径语义一致，消除「复用终态 run + `queue.add` 失败」叠加时的终态冲突报错。
  - **优先级**：P3
  - **范围**：`apps/platform/server/api/repos/[id]/scan.post.ts`（failover 降级分支透传 `reuse: !!reuseExisting`，对齐同文件同步路径） + 定向单测（复用终态 run + `queue.add` 抛错场景）。
  - **验收标准**：
    - [ ] failover 降级分支透传 `reuse: !!reuseExisting`，与同步路径（`scan.post.ts:118-120`）和 worker 路径语义一致
    - [ ] 新增用例：复用终态 run + `queue.add` 抛错 → 降级路径不抛「已处于终态」
    - [ ] `pnpm --filter @dependfix/platform test` 全过；`pnpm lint` + `pnpm typecheck` 0 error
  - **不做什么**：不放宽 orchestrator 终态校验；不改 reuse 三态校验（404 / 400 / 409）语义；不改 worker 侧透传。
  - **依赖**：M37.1 A 阶段审计范围外观察记录；M16.2 C66-D（reuse 参数引入，`5b81142` + `d656dc3`）。
  - **交付物**：1 commit；文件 2（`scan.post.ts` + 单测）。
  - **风险与缓解措施**：透传后复用终态 run 语义需与 worker 路径一致 → 用例同时覆盖 worker 与同步两条路径的同源断言。
- **M38.4**（P3，🧪 测试基建）e2e 全页卡片计数断言与页面卡片集合变更解耦
  - **目标**：消除「个人设置」e2e 全页 `.caomei-card` 计数断言随页面卡片集合正常演进而确定性失败（已 2 次复发：5→6、6→7），使**新增卡片为绿、删除 / 替换既有卡片为红**。
  - **优先级**：P3
  - **范围**：`apps/platform/tests/e2e/admin.e2e.test.ts`（「个人设置」describe 的全页计数断言改为逐卡片语义化抽样或作用域收敛，保留卡片集合变更的检出能力）。
  - **验收标准**：
    - [ ] 新增卡片场景断言保持通过；删除 / 替换既有卡片场景断言必报红
    - [ ] mutation 标定：删除一张卡片 → 用例失败；新增一张卡片 → 用例通过
    - [ ] `pnpm --filter @dependfix/platform exec playwright test --workers=1` 全过（CI 等价）
  - **不做什么**：不改 dashboard 区域计数断言（已按 `.dashboard__stats` / `.dashboard__charts` 作用域收敛，脆弱度低）；不新增静态门禁（本次仅断言形态改造）。
  - **依赖**：`5ba3bad`（本轮同步修复）+ `f48bb74`（候选登记）+ `be74d21`（首次复发）。
  - **交付物**：1 commit；文件 1（`admin.e2e.test.ts`）。
  - **风险与缓解措施**：语义化抽样可能遗漏"卡片被替换"场景 → mutation 标定「删除必红 / 新增必绿」双向。
- **M38.5**（P3，📚 文档）`scan-queue.ts` 文件头注释 jobId 口径订正
  - **目标**：修正 `scan-queue.ts` 文件头注释 `jobId = scan:{repositoryId}`（冒号）与实际 `buildScanJobId` = `scan-<repositoryId>`（连字符）的不一致，消除误导。
  - **优先级**：P3
  - **范围**：`apps/platform/server/services/queue/scan-queue.ts`（文件头注释 jobId 口径订正 + 顺带核查同文件其他注释口径）。
  - **验收标准**：
    - [ ] 文件头注释 jobId 口径与 `buildScanJobId` 实现一致
    - [ ] 同文件其他注释口径核查无同类不一致
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error + `pnpm check:orphan-ids` 0 命中
  - **不做什么**：不改 `buildScanJobId` 实现；不改 `scan-queue.ts` 既有逻辑与契约。
  - **依赖**：M38 设计先行稿 A 阶段审计发现（2026-10-08）。
  - **交付物**：1 commit；文件 1（`scan-queue.ts` 注释）。
  - **风险与缓解措施**：注释级改动风险极低；顺带核查范围限定为同文件以免扩面。
- **M38.6**（P3，🎨 用户体验）schedule 表单与 run-view 复用扫描选项口径
  - **目标**：把 `schedules.vue` 内联的模式 / 严重级别选项数组切到 `utils/scan-options.ts` 单一事实源，消除与扫描弹窗口径漂移的风险。
  - **优先级**：P3
  - **范围**：`apps/platform/app/pages/schedules.vue`（`modeOptions` / `severityOptions` 改引用 `utils/scan-options.ts`）+ `apps/platform/app/utils/run-view.ts`（`runModeLabel` 同源标签映射，仅在有同源关系时收敛）+ 定向单测 / e2e。
  - **验收标准**：
    - [ ] `schedules.vue` 不再内联模式 / 严重级别选项数组，改复用 `scanModeOptions` / `scanSeverityOptions`
    - [ ] 选项取值与 `SCAN_MODES` / `SCAN_SEVERITIES` 一致（断言守护）
    - [ ] 表单行为与计划默认值语义不变（既有 schedule e2e 全过）
    - [ ] `pnpm lint` + `pnpm typecheck` 0 error
  - **不做什么**：不改计划默认值语义与表单行为；不将扫描偏好沿用至 schedule 默认（M37.2 显式边界）；不改 schedule API 契约。
  - **依赖**：M37.2 `utils/scan-options.ts`（`d86e461`）；M37.2 A 阶段审计范围外 suggest。
  - **交付物**：1 commit；文件 2-3（`schedules.vue` / `run-view.ts` / 测试）。
  - **风险与缓解措施**：`runModeLabel` 与 `scan-options` 标签语义可能不完全同源 → 仅在有同源关系时收敛，否则保留并注释边界。

---

## 当前阶段收口清单（阶段进行中，用于归档前自检）

- [ ] M38.1 / M38.2 / M38.3 / M38.4 / M38.5 / M38.6 全部闭环
- [ ] 阶段级质量门：`pnpm lint` + `pnpm typecheck` + 定向测试 + `pnpm check:docs` + `pnpm check:orphan-ids`
- [ ] 归档前置：`git rev-list HEAD ^origin/master --count` 实证高度；`todo.md` → 占位态 + `todo-archive.md §M38` 新增
