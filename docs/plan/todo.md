# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M15 已闭环 / M16（UX-R3 候选）待启动

> **M15 状态**：✅ 全部完成（M15.1 UX-R2 4 子任务全部闭环 / 2 轮 code-auditor quick depth Pass / ahead 部分待用户推送）。
>
> **下一阶段（M16）候选**：UX-R3（`/scans` 独立页面 + 替代 `RepoHistoryDialog`）属 [backlog.md §扫描历史与详情 UX](backlog.md#扫描历史与详情-ux2026-08-26-实测反馈) 高风险候选（跨 5+ 文件 / 含新建页面 / 导航迁移 / 后端聚合 API / 组件迁移）。**当前未启动**——M16 启动前需先做 P 阶段规划（[规划规范 §1.1 任务粒度约束](../standards/planning.md) + 历史 M13/M14 拆分参考），建议拆分 3 子阶段：
>
> - **M16.1 summary API** —— `/api/scan-history/summary.get.ts` 聚合统计（纯 SQL 应用层聚合 + N+1 防御）
> - **M16.2 `/scans` 页面骨架** —— 顶部聚合卡片 4 块 + 中部按仓库聚合 + 底部"所有运行"列表（复用 UX-R1 分页契约）
> - **M16.3 RepoHistoryDialog 迁移** —— `repos.vue` 按钮从打开 dialog 改为 `router.push('/scans?repository=' + id)`；`RepoHistoryDialog` 组件保留为 `/scans?run=` 内部 detail dialog 复用 + `apps/platform/app/layouts/default.vue` 增加"扫描"菜单项
>
> **决策点**：M16 是否启动 / 是否按上述子阶段拆分 / 是否需要 backlog 进一步细化（候选当前描述已较完整）—— 待用户决策。ahead commits 部分可推可不推不影响 M16 P 阶段规划（独立产出）。
>
> **非目标（M15 阶段已收口）**：不修改 `/api/runs` 契约（已收口 / M15 仅消费既有契约），不动 `RepoHistoryDialog.vue`（已收口 / 仅 UX-R3 迁移会触发），不做数据层去重 / PrimeVue 升级 / C36/C37 i18n（属 backlog 候选）。

---

## M15 任务清单（已闭环 ✅）

### M15.1 UX-R2-A：扩展 Sidebar 运行视图 ✅

- **优先级**：P1
- **交付物**：`alerts.vue` §RunDetailView 运行元数据 + `apps/platform/app/utils/run-view.ts` utility
- **范围**：显示 Run 短 ID、模式、严重级别阈值、执行器、告警数、开始时间与持续时间
- **验收**：中英文文案齐全；空字段与缺失时间有稳定降级；复用既有 `/api/runs` 数据 + `requestSequence` 守卫
- **依赖**：✅ M14.2 UX-R1（已闭环）
- **关键 commit**：`1112017`（与 B/C 同 commit；实施段）
- **完成定义**：5 列元数据 + utility 抽取 + 空字段降级
- **完成日期**：2026-08-26

### M15.1 UX-R2-B：按执行器控制 Run URL ✅

- **优先级**：P1
- **交付物**：Sidebar 的运行外链条件渲染
- **范围**：仅 `executorKind === 'github-action'` 且存在 `runUrl` 时显示外链；容器与 sandbox 隐藏
- **验收**：不能伪造内部 Run URL；已有 GitHub Action 链接保持可点击
- **关键 commit**：`1112017`（含入 A 同 commit）
- **完成日期**：2026-08-26

### M15.1 UX-R2-C：补充详情入口 ✅

- **优先级**：P1
- **交付物**：`apps/platform/app/components/RunDetailDialog.vue`（新增）+ 现有 `GET /api/runs/:id` 复用
- **范围**：复用 `GET /api/runs/:id` 与 `requestSequence` 守卫，不在 Sidebar 内复制完整结果表格
- **验收**：点击详情可加载结果；加载失败与空结果不阻塞 Sidebar 列表
- **关键 commit**：`1112017`（含入 A/B 同 commit）
- **完成日期**：2026-08-26

### M15.1 UX-R2-D：回归与收口 ✅

- **优先级**：P1
- **交付物**：`apps/platform/tests/unit/run-view.test.ts` 16 case + `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts` 2 case（i18n 双语 / utility 抽取 / `runs.statusDegraded` 均为 A 段 `1112017` 交付，**不**在本 D 段交付物内——见 UX-R2-A 关键 commit 段）
- **范围**：覆盖 GitHub Action URL、容器 URL 隐藏、运行字段与既有 rowGroup 基线（验证 `1112017` 实施的 A 段 + 验证回归）
- **验收**：lint / typecheck / platform test / coverage / build / check:docs / i18n 检查与定向 E2E 全绿
- **关键 commit**：`0a60e3d`（独立 commit，**实证 `git show --stat`：2 文件 / +251 行**）：① `apps/platform/tests/unit/run-view.test.ts` 16 case 单测——覆盖 6 工具函数所有分支；② `apps/platform/tests/e2e/alerts-sidebar.e2e.test.ts` 2 case e2e——覆盖 Sidebar 元数据 + URL 条件渲染。**不**含 utility 抽取 / i18n 键 / `runs.statusDegraded`（这些均在 `1112017`，见 UX-R2-A 关键 commit 段）
- **A 阶段审计**：2 轮 code-auditor quick depth Pass（第 1 轮 Reject 1 blocker B1 `alertsFound` 函数签名变更未同步调用方 → 修复后第 2 轮 Pass + 4 suggest 顺手处理：S1 `runModeLabel` 分支补测 + S2 阈值展示一致性 + S3 alerts.vue 行数 827 未触发 max-lines + S4 e2e 中文硬编码暂保留与既有 alerts-rowgroup 风格一致）
- **完成日期**：2026-08-26

### M15 归档指针

**总投入**：3 commits ahead（M15 实施：`5c65177` P 阶段 docs + `1112017` feat 实施含 A/B/C + `0a60e3d` test 覆盖 D）；本批次归档 atomic commit 跨 5 文件。

**ahead commits 实证**：按 [规划规范 §4.4 §5 ahead 实证](../standards/planning.md#44-大批量归档批次操作规范) `git rev-list HEAD ^origin/master --count` 动态核验（不写死具体数字以免 staleness；当前值含 M15 实施 3 + release.yml CI 修复 1 共 4）。

**详细实施记录 / commit 引用 / 关键经验 / 待迁移经验**：见 [todo-archive.md §M15](todo-archive.md#m15-扫描历史详情侧栏增强ux-r2已闭环)。

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
