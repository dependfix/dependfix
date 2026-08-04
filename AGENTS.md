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

- 运行环境为 Node.js >= 20
- 包管理器以 pnpm 为主
- 仓库中已有基础 CI 工作流
- 后续实现将优先围绕 Node.js / pnpm 仓库的安全告警自动修复能力展开

## 相关文档

- 架构设计：[docs/design/governance/architecture.md](docs/design/governance/architecture.md)
- 数据模型：[docs/design/packages/data-model.md](docs/design/packages/data-model.md)
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

## 必要检查

### 代码变更

对于任何代码改动，以下规则都是强制要求：

1. 在变更被视为完成之前，`lint` 必须通过。
2. 在变更被视为完成之前，`typecheck` 必须通过。
3. 当变更可能影响打包、入口点、导出、生成产物、依赖解析、运行时启动或发布行为时，必须运行 `build`。
4. 当变更影响可执行逻辑、行为、契约、解析、过滤、工作流逻辑或任何现有测试路径时，必须运行 `test`。
5. 当完成一项 todo 任务时，应该更新 [docs/plan/todo.md](docs/plan/todo.md)，并且如果该任务涉及代码变更，则必须满足上述检查要求。

### 检查选择

- `lint` 和 `typecheck` 是代码变更的基线检查，不应跳过。
- `build` 和 `test` 按改动影响按需执行，而不是每次编辑都盲目运行。
- 如果相关检查没有运行，最终交付说明中必须明确解释原因。

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
2. **格式要求**：提交消息必须符合 Conventional Commits 规范（`type(scope): description`），且 `description` 统一使用**中文或用户使用的语言**。
3. **质量前置**：提交前必须确认 A 阶段（`@code-auditor`）已放行，且 `pnpm lint`、`pnpm typecheck` 和必要的定向测试均已通过。质量门禁未通过时不得提交。
4. **原子粒度**：一个提交对应一个逻辑变更，关联且仅关联 `todo.md` 中的一个原子条目。
5. **推送禁令**：`git commit` 后不得自动执行 `git push`，推送仅限用户明确要求时执行。提交完成后应告知用户"已提交到本地，等待推送确认"。
