# 专项设计与治理（governance）

> 本目录收录**专项设计、治理边界、迁移方案与跨模块杂项**文档，不按模块拆分。
> 已实现/正在实现的模块设计见 [packages](../packages/index.md)。

## 文档索引

| 文档 | 类型 | 状态 |
|:-----|:-----|:-----|
| [系统架构](./architecture.md) | 整体架构 | ✅ 已落地（2026-08-05 修正） |
| [安全设计](./security.md) | 安全治理 | ✅ 已落地 |
| [GitHub Action 工作流](./github-action-workflow.md) | 专项设计（Action 接入） | ✅ 已落地（M2） |
| [.gitignore 自动管理](./gitignore-management.md) | 杂项治理 | ✅ 已落地 |
| [仓库名自动推断](./repo-auto-inference.md) | 杂项设计 | ✅ 已落地 |
| [Session Wisdom 蒸馏机制](./session-wisdom-distillation.md) | AI 治理（知识沉淀） | ✅ 已落地（2026-08-06） |
| [MCP Server 设计](./mcp-server.md) | 未来规划（M6） | 🔶 未开始 |

## 使用约定

- 本目录只存放**专项讨论、治理边界、迁移方案与执行治理**文档（参照 momei governance 惯例）。
- 某个专项文档已无法对应当前实现时，应修正为治理 delta 文档，或直接归档 / 删除。
- 过时但暂不删除的文档归档到 `governance/archive/`（当前暂无，按需创建）。
