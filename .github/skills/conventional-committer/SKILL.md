---
name: conventional-committer
description: 生成符合 Conventional Commits 规范的提交消息并执行单次提交时使用。覆盖 feat、fix、docs、style、refactor、perf、test、build、ci、chore、revert 全部常规 type；先校验质量门与 Review Gate，再审视 diff 范围生成消息，最后通过 husky commit-msg / commitlint 校验。触发场景：commit、提交、commit message、提交信息、Conventional Commits、commitlint。
metadata:
  internal: true
---

# Conventional Committer

铁律：不要在不了解本次实际变更范围和质量状态的前提下直接 `git add .` 然后提交。

## 工作流

- [ ] Step 1: 确认是否允许提交 ⚠️ REQUIRED
    - [ ] 1.1 用户已明确要求提交。
    - [ ] 1.2 A 阶段（`code-reviewer` 技能）已放行；`pnpm lint`、`pnpm typecheck` 与必要的定向测试均已通过。
    - [ ] 1.3 质量门未通过时禁止提交；若强行提交，必须在交付前明确告知风险。
- [ ] Step 2: 审视变更范围 ⚠️ REQUIRED
    - [ ] 2.1 `git status` + `git diff` 识别本次应入提交的文件。
    - [ ] 2.2 排除临时文件、生成物（`coverage/`、`artifacts/`、`*.log` 等）与无关改动。
    - [ ] 2.3 改动跨多 type / 多职责域时按 [docs/standards/git.md §3.2](../../../docs/standards/git.md) 拆分；`pnpm-lock.yaml` 必须随其所属批次一起提交，不得单独提交。
- [ ] Step 3: 生成提交消息 ⚠️ REQUIRED
    - [ ] 3.1 先评估改动规模：单次 vs 分批（默认单类型，多类型仅用于互相关联、不宜拆分）。
    - [ ] 3.2 按「type 决策规则」与「scope 命名约定」确定 type / scope。
    - [ ] 3.3 主题 ≤ 120 字符（commitlint 硬上限 140），正文每行 ≤ 120 字符。
    - [ ] 3.4 type / scope 英文；主题与正文使用简体中文（或用户显式指定语言）。
    - [ ] 3.5 不向后兼容变更必须加 `!` 标记并在正文末附 `BREAKING CHANGE: <说明>` 段。
- [ ] Step 4: 执行提交 (conditional)
    - [ ] 4.1 仅在用户明确允许时执行 `git add` + `git commit`；也可走 `pnpm commit`（已绑定 `cz` 交互式 CLI）。
    - [ ] 4.2 husky `commit-msg`（commitlint）与 `pre-commit`（lint-staged）会自动执行，必须确保通过；环境不兼容时方可 `--no-verify`，并显式说明原因。
    - [ ] 4.3 提交成功后**不得**自动 `git push`；必须明确告知用户「已提交到本地，等待推送确认」。
    - [ ] 4.4 默认不添加 `Co-Authored-By`，除非确实是多人合作提交。

## type 决策规则

- 让原本坏掉 / 缺失的行为变好 → `fix`。
- 新增用户可见能力或新接口 → `feat`。
- 不改变行为的代码结构调整 → `refactor`。
- 仅 markdown / 文档 / 计划 / 规范 / 收口 → `docs`。
- 仅测试代码 → `test`。
- 仅代码风格 / 格式化（不改变语义） → `style`。
- 仅依赖 / lockfile / 工具链 → `chore(deps)` 或 `build`。
- 仅 CI / 工作流 / Dependabot 配置 → `ci`。
- 性能优化（接口不变） → `perf`。
- 撤销某次提交 → `revert`，主题写明原 commit hash。
- 仍无法确定 → `chore`。

> 完整规则与特例分类见 [docs/standards/git.md §3.1](../../../docs/standards/git.md)。

## scope 命名约定

scope 反映改动所在的目录或职责，必须英文、小写、kebab-case。本项目历史高频 scope：

| scope | 适用目录 / 场景 |
| --- | --- |
| `platform` | `apps/platform/**` |
| `engine` | `packages/engine/**` |
| `cli` | `packages/cli/**` |
| `core` | `packages/core/**` |
| `mcp` | `packages/mcp/**` |
| `skills` | `packages/skills/**`、本地 `skills/**` |
| `scripts` | `scripts/**`、根级 `*.mjs` 脚本 |
| `plan` | `docs/plan/**`（todo、todo-archive、backlog 等） |
| `guide` | `docs/guide/**` |
| `standards` | `docs/standards/**` |
| `archive` | `docs/archive/**` |
| `sandbox` | 涉及执行沙箱、cgroup、网络白名单等横切能力 |
| `coverage` | 仅覆盖率补测 / 阈值治理 |
| `deps` | 跨包依赖批量升级（commitizen / dependabot 触发的批量修复） |
| `ci` / `workflows` | `.github/workflows/**`、Dependabot 配置 |

跨多包 / 多目录的提交，使用范围最大的 scope 或 `monorepo`，并在正文区分。

## 提交消息格式

```
<type>(<scope>): <subject>

- <body>
```

- **主题行**：≤ 120 字符（推荐），硬上限 140（commitlint `header-max-length`）；祈使语气；首字母不大写；不加句点；不加括号备注；T- / C- / M- 阶段编号直接写入主题。
- **正文**：`-` 列表；每行 ≤ 120 字符；简述「做了什么」与「为什么这么做」；简单改动可不写。
- **footer**：仅在不向后兼容（`BREAKING CHANGE:`）、引用 issue（`Refs:` / `Closes:`）或 `revert` 类场景使用。
- **特例**：`.md` / README / API 类文件改动一律 `docs`；测试文件改动一律 `test`；无法归类一律 `chore`。
- **多类型变更**：按 `feat > refactor/perf > fix > 其他` 选主类型，其余改动放正文；只在改动互相关联、不宜拆分时使用。

> 完整规则、示例与 commitlint 配置见 [docs/standards/git.md §3.1](../../../docs/standards/git.md) —— git.md 为权威声明，两处不一致时以 git.md 为准。

## 反模式

- 不看 diff，直接用模糊消息如 `update files` / `修复问题`。
- 把多类变更混成一个没有 scope 的提交。
- 在质量门或 Review Gate 未放行时默认提交。
- 在 husky hook 兼容的环境下滥用 `--no-verify`。
- 主题或正文出现英文长句，违反默认简体中文约定。
- 主题中塞括号备注（如 `feat(api): 新增支付接口（兼容老逻辑）`），备注应沉到正文。
- 多类型变更没收敛主类型，导致 type 难以反映主体意图。
- 把 `pnpm-lock.yaml` 单独提交，或锁文件与依赖声明分属不同 commit。
- 单文件跨多 type 改动直接 `git add` 整文件（必须按 [git.md §3.2](../../../docs/standards/git.md) 拆分）。
- 提交后自动 `git push`，违反推送禁令。
- 提交超过 todo.md 原子条目粒度，把多个任务硬塞进一个 commit。
- 撤销提交时不写明原 commit hash 或省略 `This reverts commit <hash>.` 引用。

## 交付前检查

- [ ] 用户已明确允许本次提交。
- [ ] A 阶段（`code-reviewer`）已放行；`pnpm lint`、`pnpm typecheck`、必要的 `pnpm test` 均已通过。
- [ ] 暂存范围只包含本次变更；`pnpm-lock.yaml` 随其所属批次一起提交。
- [ ] 提交消息符合 Conventional Commits 语义且 type / scope 收敛合理。
- [ ] type / scope 使用英文，主题与正文使用简体中文（或用户指定语言）。
- [ ] 多类型变更已收敛主类型；不向后兼容时已加 `!` 与 `BREAKING CHANGE:` 段。
- [ ] 主题 ≤ 120 字符（硬上限 140），正文每行 ≤ 120 字符，未在主题中夹带括号备注。
- [ ] 已告知用户「已提交到本地，等待推送确认」；未自动 `git push`。
- [ ] 已说明任何未完成的质量风险。