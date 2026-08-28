# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M16 已闭环归档（2026-08-28）— 当前无活跃实施阶段，等待用户启动 M17+ 候选

> **状态**：M16 平台可用性深化（M16.1 UX-R3 `/scans` + M16.2 C66-D alerts "立即修复此仓库" + M16.3 C36 服务端 API 错误消息 i18n + M16.4 PrimeVue hydration 主线 #1 缓解 + M16.5 T701-e2e 管理端点集成测试补强）已全部闭环归档。
>
> **详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 关键经验 / 待迁移经验**：见 [todo-archive.md §M16](todo-archive.md#m16-平台可用性深化m161--m162--m163--m164--m165-全部已闭环--2026-08-28-归档)。
>
> **M16.1-M16.5 总投入**：19 commits（M16.1 1 + M16.2 4 + M16.3 5 + M16.4 4 + M16.5 5），含 kebab-case rename refactor `acfdc8d8` 触发的 CI Coverage 修复批次；**ahead=0 已全部推送至 origin/master**（`git rev-list HEAD ^origin/master --count` 2026-08-28 归档操作时实测 ahead=0）。ahead commits 按 [规划规范 §4.4 §5 ahead 实证](../standards/planning.md#44-大批量归档批次操作规范) 动态核验。
>
> **后续候选 backlog**：M16 阶段 audit suggest 已登记到 [backlog.md](backlog.md) 待迁移经验——
> - **C38** credential.service.ts 改走 `useRuntimeConfig().encryptionKey` + `NUXT_ENCRYPTION_KEY` 标准化（M16.5 audit W-1 登记）
> - **S-2** `authedCookieHeader` 抽取到 `tests/e2e/helpers/`（M16.5 audit suggest，M16.3 / M16.5 三批次遗留重复，可与 S-4 同批次）
> - **S-4** better-auth admin 端点 viewer role check 单测补强（M16.5 audit suggest）
> - M16.3 audit suggest：`S1` `SCAN_PENDING_MERGED` 死代码 / `S2` `detectServerLocale` 缺 `?locale=` URL query 支持 / 范围外扩展至 `/api/credentials/*` `/api/schedules/*` `/api/batch-runs/*` `/api/repos/{batch,batch-scan,importable}`——M16.6+ 候选
> - PrimeVue hydration 主线 #1 状态更新：从"暂停"变"已缓解"——useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog + 评估是否升级到修复版本（依赖 backlog §M14.2 PrimeVue 4 → 5 升级评估恢复条件 ② 与主线 #1 联动决策）

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
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出 / UX-R2 已由 M15 闭环迁出 / UX-R3 已由 M16.1 闭环迁出；C38 / S-2 / S-4 已由 M16.5 audit 登记） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M16；M16 已闭环 2026-08-28 归档 / M17 候选待启动） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M16 已闭环归档 / 当前无活跃阶段，等待 M17 候选启动） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 主线 #1 状态从"暂停"变"已缓解"——M16.4 useAsyncData 迁移后 rowGroup hydration 已闭环；剩余 PrimeVue 4 + Nuxt SSR hydration 兼容性 bug 监控 PrimeVue 4 changelog） |
