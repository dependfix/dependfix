# 当前阶段任务（M2）

> M0（基线收敛）已完成，归档见 [todo-archive.md](todo-archive.md#m0-基线收敛已归档)。
> M1（MVP 单仓库修复）已完成，归档见 [todo-archive.md](todo-archive.md#m1-mvp-单仓库自动修复已归档)。
> M3 及之后阶段的任务见 [backlog.md](backlog.md)。

---

## M2: GitHub Action 接入

**目标**: 将 M1 能力接入 GitHub Actions，支持定时或手动运行，实现分支创建与 PR 提交能力。

**设计稿**: [GitHub Action 工作流设计](../design/github-action-workflow.md)

### 建议执行顺序

```
T201（Action 工作流）→ T202（参数对齐）→ T203（Artifact 输出）
                                              ↘
                                          T204（分支与 PR 创建）
                                              ↗
T109 ─→ T205（AI Token 支持）→ T206（Prompt 注入防护）
```

---

### T201 新增 GitHub Action 工作流

- **优先级**: P1
- **依赖**: T109
- **状态**: ✅ 已完成
- **交付物**: `.github/workflows/security-auto-fix.yml`
- **前置条件**: ✅ **设计稿已产出** [GitHub Action 工作流设计](../design/github-action-workflow.md)

**实现摘要**:
- `workflow_dispatch` 手动触发（mode / severity / dry-run / repos 输入）
- `schedule` 定时触发（每周一 UTC 6:00，默认 report-only）
- 最小权限：`contents: read` + `security-events: read`
- 构建链路：checkout → pnpm i → build → run CLI → upload artifact
- `concurrency` 防止重复运行

**验收标准**:

- [x] 工作流可被手动触发并执行主流程
- [x] 支持 `workflow_dispatch` 和 `schedule` 双触发
- [x] 报告 artifact 自动上传（retention 30 天）

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
- 文件名格式：`dependfix-report-YYYYMMDD-{runId}.md|.json`（由 `writeReport()` 自动生成）
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
- `createFixBranch(runId, workDir)`: 创建 `dependfix/auto-fix-{runId}` 分支（幂等，已存在则切换）
- `stageAndCommit(message, workDir)`: `git add .` + `git commit`（自动设置 bot user.name/email）
- `pushBranch(branchName, workDir)`: `git push origin <branch>`
- `createPullRequest({ octokit, owner, repo, ... })`: `octokit.rest.pulls.create` 创建 PR
- `generatePRBody(result)`: 从 RunResult 生成结构化 Markdown PR body
- `DependfixApp.executeFixAndPrMode()`: 修复 → 检查变更 → 创建分支 → 提交 → 推送 → 创建 PR
- `hasGitChanges()`: `git diff --quiet` 检测工作区变更，无变更则跳过 PR 创建
- Workflow permissions 升级为 `contents: write` + `pull-requests: write`

**验收标准**:

- [x] `dependfix fix-and-pr --repo owner/repo` 创建修复分支（`dependfix/auto-fix-{runId}`）
- [x] 推送修复 commit 到分支
- [x] 通过 `octokit.rest.pulls.create` 创建 PR，附带报告摘要
- [x] Workflow 权限扩展为 `contents: write` + `pull-requests: write`
- [x] PR body 包含：修复摘要、变更列表、验证结果

---

### T205 GitHub Action 用户自定义 AI Token 支持

- **优先级**: P1
- **依赖**: T201, T109
- **状态**: 未开始
- **交付物**: 支持通过 GitHub Secrets 传入 AI API Token

**验收标准**:

- [ ] workflow 定义增加 `AI_API_TOKEN` secret 输入
- [ ] 支持多 AI 提供商（通过 `AI_API_BASE_URL` 配置）
- [ ] Token 不在日志 / workflow summary 中输出

> 注：本任务在 M2 完成 Action 层面的 Token 输入骨架；与 AI 引擎的实际联调在 M5 T502 完成后验证。

---

### T206 Prompt 注入防护机制

- **优先级**: P1
- **依赖**: T205
- **状态**: 未开始
- **交付物**: 多层 Prompt 注入防护（Action 层面骨架）

**验收标准**:

- [ ] 仅 `workflow_dispatch` 和 `schedule` 触发，不接受 comment trigger
- [ ] 校验触发者权限（admin 或 write 权限）
- [ ] system prompt 硬编码，与外部数据严格分离

> 注：M2 完成 Action 入口的权限校验与输入约束；输入清洗和结构化校验在 M5 T502 完成后补齐。

---

## M2 完成判定

- [ ] `security-auto-fix.yml` 可通过 `workflow_dispatch` 手动触发
- [ ] 定时运行自动产出报告 artifact
- [ ] `fix-and-pr` 模式下能在目标仓库创建可审查的 PR
- [ ] 工作流参数与本地 CLI 保持一致
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` 全部通过
