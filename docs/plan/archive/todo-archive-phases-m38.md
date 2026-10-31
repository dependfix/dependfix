# 待办归档分片：M38 平台执行模型隔离

> 本分片由 2026-10-14 M43 归档批次从 [todo-archive.md](../todo-archive.md) 主窗口预防性迁出（M43 段新增后主窗口完整段将达 6 个，超 [archive/index.md §2](../archive/index.md) 定义的 3-5 个阶段上界；M38 为主窗口最早完整段）。章节编号与锚点保持原样。

---

## M38: 平台执行模型隔离（M38.1~M38.6 全部已闭环 / 2026-10-09 归档）

> **归档日期**：2026-10-09
> **阶段摘要**：承接 M37 完整闭环归档后的独立治理阶段。2026-10-06 用户基于生产运行日志根因分析授权开阶段——消除平台 in-process BullMQ Worker 因引擎同步子进程调用阻塞主线程 event loop 导致的 `could not renew lock` / `Missing lock (code -2)`（锁过期 → job 被判 stalled 重排 → 潜在重复执行）。首个交付为方案 ①/②/③ 选型设计先行稿（[executor-process-isolation.md](../../design/governance/executor-process-isolation.md)，2026-10-08 定稿）；经用户裁定方案 ① 为主线 + 方案 ③（锁参数与观测）阶段内止血。**M38.1 D 阶段前置实证发现方案 ①（BullMQ sandboxed processor）在本仓库 Nitro 单 bundle 构建体系下无法原样落地**（4 条硬事实：业务代码内联 `chunks/nitro/nitro.mjs` / 产物导入即顶层 listen / Nitro 无额外入口 / `packages/cli/dist` 不自包含；详见 [设计稿 §3.1](../../design/governance/executor-process-isolation.md)），经用户再次裁定改用**方案 ①′（独立 worker 进程）**。**6 原子条目全部闭环**，覆盖 🛡️ 2 + 🛠️ 1 + 🧪 1 + 📚 1 + 🎨 1。
>
> - **设计先行稿 + 阶段启动规划**：`194a558`（executor-process-isolation.md 三方案选型）+ `8c5c71c`（阶段启动登记与上收）
> - **M38.1** [P1 🛡️] 队列执行进程隔离（方案 ①′ 独立 worker 进程；entrypoint 双进程 + unix socket 收敛 + 迁移唯一执行者 + compose/env 接线）—— `e5412cd` + `374940b` + `f75cb81` + `d436992`
> - **M38.2** [P2 🛠️] Worker 锁参数显式化与锁问题事件观测（`SCAN_WORKER_LOCK_OPTIONS` 引用 `DEFAULT_EXECUTION_TIMEOUT_MS` + `stalled`/`lockRenewalFailed`/`error` 结构化日志 + `ScanQueue.getJob` 注入 + 检查点矩阵挂接）—— `431e8ec` + `074e76d`
> - **M38.3** [P3 🛡️] `scan.post` failover 降级透传 `reuse`（入队成功 / 同步 / 降级三路同源）—— `9f9d067` + `d92a301`
> - **M38.4** [P3 🧪] e2e 全页卡片计数断言解耦（逐卡片标题清单，新增卡片为绿 / 删除替换为红）—— `4b43c29` + `9ce7289`
> - **M38.5** [P3 📚] `scan-queue.ts` 注释口径订正（jobId 连字符口径 + 优先级口径陈旧订正）—— `392f9b0` + `d03122f`
> - **M38.6** [P3 🎨] schedule 表单与 run-view 复用扫描选项口径（+ `batch-runs.modeLabel` 同源点穷举后一并收敛）—— `1b856ac` + `8b9d95d`
>
> **commit 数量实证**：`git log master --first-parent --oneline 5a5c99b..HEAD`（自 M37 归档末 commit 起）去重统计 = **16 commits**（设计先行稿 1 + 阶段启动规划 1 + M38.1 4 + M38.2 2 + M38.3 2 + M38.4 2 + M38.5 2 + M38.6 2，逐项见上方列表；每个 commit 仅归属一条目，无重复计数）。同区间另有 2 个 **M37 收尾** commits（`5ba3bad` 个人设置 e2e 卡片断言同步 + `f48bb74` backlog 候选登记），不计入 M38。
>
> **关键决策**（2026-10-08 用户裁定 + 执行期追加）：
> - **主线方案**：方案 ① + 方案 ③（锁参数与观测）阶段内止血；方案 ②（独立子进程执行引擎）登记 backlog 长期演进。
> - **路径调整决策**（同日追加，独立命名以避免与设计稿 §4 的 D1-D5 编号混淆）：M38.1 实现路径调整为方案 ①′ 独立 worker 进程（方案 ① 经前置实证不可落地）。
> - **条目容量控制**：5-6 项——上收 4 项候选（`scan.post` failover / e2e 卡片计数 / `scan-queue.ts` 注释 / schedule 选项口径），移出 2 项（`distill-wisdom` 假阴性 / `tech-stack` 依赖表）留 backlog。
>
> **类型平衡复核**：🛡️ 技术债与可靠性 2（M38.1 / M38.3）/ 🛠️ 可观测性 1（M38.2）/ 🧪 测试基建 1（M38.4）/ 📚 文档 1（M38.5）/ 🎨 用户体验 1（M38.6）；🎨 独立条目 1 项低于建议值 2，缺口已显式标注。
>
> **关键实证**（细节见各条目闭环记录）：
> - **M38.1**：entrypoint 三分支实测（默认单进程 / 冲突 warn 跳过 / 双进程 env 分离）；docker 拓扑 3 进程 + `Listening on unix socket` 与 `http://[::]:3000` 分离 + HTTP 200；重建 `.output` 后双进程实测 worker 消费队列（注入 scan job 由 worker 处理，failedReason=仓库不存在，证明确经扫描编排；HTTP 进程无扫描痕迹）；SQLite 两进程 `PRAGMA applied` 各一次、全程无 `SQLITE_BUSY`；审计 RG-W01 修复（`set -e` 致 worker 清理成死代码）+ 冲突判定归一化。
> - **M38.2**：BullMQ 6.3.11 源码实证——`lock-manager.js:37-42` 续期失败**同时** emit `lockRenewalFailed` + `error`（同根因双信号，`error` 标 `duplicateOf` 去重）；mutation 3 项全击杀。
> - **M38.3**：三路同源透传；mutation 移除透传 → 2 failed；同根因调用点穷举 0 遗漏。
> - **M38.4**：mutation 双向标定（删除卡片 → 用例失败 / 新增卡片 → 用例通过）；逐卡片标题清单替代全页计数（`5→6→7` 两次复发根因）。
> - **M38.5**：顺带核查发现第 2 处陈旧口径（优先级注释「webhook/定时为预留」实际定时已使用）。
> - **M38.6**：同源点穷举（[development.md §5.1.25](../../standards/development.md)）——收敛 3 处 / 保留 3 处（展示策略分歧）/ raw 直通 3 处 / 非同源排除 2 处；非等价项保留 + backlog 候选登记。
>
> **审计**：A 阶段覆盖全部 6 原子条目 —— M38.1（deep 2 分区并发 Pass → 修复 10 点 → quick Pass）；M38.2（standard Reject → 修复 → quick Pass）；M38.3（standard Reject（新增注释孤立编号）→ 修复 → quick Pass）；M38.4（standard Pass）；M38.5（quick Pass）；M38.6（standard Pass → 修复 → quick Reject（同源点 raw 计数少 1）→ 修复 → quick Pass）。全部收敛后放行，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **18**（`git rev-list origin/master ^HEAD --count` = 0 双向核验；含 M37 收尾 2 + M38 阶段 16），待用户推送确认。
>
> **关联**：[roadmap.md §M38](roadmap-phases-m0-m38.md#m38-平台执行模型隔离-2026-10-06-用户授权-2026-10-09-已闭环-归档) + [archive/index.md](../archive/index.md) + [executor-process-isolation.md](../../design/governance/executor-process-isolation.md) + [platform.md §10.5 / §10.6](../../standards/platform.md) + [backlog.md](../backlog.md)（M38 衍生候选）
