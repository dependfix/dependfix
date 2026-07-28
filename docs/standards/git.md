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

- 遵循 Conventional Commits，格式：`<type>(<scope>): <description>`
- 提交语言：中文
- 常用 type：`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `perf` / `ci`

## 4. AI 行为准则

- **禁止擅自推送**: commit 后不得自动执行 `git push`，推送仅限用户明确指令。
- **工作区检查**: 每次改动前先 `git status` 确认工作区干净。
- **远程同步**: 开始前拉取远程更新（`git fetch` + `git pull --rebase`）。
