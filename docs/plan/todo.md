# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M16 平台可用性深化（5 项候选上收）P 阶段规划完成；M16.1 已实施

> **目标**：把 `apps/platform` 从 demo 落地为实际可用项目，覆盖 5 项用户痛点、技术债和能力扩展，形成开发/修复闭环。
>
> **阶段边界**：M16 由 5 项原子任务组成，按 [规划规范 §1.1 任务粒度约束](../standards/planning.md)（≤5-6 项硬上限）收敛；UX-R3 只占其中一项（M16.1）。
>
> **依赖**：M15.1（已闭环）的 `RunDetailDialog` 与 utility；M14.2（已闭环）的 `/api/runs` 分页 + `ids` 契约；M13.2（已闭环）的应用层去重。
>
> **非目标**：不引入多组织；不重写后端聚合；不动 `dashboard.vue` latestRun 卡片；不动 `batch-runs` 跨仓库视图；不升级 PrimeVue 5；不破坏既有 `alerts-rowgroup` / `history-dialog` / 视图切换 / dedupe 行为。
>
> **状态**：M16.1 UX-R3 `/scans` 独立页面 D 阶段已实施 + A 阶段 code-auditor standard depth Pass；本批次待提交；M16.2-16.5 待用户指令进入下一阶段 D 阶段。

---

## M16 任务清单

### M16.1 UX-R3 `/scans` 独立页面 + RepoHistoryDialog 迁移

- **优先级**：P1
- **范围**：新增 `apps/platform/app/pages/scans.vue`；`apps/platform/app/layouts/default.vue` 增加 "扫描"菜单项（viewer 可见）；`apps/platform/app/pages/repos.vue` 的 pi-history 按钮 `navigateTo` 改为 `'/scans?repository=' + id`；`apps/platform/server/api/runs/index.get.ts` 补 `organizationId` 过滤；新增 `apps/platform/server/api/scan-history/summary.get.ts` + 同名测试；i18n 双语新增 `scans` 段；新建 `apps/platform/tests/e2e/scans.e2e.test.ts` 覆盖三种 query 组合；`RepoHistoryDialog.vue` 保留为 `/scans?run=` 内部 detail dialog 兜底。
- **验收**：三种 query 组合可访问、汇总卡片 4 块 + 按仓库聚合 + 全运行分页列表渲染、viewer 可见、PrimeVue hydration fixme 不新增；既有 `alerts-rowgroup` / `history-dialog` / `batch-runs` / `dashboard` 不回归。
- **关联**：依赖 M14.2 UX-R1 分页 + M15.1 RunDetailDialog + M15 utility 抽取。
- **状态**（2026-08-27）：D 阶段已实施。`vitest` 743 passed + 4 skipped（新增 10 case：runs organizationId 隔离 1 + summary 6 + 既有 e2e 迁移）；`e2e` 74 passed + 2 skipped（新建 5 case：3 query 组合 + viewer × 2）；A 阶段 code-auditor standard depth Pass（warning 7 项 + suggest 4 项已分级 backlog）；`build` 成功；i18n JSON.parse 双语对称（542 键）。`history-dialog.e2e.test.ts` 删除并迁移至 `scans.e2e.test.ts`（避免 `/repos?history=` 路径成为孤儿）。`RepoHistoryDialog.vue` 新增 `queryKey` prop（'history' | 'run' 默认 'history'）支持 M16.1 + 兼容性。

### M16.2 C66-D alerts "立即修复此仓库" 入口 + `reuseScanRunId`

- **优先级**：P1
- **范围**：`apps/platform/server/api/repos/[id]/scan.post.ts` 新增 `reuseScanRunId` 参数跳过重拉；`apps/platform/app/pages/alerts.vue` 新增 "立即修复此仓库" 按钮（存在 `affectedRunIds[0]` 时启用）；i18n 双语 + 单测 + e2e。
- **验收**：可一键复用受影响运行直接进入修复链路；空 / 不存在 runId 时按钮降级到常规触发；不破坏 fixStatus 修复链路与 batch-runs 跨仓库触发。

### M16.3 C36 服务端 API 错误消息 i18n

- **优先级**：P2
- **范围**：在 `apps/platform/server/utils/` 引入 `createLocalizedError` helper（`code` 维持英文 + `message` 按 `Accept-Language` 翻译）；覆盖 `/api/repos` / `/api/alerts` / `/api/runs` / `/api/scan-history/summary` 关键错误；i18n `serverErrors.<code>` 双语 + 单测验证错误响应含 `message` 键 + e2e 验证 locale 切换。
- **验收**：中文用户接口下错误响应 `message` 字段为中文；code 保持英文供客户端判断；不影响 type=Error 业务路径；老客户端忽略未知键保持向后兼容。

### M16.4 PrimeVue hydration 主线 #1 缓解：alerts 加载迁移 useAsyncData

- **优先级**：P1
- **范围**：把 `apps/platform/app/pages/alerts.vue` 的 `onMounted(fetchRepositories/fetchAlerts)` 迁移到 `useAsyncData`（SSR 阶段具备数据，hydration 后 PrimeVue 不再出现 rowGroup subheader 不渲染问题）；保留 viewMode / dedupe / filters 等交互逻辑；解除 `apps/platform/tests/e2e/alerts-rowgroup.e2e.test.ts` 两个 `.fixme`；新增 Playwright / vitest 锁定 hydration 行为。
- **验收**：两个 fixme 取消；`alerts-rowgroup` e2e 全过（首屏默认数据驱动）；既有 dedupe / 视图切换 / 跨次去重 case 不破；M15 utility 仍可复用。

### M16.5 T701-e2e 管理端点集成测试补强

- **优先级**：P2
- **范围**：vitest 单测补 `/api/users` / `/api/credentials` / `/api/repos` 关键端点的鉴权 + 边界 case（admin / org_admin / viewer 三角色 + 自修改防御）；Playwright e2e 覆盖 admin / credentials / repos 三页面核心交互（CRUD + 权限拦截 + 列表分页）；目标是为"实际可用"提供回归保护。
- **验收**：测试覆盖到 admin 角色 + viewer 只读边界、credential 关联仓库 / 凭据泄露验证、repo 字段校验；e2e 在 headless 模式下稳定通过；覆盖率不下降。

---

## 待人工验收（真实环境，随可用性推进）

> 以下条目属 M7.1 / M7.2 / 发布管线阶段遗留的真实环境验证任务，**不在 M12 范围内**，保留随真实环境可用性推进。

### T701 真实凭据 3 项

平台 OAuth / OIDC / 凭据配置相关真实环境验证：

- 真实 GitHub / Google OAuth 登录闭环（需 OAuth App 凭据）
- 真实 IdP OIDC 登录闭环（需 RFC 9207 iss 回显支持）
- 构建期配置凭据后按钮显示路径实测

实施记录与背景：[archive/todo-archive-phases-m6-m7-t711.md §M7.1](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)

### T702 HTTP 层状态流转

扫描 run 状态对外接口（pending → running → completed）真实环境验证：

- 状态流转时间序列正确性（pending → running → completed 端到端）
- 前端轮询体验与 stale state 处理（需后台服务 / staging 或 CI redis service）

实施记录：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 7 阶段近线 + M15 / M14 增量；M0-M11 详细见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细分片） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出 / UX-R2 已由 M15 闭环迁出；UX-R3 顺延 M16） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M15；M15 已闭环 / M16 候选待启动） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M15 已闭环 / M16 候选待启动） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 持续观察项登记在 [backlog.md §主线 #1](backlog.md#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)） |
