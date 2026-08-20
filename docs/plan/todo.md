# 当前阶段任务

> **C53 平台集成模式 fix 修复结果推送远程已闭环 + M11 业务可见性阶段启动（2026-08-20）**：C53-1 push 链路 + C53-2 PR 创建 + C53-3 清理时序 3 commits 全部 commit + Review Gate Pass（commit `83ec736` / `46b7c15` / `3ed8303`），结束 M6 阶段"修复结果仅在本地临时目录"问题；M11 阶段启动任务清单详见 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动)。归档细节见 [todo-archive.md §C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)；设计文档同步更新于 [executor-sandbox.md §8](../design/governance/executor-sandbox.md#8-a-模式-push--pr-推送机制) + [security.md §5.4 凭据权限阶 + §5.5 凭据加密存储](../standards/security.md#5-依赖与供应链安全-dependency--supply-chain-security)。
>
> **近期归档批次（主窗口保留 5 个，C53 收口 + M8 已迁出至分片）**：[todo-archive.md](todo-archive.md)——**[§C53](todo-archive.md#c53-平台集成模式-fix-修复结果推送远程已归档)**（2026-08-20，A 模式 push + PR 闭环 3 commits）+ **[§M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)**（2026-08-20，T1001-T1004 13 commits）+ **[§M9](todo-archive.md#m9-i18n-基建同步已归档)** + **[§2026-08-19 平台可用性 PR1-PR3](todo-archive.md#2026-08-19-平台可用性批次pr1-pr3)** + **[§2026-08-19 batch-runs 增强 C54+C55](todo-archive.md#2026-08-19-batch-runs-增强c54c55)** + **[§2026-08-20 平台 UI 增强 C59-C61](todo-archive.md#2026-08-20-平台-ui-增强c59c60c61)**。**更早期归档分片**：[archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711 / M8 — 2026-08-20 neat-freak 批次 + M8 补入）+ [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)（M0 / M1）+ [archive/todo-archive-phases-m2-m55.md](archive/todo-archive-phases-m2-m55.md)（M2-M5.5）
>
> **M11 阶段活跃 backlog 候选**（按 [backlog.md §M11](backlog.md#m11-业务可见性--沙箱落地--安全文档2026-08-20-启动) 顺序追踪）：**P1 [T1005](backlog.md)** sandbox 路由接线（schema 扩展 + orchestrator 分支 + 降级契约落地，quick-start 已标注待 T1005 落地）；**P2 [C28](backlog.md)** security.md §凭据加密存储章节补齐（T912-3 + C53-§5.5 联动）；**P2 [C53-后-A](backlog.md)** 工作目录 stale-cleanup 任务（_pending 24h 清理）；**P2 [branches 阈值恢复 80% 冲刺](backlog.md)**（M10 + C53 启动条件已满足：cgroup.ts 81.94% + network-audit.ts 81.96%）；**P3 [C56 / C57 / C58 / C53-后-B / C53-后-C / C36 / C37 / D1-D8 / T701-e2e / C33 / SAML / B1-B2 / T905 / C21-C24 / C34 / T705 / T703](backlog.md)** 平台 UX / 远期登记随真实需求触发
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
