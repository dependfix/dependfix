# 当前阶段待办

> **范围约定**：本文件**仅**登记当前阶段活跃待办——已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)；已知边界与 known-issue 登记于对应阶段归档段或 backlog（**不在此处复述**）。

## 2026-08-21 平台 UX 反馈评估

> 用户 2026-08-21 实测反馈 10 项（环境事件表格排序 / schedules cron 预览 + 时区选择 / alerts 双箭头 + 视图切换 + 图表去重 / admin 防自降级 + 角色 i18n + i18n 单点声明）。已按规划规范 §3 逐条评估影响面 + 优先级 + 决策，**全部归档 backlog**，未启动即未上 todo。详见 [backlog.md §2026-08-21 平台 UX 反馈批次评估（C65 待启动）](backlog.md#2026-08-21-平台-ux-反馈批次评估c65-待启动)。
>
> **拆分方案**（4 个子批次，按 §1.1 ≤ 5-6 项硬上限）：
>
> - **C65-A 用户管理安全 + 角色 i18n**（P1，含 #7 admin 防自降级 + #9 角色 i18n）—— 可立即启动
> - **C65-B i18n 单点声明治理**（P2，#10）—— 启动条件待用户确认
> - **C65-C schedules 增强**（P2，含 #2 cron 预览 + #3 时区选择框）—— 启动条件待用户确认
> - **C65-D 平台表格 / 视图增强**（P2，含 #1 env-events sortable + #4 alerts 双箭头 + #5 alerts 视图切换 + #6 alerts 图表去重）—— 启动条件待用户确认
>
> 单 admin 不得降级（#8）登记为 backlog 远期，与 #7 同主题但需后端事务级校验，独立批次。
>
> **下一步**：用户确认启动某子批次 → 该子批次单独上 todo.md 活跃段，按 §1.1 任务粒度约束保持原子提交。

## 待人工验收（真实环境，随可用性推进）

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

实施记录：[todo-archive.md §T912](todo-archive.md#t912-smtp-邮件发送器主体收口t9123--c28-联动)；[backlog.md §M7.2](backlog.md#m72-平台能力深化)

### T704 async 定时触发

定时任务真实环境验证：

- BullMQ upsertJobScheduler 短间隔 every 集成测试（需 Redis >= 5）
- Schedule CRUD e2e 补覆盖（当前单测 44 例，e2e 未覆盖）

实施记录：[backlog.md §M7.2](backlog.md#m72-平台能力深化)

### 发布管线收尾（P3）

- `release:auto-version` 完整流程待 schedule 启用后首个 cron 裁决
- main 副作用路径测试观察项

实施记录：[backlog.md §M7.2](backlog.md#m72-平台能力深化)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md)（主窗口保留 4 段） |
| 早期阶段分片 | [archive/](archive/)（M0-M11 详细） |
| 未排期 / 延期 / 远期 | [backlog.md](backlog.md)（T705/T703/C30 延期 + C33/C36/C37/D1-D8/SAML/B1-B2/T905/C21-C24/C34/T701-e2e 远期） |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md)（M0-M11 全部归档） |
| 已知边界 / known-issue | 各阶段归档段（如 [todo-archive.md §2026-08-20 e2e 修复批次 / C64-3](todo-archive.md#2026-08-20-e2e-修复批次c62--c63--c64--chore) PrimeVue hydration）或 backlog 顶部"未完成项目（backlog 仍活跃）" |