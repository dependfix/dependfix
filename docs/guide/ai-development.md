# AI 协同开发指南

本指南介绍如何利用 AI 智能体参与 dependfix 项目开发。

## 1. Agent-First 使用方法

本项目默认采用 Agent-First 方式：用户直接把目标交给 Agent，由 Agent 判断是否需要调用 Skills 完成。

具体定义参考 `AGENTS.md`，执行口径参考 [AI 资产治理规范](../standards/ai-governance.md)。

## 2. 规则来源层次

| 层级 | 文件 | 作用 |
|------|------|------|
| L0 | `AGENTS.md` | 项目级 AI 行为准则、安全红线 |
| L1 | `docs/standards/*.md` | 专项规范（开发、测试、文档、安全等） |
| L2 | `docs/design/*.md` | 架构与数据模型设计 |
| L3 | 平台适配文件 | 工具差异、目录发现 |

冲突顺序：L0 > L1 > L2 > L3。

## 3. 常用 Skills

| 任务类型 | 推荐 Skill |
|----------|-----------|
| 需求澄清 | requirement-analyst |
| 代码审查 | code-reviewer |
| 上下文扫描 | context-analyzer |
| 提交代码 | conventional-committer |
| 文档同步 | documentation-specialist |
| 质量检查 | quality-guardian |
| 安全审计 | security-guardian |
| 技术方案 | technical-architect |
| 编写测试 | test-engineer |

## 4. PDTFC+ 工作流

1. **Plan**: 先核对事项是否属于 `todo.md` 当前范围。
2. **Do / Audit**: 先出受影响文件清单和修改范围，实现后必须通过 code-reviewer 审查。
3. **Validate / Test**: 检查 lint、typecheck、测试证据，不接受"已验证"的口头结论。
4. **Finish**: 确认 `todo.md`、相关文档是否同步更新。

## 5. 给开发者的建议

- **清晰定义意图**: 需求模糊时，让 AI 先进行需求采访。
- **信任但核实**: 架构选择由你把控，审查 Do 阶段产物后再进入 Commit。
- **搜索优先**: 修复失败超过 1 次或遇到不熟悉技术时，先搜索外部信息再继续。
- **单一主责**: 决策、写入和 Review 结论保持单一主责，避免多人同时改同一份文件。

## 6. 相关文档

- [AI 资产治理规范](../standards/ai-governance.md)
- [外部 Skills 准入清单](../standards/external-skills-intake.md)
- [开发规范](../standards/development.md)
