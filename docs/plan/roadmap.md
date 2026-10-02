# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | Monorepo 骨架 + 配置模型 + 工具链策略 + 告警模型 | P0 | 已完成（[archive/todo-archive-phases-m0-m1.md §M0](archive/todo-archive-phases-m0-m1.md#m0-基线收敛已归档)） |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 已完成（[archive/todo-archive-phases-m0-m1.md §M1](archive/todo-archive-phases-m0-m1.md#m1-mvp-单仓库自动修复已归档)） |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR + AI Token + Prompt 防护 | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)） |
| M3: Code Scanning 扩展 | 规则分级 + 可模板化修复 + 建议输出 | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M3](archive/todo-archive-phases-m2-m55.md#m3-code-scanning-扩展已归档)） |
| M4: 多仓库治理增强 | 自动发现 + 并发控制 + 报告归档 | P2 | 已完成（[archive/todo-archive-phases-m2-m55.md §M4](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强已归档)） |
| M4.5: 跨线升级显式授权 | `--allow-major-upgrade` 跨线告警显式授权自动升级 | P2 | 已完成（[archive/todo-archive-phases-m2-m55.md §M4.5](archive/todo-archive-phases-m2-m55.md#m45-跨线升级显式授权已归档)） |
| M4.6: Monorepo 成员级修复增强 | workspace 成员包直接依赖告警自动升级（T406 + T407） | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M4.6](archive/todo-archive-phases-m2-m55.md#m46-monorepo-成员级修复增强已归档)） |
| M5: AI Breaking Change 研判 | Changelog 采集 + LLM 研判 + 修复生成 + 质量门 + CLI 解耦 | P1 | 已完成（[archive/todo-archive-phases-m2-m55.md §M5](archive/todo-archive-phases-m2-m55.md#m5-ai-breaking-change-研判已归档)） |
| M5.5: Skill 编排（CLI 先行） | 产品 skill 分发 + npx skills 主通道 + MCP 后端扩展 | P2 | 已完成（[archive/todo-archive-phases-m2-m55.md §M5.5](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)） |
| M6: 最小平台 MVP | 仓库 + 凭据 + 仪表板 + MCP Server + Docker 部署 | P1 | 已完成（[archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)） |
| M7: 企业级平台增强 | M7.1 用户体系 + M7.2 平台能力深化 | P2 | 已归档（[archive/todo-archive-phases-m6-m7-t711.md §M7](archive/todo-archive-phases-m6-m7-t711.md)） |
| M8: 安全加固与容器执行完备 | 兑现沙箱安全治理决议 G2-G7 | P0-P2 | 已完成（[archive/todo-archive-phases-m6-m7-t711.md §M8](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)） |
| M9: i18n 基建同步 | 从 momei 同步 i18n 治理规范 + 审计脚本 | P2 | 已完成（[archive/todo-archive-phases-m11.md §M9](archive/todo-archive-phases-m11.md#m9-i18n-基建同步已归档)） |
| M10: 独立沙箱容器 C26 实施规划 | Docker rootless runtime + 应用层白名单代理 + cgroup v2 资源限制 | P1 | 已完成（[archive/todo-archive-phases-m10-c53-c59c61.md §M10](archive/todo-archive-phases-m10-c53-c59c61.md)） |
| M11: 业务可见性 + 沙箱落地 + 安全文档 | C53 闭环触发 + T1005 sandbox 路由 + C28 security.md + C-ENV-CHANGE-ALERT | P1 | 已完成（[archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)） |
| M12: 平台 UX 一致性 + i18n 治理 | 2026-08-21 用户实测反馈 10 项平台 UX/安全/i18n 问题 | P1-P2 | 已完成（[archive/todo-archive-phases-m12.md §M12](archive/todo-archive-phases-m12.md)） |
| M13: 治理 + UX 反馈 + 网络治理 + Code Scanning | 2026-08-25~26 用户实测反馈 + 网络治理 + Code Scanning 规则化 | P0-P2 | 已完成（[archive/todo-archive-phases-m13.md §M13](archive/todo-archive-phases-m13.md)） |
| M14: platform release 通道 + UX 反馈跟进 | apps/platform 第 6 个发布单元 + UX-R1 + neat-freak 治理 | P1 | 已完成（[archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)） |
| M15: 扫描历史详情侧栏增强（UX-R2） | 承接 M14.2 UX-R1 后的 RunDetailDialog | P1 | 已完成（[archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)） |
| M16: 平台可用性深化 | 把 apps/platform 从 demo 落地为实际可用项目 | P1 | 已完成（[archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)） |
| M17: 安全与可用性收口 | C38 encryptionKey + 服务端 API i18n + admin viewer role check | P1-P3 | 已完成（[archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)） |
| M18: 平台 GitHub App BYO App 模式 | PAT + GitHub App 二者并存 + 5 子阶段 + 治理批次 | P0-P3 | 已完成（[archive/todo-archive-phases-m18.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式m180m181m182m183m184m18x-全部已闭环--2026-08-30-归档)） |
| M19: 治理 + 能力扩展 + 测试补强 | 按类型平衡原则 5 项任务（技术债 + 能力 + 体验 + 测试） | P2-P3 | 已完成（[archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理--能力扩展--测试补强m191m192m193m194m195-全部已闭环--2026-08-31-归档)） |
| M20: ScanResult 数据模型重构 | per-alert 模型 + reconcile + API 简化 + UI + backfill | P2 | 已完成（[archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)） |
| M21: 治理收口 + 能力扩展 + 测试补强 | Code Scanning RG-W + M18.x 剩余风险 + B3 PR 自动合并 + T704 e2e | P3 | 已完成（[archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)） |
| M22: SQLite 数据保护防御加固 | 2026-09-01 dependfix.sqlite 数据清空事故 + 6 原子条目 | P0-P1 | 已完成（[archive/todo-archive-phases-m22.md §M22](archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)） |
| M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强 | M22.7+M22.8 根因 + C66 告警视图增强 | P1-P3 | 已完成（[archive/todo-archive-phases-m23.md §M23](archive/todo-archive-phases-m23.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)） |
| M24: PR Check MVP + 治理债 + 测试补强 + 用户体验 | PR Check 状态监测 MVP + M22.7+M22.8 残留根因 + C36 i18n | P1-P3 | 已完成（[todo-archive.md §M24](todo-archive.md#m24-pr-check-mvp--治理债--测试补强--用户体验m241m242m243m244m245-全部已闭环--2026-09-03-归档)） |
| M25: PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline + M24 follow-up 工具化 | C70 PrimeUI 降级 + C68 AI 研判基础层 + lint baseline + i18n-anchor-check + zod-helpers | P1-P3 | 已完成（[todo-archive.md §M25](todo-archive.md#m25-primeui-license-治理--平台-ai-研判集成--lint-baseline-治理--m24-follow-up-工具化m251m252am253m254-全部已闭环--2026-09-08-归档)） |
| M26: 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀 | C68 P1 应用层 + C67 + C69 P0 + primeicons 降级 + baseline 22 warnings 治理 + e2e 适配 + 经验归档沉淀 | P1-P3 | 已完成（[todo-archive.md §M26](todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档)） |
| M27: 用户体验 + 治理优先 | M27.1 重复评估修正 + M27.2 W1 apps/platform stylelint + M27.3 W2 logger 补测 + M27.4 W4 container-executor 补测 + M27.5 ECONNRESET 候选 ① 诊断 | P1-P3 | 已完成（[todo-archive.md §M27](todo-archive.md#m27-用户体验--治理优先m271m272-w1m273-w2m274-w4m275-全部已闭环--2026-09-10-归档)） |
| M28: 治理债清理 + 能力扩展 | M28.1 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 + M28.2 C14 多 cs lint 性能 + M28.3 C15 B 类规则样本核对 + M28.4 C33 MCP P3 + M28.5 M22.8 follow-up ② | P2-P3 | 已完成（[todo-archive.md §M28](todo-archive.md)；2026-09-11 用户决策方案 M28-A + M28.1 重编号 + 完整 5 候选闭环 + M28.6 归档批次落地，commits 已推送 origin/master） |
| M29: 修复交付链路正确性 + 能力扩展 | C73 git 配置污染隔离 + C75 验证链纳入 test + C77 override 复发防护 + C78 alerts 未启用/获取失败区分 + C71 pnpm 路径级 overrides + C72 批量导入 archived/disabled 过滤 + vite 漏洞插队 hotfix + C79 devEx 配置缺口 + C80-A CI 审计覆盖（M29.8/M29.9 为 M29.1 衍生） | P2-P3 | 已完成（已归档，2026-10-01 M34 归档批次预防性分片迁出至 [archive/todo-archive-phases-m29.md §M29](archive/todo-archive-phases-m29.md#m29-修复交付链路正确性--能力扩展m291m299-全部已闭环--2026-09-27-归档)） |
| M30: 治理债清理 + 迁移可行性验证 + 能力扩展 + 测试补强 | C87 跳过类审计退出码 + C86 max-lines 拆分 + C84 文档对齐 + C74 getCommitAuthor 接线（App 路径）+ db-restore 补测 + UI 组件库迁移可行性验证 V1-V3 | P2-P3 | 已完成（[archive/todo-archive-phases-m30.md §M30](archive/todo-archive-phases-m30.md#m30-治理债清理--迁移可行性验证--能力扩展--测试补强m301m306-全部已闭环--2026-09-28-归档)） |
| M31: apps/platform UI 组件库迁移（PrimeVue → caomei-ui） | B0 基线与双库并存接线 + B1a/B1b DataTable 迁移 + B2 表单/浮层切换 + B3 收尾卸载与回归 + C90 db-restore 补强 | P2-P3 | 已完成（[todo-archive.md §M31](todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)） |
| M32: 能力扩展优先 | C76 平台验证命令配置 + C85 目标仓库专属配置 + C89 Code Scanning 未启用区分 + C82 git 签名语义边界 + C92 视觉回归最小集 | P3 | 已完成（[todo-archive.md §M32](todo-archive.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档)） |
| M33: 治理债收口 + 测试基建扩展 | C91 review 检查点补挂 + 视觉回归 CI 转阻断 + M31 dependabot 死配置清理 + C93/C94 视觉回归覆盖扩展 + C80 观察期阻断语义 + M33.7 迁移入口 + M33.8–M33.10 UI 修复 + M33.11 存量漏洞治理 | P3 | 已完成（[todo-archive.md §M33](todo-archive.md#m33-治理债收口--测试基建扩展m331m3311-全部已闭环--2026-09-30-归档)；2026-09-30 归档） |
| M34: 治理与体验收口 + 组件库升级与巡检基建 | devEx `data/` 产物污染治理 + caomei-ui 0.5.0 升级（弹窗 Select 裁剪/层级） + 视觉回归灵敏度与弹窗覆盖 + 上游组件问题归因流程 + label 间距统一 + 字段堆叠口径复用化 + PrimeUI 文档同步 + C83 验证链失败基线 | P2-P3 | 已完成（[todo-archive.md §M34](todo-archive.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)；2026-10-01 归档） |
| M35: 批量运行终态兜底对账 + 进度可见性修复 | 周期兜底对账服务 + 写回逻辑收敛 + `finishedAt` 真实化 + sync 立即终结 + 前端口径修正 + 存量订正脚本 + 设计口径同步 | P2-P3 | 已完成（[todo-archive.md §M35](todo-archive.md#m35-批量运行终态兜底对账--进度可见性修复m351m356-全部已闭环--2026-10-02-归档)；2026-10-02 归档） |
| M36: 治理债清仓 + 可观测性与测试稳定性 | C81 孤立规划编号存量清理（分批）+ 文档陈旧状态清理 + BatchRun 写回竞态收敛 + 告警源可审计性判据 + api-i18n e2e 顺序偶发 + dependfix-platform 镜像体积治理 + pnpm overrides key 语义归一化 + Docker 首次启动数据库初始化与部署文档 | P1-P3 | 进行中（2026-10-02 用户决策方案 A 启动 + 同日追加 M36.6 / M36.7 / M36.8） |

> **本路线图定位**：按 [规划规范 §2.1](../standards/planning.md) 仅维护阶段概览（目标 / 优先级 / 状态）。详细实施记录 / commit 引用 / 关键决策 / 经验教训见对应归档段（详见下方"## 详细任务"索引）。

## M0: 基线收敛

Monorepo 骨架搭建、核心配置模型、工具链版本策略固定、标准化告警模型定义。已完成。

> 详细任务与完成记录见 [archive/todo-archive-phases-m0-m1.md §M0](archive/todo-archive-phases-m0-m1.md#m0-基线收敛已归档)

## M1: MVP 单仓库自动修复

跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取、过滤、修复、验证和报告的全链路闭环。

**交付物**:
- `dependfix` CLI —— 通过 `npx dependfix` 运行
- `@dependfix/core` —— 作为独立 npm 包发布
- 三条命令：`report`（报告）、`fix`（修复+验证）、`fix-and-pr`（参数预留）
- 本地文件变更，不推送不创建 PR

> 详细任务见 [archive/todo-archive-phases-m0-m1.md §M1](archive/todo-archive-phases-m0-m1.md#m1-mvp-单仓库自动修复已归档)

## M2: GitHub Action 接入

将 M1 能力接入 GitHub Actions，支持 `workflow_dispatch` + `schedule` 触发 + 报告 artifact + 修复分支/PR 创建。含用户自定义 AI Token + Prompt 注入防护。

> 详细任务见 [archive/todo-archive-phases-m2-m55.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)

## M3: Code Scanning 扩展

接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

> 详细任务见 [archive/todo-archive-phases-m2-m55.md §M3](archive/todo-archive-phases-m2-m55.md#m3-code-scanning-扩展已归档)

## M4: 多仓库治理增强

支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

> 详细任务见 [archive/todo-archive-phases-m2-m55.md §M4](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强已归档)

## M4.6: Monorepo 成员级修复增强

workspace 成员包直接依赖告警的自动修复：成员 manifest 升级能力（T406）+ 告警分流与 app 接线（T407）。

> 详细任务见 [archive/todo-archive-phases-m2-m55.md §M4.6](archive/todo-archive-phases-m2-m55.md#m46-monorepo-成员级修复增强已归档)

## M5: AI Breaking Change 研判

Changelog / Release Notes 采集 + 多 AI 提供商封装 + AI 研判（问题分类 + 修复方案 + 代码 patch）+ AI 输出安全校验与质量门 + CLI 解耦重构（平台化前置）。

> 详细任务见 [archive/todo-archive-phases-m2-m55.md §M5](archive/todo-archive-phases-m2-m55.md#m5-ai-breaking-change-研判已归档)

## M5.5: Skill 编排（CLI 先行）

将 dependfix 的自动化修复能力封装为可分发的 Agent Skill（`dependfix-remediator`），通过 CLI 直接调用，支持主流 agent 工具（Claude Code / GitHub Copilot / Cursor / OpenCode）接入；MCP 作为后续增强执行后端，与 CLI 后端并存。

> 详细任务见 [archive/todo-archive-phases-m2-m55.md §M5.5](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)（编号说明：M5.5 T506-T508 与已归档 M5 的 T506 重叠，以"阶段 + 编号"全称区分）

## M6: 最小平台 MVP

在 M5 完成后交付一个可独立部署的集中管理平台的最小可用版本：仓库管理 + 凭据管理 + 手动触发扫描 + 仪表板 + Docker Compose 部署。

> 详细任务见 [archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)

## M7: 企业级平台增强（已归档）

拆两个子阶段（2026-08-09 规划定稿）：

- **M7.1 认证与用户体系**（已归档 2026-08-10）：T701 RBAC + 用户管理 + 个人界面（三角色）+ T707 认证扩展（`AUTH_MODE` 互斥二选一）。设计文档：[platform-auth-users.md](../design/governance/platform-auth-users.md)（Review Gate Pass）。
- **M7.2 平台能力深化**（已归档 2026-08-12）：T702 BullMQ+Redis 任务队列 + T704 定时扫描与批量 + T708 国际化 i18n + T709 治理规范收敛 + T710 CI lint 清理 + T706 MCP 发布（`@dependfix/mcp@0.1.2`）；T705 生产级部署 + T703 跨平台 Git **已延期 2026-08-12**（用户指示，见 [backlog.md §延期 / 暂缓项](backlog.md#延期--暂缓项)）；T711 覆盖率冲刺已归档（四维 ≥ 80%）。

> 详细任务见 [archive/todo-archive-phases-m6-m7-t711.md §M7.1 + §M7.2](archive/todo-archive-phases-m6-m7-t711.md#m71-认证与用户体系已归档)

## M8: 安全加固与容器执行完备（已归档）

安全专项评估确认"dependfix 自身不得成为漏洞扩散工具"为核心原则（[沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md)），登记治理决议 G1-G7。

T801-T806 全部完成：C45 容器工具链补齐 + C41 验证命令单命令超时 + C42/C39 凭据权限面检查 + C43 供应链信号披露 + C40 外联审计日志 + C44 规范挂接 review 检查点。沙箱治理决议 G5（C26 独立沙箱容器）已激活为 M10 实施规划。

> 详细任务与验收见 [archive/todo-archive-phases-m6-m7-t711.md §M8](archive/todo-archive-phases-m6-m7-t711.md#m8-安全加固与容器执行完备已归档)

## M9: i18n 基建同步（已归档）

momei 已沉淀成熟的 i18n 治理体系（语言分级 / freshness 分层 / 缺词 blocker / 动态 key 白名单 / 重复文案审计 / vue-i18n 专项 lint），M9 同步基建铺路，翻译内容留后续阶段。

T901-T906 全部完成：规范同步 + 脚本同步（4 audit + 1 shared CLI）+ 脚本测试（75 例）+ npm scripts + `@intlify/eslint-plugin-vue-i18n` lint 接入 + CI 接入（test.yml 3 步）+ 文档收口。5 个原子 commit 合计 2556 行 inserts / 2539 行净增。

> 详细任务与验收见 [archive/todo-archive-phases-m11.md §M9](archive/todo-archive-phases-m11.md#m9-i18n-基建同步已归档)

## M10: 独立沙箱容器 C26 实施规划（已归档）

兑现沙箱治理决议 G5：Docker rootless runtime + 应用层白名单代理 + cgroup v2 资源限制 + Node 20 自动识别。`SandboxExecutor` 与 `ContainerExecutor` 并存；自托管 docker-compose 优先 / K8s+Helm 仅规划。

T1001-T1004 全部完成：Docker rootless runtime + RuntimeAdapter 抽象层 + 出站白名单拦截代理 + cgroup v2 资源限制 + 文档收口。共 13 commits。设计文档：[executor-sandbox.md §7](../design/governance/executor-sandbox.md#7-sandbox-执行器设计) + [sandbox-security-governance.md §5 G5 升级](../design/governance/sandbox-security-governance.md#5-治理决议与登记)。

> 详细任务与验收见 [archive/todo-archive-phases-m10-c53-c59c61.md §M10](archive/todo-archive-phases-m10-c53-c59c61.md)

## M11: 业务可见性 + 沙箱落地 + 安全文档（已完成 2026-08-20 归档）

由 C53 闭环触发启动的复合阶段，覆盖业务可见性（push + PR 闭环 + runUrl 兜底）、沙箱落地（T1005 路由接线）、安全文档（C28 + T912-3）、通知基建（C-ENV-CHANGE-ALERT）四类需求。22 commits 全部落地。

> 详细实施记录 / commit 引用 / 治理记录 / 关键决策 / 经验教训：见 [archive/todo-archive-phases-m11.md §M11 推进批次](archive/todo-archive-phases-m11.md#m11-推进批次业务可见性--沙箱落地--安全文档--通知基建)

## M12: 平台 UX 一致性 + i18n 治理（已完成 2026-08-21 归档）

承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题，按 ≤ 5-6 项硬上限拆 4 子批次（C65-A 用户管理安全 + 角色 i18n / C65-B i18n 单点声明治理 / C65-C schedules 增强 / C65-D 平台表格与视图增强）独立实施。19 commits 全部推送至 origin/master，branches coverage 80.02%（CI 阈值回归修复后），9 轮独立 Review Gate Pass。

**关键决策**：

- **C65-A3** 纵深防御模型 = 前端拦截 + 服务端强制（前端拦截 ≠ 服务端安全，devtools / 恶意客户端可绕过）；Nuxt server middleware 实现 5 端点拦截 + 双层防护
- **C65-B1** 双文件拆分根因（jiti vs Nuxt transform pipeline 运行时全局可见性差异，物理拆分承载运行时全局调用的配置与纯字面量导出配置）
- **C65-C1** 自实现预览（0 新增依赖，复用 cron-parser 已装的成熟 next()）；cronstrue 实测 unpackedSize 1.23MB（todo.md 估 ~10KB gzip 严重偏差）+ cronstrue-i18n 不存在于 npm registry，拒绝引入
- **C65-D3** TypeORM 1.x find options order 不支持嵌套路径 → 全部走 QueryBuilder（统一代码路径 + 行为等价）
- **C65-D4** 删除 vs 差异化决策：选删除（最简 + 与 dashboard 完全去重 + alerts 聚焦表格）

> 详细子任务清单 + commit 引用 + 实施记录 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m12.md](archive/todo-archive-phases-m12.md)（2026-08-28 M17 归档批次预防性分片迁出）

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已完成 2026-08-26 归档）

承接 M12 闭环后 backlog 治理前置 + 2026-08-25~26 用户实测反馈 5 项 UX 问题，按 ≤ 5-6 项硬上限 + 跨 packages+apps > 10 文件超阈值需拆分原则拆 4 子阶段独立闭环（M13.1 治理前置 + 平台 UX 反馈 / M13.2 网络治理 + 告警去重 / M13.3 Code Scanning 规则化 + CQL / M13.4 UX 反馈批次立刻做）+ T1310 platform release 通道同步推进。26 commits + 9 轮独立 Review Gate Pass + CI 阈值回归修复（branches 79.98% → 80.17%）。

**关键决策**：

- **T1301**：wisdom 蒸馏条目选择标准——保留高频复用 / 实战类 pattern / 项目 SOP，其余迁移至 standards
- **T1305**：候选方向 3（命令输出 URL 与真实外联区分）治本根因而非逐次新增白名单；候选方向 1/2 优先级降低

> 详细子任务清单 + commit 引用 + 实施记录 / 关键经验 / 待迁移经验：见 [archive/todo-archive-phases-m13.md](archive/todo-archive-phases-m13.md)（2026-08-30 M18 归档批次预防性分片迁出）

## M14: platform release 通道 + UX 反馈跟进（已完成 2026-08-26 归档）

承接 backlog UX-R1 扫描历史分页 + M13.4 T1403 follow-up + neat-freak 治理批次。5 子阶段 + dependabot major PR 4 个全部落地。

> 详细任务见 [archive/todo-archive-phases-m14-m15.md §M14](archive/todo-archive-phases-m14-m15.md#m14-platform-release-通道闭环--ux-反馈跟进m14123xy-全部已闭环)

## M15: 扫描历史详情侧栏增强 UX-R2（已完成 2026-08-26 归档）

承接 M14.2 UX-R1 后的 UX-R2 反馈：增强 alerts 去重视图 Sidebar 运行可辨识度 + 新增独立 `RunDetailDialog` 复用 `GET /api/runs/:id`。4 子任务全部独立闭环。

> 详细任务见 [archive/todo-archive-phases-m14-m15.md §M15](archive/todo-archive-phases-m14-m15.md#m15-扫描历史详情侧栏增强ux-r2已闭环)

## M16: 平台可用性深化

把 `apps/platform` 从 demo 落地为实际可用项目。5 项 UI/API/技术债痛点收敛（M16.1 UX-R3 `/scans` / M16.2 alerts 一键修复 / M16.3 C36 i18n / M16.4 PrimeVue hydration 缓解 / M16.5 T701-e2e 补强）。branches coverage 80.27% → 85.67%。

> 详细任务见 [archive/todo-archive-phases-m16-m17.md §M16](archive/todo-archive-phases-m16-m17.md#m16-平台可用性深化m161m162m163m164m165-全部已闭环--2026-08-28-归档)

## M17: 安全与可用性收口

承接 M16 闭环后 backlog 4 条目。6 子阶段独立闭环（M17.1 C38 encryptionKey / M17.2-4 C36 i18n 范围外 / M17.5 e2e helper / M17.6 better-auth admin viewer role check）。

> 详细任务见 [archive/todo-archive-phases-m16-m17.md §M17](archive/todo-archive-phases-m16-m17.md#m17-安全与可用性收口m171m172m173m174m175m176-全部已闭环--2026-08-28-归档)

## M18: 平台 GitHub App BYO App 模式

承接 M17 闭环后 backlog §C22 上收主条目（classic PAT `repo` scope 权限过大 + fine-grained PAT 流程繁琐）。PAT 与 GitHub App 二者并存。5 子阶段 + 1 治理批次全部闭环。

> 详细任务见 [archive/todo-archive-phases-m18.md §M18](archive/todo-archive-phases-m18.md#m18-平台-github-app-byo-app-模式m180m181m182m183m184m18x-全部已闭环--2026-08-30-归档)

## M19: 治理 + 能力扩展 + 测试补强

按"类型平衡"原则选取 5 项任务独立闭环（技术债 + 能力扩展 + 用户体验 + 测试覆盖）+ M19.x 收口（孤立编号清理）。5 atomic commits 全部 ahead=0，5 轮独立 Review Gate Pass。

> 详细任务见 [archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理--能力扩展--测试补强m191m192m193m194m195-全部已闭环--2026-08-31-归档)

## M20: ScanResult 数据模型重构

per-alert 模型 + reconcile + API 简化 + UI 调整 + backfill 脚本。5 子阶段全部闭环。

> 详细任务见 [archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)

## M21: 治理收口 + 能力扩展 + 测试补强

承接 M20 闭环后 backlog 候选池 + M18.x 治理剩余风险。4 子阶段独立闭环（M21.1 Code Scanning RG-W / M21.2 M18.x 剩余风险 / M21.4 B3 PR 自动合并 / M21.5 T704 async）。

> 详细任务见 [archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)

## M22: SQLite 数据保护防御加固

承接 2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故。事故暴露 5 条可加固设计风险。6 原子条目 + 1 沉淀批次独立闭环（M22 沉淀 / M22.1 SQLite 自动备份 / M22.2 db-restore / M22.3 db-doctor / M22.4 TypeORM synchronize opt-in / M22.5 migrationsRun opt-in / M22.6 e2e/fixtures 双门控）。

> 详细任务见 [archive/todo-archive-phases-m22.md §M22](archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)

## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强

承接 M22 闭环 + M22.7+M22.8 hotfix 衍生根因治理债 + C66 告警视图增强 + 测试基建清理。5 原子条目独立闭环（M23.0 治理收敛 / M23.1 M22.7 根因 / M23.2 M22.8 根因 / M23.3 C66 告警视图 / M23.4 测试补强）。

> 详细任务见 [archive/todo-archive-phases-m23.md §M23](archive/todo-archive-phases-m23.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)

## M24: PR Check MVP + 治理债 + 测试补强 + 用户体验

承接 M23 闭环后 backlog 候选池，方案 B 能力突破优先。5 原子条目独立闭环（M24.1 PR Check MVP / M24.2 M22.7+M22.8 残留根因 / M24.3 cron-preview / M24.4 M18.x+Code Scanning / M24.5 C36 i18n）。

> 详细任务见 [todo-archive.md §M24](todo-archive.md#m24-pr-check-mvp--治理债--测试补强--用户体验m241m242m243m244m245-全部已闭环--2026-09-03-归档) + [archive/todo-archive-phases-m24.md 完整实施记录](archive/todo-archive-phases-m24.md)

## M25: PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline 治理 + M24 follow-up 工具化（已完成 2026-09-08 归档）

方案 A 治理优先 + 能力扩展 + 测试补强。4 原子条目独立闭环（M25.1 PrimeUI 主题库 License 治理 / M25.2a 平台 AI 研判集成基础层 / M25.3 apps/platform baseline 16 lint errors 清理 / M25.4 M24 follow-up 工具化）。17 commits / ~1821 行净增；ahead=17 全部推送完成。

> 详细任务见 [todo-archive.md §M25](todo-archive.md#m25-primeui-license-治理--平台-ai-研判集成--lint-baseline-治理--m24-follow-up-工具化m251m252am253m254-全部已闭环--2026-09-08-归档) + [archive/todo-archive-phases-m25.md 完整实施记录](archive/todo-archive-phases-m25.md)

## M26: 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀（2026-09-08 用户决策方案 A + M26.4 拆分 + M26.4c e2e 适配 / 2026-09-10 已闭环 + 归档）

承接 M25.2b（M25 follow-up #1）+ C67（批量导入 Resource owner 化）+ C69 P0（文档站 + 包 README 多语言 en-US）+ M25 follow-up #3（primeicons 降级）+ M25 follow-up #4（baseline 9 warnings 治理）+ M25 follow-up #5（经验归档沉淀）。**7 原子条目独立闭环**（2026-09-08 决策时为 6 原子，2026-09-10 增 M26.4c e2e 适配后为 7 原子）覆盖 🚀 2 + 🛡️ 3 + 🧪 2 + 📚 2 + UX 隐含在 M26.1/M26.2/M26.3，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md)。

- **M26.1** [P1 🚀] M25.2b 应用层（10 commits / ~1130 行 / standard depth）—— C68 P1 增强落地（4 API 端点 + UI + i18n + docs），承接 M25.2a 基础层（含 5 项 re-audit 修复：补全 GET 端点 / 嵌套对象恢复 / i18n 结构 / README 恢复 / YAML 半角冒号）
- **M26.2** [P2 🚀] C67 批量导入 Resource owner 化（4 commits / ~510 行 / standard depth）—— 与 MCP `discover_repos` `owner: string[]` 对齐
- **M26.3** [P2 📚] C69 文档站 + 包 README 多语言 en-US P0（7 commits / ~860 行 / standard depth）—— VitePress 脚手架 + 8 个 en-US md 文件 + 包 README 双语化 + check:readme-i18n 同步门禁 + CI workflow 步骤
- **M26.4a** [P3 🛡️] primeicons@8.x → 7.x 降级（1 commit / quick depth）—— 消除最后 1 个 PrimeUI License 包
- **M26.4b** [P3 🧪] baseline 22 warnings 治理（4 commits / quick depth）—— 22 → 0 warnings 全部治本（不扩展 max-warnings 临时方案；含 mailer.test.ts throw 形式收口）
- **M26.4c** [P3 🧪] e2e 测试适配 M26.1/M26.2 行为变更（5 commits / quick depth）—— 仅测试侧适配，不改生产代码（admin 5→6 张卡片 / credentials-api fine-grained-pat 补 ownerLogin / credentials-crud 选 classic-pat 避必填 / repos-api 改测 include=bogus）
- **M26.5** [P2 📚] 经验归档沉淀（wisdom 蒸馏 + experience-archive §五十八-§六十二）（1 commit / quick depth）—— M25 4 个治理实践 + wisdom 蒸馏活跃条目 17 → 7 ≤ 15 阈值已合规
- **配套治理**（8 commits）：pre-commit identity guard（husky）+ git config guard 说明 + lint-staged 配置 + stylelint 配置（apps/platform）+ README 检查脚本重构 + M26.4 docs 闭环 + M26 ahead commits 实证 + chore(deps) bump
- **CI Coverage 修复**（1 commit）—— `a4a5680` fix(ci): 补齐 check-readme-i18n 单测恢复 branches 80% coverage gate（PDTFC+ 闭环：脚本加 isDirectExecution 守卫 + 导出 5 个核心函数 + 415 行单测 28 cases / 全量 Branches 80.06% ✓）

**关键决策 D1-D4**：
- **D1**：7 原子条目按 §1.1 任务粒度约束（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则
- **D2**：M26.4 拆分为 M26.4a（primeicons 降级）+ M26.4b（baseline 22 warnings）—— 不相干内容不合并（用户决策 2026-09-08）
- **D3**：M26.3 C69 仅落地 P0（5 commits），P1 增强留 M27+ —— 避免一次性大改动
- **D4**：M26.5 双轨制（wisdom 蒸馏 + experience-archive §五十八-§六十二）—— 覆盖 M25 沉淀的 2 条新 wisdom + 25 commits 文档治理批次新增 pattern

**ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **0**（M26 全部 36 commits 已推 origin/master / 2026-09-10 实测）

**总投入**：**23 atomic commits 实施 + 13 配套 commits（re-audit 修复 + docs 收口 + 治理补丁 + CI Coverage 修复）= 36 commits**（ahead=0 全部已推送 origin/master）

> 详细任务见 [todo-archive.md §M26](todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档) + [archive/todo-archive-phases-m26.md](archive/todo-archive-phases-m26.md)（完整实施记录 7 原子条目 × 23 commits + 配套 13 commits = 36 commits / ~3240 行净增）

## M27: 用户体验 + 治理优先（2026-09-10 用户决策修订方案 B-1 + 2026-09-10 M27.1 重复评估修正 / 2026-09-10 已闭环 + 归档）

承接 M26 完整闭环后 backlog §短期候选 + M22.7/M22.8 根因 follow-up + M27 启动决策时重复评估教训（D2 修正）。**5 原子条目独立闭环**（2026-09-10 用户决策修订方案 B-1：UX + 治理优先），覆盖 🚀 0 + 🛡️ 2 + 🧪 2 + 📚 教训治理 1，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md)。

- **M27.1** [P2 📚 教训治理] C66 告警视图增强 重复评估修正（1 docs commit / standard depth）—— M23.3 + M16.2 已实施 C66-C + C66-D，本批无新增代码 commit，仅 1 docs(plan+governance) 修订 todo.md + backlog.md + planning.md + ai-collaboration.md + experience-archive §六十四 + wisdom.md（M27.1 重复评估教训）
- **M27.2 W1** [P2 🛡️ devEx 治理] apps/platform 增配 stylelint + lint 系列 scripts（2 commits / quick depth）—— apps/platform/package.json devDeps 加 stylelint@17.15.0 + stylelint-config-cmyr@1.0.0 + postcss + 5 条 scripts + stylelint.config.js extends cmyr + .stylelintignore + 根 lint:md/lint:md:check 路径补 apps/**/*.md + 根 lint-staged 加 *.{css,scss,vue} 钩子 + 修复 stylelint baseline 28 个 --fix + 6 个手工修复
- **M27.3 W2** [P2 🧪 测试治理] logger.ts 26 branches 100% 未覆盖补单测（1 commit / quick depth）—— apps/platform/server/utils/logger.ts 重构（isDirectExecution 守卫 + 导出核心函数）+ 新增 logger.test.ts 覆盖 winston/fs/axiom mock 副作用
- **M27.4 W4** [P3 🧪 测试治理] container-executor.ts 35.2% branches 覆盖补测（1 commit / quick depth）—— apps/platform/server/services/executor/container-executor.test.ts 新增 32 cases + 23 既有迁移 = 55 cases 全覆盖
- **M27.5** [P1 🛡️ 治理] M22.7 根因 ① better-auth 1.7 transaction 关闭时序（2 commits / standard depth）—— apps/platform/server/database/typeorm-adapter.ts 添加 [auth-trace] tx begin / callback-resolve / callback-throw 日志（E2E_TEST=true / AUTH_TRACE=1 双开关）+ audit 关闭 follow-up（本地无法稳定复现 ECONNRESET，CI 偶发）
- **M27 启动相关 docs 收口**（3 commits）：todo.md 清理为最小化骨架 + backlog.md 清理已闭环条目 + 归档 M26 阶段并预防性分片迁出 M19-M21
- **总投入**：**8 atomic commits 实施 + 3 docs 收口 commits = 11 commits**（commits 已推送 origin/master）

**关键决策 D1-D5**：
- **D1**：按 §1.1 任务粒度约束（每原子 < 5 commits / < 800 行推荐粒度，< 10 文件 / < 800 行硬阈值）+ §1.1 L12 类型平衡原则选 5 原子
- **D2**（修正）：M27.1 重复评估错误归正 —— todo.md §M27 阶段启动 commit `0ddd4e2` 决策 D2 错误地把 C66-C / C66-D 归类为"未落地"，修订为 1 docs commit 修正状态
- **D3**：W1 / W2 / W4 均为 quick depth（单 commit 模式）；M22.7 根因排查为 P1 优先（剩余 ECONNRESET 偶发根因）
- **D4**：M22 neat-freak 收敛已 M23.0 G1 闭环（不在 M27 复用）；M22.7 根因 follow-up 中 ② Nitro h3 async generator 已 2026-09-03 M24.2 commit `bbb8f30` 判定非根因 + ④ fixtures API 节流已 M24.2 登记 follow-up；M22.7 follow-up 候选 ① better-auth transaction 关闭时序 已 M27.5 commit `b252f93` 落地诊断基础设施（`AUTH_TRACE=1` 开关），等 CI 复现
- **D5**（新增）：M27 重复评估教训治理 —— 修订 planning.md §3.4「决策前置交叉核验」硬要求 + ai-collaboration.md §1.7「阶段启动重复评估自检」流程 + backlog.md C66 5 子任务现状明确标注 + experience-archive §六十四 完整教训 + wisdom.md governance check point「阶段启动必须对照 todo-archive.md 最近 3 个阶段表格 + commit history + 实际代码状态三重交叉核验」

**ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **0**（M27 全部 11 commits 已 ahead=0 推送 origin/master；2026-09-10 实测；session 元数据 ahead=17 stale 已 2026-09-11 同步修正）

> 详细任务见 [todo-archive.md §M27](todo-archive.md#m27-用户体验--治理优先m271m272-w1m273-w2m274-w4m275-全部已闭环--2026-09-10-归档)（指针段 + 关键 commit 实证模式，与 M26 段同源策略；完整实施记录通过 `git log` 关键 commit 链查）

---

## M28: 治理债清理 + 能力扩展（2026-09-11 用户决策方案 M28-A + M28.1 重编号 / M28.6 归档已落地）

承接 M27 完整闭环 + D 阶段 backlog 治理债清理 + A 阶段真实性审查 Pass（0 blocker / 2 warning / 2 suggest）+ 用户明确授权方案 M28-A + M28.1 重编号启动 M28 阶段。**5 候选全部落地闭环**（11 commits 已推送 origin/master）。覆盖 📚 1 + 🛡️ 3 + 🚀 1，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)。

- **M28.1**（重编号）[P3 📚 治理] backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 —— ✅ 已闭环（commit `1a75068`）：§4.4 第 11 条新增"§已知边界段部分闭环处理指引"（治本 M27.1 教训复发）+ backlog.md §已知边界 M22.7/M22.8 follow-up stale 同步 + wisdom 教训追加 session 私有
- **M28.2** [P3 🛡️ 技术债] C14 多 cs 告警逐告警全项目 lint 性能 —— ✅ 已闭环（commit `395ee29` + `eaaa997`）：vitest bench API N=10/50/100 baseline（实测 96x 性能差距证明顺序 spawn 瓶颈）+ 批处理优化（batchSize=10 折中方案，提速 ~10x）
- **M28.3** [P2 🛡️ 技术债] C15 B 类规则真实仓库样本核对 —— ⚠️ 第一阶段已闭环（commit `99302b5`）：sample-collector.mjs 采集脚本 + 报告模板 + 32 种子仓库跨 5 语言 fixture 占位（实际 GitHub API 采集合后续 CI/staging 环境）
- **M28.4** [P3 🚀 能力扩展] C33 MCP P3（pnpm-audit 本地 tool + RunResult 字段对齐）—— ✅ 已闭环（commit `9207481` + `5cf2d22`）：pnpm_audit MCP tool 新增（MCP 7 tool → 8 tool）+ runScan 返回结构 RunResult 对齐 5 字段（startedAt / finishedAt / config / alerts / actions）+ 现有 8 字段保留向后兼容
- **M28.5** [P3 🛡️ 治本] M22.8 follow-up ② better-auth 中间件 Set-Cookie 路径扫描 —— ✅ 治本验证通过（commit `d7289df`）：set-cookie-trace.mjs 静态扫描实证 better-auth 中间件对非 `/api/auth/*` 端点不会主动设置 Set-Cookie + 项目代码无显式 setCookie 调用 + M22.8 follow-up ② 建议关闭

**关键决策 D1-D6**（2026-09-11 用户决策 + M28 完整闭环后）：

- **D1**：方案 M28-A 类型平衡原则（5 候选 = 📚 1 + 🛡️ 3 + 🚀 1）—— 按 §1.1 L12 推荐粒度（5-6 原子条目硬上限）；UX / 测试覆盖缺口真实存在显式标注
- **D2**：M28.1 重编号为 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 —— **优先治本 §4.4 第 11 条结构性缺陷**，避免 M27.1 教训复发
- **D3**：backlog.md 治理债清理 D 阶段已落地 —— W1 / C9 / C13 / C36 已闭环条目整段/行删除 + §已知边界 M22.7/M22.8 follow-up stale 同步 + session 元数据 ahead=17 → 0 同步
- **D4**（M28.4 诚实修订）：`packages/mcp/src/tools/errors.ts` 已 M26.x 阶段落地（`ToolError` + `requireToken()` + `toToolError()` 双 helper），本任务不再做错误包装 helper；仅做未落地部分：pnpm-audit 本地 tool + RunResult 5 字段对齐
- **D5**（§3.4 五步流程完整执行）：M28.2-M28.5 P 阶段 §3.4 五步流程核验全部 0 项重复评估 + M28.4 部分已落地修订 todo.md §M28.4 验收标准 + 执行顺序建议按"用户决策方案"实际推进
- **D6**（M28 完整闭环）：5 候选共 11 commits（含 M28 启动 2 + 治理债清理 3 + M28 完整闭环 6）—— M28.6 归档批次落地指针模式

**类型平衡复核**：

- 🛡️ 技术债 / 治本：2 项（M28.2 / M28.5）—— ✅ 满足
- 🚀 能力扩展：1 项（M28.4 C33 MCP）—— ✅ 满足
- 🛡️ 技术债：1 项（M28.3 C15）—— ✅ 满足
- 📚 治理：1 项（M28.1 重编号）—— ✅ 满足
- 🎨 用户体验：**0 项** —— ❌ 缺口（C36 / C37 均已闭环或前置依赖）
- 🧪 测试覆盖：**0 项** —— ❌ 缺口（db-restore S-1/S-2 恢复条件不明确）

**ahead commits 实证**：M28 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 实测；按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 未经用户明确要求不得执行 `git push`）

- **M28 完整闭环 commits 关联表**（按提交顺序）：

 | 候选 / 类别 | | commit | subject |
 |:---|:---|:---|:---|
 | M28 启动 | | `1e68948` | docs(plan): M28 启动决策落地 todo.md + roadmap.md §M28 + §M27 D4 stale 修正 |
 | M28 评估 | | `a4abb71` | docs(plan): M28.2-M28.5 P 阶段评估修订 todo.md §M28.4 验收标准 + 类型平衡 + 执行顺序 |
 | backlog 清理 | | `608bcac` | docs(plan): backlog.md 治理债清理 + M22.7/M22.8 follow-up stale 同步 |
 | 跨文档同步 | | `f5be990` | docs(plan): 跨文档 stale 同步（todo-archive.md §M22.7/§M22.8 + archive/index.md 健康窗口 + planning.md §4.4 第 11 条 C36 引用） |
 | M28.1 | | `1a75068` | docs(standards): planning.md §4.4 第 11 条规则强化（§已知边界段部分闭环处理指引） |
 | M28.5 | | `d7289df` | docs(platform): better-auth 中间件 Set-Cookie 路径扫描脚本 + 报告 |
 | M28.2 benchmark | | `395ee29` | test(engine): verification-runner 多 cs 告警性能基准基线 |
 | M28.2 优化 | | `eaaa997` | fix(engine): runCodeScanningFixes 批处理 + 测试覆盖（M28.2 优化） |
 | M28.3 | | `99302b5` | feat(engine): Code Scanning 真实仓库样本采集脚本 + 报告模板（M28.3 / C15） |
 | M28.4 tool | | `9207481` | feat(mcp): 新增 pnpm_audit 本地回退数据源 tool |
 | M28.4 对齐 | | `5cf2d22` | feat(mcp): runScan 返回结构 RunResult 对齐 5 字段 |

> 详细任务见 [todo-archive.md §M28](todo-archive.md)（指针段模式 + 关键决策 D1-D6 + commits 关联表）+ [backlog.md](backlog.md)（M28 归档批次同步清理后健康窗口）

---

## M29: 修复交付链路正确性 + 能力扩展（2026-09-21 用户决策方案 M29-B + vite 漏洞插队项并入 / 2026-09-27 完整归档）

承接 M28 完整闭环后 backlog 候选池。2026-09-21 规划文档归档批次 + 用户实测反馈（rss-impact-server PR #1095 / better-bytes 403）产出 6 个「评估完成待上收」候选（C71 / C72 / C73 / C75 / C77 / C78），用户明确授权方案 M29-B 启动 + vite 漏洞插队项并入。**6 核心候选 + 1 插队 hotfix + 2 衍生小条目**（M29.8 / M29.9 由 M29.1 的 D / A 阶段发现，经用户 2026-09-21 授权从 backlog 上收），覆盖 🛡️ 4 + 🚀 2 + 🎨 1 + 🛠️ 2，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)（UX 1 项低于建议值 2，显式标注缺口）。

- **M29.1** [P2 🛡️ 插队 hotfix] docs 依赖链 vite 漏洞治理（1 high + 2 moderate，全部落在 `docs>vitepress>vite`）—— §3.1 例外清单第 2 类
- **M29.2** [P2 🛡️ 治本] C73 隔离宿主 git 全局配置对自动 commit 的污染（`commit.gpgsign`）
- **M29.3** [P2 🛡️ 治本] C75 验证命令链纳入 test
- **M29.4** [P2 🛡️ 治本] C77 override 曾被人工移除的复发防护
- **M29.5** [P2 🚀 能力扩展] C78 区分 Dependabot alerts「确实未启用」与「获取失败」
- **M29.6** [P2 🚀 能力扩展] C71 pnpm overrides 路径级覆盖（`parent>child`）支持
- **M29.7** [P3 🎨 用户体验] C72 批量导入默认过滤 archived/disabled 仓库
- **M29.8** [P3 🛠️ devEx] C79 ESLint 未忽略 VitePress 生成物（`docs/.vitepress/cache`）—— M29.1 衍生
- **M29.9** [P3 🛠️ CI 治理] C80-A devDeps 链漏洞可见性（去 `--prod`）+ 失效引用修正 —— M29.1 衍生

**关键决策 D1-D5**（2026-09-21 用户决策 + 2026-09-27 归档收口）：

- **D1**：方案 M29-B（能力扩展加码）—— 6 核心候选 = 🛡️ 3（C73 / C75 / C77）+ 🚀 2（C78 / C71）+ 🎨 1（C72）；相较方案 A（C74 换 C71）保留 C71 作为跨 core + engine + platform 三层能力扩展
- **D2**：vite 漏洞并入 M29 作 M29.1（§3.1 例外清单第 2 类插队项）—— 体积 1-2 commits，不参与 §1.1「核心任务 5-6 项」容量竞争
- **D3**：ahead commits 不推送 —— 按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 等待用户主动推送
- **D4**：全部 6 候选经 P 阶段 §3.4 三重交叉核验（todo-archive 表格 / git log / 代码侧 anchor）实测 0 命中，**0 项重复评估**（M27.1 教训防护）
- **D5**（新增）：M29.1 衍生项上收 —— M29.8（C79 devEx 配置缺口）+ M29.9（C80-A CI 审计覆盖）经用户「评估影响后直接修复」授权上收；C80 剩余「阻断语义」决策留在 backlog

**类型平衡复核**：

- 🛡️ 技术债 / 治本：3 项（M29.2 / M29.3 / M29.4）+ 插队 1 项（M29.1）+ 衍生 2 项（M29.8 / M29.9）—— ✅ 满足
- 🚀 能力扩展：2 项（M29.5 C78 / M29.6 C71）—— ✅ 满足
- 🎨 用户体验：1 项（M29.7 C72）—— ⚠️ 低于建议值 2
- 🛠️ devEx / CI 治理：2 项（M29.8 / M29.9）—— ✅ 衍生项补充
- 🧪 测试覆盖：0 项独立条目 —— ❌ 缺口（各条目交付物内含定向测试补强）

**ahead commits 实证**：M29 全部 35 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 实测 = 0）

> 详细任务见 [archive/todo-archive-phases-m29.md §M29](archive/todo-archive-phases-m29.md#m29-修复交付链路正确性--能力扩展m291m299-全部已闭环--2026-09-27-归档)（2026-10-01 M34 归档批次预防性分片迁出）

---

## M30: 治理债清理 + 迁移可行性验证 + 能力扩展 + 测试补强（2026-09-27 启动 / 2026-09-28 已闭环 + 归档）

承接 M29 完整闭环后遗留治理债（退出码 / 文件行数 / 文档对齐）+ UI 组件库迁移可行性验证 + GitHub App 身份接线 + db-restore 测试补强。2026-09-27 决策启动，**6 原子条目全部闭环**（M30.1-M30.6），覆盖 🛡️ 2 + 🚀 1 + 📚 1 + 🧪 1 + 🔍 1，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)（UX 0 项独立条目，显式标注缺口）。

- **M30.1** [P2 🛡️ 治本] C87 跳过类审计条目退出码修正（`41a13ab`）
- **M30.2** [P3 🛡️ 治本] C86 `repo-fix.ts` 行数拆分（`6923fdc`）
- **M30.3** [P3 📚 治理] C84 AI 质量门文档描述与实际验证链对齐（`21bf8bb`）
- **M30.4** [P2 🚀 能力扩展] C74 接线 `getCommitAuthor()`（仅 App 路径，`61acfae`）
- **M30.5** [P3 🧪 测试补强] db-restore 审计未采纳项补测（`80dff3f`；**已闭环**——2 分支 ESM mock 受限部分由 M31.6 以真实故障注入 + 注入点补齐）
- **M30.6** [P3 🔍 可行性验证] 迁移前可行性验证 V1-V3（`5eedcad` + `7be5b93`；**全绿**，已由 M31 承接）
- **衍生治理批次**（6 commits）：`124078a` vue-demi allowBuilds / `644f9f0` tsdown dts 入口错位 / `9226ddd` + `207a806` max-lines 治理 / `7458973` lint 清理 / `32e3a8b` 已知边界登记

**关键决策 D1-D4**：

- **D1**：M30.6 为前置阻塞项——V1-V3 全绿才可启动 M31 正式迁移
- **D2**：M30.4 仅 App 路径接线，PAT 路径保持 M18.0 兼容性零变化
- **D3**：M30.5 遇 ESM mock 受限——两分支 `it.skip` + TODO 登记，残留转 backlog C90
- **D4**：M30.6 V2 主色实底对比度——`--caomei-color-primary-solid` 实施期需覆盖为 `#0f766e`（teal-700）达 AA 4.5:1

**ahead commits 实证**：M30 全部 commits 已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）

> 详细任务见 [archive/todo-archive-phases-m30.md §M30](archive/todo-archive-phases-m30.md#m30-治理债清理--迁移可行性验证--能力扩展--测试补强m301m306-全部已闭环--2026-09-28-归档)

---

## M31: apps/platform UI 组件库迁移（PrimeVue → caomei-ui）（2026-09-28 用户决策方案 B / 2026-09-29 已闭环 + 归档）

承接 M30.6 V1-V3 可行性验证全绿（caomei-ui 0.3.0 关键路径能力已由库侧闭环），2026-09-28 用户决策方案 B 启动 M31 正式迁移阶段。**6 原子条目**：迁移主线 5 项（B0→B3 串行）+ 类型平衡补强 1 项，覆盖 🎨 3 + 🛡️ 2 + 🧪 1（🚀 / 📚 无独立条目，显式标注缺口）。

- **M31.1** [P2 🛡️] B0 迁移基线与双库并存接线（`caomei-ui/nuxt` + `--caomei-*` token 覆盖含主色实底 teal-700 + 视觉基线）
- **M31.2** [P2 🎨] B1a DataTable 核心页迁移（alerts 行分组/折叠/多列排序 + batch-runs 行展开 + e2e）
- **M31.3** [P2 🎨] B1b 其余表页全量迁移（原计划 pr-checks / scans / repos / index；实际按用户裁定扩为**全部剩余表页与表子组件**，13 vue / 11 e2e）
- **M31.4** [P2 🎨] B2 表单 / 浮层 / 导航组件切换 + i18n / Toast / Confirm 接线
- **M31.5** [P2 🛡️] ✅ B3 收尾：卸载 5 个 PrimeVue 依赖 + `rg "primevue|--p-|\.p-"` 归零 + e2e 全通 + 包体对比 + 文档同步（2026-09-29 完成；client gzip −59.8%）
- **M31.6** [P3 🧪] ✅ C90 db-restore ESM mock 受限失败分支补测（2026-09-29 完成；两分支以真实文件系统故障注入 + 自检注入点补齐，`it.skip` 清零）

**关键决策 D1-D3**（2026-09-28 用户裁定）：

- **D1**：方案 B（迁移主线 + C90 补强）—— 迁移为阶段主线，追加 1 项测试补强平衡类型
- **D2**：`--caomei-color-primary-solid` 覆盖为 `#0f766e`（teal-700）达 WCAG AA 4.5:1
- **D3**：caomei-ui 精确锁定 `0.3.0`，避免 0.x API 漂移

> 详细任务见 [todo-archive.md §M31](todo-archive.md#m31-appsplatform-ui-组件库迁移primevue--caomei-ui-m311m316-全部已闭环--2026-09-29-归档)（6 原子条目摘要 + 关键决策 + 迁移期实证索引）；评估依据见 [caomei-ui-migration.md](../design/governance/caomei-ui-migration.md)

---

## M32: 能力扩展优先（2026-09-29 用户决策方案 B / 2026-09-30 已闭环 + 归档）

承接 M31 完整闭环归档后的 backlog 候选池。2026-09-29 用户决策方案 B（能力扩展优先），从「评估完成待上收」候选中上收 5 项。**5 原子条目**覆盖 🚀 3 + 🛡️ 1 + 🧪 1（🎨 纯 UX 无独立条目，缺口显式标注，与 M28-M31 同型）。

- **M32.1** [P3 🚀 能力扩展] ✅ C76 平台侧暴露验证命令配置（每仓库 `verifyCommands` 字段 + 前缀感知 migration + 写入链路审计留痕 + 仓库表单 UI + e2e；2026-09-29 完成）
- **M32.2** [P3 🚀 能力扩展] ✅ C85 目标仓库专属配置 `.github/dependfix.yml`（本地检出读取 + 中央配置优先合并 + 降级矩阵；2026-09-30 完成）
- **M32.3** [P3 🚀 能力扩展] ✅ C89 Code Scanning / Code Quality「未启用」与「获取失败」区分（403 判定集中在共用映射层 + 源感知文案；2026-09-29 完成）
- **M32.4** [P3 🛡️ 技术债] ✅ C82 git 签名语义边界（4 处 push 调用点隔离 + 不提供签名 opt-in；2026-09-29 完成）
- **M32.5** [P3 🧪 测试基建] ✅ C92 apps/platform 视觉回归最小集（独立库 + 入仓库基线 + 独立 CI job；2026-09-29 完成）

**关键决策 D1-D6**（2026-09-29 用户裁定）：

- **D1**：方案 B（能力扩展优先）—— 从 8 项「评估完成待上收」候选中选 5 项，🚀 3 + 🛡️ 1 + 🧪 1
- **D2**：M32.1 C76 配置粒度 = **每仓库 Repository 字段**（需 TypeORM migration，走既有双向 opt-in 流程）
- **D3**：M32.2 C85 文件路径 = **`.github/dependfix.yml`**，冲突时**中央配置优先**（防目标仓库自行绕过保护策略）
- **D4**：M32.4 C82 **不提供 commit 签名 opt-in**（仅 push 隔离 + 文档记录决策依据与重开条件）
- **D5**：M32.5 C92 **入仓库基线 + 独立 CI job**（沿用 momei 同源做法，可回溯、可在 PR review 差异）
- **D6**：M32.3 C89 **复用 `ALERTS_DISABLED` + source 区分**，不新增独立错误码（与 C78 方案 A 口径一致）

**类型平衡复核**：

- 🚀 能力扩展：3 项（M32.1 / M32.2 / M32.3）—— ✅ 满足
- 🛡️ 技术债 / 治本：1 项（M32.4）—— ✅ 满足
- 🧪 测试基建：1 项（M32.5）—— ✅ 满足
- 🎨 用户体验：**0 项独立条目** —— ❌ 缺口（候选池无 UX 类候选；M32.5 兼作视觉层兜底）

**未纳入本批（保留 backlog）**：C80 阻断语义（待用户敲定方案 B / C；已 2026-09-30 上收 M33.6）/ C81 注释编号清理（存量 300-430 命中，需分批）/ C83 验证链基线（方案未定）/ C91 review 检查点补挂（已上收 M33.1）/ M31 遗留 `dependabot.yml` 死配置清理（已上收 M33.3）/ C15 第二阶段（需 `GITHUB_TOKEN`）/ C68（需代理基建）/ T701 / T702 / T704（需真实环境）/ D1 / D3 / D8 / B2 / C37 / T905（触发条件未到）

**闭环实证摘要**（完整记录见归档段）：

- 26 commits（5 原子条目）+ 1 merge commit（`300e833`）；归档时 `git rev-list HEAD ^origin/master --count` = 27（本地 ahead，待推送）
- 5 原子条目全部通过 A 阶段 Review Gate（含 2 处第 1 轮 Reject → 修复 → 第 2 轮 Pass：M32.1 双分区 Reject / M32.5 文档分区 Reject）
- 落地差异：M32.2 读取走**工作区本地文件**（不走 contents API）；M32.5 视觉套件跑**独立 SQLite 库** + CI job 初期非阻断（转阻断条件已固化）
- 衍生候选保留 backlog：C93（pr-checks 行级覆盖）/ C94（alerts 右端列盲区）/ 视觉 CI 转阻断待办（三项均已 2026-09-30 上收 M33.4 / M33.5 / M33.2）

> 详细任务与 8 要素见归档段 [todo-archive.md §M32](todo-archive.md#m32-能力扩展优先m321m325-全部已闭环--2026-09-30-归档)

---

## M33: 治理债收口 + 测试基建扩展（2026-09-30 用户决策方案 A / 2026-09-30 已闭环 + 归档）

承接 M32 完整闭环归档后的 backlog 候选池。2026-09-30 用户决策**方案 A（治理 + 测试基建收口）**，从「评估完成待上收」候选（C91 / C93 / C94 / C80 剩余）与本批评估新登记的可行动已知边界项（视觉回归 CI 转阻断 / M31 dependabot 死配置清理）中上收 6 原子条目；阶段内 M33.7（迁移命令入口补齐）与 M33.8–M33.10（UI 修复批次）经用户直接决策追加，M33.11（devDeps 存量漏洞治理）按插队例外清单第 2 类经用户明确授权追加。**11 原子条目全部闭环**，覆盖 📚 1 + 🛠️ 4 + 🧪 2 + 🎨 3 + 🛡️ 1，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)。

- **M33.1** [P3 📚 治理] C91 新增规范条款的 review 检查点补挂（「规范条款 review 检查点矩阵」21 行落点）—— `4543a54` + `3ff4595`
- **M33.2** [P3 🛠️ CI 治理] 视觉回归 CI job 转阻断（移除 `continue-on-error`，依据 run `36602407382` 首个全绿 run）—— `faba8f3` + `921d6a6`
- **M33.3** [P3 🛠️ 依赖治理] M31 迁移遗留 dependabot 死配置清理（3 条 PrimeVue `ignore` 移除）—— `f8359a8`
- **M33.4** [P3 🧪 测试覆盖] C93 视觉回归 pr-checks 行级覆盖（fixtures `prChecks` 写入路径 + 5 行行级基线）—— `27d5254` + `8d40230`
- **M33.5** [P3 🧪 测试覆盖] C94 视觉回归 alerts 宽表右端列盲区（元素级补拍 `alerts-right-*`）—— `1732795` + `a912e34`
- **M33.6** [P3 🛠️ CI 政策] C80 剩余 devDeps 链漏洞阻断语义（**方案 C 观察期** + 可判定转正条件）—— `f841695`
- **M33.7** [P2 🛠️ devEx 治理] 数据库迁移命令入口补齐（`db:migrate` CLI 复用 `createDataSourceOptions` 并强制双 false 解耦）—— `0fd45ef`
- **M33.8** [P2 🎨 用户体验] 弹窗表单布局规范统一（label 间距 / actions 右下 / 刷新按钮对齐）—— `2d796f6` + `cd98bfc`
- **M33.9** [P2 🎨 用户体验] 主按钮视觉与加载态（teal-700 白字 5.47:1 + reduced-motion 脉冲兜底）—— `a03dbf7` + `f5d9c77`
- **M33.10** [P3 🎨 用户体验] 告警筛选行「显示已解决」对齐（控件区补足控制档高度 + 居中）—— `d3d2802` + `70606fb`
- **M33.11** [P2 🛡️ 安全插队] devDeps / 运行时链存量漏洞治理（overrides 升级，audit 13 条 → 0）—— `bb88f26` + `77f95c2`

**关键决策 D1-D9**（2026-09-30 用户裁定）：

- **D1**：方案 A（治理 + 测试基建收口）——6 原子条目，类型平衡 📚 1 + 🛠️ 3 + 🧪 2
- **D2**：C80 采用**方案 C（观察期）**——维持 `|| true` + 标注可判定转阻断条件（存量清零后连续 3 次 `master` push clean）
- **D3**：视觉回归 CI 转阻断以 run `36602407382` 首个全绿 run 为转正依据；转阻断后以真实 CI run 裁决（run `36704146211` Visual Regression job = success）
- **D4**：**不纳入** C81（注释孤立编号清理，须分批）与 C83（验证链既有失败基线判定，方案未定）
- **D5**：阶段启动 commit 仅改 `docs/plan/*`（P 阶段规划暂停协议）
- **D6**（P 阶段 A 阶段审计收敛）：第 1 轮 `standard` Pass（0 blocker / 4 warning / 6 suggest）；warning 落点登记到对应条目交付物
- **D7**：M33.7 经用户直接决策追加（属 [规划规范 §3.1](../standards/planning.md#31-新需求默认走评估--backlog原则hard-requirement)「用户直接决策」路径，非插队例外 3 类）
- **D8**：M33.8–M33.10 UI 修复批次经用户直接决策追加；执行顺序 M33.9 → M33.8 → M33.10（先落全局色板以免基线二次改写）
- **D9**：M33.11 经用户明确授权按插队例外清单第 2 类追加；执行顺序 M33.11（清存量）→ M33.6（落阻断语义口径）

**类型平衡复核**：📚 治理 1（M33.1）/ 🛠️ CI 与 devEx 治理 4（M33.2 / M33.3 / M33.6 / M33.7）/ 🧪 测试覆盖 2（M33.4 / M33.5）/ 🎨 用户体验 3（M33.8 / M33.9 / M33.10）/ 🛡️ 安全 1（M33.11）。

**未纳入本批（保留 backlog）**：C81（注释孤立编号清理，须分批）/ C83（验证链既有失败基线判定；已 2026-09-30 上收 M34.6，见 [todo.md](todo.md)）/ C15 第二阶段（需 `GITHUB_TOKEN` 采集真实样本）/ C37（语言多设备同步）/ D1 / D3 / D8 / B2 / SAML SSO / C68 / T905 / T701 / T702 / T704（触发条件未到或需真实环境）。

**闭环实证摘要**：20 commits（阶段启动 `e6c5502` + 11 原子条目的实现与闭环登记）全部已推送 `origin/master`（`git rev-list HEAD ^origin/master --count` 归档时实测 = 0）；11 轮独立 Review Gate（含 M33.7 / M33.9 的 Reject → 修复 → Pass）。

> 详细任务与 8 要素见归档段 [todo-archive.md §M33](todo-archive.md#m33-治理债收口--测试基建扩展m331m3311-全部已闭环--2026-09-30-归档)

---

## M34: 治理与体验收口 + 组件库升级与巡检基建（2026-09-30 用户决策启动 / 2026-10-01 已闭环 + 归档）

承接 M33 完整闭环归档后的 backlog 候选池。2026-09-30 用户决策：**以 M33 期评估完成的「方案 A」（4 项 backlog 待上收候选 + C83 能力扩展）为主，并作适当能力扩展**——追加「caomei-ui `0.3.0 → 0.5.0` 升级（弹窗内 Select 下拉面板被裁剪 / 层级错误的用户可见缺陷）」与「视觉回归灵敏度 + 弹窗组件覆盖 + 上游组件问题归因与 issue 上报流程」。**7 原子条目**（含 2026-10-01 用户授权追加的 M34.7），覆盖 🛠️ 1 + 📦 1 + 🧪 1 + 🎨 1 + 📚 1 + 🚀 1 + 🛡️ 1，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)（🎨 仅 1 项，缺口显式标注）。

- **M34.1** [P3 🛠️ 工具链治理] devEx：运行时 `data/` 产物污染 vitest 与 check-docs（`test.exclude` 双 root + `check-docs` 遍历剪枝）—— `d315840` + `1dc1cd1`
- **M34.2** [P2 📦 依赖升级] caomei-ui `0.3.0 → 0.5.0`（面板层级缺陷修复 + 破坏性变更核对 + 防复发用例 + 视觉基线重建）—— `56c1290` + `7363a8d` + `a8e28b5` + `2f10eed`
- **M34.3** [P3 🧪 测试基建] 视觉回归灵敏度（双轴收紧）+ 弹窗组件覆盖扩展 + 上游组件问题归因与 issue 上报流程（**合并条目**）—— `e24b85b` + `b8e8ca1` + `30f9c27` + `8dbd7a1`
- **M34.4** [P3 🎨 用户体验] 非弹窗表单 label↔控件间距统一（实改 4 处；`pr-checks` 的 `__summary-byconclusion` 系横向标签行，按范围排除）—— `3dcc341` + `4919329`
- **M34.5** [P3 📚 文档治理] PrimeUI 设计先行稿与索引状态同步（含用户授权的同源陈旧一并同步）—— `64bdb79` + `6d2374f`
- **M34.6** [P3 🚀 能力扩展] C83 验证链「既有失败基线」判定（命令级归因 + 报告双口径 + 模块拆分）—— `dbf9066` + `4ed008e` + `5a544da` + `b6161a7`
- **M34.7** [P3 🛡️ 技术债] 表单字段堆叠口径复用化（`field-stack` mixin + 13 处同构字段复用 + 弹窗侧遗漏字段补齐 + 口径单点声明）—— `4e62f29` + `c56fb8d` + `3888d29` + `9875967` + `9fc83ed` + `2b7e613`（2026-10-01 用户授权追加）

**关键决策 D1-D12**（2026-09-30 用户裁定 + 2026-10-01 执行期追加）：

- **D1**：组合定型——方案 A（4 项 backlog 待上收 + C83）为主 + 适当能力扩展（caomei-ui 5.0 升级 + 组件巡检 / 上游归因）；6 原子条目，类型 🛠️ 1 + 📦 1 + 🧪 1 + 🎨 1 + 📚 1 + 🚀 1
- **D2**：M34.2 目标版本 = `0.5.0`（用户指定；npm `latest` 实测一致），触发 backlog 延期项「caomei-ui 0.x → 1.0 升级回归」恢复条件①
- **D3**：「视觉回归容差」与「组件巡检 + 上游 issue 流程」**合并**为 M34.3（受 5-6 项上限约束按「进一出一」处理；内部按子批次拆 commit）
- **D4**：弹窗内 Select 缺陷现象 = **面板被裁剪 / 层级错误**（用户确认）；D 阶段第一步须在 `0.3.0` 下复现取证
- **D5**：执行顺序建议 M34.2 → M34.4 → M34.3（先落组件库与间距，最后动容差与新基线，避免基线二次改写）；M34.1 / M34.5 / M34.6 可并行
- **D6**：阶段启动 commit 仅改**规划与文档指针**（`docs/plan/*` + `docs/standards/testing.md` + `docs/design/modules/dependency-fixer.md` 的陈旧指针），**不含运行时代码**（[AI 协作规范 §1.4 P 阶段规划暂停协议](../standards/ai-collaboration.md)），提交后暂停等待用户指令
- **D7**（P 阶段 A 阶段审计收敛）：第 1 轮 `standard` 审计 **Pass**（0 blocker / 2 warning / 3 suggest）；RG-W1（代码侧陈旧指针 `verification-runner.ts:93`）落点登记 M34.6、RG-W2（D6 措辞）本批修正；suggest 采纳 RG-S1 / RG-S2，RG-S3 不采纳（历史归档段冻结惯例）
- **D8**（M34.3 执行期用户拍板）：视觉门禁双轴收紧（`threshold` 0.2 → 0.1 + `maxDiffPixels` 200 → 100）；浮层覆盖档位取弹窗内 Select 展开态 light / dark 两张
- **D9**（M34.4 执行期范围判定）：`pr-checks` 的 `__summary-byconclusion` 系横向摘要标签行（非 label↔控件）→ 排除，实改 4 处
- **D10**（M34.7 追加，2026-10-01 用户授权）：范围穷举发现弹窗内 `.batch-form__field` 与 M34.4 四处结构完全同构（实为 M33.8 遗漏）→ 用户裁定「同构应处理、优先复用」并选择新增本阶段原子条目（不重开已闭环的 M34.4）；显示型 `label↔值` 堆叠不纳入口径
- **D11**（M34.5 范围扩展，2026-10-01 用户授权）：同源陈旧（en-US 索引缺行、architecture 现行 PrimeVue 陈述）一并同步；AC 排除项以无阶段编号候选登记 backlog §候选评估中
- **D12**（M34.6 决策点，执行期敲定并记录依据）：基线时机 = 修复前一次性采样（pristine，改动之前；dry-run 跳过）；判定粒度 = 命令级（基线缺失命令保守归因）；审计口径 = `PRE_EXISTING_FAILURE` + `FixAction.preExisting` + `verificationPassed` / `verificationBlocking` 双口径

**类型平衡复核**：🛠️ 工具链治理 1（M34.1）/ 📦 依赖升级 1（M34.2）/ 🧪 测试基建 1（M34.3）/ 🎨 用户体验 1（M34.4）/ 📚 文档治理 1（M34.5）/ 🚀 能力扩展 1（M34.6）/ 🛡️ 技术债 1（M34.7）。

**未纳入本批（保留 backlog）**：C81（注释孤立编号清理，存量 300-430 量级，须 3-6 子批次）/ C15 第二阶段（需 `GITHUB_TOKEN`）/ C68（需代理基建）/ C37 / D1 / D3 / D8 / B2 / SAML SSO / T905 / T701 / T702 / T704（触发条件未到或需真实环境）/ 已知边界各条（平台早期 migration 前缀不统一 / 告警源可审计性粒度 / SQLite 与 TypeORM 观察 / ECONNRESET 剩余候选 / tsdown hash:false）。

**§3.4 / §1.7 交叉核验**：6 项候选经 todo-archive 表格扫描 + git log + 代码 anchor 三重核验，**0 项重复评估**；2026-10-01 追加的 M34.7 另经同法核验（无 `field-stack` 实现 commit、M33.8 只处理同文件 `repo-form` 段），**0 项重复评估**（结论详见归档段 [todo-archive.md §M34](todo-archive.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)）。

**ahead commits 实证**：阶段启动前 `git rev-list HEAD ^origin/master --count` 实测 = 2（M33 归档批次 `15ca500` + `6035313` 待用户推送；M0-M33 实现 commits 已全部推送）；**归档时实测 = 28**（M33 尾部归档 2 commits `15ca500` + `6035313` + M34 阶段 25 commits + 本批 wisdom 蒸馏 commit）。

**闭环实证摘要**：25 commits（阶段启动 `86283e2` + 7 原子条目的实现与闭环登记）；7 个原子条目合计 **21 轮**独立 Review Gate（M34.1 1 + 1 轮 / M34.2 2 轮 / M34.3 2 分区 × 2 轮 / M34.4 1 轮 / M34.5 3 轮 / M34.6 2 分区 × 2-3 轮 / M34.7 2 分区 × 2 轮），全部 Reject / Pass 收敛后放行。

> 详细任务与 8 要素见归档段 [todo-archive.md §M34](todo-archive.md#m34-治理与体验收口--组件库升级与巡检基建m341m347-全部已闭环--2026-10-01-归档)

---

## M35: 批量运行终态兜底对账 + 进度可见性修复（2026-10-02 用户授权启动 / 2026-10-02 已闭环 + 归档）

2026-10-02 用户报告：批量运行页面中卡住（超时）的任务不显示进度，必须手动展开才触发查询；要求评估超时补偿机制失效原因与手动展开更新状态原理的合理性。根因排查（生产库 17 条 BatchRun / 94 条 ScanRun 逐条核对）确认：

- **终态惰性聚合**：BatchRun 的计数/状态/summary 只由详情接口 `GET /api/batch-runs/[id]` 实时聚合写回（原设计 §5.2「方案 A 轮询更新」）；列表接口 `GET /api/batch-runs` 只返回存量值，前端轮询也仅刷新「已展开」行 → 父批次终结完全依赖用户查看。
- **补偿机制盲区**：`stale-cleanup` 的 BatchRun 分支要求「至少一个 stale 子 ScanRun」，对「子项全部终态但父批次未被查看」与「零子项」两类主失败模式无覆盖（生产实证：5 条 `running` 批次的子项全部终态或为空，全库 `running/pending` ScanRun = 0）。
- **`finishedAt` 污染**：4 条 2026-09-04~09-29 的批次 `finishedAt` 全为同一时刻（本地 2026-10-02 00:39，间隔数秒）= 逐行展开动作的时间戳，而非真实完成时间。
- **对照实证**：两条零子项批次 `681adbbd`（被点开 → completed）与 `681ab6ef` / `681ab7c4`（未点开 → 至今 running）唯一差异即「是否被查看」。

**采用用户授权方案**（周期兜底对账 + 详情实时聚合双通道）：把终结从「看才发生」改为「到时间就发生」。

- **M35.1** [P2 🚀 能力扩展] 周期兜底对账服务 `batch-reconciler.ts`：对全部 `running` BatchRun 聚合子项并写回终态/进度；零子项超阈值 → `failed`（orphan）
- **M35.2** [P2 🛠️ 技术债] 写回逻辑收敛为共享 `applyBatchAggregation`（详情接口 + 对账服务 + sync 立即终结三处共用）+ 周期插件接线（先清孤儿、后对账）
- **M35.3** [P2 🛠️ 技术债] `finishedAt` 语义修正为真实完成时间（`max(子项 finishedAt)`，无子项回退当前时刻）+ sync 模式串行结束即立即聚合终态
- **M35.4** [P3 🎨 用户体验] 前端 `batch-runs.vue` 轮询注释与口径修正 + 列表进度无需展开即可反映（回归验证）
- **M35.5** [P3 🛠️ 数据订正] 存量 `finishedAt` 订正脚本（有子项批次按 `max(子项 finishedAt)` 重算，支持 dry-run）
- **M35.6** [P3 📚 文档治理] 设计口径同步（`platform-scheduled-batch.md §5.2` 由「方案 A 轮询更新」改为「详情实时聚合 + 周期兜底对账」；BatchRun 实体注释；backlog/roadmap/index 同步）

**类型平衡复核**：🚀 能力扩展 1（M35.1）/ 🛠️ 技术债 + 数据订正 3（M35.2 / M35.3 / M35.5）/ 🎨 用户体验 1（M35.4）/ 📚 文档治理 1（M35.6）。

**范围边界（不做什么）**：不改 `BatchRun` 状态集合与既有 `failed` 终态保护口径；不引入 Worker 回调；不改详情接口返回结构；零子项孤儿无真实完成时间，不伪造历史时刻。

**闭环实证摘要**：7 commits（`041b4df` / `222ca6d` / `33d93dd` / `ae4b038` / `8ae502c` / `d4ddf1f` / `db66f15`）；2 分区并发 deep 审计（P1 第 1 轮 **Reject**（RG-B01 零子项经详情接口被固化 `completed`）→ 修复 → 第 2 轮 Pass，残留 RG-W01R 登记 backlog；P2 Pass），全部 Reject / Pass 收敛后放行；归档时 `git rev-list HEAD ^origin/master --count` 实测 = 0（M35 全部 commits 已推送 `origin/master`）。

> 详细任务与 8 要素见归档段 [todo-archive.md §M35](todo-archive.md#m35-批量运行终态兜底对账--进度可见性修复m351m356-全部已闭环--2026-10-02-归档)

---

## M36: 治理债清仓 + 可观测性与测试稳定性（2026-10-02 用户决策方案 A 启动）

承接 M35 完整闭环归档后的 backlog 候选池。2026-10-02 用户决策**方案 A（治理债清仓）**——从 backlog 中可立即启动的候选中上收 5 项，一次性清空长期沉积的存量治理债（C81 孤立规划编号清理，存量数百至千余文件、须分批）并收口两处正确性 / 可观测性缺口（BatchRun 写回竞态 / 告警源可审计性判据）与一处 e2e 顺序偶发；同日用户直接指令追加镜像体积治理（M36.6，非 backlog 候选）与依赖升级 overrides key 重复写法修复（M36.7，用户报告缺陷），另追加 Docker 首次启动数据库初始化 + 部署文档 + 一键初始化脚本（M36.8，用户报告可用性缺陷）。**8 原子条目**，覆盖 🛡️ 5 + 📚 1 + 🚀 1 + 🧪 1（M36.8 含 🎨 体验修复），符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)。

- **M36.1** [P3 🛡️ 技术债] C81 源码 / 配置注释孤立规划编号存量清理（分批，每子批次 < 10 文件）
- **M36.2** [P3 📚 文档治理] 设计与索引文档同类陈旧状态清理（存量）
- **M36.3** [P2 🛡️ 技术债] BatchRun 写回非原子竞态收敛（三处写回统一条件更新）
- **M36.4** [P3 🚀 可观测性] 告警源「未启用 + 其余源全失败」判据修正
- **M36.5** [P3 🧪 测试基建] api-i18n「重复仓库」用例顺序偶发定位与治理
- **M36.6** [P2 🛡️ 技术债] dependfix-platform 镜像体积治理（去除冗余 node_modules 打包；实测 1.1GB → 239MB）
- **M36.7** [P2 🛡️ 技术债] pnpm overrides key 语义归一化（消除 `pkg@^1` / `pkg@1` 重复写法）
- **M36.8** [P1 🛡️ 缺陷修复 / 🎨 体验] Docker 首次启动数据库初始化 + 一键初始化脚本 + 部署文档（基线迁移 + 增量幂等 + compose 自动迁移）

**关键决策 D1-D7**（2026-10-02 用户裁定 + 待执行期细化）：

- **D1**：组合定型——方案 A（治理债清仓），5 原子条目；同日追加 M36.6（用户直接指令）+ M36.7（用户报告缺陷）+ M36.8（用户报告 Docker 首次启动缺陷 + 部署文档 / 初始化脚本需求），合计 8 原子条目；🎨 UX 由 M36.8 承载。
- **D2**：M36.1 判定口径默认取「注释块级 + 真常量白名单 + 优先改写为带文档指针的导航指针，无法归指者删编号留正文」；批量替换遵守 [AI 协作规范 §1.2 第 6 条](../standards/ai-collaboration.md) 分批纪律。
- **D3**：M36.3 以「条件写回下沉共享层」为主，保持 GET「对非 running 批次仍对齐计数」既有契约；不引入悲观锁。
- **D4**：M36.4 判据改为「无任何成功源且存在失败源」；明确 `repoResults` / 报告「扫描成功」连锁语义。
- **D5**：M36.6 对齐 momei / caomei-auth `.output`-only 形态，移除 runtime 冗余 `node_modules` / workspace dist 复制；引擎由 Nitro 打包进 `.output`，容器内 `DependfixApp` 执行链路保持可用；sandbox 未来独立入口须自包含（不得依赖 workspace `node_modules`）。
- **D6**：M36.7 按语义等价类（`1`/`^1`/`1.x`/`^1.0.0`）比对已有 override，命中时沿用其原写法；仅收敛可证明等价的等价类（major-0 caret `^0.0` ≠ `^0` 保持区分），不引入 `semver` 依赖。
- **D7**：M36.8 基线迁移采用实体元数据运行时生成（前缀感知 + 跨方言 + 幂等），存量增量迁移统一改幂等 + 前缀感知；compose 部署层默认 `DATABASE_MIGRATIONS_RUN=true`（应用默认仍 false），保留手动 / 一键初始化脚本。

**类型平衡复核**：🛡️ 技术债 5（M36.1 / M36.3 / M36.6 / M36.7 / M36.8）/ 📚 文档治理 1（M36.2）/ 🚀 可观测性 1（M36.4）/ 🧪 测试基建 1（M36.5）；M36.8 同时承载 🎨 体验修复（Docker 首次启动即用 + 部署文档缺口）。

**范围边界（不做什么）**：不做 UX 强补候选；不启动需外部基建 / token 的候选（C15 / C68）；M36.8 一并处理迁移前缀感知与空库自举（其 backlog 触发条件 ③ 已满足），但不做 Postgres 多写者迁移排期与长期观察项。

**§3.4 交叉核验**：backlog 上收的 5 项候选经 todo-archive 表格扫描 + git log + 代码 anchor 三重核验，**0 项重复评估**；M36.6 / M36.7 / M36.8 属 §3.4 承认的「用户直接决策」路径（M36.8 另属可用性插队例外），其三重交叉核验结论见 [todo.md §M36](todo.md)。

**ahead commits 实证**：阶段启动前 `git rev-list HEAD ^origin/master --count` 实测 = 0（M35 全部 commits 已推送 `origin/master`）。

> 详细任务与 8 要素见 [todo.md §M36](todo.md)

---

## 详细任务

- 当前阶段任务：**M36 进行中**（治理债清仓 + 可观测性与测试稳定性，2026-10-02 用户决策方案 A 启动）；见 [todo.md](todo.md)
- 已归档阶段：[todo-archive.md](todo-archive.md)（主窗口保留最近阶段完整段 + 指针段；M0-M35 全部已归档；早期阶段见 [archive/index.md](archive/index.md) 分片索引）
- 后续阶段任务（延期项 + 未排期增强候选）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录