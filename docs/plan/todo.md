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
  - [ ] T-G2-1 CLI fetch 阶段 401/403 硬失败（P0，杜绝静默空跑）
  - [ ] T-G2-2 Code Scanning alerts 对 GITHUB_TOKEN 可访问性验证（P0，决定 M3 前置与文档口径）
  - [ ] T-G2-3 token 方案决策与落地：security-auto-fix.yml + action.yml 输入描述 + README 消费者引导（P0，待用户决策 PAT / GitHub App）
  - [ ] T-G2-4 pnpm audit fallback 设计评估：无 token 本地回退，口径归一化与数据源标注策略（P1）
  - [ ] T-G2-5 规划文档闭环：roadmap M2 风险注记 / M3 前置 / M6 凭据双模型、backlog T301 / T602 调整（P1）
- **发现来源**: Security Auto Fix dogfooding run 30844997175（2026-08-03）；交叉验证调研（2026-08-04）

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
