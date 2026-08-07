# Todo Archive 分片：M0 / M1（2026-08-07 从主归档迁出）

> 本文件为 `todo-archive.md` 的早期阶段分片（按 [archive/index.md](index.md) 分片规则，主窗口保留最近 3-5 个阶段）。
> 原文归档日期：M0 2026-07-28 / M1 2026-07-30。

## M0: 基线收敛（已归档）

> 归档日期: 2026-07-28
> 阶段摘要: 参见 [roadmap.md §M0](../../roadmap.md)
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

---

## M1: MVP 单仓库自动修复（已归档）

> 归档日期: 2026-07-30
> 阶段摘要: 参见 [roadmap.md §M1](../../roadmap.md)
> 状态: 已完成
> 最终提交: `4b41b70` feat(cli): 实现 DependfixApp 编排管线与 CLI 入口串联

**阶段成果**: 跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取 → 过滤 → 修复 → 验证 → 报告的全链路闭环。192 项测试通过，lint 0 error。

### T101 实现仓库选择能力 ✅
- **交付物**: `packages/cli/src/github/repo-selector.ts`
- **实现内容**: `readReposFile()` 文件读取（支持注释跳过）、`resolveRepoList()` CLI+文件合并去重校验、citty 统一参数解析（`--repo` / `--repos-file`）
- **测试**: 9 tests

### T102 实现 GitHub 客户端封装 ✅
- **交付物**: `packages/cli/src/github/client.ts`、`errors.ts`
- **实现内容**: 引入 `@octokit/rest`、`createGitHubClient({ token })` 工厂、`mapGitHubError()` 6 种错误码映射、nock HTTP mock
- **测试**: 11 tests

### T103 接入 Dependabot Alerts 拉取 ✅
- **交付物**: `packages/cli/src/github/dependabot-fetcher.ts`
- **实现内容**: `octokit.paginate()` 自动分页、`normalizeAlert()` 映射到 `NormalizedSecurityAlert`、fixable 判定
- **测试**: 14 tests（含 fixture 5 条样例数据）

### T104 实现告警过滤与优先级引擎 ✅
- **交付物**: `packages/core/src/filters/alert-filter.ts`
- **实现内容**: `filterAlerts()` 按严重级别、`prioritizeAlerts()` 三级排序、`limitAlerts()` 截断
- **测试**: 18 tests

### T105 实现依赖升级修复器 ✅
- **交付物**: `packages/cli/src/fixers/dependency/index.ts`
- **实现内容**: `upgradeDependency()` 修改 package.json + `pnpm install --no-frozen-lockfile`、前缀保留、备份回滚
- **测试**: 31 tests

### T106 实现 pnpm frozen-lockfile 修复器 ✅
- **交付物**: `packages/cli/src/fixers/pnpm/index.ts`
- **实现内容**: `classifyLockfileFailure()` 7 分类诊断、`repairLockfile()` 多策略修复链、lockfile diff 统计
- **测试**: 35 tests
- **Fixture**: `lockfile-drift/`（normal / missing-lockfile / version-mismatch）

### T107 实现最小验证执行器 ✅
- **交付物**: `packages/cli/src/runners/verification-runner.ts`
- **实现内容**: `runVerification()` 顺序执行命令、`sanitizeOutput()` 脱敏、默认 `pnpm install/lint/build`
- **测试**: 23 tests

### T108 实现 Markdown / JSON 报告生成 ✅
- **交付物**: `packages/core/src/report/`（types / markdown-generator / json-generator / writer）
- **实现内容**: 6 类型定义、`generateMarkdownReport()` 6 节模板、`generateJsonReport()`、`writeReport()`
- **测试**: 33 tests

### T109 实现本地运行入口 ✅
- **交付物**: `packages/cli/src/app.ts`（DependfixApp）、`packages/cli/src/bin.ts`（CLI 入口）
- **实现内容**: `DependfixApp` 类替代 M0 descriptor 模式、3 种运行模式、`--dry-run` / `--verbose`、脚本存在性校验、退出码 0/1/2、bin 字段
- **收尾**: 清理 6 组 M0 descriptor stubs（-106 行）

### MVP 完成判定（全部通过）
- [x] `dependfix report --repo owner/repo`
- [x] Dependabot alerts 拉取 + 严重级别过滤
- [x] 可升级依赖自动修复（本地文件变更）
- [x] pnpm frozen-lockfile 漂移修复
- [x] 最小验证（install + lint + build）
- [x] Markdown + JSON 报告生成
- [x] typecheck + lint + test 全部通过
