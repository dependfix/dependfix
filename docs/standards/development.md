# 开发规范

> 定位：项目级开发规则（做什么 / 不做什么 + 可迁移方法）。与 [AGENTS.md](../../AGENTS.md) 冲突时以 AGENTS.md 为准。

## 1. 核心原则

- **模块化与组件化**：高内聚低耦合，公共逻辑迁移到 `utils/` 或可复用模块。
- **降低耦合度**：纯函数与副作用代码分层；核心模块依赖方向单向、可注入。
- **提升复用率**：重复逻辑抽象为工具函数，删减样板代码。
- **类型安全**：全面 TypeScript；严禁 `any`，不确定类型时用 `unknown` + 类型守卫。
- **显式假设原则**：需求 / 边界不清时先暴露假设并澄清，禁止靠默认猜测推进。
- **搜索优先原则**：需外部信息或根因不明时优先搜索一手信息，见 [AI 协作规范](./ai-collaboration.md)。
- **最小变更原则**：聚焦目标本身，减少对无关代码的触动。
- **实用性优先**：避免过度设计，引入新功能前评估真实价值与成本。
- **决策梯子原则**：实现前按序判断——① 真的需要做吗（YAGNI）→ ② 代码库已有则复用 → ③ 现有依赖能解决则用 → ④ 能用 util 封装则封装 → ⑤ 能一行搞定则一行 → ⑥ 写最少能工作的代码。

## 2. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 文件 | `kebab-case.ts` | `app-error.ts`、`runtime-config.ts` |
| Vue 组件 | `kebab-case.vue` | `app-header.vue`、`dashboard-view.vue` |
| 类型 / 接口 | `PascalCase`，优先 `interface` | `NormalizedSecurityAlert`、`RuntimeConfig` |
| 函数 / 变量 | `camelCase` | `resolveRuntimeConfig`、`isValidRepoIdentifier` |
| 常量 | `UPPER_SNAKE_CASE` | `RUNTIME_MODES`、`SEVERITY_THRESHOLDS` |

## 3. 注释规范

- **只解释关键点**：说明「为什么这样写」「边界条件」「隐含约束 / 副作用」，不复述代码表面行为。
- **复杂逻辑必须补注释**：复杂分支、状态切换、兼容性兜底、协议契约、性能或安全取舍。
- **导出函数默认应有 JSDoc**：说明用途、边界、返回语义与副作用。
- **禁止无效或过量注释**，也不机械给每行 / 每个变量加注释。
- **注释必须随实现同步**：修改逻辑时同步更新或删除过时注释；同一解释只写一处，同一缘由在仓库内仅保留一个位置，其他位置一句话指向文档。
- **详细解释放文档，代码只留短指针**：完整设计缘由、复盘结论、口径变更写入 `docs/design/` / `docs/research/`；代码注释只留一句「为什么」或文档指针。
- **禁止开发流程编号标记**：注释与测试名一律不得出现 `C1:` / `T303` / `G2` / `M4+` / `R2` / `P0` 这类规划 / 任务 / 审计 / backlog 编号（含 `C1：xxx` 与 `it('C1: xxx')` 形式）；追溯用 `git blame` / 审计记录。**例外**：代码内真实常量（如 HTTP 码 `E401`）与**指向规划文档的导航说明**（须同时写明文档路径或章节名，不得只写孤立编号）。**执行挂接**：D 阶段自检（Full Stack Master (全栈大师)）与 A 阶段 Review Gate（Code Auditor (代码审计员) 必查项）均含本检查；CI Test job 运行 `pnpm run check:orphan-ids`（命中即阻断，见 [scripts/README.md](../../scripts/README.md)）。**扫描范围口径**：按**本次改动文件**取（`git diff --name-only` + `git status --porcelain`，含新增文件）并同时扫新增行（`git diff -U0 | grep "^+"`）——只照抄规范里的示例路径会漏掉新增模块。
- **编号检测正则必须同时覆盖「裸写法」与「带连字符写法」**：本仓存在 `S-5` 与 `S2` / `W2` / `W10` 两种形态，正则只写 `S-\d+` 会漏裸形式，令全仓复扫报「0 命中」成为假阴性。要求 `PLANNING_ID_RE` 用 `S-?\d{1,2}` 一类可选连字符形式，并在脚本头部**显式声明未覆盖形态**（如裸 `PR\d+` 歧义高、需人工处理）；存量清理批次还须审查「检测口径本身」是否漏形态。
- **i18n locale 文件 insert anchor 必须用目标 locale 实际文本**：locale 文件多段对称（`zh-CN.json` + `en-US.json`），edit 工具 insert anchor 须用**目标 locale 实际文本**；`pnpm i18n:check:anchor`（`scripts/i18n/i18n-anchor-check.mjs`）检测同一 key 两边取值相等且 en-US 含中文的错位污染（结构化本地化数据 / 占位符 / 纯 ASCII 视为合理相等而跳过），CI test job 已作 blocker。
- **简化标记约定**：主动选择简化实现时用 `// lean:` 标记（如 `// lean: global lock, per-account locks if throughput matters`）。

## 4. 目录约束

- **包职责**：`packages/core`（核心域层，无运行时依赖）/ `packages/engine`（共享执行引擎 `DependfixApp`）/ `packages/cli`（薄壳 CLI）/ `packages/mcp`（MCP Server）/ `packages/skills`（产品 skill 资源包）/ `apps/platform`（Nuxt 全栈平台）；逐目录结构见各包 README 与 [模块设计索引](../design/modules/index.md)。
- `packages/core/` 不依赖任何运行时环境（Node / 浏览器 API）与任何内部包。
- `packages/engine/` 承载共享执行能力，内部包依赖仅 `@dependfix/core`。
- `packages/cli/` 为薄壳，依赖 engine 编排；`packages/skills/` 为资源包（无运行时依赖），仅被 cli 消费。
- **禁止 cli / mcp / platform 应用层之间互相依赖**：`packages/mcp/` 与 `apps/platform/` 均只依赖 `@dependfix/engine` + `@dependfix/core`（mcp 曾依赖 cli 导致应用层互相依赖 + 连带安装膨胀 + 版本耦合，engine 拆包解决）。
- 依赖方向单向：`core` ← `engine` ← `{cli, mcp, platform}`；禁止反向与循环引用；共享能力一律下沉 engine 后在应用层复用，禁止应用层复制实现或直连 core 内部模块。
- **执行挂接**：依赖约束的合规核验由 A 阶段 Review Gate 必查项执行（见 [code-quality-checklist 包依赖约束](../../.github/skills/code-reviewer/references/code-quality-checklist.md)）。

## 5. TypeScript

- 严格模式逐步收紧（当前 `noImplicitAny: false` 为过渡状态）；`tsc --noEmit` 必须通过；禁止 `any` 逃逸（逐步清零）。
- 优先 `interface` 定义类型，需联合类型时用 `type`。

### 5.1 工程实践规则

> **本表是 §5.1 的唯一规则清单**。编号保留原值、不重排；缺口表示该条已迁出或合并（映射见 [工程实践判例 §6](../design/governance/engineering-practice-notes.md#_6-编号映射)）。未列入本表的旧条目不再作为强制规则，只作判例参考。
>
> **执行方式**：`L1` = 脚本 / 测试 / CI 自动阻断；`L2` = 按「触发改动」在 review 阶段抽查，检查动作见 [检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵-严格约束逐条挂接)。新增规则前确认预算（≤ 24 条 / 单条 ≤ 260 字符）；给不出触发面与执行方式的，写入判例而不是本表。

| ID | 规则 | 触发改动 | 执行 |
|:--|:--|:--|:--|
| 5.1.15 | 集成外部库前查官方 README；集成层测试不 mock 真实库；以真实路径冒烟断言关键行为。 | 新增 / 升级第三方依赖或 SDK 接线 | L2：真实路径用例 + 集成层不 mock |
| 5.1.20 | 重构支撑（不改行为）与业务行为变更分 commit，不得混在同一提交。 | 结构调整与行为变更同批 | L2：commit diff 审查 |
| 5.1.25 | 声明范围前以行为特征（argv / env / 导出）全仓穷举同根因调用点；删除公共导出时含全部测试目录，区分代码引用与文档描述；共用判定集中到共用层。 | 声明「修复点单一 / 影响范围」/ 删除公共导出 | L2：`rg` 穷举清单 + 共用层检查（含原 5.1.39） |
| 5.1.29 | 配置优先级写明「字段级整体忽略 vs 逐条合并」并配证伪用例；构造期合并保持 `readonly` 单次赋值。 | 新增 / 修改配置优先级或合并 | L2：证伪用例 + readonly 检查（含原 5.1.30） |
| 5.1.31 | 声明「与环境开关解耦」必须穷举同族开关并逐个断言；日志打印实际生效值。 | 代码路径声明只读 / 与 env 解耦 | L2：同族开关清单 + effective 值断言 |
| 5.1.32 | `pnpm overrides` 不得同时存在通用钉定与版本化覆盖；出现「升级了但漏洞还在」先列 overrides。 | 修改 overrides / 依赖升级失效 | L1 计划：配置冲突脚本；当前 L2：列 overrides + `pnpm audit` 复验 |
| 5.1.34 | 依赖升级按语义级 diff + tarball 权威；不得只提交版本号 + lockfile，须跑完整门禁并同步版本口径。 | 依赖升级批次 / dependabot PR | L2：语义 diff + 门禁 + 文档同步 |
| 5.1.36 | 并发终态写用条件 UPDATE（乐观锁 = 读取时状态）；失败路径只写终态字段，不整行 `save`。 | 状态写回 / 失败通道 | L2：条件写 + `affected` 断言（含原 5.1.38） |
| 5.1.40 | 与外部工具语义绑定的判定，用该工具权威实现逐形态（含反例）实测；等价类扩展倾向保守。 | 实现「是否生效」类判定 | L2：形态清单 + 权威命令对照 |
| 5.1.41 | 跳过 / 收窄步骤前按字段级穷举产物消费者，并补上判据空洞；跳过 / 未验证不得折叠为通过（空集合 `every()` 恒真）——用显式字段（如 `verificationSkipped`）与通过分流，门禁不交付但不误记失败。 | 为省成本跳过、提前返回、降级 / 空集合聚合 | L2：消费者清单 + 跳过字段与门禁分流断言 |
| 5.1.43 | 跨边界镜像阈值 / 枚举 / 哨兵用具名常量 + 权威侧等值断言；「是否未知」判定收敛到单一纯函数；镜像只决定提示，不决定放行。 | 前端 / 下游预判上游口径 / 共享哨兵 | L2：等值断言 + 纯函数单点（含原 5.1.50） |
| 5.1.44 | 引擎内长命令与交付类外部命令（git push / commit / reset / checkpoint）必须受管异步且可运行级取消；argv 数组直传 + **显式关闭 shell**（原生可执行文件由 libuv 引号化，不经 cmd 拼接）；超时 / 取消须有子进程真正终止证据；中止后不得交付。 | engine 新增子进程 / 安装 / 验证 / 交付命令 | L1 计划：禁止 sync API；当前 L2：`rg execSync` / `rg execFileSync` + argv 引号化与取消用例 |
| 5.1.45 | JSON 配置列写入闸门：输入宽容 + `.strict()` 拒绝未知键；常量与归一函数单一事实源（读取侧复用写入的归一函数，容量上限只在写入侧把关）；引入已配置 / 未配置双路径时补逐字段等价用例；**契约字段沿「schema → 写入映射 → 实体 / JSON 列 → 视图 → 渲染」逐段核对**（任一段手工重建对象都可能漏字段，测试基础设施同口径）。 | 新增 / 修改 JSON 配置列 / 契约字段 / 引入配置双路径 | L2：宽容 + strict + 逐字段等价 + 字段端到端断言 |
| 5.1.47 | 进程失败证据原文回退（stderr → stdout → `err.message`）+ 信号渲染 + 失败点就地留痕。 | 读取子进程失败 / 安装失败 | L2：空 stderr 用例 + 日志落点 |
| 5.1.48 | 统计 / 去重 / 降级的数据前提以生产写入方为准；「读不到 / 超限」不得静默截断。 | 新增统计、去重键、降级分支 | L2：`rg` 写入点 + 整体降级断言 |
| 5.1.49 | 判据单点化须含适配层；停机语义用返回值向上传导；一次性记账放分区处，不放函数尾部。 | 收敛判据 / 停止剩余步骤 / 记账 | L2：适配层用例 + 提前 return 覆盖 |
| 5.1.52 | 新增验证命令来源必须汇入 `resolveVerifyCommands` → 同一 `runVerification`，不得另起执行器或超时。 | 新增验证命令来源 | L1：`check:verify-chain` + 定向用例 |
| 5.1.53 | 跨运行状态写可读回公开载体；读取失败 fail-open；计数键只用写入前可确定输入；跳过判定在主链路前。 | 跨运行记忆（尝试次数 / 上次结果） | L2：fail-open + 计数分组断言 |
| 5.1.54 | 自动提交按「固定白名单 ∪ 声明路径」；禁止通配暂存；未声明已跟踪改动 / 索引越界 / 冲突一律拒绝。 | 改自动提交暂存面 / 新增写盘来源 | L1：交付提交面用例 |
| 5.1.55 | 等待外部异步结果：终态显式、空观测不判成功、双层预算、处置失败不改结论、破坏性处置需开关 + dry-run。 | 新增等待 / 轮询（PR check / 部署 / 审批） | L2：状态机用例 + dry-run 守卫 |
| 5.1.56 | `pnpm overrides` **替换该包的解析范围**（不是上限也不是下限）：`^x` / `~x` 的同范围补丁由常规升级正常跟进，跨 minor 才需人工改配置；升级传递依赖须 `pnpm why` + `semver.satisfies` 逐边核验；豁免移除条件见 [security.md §5.7](./security.md)。 | 升级传递依赖 / 豁免复核 | L2：逐边核验 + 豁免记录 |
| 5.1.57 | 配置项的**单位与默认值**以官方文档为准，不得凭直觉读（如 `minimumReleaseAge` 以分钟计）；为绕开某条策略加例外前，先做最小对照实验证明原策略确实挡住目标。例外**精确到版本且附移除条件**——**禁止**按包名整包放行 `minimumReleaseAgeExclude`，**不得**为此放宽全局窗口。 | 新增 / 调整供应链与工具链配置 | L1：官方文档 + 对照实验记录 |
| 5.1.58 | 改动落在 typecheck include 面（含 `tests/**`）就必须实跑 typecheck；闭包内给外部变量赋值用对象持有（`{ fn?: ... }`）绕开流分析窄化，不加非空断言掩盖。 | 改测试文件 / 异步回调内赋值 | L1：`typecheck` exit 0 且 `error TS` 0 命中 |
| 5.1.59 | 周期任务 = `running` 重入守卫 + 结果驱动状态机（终态 / 可重试 / 退避 / 尝试上界）；退避以上一次执行**完成时刻**计；配置关闭只清退避不清计数。 | 新增 / 修改 `setInterval` 类周期插件 | L2：状态机单测 + 重入用例 |

## 6. 样式规范（平台阶段适用）

- **纯 SCSS**：禁止 CSS-in-JS、Tailwind；优先复用全局变量（Variables）与混合宏（Mixins）。
- **BEM 命名**：组件样式遵循 `block__element--modifier`；禁止 `!important`（破坏 CSS 层级结构）。
- **暗色模式**：通过 `.dark &` 覆盖（`main.scss` 是全局 CSS 无 scope，`:global(.dark) &` 编译失败），详见 [平台开发规范 §7](./platform.md)。
- **响应式基线（768px）**：dashboard / 列表 / 表格页默认支持 768px（`@media (max-width: 768px)` 切换 `grid-template-columns: 1fr`、表格水平滚动、侧栏折叠）；V 阶段 ui-validator 自动检测遗漏，遗漏判 Blocker。
- **跨 Dialog i18n label key 共享**：共享选项数据（mode / severity / batch-start 等）的 i18n label key 也应共享，仅在 Dialog 标题 / 目标信息等真正差异处新增 key。
- **子组件抽取时 scoped 样式必须随迁**：父页 `<style scoped>` 的同名规则**不会穿透子组件** → 规则整段静默失效且构建 / lint 全绿。**判据**：子组件 `grep -c "<style"` = 0 而同名类名只在父页样式出现 → 迁移遗漏；**做法**为整段搬到子组件并删除父页副本，用构建产物 CSS 复核生效。
- **同行 `flex-end` 对齐下矮控件会压矮整字段**：同一行 `align-items: flex-end` 排列 label + 控件时，矮控件会把整字段盒压矮；**做法**是为控件区补足控制档高度并垂直居中，而不是改行对齐方式。
- **复用抽取前先确认「已全局注入的复用载体」**：`_variables.scss` / `_mixins.scss` 已通过 Vite `additionalData` 全局注入，SFC `<style scoped>` 内可直接用变量与 `@include`（抽 mixin 无需 import）；两坑：① mixin 默认参数在**定义侧**求值，`_mixins.scss` 需自行 `@use './variables' as *`；② 只抽「口径」不抽「样式细节」。
- **表单字段堆叠口径（label↔控件）**：垂直堆叠字段间距取第二档（`$space-2` = 8px），弹窗内外一致，统一 `@include field-stack`（`_mixins.scss`）；**边界**为显示型 `label↔值` 堆叠（统计卡 / 指纹盒 / 弹窗 meta 项）语义不同，不适用本口径。

## 7. 包命名规范

| 子包 | npm 名 | 类型 | 说明 |
|------|--------|------|------|
| `packages/core` | `@dependfix/core` | 内部库 | 核心领域模型，被其他包消费 |
| `packages/engine` | `@dependfix/engine` | 内部库 | 共享执行引擎（`DependfixApp`），cli / mcp / platform 共同依赖 |
| `packages/skills` | `@dependfix/skills` | 内部库 | 产品 skill 权威源（dependfix-remediator） |
| `packages/cli` | `dependfix` | CLI 工具 | 用户通过 `npx dependfix` 调用 |
| `packages/mcp` | `@dependfix/mcp` | MCP Server | MCP 协议服务 |
| `apps/platform` | `@dependfix/platform` | 应用（Nuxt 全栈） | 管理平台，非库；归 `apps/` 目录体系 |

- CLI / 可执行入口用 **unscoped** `dependfix`；内部库与应用（`apps/*`）用 **scoped** `@dependfix/*`，仅限工作区内部消费、不发布 npm。
- 可发布包清单单点权威见 [packages.config.mjs](../../scripts/packages.config.mjs)；新增发布包须登记并同步 README / release.md / CI 引用（见 [code-quality-checklist 新增发布包链路完整性](../../.github/skills/code-reviewer/references/code-quality-checklist.md)）。

## 8. 提交规范

- 遵循 [Conventional Commits](https://www.conventionalcommits.org/)；type / 主题行 / 正文的完整规则见 [Git 规范 §3.1](./git.md)。
- 提交语言使用中文或用户使用的语言；单次提交对应一个逻辑变更，避免「大杂烩」提交。

## 9. 提交前检查

1. **Review Gate**：所有改动必须经至少一轮 review 且 A 阶段（`Code Auditor (代码审计员)`）放行。
2. **Lint**：**门禁** `pnpm run lint:check` 零 error（无 `--fix`，依次跑根配置与平台独立配置；告警预算：根 10 / 平台 11，超预算即失败）；本地自动修复用 `pnpm lint`；涉及 CSS / SCSS / Vue 样式（含 `.vue` 样式块）时门禁另跑 `pnpm run lint:css:check`（本地修复用 `pnpm --filter @dependfix/platform lint:css`；`stylelint-config-cmyr` 无 warning 级规则，违规即 error，无需告警预算）。
   若把只带 `--fix` 的 `pnpm lint` 当门禁，自动修复会被静默写回工作区而提交态仍带 error（本地绿 / HEAD 红）——质量门禁（Test / Release / Docker）与提交前复核一律用 `lint:check`；产品自修复链（`security-auto-fix.yml`）保留 fix 语义，不属门禁。
3. **Typecheck**：`pnpm typecheck` 零 error。
4. **测试**：定向测试通过；命中全量测试条件时执行 `pnpm test`。
5. **提交执行**：必须通过 `conventional-committer` skill 提交（禁止裸 `git commit -m`），见 [Git 规范](./git.md)。

## 10. Code Scanning 告警处理流程

1. **获取告警详情**：`gh api repos/owner/repo/code-scanning/alerts` 取告警类型、位置与描述。
2. **根因分析 + 搜索优先**：确认是否误报，避免不必要修复。
3. **制定修复方案**：按告警类型针对性修复（如命令注入 → `execFileSync` 替代 `execSync`）。
4. **质量门验证**：lint + typecheck + test 确保不引入回归；**安全修复用 `deep` 级别审计**。
5. **提交**：经 `conventional-committer` 提交，消息格式 `fix(scope): 描述`。

**同类告警的通用修法**：

- `js/incomplete-sanitization`（Markdown 表格转义）：**先反斜杠后竖线**——只转义 `|` 时输入自带的 `\|` 会变成「反斜杠 + 裸竖线」而拆列；同一行的 URL 单元格同样会被 `|` 拆列，link destination 除括号外还要编码 `%7C`。审计相邻 suggest 常能抓到告警规则之外的同类实例。
- `js/polynomial-redos`：优先把整段改为**线性扫描**（`indexOf` + 单调缓存下一个界符），而不是原子化 / 限长（前者只缓解、后者改容错语义）。验收 = 原始见证 100KB 单次 < 50ms + 新旧实现差分 fuzz + 既有黄金用例逐字不变。

## 11. 相关文档

- [测试规范](./testing.md) / [API 规范](./api.md) / [安全规范](./security.md) / [文档规范](./documentation.md) / [项目规划规范](./planning.md)
- [AI 协作规范](./ai-collaboration.md) / [Git 规范](./git.md) / [平台开发规范](./platform.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进。
