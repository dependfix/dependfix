# 待办事项归档 (Todo Archive)

> 本文档包含已完成阶段的近线归档。当前活跃任务见 [todo.md](todo.md)。
> 后续阶段任务在 [backlog.md](backlog.md)。

## 深度归档索引

- 后续阶段归档分片存放于 `docs/plan/archive/` 目录。
- 归档治理规则见 [archive/index.md](archive/index.md)。

## 主窗口保留范围

- 主文档保留最近阶段的近线归档块。
- 当 `todo-archive.md` 超过 500 行时，将早期阶段迁入分片归档。

---

## M0: 基线收敛（已归档）

> 归档日期: 2026-07-28
> 阶段摘要: 参见 [roadmap.md §M0](roadmap.md#m0-基线收敛)
> 状态: 已完成

### T001 建立 Monorepo 项目骨架 ✅

- **交付物**: Monorepo 目录结构与最小入口代码
- **实现内容**:
  - `packages/core`: 核心域层（错误 `AppError`、JSON 日志 `createLogger`、告警模型 `NormalizedSecurityAlert`、过滤器接口 `AlertFilter`、规划器 `FixPlan`、报告 `RunResult`/`RunSummary`、工具链 `ToolchainInfo`/`resolveToolchainVersions`、通用工具 `compactRecord`/`ensureArray`/`isValidRepoIdentifier`）
  - `packages/cli`: CLI 入口、配置层 `resolveRuntimeConfig`（多源合并）、GitHub 集成层描述符、修复器描述符（dependency/pnpm/code-scanning）、执行器描述符
  - `pnpm-workspace.yaml`: 迁移 overrides、`minimumReleaseAge: 60`、`confirmModulesPurge: false`
  - `@dependfix/core` 可独立构建（ESM + CJS + dts）
  - `dependfix` CLI 包依赖 `@dependfix/core: workspace:*`，可独立构建
- **完成定义**: `pnpm build` / `pnpm typecheck` / `pnpm test` 全部通过

### T002 定义核心配置模型 ✅

- **交付物**: `RuntimeConfig`、`RuntimeMode`、`SeverityThreshold` 类型定义
- **实现内容**:
  - `packages/cli/src/config/index.ts`: 配置类型（`RuntimeConfig`、`CliConfigOverrides`）、默认值（`DEFAULT_RUNTIME_CONFIG`）、环境变量读取（`readEnvConfig`）
  - 多源合并优先级: CLI 参数 > 环境变量 > 默认值
  - 校验: token 缺失、repositories 为空、createPr/dryRun 组合冲突 → 抛出 `AppError`
- **完成定义**: 缺失关键配置时输出可读错误；配置解析器单测覆盖

### T003 固定工具链策略 ✅

- **交付物**: `ToolchainInfo` / `ToolchainRecord` 类型
- **实现内容**:
  - `packages/core/src/toolchain/index.ts`: `resolveToolchainVersions()` 版本优先级（`packageManager` 字段 → 环境变量 → config → runtime 探测）
  - `ToolchainRecord.before` / `ToolchainRecord.after`: lockfile 修复前后的 Node/pnpm 版本快照
  - `createDefaultToolchain()`: 基于当前运行环境生成默认工具链记录
- **完成定义**: 后续执行器能读取确定版本配置，不依赖漂移型 `latest`

### T004 定义标准告警模型 ✅

- **交付物**: `NormalizedSecurityAlert` 接口（13 字段）、`SEVERITY_MAP`、`FixStrategy` 枚举
- **实现内容**:
  - `packages/core/src/alerts/index.ts`: 告警来源（`dependabot | code-scanning`）、严重级别映射（Dependabot severity ↔ Code Scanning rule severity → 内部 `Severity`）
  - `FixStrategy` 枚举: `upgrade | lock | wait-upstream | manual`
  - 辅助函数: `isFixable(alert)`、`mapCodeScanningSeverity(ruleSeverity)`
  - 向后兼容别名: `AlertReference`（简化版 5 字段模型）
- **完成定义**: 任一数据源进入过滤层前能转换为统一模型
