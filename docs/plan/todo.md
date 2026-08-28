# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M17 安全与可用性收口（2026-08-28 P 阶段落地 6 子阶段）

> **状态**：M17 已启动 P 阶段，6 子阶段全部串行实施（每子阶段独立 PDTFC+ + Review Gate）。**M17.1 T1701 C38 encryptionKey 标准化** 为下一实施条目（安全性 P1 硬缺口，优先闭环）。
>
> **拆分方案 / 实施路径 / 关键决策**：见下方"## M17 拆分依据与实施路径"段。
>
> **总投入预估**：12-16 commits；每子阶段独立 PDTFC+ 循环 + Review Gate（quick / standard 按规模）+ 独立归档至 [todo-archive.md §M17.x](todo-archive.md)。
>
> **前序 M16 闭环**：见 [todo-archive.md §M16](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档)（M16.1-M16.5 共 19 commits 已全部推送至 origin/master；M16 归档批次 commit `b1bf1af` ahead=1 待用户推送；`git rev-list HEAD ^origin/master --count` 2026-08-28 实测 ahead=1）。
>
> **backlog 上收记录**：C38 / S-2 / S-4 / 服务端 API i18n 范围外扩展——分别上收为 M17.1 / M17.5 / M17.6 / M17.2-4，详见 [backlog.md §历史归档指针](backlog.md#已闭环特定批次)。

---

## M17 任务清单

### M17.1 T1701 C38 encryptionKey 标准化 [P1]

- **来源**：M16.5 audit W-1 登记
- **文件范围**：5 文件（`apps/platform/server/services/credential.service.ts` + `apps/platform/nuxt.config.ts` + `apps/platform/playwright.config.ts` + `apps/platform/docker-compose.yml` + `apps/platform/.env.example`）
- **现状**：
  - `credential.service.ts:74` 直接读 `process.env.ENCRYPTION_KEY`（无 NUXT_ 前缀）
  - `nuxt.config.ts:61` `runtimeConfig.encryptionKey` 期望 `NUXT_ENCRYPTION_KEY`（标准 Nuxt 部署习惯）
  - 两者不同源 → 典型部署只设 `NUXT_ENCRYPTION_KEY` 时凭据加密抛 500
  - `runtimeConfig.encryptionKey` 在代码库**零消费**（除 playwright 临时兜底）
- **验收**：
  1. service 改读 `useRuntimeConfig().encryptionKey`
  2. nuxt.config 移除 inline fallback 让 `NUXT_ENCRYPTION_KEY` 成为唯一入口
  3. 删 `playwright.config.ts` 中 `ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!` 兜底（**仅 L34 无 NUXT_ 前缀那行**；保留 L30 `NUXT_ENCRYPTION_KEY=e2e-encryption-key-32-bytes!!!`——此为标准 NUXT_ 前缀部署凭据，与无前缀兜底是两条独立 env line；M17.1 验证后只删 L34 保留 L30，credential.service.ts 改读 `useRuntimeConfig().encryptionKey` 后 L30 即可满足 e2e 加密需求）
  4. 同步更新 `docker-compose.yml` / `.env.example` 文档
- **风险**：中（凭据加密是平台核心安全路径，误配置致生产 500）

### M17.2 T1702 服务端 API i18n：credentials [P2]

- **来源**：M16.3 audit suggest 范围外扩展
- **文件范围**：2 文件（`apps/platform/server/api/credentials/{index,[id]}.ts`）+ 既有测试
- **现状**：2 文件 throw 仍 `createError` 硬编码中文 message（`凭据不存在` / `缺少凭据 id` 等）
- **验收**：throw 改造使用 `createLocalizedError`（沿用 M16.3 C36 已落地模式）；message 按请求 locale 返回；既有测试调整 + 1 case 验证 locale 切换
- **风险**：低（沿用 M16.3 沉淀模式，0 新设计成本）

### M17.3 T1703 服务端 API i18n：schedules [P2]

- **来源**：M16.3 audit suggest 范围外扩展
- **文件范围**：3 文件（`apps/platform/server/api/schedules/{index,[id],[id]/trigger.post}.ts`）+ 既有测试
- **现状**：3 文件 throw 仍 `createError` 硬编码中文 message（`定时计划不存在` / `缺少计划 id` 等）
- **验收**：同 M17.2 模式（沿用 `createLocalizedError`）
- **风险**：低

### M17.4 T1704 服务端 API i18n：batch-runs + repos batch [P2]

- **来源**：M16.3 audit suggest 范围外扩展
- **文件范围**：5 文件（`apps/platform/server/api/batch-runs/{[id].get,[id]/force-fail.post}.ts` + `apps/platform/server/api/repos/{batch.post,batch-scan.post,importable.get}.ts`）+ 既有测试
- **现状**：5 文件 throw 仍 `createError` 硬编码中文/英文 message
- **验收**：同 M17.2 模式（沿用 `createLocalizedError`）
- **风险**：低

### M17.5 T1705 S-2 authedCookieHeader 抽取 [P3]

- **来源**：M16.5 audit suggest（M16.3 / M16.5 三批次遗留重复）
- **文件范围**：4 文件（新建 `apps/platform/tests/e2e/helpers/auth-cookie.helper.ts` + 3 e2e 文件 `api-i18n.e2e.test.ts:28` / `credentials-crud.e2e.test.ts:19` / `repos-crud.e2e.test.ts:15` 删本地函数 + 改 import）
- **现状**：3 文件定义**完全一致**的 `authedCookieHeader(page: Page): Promise<string>` 函数（`page.context().cookies().map((c) => ${c.name}=${c.value}).join('; ')` 拼接 `__Secure-` cookie 字符串，因 HTTP webServer 不自动发送 secure cookie）
- **验收**：3 e2e 文件一字不差的 `authedCookieHeader` 函数抽取至 `apps/platform/tests/e2e/helpers/auth-cookie.helper.ts`（**helpers/ 目录已存在**，含 `hydration.helper.ts` + `auth.helper.ts`——已 `find apps/platform/tests/e2e/helpers -type f` 实证；import path 建议 `import { authedCookieHeader } from './helpers/auth-cookie.helper'`，与既有 `helpers/` 目录约定一致）；零行为变更；e2e 全绿
- **风险**：零（纯重构）

### M17.6 T1706 S-4 better-auth admin viewer role check 单测补强 [P3]

- **来源**：M16.5 audit suggest
- **文件范围**：1-2 文件（新建 e2e 或 vitest 单测 + 可能的辅助函数）
- **现状**：当前覆盖——`auth-self-guard` 单测（self-target / last-admin）+ `admin.e2e` + `admin-roles.e2e`；缺口——`ban-user` / `remove-user` / `impersonate-user` / `unban-user` / `list-users` 5 端点 viewer 403 未覆盖
- **验收**：补 5 端点 viewer 403 单测；锁定 better-auth admin 当前版本 role 行为，防升级回归
- **风险**：低

---

## M17 拆分依据与实施路径

### 拆分依据

- **M17.1 独立**：安全性 P1 硬缺口，与 i18n 改造完全正交（无依赖），优先闭环
- **M17.2-4 服务端 API i18n 范围外**：按模块化分组（凭据 / 调度 / 执行+仓库），避开"4 端口合 1 批"导致单批 >5 文件超规问题；与 M16.3 C36 同模式，估算单条 2-3 commits
- **M17.5-6 测试基建**：低风险顺手做，按 M16.5 audit suggest 同批次精神合并为两条独立子阶段（S-2 重构 / S-4 补强是两件事）

### 实施路径

6 子阶段串行实施（每子阶段独立 PDTFC+ + 独立 Review Gate + 独立归档至 `todo-archive.md §M17.x`）。

### 关键决策（默认值，可微调）

1. **M17.2-4 排序**：credentials → schedules → batch-runs + repos batch（按"凭据先于业务、调度先于执行"依赖顺位）
2. **M17.5-6 顺序**：S-2 在前（重构无风险）→ S-4 在后（依赖 better-auth admin 当前版本行为锁定）
3. **i18n 改造模式**：严格沿用 M16.3 `createLocalizedError`（已沉淀模式，0 新设计成本）

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

实施记录：[archive/todo-archive-phases-m10-c53-c59c61.md §T912](archive/todo-archive-phases-m10-c53-c59c61.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[archive/todo-archive-phases-m6-m7-t711.md §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m72-平台能力深化已归档)

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
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 个已归档阶段：M16 / M15 / M14 / M13 / M12；早期阶段分片见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 + 2026-08-28 M16 归档批次新增的 [todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出 / UX-R2 已由 M15 闭环迁出 / UX-R3 已由 M16.1 闭环迁出；**C38 / S-2 / S-4 / 服务端 API i18n 范围外扩展 已由 M17.1 / M17.5 / M17.6 / M17.2-4 上收迁出**） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M16 已闭环；**M17 安全与可用性收口已启动 2026-08-28 P 阶段落地 6 子阶段**） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（**M17 安全与可用性收口 6 子阶段**：M17.1 C38 encryptionKey 标准化 [P1] + M17.2-4 服务端 API i18n 范围外扩展 [P2] + M17.5 S-2 authedCookieHeader 抽取 [P3] + M17.6 S-4 better-auth admin viewer role check 单测补强 [P3]） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 主线 #1 状态从"暂停"变"已缓解"——M16.4 useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog） |
