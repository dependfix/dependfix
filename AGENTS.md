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

当前仓库处于从 TypeScript 项目模板向 Monorepo 演进的阶段。当前 src/ 为单包结构，后续将逐步迁移到 packages/ 多包架构。

项目当前的已知基础事实包括：

- 运行环境为 Node.js >= 20
- 包管理器以 pnpm 为主
- 仓库中已有基础 CI 工作流
- 后续实现将优先围绕 Node.js / pnpm 仓库的安全告警自动修复能力展开

## 相关文档

- 架构设计：[docs/design/architecture.md](docs/design/architecture.md)
- 数据模型：[docs/design/data-model.md](docs/design/data-model.md)
- 安全设计：[docs/design/security.md](docs/design/security.md)
- 技术栈：[docs/guide/tech-stack.md](docs/guide/tech-stack.md)
- 项目规范：[docs/standards/index.md](docs/standards/index.md)
- 当前任务：[docs/plan/todo.md](docs/plan/todo.md)
- 路线图：[docs/plan/roadmap.md](docs/plan/roadmap.md)
- 待办积压：[docs/plan/backlog.md](docs/plan/backlog.md)
- 竞品分析：[docs/research/competitive-research.md](docs/research/competitive-research.md)

## AI 基建与规范复用

本项目当前处于早期开发阶段，在形成自身完整的项目规范前，**默认参照 [momei](https://github.com/CaoMeiYouRen/momei) 项目的成熟规范体系执行**。具体引用关系见 [docs/standards/index.md](docs/standards/index.md)。

最迟在正式发布（v1.0.0）前，本项目应完成规范独立化。

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
