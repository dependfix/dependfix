# Git 工作流规范 (Git Workflow Standards)

## 1. 分支管理

| 分支 | 职责 |
|------|------|
| `master` | 主分支：稳定代码、版本发布与最终合并结果 |

补充约束：
- 不为 `fix`、`docs` 维护长期专用分支，修复类工作直接在 `master` 完成。
- 若某项工作需要隔离，创建短生命周期任务分支，合并后删除。

## 2. 合并与集成

- **Review 前置**: 任何改动进入 commit 前必须经过至少一轮 review。
- **未闭环不得提交**: review 指出问题但未形成结论的，不得 commit 或发起合并。

## 3. 提交规范

所有 `git commit` 操作必须遵循以下约束（与 [AGENTS.md 提交规范](../../AGENTS.md#提交规范-commit-convention) 一致）：

1. **必须使用 `conventional-committer` skill**：任何代码、文档、配置或脚本的提交都必须通过 `conventional-committer` skill 执行。禁止直接使用 `git commit -m "..."` 裸提交。
2. **格式要求**：提交消息必须符合 Conventional Commits 规范，格式：`<type>(<scope>): <description>`，且 `description` 统一使用**中文或用户使用的语言**。
3. **质量前置**：提交前必须确认 A 阶段（`@code-auditor`）已放行，且 `pnpm lint`、`pnpm typecheck` 和必要的定向测试均已通过。质量门禁未通过时不得提交。
4. **原子粒度**：一个提交对应一个逻辑变更，关联且仅关联 `todo.md` 中的一个原子条目。
5. **推送禁令**：`git commit` 后不得自动执行 `git push`，推送仅限用户明确要求时执行。提交完成后应告知用户"已提交到本地，等待推送确认"。

常用 type：`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci`

## 4. AI 行为准则

- **禁止擅自推送**: commit 后不得自动执行 `git push`，推送仅限用户明确指令。
- **工作区检查**: 每次改动前先 `git status` 确认工作区干净。
- **远程同步**: 开始前拉取远程更新（`git fetch` + `git pull --rebase`）。
