# 模块设计（packages）

> 本文档收录**当前已实现或正在实现**的模块设计文档，按模块职责归类。
> 专项设计、治理与杂项见 [governance](../governance/index.md)。

## 模块索引

| 模块 | 设计文档 | 状态 |
|:-----|:---------|:-----|
| 数据模型 | [data-model.md](./data-model.md) | ✅ 已落地（2026-08-05 修正） |
| GitHub client 封装 | [github-client.md](./github-client.md) | ✅ 已落地（M1） |
| Dependabot 采集器 | [dependabot-fetcher.md](./dependabot-fetcher.md) | ✅ 已落地（M1；T-G2-3 双 token 扩展） |
| 依赖升级修复器 | [dependency-fixer.md](./dependency-fixer.md) | ✅ 已落地（M1；G3 同包收敛扩展） |
| pnpm lockfile 修复器 | [pnpm-lockfile-fixer.md](./pnpm-lockfile-fixer.md) | ✅ 已落地（M1；G1 PIN_TOOLCHAIN 待接线） |
| 报告生成 | [report-generator.md](./report-generator.md) | ✅ 已落地（M1；GHSA 列/Alert Source 扩展） |
| 依赖分组升级 | [dependency-grouping.md](./dependency-grouping.md) | ✅ 已落地（T213） |
| pnpm audit fallback | [pnpm-audit-fallback.md](./pnpm-audit-fallback.md) | ✅ 已落地（T-G2-4） |

## 使用约定

- 模块设计文档只描述**单一模块**的稳定设计；跨模块的专项讨论、治理边界、迁移方案放 `governance/`。
- 设计已落地后保持文档与实现同步（实现变更时同步更新对应模块文档，如数据源/策略扩展）。
- 过时且无修正价值的模块文档归档到 `governance/archive/`（当前暂无，按需创建）。
