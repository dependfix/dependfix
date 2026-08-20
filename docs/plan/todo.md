# 当前阶段任务

> **M11 P3 推进批次启动（2026-08-20，用户决策已落实）**：本批次承接 M11 剩余 2 个 P3 项 + 用户决策已落盘到 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动)。**决策落地**：
>
> - **Q1（C58 scope）= A 完整**：同时做 C58-1（rowGroup 聚合）+ C58-2（Chart 卡片复用 C61）—— 拆 2 sub-task 独立评审
> - **Q2（C58-2 Chart 选型）= 复用 C61 ChartCanvas**：不自研新图表，直接复用 dashboard.vue 已实现的 3 块图表卡片（severity 饼图 + fixRate 环形 + Top-10 包柱状图）+ `ChartCanvas.vue` 自实现组件 + 768px 响应式断点 —— 数据源复用 `/api/dashboard/stats`，无需新增后端图表端点
> - **Q3（C-ENV-CHANGE-ALERT 通知渠道）= 仅邮件**：复用 T912 mailer service（已闭环）；其他渠道留 `NotificationChannel` 接口 + 占位注册入口（slack/webhook 不实际发送），后续接入时新建实现类
>
> **实施拆解（按依赖关系排序）**：
>
> | 编号 | 任务 | 依赖 | 验收要点 | commit 计划 |
> |:--|:--|:--|:--|:--|
> | C58-2-1 | Chart 卡片复用：从 dashboard.vue 抽取图表区块搬到 alerts.vue 顶部（composable 化或组件复用） | C61 已闭环 | 3 块图表渲染 + 768px 响应式 + data 同步（复用 `/api/dashboard/stats`） | feat(platform) alerts chart 卡片 |
> | C58-2-2 | i18n 复用：dashboard.chartTitle/severityChartTitle/fixRateChartTitle/topPackagesChartTitle/chartEmpty 在 alerts 视图下复用 | C58-2-1 | 双语键全；缺词 blocker 通过 | 同 commit |
> | C58-1 | rowGroup 聚合：后端 `/api/alerts` 加 `?groupBy=package` 参数 + 前端 DataTable `rowGroupMode="subheader"` | 无前置 | subheader 渲染 group + 计数；e2e 断言 | feat(platform) alerts rowGroup |
> | C-ENV-1 | audit_event 表：entity + migration + 索引 `[type, createdAt]` / `[repositoryId, createdAt]` | 无前置 | SQLite DDL 验证索引列 | feat(platform) audit event 表 |
> | C-ENV-2 | NotificationChannel 接口 + EmailNotificationChannel 实现 + 注册表 + scan-orchestrator 触发点 | T912 闭环 + C-ENV-1 | fail-closed 邮件发送 + 接口可扩展；scan-orchestrator fire-and-forget 不阻塞 | feat(platform) notification channel |
> | C-ENV-3 | admin 接收方配置 + i18n 邮件模板（zh-CN + en-US） | C-ENV-2 | 默认 org admin 全员 + env 覆盖；模板双语 | 同 commit |
> | C-ENV-4 | UI 入口 env-events.vue 列表 + 过滤 + 详情展开 | C-ENV-1 | 列表 + 详情；与 alerts 共享 SCSS；768px 响应式 | feat(platform) env-events UI |
> | C58 + C-ENV A | code-auditor 分区审计（按文件模块拆分） | 全部 commit | 0 blocker + warning 闭环 | artifacts/review-gate/2026-08-20-c58-env.md |
> | C58 + C-ENV V | ui-validator 三任务 UI 验证（响应式 + 暗色模式 + Chart 渲染） | 全部 commit | 768px + dark + chart canvas 渲染 | artifacts/ui-validate/2026-08-20-c58-env.md |
> | C58 + C-ENV F | 分批提交：每个 sub-task 独立 commit | 全部 | conventional commit | 多 commit |
>
> **M11 阶段进度**：P2 三项（T1005-B + C28 + C53-后-A）+ P1 T1005-A/C + P3 C53-后-B/C + C56/C57 全部闭环；本批次启动 C58-1/C58-2/C-ENV-1~4 七个 sub-task。**前置依赖确认**：C61（ChartCanvas + dashboard.vue 已落地，复用）/ T912（mailer 已闭环，复用）/ T1005-C（degradedReason 信号源已落地）。**验证矩阵目标**：branches 80% 维持；lint/typecheck/test 全绿；新增 30+ 测试。

> **T1005 沙箱路由接线 4 子任务全部闭环（2026-08-20）**：本批次按用户决策分 4 子任务——**A 前端 UI 暴露 sandbox 选项**（P1，✅ commit `0ea8149`）/ **B Repository.sandboxLimits JSON 字段**（P2，✅ 拆 2 commit：`5542e33` 实体+schema / `b6bce6c` 端到端透传；UI 不暴露限额覆盖表单）/ **C 状态机扩展 `degraded` 状态**（P1，✅ commit `64135ed`）/ **D quick-start.md 同步**（P2，✅ commit `809aa3b`）。**本批次已完成**：状态机契约落盘于 [executor-sandbox.md §7.8](../design/governance/executor-sandbox.md)，ScanRunStateDecision 类型扩展（`status` union 加 `'degraded'` + `degradedReason?` 可选参数）+ 函数体 degraded 分支，`scan-orchestrator.service.ts` 降级信号透传 + sandboxLimits 透传，`batch-aggregate.ts` 新增 `degradedCount`（独立计）+ TERMINAL_STATUSES 含 `'degraded'`，A 场景 → degraded + info UI / B 场景 → failed + warn UI 差异化。A/B 场景验收段增补于 [sandbox-security-governance.md §7.1](../design/governance/sandbox-security-governance.md)。**T1005 验证矩阵**：branches 80.44% ≥ 80%；`parseSandboxLimits` 单元测试全分支覆盖（entities/repository.ts 100%）；144 files / 1996 tests 全绿（+27 个 sandboxLimits 相关测试）；2 核心 commit standard Pass + 1 quick Pass。**新增 backlog 登记**：C-ENV-CHANGE-ALERT「环境容器变化告警」（P3，依赖 audit log 设计 + 通知渠道）见 [backlog.md §M11](backlog.md)。

> **branches 80% 冲刺收口（2026-08-20）**：commit `9e290fd` + `da05851` 共 6 文件 +377 行 / -13 行；runs/[id].get.ts 9/12（75%）/ batch.post.ts 20/21（95.23%）/ naming-strategy.ts 10/10（100%）/ distill-wisdom.mjs 86/97（88.65%）；整体 branches 79.38% → 80.32%（+50 covered），阈值从临时 79% 恢复至 80%。Audit quick Pass（0 blocker + 1 warning 阈值恢复已闭环 + 3 suggest 不阻塞）；附带修复 distill-wisdom.mjs 真 bug（vitest mock 环境 `process.exit(0)` 不真终止，fall-through 到 `throw err`）。
>
> **C53 平台集成模式 fix 修复结果推送远程已闭环 + M11 业务可见性阶段启动（2026-08-20）**：C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序 3 commits 全部 commit + Review Gate Pass（commit `83ec736` / `46b7c15` / `3ed8303`），结束 M6 阶段"修复结果仅在本地临时目录"问题；M11 阶段启动任务清单详见 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动)。归档细节见 [todo-archive.md §C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)；设计文档同步更新于 [executor-sandbox.md §8](../design/governance/executor-sandbox.md#8-a-模式-push--pr-推送机制) + [security.md §5.4 凭据权限阶 + §5.5 凭据加密存储](../standards/security.md#5-依赖与供应链安全-dependency--supply-chain-security)。
>
> **近期归档批次（主窗口保留 5 个，C53 收口 + M8 已迁出至分片）**：[todo-archive.md](todo-archive.md)——**[§C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)**（2026-08-20，A 模式 push + PR 闭环 3 commits）+ **[§M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)**（2026-08-20，T1001-T1004 13 commits）+ **[§M9](todo-archive.md#m9-i18n-基建同步已归档)** + **[§2026-08-19 平台可用性 PR1-PR3](todo-archive.md#2026-08-19-平台可用性批次pr1-pr3)** + **[§2026-08-19 batch-runs 增强 C54+C55](todo-archive.md#2026-08-19-batch-runs-增强c54c55)** + **[§2026-08-20 平台 UI 增强 C59-C61](todo-archive.md#2026-08-20-平台-ui-增强c59c60c61)**。**更早期归档分片**：[archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8 — 2026-08-20 neat-freak 批次 + M8 补入）+ [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)（M0 / M1）+ [archive/todo-archive-phases-m2-m55.md](archive/todo-archive-phases-m2-m55.md)（M2-M5.5）
>
> **M11 阶段活跃 backlog 候选**（按 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动) 顺序追踪）：**P1 [T1005](backlog.md)** sandbox 路由接线（schema 扩展 + orchestrator 分支 + 降级契约落地，quick-start 已标注待 T1005 落地）；**P2 [C28](backlog.md)** security.md §凭据加密存储章节补齐（T912-3 + C53-§5.5 联动）；**P2 [C53-后-A](backlog.md)** 工作目录 stale-cleanup 任务（_pending 24h 清理）；**P3 [C58 / C-ENV-CHANGE-ALERT / C56 / C57 / C53-后-B / C53-后-C / C36 / C37 / D1-D8 / T701-e2e / C33 / SAML / B1-B2 / T905 / C21-C24 / C34 / T705 / T703](backlog.md)** —— C58 与 C-ENV-CHANGE-ALERT 状态已升级为 🔧 实施中（2026-08-20 用户决策，详见顶部实施拆解表）
>
> **T705 / T703 已延期（2026-08-12 用户指示）**：生产级部署（PostgreSQL/Helm/Sentry）与跨平台 Git（GitLab/Bitbucket）暂缓排期，详见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)

---

## 待人工验收（真实环境，随可用性推进）

- **T701 真实凭据 3 项**：真实 GitHub/Google OAuth 登录闭环（需 OAuth App 凭据）、真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）、构建期配置凭据后按钮显示路径实测——[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)
- **T702 HTTP 层状态流转**：pending→running→completed + 前端轮询体验（需后台服务/staging 或 CI redis service）
- **T704 async 定时触发**：BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）；Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）
- **发布管线收尾（P3）**：release:auto-version 完整流程待 schedule 启用后首个 cron 裁决；main 副作用路径测试观察项

## 已知边界

- **npx skills GitHub 源端到端验证**（M5.5 遗留，本机 clone github.com 网络受限）依赖 CI 端到端裁决
- C28 / C30 等 pending backlog 项详见 [backlog.md](backlog.md)，不在 todo.md 重复列出（C29 已由 2026-08-20 C59 修复闭环）
