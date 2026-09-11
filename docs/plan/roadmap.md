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
| M19: 治理 + 能力扩展 + 测试补强 | 按类型平衡原则 5 项任务（技术债 + 能力 + 体验 + 测试） | P2-P3 | 已完成（[archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理--能力扩展--测试补强m191m192m193m194m195-全部已闭环-2026-08-31-归档)） |
| M20: ScanResult 数据模型重构 | per-alert 模型 + reconcile + API 简化 + UI + backfill | P2 | 已完成（[archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)） |
| M21: 治理收口 + 能力扩展 + 测试补强 | Code Scanning RG-W + M18.x 剩余风险 + B3 PR 自动合并 + T704 e2e | P3 | 已完成（[archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)） |
| M22: SQLite 数据保护防御加固 | 2026-09-01 dependfix.sqlite 数据清空事故 + 6 原子条目 | P0-P1 | 已完成（[todo-archive.md §M22](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)） |
| M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强 | M22.7+M22.8 根因 + C66 告警视图增强 | P1-P3 | 已完成（[todo-archive.md §M23](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)） |
| M24: PR Check MVP + 治理债 + 测试补强 + 用户体验 | PR Check 状态监测 MVP + M22.7+M22.8 残留根因 + C36 i18n | P1-P3 | 已完成（[todo-archive.md §M24](todo-archive.md#m24-pr-check-mvp--治理债--测试补强--用户体验m241m242m243m244m245-全部已闭环--2026-09-03-归档)） |
| M25: PrimeUI License 治理 + 平台 AI 研判集成 + lint baseline + M24 follow-up 工具化 | C70 PrimeUI 降级 + C68 AI 研判基础层 + lint baseline + i18n-anchor-check + zod-helpers | P1-P3 | 已完成（[todo-archive.md §M25](todo-archive.md#m25-primeui-license-治理--平台-ai-研判集成--lint-baseline-治理--m24-follow-up-工具化m251m252am253m254-全部已闭环--2026-09-08-归档)） |
| M26: 平台 AI 研判应用层 + 批量导入 Resource owner 化 + 文档站 i18n + License 收口 + 经验沉淀 | C68 P1 应用层 + C67 + C69 P0 + primeicons 降级 + baseline 22 warnings 治理 + e2e 适配 + 经验归档沉淀 | P1-P3 | 已完成（[todo-archive.md §M26](todo-archive.md#m26-平台-ai-研判应用层--批量导入-resource-owner-化--文档站-i18n--license-收口--经验沉淀m261m262m263m264am264bm264cm265-全部已闭环--2026-09-10-归档)） |
| M27: 用户体验 + 治理优先 | M27.1 重复评估修正 + M27.2 W1 apps/platform stylelint + M27.3 W2 logger 补测 + M27.4 W4 container-executor 补测 + M27.5 ECONNRESET 候选 ① 诊断 | P1-P3 | 已完成（[todo-archive.md §M27](todo-archive.md#m27-用户体验--治理优先m271m272-w1m273-w2m274-w4m275-全部已闭环--2026-09-10-归档)） |
| M28: 治理债清理 + 能力扩展 | M28.1 backlog.md §已知边界段批量治理 + §4.4 第 11 条规则强化 + M28.2 C14 多 cs lint 性能 + M28.3 C15 B 类规则样本核对 + M28.4 C33 MCP P3 + M28.5 M22.8 follow-up ② | P2-P3 | 已完成（[todo-archive.md §M28](todo-archive.md)；2026-09-11 用户决策方案 M28-A + M28.1 重编号 + 完整 5 候选闭环 + M28.6 归档批次落地 ahead=11 commits 待推送） |

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
## M12: 平台 UX 一致性 + i18n 治理（已完成 2026-08-21 归档）

承接 2026-08-21 用户实测反馈 10 项平台 UX / 安全 / i18n 问题。4 子阶段独立闭环（C65-A 用户管理安全 / C65-B i18n 单点声明 / C65-C schedules 增强 / C65-D 平台表格视图增强）。

> 详细任务见 [archive/todo-archive-phases-m12.md §M12](archive/todo-archive-phases-m12.md)

## M13: 治理 + UX 反馈 + 网络治理 + Code Scanning（已完成 2026-08-26 归档）

承接 M12 闭环后 backlog 治理前置 + 2026-08-25~26 用户实测反馈 5 项 UX 问题。4 子阶段独立闭环（治理前置 / 网络治理 + 告警去重 / Code Scanning 规则化 / UX 反馈批次立刻做）。

> 详细任务见 [archive/todo-archive-phases-m13.md §M13](archive/todo-archive-phases-m13.md)

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

> 详细任务见 [archive/todo-archive-phases-m19-m21.md §M19](archive/todo-archive-phases-m19-m21.md#m19-治理--能力扩展--测试补强m191m192m193m194m195-全部已闭环-2026-08-31-归档)

## M20: ScanResult 数据模型重构

per-alert 模型 + reconcile + API 简化 + UI 调整 + backfill 脚本。5 子阶段全部闭环。

> 详细任务见 [archive/todo-archive-phases-m19-m21.md §M20](archive/todo-archive-phases-m19-m21.md#m20-scanresult-数据模型重构m201m203m205m206m207-全部已闭环--2026-08-31-归档)

## M21: 治理收口 + 能力扩展 + 测试补强

承接 M20 闭环后 backlog 候选池 + M18.x 治理剩余风险。4 子阶段独立闭环（M21.1 Code Scanning RG-W / M21.2 M18.x 剩余风险 / M21.4 B3 PR 自动合并 / M21.5 T704 async）。

> 详细任务见 [archive/todo-archive-phases-m19-m21.md §M21](archive/todo-archive-phases-m19-m21.md#m21-治理收口--能力扩展--测试补强m211m212m214m215-全部已闭环--2026-08-31-归档)

## M22: SQLite 数据保护防御加固

承接 2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故。事故暴露 5 条可加固设计风险。6 原子条目 + 1 沉淀批次独立闭环（M22 沉淀 / M22.1 SQLite 自动备份 / M22.2 db-restore / M22.3 db-doctor / M22.4 TypeORM synchronize opt-in / M22.5 migrationsRun opt-in / M22.6 e2e/fixtures 双门控）。

> 详细任务见 [todo-archive.md §M22](todo-archive.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)

## M23: M22 治理债收口 + 根因排查 + 能力扩展 + 测试补强

承接 M22 闭环 + M22.7+M22.8 hotfix 衍生根因治理债 + C66 告警视图增强 + 测试基建清理。5 原子条目独立闭环（M23.0 治理收敛 / M23.1 M22.7 根因 / M23.2 M22.8 根因 / M23.3 C66 告警视图 / M23.4 测试补强）。

> 详细任务见 [todo-archive.md §M23](todo-archive.md#m23-m22-治理债收口--根因排查--能力扩展--测试补强m230m231m232m233m234-全部已闭环--2026-09-02-归档)

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
- **总投入**：**8 atomic commits 实施 + 3 docs 收口 commits = 11 commits**（ahead=11 待用户主动推送；2026-09-10 实测）

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

承接 M27 完整闭环 + D 阶段 backlog 治理债清理 + A 阶段真实性审查 Pass（0 blocker / 2 warning / 2 suggest）+ 用户明确授权方案 M28-A + M28.1 重编号启动 M28 阶段。**5 候选全部 ahead=11 commits 已落地闭环**，M28.6 归档批次 ahead 待推送，ahead=11 commits 待用户主动推送。覆盖 📚 1 + 🛡️ 3 + 🚀 1，符合 [规划规范 §1.1 L12 类型平衡原则](../standards/planning.md#11-硬性约束)。

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
- **D6**（M28 完整闭环）：5 候选 ahead commits 实测 = 11（含 M28 启动 2 + 治理债清理 3 + M28 完整闭环 6 = 11）—— M28.6 归档批次落地指针模式 + ahead commits 待用户主动推送

**类型平衡复核**：

- 🛡️ 技术债 / 治本：2 项（M28.2 / M28.5）—— ✅ 满足
- 🚀 能力扩展：1 项（M28.4 C33 MCP）—— ✅ 满足
- 🛡️ 技术债：1 项（M28.3 C15）—— ✅ 满足
- 📚 治理：1 项（M28.1 重编号）—— ✅ 满足
- 🎨 用户体验：**0 项** —— ❌ 缺口（C36 / C37 均已闭环或前置依赖）
- 🧪 测试覆盖：**0 项** —— ❌ 缺口（db-restore S-1/S-2 恢复条件不明确）

**ahead commits 实证**：`git rev-list HEAD ^origin/master --count` = **11**（M28 完整闭环 ahead 待用户主动推送；按 [AGENTS.md §5 推送禁令](../../AGENTS.md) 未经用户明确要求不得执行 `git push`）

- **M28 完整闭环 ahead commits 关联表**（按提交顺序）：

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

> 详细任务见 [todo-archive.md §M28](todo-archive.md)（M28.6 归档已落地 / 指针段模式 + 关键决策 D1-D6 + ahead commits 关联表）+ [backlog.md](backlog.md)（M28 归档批次同步清理后健康窗口 ~229 行）

---

## 详细任务

- 当前阶段任务：[todo.md](todo.md)（M28 完整闭环 ahead=11 commits 待用户主动推送；下一阶段待用户决策 M29+ 启动）
- 已归档阶段：[todo-archive.md](todo-archive.md)（主窗口保留最近 4 个完整段：2026-09-11 M28 + 2026-09-10 M27 + 2026-09-10 M26 指针段 + 2026-09-02 M23；早期阶段见 [archive/index.md](archive/index.md) 分片索引；M19 / M20 / M21 已 2026-09-10 M26 归档批次预防性分片迁出至 [archive/todo-archive-phases-m19-m21.md](archive/todo-archive-phases-m19-m21.md)）
- 后续阶段任务（延期项 + 未排期增强候选）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录