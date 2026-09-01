# AI 协作规范

## 1. 身份认同

每个 AI 智能体在启动任务前，必须明确自己的角色定位（见 `AGENTS.md`）。
- **禁止跨权**：`qa-assistant` 严禁修改代码；`test-engineer` 应专注于测试编写。
- **环境感知**：执行命令前必须判断当前是 Windows 还是 POSIX 环境。

### 1.1 Agent-First 方法论

Agent-First 的完整项目级定义以 `AGENTS.md` 为准。Agent 是默认任务入口；一次性需求可直接执行；可复用流程应沉淀为 skill；高频请求应触发既有 skills 的持续演化。

### 1.2 执行原则

1. **搜索优先**：当遇到需要外部信息、排查未知问题、根因不明确或修复失败 >= 2 次时，必须先搜索获取一手信息。严禁跳过信息获取步骤凭记忆给出结论。
2. **显式假设**：当需求存在歧义、边界未定义或上下文不足时，必须先说明当前假设、可选解释与风险；禁止静默选择一种解释后直接大规模实现。
3. **简洁优先**：默认选择满足当前验收标准的最小实现，不得借机引入与当前目标无关的抽象或未来能力预埋。
4. **外科式改动**：改动范围应与用户请求、Todo 验收点或 blocker 一一对应；发现无关问题时可以记录，但不得顺手并入当前实现。
5. **目标驱动验证**：在进入实现前应明确成功标准、最低验证矩阵与首条区分性检查；完成首个实质改动后，优先做最小充分验证，再决定是否继续扩写。
6. **批量替换纪律**：脚本/正则批量改写代码时，先改 1 个代表性文件 → typecheck + diff 审查 → 确认无误再铺开全量；正则必须限定上下文（注释行、字符串前缀、精确清单），禁止 `[^)]*`、`.*?` 等通配在注释与代码混合文件中跨上下文匹配；写文件必须按行保留原行尾（混合行尾仓库整体转换会制造全文件噪音 diff）；统一行尾是**按文件**的操作——先 `git show HEAD:<file>` 检测 repo 存储方向（`core.autocrlf=false` 时 repo 可能存 CRLF），转错方向 = 全文件 diff；替换后验证矩阵 = typecheck + 定向测试 + `git diff --stat`/`--ignore-space-at-eol` diff 规模核验 + 残留扫描，涉及外链文本时额外核对（check-links 只查本地链接）。PowerShell 环境含 <span v-pre>`${{`</span>、`${`、反引号、嵌套引号等特殊字符的脚本一律写临时 .cjs 文件执行（写入位置见第 7 条），不再尝试内联 `node -e`。**文件内容批量修改（替换/插入/行尾转换）一律优先 JS 脚本实现（`node -e` 或临时 .cjs：读取 → 处理 → 写回），非必要不使用 PowerShell 执行批量替换**——PowerShell 的 `-replace` 替换文本不做转义解释（`\r?\n` 按字面量写入）、单引号字符串完全字面（反引号+n 字面序列不解释为换行）、`String.Replace` 全局替换会误伤所有短字符序列（如"反引号+n"命中后拆坏 `npm_config_registry` 为"换行 + pm_config_registry"）；批量文本操作后必须**内容级验证**（Node 字节抽查字面量残留与关键内容存在性 + `git diff` 审查既有内容未被意外改动，lint/check:links/docs:build 均不检测文本语义）。批量替换合规核验由 review 阶段执行。教训见 [经验归档 §十七 / §二十一 / §二十三 / §四十](../design/governance/experience-archive.md)。
7. **临时文件写入位置**：需要写入临时文件或执行临时脚本时，一律优先写入项目根目录 `temp/`（已被 `.gitignore` 忽略，可安全写入），不得默认写入全局 temp（避免触发权限审批）；仅当工具或流程确实要求全局临时目录（系统级临时卷、跨进程/跨项目共享、外部工具硬编码路径等）时才使用全局 temp。

### 1.3 搜索优先

#### 触发条件（满足任一即触发）

| 触发场景 | 典型信号 | 搜索目标 |
|----------|---------|---------|
| 问题排查受阻 | 修复失败 >= 2 次、根因不明确 | 错误信息关键词、同类 issue、官方文档 |
| 技术方案设计 | 不熟悉的库/框架/API、多种候选路径 | 官方文档、社区最佳实践、已知坑点 |
| 需求或配置澄清 | 用户描述模糊、外部服务行为不确定 | 官方配置参考、API 契约文档 |
| 安全或合规判断 | 鉴权、加密、数据保护 | CVE 数据库、官方安全公告 |
| 跨平台或环境差异 | Windows/Linux 行为不同、Node 版本差异 | 平台特定 issue、官方兼容性说明 |
| 依赖选型或升级 | 新增依赖、大版本升级 | changelog、迁移指南、社区反馈 |

#### 信息源优先级

| 层级 | 来源 | 采纳条件 |
|:----:|------|----------|
| L1 | 官方文档、源代码仓库 | 直接采纳，作为终极裁决依据 |
| L2 | 权威技术社区（StackOverflow 高票、官方博客） | 与 L1 无矛盾；关键数据需双源确认 |
| L3 | 个人博客、Medium、Reddit | 仅作思路参考，不得作为唯一事实依据 |
| L4 | 内容农场、机翻站、低成本 TLD | 直接舍弃 |

#### 证据获取手段优先级（翻源码是最后手段）

技术疑点的证据获取按以下顺序，**翻源码是杀手锏而非常规手段**：

| 优先级 | 手段 | 说明 |
|:----:|------|------|
| 1 | 官方文档 / 网络搜索 | 一手信息最快；发布工具链决策注意时效性（npm OIDC、pnpm 原生 publish 等近两年变化大，训练数据易过时） |
| 2 | 真实项目实证 | 知名项目同版本组合的实际配置/发布产物（如 react-turnstile = pnpm@11 + changesets@2.31.1、better-auth 的 npm manifest）——黄金证据 |
| 3 | 本地实验 | 跑一下胜过猜：`npm pack` 验证发布产物、临时 git 仓库模拟 tag 分段、单测验证边界——分钟级出实锤 |
| 4 | 翻源码 | **仅限**：需要最终实锤且 1-3 均无法确认（如"标题写死"这类文档不描述的实现细节）；对第三方包做安全审计。禁止作为默认手段 |

> 2026-08 教训：方案未确认就派审计 agent 翻源码属于浪费；`npm pack` 实验 30 秒实锤了"npm 不替换 workspace:*"，真实项目产物（better-auth npm manifest 无 `workspace:` 残留）直接否定了错误假设。

#### 分级审计执行协议（audit-depth）

审查投入与改动风险匹配，不应对所有改动一视同仁长时间分析。本协议与 [§2.2 验证分级矩阵](#22-验证分级矩阵) 正交：**验证矩阵决定最低证据门槛**（哪些验证证据必须存在，缺失即 Reject），**audit-depth 决定核验投入**（审计者怎么核验、花多长时间）。执行角色按 §2.2 收集验证证据，审计者按下表核验：

| audit-depth | 适用改动 | 审查范围 | 时间盒 |
|:---|:---|:---|:---:|
| `quick` | 文档措辞、简单配置、重命名、测试补强 | 只核验证声明（lint/typecheck/定向测试结果）+ diff 概要一致性 + 明显错误；**禁止**跑实验、定向测试或翻全量源码 | ≤ 5 分钟 |
| `standard` | 常规业务逻辑、模块内改动 | 正确性 + 边界 + 测试覆盖；定向抽查 ≤ 3 个关键文件 | ≤ 10 分钟 |
| `deep` | 发布流程、安全/鉴权、外部调用、数据写入、配置与依赖变更、agent/skill 定义 | 全量 checklist + 针对性实证（临时仓库/本地实验/验证命令按需执行） | ≤ 20 分钟 |

配套实践：
- **审计 prompt 携带"已查证事实"**：执行角色把调研结论/实验证据写进审计任务，避免审计者从头翻源码，显著提升效率与命中率（2026-08 多轮 Review Gate 实证：抓到 tag 不推送、分段回归、runner 无 git 身份等真问题，同时每轮用时可控）；
- **分级沿用 blocker / warning / suggest**（见 [测试规范 §4.1 按风险分级执行](../standards/testing.md) 与 [code-reviewer skill](../../.github/skills/code-reviewer/SKILL.md)）；
- **审计调用协议**：`Full Stack Master (全栈大师)` 发起审计时必须显式声明 `audit-depth`（quick / standard / deep + 理由）、变更文件清单、已验证证据摘要与复审问题编号；未声明按 `deep` 防御执行；
- **真实用时实测（事后校准数据，非审计过程命令）**：LLM 自报用时是估算值，无真实时间感知，**不得作为时间盒核验依据**。时间盒核验由调用方事后实测：发起审计 task 前用宿主系统时钟记录启动时间戳（PowerShell 用 `Get-Date -Format o` 等），审计返回后用系统时钟计算 elapsed，把"实际用时 / 是否超时间盒"回填审计结论与证据记录。**审计过程中不要求审计方感知或检查时间**——专注审计本身；超时（elapsed > 时间盒）不回溯要求审计方补动作，只作为分级校准信号记录：连续/高频超时说明 audit-depth 声明偏松或时间盒偏紧，据此调整分级与时间盒设置；
- **复审只审修复点**：第 2+ 轮审计只移交上轮问题编号对应的修复 diff，不重发全量 diff；审计者不得重读全量；
- **并发审计**：diff 文件数 > 8 或涉及 ≥ 2 个独立模块时，按模块分区并行发起多个审计任务，主审汇总合并去重、取最严结论；小改动不得并发（token 成本近似线性，仅大改动值得）；
- **技能引用路径**：审计相关 skill（`code-reviewer`、`security-guardian` 等）一律以项目内 `.github/skills/` 版本为准，agent 定义中写明相对路径链接，禁止裸名引用导致解析到全局同名 skill。

#### 方法论

- **外部问题先验证再设计**：外因问题先做最小验证（探针/官方文档/issue），确认是平台限制而非自家 bug 后再设计应对，不要在自家代码里找不存在的 bug。
- **真实运行复盘驱动演进**：真实运行报告中的异常统计（如 Skipped/Failed 占比异常）是产品缺口信号，先拆解归因再动代码。
- **Review Gate 独立验证声明**：交付声明（如"测试 +N"）必须可核查（文件 + 断言）；审计独立复验，不采信自报。
- **dry-run 纪律**：所有会写盘/执行/变更的路径，在 mutation 前必须 guard dry-run（零写盘、零 install、零 mutation）。
- **交付检查所有暴露层**：能力交付前检查四层——CLI flag / env / action input / 文档表，缺一层即不完整。
- **不可行证明优先于硬实现**：需求与实现约束冲突时，记录论证过程后放弃是合规决策；不引入不可验证的修复器。
- **方案设计接受「用户引导收敛」**：用户对方案的修订往往收敛到"更简 + 更实用"——典型三轮收敛：大方案（后端全量 + 前端滚动）→ 用户「还是多了」→ 中方案（纯前端分页）→ 用户「加缓存优化」→ 终方案（缓存 + 轻量分页）。实战意义：第一轮方案不必过度优化，接受「用户会引导收敛」的预期；主动问「还有优化空间吗」常能得到缓存等非显式需求。

### 1.4 单次提交审计阈值（10 文件 / 800 行）

- 单次 commit/diff 超出 **10 文件** 或 **800 行新增** → 必须拆分 multiple atomic commits，否则第 1 轮 audit Reject。
- 拆分依据：按职责切分（utils / 表格 / 后端 / 前端 / docs），每个批次 ≤ 5 文件 / ≤ 350 行。
- **依赖关系处理（拆分时必填）**：拆分后确保 commit 1 独立可测（基础设施层如字典 + helper 同步落地，codeSet 测试覆盖新 code）；commit 2 业务 throw 改造依赖 commit 1（引用新 code）；commit 3 测试调整依赖 commit 2（验证 throw 改造行为）。任何 commit 不可被独立运行验证即拆分错位。M17.4 总 13 文件拆 2 commits 实证：commit 1 字典 + helper + API throw 改造（9 文件 / 独立可测——codeSet 测试通过）；commit 2 既有测试 message→code 断言调整（4 文件 / 依赖 commit 1 新 code——commit 2 时 typecheck / test 必须实测确认 commit 1 已落地）。
- 例外：纯新增文件（如新建测试文件或工具模块）单文件超过 800 行（如生成的 d.ts）不强制拆分——但需在 audit prompt 中声明"超出阈值但属单文件生成产物"理由。

### 1.5 风险分级 vs blocker 区分（依赖审计 vs 依赖风险）

- 依赖审计门禁缺失（如 `pnpm audit` 未进 CI）≠ 依赖本身有漏洞。**两个独立维度**，分开处理：
  - 依赖风险：单一包版本钉定 + lockfile + integrity hash 校验通过 → 不构成 blocker，纳入 backlog 跟进
  - 审计门禁缺失：纳入「依赖审计进 CI」backlog 条目（如 C60/C61 RG-B04）
- typecheck + lint + e2e 全过已足够验证本次改动对依赖本身的兼容性；CI 依赖审计门禁是流程问题，不阻塞当前 PR。

## 2. PDTFC+ 工作流

所有写操作任务必须严格遵循以下执行顺序。**严禁跨越关键质量阈值。**

### P (Plan) — 需求分析与规划

- **意图抽离**：必须读取 `docs/plan/todo.md`，若存在歧义必须发起"采访"模式。
- **规划闸门**：新事项必须先核对 `todo.md`、`roadmap.md`、`todo-archive.md` 与当前任务验收标准。
- **插队判定**：若不在当前规划内，必须先完成快速分流（阻塞/高风险 → 允许插队；其他 → 延期）。
- **任务定义**：更新 `todo.md`，将任务标记为 `进行中`。
- **方案设计**：输出受影响文件清单及技术实现路径。

#### P.1 ahead 状态动态描述原则（避免 staleness）

P 阶段规划写入 `todo.md` 顶部 banner / M 段 banner 时，ahead 状态描述必须**用 commits 列表 + `git rev-list HEAD ^origin/master --count` 实证命令替代具体 ahead 数字**：

- **禁止**：`ahead=N 待推送` / `ahead=3 仅 X 三 commits 待推送` / `M13 归档批次已落地 5 atomic commits ... ahead=8 待用户推送`（ahead 是动态变化，写具体数字极易过时——用户可能在 banner 写后已推送 commits）
- **正确**：`ahead commits 实证命令` + commits 列表（如 `M13.4 三 commits 2dce01d + bb3b49a + 8762a4b 推送至 origin/master`）—— 即便部分已推送也只损失"哪些未推"信息，不损失准确性
- **附议**：sub-task ID 跨 commit 引用时（如 "T1310 ahead 5 commits + T1401 + T1402 + T1403"）typo 风险显著，建议 `rg -n "T\d{4}" docs/plan/*.md` 校对

教训：M14 P 阶段规划 commit `1fd38c1` 写错 2 处（① sub-task ID typo `T1402+T1303` 应为 `T1402+T1403`；② banner ahead 描述写"ahead=3 仅 M13.4 三 commits 待用户推送" + "ahead=8"——实际 M13.4 三 commits + M13 归档批次 5 commits 均已被用户推送至 origin/master，ahead=0；M14.1 P 阶段规划 commit 落地后 ahead=1）。M14.1 收口 commit `e7103f6` 修正（ahead 改用 commits 列表 + 实证命令；typo 修正）。详见 [规划规范 §4.4 §5 ahead commits 实证 + 动态描述](./planning.md#44-大批量归档批次操作规范) + [session wisdom 蒸馏机制](../design/governance/session-wisdom-distillation.md)。

### D (Do) — 业务执行

- **实现准则**：遵循 TypeScript 架构，禁止使用 `any`。
- **最小实现**：默认先做满足当前验收标准的最小切片。
- **范围稳定**：开发过程中发现的额外问题不得直接扩写，必须回到 P 阶段判断。
- **自检**：开发完成必须通过本地质量校验（lint + typecheck）。
- **集成外部库实施完成 ≠ Done**：D 阶段「单测全过 + typecheck 0 error」仅证明本地可跑，**不**等于集成 Done——必须有「真实路径调用 + 断言关键行为」的可执行验证。详细规范 + 教训见 [development.md §5.1.15](./development.md) + [testing.md §6.3](./testing.md) + [经验归档 §四十三](../../docs/design/governance/experience-archive.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试2026-08-29m18.4-audit-round-1-reject-后补修)；A 阶段 code-auditor 主责边界已挂「集成外部库 README 标准用法 + e2e 真实路径冒烟测试存在」必查项（[code-auditor.agent.md 主责边界](../../.github/agents/code-auditor.agent.md)）。

### A (Audit) — 代码审计（强制 Review Gate）

- **强制入口**：D 阶段完成后，必须立即加载本项目 [code-reviewer](../../.github/skills/code-reviewer/SKILL.md) skill 执行完整的结构化审查，不得自我审查。
- **审查内容**：按验证矩阵核对最低验证要求，覆盖正确性、安全、规范一致性。
- **退回策略**：若发现 blocker，退回 D 或回流 P，不得携带未关闭的 blocker 进入后续阶段。

### V (Validate) — UI 验证

- **视觉审计**：对 UI 改动进行浏览器验证。若自动化工具失效，应向用户展示截图或请求人工验证。

### T (Test) — 质量检查

- **测试覆盖**：编写测试用例。
- **风险导向**：优先补当前缺陷会打断的断言、失败路径与边界行为。

### F (Finish) — 任务完结与分批提交

- **闭环管理**：更新 `todo.md` 状态为 `已完成`，同步更新相关文档。
- **分批提交（长任务强制）**：每个原子条目独立提交，长任务先回 P 阶段拆分（规模约束见 [规划规范 §1.1 任务粒度约束](./planning.md)）。每批提交前加载 `conventional-committer` skill，生成符合 Conventional Commits 格式的消息，执行 `git commit`。
- **推送禁令**：commit 后不得自动 `git push`，仅限用户明确要求时执行。

## 1.4 P 阶段规划暂停协议（user-driven）

- **P 阶段仅文档改动**：规划阶段只允许改动 `docs/plan/*` + `docs/index.md` + 相关规范/技能/智能体文件；**不**写实现代码、不改 `apps/platform/` / `packages/` 等运行时代码。
- **提交后暂停**：P 阶段规划 commit 后必须立即暂停，等待用户指令进入 D 阶段；不得自行提前启动实现。
- **用户驱动工作流**：用户在 "确认方案" / "提交本次改动" / "开始规划" 等明确指令出现前，执行角色只交付 P 阶段产出 + 收口摘要 + 下一步建议；任何后续动作（commit / push / D 阶段实现）须用户显式触发。
- **会话沉淀**：P 阶段规划落地后必须同步更新 `.session/current-task.yaml` 与 `.session/runtime-state.json`，标注 `phase = "P 阶段文档已落地，待用户指令进入 D 阶段"` + `blocked_on = "用户发布"`。
- **经验闭环**：P 阶段收口时同步更新 `docs/standards/*` 与 `.github/skills/*`，把本次 P 阶段的字段切分 / 标题层级 / 锚点规则等决定固化进规范（避免经验仅留会话）。

## 1.5 阶段归档检查 + 沉淀工作流（PDTFC+ 闭环后必经）

PDTFC+ 闭环（F 阶段提交后）的下一阶段启动前，必须执行"阶段归档检查 + 沉淀"独立流程——**不**是归档阶段本身，是阶段之间的衔接工作：

### 1. 阶段开工前归档检查（hard requirement）

启动下一阶段 P 阶段前必须执行**强制归档检查**，避免数据漂移：

```bash
# 1. 检查 todo.md 是否有未 [x] 条目（数据漂移信号）
rg "^- ### \[" docs/plan/todo.md  # 找出所有 ### [...] 条目
rg "^- ### \[ \]" docs/plan/todo.md  # 找出 [ ] 未闭环条目（数据漂移）

# 2. 检查 wisdom.md 活跃条目数（接近 20 阈值需蒸馏）
cd /root/projects/dependfix && pnpm distill:wisdom --check

# 3. 检查 experience-archive.md 健康窗口
wc -l docs/design/governance/experience-archive.md  # 当前最新§号连续性
```

**强制提醒**：当**上一阶段 todo.md 仍有 `[ ]` 条目时**，执行角色必须**主动询问**"是否需要先归档上一阶段？"——不得直接添加下一阶段待办。这是 §1.4 "P 阶段规划暂停协议"的延伸：阶段间的衔接也是用户驱动工作流。

### 2. 阶段闭环后沉淀工作流（PDTFC+ 闭环必经）

阶段归档（PDTFC+ F 阶段提交后）→下一阶段 P 阶段规划前，必须执行沉淀工作流（**与归档同源**但更细粒度）：

```
阶段闭环 F → 归档批次 → 沉淀工作流 → 下一阶段 P 阶段
        ↓
   [规划规范 §4.4]  [经验归档沉淀]      [PDTFC+ 启动]
   todo-archive       experience-archive  docs/plan/*
   backlog.md         docs/standards/*    roadmap.md
   roadmap.md         docs/index.md       (M21+ 候选)
```

沉淀工作流步骤：

1. **经验提炼**：本阶段是否有值得沉淀的教训/决策？判断标准（[experience-archive.md §准入标准](../design/governance/experience-archive.md)）：
   - 教训未落入规范（可执行方法论尚未迁移到 `docs/standards/` 或 skill/agent 定义）
   - 决策需要溯源（产品/技术方向的关键决策，未来需回答"为什么当时这么做"）
   - 重复违规预警（同一模式已违规 ≥ 2 次）
   - 工具/环境陷阱（本地不可测、跨平台差异、工具默认值覆盖等）

2. **经验归档**：在 `experience-archive.md` 末尾追加新§（编号连续），结构含：案例 / 教训 / 与既有教训的关联 / 挂接治理检查点 / 准入标准复核。

3. **规范迁移**：把案例抽象出的可执行方法论挂接到 `docs/standards/*.md` 或 `.github/skills/*/SKILL.md` 或 `.github/agents/*.agent.md`——单点声明原则（[documentation.md §4](./documentation.md)），不重复抄写完整条款。

4. **session Wisdom 沉淀**：活跃条目 ≥ 20 阈值时执行 `pnpm distill:wisdom`；新 pattern 按 `pattern-*` / `principle-*` / `practice-*` 格式追加到 `.session/wisdom.md` 当前条目段。

### 3. 归档/沉淀 commits 必须经过 A 阶段 code-auditor 深度审计（hard requirement）

归档/沉淀 commits 涉及的 `docs/standards/*.md` / `docs/design/governance/*.md` / `.github/agents/*.agent.md` 等治理定义修改，**必须**经过 A 阶段 code-auditor 深度审计（与 D 阶段 feature commits 同等标准），不得因为"仅文档改动"或"非业务代码"就跳过审计。

**审计必查项**（新增 code-auditor 必查项）：
- **跨文件 cross-reference 完整性**：新增 / 修改 / 迁出章节标题时，必须 `rg -n "<标题>"` 全仓库扫描引用并同步更新（参考 [规划规范 §4.4 第 10 条](./planning.md) 预防性迁出后 cross-reference 更新）
- **锚点格式正确性**：用 `pnpm run check:docs` 验证 0 error；commit message 必须包含 "check:docs 全过" 证据
- **规范单点声明**：新规则仅在权威文档完整声明一次，其他文档/skill/agent 仅一行链接引用（[documentation.md §4](./documentation.md)）
- **活跃 Wisdom 条目数**：本批次新增 pattern 累计后是否触达 20 阈值（若是必须先蒸馏）

**实证教训**：
- M20 经验教训沉淀 commits（`7a3d746`/`b23251c`/`5e81b19`/`f56e9a1`）提交后 `pnpm run check:docs` 发现 2 处断链（experience-archive.md:781 路径错误 + development.md:237 锚点格式错误），返工 commit `edef93b` 修复——若沉淀前 A 阶段审计检查 cross-reference + check:docs 可避免返工。
- M18 / M19 归档批次同样有"删过头"教训（§四十五 经验沉淀）——沉淀/归档操作不是无风险，D 阶段标准必须套用。

### 4. 与既有规范的关联

- **§1.4 P 阶段规划暂停协议**：本节是其在阶段间的延伸——阶段内 P → D → A → F → 下一阶段 P 之间的衔接也是用户驱动工作流。
- **§2.1 迭代中途发现事项处理**：阶段间检查可能发现"上一阶段未完成事项需插队处理"——按 §2.1 决策（插队 vs 延期）。
- **§规划规范 §4.4 第 10 条**：本节是其在沉淀工作流的具体执行——预防性迁出后 cross-reference 更新。
- **§开发规范 §3 注释规范**：本节文档涉及"PDTFC+ 闭环"、"A 阶段"等术语引用——不得孤立编号标记（如 "1.5"），必须带文档路径或章节名引用。

---

## 2.1 迭代中途发现事项处理

1. **先暂停扩写**：停止直接继续实现，先判断是否已在当前待办或验收范围内。
2. **允许插队（hard requirement）**：**仅限**§3.1 插队例外清单中的 3 类——直接影响可用性的生产事故 + 安全漏洞 + 依赖链高危漏洞；插队事项须补充"为何插队"说明 + 用户明确授权；其余全部按 §3.1 默认延期到 backlog，不得擅自升级。
3. **默认延期**：体验优化、代码重构、探索性能力、未来功能、非紧急依赖升级；按 [§3.1 新需求默认走"评估 → backlog"原则](./planning.md#31-新需求默认走评估--backlog原则hard-requirement) 处理。
4. **记录要求**：插队事项须补充"为何插队"说明；延期事项须记录到 `backlog`。
5. **禁止静默膨胀**：不得在未告知用户的情况下把原子任务扩展成新的功能包。

### 2.1.1 新需求总原则（跨工作流适用）

按 [planning.md §3.1](./planning.md#31-新需求默认走评估--backlog原则hard-requirement)：
- **新需求默认走"评估 → backlog"**：用户提出新需求 → AI 不直接进入 D 阶段，先评估（[requirement-analyst skill](../../.github/skills/requirement-analyst/SKILL.md)）→ 形成 [backlog.md §短期候选](../plan/backlog.md#短期--一次性候选任务上收后去重) 条目 → 等待用户明确决策阶段
- **不默认赋予阶段编号**：backlog 候选不得自动获得 `Mxx` 编号，未经用户明确授权不得写入 `todo.md` §当前阶段
- **不默认最高优先级判断**：候选池按"类型平衡"原则选取是用户决策行为，AI 不得推断"X 应作为本批次最高优先级"并默认启动 X
- **合规核验**：本原则由 [code-auditor 主责边界必查项](../../.github/agents/code-auditor.agent.md) + planning.md §3.1 强制约束，违规即 Reject

## 2.2 验证分级矩阵

任何变更都必须按"验证层级 + Review Gate"判断是否可以放行。

> **与 [§1.3 分级审计执行协议](#分级审计执行协议audit-depth) 的关系**：本矩阵决定**最低验证证据门槛**（证据缺失即 Reject）；A 阶段审计者的核验方式与时间投入由 §1.3 的 `audit-depth`（`quick` / `standard` / `deep`）决定，两者正交、不互相替代。

| 层级 | 名称 | 目标 | 典型证据 |
|:----:|------|------|----------|
| V0 | 记录层 | 明确变更范围、风险与受影响入口 | 变更文件清单、风险说明 |
| V1 | 静态层 | 确认代码在静态检查层面可用 | lint、typecheck |
| V2 | 逻辑/运行层 | 确认逻辑无明显回归 | 定向测试、集成测试 |
| V3 | 流程层 | 确认跨模块流程、UI 渲染 | 浏览器验证、E2E |
| V4 | 性能层 | 确认性能未回退 | Lighthouse、Bundle 预算 |
| RG | Review Gate | 给出最终审计结论 | code-reviewer 结论、未覆盖边界 |

### 不同改动类型的最低验证要求

| 改动类型 | 最低验证 |
|----------|:--------:|
| 文档 / 规划 | V0 + V1 + RG |
| 纯逻辑 / 工具函数 / 服务层 | V0 + V1 + V2 + RG |
| API / 鉴权 / 数据模型 | V0 + V1 + V2 + RG（若影响关键写路径则升级到 V3） |
| UI 组件 / 页面交互 | V0 + V1 + V2 + V3 + RG |
| 修复型 Hotfix | V0 + V1 + (对应层级 V2/V3) + RG（必须补复现+修复后结果） |
| 配置 / 依赖 / CI / 技能与 agent 定义 | V0 + V1 + RG（定向验证：手工跑对应脚本 / workflow / skill 调用）+ skill/agent 定义补 LLM 单测或契约测试 |

### 测试升级口径

测试不默认全量执行，按风险分级选择策略：

| 风险等级 | 默认测试策略 | 何时升级 |
|:---|:---|:---|
| 低 | 不跑测试或仅保留静态证据 | 仅适用纯文档、纯技能文案、纯规划整理 |
| 中 | 定向测试 | 触发逻辑分支、工具函数、服务层、配置脚本入口 |
| 高 | 全量测试或 verify 片段 | 鉴权、关键写路径、跨模块流程、发布前收口 |
| 专项 | Coverage / E2E / 性能验证 | 覆盖率治理、浏览器回归、性能预算审计 |

**关键约束**：没有 RG 结论的变更只能视为"进行中"，不能视为已完成。

## 3. 安全红线

1. **敏感文件保护**：严禁修改或删除 `.env`、`AGENTS.md` 等核心配置文件。
2. **路径校验**：删除操作前必须验证路径存在且非空。
3. **密钥脱敏**：绝不在代码或日志中硬编码密钥、Token。
4. **死循环规避**：同一问题修复失败 >= 2 次先触发搜索优先流程；>= 3 次停止并请求人类介入。

## 4. 修复工作流原则

### 4.1 最小复现测试优先

根因不明确时，先编最小复现测试，一次只验证一个假设，避免全量测试来验证错误方向。

### 4.2 CI 作为最终裁决

修复的验收标准是 CI 流水线全部通过，不是本地测试通过。

```
根因排查(最小复现) → 方案验证(定向subset) → 批量修复 → 本地通过 → 提交 → CI通过 = ✅ 完成
```

CI 失败后不得回退到全量重试，应分析具体失败点针对性修复。

**CI 修复是剥洋葱**：修复一个失败点后，必须让该 job 此前被短路跳过的**全部后续步骤**真正执行，确认全链通过才算修复完成；独立 workflow（dogfood、Security Scan 等）会暴露主 CI 不覆盖的层（action manifest 模板校验、真实 API 调用），同样纳入最终裁决。本地无法复现的环境类问题（glob 穿透、manifest 校验、依赖安装差异）只能做"模拟探针"提高置信度，最终以 CI 复跑为准。教训见 [经验归档 §二十二](../design/governance/experience-archive.md)。

**每个 CI job 都是独立环境**：coverage / test / lint / build 各自独立 runner，任何依赖生成产物（`.nuxt/tsconfig.json`、workspace dist）的步骤必须在**该 job 内**显式准备——test job 跑过 prepare 不继承给 coverage job（[经验归档 §二十七/§二十八](../design/governance/experience-archive.md) 实证：coverage job 缺 `nuxt prepare` 导致 platform 测试 TSCONFIG_ERROR）。

**monorepo 应用层依赖 workspace 包类型的 CI 纪律**：`pnpm i --frozen-lockfile` 不构建 workspace 包；应用层（如 Nuxt platform）若直接 import 其他 workspace 包的类型，lint/typecheck 前必须先构建依赖包 dist（`pnpm --filter <dep> build`，顺序参考 Dockerfile 依赖图）。Nuxt 生成的 tsconfig 不映射 workspace 源码——`typescript.tsConfig.paths` 不合并、`alias` 指向 src 会把源码纳入 Nuxt strict 编译上下文报错，两条路都不可靠（[经验归档 §二十七](../design/governance/experience-archive.md)）。

**ESLint 9 flat config 配置发现是"单文件"模型**：根目录 `eslint .` 只加载根 eslint.config.js，**不自动加载子目录配置**（与 eslintrc 的目录级联不同）；子目录 eslint.config.js 只在包内 lint 时生效。monorepo 根 lint 必须把各包规则写进根配置，或接受根 lint 与 IDE/包内 lint 行为漂移。sub-config 的 `extends`（tseslint.configs.*）不可直接内联进数组（返回嵌套数组），需 `tseslint.config(...)` 工厂展开。

**引入依赖前审查依赖链的破坏性传递**：官方集成（如 `@nuxt/eslint`）也可能通过工具链（config-inspector → devframe → h3@2.x）引入与项目核心（Nuxt 4 → h3@1.x）冲突的 breaking 版本，直接破坏 typecheck。引入前后各跑一次 `pnpm why <关键依赖>` 是标准动作。

**pnpm 严格模式不提升传递依赖**：代码直接 `import` 的包必须在本包 package.json 显式声明；"恰好能解析"（靠另一条依赖链间接提供）是脆弱假设，移除该链立即暴露。

### 4.3 本地不可测配置的变更纪律

- 配置文件显式写"空默认值"（如 `excludeFiles: []`）会覆盖工具内置保护，修改前先确认工具默认值。
- composite action（action.yml）中 <span v-pre>`${{ }}`</span> 只允许出现在合法上下文（runs 步、outputs 表达式、with 表达式值）；description / 纯文本 / 注释内嵌表达式会被 manifest 模板校验求值并可能引用不可用上下文。action.yml 变更后应跑一次真实 action（本仓库 `security-auto-fix.yml` dogfood workflow）验证。

### 4.4 F 阶段本地验证口径差异（`pnpm --filter <pkg> test` ≠ `pnpm test` 全 workspace）+ coverage 强制（hard requirement）+ **typecheck 实测必须（nuxt typecheck 不等于 TS 0 error）**

- F 阶段本地验证用 `pnpm --filter <pkg> test`（仅跑特定包，例：platform → 705+4skip）≠ CI 跑 `pnpm test` 全 workspace（2128+5skip）+ coverage 4 维度（stmts/branch/funcs/lines）。
- **陷阱**：本地 F 阶段验证全过、vitest 全绿、无回归——**完全漏掉 apps/platform/server / packages/cli / packages/engine / scripts 等非 platform 包引起的分支回归**。CI Coverage job 失败（branches 79.88% < 80%）时常因此发生。
- **修复协议（hard requirement）**：F 阶段"完整验证"必须含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度（statements / branches / functions / lines）是否 ≥ 80% 阈值 + 定位新增文件未覆盖分支 + 补测至 ≥ 阈值，而非仅 `pnpm --filter <pkg> test`。CI 通过 = 最终裁决，本地通过 ≠ 完成。
- **二次固化警告**：本节规则曾在 [CI run 32880889750](https://github.com/dependfix/dependfix/actions/runs/32880889750) 二次复发——branches 79.98% < 80% 失败，根因是 M13.3 T1308 新增 `code-quality-fetcher.ts` 等 4 个新文件未被既有测试覆盖（防御分支 cursor 重复死循环 / URL parse catch / RATE_LIMITED 兜底 / 三源错误隔离）。**默认 80% 阈值即通过但漏了多包增量回归**。F 阶段验证清单须把 `pnpm run test:coverage` 列入 hard requirement，不得用"基线已通过"做理由省略。
- 实证：某次 platform UX 治理阶段 12 commits 推送后 CI Coverage job 失败，但本地 F 阶段验证显示全过，**回归 +8 分支**才发现（详见 commit `0c57211`，2026-08-21 推送；背景见 [经验归档 §二十八](../design/governance/experience-archive.md)）+ M13.3 补测 commit `e63cdb9`（branches 79.98% → 80.17%，14 case）。

- **`pnpm --filter @dependfix/platform typecheck` 输出 "Done" ≠ TS 0 error（nuxt typecheck 容忍部分 TS error）**：nuxt typecheck 走 `vue-tsc` pipeline，在某些情况下容忍 TS error（如 `Record<string, unknown>` 索引访问得到 `{}` 时不报错；strict 模式下访问 `err.data?.code` 仍会 TS2339 但 build 不阻断）。执行方"typecheck 7 包全 Done"宣称**不可信**——必须实测确认 0 error。M17.4 commit 2 audit Reject 实测 7 个 TS2304 + TS2339 error（`batch.post.test.ts:2` 缺 `afterEach` import + 6 处 `err.data?.code/field/resource` 属性访问失败）此前未触发实测；Reject 后针对性补修闭环。F 阶段验证必须实测 typecheck 0 error，不能仅看 "Done" 输出。其他文档（git.md、testing.md、skill/agent 定义）仅作一行引用。
  - 实操：执行 `pnpm --filter @dependfix/platform typecheck 2>&1 | grep -E "error TS|Done"` 看完整输出；或跑 audit 时让 code-auditor agent 实测 typecheck（不能信执行方证据）。

### 4.5 Code Auditor quick depth 时长校准（≤ 5min 时间盒，实测 ~79s）

- quick depth 时间盒 ≤ 5min，实测常见 ~60-100s（含完整 SUT 行号核对 + case 路径推演 + 验证证据矩阵 + 未覆盖边界列表），远低于阈值。
- **校准结论**：quick 适用于 (1) 测试补强 (2) 文档措辞 (3) 简单配置 (4) 重命名——核心是改动不引入新逻辑、diff < 800 行、不涉及鉴权/外部调用/数据写入。
- **复审只审修复点（第 2+ 轮）**，不重发全量 diff（提升效率且符合 reviewer 边界）。
- 与 §1.3 分级审计协议对照：`audit-depth: quick` 必须**主动声明**，未声明默认按 `deep` 防御执行（实测用时显著拖长）。
- 数据来源口径：上述 `~60-100s` 数值来自 caller 宿主系统时钟事后实测的多次 quick depth 历史调用 elapsed 数据，**不含审计方自报**（审计方不自报时长、不检查时间，按 §1.3 防御方向）。time-box ≤ 5min 是否超时由 caller 事后判定，不在本节展开。

### 4.6 audit warning 修复决策协议（修复 vs 登记 backlog）+ **audit suggest 跨 batch 累积跟踪 + audit Reject 后针对性补修**

- audit warning 必须明确决策，禁止跳过：(1) **修复**（低成本且对齐验收/正确性，例：清理 test.fixme 残留 / 保留 span 整体可点击 + 删 chevron 方案 A / 缩写注释清理 / 清理 dead mock + stale doc + describe 标题）；(2) **登记 backlog**（实现成本过高或与已知问题耦合，例：PrimeVue 4 rowToggleButton 默认无 aria-expanded——Pass-through 不传 context，低成本 dynamic 实现不可行，登记待 PrimeVue 升级 / viewMode 快速切换请求竞态——低概率 UI 闪一下旧数据，可加 lastRequestId 守卫但本次 PR 范围外）。
- **audit suggest 跨 batch 累积跟踪**：当 suggest 跨多个 commit 延后处理时（例：M17.2 audit suggest S-1 ServerErrorCode 字母序跨 M17.2/M17.3/M17.4 多次延后；M17.6 audit suggest S-1 update-user 端点 + S-2 admin 200 双向断言），必须在每个 commit message 中显式登记 backlog 跟踪项（"延后到 M.x 合并处理 / admin 200 双向断言延后到 viewer 403 矩阵稳定后追加"），便于后续追踪 + 跨 session 蒸馏累积。统一 backlog 跟踪条目（如 audit suggest #2 累积跟踪）优于单次登记——后者容易在多次 commit 中重复登记或遗漏。
- **audit Reject 后针对性补修 + 重验证三件套**：audit Reject 后必须针对性补修 blocker + 重验证 typecheck + lint + test 三件套确认 0 error 才能重新 commit；不回退到全量重试模式（PDTFC+ 修复工作流"不回退到全量重试模式"）。M17.4 commit 2 audit Reject 后实测：补修 2 个 blocker（`batch.post.test.ts:2` 加 afterEach import + `api-helper.ts:32` 返回类型放宽 `Record<string, any>`）→ 重跑 typecheck 0 error + test 859 passed → 重新 commit `a1c7c4e` 通过。
- 判断标准（三选一独立评估，命中任一"修复"维度则选修复）：
  - **是否影响用户行为**：用户可见问题 / 影响数据正确性 → 修复；仅 UI 闪烁 / 边缘场景 → 登记
  - **是否与 todo.md 验收条款一致**：验收标准明确 → 修复；偏离验收 → 登记或调整验收
  - **实现成本**：< 30min + 不引入新依赖 → 修复；> 30min 或需新依赖 → 登记
- 三维度全为"登记"则统一登记 backlog；任一为"修复"则必须在本次 commit 内处理。warning 不允许"跳过"决策。
- 跨领域补充：本节与 [§4.5](#45-code-auditor-quick-depth-时长校准5min-时间盒实测-79s) + [code-reviewer SKILL.md §2.5 分级审计协议](../../.github/skills/code-reviewer/SKILL.md) 配合使用——`audit-depth: quick` + 实测时间 + warning 决策框架三件套决定 F 阶段放行。

## 5. 相关文档

- [AI 资产治理规范](./ai-governance.md)
- [外部 Skills 准入清单](./external-skills-intake.md)
- [开发规范](./development.md)
- [测试规范](./testing.md)
- [安全规范](./security.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。
