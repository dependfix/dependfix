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
> 阶段摘要: 参见 [roadmap.md §M0](roadmap.md)
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
> 阶段摘要: 参见 [roadmap.md §M1](roadmap.md)
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

---

## M2: GitHub Action 接入（已归档）

> 归档日期: 2026-08-05
> 阶段摘要: 参见 [roadmap.md §M2](roadmap.md)
> 状态: 已完成（含 M2 增强批次）
> 最终提交: `c97fe2b` docs: 同步 T213 完成状态（评估发现状态滞后）

**阶段成果**: 消费者仓库可通过 `uses: dependfix/dependfix@v1` 一行接入安全告警自动修复（fix-and-pr 默认、PR 去重、分支清理、分组升级）。M2 全部 13 个任务完成（11 个 ✅ + T205/T206 骨架按设计完成，M5 联调）。G2 处置闭环（T-G2-1~5）。448 tests。

### T201 创建 Composite Action（action.yml）✅
- **交付物**: `action.yml` + `.github/workflows/security-auto-fix.yml`（dogfooding）
- **实现内容**: composite action 6 步（setup pnpm → Node → install+build → run CLI → upload artifact → summary）、`uses: ./` 薄封装、每周一 UTC 6:00 定时
- **验收**: 消费者 `uses: dependfix/dependfix@v1` 可引用、dispatch + schedule 双触发

### T202 Action 输入输出参数对齐 ✅
- **实现内容**: `repos` 输入（留空默认 `github.repository`）、CLI 完整映射、报告写入 `$GITHUB_STEP_SUMMARY`

### T203 报告 Artifact 输出 ✅
- **实现内容**: `writeReport()` 文件名 `dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md|.json`、upload-artifact 上传 `./dependfix-reports/`

### T204 分支与 PR 创建能力 ✅
- **交付物**: `packages/cli/src/github/pr-creator.ts` + fix-and-pr 模式
- **实现内容**: `createFixBranch` / `stageAndCommit` / `pushBranch` / `createPullRequest` / `generatePRBody` / `hasGitChanges`；workflow permissions `contents: write` + `pull-requests: write`

### T205 AI Token 支持（🔶 骨架，M5 T502 联调）
- **实现内容**: action.yml 预留 `ai-api-token` / `ai-api-base-url` 输入，经 env 传递（不出现在日志/summary）；AI 引擎联调延后 M5

### T206 Prompt 注入防护（🔶 骨架，M5 联调）
- **实现内容**: 触发仅 dispatch/schedule（不接受 comment trigger）、触发者权限由消费者 workflow 控制；system prompt 硬编码与输入清洗 M5 落地

### T207 fix 模式本地提交（--commit）✅
- **实现内容**: `--commit` / `AUTO_FIX_GITHUB_SECURITY_COMMIT`、互斥校验（dry-run/create-pr/非 fix）、`ensureGitignore` 前置、提交失败记 `COMMIT_FAILED` 不影响报告

### T208 Action workDir 语义修正 ✅
- **实现内容**: 首步 `actions/checkout`（消费者仓库到 `$GITHUB_WORKSPACE`）、Run 在 workspace 执行、CLI 从 action_path 调用、build 冒烟检查

### T209 Action 默认 fix-and-pr ✅
- **实现内容**: action.yml `mode` 默认 `fix-and-pr`、`dry-run` 默认 `false`；CLI 本地默认 report-only（两场景语义分离）；文档标注破坏性变更

### T210 PR 去重：内容指纹 + 查重跳过 + 关旧开新 ✅
- **实现内容**: `computeFixFingerprint`（结构化升级集 sha256 前 8 位）、`extractFingerprintFromBranch`、`computeFixAndPrPlan`（skip/supersede）、先建新后关旧；测试 +23

### T211 清理模式（cleanup-branches）✅
- **实现内容**: 独立模式（清单分类 + 交互 y/N 非 TTY 拒绝）、只删 `dependfix/` 前缀且仅 merged/closed、`FixAction.type` 扩展 `branch-cleanup`、action 仅报告清单不删除

### T212 分支清理增强（supersede 删旧分支 + cleanup-branches-auto）✅
- **实现内容**: `closeSupersededPRs` 关 PR 后回收 head 分支、`--cleanup-branches-auto` 非交互自动删除（dry-run 仅列）、双 flag 并存跳过报告清单

### T213 依赖分组升级（Dependency Grouping）✅
- **交付物**: `packages/cli/src/grouping/index.ts`（原 fix-grouping.ts）+ app 组级循环 + CLI 参数 + 设计稿
- **实现内容**: dependabot.yml groups 解析 + @types 归并/孤儿检测 + scope/前缀启发式 + 显式分组 `--upgrade-groups`；组级验证 → 整组回滚 → 拆组兜底；`buildUpgradeGroups` / `parseDependabotGroups`；测试 +43（33 分组 + 6 app 集成 + 4 config）；两轮 Review Gate APPROVE

### M2 完成判定（全部通过）
- [x] `action.yml` 可通过 `uses: dependfix/dependfix@v1` 被其他仓库引用
- [x] Action 在消费者仓库上下文中运行（`github.repository` = 消费者）
- [x] 定时运行自动产出报告 artifact + workflow summary
- [x] `fix-and-pr` 模式下能在目标仓库创建可审查的 PR
- [x] 工作流参数与本地 CLI 保持一致
- [x] T205 / T206 骨架设计完成（AI 引擎联调延后到 M5）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过

### M2 阶段治理记录（2026-08-04 ~ 2026-08-05）

#### G2 处置记录（GITHUB_TOKEN 无法访问 Dependabot alerts）

- **G2 处置闭环**: T-G2-1 fetch 401/403 硬失败（a9e61b8）→ T-G2-2 Code Scanning 探针验证（GITHUB_TOKEN 可访问，HTTP 200）→ T-G2-3 双 token 方案（alertsToken + `dependabot-alerts-token` input）→ T-G2-4 pnpm audit fallback（`--alerts-source pnpm-audit`，d9fef68）→ T-G2-5 规划文档闭环（b6d04ad）
- **G3 处理**: 同包收敛 + 不降级保护 + 逐包验证回滚（9de0fad）→ T213 分组升级（b962374）→ manifest 归属防护（640fe8c 修复跨 manifest 降级 + pnpm v11 lockfile 解析）→ P0 误伤修正（7b0fbb6，lockfile manifest 的间接依赖回归修复）
- **运行复盘**: run 30929090403（vite 降级 + lockfile 解析失效）与 run 30933266831（P0 误伤全 skip）两轮复盘修复
- **质量治理**: 代码质量 Q1-Q3（eslint 升级、max-lines 约束、严格化规则）、目录结构收敛（bb24ef0）、覆盖率统计 + Codecov 上报（1d76c24）
- **遗留观察点**: G1（PIN_TOOLCHAIN stub，承接 M3 T305）、G3 报告统计口径（alertsConverged）、major overrides 确认机制评估（暂不实现）
