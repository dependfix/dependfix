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
- 使用中文或用户指定的语言。
- 若无必要可不写正文；条目不得太多，内容简单时应当无正文。

### 3.4 reset 重做 atomic commit（仅在 commit 未推送时适用）

- 当 commit 误把跨子批次改动纳入（如 commit 1 含 commit 2 应有的 i18n key）时，可 `git reset --soft HEAD~1` 回滚到 commit 前状态、重新分两次提交——比 `git commit --amend` 更彻底地保持原子粒度。
- **仅在 commit 未推送（ahead of remote）时适用**；已推送的 commit 必须靠后续 commit 修复或 revert，不能 reset（会与其他开发者历史冲突）。
- stage 前先 `git diff --staged` 确认本次 commit 内容边界——避免误把跨子批次改动纳入同一 commit。
- 与 [§3.2 单文件跨 type 改动需提前规划 commit 拆分](#32-单文件跨-type-改动需提前规划-commit-拆分) 配套——§3.2 处理 staged diff 误纳（`git restore --staged`），§3.4 处理已 commit 但未推送的误纳（`git reset --soft`）。
- 详见 [经验归档 §二十四](../design/governance/experience-archive.md)

### 3.5 lint auto-fix 接受策略（不要回滚，独立 chore commit 接受）

- ESLint `--fix` 自动修改（如 `@typescript-eslint/array-type` 规则偏好 `T[]` 写法替换 `Array<T>`、`@typescript-eslint/consistent-type-imports` 加 `type` 关键字等）是合规修改——两种写法 TypeScript 等价，规则要求即合规。**应该接受 + 独立 `chore` commit**——不要回滚。
- 详见 [经验归档 §四十二](../design/governance/experience-archive.md)
- 修正：lint auto-fix 是合规修改，**不要回滚**。如不希望与 docs 提交混杂，应在 commit 前 `git restore --staged <file>` 排除；如已 uncommitted，作为 standalone chore commit 独立接受。
- 实操：在每次 commit 前过一遍 lint（`pnpm lint` / `pnpm run lint:md` / `pnpm typecheck`）确认 0 error；如发现 working tree 有未提交 lint auto-fix 改动，按本节策略处理（接受并独立 commit）。

### 3.6 commit message 信息密度规范

commit message 应聚焦于"当次提交的改动"+"可供事后复查的信息"，避免堆砌与 git diff / CI 实测输出重叠的冗余。

**正文硬性约束**：

- 正文条目 1-5 条；超过必须压缩或拆分到独立 commit
- 内容简单时应当无正文——主题行已能完整说明"做了什么"
- 若有正文，每行最长 120 字符，只说明**做了什么**及**为什么这么做**

**应包含**：

- 改动总览（哪些文件/模块，改了什么）
- 关联 todo 条目（M\d+\.\d+ / T\d+ 等）
- 关键决策（多路径选择 + 为什么选这条）
- 问题原因 / 经验教训（事后复查视角，含关联 commit 引用）
- 跨模块影响时说明关联模块与同步关系

**不应包含**（git diff / CI 实测输出已涵盖，堆砌无增量价值）：

- 执行了哪些命令（如 `pnpm run check:docs` / `pnpm lint` / `pnpm typecheck` 等）
- 执行结果数字（如 "links: 103" / "lint:md 0 error" / "1001/1008 passed"）
- 改动行数（如 "+189/-3"）
- 没实证的废话（如"确切路径需源码进一步实证"——没实证就别写）
- 与本 commit 实际改动关联度低的教训段（教训应归属在 hotfix 修复 commit 而非 docs 登记 commit）

**硬约束自动拦截**：`scripts/commitlint/` 提供 4 个 commitlint plugins 在 `.husky/commit-msg` hook 阶段自动拦截上述违规：

- 规则集与正文硬性约束一一对应（不写执行命令 / 不写执行结果数字 / 不写改动行数 / 不写没实证废话与关联度低教训段）
- 拦截失败时返回 exit=1，git commit 直接拒绝
- 规则实现 + 单测详见 [scripts/commitlint/](../../scripts/commitlint/) 目录
- **`no-diff-stats` 的误伤**：规则 `[+-]\d+(?=\s|$|[,，])` 会把**日期**（`2026-09-30` → 命中 `-30`）与**色号**（`teal-700` → 命中 `-700`）判为 diff 行数 → 被 husky 拦截。**规避**：主题 / 正文避免「连字符 + 数字」紧跟空白；日期改写为「2026 年 9 月 30 日」，色号改写为 token 名（如 `primary-solid`）或让数字后紧跟非空白字符。

**commit 前轻量级审核**：执行方 self-check 4 项必查 + 触发 code-auditor quick depth 条件详见 [ai-collaboration.md §1.6 commit 前轻量级审核流程](./ai-collaboration.md)。

### 3.7 提交态自洽：amend / 提交前必须核对全部关联文件入库（M29.7 实证）

修复一个功能点时，**支撑文件必须与修复点同 commit 入库**——类型扩展 / 字段透传 / i18n key / 测试 mock 等任一项留在工作区未暂存，都会造成"提交态不自洽"（类型谎言 / i18n 裸 key / 测试断链），工作区看似正常但提交后运行时半失效。

- **执行**：`git commit` / `git commit --amend` 前先 `git status`，逐项确认所有关联文件已暂存（不只修复点文件）。
- **审计口径**：Review Gate 以「提交态自洽」而非「工作区自洽」为准。
- **反例**：M29.7 修复 commit 只含 4 文件（纯函数 + 组件 + 测试 + e2e 注释），`disabled` 透传 + i18n key 未暂存 → A 阶段审计 RG-B3 Reject。
- 详见 [经验归档 §六十五](../design/governance/experience-archive-§49-§57-recent-investigation.md#六十五m30-归档批次经验沉淀)

### 3.8 git 签名语义：commit / push 双向隔离，不提供 opt-in（M29.2 + M32.4）

dependfix 的 commit / push 必须**不受宿主 git 签名配置污染**，否则行为不可复现。两类污染与隔离方式：

| 触发配置 | 污染表现 | 隔离参数 |
|:--|:--|:--|
| 宿主 / repo `commit.gpgsign=true` | commit 带上宿主个人签名（签名身份与被修复仓库 author 不一致）；宿主无可用 key / `gpg.program` 不可用时直接 `fatal: failed to write commit object` | `-c commit.gpgsign=false` |
| 宿主 `push.gpgSign=true` | `git push` 自动带 `--signed`；服务端 `receive-pack` 不支持签名推送时 `fatal: the receiving end does not support --signed push` → `fatal: the remote end hung up unexpectedly` | `-c push.gpgSign=false` |

**单一事实源**：`packages/engine/src/github/git-signing.ts` 导出 `GIT_COMMIT_SIGNING_ISOLATION_ARGS` / `GIT_PUSH_SIGNING_ISOLATION_ARGS`（engine 与平台侧共用，禁止散落字面量——避免 commit / push 两处漂移）。**覆盖面**：commit 侧 `stageAndCommit`；push 侧全部 4 处推送调用点——`pr-creator.pushBranch` / `platform-delivery.pushFixBranchWithCredential` / `container-executor.pushFixBranch` + `cleanupRemoteBranch`（含 `--delete`）。

**只关开关、不屏蔽环境**：以 `-c <key>=false` 形式仅作用于该次调用——`-c` 的优先级高于 repo local / worktree / host global / system 配置（git 配置键**大小写不敏感**，故表中 `commit.gpgsign` 与 `push.gpgSign` 的写法差异无功能影响，按代码实际取值列出），且不写回任何配置文件。刻意**不**注入 `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM`——那会连带屏蔽宿主代理（`http.proxy`）等运行环境配置。

**策略：不提供签名 opt-in**。是否产出「签名 commit / signed push」不作为可配置项（无 CLI flag / env / action input / 平台配置）。依据：签名会把 dependfix 绑定到调用方密钥环境（需额外设计密钥来源、签名失败语义、四层暴露面），而「目标仓库强制要求签名 commit」属罕见场景。

- **重开条件**（任一出现时重新评估）：① 用户明确要求对特定目标仓库产出签名 commit；② 目标仓库分支保护规则强制 `Require signed commits` 且无法通过 PAT / App 权限例外；③ 平台需要以可验证身份签名（合规审计要求）。
- **重开时的必做项**：密钥来源（用户配置 signingkey / 目标仓库要求）、签名失败语义（硬失败并回滚交付 vs 降级）、四层暴露面（CLI / env / action / 平台配置）统一，以及本表两条隔离参数的默认值保持「关闭」。
- **不做的边界**：不改宿主 `~/.gitconfig`；不关闭用户手工 git 操作的签名；不回溯已产生的 commit / push；不做目标仓库保护规则预检。

**取证口径（可复现）**：反例对照必须能击破断言——`packages/engine/src/github/git-signing.test.ts` 在同一次执行内先证「宿主 `push.gpgSign=true` 时裸 `git push` 必失败（`does not support --signed push`）」，再证「`pushBranch` 成功」，避免"环境恰好不触发签名"导致的恒真断言。

## 4. AI 行为准则

- **禁止擅自推送**: commit 后不得自动执行 `git push`，推送仅限用户明确指令。
- **工作区检查**: 每次改动前先 `git status` 确认工作区干净。
- **远程同步**: 开始前拉取远程更新（`git fetch` + `git pull --rebase`）。
