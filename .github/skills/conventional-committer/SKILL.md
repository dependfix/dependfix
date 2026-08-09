---
name: conventional-committer
description: 需要生成 Conventional Commit 提交消息并执行单次提交时使用。适用于 feat、fix、docs、style、refactor、perf、test、build、ci、chore、revert 等常规提交场景。先检查质量门，再分析 diff，再生成符合 commitlint 预期的消息。
metadata:
  internal: true
---

# Conventional Committer

铁律：不要在不了解本次实际变更范围和质量状态的前提下直接 git add . 然后提交。

## 工作流

- [ ] Step 1: 确认是否允许提交 ⚠️ REQUIRED
	- [ ] 1.1 检查用户是否明确要求提交。
	- [ ] 1.2 确认质量检查已经完成，或明确告知仍有风险。
- [ ] Step 2: 审视变更范围 ⚠️ REQUIRED
	- [ ] 2.1 查看 git status 和 diff，识别应该提交的文件。
	- [ ] 2.2 排除临时文件、生成物和无关改动。
- [ ] Step 3: 生成提交消息 ⚠️ REQUIRED
	- [ ] 3.1 先评估改动规模：单次提交 or 分批提交（默认单类型提交，多类型仅用于互相关联较大、不宜拆分时）。
	- [ ] 3.2 按 [提交消息格式细则](#提交消息格式细则) 判断 type、决定是否需要 scope。
	- [ ] 3.3 描述聚焦"为什么"和"本次改了什么"，保持简洁可读。
	- [ ] 3.4 主题行控制在 120 字符以内（commitlint 硬限制 140）。
- [ ] Step 4: 执行提交 (conditional)
	- [ ] 4.1 只有在用户明确允许时才执行 git add / git commit。
	- [ ] 4.2 提交后复查消息是否符合 commitlint 习惯。
    - [ ] 4.3 不自动 git push，除非用户明确要求。
    - [ ] 4.4 若发现问题，立即回退并修正。
    - [ ] 4.5 默认不添加 `Co-Authored-By`，除非确实是多人合作提交。

## 提交消息格式细则

格式：`<type>(<scope>): <subject>`，可选正文（正文以 `-` 作为列表符号，每行最长 120 字符，使用中文或用户指定的语言）。

### 提交策略（先评估后提交）

1. 先评估改动规模，决定单次提交还是分批提交（分批规则见 [规划规范 §1.1 任务粒度约束](../../../docs/standards/planning.md)）。
2. 再判断类型：**默认单类型提交**；多类型提交仅用于改动互相关联较大、不宜拆分的情况。
3. 最后选择最合适的类型生成提交消息。

### 单一类型修改

```
<type>(<scope>): <subject>
<空行>
- <正文条目>
```

### 多类型修改（例外，少用）

仅当改动互相关联较大、不宜拆分时使用。选择一个最大的类型作为主类型，其他类型的改动放在正文中说明；按以下顺序决定主类型：`feat` > `refactor`/`perf` > `fix` > 其他。无关改动混入同一提交硬凑多类型属于反模式，应先拆分为独立批次。

### 特例分类（强制）

- README、API、.md、markdown 等文件及其改动一律视为 `docs`。
- unit、e2e、test 等测试文件及其改动一律视为 `test`。
- 无法确定分类时一律视为 `chore`。

### 类型说明

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

### 主题行规则

- `type` 与 `scope` 必须为英文。
- 采用祈使语气；首字母不大写；末尾不加句点。
- 最长 120 字符（推荐上限，刻意短于 commitlint 的 140 硬限制以留缓冲）。
- 主题使用简体中文或用户指定的语言；若无必要，主题中不使用括号备注，需要备注的内容放到正文中。

### 正文规则

- 以 `-` 作为列表符号；每行最长 120 字符，内容精简。
- 简单说明**做了什么**及**为什么这么做**。
- 使用简体中文或用户指定的语言。
- 若无必要可不写正文；条目不得太多，内容简单时应当无正文。

> 完整规范见 [Git 规范 §3.1 提交消息格式](../../../docs/standards/git.md)。

## 反模式

- 不看 diff，直接用模糊消息如 update files。
- 把多类变更混成一个没有 scope 的提交。
- 无关改动混入同一提交硬凑多类型（应先拆分为独立批次提交）。
- 在质量检查未完成时默认提交。
- 主题行使用括号备注（如 `feat(scope): 修复(XX)问题`），备注应放入正文。
- 主题行超过 120 字符或接近 commitlint 的 140 字符硬限制。

## 交付前检查

- [ ] 已确认本次允许提交。
- [ ] 暂存范围只包含相关变更。
- [ ] 提交消息符合 Conventional Commits 语义。
- [ ] 已说明任何未完成的质量风险。









