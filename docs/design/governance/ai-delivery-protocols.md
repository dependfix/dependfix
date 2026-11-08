# AI 工作流与交付细则（ai-delivery-protocols）

> **状态**：✅ 已落地（2026-11-09，M56.6 规范瘦身批次）
> **范围**：从 [AI 协作规范](../../standards/ai-collaboration.md) 与 [Git 规范](../../standards/git.md) 下沉的阶段流程 / 审计校准 / CI 修复 / git 隔离细则。
> **权威性**：本文件是下列细则的唯一完整声明处；`ai-collaboration.md` / `git.md` 仅保留 hard requirement 一行摘要 + 回链。修改细则时以本文件为准，并同步回链摘要。

## 1. 阶段归档检查与沉淀工作流

PDTFC+ 闭环（F 阶段提交后）的下一阶段启动前，必须执行「阶段归档检查 + 沉淀」独立流程——**不**是归档阶段本身，是阶段之间的衔接工作：

- **① 阶段开工前归档检查（hard requirement）**：启动下一阶段 P 阶段前必须检查——`todo.md` 是否有未 `[x]` 条目（数据漂移信号，`rg "^- ### \[ \]" docs/plan/todo.md`）、`.session/wisdom.md` 活跃条目数（`pnpm distill:wisdom --check`，接近 20 阈值需蒸馏）、`experience-archive.md` 健康窗口（行数 + §号连续性）。**强制提醒**：当上一阶段 `todo.md` 仍有 `[ ]` 条目时，执行角色必须**主动询问**是否需要先归档，不得直接添加下一阶段待办。
- **② 阶段闭环后沉淀工作流（必经）**：链路为 `F → 归档批次 → 沉淀工作流 → 下一阶段 P`。步骤：**结论提炼**（判断本阶段是否有值得沉淀的内容，准入标准见 [experience-archive.md 文件头](./experience-archive.md)——未落入可执行方法论 / 需溯源的关键决策 / 同一模式已复现 >= 2 次 / 工具与环境陷阱）；**归档追加**（在 experience-archive 末尾追加新 §，编号连续，结构含案例 / 结论 / 与既有条目的关联 / 挂接治理检查点 / 准入标准复核）；**规范迁移**（把案例抽象出的可执行方法论挂接到 `docs/standards/*.md` / `.github/skills/*/SKILL.md` / `.github/agents/*.agent.md`，遵循单点声明原则，见 [documentation.md §4](../../standards/documentation.md)）；**session 沉淀**（活跃条目 >= 20 时执行 `pnpm distill:wisdom`；新 pattern 按 `pattern-*` / `principle-*` / `practice-*` 格式追加到 `.session/wisdom.md`）。
- **③ 归档 / 沉淀 commits 必须经过 A 阶段 code-auditor 深度审计（hard requirement）**：涉及 `docs/standards/*.md` / `docs/design/governance/*.md` / `.github/agents/*.agent.md` 等治理定义修改的提交，必须与 feature commits 同等标准审计，不得因「仅文档改动」或「非业务代码」跳过。**审计必查项**：跨文件 cross-reference 完整性（新增 / 修改 / 迁出章节标题时必须 `rg -n "<标题>"` 全仓库扫描并同步更新）；锚点格式正确性（`pnpm run check:docs` 0 error，commit message 须含该证据）；规范单点声明（新规则仅在权威文档完整声明一次，其他文档 / skill / agent 仅一行链接引用）；活跃 wisdom 条目数（是否触达 20 阈值，触达则先蒸馏）；**④ 与既有规范的关联**：本节是 §2.3 P 阶段暂停协议在阶段间的延伸（阶段间衔接也是用户驱动工作流）；阶段间检查可能发现「上一阶段未完成事项需插队处理」，按 §2.1 决策；预防性迁出后须按 [规划规范 §4.4](../../standards/planning.md#_4-4-大批量归档批次操作规范) 更新 cross-reference；本节引用「PDTFC+ 闭环」「A 阶段」等术语时不得孤立编号标记，必须带文档路径或章节名。

## 2. 阶段启动重复评估自检流程

**触发条件**：`todo.md` 当前阶段 banner 修改（新增阶段）；当前阶段新增 `M\d+\.\d+` 原子条目；当前阶段任务段范围 / 验收标准 / 交付物修改；用户决策修订方案上收 backlog 候选。

**5 步自检流程（hard requirement）**：① **todo-archive.md 历史阶段表格扫描**——`rg -n "已闭环|不计入本批|不计入 M\d+|ahead=0.*已推" docs/plan/todo-archive.md docs/plan/archive/todo-archive-phases-*.md`，找到「已闭环」标注的子任务则从 `todo.md` 当前阶段任务段删除对应范围；② **git log 历史核验**——`git log --oneline -- <候选相关路径>` + `git log --all --grep="<候选标识>"` + `git rev-list HEAD ^origin/master --grep="<候选标识>" --count`，已 ahead=0 推送的从任务段删除；③ **实际代码侧 anchor 核对**——`rg -n "<候选特征字段>" <候选相关路径>` 并实际打开文件，验证候选描述与实际代码一致；④ **决策描述前提矛盾厘清**——出现「参考 NNN 实施」时先验证 NNN 是否已落地（`git log --grep="NNN"` + `rg -n "NNN" docs/plan/todo-archive.md`）：已落地则候选不需增强、仅「参考实施」则保留范围；⑤ **backlog 描述同步修订**——新增条目对应 backlog 候选时**必须**同步修订 backlog.md（已闭环子任务追加标注 + commit hash 回填；暂缓子任务追加原因；「保留为后续增强候选」措辞须基于「当前未落地」前提，否则删除）。

**典型反模式**：仅读 `backlog.md` / `todo-archive.md` 文档侧资料而未打开实际代码验证；决策描述中出现「参考 NNN 实施」自相矛盾却未先厘清；决策 D 阶段前未用 `git log --oneline -- <相关路径>` 做 5 分钟核对；仅依赖 backlog 候选描述做规划，未对照 commit history + 实际代码 + todo-archive 表格三重交叉核验。

**合规核验**：由 [code-auditor 主责边界「阶段启动重复评估自检」必查项](../../../.github/agents/code-auditor.agent.md) 强制检查——commit 涉及 `todo.md` 当前阶段新增 / 修改时，五步自检任意一步未执行 / 未通过 → Reject 退回。**关联规范**：[planning.md §3.4](../../standards/planning.md#_3-4-阶段启动决策前置交叉核验硬要求-m27-1-重复评估问题-2026-09-10) + [归档 §六十四](./experience-archive-§49-§69-recent-investigation.md#六十四、m27-1-c66-告警视图增强-重复评估教训-阶段启动决策时未对照-已闭环清单-导致规划无效工作-2026-09-10-commit-0ddd4e2-决策-d2-错误)（M27.1 重复评估问题闭环记录）。

## 3. Code Auditor quick depth 时长校准

- quick depth 时间盒 ≤ 5min，实测常见约 60-100s（含完整 SUT 行号核对 + case 路径推演 + 验证证据矩阵 + 未覆盖边界列表），远低于阈值。
- **适用**：(1) 测试补强 (2) 文档措辞 (3) 简单配置 (4) 重命名——核心是改动不引入新逻辑、diff < 800 行、不涉及鉴权 / 外部调用 / 数据写入。
- **复审只审修复点（第 2+ 轮）**，不重发全量 diff（提升效率且符合 reviewer 边界）。与 AI 协作规范 §1.3 对照：`audit-depth: quick` 必须**主动声明**，未声明默认按 `deep` 防御执行（实测用时显著拖长）；**数据来源口径**：`60-100s` 数值来自 caller 宿主系统时钟事后实测的多次 quick depth 历史调用 elapsed 数据，**不含审计方自报**（审计方不自报时长、不检查时间，按 §1.3 防御方向）。

## 4. CI 偶发错误三阶段协议

**阶段 1 穷举排查**：handler 逻辑 / 单测 / 本地复现全部走一遍；通过即接受兜底修复 + 根因 backlog 分离（不要在本地无限复现根因）；通过判定 = handler 单测全过 + vitest 集成测试通过 + 本地 fresh context 复现稳定。**阶段 2 helper 层兜底修复（而非 handler 层）**：测试代码改 helper，不动 server handler；helper 层加 `maxRetries` / `storageState: { cookies: [], origins: [] }` 等防御性参数，server 不感知、本地 / CI 行为等价。**阶段 3 根因 backlog 分离 + M 阶段规划时优先排查**：根因登记 backlog §已知边界衍生段；M 阶段规划时按 ROI 排序候选根因（3-4 项）并优先排查，避免「兜底修复 = 完成」心理陷阱。**JSDoc 精度要求**：helper 兜底代码必须穷举「哪些错误重试」+「哪些错误不重试」，避免维护者误判覆盖范围（例：`maxRetries: 2` 的 JSDoc 必须说明仅对 `e.code === 'ECONNRESET'` 触发 backoff 重试）。

## 5. git 隔离语义与参数

dependfix 的 commit / push 必须**不受宿主签名配置污染、也不受被修复仓库本地钩子约束**，否则行为不可复现（`-c` 是 git 全局选项、`--no-verify` 是子命令选项，**位置不可互换**）：

| 隔离类 | 触发 / 钩子 | 污染表现 | 隔离参数 |
|:--|:--|:--|:--|
| 签名（commit） | 宿主 / repo `commit.gpgsign=true` | commit 带宿主个人签名（身份与被修复仓库 author 不一致）；宿主无可用 key / `gpg.program` 时直接 `fatal: failed to write commit object` | `-c commit.gpgsign=false` |
| 签名（push） | 宿主 `push.gpgSign=true` | `git push` 自动带 `--signed`；服务端 `receive-pack` 不支持时 `the receiving end does not support --signed push` | `-c push.gpgSign=false` |
| hooks（commit） | 目标仓库 `pre-commit` / `commit-msg` / `prepare-commit-msg` | husky / lint-staged 钩子依赖 `npx` 与目标仓库完整 `node_modules`，隔离环境下不可用 → 钩子非 0 退出（如 `npx: not found`，exit 127）→ `COMMIT_FAILED` → 修复回滚 | `--no-verify`（置于 `commit` 子命令**之后**） |
| hooks（push） | 目标仓库 `pre-push` | 推送修复分支时 hook 非 0 退出 → `push_failed` → 交付链中断（当前生产日志无该实例，属**预防性收口**） | `--no-verify`（置于 `push` 子命令**之后**；亦适用于 `push --delete`） |

**单一事实源 / 覆盖面**：`packages/engine/src/github/git-signing.ts` 导出 4 个常量——`GIT_COMMIT_SIGNING_ISOLATION_ARGS` / `GIT_COMMIT_HOOKS_ISOLATION_ARGS` / `GIT_PUSH_SIGNING_ISOLATION_ARGS` / `GIT_PUSH_HOOKS_ISOLATION_ARGS`（engine 与平台侧共用，禁止散落字面量）。**作用对象 = 被修复仓库**（自动 commit / push 修复分支与建 PR）：commit 侧 `stageAndCommit`；push 侧全部 4 处——`pr-creator.pushBranch` / `platform-delivery.pushFixBranchWithCredential` / `container-executor.pushFixBranch` + `cleanupRemoteBranch`（含 `--delete`）。**不适用**于作用对象为 **dependfix 自有仓库**的发布脚本（`release.yml` 调用的 `release:auto-version` / `release:push-tags`，仅在 CI 执行）——它们应沿用运行环境的签名与钩子配置。`--no-verify` 不跳过 `post-commit`（提交后运行、不能改变结果）；选型它而非空 `core.hooksPath` 目录——跨平台无需构造/保证目录存在，且对 husky 的 `core.hooksPath` 重定向等效。

**只关开关、不屏蔽环境**：以 `-c <key>=false` 形式仅作用于该次调用——`-c` 优先级高于 repo local / worktree / host global / system 配置（git 配置键**大小写不敏感**，故表中 `commit.gpgsign` 与 `push.gpgSign` 的写法差异无功能影响，按代码实际取值列出），且不写回任何配置文件。刻意**不**注入 `GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM`——那会连带屏蔽宿主代理（`http.proxy`）等运行环境配置。**策略：不提供签名 / hooks opt-in**（无 CLI flag / env / action input / 平台配置）——签名会把 dependfix 绑定到调用方密钥环境（需额外设计密钥来源、失败语义、四层暴露面），而「目标仓库强制要求签名 commit」属罕见场景；目标仓库钩子面向本地开发流程，隔离执行环境下本就不可用。

- **重开条件**（任一出现时重新评估）：① 用户明确要求对特定目标仓库产出签名 commit；② 目标仓库分支保护规则强制 `Require signed commits` 且无法通过 PAT / App 权限例外；③ 平台需要以可验证身份签名（合规审计要求）。重开时须统一密钥来源 / 失败语义 / 四层暴露面，且本表隔离参数默认值保持「关闭」。
- **不做的边界**：不改宿主 `~/.gitconfig`；不关闭用户手工 git 操作的签名 / 钩子；不回溯已产生的 commit / push；不做目标仓库保护规则预检。

**取证口径（可复现）**：反例对照必须能击破断言——`packages/engine/src/github/git-signing.test.ts` 在同一次执行内先证「宿主 `push.gpgSign=true` 时裸 `git push` 必失败（`does not support --signed push`）」，再证「`pushBranch` 成功」；push 侧 hooks 同理（先证裸 push 被植入的 `pre-push`（`exit 1`）拦截，再证 `pushBranch` 成功且 hook 标记文件不存在），避免"环境恰好不触发"导致的恒真断言。
