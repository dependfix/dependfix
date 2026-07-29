# 当前阶段任务（M1）

> M0（基线收敛）已完成，任务归档见 [todo-archive.md](todo-archive.md)。
> M2 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M1: MVP 单仓库自动修复

**目标**: 跑通单仓库、Node.js / pnpm 生态下的 Dependabot 告警拉取 → 过滤 → 修复 → 验证 → 报告的全链路闭环。

**平台化前瞻**: M1 实现时将核心编排逻辑与 CLI 入口保持松耦合。避免在 `runCli()` 中直接硬编码 `process.env` / `console.log`，为后续 M6 平台解耦减少工作量。

### 建议执行顺序

```
T102（GitHub 客户端）→ T103（告警拉取）
                                    ↘
T101（仓库选择）                        T104（过滤引擎）→ T105（依赖修复）→ T106（lockfile 修复）→ T107（验证执行）
                                    ↗
T901（样例数据，与实现并行）           → T108（报告生成）→ T109（CLI 入口串联）
```

---

### T101 实现仓库选择能力

- **优先级**: P0
- **依赖**: T002
- **状态**: ✅ 已完成
- **实现文件**: `packages/cli/src/github/repo-selector.ts`

**实现摘要**:
- `readReposFile(filePath)` 从文件读取仓库列表（支持 `#` 注释、空行跳过、逐行校验）
- `resolveRepoList(cliRepos, reposFilePath?)` 合并 CLI 与文件仓库列表、去重、校验
- `parseCliArgs` 新增 `--repo` 简写、`--repos-file` 标志；迁移到 **citty** 统一参数解析（自动 `--help`、类型推断）
- `CliConfigOverrides` 新增 `reposFilePath` 字段
- `repo-selector.test.ts`: 9 tests 覆盖文件读取、注释空行、校验、去重

**验收标准**:

- [x] 支持 CLI `--repo owner/repo` 传入单个仓库（已有基础校验）
- [x] 支持 `--repo` 逗号分隔多仓库：`--repo a/b,c/d`
- [x] 支持 `--repos-file path/to/repos.txt` 从文件读取（每行一个 `owner/repo`）
- [x] 非法标识（无 `/`、空格、多 `/`）在解析阶段报错，给出明确格式提示
- [x] 返回去重后的仓库列表

**非目标**: 不实现 owner 级自动发现（M4 T401）

---

### T102 实现 GitHub 客户端封装

- **优先级**: P0
- **依赖**: T002, T004
- **状态**: ✅ 已完成
- **前置条件**: ⚠️ **先出设计稿** [GitHub 客户端接口设计](../design/github-client.md)（已完成）

**实现摘要**:
- 引入 `@octokit/rest` 替代手写 fetch 封装（M1-M4 累计 ~15 个端点，octokit 自带类型推导、`paginate()` 一行分页）
- `createGitHubClient({ token })` 工厂函数，内部 `new Octokit({ auth: token })`
- `mapGitHubError(error, context)` 6 种错误码映射（401→AUTH_FAILED, 403→RATE_LIMITED/PERM_DENIED, 404→NOT_FOUND, 4xx/5xx→API_ERROR, 网络→NETWORK）
- Mock 用 `nock` 拦截 HTTP 层，不维护 Mock 客户端
- `GITHUB_ERROR_CODES` 枚举统一放入 `packages/core/src/errors/error-codes.ts`
- `client.spec.ts`: 11 tests 覆盖 repo get、auth header、分页、6 错误码映射

**实现文件**:
- `packages/cli/src/github/client.ts` — `createGitHubClient` 工厂
- `packages/cli/src/github/errors.ts` — `mapGitHubError` 错误映射
- `packages/cli/src/github/client.spec.ts` — 11 个单元测试（nock HTTP 拦截）
- `packages/core/src/errors/error-codes.ts` — `GITHUB_ERROR_CODES` 枚举

**验收标准**:

- [x] `createGitHubClient({ token })` 返回已认证的 `Octokit` 实例（`auth: token`）
- [x] `octokit.rest.repos.get({ owner, repo })` 返回仓库基本信息（类型自动推导）
- [x] `octokit.paginate(octokit.rest.dependabot.listAlertsForRepo, { state, per_page })` 自动分页拉取 Dependabot 告警
- [x] 请求失败时 `mapGitHubError(error, context)` 抛 `AppError`，包含 code + HTTP 状态码 + request URL
- [x] 错误码覆盖 6 种场景：`AUTHENTICATION_FAILED` / `RATE_LIMITED` / `PERMISSION_DENIED` / `REPO_NOT_FOUND` / `GITHUB_API_ERROR` / `NETWORK_ERROR`
- [x] 单元测试覆盖：正常响应、auth header、分页、401/403/403-rate/404/422/500/网络异常（11 tests 全部通过）

**非目标**: 不引入 `@octokit/plugin-throttling`（M2 引入）；不封装自定义类，直接暴露 Octokit 实例

---

### T103 接入 Dependabot Alerts 拉取

- **优先级**: P0
- **依赖**: T102, T004
- **状态**: 未开始
- **前置条件**: ✅ **设计稿已产出** [Dependabot 告警采集设计](../design/dependabot-fetcher.md)

**设计稿应明确**:
- 调用的 GitHub API 端点（Dependabot alerts REST API）
- 增量拉取策略（全量 vs 增量，如何标记已处理）
- 与 T102 GitHub 客户端的接口约定
- 异常场景处理（权限不足、仓库无告警、API 不可用）

**实现文件**: `packages/cli/src/github/dependabot-fetcher.ts`

**验收标准**:

- [ ] `fetchDependabotAlerts(client, { owner, repo, state: 'open' })` 返回 `NormalizedSecurityAlert[]`
- [ ] 正确映射：`dependabot severity` → `Severity`、`package_name` → `packageName`、`vulnerable_version_range` → 解析范围
- [ ] 建议版本从 `security_advisory` / `security_vulnerability.first_patched_version` 提取
- [ ] 状态过滤：只拉 `state === 'open'` 的告警
- [ ] 分页自动处理：单页最多 100 条，自动翻页合并结果
- [ ] 异常处理：权限不足 → `PERMISSION_DENIED`、API 不可用 → `GITHUB_API_ERROR`、仓库不存在 → `REPO_NOT_FOUND`
- [ ] 集成测试：用样例数据 mock GitHub API 响应，验证映射正确性

**非目标**: 不拉 Code Scanning 告警（M3 T301）

---

### T104 实现告警过滤与优先级引擎

- **优先级**: P0
- **依赖**: T103
- **状态**: ✅ 已完成
- **实现文件**: `packages/core/src/filters/alert-filter.ts`

**实现摘要**:
- `filterAlerts(alerts, { severityThreshold })` 按严重级别过滤（`>= critical` → 仅 critical，`>= high` → critical+high，`>= medium` → +medium，`all` → 全保留）
- `prioritizeAlerts(alerts)` 三级排序：fixable 优先 → 严重级别降序 → 包名字母序
- `limitAlerts(alerts, maxPerRepo)` 截断，超出部分以 `truncated` 返回含原因
- 纯函数、无副作用，18 个单元测试覆盖所有阈值组合、排序验证、截断、空输入
- `SeverityThreshold` 类型收敛到 `@dependfix/core`，cli config 通过 `export type { SeverityThreshold }` 重导出消除重复

**验收标准**:

- [x] `filterAlerts(alerts, { severityThreshold: 'high' })` 过滤严重级别
  - `>= critical`：只留 critical
  - `>= high`：留 critical + high
  - `>= medium`：留 critical + high + medium
  - `all`：全保留
- [x] `prioritizeAlerts(alerts)` 排序：`fixable` 优先 → 严重级别降序 → 包名字母序
- [x] `limitAlerts(alerts, maxPerRepo: 20)` 截断，超限时返回 truncated 含原因（由调用方决定是否记录日志）
- [x] 返回值包含 `filtered`（过滤后列表）和 `skipped`（被跳过列表及原因）
- [x] 纯函数、无副作用、单元测试覆盖所有阈值组合

---

### T105 实现依赖升级修复器

- **优先级**: P0
- **依赖**: T003, T104
- **状态**: ✅ 已完成
- **前置条件**: ✅ **设计稿已产出** [依赖升级修复设计](../design/dependency-fixer.md)

**实现摘要**:
- `upgradeDependency({ packageName, targetVersion, workDir })` 直接修改 `package.json` + `pnpm install --no-frozen-lockfile`
- 保留原始版本前缀（`^` / `~` / 精确），不强制改为精确版本
- 升级前备份 `package.json` + `pnpm-lock.yaml`（`.bak`），`pnpm install` 失败自动回滚
- `findDependencyVersion()` 按 `dependencies` → `devDependencies` → `optionalDependencies` 查找
- `extractPrefix()` / `parseMajorVersion()` 分别处理前缀保留和 major 判定
- 向后兼容保留 M0 的 `createDependencyFixerDescriptor()` stub
- `index.test.ts`: 31 tests 覆盖 happy path / 前缀保留 / major 检测 / 回滚 / 边界

**实现文件**: `packages/cli/src/fixers/dependency/index.ts`

**验收标准**:

- [x] `upgradeDependency({ packageName, targetVersion, workDir })` 执行单包升级
- [x] 升级后 `package.json` 和 `pnpm-lock.yaml` 已更新
- [x] 返回 `DependencyFixResult { packageName, fromVersion, toVersion, isMajor, success }`
- [x] 升级失败时恢复 `package.json` 和 lockfile（备份 → 升级 → 失败则还原）
- [x] 集成测试：在临时目录创建最小 `package.json` + `pnpm-lock.yaml`，执行升级后校验文件内容

---

### T106 实现 pnpm frozen-lockfile 修复器

- **优先级**: P0
- **依赖**: T003, T105
- **状态**: ✅ 已完成
- **前置条件**: ✅ **设计稿已产出** [lockfile 修复设计](../design/pnpm-lockfile-fixer.md)

**实现摘要**:
- `repairLockfile({ workDir, toolchain? })` 诊断 → 逐级修复 → 验证三阶段流程
- 7 分类诊断：按关键词匹配 pnpm `--frozen-lockfile` 错误输出
- 按分类选取策略链：`REGENERATE` (`--lockfile-only`) / `FIX_ENTRIES` (`--fix-lockfile`) / `PIN_TOOLCHAIN` (corepack + packageManager) / `REINSTALL` (`--no-frozen-lockfile`)
- 每级策略执行后立即用 `pnpm i --frozen-lockfile` 验证，失败则升级到下一级
- `CREDENTIAL_ERROR` 直接 SKIP，不可修复
- 修复前备份 `pnpm-lock.yaml` → 全部策略失败后回滚 → cleanup
- `computeLockfileDiff()` 统计行数 + packages 条目数变化
- `resolvePnpmVersion()` 优先级：toolchain > packageManager > null
- 35 个单元测试覆盖所有分类、策略链、回滚、边界

**实现文件**: `packages/cli/src/fixers/pnpm/index.ts`

**验收标准**:

- [x] `repairLockfile({ workDir, toolchain })` 检测并修复 lockfile 漂移
- [x] 修复流程：固定 pnpm 版本 → `pnpm install --lockfile-only` → `pnpm install --frozen-lockfile` 验证
- [x] 记录 lockfile diff 摘要（行数变化、包数量变化）
- [x] 返回 `LockfileRepairResult { success, failureCategory?, diff? }`
- [x] 集成测试覆盖：lockfile 缺失、版本不一致、间接依赖漂移三种场景

---

### T107 实现最小验证执行器

- **优先级**: P0
- **依赖**: T105, T106
- **状态**: ✅ 已完成
- **实现文件**: `packages/cli/src/runners/verification-runner.ts`

**实现摘要**:
- `runVerification({ workDir, commands? })` 按顺序执行，任一失败即停止
- 默认命令链：`pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm build`
- 使用 `spawn` + `shell: true` 执行任意 shell 命令
- 每条命令记录：文本、耗时、退出码、stdout/stderr 摘要（截断到 200 行）
- `sanitizeOutput()` 脱敏：GITHUB_TOKEN、NPM_TOKEN、token=/secret= 模式、URL 认证信息
- 命令不存在时捕获 spawn error（exitCode=-1）
- 23 个单元测试覆盖 happy path / 失败停止 / 截断 / 脱敏 / 边界

**验收标准**:

- [x] `runVerification({ workDir, commands?: string[] })` 按顺序执行命令
- [x] 默认命令：`pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm build`
- [x] 支持仓库级自定义命令（如 `pnpm test`）
- [x] 每个命令记录：命令文本、耗时（ms）、退出码、stdout/stderr 摘要（截断到 200 行）
- [x] 任一命令失败 → 停止后续命令、返回 `VerificationResult { success: false, failedCommand, failure }`
- [x] 日志中不泄漏 token / 密码

---

### T108 实现 Markdown / JSON 报告生成

- **优先级**: P0
- **依赖**: T103, T104, T105, T106, T107
- **状态**: 未开始
- **前置条件**: ✅ **设计稿已产出** [报告生成设计](../design/report-generator.md)

**设计稿覆盖**:
- 6 类型定义：RunResult / RunSummary / RepositoryResult / FixAction / FixError / RunReportConfig
- Markdown 报告 6 节模板：元信息 → 汇总表 → 严重级别分布 → 仓库明细 → 修复动作 → 错误
- JSON 报告：`JSON.stringify(RunResult)` 零序列化逻辑
- 文件命名：`dependfix-report-{YYYYMMDD}-{runId}.{md|json}`
- 输出目录：默认 `./dependfix-reports/`，自动创建
- 映射函数将 T105/T106/T107 结果转为 FixAction

**实现文件**:
- `packages/core/src/report/markdown-generator.ts`
- `packages/core/src/report/json-generator.ts`

**验收标准**:

- [ ] `generateMarkdownReport(result: RunResult): string`
  - 运行元信息：时间、模式、阈值、仓库数
  - 汇总统计：扫描仓库数、命中告警数、已修复数、失败数、跳过数（表格）
  - 按仓库明细：每个仓库的告警列表（表格）
  - 按严重级别统计（表格）
  - 失败原因分类（表格）
  - 生成的修复链接（若有 PR）
- [ ] `generateJsonReport(result: RunResult): string`
  - 包含 `runId`、`startedAt`/`finishedAt`、`config`、`summary`、`repositories[]`、`alerts[]`、`actions[]`、`errors[]`
  - JSON 格式合法、可被 `JSON.parse` 解析
- [ ] 报告写入文件：`writeReport(mdContent, jsonContent, outputDir)`
- [ ] 单元测试验证 Markdown 和 JSON 的结构正确性

**非目标**: 不实现 HTML 报告、不发送邮件通知

---

### T109 实现本地运行入口

- **优先级**: P0
- **依赖**: T101, T108
- **状态**: 未开始
- **实现文件**: `packages/cli/src/app.ts`（改造）、`packages/cli/src/cli/main.ts`
- **设计约束**: 脚本存在性校验在 T109 编排层完成，不放入 `runVerification` 执行器内部

**验收标准**:

- [ ] `dependfix report --repo owner/repo` → 拉取告警 + 生成报告（不执行修复）
- [ ] `dependfix fix --repo owner/repo` → 拉取 + 过滤 + 修复 + 验证（不推送、不创建 PR）
  - [ ] 验证阶段的默认命令链中，脚本命令（`pnpm lint` / `pnpm build`）执行前校验 `package.json#scripts` 是否存在对应键
  - [ ] 缺失脚本 → 记录跳过原因（如 `skipped: no "lint" script`），不视为失败，不传递给 `runVerification`
  - [ ] 用户通过 `--commands` 自定义的命令不校验（由用户保证正确性）
- [ ] `dependfix fix-and-pr --repo owner/repo` → 预留模式（M1 阶段只做参数校验，实际 PR 创建在 M2 实现）
- [ ] `--dry-run` 标志：打印将执行的操作列表，不实际写入文件
- [ ] `--verbose` 标志：输出详细日志（每步耗时、API 调用详情）
- [ ] 错误处理：优雅退出，输出结构化错误原因（非裸堆栈）
- [ ] 退出码：成功 `0`、部分失败 `1`、全部失败 `2`

---

## MVP 完成判定

- [ ] 能手动指定一个仓库执行 `dependfix report --repo owner/repo`
- [ ] 能拉取 Dependabot alerts 并完成严重级别过滤
- [ ] 能对可升级依赖执行自动修复（本地文件变更）
- [ ] 能处理典型 `pnpm i --frozen-lockfile` 漂移错误
- [ ] 能执行最小验证（install + lint + build）并输出成功或失败原因
- [ ] 能生成 Markdown 和 JSON 报告到本地文件
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过
- [x] T102/T103/T105/T106/T108 的设计稿已产出（T102 ✅ T103 ✅ T105 ✅ T106 ❌ T108 ❌）

---

## 并行横切任务（M1 期间同步推进）

### T901 测试与样例数据

- [ ] `packages/core/src/alerts/__fixtures__/dependabot-alerts.json`：至少 5 条真实 Dependabot API 响应样例（覆盖 critical/high/medium、fixable/non-fixable、不同生态）
- [ ] `packages/cli/src/fixers/pnpm/__fixtures__/lockfile-drift/`：3 个最小 pnpm 项目（正常、lockfile 缺失、版本不一致）
- [ ] `packages/core/src/alerts/__fixtures__/code-scanning-alerts.json`：至少 3 条 Code Scanning API 响应样例（为 M3 准备）

### T902 单元测试与集成测试

- [ ] `packages/core/src/filters/alert-filter.test.ts`：全部阈值 + fixable 排序 + 截断
- [ ] `packages/core/src/report/markdown-generator.test.ts`：验证输出结构
- [ ] `packages/cli/src/fixers/pnpm/index.test.ts`：lockfile 修复关键路径
- [ ] 核心模块覆盖率 >= 80%

### T903 日志、错误码与审计字段统一

- [ ] `packages/core/src/logger.ts`：统一 JSON 日志字段（`runId`、`repository`、`alertId`、`step`、`duration`、`level`）
- [ ] `packages/core/src/errors/app-error.ts`：错误码枚举（`PERMISSION_DENIED | GITHUB_API_ERROR | REPO_NOT_FOUND | CONFIG_VALIDATION_ERROR | LOCKFILE_REPAIR_FAILED | VERIFICATION_FAILED | UPGRADE_FAILED`）
- [ ] 日志/报告中不输出 token、密码
