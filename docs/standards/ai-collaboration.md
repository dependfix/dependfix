# AI 协作规范

本文档从 momei 继承并适配，定义 dependfix 项目的 AI 协作工作流、验证矩阵与搜索优先原则。

## 1. PDTFC+ 工作流

1. **Plan**: 核对事项是否在 `docs/plan/todo.md` 当前范围内，判断是否需要 `requirement-analyst` 介入。
2. **Do**: 先列出受影响文件与修改范围，实现完成后自检。
3. **Audit**: 强制通过 `code-reviewer` skill 审查，不可跳过。
4. **Validate**: 按验证矩阵执行检查。
5. **Test**: 按改动类型运行对应测试层级。
6. **Finish**: 确认 `todo.md`、相关文档同步更新，单次任务单次提交。

## 2. 验证矩阵

| 级别 | 检查项 | 适用场景 |
|------|--------|----------|
| V0 | 确认变更范围、文件清单 | 全部变更 |
| V1 | lint + typecheck | 全部变更（基线） |
| V2 | 单元测试 / 集成测试 | 逻辑变更 |
| V3 | E2E / 浏览器验证 | UI 变更 |
| V4 | 性能 / Lighthouse | 影响加载性能的变更 |
| RG | Review Gate（code-reviewer） | 全部变更（强制） |

变更类型 -> 最低验证级别：
- Docs：V0 + V1 + RG
- Logic：V0 + V1 + V2 + RG
- UI：V0 + V1 + V2 + V3 + RG

## 3. 搜索优先原则

触发条件（满足任一即触发）：
- 修复同一问题失败 >= 2 次
- 遇到不熟悉的库/框架/API
- 需求模糊或根因不明确
- 涉及跨平台或兼容性问题
- 需要了解最新版本特性

信息源优先级：L1（官方文档 / Context7） > L2（StackOverflow / GitHub Issues） > L3（社区博客） > L4（排除低质内容农场）

## 4. 安全红线

- 不得修改 `.env` 文件
- 不得硬编码密钥/Token
- 涉及文件路径删除前必须验证路径有效性
- 同一问题修复失败 3 次后停止并汇报

## 5. 相关文档

- [AI 资产治理规范](./ai-governance.md)
- [外部 Skills 准入清单](./external-skills-intake.md)
