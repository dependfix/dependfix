# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M15 扫描历史详情侧栏增强（UX-R2）实施中

> **目标**：让 alerts 去重视图中的受影响扫描运行 Sidebar 能够明确区分运行 ID、模式、阈值、执行器、告警数和耗时。
>
> **依赖**：M14.2 UX-R1 已完成，`/api/runs` 已提供 `page`、`pageSize`、`ids` 与 `{items, total, page, pageSize}` 契约。
>
> **阶段边界**：M15 只实现 UX-R2；`/scans` 独立页面、导航迁移、summary API 等 UX-R3 内容顺延至 M16。
>
> **非目标**：不修改 `/api/runs` 契约，不修改 `RepoHistoryDialog.vue`，不做数据层去重、PrimeVue 升级或 C36/C37 i18n。
>
> **状态**：方案已确认，P 阶段规划完成；D 阶段实现进行中。

---

## M15 任务清单

### M15.1 UX-R2-A：扩展 Sidebar 运行视图

- **优先级**：P1
- **交付物**：`alerts.vue` 的 `RunDetailView`、运行表格列与计算字段
- **范围**：显示 Run 短 ID、模式、严重级别阈值、执行器、告警数、开始时间与持续时间
- **验收**：中英文文案齐全；空字段与缺失时间有稳定降级；复用现有 `/api/runs` 数据
- **依赖**：M14.2 UX-R1

### M15.1 UX-R2-B：按执行器控制 Run URL

- **优先级**：P1
- **交付物**：Sidebar 的运行外链条件渲染
- **范围**：仅 `executorKind === 'github-action'` 且存在 `runUrl` 时显示外链；容器与 sandbox 隐藏
- **验收**：不能伪造内部 Run URL；已有 GitHub Action 链接保持可点击

### M15.1 UX-R2-C：补充详情入口

- **优先级**：P1
- **交付物**：运行行的详情按钮与现有详情接口调用
- **范围**：复用 `GET /api/runs/:id`，不在 Sidebar 内复制完整结果表格
- **验收**：点击详情可加载结果；加载失败与空结果不阻塞 Sidebar 列表

### M15.1 UX-R2-D：回归与收口

- **优先级**：P1
- **交付物**：i18n、Playwright 覆盖、docs/plan 状态同步
- **范围**：覆盖 GitHub Action URL、容器 URL 隐藏、运行字段与既有 rowGroup 基线
- **验收**：lint、typecheck、platform test、coverage、build、check:docs、i18n 检查与定向 E2E 通过

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
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 3-5 阶段近线 + M14 增量；M0-M11 详细见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细分片） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出；UX-R2 已上收 M15，UX-R3 顺延 M16） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M15；M15 UX-R2 进行中） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M15 UX-R2 实施中） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 持续观察项登记在 [backlog.md §主线 #1](backlog.md#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)） |
