# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 当前阶段：M14 全部已闭环，待下一阶段（M15）启动

> **阶段背景（2026-08-26 启动 → 2026-08-26 闭环）**：M13 治理 + UX 反馈 + 网络治理 + Code Scanning 全部闭环（12 子任务 / 26 commits）后承接：
>
> - **M14.1 T1310 F 阶段闭环** ✅ —— T1310 platform 进入 release 通道 7 commits（T1310 ahead 5 `300b318`/`1819b59`/`733e198`/`7b40a2c`/`a74d07d` + P 阶段规划 `1fd38c1` + M14.1 收口 `e7103f6`）
> - **M14.2 UX-R1 扫描历史分页** ✅ —— 5 commits（`81bd8d2` 后端分页 + `581e1a9` RepoHistoryDialog Paginator + `1a9eddf` 次级调用方 + i18n + `b7c9226` e2e + 收口登记 + `17b5643` changelog 钩子自动 stage 落档）
> - **M14.3 M13.4 T1403 follow-up** ✅ —— 1 commit（`5ccaaf4` e2e 补首屏默认 `dedupe=across` 请求 URL 断言 + 收口登记）
> - **M14.x neat-freak 批次** ✅ —— 5 commits（`92cc348` wisdom 蒸馏 + `ea0e24f` C34 规范挂接 + `84b4e1a` test 名清理 + `b45f55e` git.md 格式修复 + `dd577cd` 收口登记）
> - **M14.y 依赖批量治理** ✅ —— 4 个 dependabot major PR 收口（`@octokit/request-error` 5→7 rebase 后自动合；`better-auth` 1.6→1.7 + generic OAuth 重写适配已闭 + 新 PR #53；`conventional-changelog` 7→8 已闭，加 dependabot major ignore；`PrimeVue` 4→5 暂缓已闭，登记 [backlog.md §延期 / 暂缓项](backlog.md#延期--暂缓项)）
>
> **完整闭环记录**：详细 commit 列表 + 验收标准 + 关键决策 + 风险评估见 [todo-archive.md §M14](todo-archive.md#m14-platform-release-通道闭环--ux-反馈跟进m14123x-全部已闭环)。
>
> **ahead 状态**：ahead=0（`git rev-list HEAD ^origin/master --count` 实证，所有 M14 commits 已推送至 origin/master）。
>
> **下一阶段触发**：M15 待用户主动启动；backlog 候选见 [backlog.md](backlog.md) §短期 / 一次性候选任务。

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
| 未排期 / 延期 / 远期 + 已知边界 / known-issue | [backlog.md](backlog.md)（已闭环条目已清理：C16 / C21 已由 M13 闭环迁出 / UX-R1 已由 M14.2 闭环迁出；UX-R2 / UX-R3 暂缓项见 §扫描历史与详情 UX） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M14 全部；M14 已闭环 2026-08-26） |
| 当前阶段活跃任务 | [todo.md](todo.md) 顶部"当前阶段"段（M14 全部已闭环，待下一阶段 M15 启动） |
| 已知边界 / known-issue | backlog 顶部"已知边界与 known-issue"段（PrimeVue hydration 持续观察项登记在 [backlog.md §主线 #1](backlog.md#主线-1primevue-4--nuxt-hydration-rowgroup-known-issue)） |
