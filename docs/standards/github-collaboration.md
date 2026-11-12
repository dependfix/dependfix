# GitHub 协作规范 (GitHub Collaboration Standards)

> 本文件是 issue 处理、PR 合并权限、推送授权与上游反馈的**唯一权威声明**；其他文档、agent、skill 与定时任务提示词只作一行引用，不重复条款正文。

## 1. 可信提交者

| 来源 | 判定依据 | 允许动作 |
|:--|:--|:--|
| 项目所有者 | `author_association` 为 `OWNER` | 审查后合并 |
| 仓库协作者 | `author_association` 为 `MEMBER` / `COLLABORATOR` | 审查后合并 |
| 可信机器人 | `user.type == "Bot"` 且 login 命中白名单：`dependabot[bot]`、`dependabot-preview[bot]`、`dependfix[bot]` | Mergify 自动合并（§3） |
| 其他账号 / 未登记机器人 | 不满足上述任一条 | 只审查与反馈，不合并 |

- **判定命令用 REST**（`gh pr view --json author` 只给 `is_bot` / 归一化 login，`authorAssociation` 不是合法字段，均不可直接用于判定）：

```bash
gh api repos/dependfix/dependfix/pulls/<n> --jq '{login: .user.login, type: .user.type, association: .author_association}'
gh api repos/dependfix/dependfix/issues/<n> --jq '{login: .user.login, type: .user.type, association: .author_association}'
```

- 机器人必须**显式 login 白名单**命中，不用「名字像 bot」推断；机器人账号的 `author_association` 常为 `CONTRIBUTOR`，不能用 association 判可信度。
- **PR 作者随建 PR 的认证路径而变**：PAT → 提交者本人（本仓为 `OWNER`）；GitHub App → `{app_slug}[bot]`（按实际 App 登记）；Actions 内置 `GITHUB_TOKEN` → `github-actions[bot]`。dogfood / 自动修复 PR 可能是最后一种，判定时按实际 API 返回值，不按预期身份推断。
- commit 侧的 `{app_id}+{bot_login}[bot]@users.noreply.github.com` 是提交身份形态（见 `packages/engine/src/auth/app-provider.ts`），**不用于 PR / issue 来源判定**。
- 新增可信机器人必须同时改本表白名单与 [`.github/mergify.yml`](../../.github/mergify.yml) 的 author 规则；`pnpm run check:mergify` 只保证两类 author 规则存在，表与正则的逐条一致由 A 阶段人工核对。

## 2. Issue 处理

默认只做调研，不直接进入实现：

| 来源 | 处理 |
|:--|:--|
| 可信提交者 | 评估后由用户决定是否上收为阶段任务 |
| 外部提交者 | 复现 / 核实 → 给出简短反馈；成立则保留，不成立则关闭并写明依据 |
| 可信机器人（依赖 / 扫描类） | 按告警类型走既有安全流程，不当作需求 |

- 登记 backlog 候选按 [规划规范 §3.1](planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) 执行（评估后即可登记，不需审批）；**上收为阶段任务（写入 `todo.md` 当前阶段）需项目所有者审批**。
- 关闭外部 issue 必须给出核实结论（复现步骤、不成立的判据或关联 commit），不得只写「won't fix」。
- 调研结论写在 issue 评论里；issue 不替代 todo / backlog 条目。
- issue 侧的来源判定与 PR 同口径（REST 命令见 §1）。

## 3. PR 处理

- 无论来源，PR 都必须审查；保留 / 关闭 / 合并的结论要说明依据。
- 仅可信提交者的 PR 允许合并（§1）。
- `dependabot[bot]` / `dependfix[bot]` 的 PR 继续走 Mergify 自动合并；依赖升级的风险由 CI 门禁承担（Test / Coverage / E2E / Visual Regression，集合以 `.github/mergify.yml` 为准，漂移由 `pnpm run check:mergify` 阻断），不额外增加人工评审门槛。
- `github-actions[bot]`（Actions 内置 token 建的 PR，如 dogfood 自动修复）**不纳入 Mergify，也不视为可合并来源**：按常规 PR 审查并反馈；确需合并时由项目所有者本人操作，或由可信身份重新提交。
- Mergify 未自动合并的 PR（缺 label、check 失败、冲突、规则不匹配）按常规 PR 处理：审查 → 修复 → 合并或关闭。
- 可信提交者的 PR 存在冲突或简单错误时，可直接修改后合并——范围限机械性修复：冲突解决、lint / 类型 / 断言、锁文件、文案。涉及行为变更、接口契约、执行链路或跨模块改动的，走完整 PDTFC+ 流程，不在 PR 上临时扩写。
- 外部 PR 只审查与反馈：不代改合并，不合并不可信来源的提交。

## 4. 推送授权

原始禁令见 [Git 规范 §4](git.md)；**授权窗口以本节为唯一权威**，仅以下窗口允许推送：

| 窗口 | 适用条件 | 要求 |
|:--|:--|:--|
| ① CI 修复 | 不推送就无法验证修复是否生效，含 PR 分支上的 check 修复与 Dependabot 分支的 `gh pr update-branch` | 推送后记录 run id + headSha，结论未知前不再推送 |
| ② 条目完成收口 | 一个完整条目收口（原子交付、A 阶段放行、文档同步）；机械性修复提交到可信提交者的 PR 分支同样归此窗口 | 非默认动作；建议积累若干改动后一次推送；正文或评论记录来源 PR 号 |

- 窗口外推送必须有用户明确指示。
- 推送前确认：A 阶段审计放行、`pnpm run lint:check`（涉样式另跑 `lint:css:check`）与 `pnpm typecheck` 通过、工作区无无关未暂存改动。
- 验证下限：影响打包 / 入口 / 导出 / 依赖解析的改动必须跑 `pnpm run build`，受影响面的定向测试不可跳过；其余长耗时检查可跳过，但须在推送说明中登记跳过项。
- 推送后监控 CI；CI 耗时较长可继续本地改动，但结论未知时不得叠加第二次推送。
- 红灯按失败点继续修，不做「重跑等绿」。
- 禁止 `--force` / `--force-with-lease`，禁止 `--no-verify` 跳过钩子。

## 5. 分支与 PR 提交

分支策略见 [Git 规范 §1](git.md)，本节只补 PR 收口要求：

- 满足任一条件时开短生命周期分支 + PR：改动可能影响项目整体运行状态（执行链路、数据库迁移、发布链路、公开契约）；或规模超 [规划规范 §1.1](planning.md#_1-1-硬性约束) 阈值且难以原子拆分。
- 分支 PR 必须过 CI 后合并回 `master`；分支删除见 [Git 规范 §1](git.md)。

## 6. 阶段规划输入

- 开始新阶段规划前，拉取当前 issue、PR、Actions 运行状态（`gh issue list` / `gh pr list` / `gh run list` / `gh pr checks`），把有影响的内容列入规划输入，必要时登记为 backlog 候选。
- 升级路径仍按 [规划规范 §3.1](planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement)：先评估、再入候选池，不直接写 todo。

## 7. 上游 issue 反馈

- 依赖作者为 `CaoMeiYouRen` 的包，确认属上游缺陷时可向上游提 issue；存在协作关系的上下游项目同样适用。
- 提交前必须：① 检索上游是否已有同题 issue（含已关闭）避免重复；② 按目标仓库的 issue 模板与规范撰写；③ 经用户审查授权后再提交。
- 提交后把链接回填到本仓库对应 backlog 候选或 issue 评论。

## 8. 定时巡检评论去重

- 已评估过、此后无实质更新的 PR / issue 不重复评论。
- 出现实质更新（提交、check 结论集合、状态、他人回复变化）时更新同一条常驻评论，不新增堆叠。
- 落点：评论正文含固定标记 `<!-- dependfix-triage -->`，并记录状态指纹（head SHA + check 结论集合 + 对象状态）；同一对象的评论 id / 指纹可回读，作为下次是否评论的唯一判据。

## 9. 审计挂接

- 本文件的严格约束（可信提交者白名单、合并权限、外部 issue 处理、推送窗口、上游反馈授权、评论去重）由 [Code Auditor 主责边界](../../.github/agents/code-auditor.agent.md) 的「GitHub 协作与推送授权」必查项与 [code-quality-checklist 规范条款 review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md) 逐条检查。
