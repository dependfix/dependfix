# 当前阶段任务

> **M10 独立沙箱容器 C26 实施规划 + T912 SMTP 邮件发送器主体已归档（2026-08-20）**：M10 T1001 B1+B2 + T1002 + T1003 + T1004 全部 commit + Review Gate Pass，T912 主体（mailer service 模块 + 三回调接线 + coverage 回归）已交付，T912-3 安全与文档合并入 backlog **C28**（凭据加密存储章节补齐）。归档细节见 [todo-archive.md §M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档) + [§T912](todo-archive.md#t912-smtp-邮件发送器主体收口t912-3-待排)；设计文档同步更新于 [executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计) + [sandbox-security-governance.md §5 G5](../design/governance/sandbox-security-governance.md#5-治理决议与登记) + [quick-start.md §启用 rootless sandbox 执行（规划中）](../guide/quick-start.md)。
>
> **近期归档批次（主窗口保留 5 个）**：[todo-archive.md](todo-archive.md)——**[§M10](todo-archive.md#m10-独立沙箱容器-c26-实施规划已归档)**（2026-08-20，T1001-T1004 13 commits）+ **[§M9](todo-archive.md#m9-i18n-基建同步已归档)** + **[§2026-08-19 平台可用性 PR1-PR3](todo-archive.md#2026-08-19-平台可用性批次pr1-pr3)** + **[§2026-08-19 batch-runs 增强 C54+C55](todo-archive.md#2026-08-19-batch-runs-增强c54c55)** + **[§2026-08-20 平台 UI 增强 C59-C61](todo-archive.md#2026-08-20-平台-ui-增强c59c60c61)**。**更早期归档分片**：[archive/todo-archive-phases-m6-m7-t711.md](archive/todo-archive-phases-m6-m7-t711.md)（M6 / M7.1 / M7.2 / T711）+ [archive/todo-archive-phases-m0-m1.md](archive/todo-archive-phases-m0-m1.md)（M0 / M1）+ [archive/todo-archive-phases-m2-m55.md](archive/todo-archive-phases-m2-m55.md)（M2-M5.5）+ [§M8](todo-archive.md#m8-安全加固与容器执行完备已归档)（M8 / T801-T806，2026-08-19 归档迁出至 todo-archive.md 主窗口）
>
> **活跃 backlog 候选**（按 backlog.md 顺序追踪，不在 todo.md 重复展开）：**P2 [C28](backlog.md)** 凭据加密存储章节（T912-3 联动） / **[branches 阈值恢复 80% 冲刺](backlog.md)**（M10 启动条件已满足：M10 全部 commit，cgroup.ts 81.94% 已推高 / network-audit T1002 81.96% 已推高）；**P3 [C30 / C36 / C37 / D1-D3 / D8 / T701-e2e / C33 / SAML / B1-B2 / T905 / C21-C24 / C34 / T705 / T703](backlog.md)** 远期登记随真实需求触发；**新增 [T1005](backlog.md)** sandbox 路由接线（schema 扩展 + orchestrator 分支，quick-start 已标注待 T1005 落地）
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
