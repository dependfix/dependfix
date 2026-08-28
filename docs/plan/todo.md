# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M17 全部 6 子阶段已闭环归档（2026-08-28）— 等待 M18

> **状态**：M17 安全与可用性收口阶段（M17.1 C38 encryptionKey 标准化 + M17.2 credentials 服务端 API i18n + M17.3 schedules 服务端 API i18n + M17.4 batch-runs + repos batch 服务端 API i18n + M17.5 S-2 authedCookieHeader 抽取 + M17.6 S-4 better-auth admin viewer 403 矩阵补强）全部 6 子阶段已闭环归档（2026-08-28 8 commits + 1 session 收尾 commit = 9 commits 全部已推送至 `origin/master`，ahead=0 `git rev-list HEAD ^origin/master --count` 2026-08-28 实测）。
>
> **总投入**：9 commits（M17.1 1 + M17.2 1 + M17.3 1 + M17.4 2 + M17.5 2 + M17.6 1 + session 收尾治理 1；含 M17.4 commit 2 audit Reject 后针对性补修闭环 + M17.5 lint-fix 独立 chore commit）。
>
> **详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验**：见 [todo-archive.md §M17](todo-archive.md#m17-安全与可用性收口m171--m172--m173--m174--m175--m176-全部已闭环--2026-08-28-归档)。
>
> **下一步候选**：
> - **启动 M18**：用户决策下一阶段方向
> - **backlog 主条目候选池**：C39（standards 文档 ENCRYPTION_KEY → NUXT_ENCRYPTION_KEY 同步）/ S-5（调用方测试 `process.env.ENCRYPTION_KEY` 死代码清理）/ C34（存量规范严格约束挂接盘点，下批次与 C39 联动）/ S1（`SCAN_PENDING_MERGED` 死代码）/ S2（`detectServerLocale` 缺 `?locale=` URL query 支持）/ M16.3 audit suggest 范围外扩展 4 条目（credentials / schedules / batch-runs + repos batch 等）

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
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留最近 5 个已归档阶段：M17 / M16 / M15 / M14 / M13 + M12/M8/C53 等指针段；M12 已分片至 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md) / 早期阶段分片见 [archive/](archive/)） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 + 2026-08-28 M16 归档批次新增的 [todo-archive-phases-m10-c53-c59c61.md](archive/todo-archive-phases-m10-c53-c59c61.md)） |
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出 / UX-R2 已由 M15 闭环迁出 / UX-R3 已由 M16.1 闭环迁出 / **C38 / S-2 / S-4 / 服务端 API i18n 范围外扩展 已由 M17 归档批次闭环迁出**） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（**M0-M17 已闭环归档**；M17 安全与可用性收口 6 子阶段 2026-08-28 9 commits 已全部推送至 origin/master ahead=0） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（**当前无活跃实施阶段**：M17 全部 6 子阶段已闭环归档 2026-08-28 9 commits（含 session 收尾）已全部推送至 `origin/master` ahead=0；等待用户启动 M18） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 主线 #1 状态从"暂停"变"已缓解"——M16.4 useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog） |
