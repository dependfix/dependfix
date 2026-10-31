# AGENTS.md

## 目的

本文件定义了在当前工作区内工作的 agent 和贡献者需要遵守的仓库级规则。

## 适用范围

除非用户明确给出更高优先级的指令，否则这些规则适用于本仓库中的所有变更。

## 项目简介

`dependfix` 是一个自动化处理 Dependabot / Code Scanning 安全告警中那些简单、重复但数量庞大的修复工作的工具。

当前项目的目标是围绕以下能力逐步落地实现：

- 自动获取 Dependabot alerts
- 自动获取 Code Scanning alerts
- 按严重级别过滤并执行可控修复
- 自动处理 `pnpm i --frozen-lockfile` 类问题
- AI 研判依赖升级 breaking change 并生成修复方案
- 支持本地直接运行和 GitHub Actions 运行
- 支持独立平台部署（闭源场景）
- 输出可归档、可审计的执行报告

当前仓库已从 TypeScript 项目模板迁移到 pnpm workspace Monorepo 架构。当前包含 `packages/core`（核心领域模型库）和 `packages/cli`（CLI 应用入口），后续按需添加 `packages/github`、`packages/action`、`packages/mcp`、`apps/platform`。

项目当前的已知基础事实包括：

- 运行环境为 Node.js ^22.23.4 || ^24.22.1（2026 年 10 月 21 日 Node.js 安全公告基线；20.x 已 EOL）
- 包管理器以 pnpm 为主
- 仓库中已有基础 CI 工作流
- 后续实现将优先围绕 Node.js / pnpm 仓库的安全告警自动修复能力展开

## 相关文档

- 架构设计：[docs/design/governance/architecture.md](docs/design/governance/architecture.md)
- 数据模型：[docs/design/modules/data-model.md](docs/design/modules/data-model.md)
- 安全设计：[docs/design/governance/security.md](docs/design/governance/security.md)
- 技术栈：[docs/guide/tech-stack.md](docs/guide/tech-stack.md)
- AI 协同指南：[docs/guide/ai-development.md](docs/guide/ai-development.md)
- 项目规范：[docs/standards/index.md](docs/standards/index.md)
- 当前任务：[docs/plan/todo.md](docs/plan/todo.md)
- 路线图：[docs/plan/roadmap.md](docs/plan/roadmap.md)
- 竞品分析：[docs/research/2026-07-26-competitive-research.md](docs/research/2026-07-26-competitive-research.md)

## AI 基建与规范体系

本项目规范体系以 [momei](https://github.com/CaoMeiYouRen/momei) 为蓝本，已在 M0-M1 阶段完成独立化：

| 规范 | 文件 |
|------|------|
| AI 协作 | [docs/standards/ai-collaboration.md](docs/standards/ai-collaboration.md) |
| AI 资产治理 | [docs/standards/ai-governance.md](docs/standards/ai-governance.md) |
| 开发 | [docs/standards/development.md](docs/standards/development.md) |
| 测试 | [docs/standards/testing.md](docs/standards/testing.md) |
| 文档 | [docs/standards/documentation.md](docs/standards/documentation.md) |
| 安全 | [docs/standards/security.md](docs/standards/security.md) |
| Git | [docs/standards/git.md](docs/standards/git.md) |
| 规划 | [docs/standards/planning.md](docs/standards/planning.md) |

momei 仅作为 1.0.0 前的参考蓝本，1.0.0 后按本项目自身实践演进，形成自有规范体系。

## 命名规范

阶段编号分配规则：

- `M\d+` 主阶段：一段完整规划周期（如 M0 / M25）
- `M\d+.\d+` 子阶段：阶段内原子条目（如 M25.1 / M25.2a），按类型平衡原则选取 4-6 个独立闭环
- `M\d+.\d+.\d+` 任务/工作流：子阶段内具体任务

**约束**：backlog 候选不得包含 `M\d+` 阶段编号（除非经用户明确授权上收）。完整规则见 [规划规范 §3.1](./docs/standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)。

## 设计文档架构

`docs/design/` 下分两类目录，按文档对象分流：

- **`modules/`** —— 单 monorepo 包总设计（`packages/core`、`packages/engine`、`packages/cli`、`packages/mcp`、`packages/skills`、`apps/platform`）
- **`governance/`** —— 跨模块 / 治理 / 重大变更专项设计 + 经验归档（`architecture.md` / `security.md` / `experience-archive.md` 等）

**硬阈值**：改动预计 > 10 文件 / > 800 行 → **必须有** governance 文档；> 5 文件 / > 350 行 → 建议有；跨 ≥ 2 个独立模块 → 必须有。完整规则见 [规范与文档治理设计 §2.4](./docs/design/governance/spec-and-doc-governance.md#_2-4-设计文档硬阈值-hard-requirement)。

## 审计触发

A 阶段 `code-auditor` 审计必须触发的场景：

- 治理定义改动（`docs/standards/*.md` / `docs/design/governance/*.md` / `.github/skills/*.md` / `.github/agents/*.md`）
- 设计文档硬阈值触发（按设计文档架构章节）
- 跨 ≥ 2 个独立模块的代码改动
- 公开 API / 鉴权 / 数据写入 / 外部调用

未触发审计的 F 阶段 commit 视为不合规，由 code-auditor Reject 退回。完整规则见 [规范与文档治理设计 §6.1](./docs/design/governance/spec-and-doc-governance.md#_6-1-a-阶段-audit-required-触发判定-hard-requirement)。

## 必要检查

### 代码变更

对于任何代码改动，以下规则都是强制要求：

1. 在变更被视为完成之前，`pnpm run lint:check`（无 `--fix` 的 ESLint 门禁）必须通过；涉及 CSS / SCSS / Vue 样式（含 `.vue` 样式块）时 `pnpm run lint:css:check` 必须通过。本地自动修复用 `pnpm lint` / `pnpm --filter @dependfix/platform lint:css`。
2. 在变更被视为完成之前，`typecheck` 必须通过。
3. 当变更可能影响打包、入口点、导出、生成产物、依赖解析、运行时启动或发布行为时，必须运行 `build`。
4. 当变更影响可执行逻辑、行为、契约、解析、过滤、工作流逻辑或任何现有测试路径时，必须运行 `test`。
5. 当完成一项 todo 任务时，应该更新 [docs/plan/todo.md](docs/plan/todo.md)，并且如果该任务涉及代码变更，则必须满足上述检查要求。

### 检查选择

- `lint:check`、`lint:css:check` 和 `typecheck` 是代码变更的基线检查，不应跳过。
- `build` 和 `test` 按改动影响按需执行，而不是每次编辑都盲目运行。
- 如果相关检查没有运行，最终交付说明中必须明确解释原因。

### 发布前安全检查（hard requirement）

发布（`release.yml` / 手动 `workflow_dispatch` / 定时发布 / 镜像与 GitHub Release）前必须通过安全告警门禁：

1. Dependabot alerts 与 Code Scanning alerts 中 **critical 一律不得存在（含被 dismiss 的告警），禁止任何形式豁免**（无修复版本时须移除 / 替换依赖或下线受影响能力）。
2. high 原则上阻断；仅「上游无可用修复版本」或「修复难度大、本发布窗口无法完成」（open）或误报（dismissed，`false-positive`）时，可登记到 [`.github/release-security-exemptions.json`](.github/release-security-exemptions.json) 台账后放行（Code Scanning 必须按实例 `location` 登记），并同步 [docs/plan/backlog.md](docs/plan/backlog.md) 追踪、尽快修复。
3. moderate / low 不阻断，随后续版本修复。
4. 门禁由 `pnpm run check:release-security` 在 `release.yml` 的 `release:publish` 之前执行，token / 台账 / API 异常一律 fail-closed；Dependabot alerts 读取依赖仓库 secret `GH_PAT`（`GITHUB_TOKEN` 恒 403）。

权威口径见 [安全规范 §5.9](docs/standards/security.md#_5-9-发布前安全告警门禁-dependabot-alerts-code-scanning-2026-10-29-用户决策)，执行步骤见 [发布指南](docs/guide/release.md#发布前安全检查-安全告警门禁)。

### 任务开局 CI 回执检查（hard requirement）

开始**新任务**且工作区干净（`git status --porcelain` 为空）时，先检查最近一次 GitHub Actions 结果，再进入规划或实现：

1. 取本地 `HEAD` 与上游分支（`@{u}`）的 sha，再执行 `gh run list --branch <默认分支> --limit 20 --json databaseId,headSha,workflowName,event,conclusion`；只处理 `headSha` 命中这两个 sha 且 `conclusion=failure` 的 run，需要定位时用 `gh run view <run-id> --log-failed`。
2. 只处理「失败由最近推送的代码引起」的情况：历史失败、Dependabot 分支、与本仓改动无关的失败不纳入本任务，并在 briefing 中标注「非本次推送」。
3. 能直接修复的（断言 / 配置 / 基线 / 小范围依赖补丁）在本任务内修复并说明；若失败严重（主链路红、发布或安全门禁阻断、会影响当前 / 后续 todo 的交付），先向用户说明失败点、影响面与建议，由用户裁决是否立刻修复。
4. 已处于**进行中的任务**时（`.session/current-task.yaml` 有 `in_progress` 项、上一轮 briefing 已声明本任务，或工作区非空）**不执行**该检查，专注当前任务；一次任务内也不重复检查；触发与跳过同时成立时以本条为准。`todo.md` 有未闭环原子属阶段常态，不作为跳过依据。
5. `gh` 不可用 / 未认证 / 网络失败时，在 briefing 记录「CI 回执不可用 + 原因」后继续任务，不阻断，但**不得**视为 CI 通过。

## 新需求处理原则（hard requirement）

按 [规划规范 §3.1 新需求默认走"评估 → backlog"原则](docs/standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) + [AI 协作规范 §2.1.1 新需求总原则](docs/standards/ai-collaboration.md#_2-1-1-新需求总原则-跨工作流适用)：

1. **默认路径**：新需求（功能 / 模块 / 集成 / 监控 / 重构 / 体验优化等）的处理路径是 **先评估 → 进入 backlog.md → 等待用户明确决策阶段**。
2. **不自动升级**：未经用户明确授权，backlog 候选**不得**进入 todo.md §当前阶段；候选条目**不包含** `M\d+` 阶段编号（如 `M23.1`、`M24` 等）。
3. **不默认最高优先级**：候选池按"类型平衡"原则选取是用户决策行为；AI 不得推断"X 应作为本批次最高优先级"并默认启动 X。
4. **插队例外清单（仅 3 类可走 todo.md 当前阶段 + 阶段编号）**：
   - **安全问题**：已确认的安全漏洞（Code Scanning 告警、Snyk/Dependabot critical、有 PoC 的安全 issue）
   - **漏洞问题**：依赖链中高危漏洞（critical CVE、GHSA 标识 critical/high 且影响 dependfix 自身或被 dependfix 管理的仓库）
   - **直接影响可用性的任务**：生产环境故障、P0/P1 事故恢复、CI 主链路阻塞、用户报告的 blocker 级功能缺失
5. **清单外经用户授权的追加通道**：清单外事项经用户明确授权后可写入 `todo.md` 当前阶段，但须按 [规划规范 §3.1](docs/standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)「**追加临时待办（不占阶段条目编号）**」标记口径处理。标记形态、位置与编号规则以 `planning.md §3.1` 为唯一权威声明，本条仅作指针。
6. **合规核验**：本原则由 [code-auditor 主责边界「新需求未默认升级为下一阶段 todo」必查项](.github/agents/code-auditor.agent.md) 强制检查，违规即 Reject 退回。

## 审查要求

所有改动在最终交付前都必须经过 `code-reviewer` 技能审查。

### 审查期望

审查必须：

1. 优先关注 findings、风险、回归问题和缺失的验证。
2. 按照改动规模覆盖正确性、安全性、架构和测试风险。
3. 明确说明是否存在阻塞性问题。

## 交付规则

在满足以下条件之前，任何实现都不应被视为完成：

1. 必要检查已经运行，或已明确说明未运行的理由。
2. 变更已经通过 `code-reviewer` 技能审查。
3. 剩余风险已经清晰说明。

## 提交规范 (Commit Convention)

所有 `git commit` 操作必须遵循以下约束：

1. **必须使用 `conventional-committer` skill**：任何代码、文档、配置或脚本的提交都必须通过 `conventional-committer` skill 执行。禁止直接使用 `git commit -m "..."` 裸提交。
2. **格式要求**：提交消息必须符合 Conventional Commits 规范（`type(scope): description`），且 `description` 统一使用**中文或用户使用的语言**。主题行最长 120 字符（commitlint 硬限制 140），消息格式细则见 [Git 规范 §3.1](docs/standards/git.md)。
3. **质量前置**：提交前必须确认 A 阶段（`Code Auditor (代码审计员)`）已放行，且 `pnpm run lint:check`（涉及 CSS / SCSS / Vue 样式时另跑 `pnpm run lint:css:check`）、`pnpm typecheck` 和必要的定向测试均已通过。质量门禁未通过时不得提交。
4. **原子粒度**：一个提交对应一个逻辑变更，关联且仅关联 `todo.md` 中的一个原子条目。
5. **推送禁令**：`git commit` 后不得自动执行 `git push`，推送仅限用户明确要求时执行。提交完成后应告知用户"已提交到本地，等待推送确认"。
6. **src/dist 不一致时 build 在先（monorepo 纪律）**：改动涉及 `packages/*/src/**`（被其他 workspace 包 import）时，**提交前必须先 `pnpm -r build`（或定向 `pnpm --filter <changed-pkg> build`）重建 dist**，否则下游包的 typecheck 会报 TS2339（缺新字段）。CI 自动 rebuild 掩盖本地 dev 过期，导致 `pnpm exec tsc --noEmit` 通过但 `pnpm run typecheck`（含 nuxt typecheck pipeline）失败。**验证协议**：commit 前实测 `pnpm run typecheck` exit 0（覆盖 root tsc + nuxt typecheck）；如失败，第一动作是 `pnpm -r build` 而非修改源码。教训见 [经验归档 §五十五（M23.3 C66-C standard depth audit W1）](docs/design/governance/experience-archive.md)。

## 安全与行为红线

### 核心文件保护

-   严禁修改或删除 `.env`，非必要也不得读取 `.env`，应当优先参考 `.env.full.example` 了解环境变量字段。
-   修改本文件 `AGENTS.md` 前应该询问用户，并得到用户明确指示。
-   严禁在代码中硬编码任何 API Key、Token 或敏感凭据。

### 终端操作安全

在执行脚本或命令前，必须进行环境检查与路径校验。具体的脚本安全准则请参考 [安全开发规范](./docs/standards/security.md)。


## 其他要求

1.  **多语言响应**: 在与用户沟通时，应使用用户发送的语言进行回复（默认为中文）。如果可以，请优先使用用户发送的语言进行思考（think）
2.  **重大变更确认**: 在进行涉及架构、核心逻辑或项目路线图的重大变更前，必须主动向用户请求确认。
3.  **性能下限原则**：使用的 AI 智能体，其基础能力不应低于 Claude Sonnet 4.6 / GPT-5.3 / DeepSeek V4 Flash 这一档的大模型水平。
