# 归档阶段分片：M39 + M40（2026-10-15 M44.4 批次③ 迁出）

> 本分片自主窗口迁出（主窗口保留最近 3 个完整段；阶段内容与状态原样保留；主文档见 [todo-archive.md](../todo-archive.md)）。
## M40: 运行时可靠性与可观测性深化（M40.1~M40.6 全部已闭环 / 2026-10-10 归档）

> **归档日期**：2026-10-10
> **阶段摘要**：承接 M39 平台视图体验与可观测补强归档后的运行时可靠性阶段。来源为 2026-10-08 定时扫描批量失败排查中暴露、且经 M38/M39 归档后仍保留在 [backlog.md](../backlog.md) 的运行时缺口，以及同批次审计 / 复核衍生的门禁工具缺口。经 2026-10-10 用户决策（方案 A）从 backlog §候选评估中上收 6 项候选；同日追加用户决策（D2）：以「平台环境变量文档完整性治理」（用户直接提出）**替换**原 M40.6（门禁脚本排除 Playwright 产物 → 回退 [backlog.md](../backlog.md)），维持 6 原子容量。**6 原子条目全部闭环**，覆盖 🚀 1 + 🎨 1 + 🛠️ 1 + 🛡️ 1 + 🐛 1 + 📚 1。
>
> - **阶段启动规划**：`2339c35`
> - **M40.1** [P2 🚀 能力扩展] 部署产物版本戳 / 陈旧校验（构建期 ARG/ENV `NUXT_BUILD_*` + 公开只读 `GET /api/health` + 启动日志 + CI `--build-arg` + 冒烟端到端断言）—— `fb6f3e9` + `ee22e76` + `b41c87b`
> - **M40.2** [P2 🎨 用户体验] 失败 run 落 summary 快照（failed 分支写 `summaryJson`，仅快照不 reconcile；`alertsFixed` 归零）—— `c6fe50d` + `39c5918`
> - **M40.3** [P2 🛠️ 技术债] 执行超时可配置化（`EXECUTION_TIMEOUT_MS` + 队列锁时长同源联动 + 审计衍生 stale-cleanup 孤儿阈值联动）—— `0b7ac45` + `34b905a` + `45a4437` + `75ccf66`
> - **M40.4** [P2 🛡️ 可靠性] 队列 worker 进程崩溃自动重启（entrypoint 后台看护子 shell：指数退避 + 连续上限 + 稳定窗口归零 + TERM 协同 + 脚本级测试）—— `e33da4f` + `eca733b` + `146ab74`
> - **M40.5** [P2 🐛 缺陷修复] sandbox 降级回退路径落执行日志（回退分支消费 `logsJson`）—— `72013c6` + `cf09537`
> - **M40.6** [P2 📚 文档治理] 平台环境变量文档完整性与配置结构治理（`.env.example` 极简 + `.env.full.example` 完整 + `configuration.md` 平台段重构 + `trustedOrigins` 变量兼容）—— `8224291` + `d0e4a49` + `f3f31ba` + `c3a5bbf` + `cd99732`
>
> **commit 数量实证**：`git log master --first-parent --oneline origin/master..HEAD` 去重统计 = **20 commits**（阶段启动 1 + M40.6 5 + M40.5 2 + M40.2 2 + M40.3 4 + M40.4 3 + M40.1 3；每个 commit 仅归属一条目，无重复计数）。
>
> **关键决策**（2026-10-10 用户裁定 + 各原子 D 阶段定稿，完整记录见 [roadmap.md §M40](roadmap-phases-m39-m48.md#m40-运行时可靠性与可观测性深化-2026-10-10-用户决策方案-a-2026-10-10-已闭环-归档)）：① M40.1 构建 arg 注入 + 公开无鉴权健康端点 + 不接发布门禁；② M40.2 写 `{ ...result.summary, alertsFixed: 0 }`；③ M40.3 env-only + 保留锁联动；④ M40.4 shell 看护循环 + 指数退避 + 连续重启上限 5 次 + 稳定窗口 60s 归零 + 不影响主进程；⑤ M40.5 回退路径补 `logsJson`；⑥ M40.6 双示例文件 + 修代码兼容 `NUXT_PUBLIC_BETTER_AUTH_URL`。
>
> **类型平衡复核**：🚀 能力扩展 1（M40.1）/ 🎨 用户体验 1（M40.2）/ 🛠️ 技术债 1（M40.3）/ 🛡️ 可靠性 1（M40.4）/ 🐛 缺陷修复 1（M40.5）/ 📚 文档治理 1（M40.6）；🎨 独立条目 1 项低于 [规划规范 §1.1 类型平衡建议](../../standards/planning.md#_1-1-硬性约束) 建议值 2，缺口显式标注。
>
> **审计**：A 阶段覆盖全部 6 原子条目——M40.1（standard 2 分区并发 R1 Pass → 收口 2W+2S → R2 quick Pass）/ M40.2（standard Pass）/ M40.3（standard 2 分区并发 R1：P1 Pass + P2 跨分区 W1 blocker → 修复 → R2 quick Pass）/ M40.4（standard 单分区 R1 Pass → 收口 → mutation 全击杀）/ M40.5（quick Pass）/ M40.6（standard 2 分区并发 R1 → 收口 → R2 quick Pass）；记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **20**（`git rev-list origin/master ^HEAD --count` = 0 双向核验），全部为本阶段 commits，待用户推送确认。
>
> **关联**：[roadmap.md §M40](roadmap-phases-m39-m48.md#m40-运行时可靠性与可观测性深化-2026-10-10-用户决策方案-a-2026-10-10-已闭环-归档) + [archive/index.md](./index.md) + [platform.md §10.5 / §10.6 / §10.7 / §11](../../standards/platform.md) + [configuration.md](../../guide/configuration.md) + [backlog.md](../backlog.md)（M40 衍生候选）

## M39: 平台视图体验与可观测补强（M39.1~M39.6 全部已闭环 / 2026-10-10 归档）

> **归档日期**：2026-10-10
> **阶段摘要**：承接 M38 平台执行模型隔离归档后的平台视图体验与可观测阶段。来源为 2026-10-08 定时扫描批量失败排查中用户在同一批反馈的 8 项平台问题（扫描页按状态筛选与聚合分页 / 扫描历史弹窗关闭按钮与日志区高度 / 告警视图按包聚合 / 运行日志下载 / PR Check 启用 / 环境事件覆盖）——8 项按类型平衡归并为 6 原子（M39.1~M39.6）。同批排查另有「既有基线失败被误判为运行失败（exit code 归因口径）」的引擎口径缺陷 1 项，已按 [§3.1 可用性插队例外](../../standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)先行修复（`e5c59b8`，口径见 [dependency-fixer.md §12.6](../../design/modules/dependency-fixer-records.md)），不计入本阶段；其衍生的 3 项运行时可靠性候选（部署产物版本戳陈旧校验 / 失败 run 落 summary 快照 / 执行超时可配置化）留 [backlog.md](../backlog.md)。**6 原子条目全部闭环**，覆盖 🎨 3 + 🚀 2 + 🛡️ 1。
>
> - **阶段启动规划**：`60575b2`
> - **M39.3** [P2 🎨 用户体验] 告警视图「按包」聚合跨 severity 重复分组修正（组排序键「最高级别 rank × 步长 − 包名序号」保证同包相邻 + 视觉 4 基线重建 + 三处文档口径）—— `b6c5026` + `24708e2` + `de4c3cb`
> - **M39.1** [P2 🎨 用户体验] 扫描页筛选与分页优化（`scan-history/summary` 按 `lastStatus` 过滤 + 两表 CaomeiTabs 分区 + byRepo 客户端分页 + 统计窗口提示）—— `be2af89` + `a41ea33` + `110d691`
> - **M39.2** [P3 🎨 用户体验] 扫描历史弹窗体验（移除冗余 body 关闭按钮 + 日志区 `clamp` 自适应 + `--caomei-dialog-width` 响应式宽度）—— `b97f0f0` + `b241687` + `f9535e1` + `a19d1dc`
> - **M39.5** [P2 🚀 能力扩展] PR Check 监测启用链路打通（`kind` 落库 / 回读 + 表单 `kind` 选择器 + `monitor-status` 只读总开关端点 + env 文档）—— `3b8e322` + `9526fe3` + `9b534fc` + `1d33ec5`
> - **M39.4** [P2 🚀 能力扩展] 运行日志下载与批量下载（`runs-query.ts` 共享筛选层 + 单 run / 批量导出端点 + 413 硬上限 + `download.ts` + 两弹窗入口）—— `70c801e` + `27f7cbe` + `21d1895` + `b4a4af4`
> - **M39.6** [P3 🛡️ 可观测与治理] 环境事件覆盖扩展（`container_unavailable` 事件 + 移除死类型 `docker_daemon_down` + 类型下拉全量对齐 + 通知白名单）—— `e80b7b0` + `723ae5b` + `7bff818` + `e34d157`
>
> **commit 数量实证**：`git log master --first-parent --oneline origin/master..HEAD` 去重统计 = **23 commits**（阶段启动 1 + M39.3 3 + M39.1 3 + M39.2 4 + M39.5 4 + M39.4 4 + M39.6 4；每个 commit 仅归属一条目，无重复计数）。阶段前的 `e5c59b8`（引擎口径插队修复）+ `da148f8`（候选登记）已随 M38 归档末推送 `origin/master`，不计入本阶段。
>
> **关键决策**（2026-10-09 用户决策方案 A + 各原子 D 阶段裁定，完整记录见 [roadmap.md §M39](roadmap-phases-m39-m48.md#m39-平台视图体验与可观测补强-2026-10-09-用户决策方案-a-2026-10-10-已闭环-归档)）：6 原子 D 阶段定稿——① M39.1 byRepo 客户端分页 + CaomeiTabs 分区（筛选仅作用于聚合结果，UI 显式标注窗口边界）；② M39.2 视口比例 `clamp` 日志区 + 设计钩子 `--caomei-dialog-width`（inline `:style` 恒胜 `:breakpoints`，既有 breakpoints 为死代码）；③ M39.3「一个包一组」组排序键；④ M39.4 服务端端点导出（单 run txt / 批量合并单 txt / 运行数 100 + 字节 5 MiB 硬上限 413）；⑤ M39.5 env-only 总开关 + 只读状态端点 `monitor-status`（避免构建期烘焙的公开配置漂移）；⑥ M39.6 环境事件 / 运行失败分类边界 + `docker_daemon_down` 移除 + 通知类型白名单。
>
> **类型平衡复核**：🎨 用户体验 3（M39.1 / M39.2 / M39.3）/ 🚀 能力扩展 2（M39.4 / M39.5）/ 🛡️ 可观测与治理 1（M39.6）；🧪 无独立条目（测试随各条目内嵌与 M39.3 视觉基线重建），缺口显式标注，接近 [规划规范 §1.1 类型平衡建议](../../standards/planning.md#_1-1-硬性约束)。
>
> **审计**：A 阶段覆盖全部 6 原子条目（M39.3 / M39.1 / M39.2 / M39.5 与 M39.4 / M39.6 均为 `standard` 2 分区并发）—— 全部 R1 Pass → 收口 warning / suggest → R2 quick Pass，记录在 `artifacts/review-gate/`（gitignored）。
>
> **ahead commits 实证**：归档时 `git rev-list HEAD ^origin/master --count` 实测 = **23**（`git rev-list origin/master ^HEAD --count` = 0 双向核验），全部为本阶段 commits，待用户推送确认。
>
> **关联**：[roadmap.md §M39](roadmap-phases-m39-m48.md#m39-平台视图体验与可观测补强-2026-10-09-用户决策方案-a-2026-10-10-已闭环-归档) + [archive/index.md](./index.md) + [platform.md §7 / §11](../../standards/platform.md) + [backlog.md](../backlog.md)（M39 衍生候选）
