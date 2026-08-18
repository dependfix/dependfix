# 路线图

## Milestone 概述

| 阶段 | 目标 | 优先级 | 状态 |
|------|------|--------|:----:|
| M0: 基线收敛 | Monorepo 骨架、配置模型、工具链策略、告警模型 | P0 | 已完成 |
| M1: MVP 单仓库修复 | 告警拉取→过滤→修复→验证→报告闭环 | P0 | 已完成 |
| M2: GitHub Action 接入 | workflow_dispatch + 定时 + PR + AI Token + Prompt 防护 | P1 | 已完成（2026-08-05 归档；G2 处置闭环） |
| M3: Code Scanning 扩展 | 规则分级、可模板化修复、建议输出 | P1 | 已完成（2026-08-06 归档；T301-T305 全部完成） |
| M4: 多仓库治理 | 自动发现、并发控制、报告归档 | P2 | 已完成（2026-08-06 归档；T401-T404 全部完成） |
| M4.5: 跨线升级显式授权 | `--allow-major-upgrade` 跨线告警显式授权自动升级（仅 CLI，实例复核 + 完整验证 + 回滚） | P2 | 已完成（2026-08-07 归档；T405 完成） |
| M4.6: Monorepo 成员级修复 | workspace 成员包直接依赖告警自动升级（T406 成员级修复器 + T407 分流接线） | P1 | 已完成（2026-08-07 归档；T406/T407 完成，Review Gate 三审 PASS） |
| M5: AI Breaking Change 研判 | Changelog 采集、LLM 研判、修复生成、质量门、CLI 解耦 | P1 | 已完成（2026-08-07 归档；T501-T506 全部完成，903 tests，Review Gate 每任务独立审计） |
| M5.5: Skill 编排（CLI 先行） | 产品 skill 分发（npx skills 主通道 + 自研兜底）与主流 agent 工具接入，MCP 为后续增强后端 | P2 | 已完成（2026-08-07 归档；T506-T508 完成，929 tests，Review Gate 每任务独立审计 PASS） |
| M6: 最小平台 MVP | 仓库管理、凭据管理、仪表板、MCP Server、Docker 部署 | P1 | 已完成（2026-08-08 归档；T601-T605+T607 全部完成，991 tests） |
| M7: 企业级平台增强 | M7.1 认证与用户体系（RBAC+用户管理+个人界面、OIDC SSO / GitHub·Google OAuth、邮箱域名黑白名单）；M7.2 平台能力深化（BullMQ+Redis、定时批量、i18n、生产部署、跨平台 Git、MCP 发布） | P2 | 已归档（M7.1 2026-08-10 / M7.2 2026-08-12，T702/T704/T708/T709/T710/T706 完成；T705/T703 延期 2026-08-12；后续任务 T711 覆盖率冲刺） |
| M8: 安全加固与容器执行完备 | 兑现沙箱安全治理决议（G2-G7）：容器工具链补齐（C45）、验证命令单命令超时（C41）、凭据权限面检查（C42/C39）、供应链信号披露（C43）、外联审计日志（C40）、规范挂接 review 检查点（C44） | P0-P2 | 已完成（2026-08-14 归档；T801-T806 全部完成，20 个提交本地待推送） |
| M9: i18n 基建同步 | 从 momei 同步 i18n 治理规范与审计脚本（缺失 key / 动态 key / 重复文案 + vue-i18n 专项 lint + docs 防回流），为 i18n 优化铺路 | P2 | 已完成（2026-08-18 归档；T901-T906 全部完成，5 个原子提交覆盖 6 任务，2556 行 inserts / 2539 行净增；翻译内容与多语言扩展留后续阶段） |

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

将 M1 能力接入 GitHub Actions，支持 `workflow_dispatch` + `schedule` 触发，输出报告 artifact，支持创建修复分支与 PR。包含用户自定义 AI Token 支持和 Prompt 注入防护。

> 详细任务见 [todo-archive.md §M2](archive/todo-archive-phases-m2-m55.md#m2-github-action-接入已归档)
>
> **M2 已交付（2026-08-05 归档）**：消费者仓库可通过 `uses: dependfix/dependfix@v1` 一行接入安全告警自动修复（fix-and-pr 默认、PR 去重、分支清理、分组升级、pnpm audit fallback）。G2 处置闭环：Dependabot alerts 需 PAT（`security_events` / `Dependabot alerts: read`）或 GitHub App token；Code Scanning 对 GITHUB_TOKEN 可访问（T-G2-2 已验证）。

## M3: Code Scanning 扩展

接入 Code Scanning alerts 标准化采集，建立 A/B/C 三级规则分层，白名单规则自动修复，不可修复问题输出建议。

> 详细任务见 [todo-archive.md §M3](archive/todo-archive-phases-m2-m55.md#m3-code-scanning-扩展已归档)
>
> **M3 已交付（2026-08-05 归档）**：Code Scanning alerts 与 Dependabot 并行采集（`--code-scanning` / `DEPENDFIX_CODE_SCANNING` / action `code-scanning` input），A/B/C 三级规则分层（自动修复 / 建议修复 / 仅报告），eol-last 自动修复闭环（T303），无法自动修复问题输出报告 + PR body 建议区块（T304），G1 工具链固定（T305）。
>
> **M3 收尾（2026-08-06）**：收尾修复批次（e1aad1e+c20218e，PR 标题动态化等 6 项）、env 前缀迁移（38722c5）、overrides 两轮复盘（89d8c508 / 06843b9d）、PR #27 反馈修复（a82f6580，PR body ✅ Fixed Alerts 告警级明细）。
>
> **前置（G2）已解除（2026-08-04 探针验证）**：Code Scanning alerts 对 GITHUB_TOKEN 可访问（HTTP 200，`security-events: read` 即可），M3 无需额外 token 方案；仅 Dependabot alerts 需要 PAT / GitHub App token。
>
> **规划要点（2026-08-05 启动）**：数据源**并行**而非回退（区别于 pnpm-audit）；复用 `SEVERITY_MAP` 的 code-scanning 映射与 fixers/code-scanning stub；G1（PIN_TOOLCHAIN stub）承接为 T305 并行任务。

## M4: 多仓库治理增强

支持 owner 级仓库自动发现、并发控制与失败隔离、仓库白名单/黑名单策略、报告归档与趋势统计。

> 详细任务见 [todo-archive.md §M4](archive/todo-archive-phases-m2-m55.md#m4-多仓库治理增强已归档)

## M4.6: Monorepo 成员级修复增强

workspace 成员包直接依赖告警的自动修复：成员 manifest 升级能力（T406）+ 告警分流与 app 接线（T407）。

> 详细任务见 [todo-archive.md §M4.6](archive/todo-archive-phases-m2-m55.md#m46-monorepo-成员级修复增强已归档)

## M5: AI Breaking Change 研判

Changelog / Release Notes 采集、多 AI 提供商封装、AI 研判（问题分类 + 修复方案 + 代码 patch）、AI 输出安全校验与质量门、CLI 解耦重构（平台化前置）。

> 详细任务见 [todo-archive.md §M5](archive/todo-archive-phases-m2-m55.md#m5-ai-breaking-change-研判已归档)
>
> **M5 已交付（2026-08-07 归档）**：T501-T506 全部完成——Changelog 双源采集（T501）、多 provider 研判引擎 + Zod 结构化输出 + prompt 注入防护（T502）、结构化 patch 应用与回滚（T503）、安全门 + 完整验证链（T504）、CLI 解耦平台化（T505）、app 触发接线 + 报告 aiUsage 聚合段（T506）。4 项规划决策（AI 提供商 / 触发时机 / Token 来源 / 成本默认值）已确认。903 tests。

## M5.5: Skill 编排（CLI 先行）

将 dependfix 的自动化修复能力封装为可分发的 Agent Skill（`dependfix-remediator`），通过 CLI 直接调用，支持主流 agent 工具（Claude Code / GitHub Copilot / Cursor / OpenCode）接入；MCP 作为后续增强执行后端（M6 T605/M7 T706，合并口径见 [todo-archive.md §M6](todo-archive.md#m6-最小平台-mvp已归档)），与 CLI 后端并存。

**背景与决策（2026-08-07 用户确认）**：MCP Server 原规划在 M6/M7 才落地，但当前 CLI 能力面（report/fix/fix-and-pr/cleanup-branches + 多仓库 + 双源 + PR 链路）已覆盖 MCP 规划的 4 个 tool（fetch_alerts / run_scan / fix_dependency / get_last_report）。skill 编排不依赖 MCP 即可工作；MCP 的增量价值是结构化 schema、无 shell 客户端覆盖与常驻进程批处理，属增强路径而非前置条件。

**生态决策（2026-08-07 补充）**：`npx skills`（vercel-labs/skills，2026-01 发布，28.1k stars）已成为主流 agent skills 安装方式（70+ agents、自动检测本机工具、无需提交 registry）——作为**主安装通道**（发布 = git push 仓库根 `skills/` 目录）；自研 `dependfix skills install` 仅作离线兜底。内部开发 skill（code-reviewer 等）以 `metadata.internal: true` 标记，不进入生态正常发现。

> **M5.5 已交付（2026-08-07 归档）**：产品 skill（`dependfix-remediator`）权威源与 CLI 编排（T506）、npx skills 生态主通道 + 自研兜底安装器（T507，本机 3 agent 实测 + 可见性矩阵 1/11）、MCP 双后端扩展点（T508，一致性断言清单）；`@dependfix/skills` 纳入发布与 CHANGELOG 体系。已知边界：GitHub 源端到端复验依赖 CI 裁决（本地网络受限）。

> 详细任务见 [todo-archive.md §M5.5](archive/todo-archive-phases-m2-m55.md#m55-skill-编排cli-先行已归档)（编号说明：M5.5 T506-T508 与已归档 M5 的 T506 重叠，以"阶段 + 编号"全称区分）

## M6: 最小平台 MVP

在 M5 完成后交付一个可独立部署的集中管理平台的最小可用版本：仓库管理、凭据管理、手动触发扫描、仪表板、Docker Compose 部署。

> **G2 驱动**：凭据管理须支持 PAT（classic / fine-grained）与 GitHub App 双模型——GITHUB_TOKEN 无法读取 Dependabot alerts，平台扫描必须依赖显式凭据（见 [M2 分片 G2 处置记录](archive/todo-archive-phases-m2-m55.md#g2-处置记录github_token-无法访问-dependabot-alerts) 方案矩阵）。

> **规划要点（2026-08-07 启动，任务定义见 [todo-archive.md §M6](todo-archive.md#m6-最小平台-mvp已归档)）**：执行深度 A（平台容器完整修复链路）为主、B（触发目标仓库 Action）为降级；同步执行先行；MCP 保留并合并（T605 四 tool 完整交付）；沙箱问题重新评估（Q4=A 设计 + 容器内执行最小实现，T607 设计先行于 T603）；Action 触发实现 + 结果回填（C25 增强实现）。

> **M6 已交付（2026-08-08 归档）**：T601-T605 + T607 全部完成——Nuxt 4 平台骨架（T601）、仓库与凭据管理 AES-256-GCM 加密存储（T602）、扫描触发与结果存储（T603）、仪表板与告警视图（T604）、`@dependfix/mcp` MCP Server 4 tool（T605）、执行器设计与沙箱评估 + ActionTriggerExecutor（T607）；M6 增强：B 模式结果回填（C25）、同仓库扫描互斥锁、REGISTRATION_DISABLED。991 tests。CI Test 端到端裁决通过；Docker 镜像构建 CI 链路 **2026-08-18 暂缓裁决**（run 31862632207 双平台构建 23m 2s 成功完成证明当前 docker.yml 配置可稳定工作，恢复条件见 backlog C30）；平台 UI 暗色模式待修复（C29）。

> 详细任务见 [todo-archive.md §M6](todo-archive.md#m6-最小平台-mvp已归档)

## M7: 企业级平台增强（已归档）

拆两个子阶段（2026-08-09 规划定稿，需求澄清见 [backlog.md §M7 规划决策](backlog.md#m7-企业级平台增强)）：

- **M7.1 认证与用户体系**（已归档 2026-08-10，见 [todo-archive.md §M7.1](todo-archive.md#m71-认证与用户体系已归档)）：T701 RBAC + 用户管理 + 个人界面（三角色，决策 D1/D2/D3 已确认）、T707 认证扩展（`AUTH_MODE` 互斥二选一：enterprise OIDC SSO + 域名白名单 / public GitHub·Google OAuth + 域名黑名单）。设计文档：[platform-auth-users.md](../design/governance/platform-auth-users.md)（Review Gate Pass）。
- **M7.2 平台能力深化**（已归档 2026-08-12，见 [todo-archive.md §M7.2](todo-archive.md#m72-平台能力深化已归档)）：T702 BullMQ+Redis 任务队列（✅ 2026-08-10）、T704 定时扫描与批量（✅ 2026-08-11）、T708 国际化 i18n（✅ 2026-08-11）、T709 治理规范收敛 + T710 CI lint 清理（✅ 2026-08-12）、T706 MCP 发布（✅ 2026-08-12，`@dependfix/mcp@0.1.2`）；T705 生产级部署（PostgreSQL + Helm + Sentry）、T703 跨平台 Git（GitLab/Bitbucket）**已延期 2026-08-12**（用户指示，见 [backlog.md §M7.2](backlog.md#m72-平台能力深化)）；T711 覆盖率冲刺已归档（✅ 2026-08-13 四维 ≥ 80%，见 [todo-archive.md §T711](todo-archive.md#t711-覆盖率口径修正--冲刺至-80已归档)）。

---

## M8: 安全加固与容器执行完备（已归档）

> **背景（2026-08-14）**：安全专项评估确认"dependfix 自身不得成为漏洞扩散工具"为核心原则（[沙箱与恶意依赖防护治理](../design/governance/sandbox-security-governance.md)）。威胁链建模识别 4 条扩散路径（A 合法包投毒 / B 恶意仓库 owner 扫描 / C PR 合入流向下游 / D M7 并发共享容器），登记治理决议 G1-G7。G1（C38 容器执行进程非 root 降权）已修复（2026-08-14，`eb8f3c59`）；实证发现容器内 git/pnpm 工具链从未安装（C45，ContainerExecutor fix 链路实际不可用）。
>
> **M8 已排期（2026-08-14）**：T801 容器工具链补齐（C45，P0）→ T802 验证命令单命令超时（C41）→ T803 凭据权限面检查 + 本地模式防线（C42/C39）→ T804 供应链信号披露（C43）→ T805 外联审计日志（C40）→ T806 规范挂接 review 检查点（C44）。任务详情与验收见 [todo.md §M8](todo.md#m8-安全加固与容器执行完备2026-08-14-启动已归档)；M8 区块详情保留在 todo.md 主文档（todo-archive.md 主窗口不保留 M8，迁移时机随 T906 后续批次评估）。
>
> **M8 移交下一阶段候选（backlog 登记）**：C26 独立沙箱容器（网络出站白名单 + cgroup + 每任务容器，BullMQ worker 结合）、C30 镜像构建 CI 链路裁决（⏸️ 2026-08-18 用户决策暂缓——见 backlog C30）、C28 凭据加密存储文档章节、C29 平台 UI 暗色模式。

## M9: i18n 基建同步（已归档）

> **背景（2026-08-15）**：momei 已沉淀成熟的 i18n 治理体系（语言分级 / freshness 分层 / 缺词 blocker / 动态 key 白名单 / 重复文案审计 / vue-i18n 专项 lint），dependfix 平台（M7.2 T708）已有基础 i18n（zh-CN + en-US 双语）但缺审计门禁与治理规范。M9 同步基建铺路，翻译内容留后续阶段。
>
> **M9 已交付（2026-08-15 代码与脚本 / 2026-08-18 文档归档收口）**：T901 规范同步 → T902 脚本同步（4 个 audit + 1 个 shared CLI）→ T903 脚本测试（75 例）→ T904 npm scripts + `@intlify/eslint-plugin-vue-i18n` 独立 lint 接入 → T905 CI 接入（test.yml 3 个新步骤）→ T906 文档收口（scripts/README + todo/roadmap）。5 个原子 commit（按 T901→T906 任务顺序：`49438f5` → `a4d1668` → `077823c` → `eae70cf` → `a61becc`；`077823c` 时间在 M9 主体前 9 小时跨 M8/M9 边界被 M9 复用），合计 2556 行 inserts / 2539 行净增。规划决策与验收详情见 [todo-archive.md §M9](todo-archive.md#m9-i18n-基建同步已归档)。
>
> **M9 移交下一阶段候选（backlog 登记）**：README.en-US.md 翻译（`must-sync` tier）/ docs/i18n/en-US 镜像翻译（`summary-sync` / `source-only`）/ platform 多语言扩展（zh-TW / ko-KR / ja-JP）/ locale 模块化拆分（脚本已兼容双形态，单 locale 超阈值或命名空间冲突时触发）。

---

## 详细任务

- 当前阶段任务：[todo.md](todo.md)（M8 / M9 已归档；待人工验收项随真实环境推进）
- 已归档阶段：[todo-archive.md](todo-archive.md)（主窗口保留 M6 / M7.1 / M7.2 / M9 / T711；早期阶段见 [archive/index.md](archive/index.md) 分片索引）
- 后续阶段任务（延期项 + 未排期增强候选）：[backlog.md](backlog.md)

## 交付原则

- 每个里程碑必须通过 lint + typecheck + build + test 质量门
- 里程碑交付前需经过 code-reviewer 技能审查
- 剩余风险必须在交付说明中清晰记录

