# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块。
- 当 `todo-archive.md` 超过 500 行或 `roadmap.md` 超过 800 行时，将早期阶段迁入分片归档。

---

## M0: 基线收敛（已归档）

> 归档日期: 2026-07-28
> 状态: 已完成

### T001 建立 Monorepo 项目骨架 ✅

- packages/core：核心领域模型库（错误、日志、告警模型、过滤器、规划器、报告、工具链、通用工具）
- packages/cli：CLI 应用入口，依赖 `@dependfix/core: workspace:*`
- pnpm workspace 配置，overrides 迁移至 pnpm-workspace.yaml

### T002 定义核心配置模型 ✅

- RuntimeConfig、RuntimeMode、SeverityThreshold 类型定义
- 环境变量 + CLI 参数多源合并（`resolveRuntimeConfig()`）
- 配置校验（token、repositories、mode/createPr/dryRun 组合约束）

### T003 固定工具链策略 ✅

- ToolchainInfo / ToolchainRecord 类型（`packages/core/src/toolchain/index.ts`）
- `resolveToolchainVersions()` — 版本优先级：packageManager → 环境变量 → config → runtime

### T004 定义标准告警模型 ✅

- NormalizedSecurityAlert（13 字段完整模型）
- SEVERITY_MAP（Dependabot ↔ Code Scanning ↔ 内部）
- FixStrategy 枚举（upgrade | lock | wait-upstream | manual）
- isFixable()、mapCodeScanningSeverity() 辅助函数
