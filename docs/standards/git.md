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
3. **质量前置**：提交前必须确认 A 阶段（`Code Auditor (代码审计员)`）已放行，且 `pnpm lint`、`pnpm typecheck` 和必要的定向测试均已通过。质量门禁未通过时不得提交。
4. **原子粒度**：一个提交对应一个逻辑变更，关联且仅关联 `todo.md` 中的一个原子条目。
5. **分批提交（长任务强制）**：单次提交规模建议与拆分规则见 [规划规范 §1.1 任务粒度约束](./planning.md)；按"可独立验证"的顺序分批次提交，每批独立过 Review Gate；锁文件（pnpm-lock.yaml）等随其所属批次提交。
6. **推送禁令**：`git commit` 后不得自动执行 `git push`，推送仅限用户明确要求时执行。提交完成后应告知用户"已提交到本地，等待推送确认"。

### 3.1 提交消息格式

提交消息必须符合 Conventional Commits 规范，格式：`<type>(<scope>): <subject>`，可选正文。

**提交策略（先评估后提交）**：

1. 先评估改动规模，决定单次提交还是分批提交（分批规则见 [规划规范 §1.1 任务粒度约束](./planning.md)）。
2. 再判断类型：**默认单类型提交**；多类型提交仅用于改动互相关联较大、不宜拆分的情况。
3. 最后选择最合适的类型生成提交消息。

**单一类型修改**：

```
<type>(<scope>): <subject>
<空行>
- <正文条目>
```

**多类型修改（例外，少用）**：仅当改动互相关联较大、不宜拆分时使用。选择一个最大的类型作为主类型，其他类型的改动放在正文中说明；按以下顺序决定主类型：`feat` > `refactor`/`perf` > `fix` > 其他。无关改动混入同一提交硬凑多类型属于反模式，应先拆分为独立批次。

**特例分类（强制）**：

- README、API、.md、markdown 等文件及其改动一律视为 `docs`。
- unit、e2e、test 等测试文件及其改动一律视为 `test`。
- 无法确定分类时一律视为 `chore`。

**类型表**：

| 类型 | 说明 | 示例作用域 |
| --- | --- | --- |
| `feat` | 新功能 | user、payment |
| `fix` | 漏洞修复 | auth、data |
| `docs` | 文档 | README、API |
| `style` | 代码风格 / 格式化 | formatting |
| `refactor` | 代码重构 | utils、helpers |
| `perf` | 性能优化 | query、cache |
| `test` | 测试 | unit、e2e |
| `build` | 构建系统 | webpack、npm |
| `ci` | 持续集成配置 | workflows、dependabot |
| `chore` | 其他修改 | scripts、config |
| `revert` | 代码回滚 | - |

**主题行（subject）规则**：

- `type` 与 `scope` 必须为英文。
- 采用祈使语气；首字母不大写；末尾不加句点。
- 最长 120 字符（推荐上限，刻意短于 commitlint 的 140 字符硬限制以留缓冲，避免误触发）。
- 主题使用简体中文或用户指定的语言；若无必要，主题中不使用括号备注，需要备注的内容放到正文中。

**正文规则**：

- 以 `-` 作为列表符号；每行最长 120 字符，内容精简。

### 3.2 单文件跨 type 改动需提前规划 commit 拆分

- 单文件同时改 2 个不同 type 的逻辑（如 `ImportReposDialog.vue` 同时含 `fix C48` + `chore C47`）时，不能直接 `git add` 整个文件——commit 拆分需分三步：
  1. 先 `git restore --staged <file>` 或 `git reset`，只 edit 保留其中一个逻辑的 diff
  2. `git add <file>` + `git commit`（commit 1）
  3. 再 edit 加回第二个逻辑 + `git add <file>` + `git commit`（commit 2）
- 实现阶段提前识别"单文件跨 type"会节省后续 reset/re-edit 成本。
- 替代方案：将不同 type 改动拆分到不同文件（新增组件 / helper），从源头避免单文件跨 type。

### 3.3 阶段任务分批提交避免单次大 diff 成本失控

- 阶段任务（T-编号 / M-编号）按依赖与职责切分为多个 atomic commit（如 B1 RuntimeAdapter 抽象层仅 2 文件 225 行 + 125 行测试已 lint auto-fix 触发 11 文件改动，独立 style commit 隔离连锁反应）。
- 单次大 diff 成本失控的典型症状：审计耗时指数级上升、Review Gate Reject 概率增加、回滚粒度过粗、lint auto-fix 副作用传染其他文件。
- 按"可独立验证"的顺序分批提交，每批独立过 Review Gate，锁文件（pnpm-lock.yaml）等随其所属批次提交。
- 简单说明**做了什么**及**为什么这么做**。
- 使用简体中文或用户指定的语言。
- 若无必要可不写正文；条目不得太多，内容简单时应当无正文。

**type 选择校准**：修复现有功能缺陷 → `fix`；新增能力 → `feat`。凡是"让原本坏的东西变好"都是 `fix`。

## 4. AI 行为准则

- **禁止擅自推送**: commit 后不得自动执行 `git push`，推送仅限用户明确指令。
- **工作区检查**: 每次改动前先 `git status` 确认工作区干净。
- **远程同步**: 开始前拉取远程更新（`git fetch` + `git pull --rebase`）。
