# 当前阶段任务

> **M11 全部闭环（2026-08-20）**：C58 + C-ENV-CHANGE-ALERT + T1005 + C28 + C53-后-A/B/C + C56/C57 全部闭环 → 22 commits 总投入；详见 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-已闭环) 摘要表 + [archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md) 详细归档（含 commit 引用 / 决策记录 / 历史教训）。
>
> **commit 序列（ahead of origin/master 12 commits）**：
>
> | # | commit | 内容 |
> |:--|:--|:--|
> | 1 | `13d5065` | chore: 修复 i18n 重复键 + class reorder |
> | 2 | `a562ab2` | feat: dashboard stats composable 抽取 + alerts 复用图表（C58-2 核心） |
> | 3 | `5bb0f96` | feat: alerts 顶部图表 + rowGroup 按包聚合（C58-1 + C58-2 alerts 部分） |
> | 4 | `aeee3f0` | feat: audit_event 表 + SQLite migration（C-ENV-1） |
> | 5 | `f57683e` | feat: notification 接口 + Email 实现 + Stub 注册（C-ENV-2 接口层） |
> | 6 | `15f1c9a` | test: notification 模块测试 + 邮件模板双语（C-ENV-2 测试） |
> | 7 | `3f4653f` | feat: scan-orchestrator 集成 audit_event + notify 触发（C-ENV-2 集成） |
> | 8 | `64f005e` | feat: env-events UI + API 权限防护 + e2e（C-ENV-3 + C-ENV-4 + 文档） |
> | 9 | `f678196` | test: env-events e2e 覆盖 + 权限场景 |
> | 10 | `8d062a2` | docs: M11 P3 推进批次收口 + 9 commits 引用 |
> | 11 | `ace8eea` | chore: 清理本批次审计引用编号（RG-B05/B06/B07/B09） |
> | 12 | `eddc638` | chore: 清理 audit-events API 残留审计编号（RG-B05/B08） |
>
> **审计闭环（depth=standard × 2 轮）**：
> - 第 1 轮：Reject（9 blocker + warning）—— elapsed 14m 15s
> - 第 2 轮：Pass（warning 已闭环）—— elapsed 5m 24s
>
> **验证矩阵**：677 tests pass（+56 新测试）/ branches 80.49% ≥ 80% / lint 0 error / typecheck 0 error
>
> **M11 阶段全部闭环**：P2 三项（T1005-B + C28 + C53-后-A）+ P1 T1005-A/C + P3 C53-后-B/C + C56/C57 + C58 + C-ENV-CHANGE-ALERT 全部归档。

> **近期归档批次（主窗口保留 3 个）**：[todo-archive.md](todo-archive.md)——**[§C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)**（2026-08-20，A 模式 push + PR 闭环 3 commits）+ **[§2026-08-20 平台 UI 增强 C59-C61](todo-archive.md#2026-08-20-平台-ui-增强c59-c60-c61)** + **[§2026-08-20 M11 推进批次](todo-archive.md#2026-08-20-m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)**。**更早期归档分片**：[archive/todo-archive-phases-m11.md](archive/todo-archive-phases-m11.md)（M9 / 2026-08-19 PR1-PR3 / 2026-08-19 C54+C55 / M11 详细段）+ [archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8 — 2026-08-20 neat-freak 批次 + M8 补入）+ [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)（M0 / M1）+ [archive/todo-archive-phases-m2-m55.md](archive/todo-archive-phases-m2-m55.md)（M2-M5.5）

> **未完成项目（backlog 仍活跃）**：详见 [backlog.md](backlog.md)——
> - **已延期 / 暂缓**：T705（生产部署 / PostgreSQL+Helm+Sentry）、T703（跨平台 Git / GitLab+Bitbucket）、C30（Docker CI 暂缓）
> - **远期登记**：C33 MCP P3 / C36 服务端 API 错误消息 i18n / C37 语言偏好多设备同步 / D1-D8 多组织 / SAML 2.0 SSO / B1-B2 PR 关闭评论 / T905 worktree 预案 / C21-C24 Code Quality / C34 存量规范盘点 / T701-e2e 管理端点集成测试
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
- 其他 backlog 项详见 [backlog.md](backlog.md)，不在 todo.md 重复列出


