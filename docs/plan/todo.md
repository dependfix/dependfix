# 当前阶段任务（M2）

> M0（基线收敛）已完成，归档见 [todo-archive.md](todo-archive.md)。
> M1（MVP 单仓库修复）已完成，归档见 [todo-archive.md](todo-archive.md)。
> M3 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M2: GitHub Action 接入

**目标**: 提供可复用的 GitHub Composite Action（`action.yml`），其他仓库通过 `uses: dependfix/dependfix@v1` 引用，实现安全告警自动修复。

**设计稿**: [GitHub Action 设计](../design/github-action-workflow.md)

### 建议执行顺序

```
T201（Action 工作流）→ T202（参数对齐）→ T203（Artifact 输出）
                                              ↘
                                          T204（分支与 PR 创建）
                                              ↗
T109 ─→ T205（AI Token 支持）→ T206（Prompt 注入防护）
```

---

### T201 创建 Composite Action（action.yml）

- **优先级**: P1
- **依赖**: T109
- **状态**: ✅ 已完成
- **交付物**: `action.yml`（仓库根目录）+ `.github/workflows/security-auto-fix.yml`（dogfooding）
- **前置条件**: ✅ **设计稿已产出** [GitHub Action 设计](../design/github-action-workflow.md)

**实现摘要**:
- `action.yml`: Composite Action（`runs.using: composite`），包含 6 个步骤
- 步骤链：setup pnpm → setup Node → install+build dependfix → run CLI → upload artifact → workflow summary
- 输入：`mode` / `repos` / `severity-threshold` / `dry-run` / `max-alerts-per-repo` / `github-token`
- 输出：`report-artifact`（上传的 artifact 名称）
- 使用 `${{ github.action_path }}` 引用 action 自身目录
- Workflow 简化为调用 `uses: ./` 的薄封装（dogfooding 模式）
- 定时：每周一 UTC 6:00 自动报告

**验收标准**:

- [x] 其他仓库可通过 `uses: dependfix/dependfix@v1` 引用
- [x] Action 在消费者仓库上下文中运行（`github.repository` = 消费者）
- [x] 支持 `workflow_dispatch` + `schedule` 双触发
- [x] 报告 artifact 自动上传

---

### T202 Action 输入输出参数对齐

- **优先级**: P1
- **依赖**: T201
- **状态**: ✅ 已完成

**实现摘要**:
- 新增 `repos` 输入（留空默认 `github.repository`）
- CLI 输入完整映射：`mode` / `severity-threshold` / `dry-run` / `max-alerts-per-repo` / `repos`
- Markdown 报告写入 `$GITHUB_STEP_SUMMARY`（Actions 运行页直接可见）

**验收标准**:

- [x] Action 与本地 CLI 的配置模型保持一致
- [x] 执行结果输出到 workflow summary

---

### T203 报告 Artifact 输出

- **优先级**: P1
- **依赖**: T201, T202, T108
- **状态**: ✅ 已完成

**实现摘要**:
- `actions/upload-artifact@v4` 上传 `./dependfix-reports/` 目录
- 文件名格式：`dependfix-report-YYYYMMDD-HHmmss-{runId尾段}.md|.json`（由 `writeReport()` 自动生成；`HHmmss` 为运行开始时刻，`{runId尾段}` 为 runId 最后一个 `-` 分隔段，最多 8 字符）
- Workflow summary 直接展示 Markdown 报告内容

**验收标准**:

- [x] 一次 Action 运行结束后可下载报告产物
- [x] 报告文件名包含日期和运行 ID

---

### T204 分支与 PR 创建能力

- **优先级**: P1
- **依赖**: T201, T202, T107
- **状态**: ✅ 已完成
- **交付物**: `packages/cli/src/github/pr-creator.ts` + `fix-and-pr` 模式落地

**实现摘要**:
- `createFixBranch(runId, workDir)`: 创建 `dependfix/auto-fix-{runId尾段}` 分支（幂等，已存在则切换；尾段取 runId 最后一个 `-` 分隔段，与报告文件名后缀一致）
- `stageAndCommit(message, workDir)`: `git add .` + `git commit`（自动设置 bot user.name/email）
- `pushBranch(branchName, workDir)`: `git push origin <branch>`
- `createPullRequest({ octokit, owner, repo, ... })`: `octokit.rest.pulls.create` 创建 PR
- `generatePRBody(result)`: 从 RunResult 生成结构化 Markdown PR body
- `DependfixApp.executeFixAndPrMode()`: 修复 → 检查变更 → 创建分支 → 提交 → 推送 → 创建 PR
- `hasGitChanges()`: `git diff --quiet` 检测工作区变更，无变更则跳过 PR 创建
- Workflow permissions 升级为 `contents: write` + `pull-requests: write`

**验收标准**:

- [x] `dependfix fix-and-pr --repo owner/repo` 创建修复分支（`dependfix/auto-fix-{runId尾段}`）
- [x] 推送修复 commit 到分支
- [x] 通过 `octokit.rest.pulls.create` 创建 PR，附带报告摘要
- [x] Workflow 权限扩展为 `contents: write` + `pull-requests: write`
- [x] PR body 包含：修复摘要、变更列表、验证结果

---

### T205 GitHub Action 用户自定义 AI Token 支持

- **优先级**: P1
- **依赖**: T201, T109
- **状态**: 🔶 骨架完成（M5 联调）
- **交付物**: Action 层面的 AI Token 输入骨架

**摘要**:
- `action.yml` 预留 `ai-api-token` / `ai-api-base-url` 输入定义（由消费者通过 GitHub Secrets 传入）
- Token 传递链路：`inputs` → `env` → CLI（不出现在日志/summary）
- AI 引擎实际联调延后到 M5 T502

**验收标准**:

- [x] Action 输入骨架已实现（`ai-api-token` / `ai-api-base-url` 已加入 `action.yml`）
- [ ] AI 引擎联调（M5 T502）

> 注：M2 完成 Action 输入设计；具体字段和清洗逻辑在 M5 T502 与 AI 引擎联调时落地。

---

### T206 Prompt 注入防护机制

- **优先级**: P1
- **依赖**: T205
- **状态**: 🔶 骨架完成（M5 联调）
- **交付物**: Prompt 注入防护设计

**摘要**:
- Action 仅支持 `workflow_dispatch` + `schedule` 触发（不接受 comment trigger）
- 触发者权限由消费者 workflow 的 `permissions` 控制
- system prompt 硬编码设计已明确（M5 T502 实现）

**验收标准**:

- [x] 触发方式限制设计完成（仅 dispatch/schedule）
- [x] 权限校验由消费者 workflow 控制
- [ ] system prompt 硬编码实现（M5 T502）
- [ ] 输入清洗和结构化校验（M5 T504）

> 注：M2 完成 Action 入口的权限校验与输入约束；输入清洗和结构化校验在 M5 T502 完成后补齐。

---

## M2 完成判定

- [x] `action.yml` 可通过 `uses: dependfix/dependfix@v1` 被其他仓库引用
- [x] Action 在消费者仓库上下文中运行（`github.repository` = 消费者）
- [x] 定时运行自动产出报告 artifact + workflow summary
- [x] `fix-and-pr` 模式下能在目标仓库创建可审查的 PR
- [x] 工作流参数与本地 CLI 保持一致
- [x] T205 / T206 骨架设计完成（AI 引擎联调延后到 M5）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过

> M2 MVP 已可交付：消费者仓库可通过一行 `uses:` 接入安全告警自动修复。
>
> ⚠️ **G2 风险注记（2026-08-04）**：接入 ≠ 可用。Dependabot alerts 拉取依赖 token 权限：`GITHUB_TOKEN` 恒 403（App-only 权限，见下方 G2），消费者必须提供带 `security_events`（classic PAT）/ `Dependabot alerts: read`（fine-grained PAT）或 GitHub App token，否则静默空跑。Code Scanning 是否同样受限待验证（T-G2-2）。

---

### T207 fix 模式支持本地直接提交（--commit）

- **优先级**: P2
- **依赖**: T204（复用 stageAndCommit）
- **状态**: ✅ 已完成
- **交付物**: `packages/cli`（config / cli / app）

**实现摘要**:
- 新增 `--commit` 参数与 `AUTO_FIX_GITHUB_SECURITY_COMMIT` 环境变量（默认 `false`）：`fix` 模式修复完成后在本地当前分支直接提交（不推送、不创建 PR）
- 校验互斥：`--commit` 仅 `fix` 模式生效；与 `--dry-run` / `--create-pr` 同时启用时报配置错误
- 提交前调用 `ensureGitignore()`，避免残留报告目录被 `git add .` 提交
- `hasGitChanges()` 加固：同时检测未暂存与已暂存变更（fix-and-pr 同步受益）
- 提交失败记录为 `stage: 'fix'` / `category: 'COMMIT_FAILED'`，不影响报告生成

**验收标准**:

- [x] `dependfix fix --commit` 修复后本地提交到当前分支
- [x] 无变更时跳过提交
- [x] `--commit` + `--dry-run` / `--create-pr` / 非 fix 模式报配置错误
- [x] 报告目录不进入提交（ensureGitignore 前置）
- [x] config 测试覆盖三态解析与互斥校验（+5 用例）

---

---

## M2 增强：Action 默认 fix-and-pr + PR 去重 + 分支清理

> 2026-08-02 需求评估确认（requirement-analyst + technical-architect）：
> - 去重语义：告警未变动 → 修复结果一致 → 不重复提 PR；告警变动 → 关闭旧 PR、重评估后提新 PR，**永远给用户最新的修复 PR**
> - 指纹 = 结构化升级集（成功升级 `pkg@toVersion` 排序 + 失败包集）sha256 前 8 位；分支名 `dependfix/auto-fix-{fp8}`（去 runId）
> - 清理模式：删除前必须用户手动确认（CLI 交互 y/N；Action 仅报告清单不删除）
> - 未来增强（comment/label、固定分支）登记 [backlog.md](backlog.md)

### T208 Action workDir 语义修正

- **优先级**: P0（本次增强的地基）
- **依赖**: T201, T204
- **状态**: ✅ 已完成
- **交付物**: `action.yml` + 相关文档

**问题**: `action.yml` Run 步骤 `cd "${{ github.action_path }}"` 使修复/推送作用于 dependfix 源码快照目录，消费者 checkout（`$GITHUB_WORKSPACE`）从未被使用；alerts 来自 `repos` 指定仓库但修复文件写入 action 目录，修复对象与 PR 归属仓库脱节。

**实现摘要**:
- `action.yml` 首步增加 `actions/checkout@v5`（消费者仓库 checkout 到 `$GITHUB_WORKSPACE`，重复 checkout 幂等）
- Run 步骤在 `$GITHUB_WORKSPACE` 中执行，CLI 以 `node "${{ github.action_path }}/packages/cli/dist/bin.mjs"` 调用（build 仍在 action_path）
- artifact 上传与 summary 路径改为 `${{ github.workspace }}/dependfix-reports/`（with.path 为表达式上下文，必须 `${{ }}` 展开）
- Install and build 步骤末尾追加 smoke check（`node bin.mjs --help`），固化运行层验证
- 文档明确"消费者需 checkout（或依赖 action 内置 checkout）"，并说明内置 checkout 默认参数会清理工作区

**验收标准**:
- [x] 消费者场景修复/提交/推送作用于消费者仓库 checkout
- [x] dogfooding（`uses: ./`）场景行为不变
- [x] lint + typecheck + build 通过（test 豁免：本任务无 TS 逻辑改动，仅 action.yml 配置与文档；运行层验证由真实 runner 的 dogfooding 触发补跑，本地无法模拟）

---

### T209 Action 默认使用 fix-and-pr 模式

- **优先级**: P1
- **依赖**: T208（fix-and-pr 在 Action 中语义正确的前提）
- **状态**: ✅ 已完成
- **交付物**: `action.yml` + 文档

**实现摘要**:
- `action.yml`：`mode` 默认 `report-only` → `fix-and-pr`；`dry-run` 默认 `true` → `false`（否则触发 `dryRun && createPullRequest` 互斥校验）
- CLI 本地默认保持 `report-only` 不变（本地保守、Action 主动，两场景语义分离）
- dogfooding workflow（security-auto-fix.yml）dispatch 默认同步为 `fix-and-pr` / `false`，保持默认语义一致并自举验证新默认路径
- 文档（quick-start / 设计稿）标注**破坏性变更**：存量消费者默认行为从"只报告"变为"自动提 PR"（不自动合并，风险可控）

**验收标准**:
- [x] 无显式参数时 Action 默认执行 fix-and-pr（创建 PR）
- [x] 默认配置通过互斥校验（dry-run 默认 false）
- [x] 文档已标注破坏性变更

---

### T210 PR 去重：内容指纹 + 查重跳过 + 关旧开新

- **优先级**: P1
- **依赖**: T208
- **状态**: ✅ 已完成
- **交付物**: `packages/cli/src/github/pr-creator.ts` + `app.ts` + 测试

**实现摘要**:
- `computeFixFingerprint`：基于成功升级集（`pkg@toVersion` 排序拼接）+ 修复失败包集 + lockfile 修复状态 → sha256 取前 8 位（结构化而非 git diff，规避 pnpm 版本漂移导致的 lockfile 抖动）
- `extractFingerprintFromBranch`：从分支名提取指纹（非 `dependfix/auto-fix-` 格式返回 null → 旧 runId 分支会被 supersede）
- `findDependfixOpenPR`：`pulls.list(state=open)` 过滤 head 前缀 `dependfix/auto-fix-`（PR 数量少，单页足够；未来量大可启用 label 索引——见 backlog B1）
- `executeFixAndPrMode` 重构：修复 → hasGitChanges → 计算指纹 → 查重：
  - 无 open PR → 创建分支 `dependfix/auto-fix-{fp8}` → commit → push → create PR
  - open PR 指纹相同 → **跳过**：不提交不推送，报告记录"已有 PR #N，内容一致"
  - open PR 指纹不同 → **先创建新 PR（body 注明 `Supersedes #N`），成功后关闭旧 PR**；新 PR 创建失败则保留旧 PR
- `createFixBranch` 参数从 runId 改为完整分支名（分支名不再含 runId）
- `generatePRBody` 支持 supersededNumbers 参数
- `extractRunSuffix` 与报告文件名解耦（writer.ts 注释同步）

**验收标准**:
- [x] 同告警集重复运行不产生新 PR（幂等跳过）
- [x] 告警变化 → 关闭旧 PR + 创建新 PR，同一时刻仅一条 dependfix open PR
- [x] 新 PR 创建失败时旧 PR 不被关闭（PR action 先记录、关闭失败单独分类 PR_CLOSE_FAILED 且不中断其余关闭）
- [x] 单测覆盖：指纹确定性/顺序无关/内容变化、查重匹配、`computeFixAndPrPlan` 决策（skip/supersede/异常收敛/旧 runId 分支）、关闭参数、分支创建、PR body（pr-creator.test.ts，+23 用例）；"先建新后关旧"执行时序由代码顺序保证（新 PR 创建成功后进入关闭循环）

---

### T211 清理模式（cleanup-branches）

- **优先级**: P2
- **依赖**: T210（复用查重/分支模块）
- **状态**: ✅ 已完成
- **交付物**: `packages/cli`（config / cli / app / pr-creator）+ `action.yml`

**实现摘要**:
- `RUNTIME_MODES` 增加 `cleanup-branches`：`dependfix cleanup-branches --repo owner/repo` 独立执行清理流程（不拉 alerts、不修复）
- `listDependfixBranches`（git.listMatchingRefs 精确前缀匹配）+ `getBranchPrStatus`（`state=closed + merged_at 非空` 判定已合并，pulls.list 摘要无 merged 字段）+ `deleteRemoteBranch`（git.deleteRef，失败如分支保护 → 降级为报告提醒）
- `executeCleanupBranchesMode`：清单分类（**已合并**=安全清理 / **已关闭未合并**=supersede 孤儿 / open=跳过）→ 展示清单 → **交互式 y/N 确认（非 TTY 默认拒绝）** → 逐个删除
- 安全约束：只删 `dependfix/` 前缀、只删已合并或已关闭分支，绝不触碰 open PR 对应分支
- `FixAction.type` 扩展 `branch-cleanup`（core types + markdown-generator + actionTypeLabel），清理动作可审计
- `action.yml` 新增 `cleanup-branches` 输入（默认 `false`）：fix-and-pr 模式启用后检测已合并分支，**仅写入报告与日志清单，不自动删除**（`reportCleanupCandidates`）

**验收标准**:
- [x] `dependfix cleanup-branches` 列出清单并需 y/N 确认（非 TTY 拒绝）
- [x] 只删 `dependfix/` 前缀且仅已合并/已关闭分支
- [x] Action 启用 `cleanup-branches` 后仅输出清单不删除
- [x] 单测覆盖：listDependfixBranches / getBranchPrStatus（merged/closed/open/无 PR）/ deleteRemoteBranch 参数 / config cleanup-branches 模式解析（pr-creator.test.ts + config/index.test.ts）

### T212 分支清理增强：supersede 删旧分支 + cleanup-branches-auto

- **优先级**: P1
- **依赖**: T210（supersede 路径）、T211（分支清理原语）
- **状态**: ✅ 已完成（2026-08-04）
- **交付物**: `packages/cli`（app-helpers / app / config / cli）+ `action.yml` + 文档

**实现摘要**:
- `closeSupersededPRs` 签名改为接收 `DependfixOpenPR[]`（含 headRef）：旧 PR 关闭成功后回收其 head 分支（内容在 PR 记录中可审计）；关闭失败不删分支；删除失败仅 warn（家务活 best-effort，不触发非零退出）
- 新增 `--cleanup-branches-auto` / `AUTO_FIX_GITHUB_SECURITY_CLEANUP_BRANCHES_AUTO`：fix-and-pr 结束后**非交互**自动删除 merged/closed 的 dependfix 分支（`autoCleanupMergedBranches`）；安全边界与 T211 一致（只删 `dependfix/` 前缀、绝不删 open PR 分支）；dry-run 仅列不删；删除失败仅 warn
- 双 flag 并存时跳过 report 清单（避免同一分支出现"待清理"与"已删除"两条记录）
- action.yml / security-auto-fix.yml 新增 `cleanup-branches-auto` input
- 文档：README / quick-start 增加 GitHub "Automatically delete head branches" 设置引导 + 参数说明

**验收标准**:
- [x] supersede 关闭旧 PR 后删除其分支；close 失败不删
- [x] `--cleanup-branches-auto` 非交互删除 merged/closed，open PR 分支保留
- [x] dry-run 仅列不删；删除失败不中断不记 error
- [x] 单测：autoCleanupMergedBranches 5 用例（open 保留 / merged 删 / closed 删 / dry-run / 删除失败）+ closeSupersededPRs 2 用例（成功删 / 失败不删）+ config 2 用例

### T213 依赖分组升级（Dependency Grouping）

- **优先级**: P1
- **依赖**: G3（同包收敛 + 逐包验证回滚，已落地）
- **状态**: 🔶 待 Review Gate + 提交（代码与测试已完成，2026-08-04）
- **交付物**: `packages/cli`（fix-grouping.ts / app.ts 组级循环 / CLI 参数）+ 设计文档 + 测试
- **设计稿**: [docs/design/dependency-grouping.md](../design/dependency-grouping.md)
- **任务内容**:
  - [x] fix-grouping.ts：dependabot.yml groups 解析（pattern 匹配：精确 / `@scope/*` / `prefix*`，忽略裸 `*`）+ @types 归并/孤儿检测 + scope/前缀启发式分组
  - [x] @types 特殊处理：主包有告警→归并；主包有依赖无告警→单独组；主包不在依赖/overrides/lockfile→清理候选（不升级，日志建议移除，疑似废弃）
  - [x] app.ts 升级循环改组级：组级快速验证（lint）→ 失败整组回滚（快照）→ 拆组兜底（组内逐个升级 + 验证，成功保留）；最终全量验证门禁保留
  - [x] CLI `--upgrade-groups "name1:pkg1,pkg2;name2:pkg3"` + env `AUTO_FIX_GITHUB_SECURITY_UPGRADE_GROUPS`
  - [x] 测试：pattern 匹配 / @types 三种情况 / 启发式 / config 解析 / 组级流程 / 拆组兜底（fix-grouping 33 + app-grouping 6 + config 4 = 43 新增）
  - [x] 文档同步（README/quick-start/configuration/设计稿）
- **完成定义**:
  - [x] 分组升级后验证次数从 N 降至 G（集成测试断言验证次数）
  - [x] @types 孤儿进入清理候选日志而非升级
  - [x] 无任何分组配置时行为与逐包一致（向后兼容，集成测试覆盖）
- **遗留关联**: G3（ignore/版本上限机制承接"必须锁步"场景）、报告统计口径（alertsConverged）、端到端 dogfooding 验证

---

## 已知缺口登记

### G1 PIN_TOOLCHAIN 策略未真正固定 pnpm 版本

- **状态**: 🔶 待实现
- **位置**: `packages/cli/src/fixers/pnpm/index.ts`
- **问题**: `RepairLockfileParams.toolchain`（`toolchain.pnpmVersion`）虽被接受并文档声明"优先于 packageManager"，但 `repairLockfile()` 内部从未调用 `resolvePnpmVersion()`，`PIN_TOOLCHAIN` 策略命令与 `REGENERATE` 完全相同（`pnpm install --lockfile-only`），未按 toolchain 固定版本执行
- **引入**: 自初版 fixer 起即为 stub（类型 + 测试骨架已搭，实现未接线）
- **下一步**: 用 `resolvePnpmVersion()` 解析版本并切换为 `pnpm@<version>` / corepack 方式执行 PIN_TOOLCHAIN；落地后恢复测试名（当前测试 `accepts toolchain param (currently not consumed by implementation)` 仅保证参数被接受）
- **发现来源**: lint 清理审计（2026-08-01）

---

### G2 GITHUB_TOKEN 无法访问 Dependabot alerts API（产品设计级限制）

- **状态**: 🔴 严重（影响产品核心能力，待方案调整）
- **位置**: `action.yml`（`github-token` input）、`.github/workflows/security-auto-fix.yml`、`packages/cli/src/github/dependabot-fetcher.ts`
- **问题**: `GET /repos/{owner}/{repo}/dependabot/alerts` 对 `GITHUB_TOKEN` 恒返回 403 `Resource not accessible by integration`——即使 workflow 声明 `permissions: security-events: read` 甚至 `write-all` 也一样。Actions App 自身无安装级 **Dependabot alerts** 仓库权限，workflow `permissions` 块只能在其已有权限子集内调整。GitHub 官方文档声称 `security-events: read` 可访问该端点，与实际行为矛盾（[community discussion #60612](https://github.com/orgs/community/discussions/60612)：2023-07 报告至今未修复，2026-06 仍有人确认）
- **证据**: Security Auto Fix run [30844997175](https://github.com/dependfix/dependfix/actions/runs/30844997175)（2026-08-03）：fetch 403 → "No changes to commit — skipping PR creation" → exitCode 0 静默空跑；同一 API 用本地 PAT（`repo` scope 含 `security_events`）访问正常
- **影响**:
  1. 本仓库 dogfooding workflow（`secrets.GITHUB_TOKEN`）无法获取 Dependabot alerts，空跑且无感知
  2. 产品设计：`uses: dependfix/dependfix@v1` 消费者若按现有文档引导使用 GITHUB_TOKEN，同样拉不到 Dependabot alerts——action 必须要求具备 Dependabot alerts 权限的 PAT / GitHub App token，或调整告警获取途径
  3. CLI 错误处理缺陷：fetch 403 被当作"无告警"吞掉并以 exitCode 0 结束（与 `github-action-workflow.md` §7 声明"PERMISSION_DENIED → workflow 失败"不符）
- **调研结论**（2026-08-04，详见 [docs/research/github-token-dependabot-bug-or-design.md](../research/github-token-dependabot-bug-or-design.md) 交叉验证）:
  - ✅ **本质是故意设计**：`vulnerability-alerts` 是 **GitHub App-only 权限**，Actions 工作流 `permissions:` 键列表根本不含该权限（[gh-aw #22707](https://github.com/github/gh-aw/issues/22707)）；Actions 内置应用无该权限配置位（[#60612](https://github.com/orgs/community/discussions/60612) zaataylor 权威解释）；GitHub 对 Dependabot 相关令牌有系统性收紧历史（2021-02 起 Dependabot PR 触发 workflow 只读 + 无 secrets）
  - ⚠️ **同时是文档缺陷**：官方 REST 文档声称 PAT 需 `security_events` scope，暗示 Actions `security-events` 权限同样可用，实际对 Actions token 无效，多年未澄清（文档 bug）
  - 🔭 官方 roadmap 无开放迹象，短期不会让 GITHUB_TOKEN 获得该权限
- **解决方案矩阵**（GITHUB_TOKEN 权限不足的替代路径）:

| 方案 | 认证方式 | 优点 | 缺点/注意 | 适用场景 |
|:---|:---|:---|:---|:---|
| A. PAT（classic） | `security_events` scope（`repo` 内含） | 配置最简单；用户现有 token 可直接用 | 长期凭证；classic 权限面大 | 个人仓库快速启用 |
| B. PAT（fine-grained） | `Dependabot alerts: read`（仓库级） | 权限最小化、仓库限定、只读 | 需在 UI 创建并配置 | 个人/组织仓库推荐 |
| C. GitHub App installation token | App 配 `Dependabot alerts: read`，workflow 用 `actions/create-github-app-token`（app-id + private-key secrets）交换短期 token | 短时效、最小权限、可审计、无个人凭证 | 需创建 App + 管理私钥 secret，配置成本高 | 组织级/生产级部署（M6 平台化候选） |
| D. pnpm audit fallback | 本地 `pnpm audit --json`，无 token | 零凭证、本地可跑、非 GitHub 仓库也可用、可离线审计 | 只覆盖依赖漏洞（无 Code Scanning）；统计口径与 Dependabot 不同（advisory 数据库/解析方式/告警状态模型不同），需归一化 | CLI 本地模式 / 无 token 回退（见下） |
| E. OSV-Scanner | 本地扫描 lockfile（Google OSV 数据库） | 无 token、跨生态 | 额外工具依赖；同样口径不同需归一 | 备选数据源（未定） |
| ~~GraphQL vulnerabilityAlerts~~ | — | — | 对 Actions token 返回空结果，不可靠 | 不采用 |

  - **pnpm audit 归一化参考**（security-alert-remediator skill 的 `collect-security-alerts.mjs` 已有成熟实现）：
    - severity 归一：`info/note/low/warning/moderate/medium/high/error/critical` → GitHub 模型（`low/medium/high/critical`，warning→medium、error→high）
    - 结构映射：audit 风险 → Dependabot alert 结构（`alertNumber: audit:<pkg>:<advisoryId>`、`severity`、`patchAvailable`、`patchedVersion`、`state: open`、`summary`）
    - 去重：key = `packageName:advisoryId:severity`，paths 合并；兼容 legacy（`advisories`/`actions`）与 modern（`vulnerabilities`/`via`）两种 audit 输出格式
- **候选调整方向**（未定，需决策）:
  - 1. token 方案选择：A（最快）/ B（推荐个人）/ C（生产级）——决定后改 `security-auto-fix.yml` + `action.yml` 输入描述 + README
  - 2. CLI fetch 阶段 401/403 改为硬失败（非零退出 + 明确错误信息），杜绝静默空跑
  - 3. CLI 增加无 token 回退路径：`GITHUB_TOKEN` 缺失/403 时自动尝试 `pnpm audit`（归一化后进入同一告警流水线）——需确认统计口径差异的处置策略（报告标注数据源、不混合同源去重）
  - 4. 验证 Code Scanning alerts 是否 GITHUB_TOKEN 可访问，决定两类告警的 token 策略
- **下一步**: 用户确认 token 方案与 pnpm audit 回退是否纳入 → 调整 workflow + action 文档；补 CLI 403 硬失败处理
- **处置任务清单**（状态化，按优先级）:
  - [x] T-G2-1 CLI fetch 阶段 401/403 硬失败（P0，杜绝静默空跑）——已完成：移除 fix-and-pr stub 退出码特判（fetch 403 → exit 2）；report-only/fix/fix-and-pr catch 均附加 dependabotAlertsTokenHint 指引（commit a9e61b8）
  - [x] T-G2-2 Code Scanning alerts 对 GITHUB_TOKEN 可访问性验证（P0，决定 M3 前置与文档口径）——已完成（探针 run 30903220726）：`code-scanning/alerts` → **HTTP 200**（GITHUB_TOKEN + `security-events: read` 可用）；`dependabot/alerts` → HTTP 403 对照确认。**M3 可沿用 GITHUB_TOKEN，无需额外 token 方案**
  - [x] T-G2-3 token 方案决策与落地（P0）——已完成（方案 A + 双 token 设计）：CLI 新增 `alertsToken`（`--alerts-token` / `AUTO_FIX_GITHUB_SECURITY_ALERTS_TOKEN`，缺省回退主 token），fetch Dependabot alerts 专用 client；action.yml 新增 `dependabot-alerts-token` input（经 env 传递，避免进程列表泄露）；security-auto-fix.yml 传 `secrets.GH_PAT`。**待用户操作**：创建 fine-grained PAT（仅 `Dependabot alerts: read`）并配置仓库 secret `GH_PAT`——未配置前本仓库每周 schedule 的 Security Auto Fix 会显式失败（exit 2）提醒配置。GitHub App 方案留待 M6 平台化时评估
  - [x] T-G2-4 pnpm audit fallback 设计评估与实现（P1）——✅ 已完成（2026-08-04）：设计稿 [docs/design/pnpm-audit-fallback.md](../design/pnpm-audit-fallback.md)；决策确认（显式 `--alerts-source pnpm-audit` + 403 保持硬失败并提示切换 / `AlertSource` 扩展 `'pnpm-audit'` 独立枚举 / repository 解析 `--repo` → git remote → `local` 兜底）。实现：`packages/cli/src/alerts/pnpm-audit-fetcher.ts`（legacy+modern 双格式解析、去重、severity 归一、advisoryId 哈希 id）；config `--alerts-source` / `AUTO_FIX_GITHUB_SECURITY_ALERTS_SOURCE` + 互斥校验（`fix-and-pr`、`--repo` ≥2）；app 双源分支 + repository 解析；报告 Header 渲染 `Alert Source`；403 hint 追加切换指引。真实冒烟：dependfix 仓库 12 条高严重告警端到端跑通。测试 +33（fetcher 15 / config 10 / app 3 / report 2 / helpers 4），全量 431 通过。`fix-and-pr` 仍须 github-dependabot 源（config 校验）
  - [x] T-G2-5 规划文档闭环：roadmap M2 风险注记 / M3 前置 / M6 凭据双模型、backlog T301 / T602 调整（P1）——已完成（commit b6d04ad）
- **发现来源**: Security Auto Fix dogfooding run 30844997175（2026-08-03）；交叉验证调研（2026-08-04）

---

### G3 overrides 缺少"锁定大版本"的覆盖策略（待分析）

- **状态**: ✅ 已处理（2026-08-04）：同包收敛 + 不降级保护 + 逐包验证回滚；"大版本锁定/跨 major 确认"策略仍待 M3+ 深入（见下方遗留）
- **位置**: `packages/cli/src/helpers/index.ts`（dedupeFixableAlerts）、`packages/cli/src/app/index.ts`（processRepoForFix 升级循环）、`packages/cli/src/fixers/dependency/index.ts`（compareSemver / readLockfileVersion）
- **问题**: 当前 `pnpm overrides` 修复路径（间接依赖）直接写入告警建议的补丁版本（如 `fast-uri: ^3.1.5`），但**未处理"需锁定大版本"的场景**——当某个间接依赖的修复涉及 major 版本跨越、或多个直接依赖对同一包有不同版本约束时，overrides 需要显式锁定/对齐大版本，否则可能与其他依赖的 peer/版本约束冲突，或升级后引入破坏性变更
- **证据**: Security Auto Fix run 30910749960（2026-08-04）：fast-uri 连续 7 次 override 升级（^3.1.5 → ^3.1.1 逐个告警处理）、vite 连续 13 次升降级（^8.2.0 → ^6.4.3 → ... → ^5.4.20）——同包多次重复处理、且出现降级（downgrade）与来回抖动
- **已落地处理**（2026-08-04）:
  - `dedupeFixableAlerts`：同包多个 alerts 去重，取最高 recommendedVersion（一次升级满足所有告警，消除互相覆盖）
  - 不降级保护：当前 lockfile 版本 >= 目标版本时跳过升级
  - 逐包升级 + 快速验证（lint）+ 文件快照回滚：单包失败仅回滚该包，不再"一个包失败全部回滚"
- **遗留（后续）**:
  - **major overrides 确认机制评估（2026-08-05，run 30929090403 复盘）**：本次 brace-expansion 4.x→5.x overrides 触发 lint 失败被回滚（防护正常），但暴露"major 跨越无前置拦截"。**评估结论：暂不实现自动拦截**——① 现有逐包验证+回滚已兜住"升级破坏依赖树"（brace-expansion 案例即被正确回滚）；② major 升级的正确性无法静态判定（peer 兼容需 install 实测），前置确认只会制造"假确认"（无信息量的 y/N）；③ 更有效的低成本改进是 **P1 修复后的 fromVersion 精确化**（readLockfileVersion 已支持 pnpm v11 snapshot 格式，isMajor 判定从此有真实基线，不会再出现"unknown → ^5.0.7"式盲写）。**后续观察点**：若 major overrides 失败率持续偏高，再考虑"major overrides 仅 dry-run 报告 + 人工确认开关"（--confirm-major-overrides）
  - 多直接依赖同包不同版本约束的对齐策略
  - **P0 误伤复盘（2026-08-05，run 30933266831）**：partitionSubmanifestAlerts 初版把 `manifestPath !== 'package.json'` 全部剔除，但 **Dependabot 对间接依赖的 manifest_path 即 `pnpm-lock.yaml`** → 24 条告警全被误杀（全部 skipped、无 PR）。已修正：lockfile manifest + 非根直接依赖 → 走标准 overrides 修复；lockfile manifest + 根直接依赖（vite 场景）→ 跳过人工。**观察点**：① 根直接依赖 + lockfile manifest 一律跳过有覆盖损失（若推荐版本 > 根锁定版本其实可安全修，后续可细化为"推荐版本 < 根锁定版本才跳过"）；② monorepo 成员包（packages/x）直接依赖盲区——isRootDirectDependency 仅读根 package.json，成员包直接依赖会被误判为非直接 → overrides 全局写入，依赖 install 失败回滚兜底；③ pnpm catalog 依赖（仅存在于 pnpm-workspace.yaml）的 override 行为未实测
  - ~~不降级保护对 pnpm <9 / peer 后缀 lockfile 条目失效~~（✅ 2026-08-05 已修复：readLockfileVersion 支持 pnpm v10+/v11 snapshot 格式 `pkg@version:` / `'@scope/pkg@version':` / peer 后缀，多版本取最高防降级，见 run 30929090403 复盘 P1）
  - 报告统计口径：`alertsSkipped` 混合"不可修复 / 同包收敛 / 无需升级 / 子目录 manifest"四种语义，Fixable 与 Fixed+Failed+Skipped 不对账，需独立字段（如 alertsConverged）
  - 升级循环集成测试（包 A 成功 → 包 B 失败回滚 → A 保留）待补
  - pre-release 版本比较相等时可能误跳过（低概率，first_patched_version 通常为正式版）
- **发现来源**: Security Auto Fix dogfooding run 30910749960 / PR #23（2026-08-04）；run 30929090403 复盘（2026-08-05）

---

## 已完成登记：代码质量治理（2026-08-03）

### Q1 eslint-config-cmyr 升级 2.1.5 → 2.3.1

- [x] 升级 `eslint-config-cmyr` 至 `^2.3.1`（内置 `max-lines: 1000/600` 生产 warn；新增 `strict-type-checked` 入口）
- [x] 新增显式依赖 `typescript-eslint@^8.65.0`（与 cmyr peer 对齐）

### Q2 max-lines / max-lines-per-function 约束

- [x] 4 个 eslint.config.js（根 / core / cli / docs）统一添加 `max-lines: [1, {max: 800}]`、`max-lines-per-function: [1, {max: 500}]`，测试文件放宽 `1000/800`
- [x] `packages/cli/src/app.ts` 1092 行 → 608 行：13 个辅助方法提取至新文件 `app-helpers.ts`（602 行），通过 `AppContext` 状态切片传参，行为与类方法一致

### Q3 @typescript-eslint 严格化规则启用（no-explicit-any → no-unnecessary-type-conversion 区间）

- [x] 评估：10 条规则全量启用为 warn，仅对生产 TS 生效（测试文件豁免，避免一次性修复过多问题）；评估命中 15 处：生产 6 处已修复、测试 9 处豁免
- [x] 修复生产命中：`findDependencyVersion` String() 冗余、`rollbackOverrides` 两处 `no-dynamic-delete` 重构（Object.fromEntries 过滤替代 delete）、`errors.ts` String(remaining) 冗余、`main()` 返回类型、`toErrorMessage` unsafe-return 断言
- [x] 补测试：rollbackOverrides 多条目回滚仅移除新增项（package.json + pnpm-workspace.yaml 两路径）
- [x] 验证：lint 0 errors / typecheck 通过 / test 282 通过 / build 成功
