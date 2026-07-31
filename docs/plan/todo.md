# 当前阶段任务（M2）

> M0（基线收敛）已完成，归档见 [todo-archive.md](todo-archive.md#m0-基线收敛已归档)。
> M1（MVP 单仓库修复）已完成，归档见 [todo-archive.md](todo-archive.md#m1-mvp-单仓库自动修复已归档)。
> M3 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M2: GitHub Action 接入

**目标**: 提供可复用的 GitHub Composite Action（`action.yml`），其他仓库通过 `uses: CaoMeiYouRen/dependfix@v1` 引用，实现安全告警自动修复。

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

- [x] 其他仓库可通过 `uses: CaoMeiYouRen/dependfix@v1` 引用
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

- [x] `action.yml` 可通过 `uses: CaoMeiYouRen/dependfix@v1` 被其他仓库引用
- [x] Action 在消费者仓库上下文中运行（`github.repository` = 消费者）
- [x] 定时运行自动产出报告 artifact + workflow summary
- [x] `fix-and-pr` 模式下能在目标仓库创建可审查的 PR
- [x] 工作流参数与本地 CLI 保持一致
- [x] T205 / T206 骨架设计完成（AI 引擎联调延后到 M5）
- [x] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过

> M2 MVP 已可交付：消费者仓库可通过一行 `uses:` 接入安全告警自动修复。
