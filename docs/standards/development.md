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

- **5.1.1 错误路径 helper 自身不抛异常**：统一用 `toErrorMessage(value)` 提取消息（Error→message / string→原样 / 可序列化→JSON / 其余→类型描述），禁止在 catch 手写 `instanceof` 分支；helper 内 `JSON.stringify` 必须 try/catch（循环引用会 throw 并掩盖原始错误）且有单测锚定。
- **5.1.2 日志输出人读 / 机读双模**：`process.stdout.isTTY` 检测 → TTY 输出格式化彩色文本，非 TTY（CI / 管道）输出 JSON。
- **5.1.3 截断带固定前缀的 ID 先去除前缀**：禁止对 `prefix-<唯一段>` 直接 `slice(0, N)`（唯一部分会被丢光）；先去掉固定前缀再截断或取最后分隔段；文件名 / 分支名采用 `YYYYMMDD-HHmmss-{唯一尾段}`（字典序 == 时间序且唯一）。
- **5.1.4 改名 / 迁移全局排查命名残留**：前缀抽为统一常量 + 封装读取辅助，所有读取必须走它；改名后全局搜索旧名（含 env 前缀、错误消息、注释、示例），不只看文件引用。
- **5.1.5 Node 脚本 main 入口守卫（必须）**：`scripts/*.mjs` 等可执行脚本**必须**用入口守卫包裹 `main()` 调用（`process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`）；新脚本完成后 grep `process.argv[1]` 确认。
- **5.1.6 测试不得依赖 git 忽略工作区文件的存在性**：不得隐式依赖 `.session/` / `temp/` 等 git 忽略目录下文件（本地有、CI 无 → 行为分叉）；必须依赖时把路径 / 内容作为参数注入，或模拟缺失场景验证两分支。
- **5.1.7 容器拼装类注释必须准确区分 `execFile` 与 `exec`**：`execFile` 不经过 shell、**不会**回显 argv；准确语义是 `spec.env` 隔离（避免 cmd/test 日志、git URL、daemon config 可见 token）；注释必须真实反映防御机制，错写威胁模型会把后续审计引向错误方向。
- **5.1.8 JSDoc 必须与可见性声明一致**：`private` 方法不得写「导出便于 snapshot 测试」；拼装类函数（`buildRunArgs` / `buildSpawnArgs`）应在测试中 snapshot 验证（拼装 bug 在真起容器前难暴露）。
- **5.1.9 测试 Spy 与生产实现同模块时必须 `@internal` 标注**：Spy 类加 `@internal` JSDoc + 文件级「生产代码禁止导入」；用 eslint `no-restricted-imports` 限制生产 import spy 路径作最稳护栏。
- **5.1.10 删除「自动状态赋值」时必须搜遍所有被动接收路径**：单点删除会留下隐式不一致（如已删自动赋值后旧 `selectedRepos` 让 checkbox 呈 disabled+checked、计数过期）；删除后须在 `emit('success')` 后、`await reload()` 前主动重置状态，形成闭环。
- **5.1.11 调试临时代码必须在 commit 前清理**：`// DEBUG` / `console.log('[debug]', …)` / `debugger` / `alert(…)` / 未跟踪 `// TODO` 一律清理（lint 拦不住浏览器端调试输出，code-auditor 会作 blocker Reject）；ui-validator 视觉验证时自建的截图脚本属同类，`git status` 不应有 untracked 临时文件。
- **5.1.12 `script setup` 顶部调试代码触发 TDZ 陷阱**：引用**尚未声明的 ref / computed** 会触发 `Cannot access 'X' before initialization` SSR 500（真错误，非 hydration warning）；引用前确认声明顺序，或放进 `watchEffect` / `onMounted`。
- **5.1.13 覆盖率阈值回归优先在既有测试文件补 case**：不新建 test 文件、不临时修改 vitest 阈值；判断标准是 diff 文件数小 + 风险扩散低 + 价值密度高。
- **5.1.14 OR 链写回决策须逐项追踪条件真假**：`if (a || b || c || d || e)` 写回决策必须逐项追踪每个条件才能准确断言；常见错误是以为某标志为 false 就完全不写回；调试时打开真实 SQL 数据看写回后字段，不按单一标志反推。
- **5.1.15 集成外部库前必须读 README 标准用法 + 落地真实路径 e2e 冒烟（hard requirement）**：集成前必须查 README 官方示例；**集成层测试不 mock 真实被集成库**（真实路径冒烟须用真实密钥 / 真实拦截）；「单测全过 + typecheck 0 error」≠ 集成 Done，必须有「真实路径调用 + 关键行为断言」的可执行验证（已挂 code-auditor 必查项）。
- **5.1.16 v-model 修改嵌套字段必须用 `reactive` + deep watch（hard requirement）**：Nuxt `useAsyncData` 内置 watch 为浅监听（reference equality），对 nested field mutation 不响应；v-model 嵌套字段须用 `reactive` 而非 `ref`，配 getter source + `{ deep: true }`；依赖默认 `dedupe: 'cancel'` 抑制双触发，改 dedupe 策略前须重新评估。
- **5.1.17 一次性脚本 TypeScript 价值评估（避免 over-engineering）**：不为「项目完整性」添加不必要 devDep；装饰器密集型 ORM（TypeORM / Prisma / Drizzle）必须 TS（Node 内置 strip-types / transform-types 均不处理装饰器，需 `emitDecoratorMetadata`）；CLI 端 entity metadata 必须显式 import 触发装饰器注册；`engines` 应与实际部署的 Node LTS 版本对齐。
- **5.1.18 SQLite 数据库启动期自动备份**：应用范围 = 所有 better-sqlite3 部署形态（dev / e2e / prod / 容器），e2e 库与业务库各自独立（不交叉备份）；**禁止**用 `--no-verify-backup` 跳过、禁止备份目录走 `.gitignore` 之外位置、禁止备份阻塞启动超 5 秒；D 阶段自检与 A 阶段 Review Gate 均须验证 `backup.ts` 含 fsync + 保留策略。权威完整声明见 [security.md §2.1](./security.md)。
- **5.1.19 TypeORM 1.x `synchronize` 与 `migrationsRun` 反模式禁止（hard requirement）**：禁止二者同时为 `true`，禁止 dev 模式硬编码自动开启 synchronize；dev 走显式 opt-in + `migrationsRun: false`，prod 默认关闭，e2e 用 `synchronize: true` + `migrationsRun: false`；启动期日志必须打印生效值与来源；涉及 NOT NULL 列无 default 的 schema 变更**必须**走 migration（synchronize 在 SQLite 会失败）。
- **5.1.20 atomic commit 边界（重构支撑 vs 业务行为变更必须分 commit）**：重构支撑（不改行为，仅改善结构）与业务行为变更（默认值反转 / 逻辑反转 / 新增功能）必须分 commit；需打印某变量时先临时用内联表达式，行为变更 commit 时再统一提取。
- **5.1.21 zod `.optional()` 接受 `undefined` 为合法值（陷阱模式）**：区分「未传字段」与「传 undefined」需**显式** `data !== undefined` 判断，否则 `data === 'value'` 三元恒为 false；对 `boolean` 字段必须保留该区分（`false` 是合法值）；统一用 `apps/platform/server/utils/zod-helpers.ts` 的 `parseOptional`（强制三态 success / value / isProvided）。
- **5.1.22 baseline lint 治理路径：删除占位符而非改写为 `void X`**：`no-unused-expressions` 与 `no-meaningless-void-operator` 双重禁止；治本方向为删除冗余表达式或改写为 `if` 块（本项目标准做法），禁止 `void X` 改写、禁止 eslint-disable 抑制、禁止提高 `max-warnings` 临时方案——CI 触发 ESLint 临界值是「信号」而非「阈值调整」。
- **5.1.23 git config user identity 一致性 guard**：git config 优先级 `local > global > system`，`.git/config [user]` 会**静默**覆盖 global；以 `.husky/pre-commit-identity-guard.sh`（pre-commit 第一步）检测不一致并阻断 commit；session 启动时对齐 `.session/current-task.yaml` 段与 local / global user；**严禁批量改历史 commit author**（除非用户显式同意并走 rebase + 强制 push）。
- **5.1.24 多 key 生成循环必须按 key 预聚合取 max（last-write-wins 陷阱）**：循环内直接 `map[key] = value` 会让最终值取决于遍历顺序；先 `Map<key, value>` 预聚合（如 `compareSemver` 取 max）再统一写入。
- **5.1.25 声明范围前必须全仓库穷举同根因调用点**：以**行为特征**（git 子命令 argv、环境变量读取）而非「包路径」为锚点全仓库扫描，跨包（尤其平台侧）命中逐条列入范围或显式排除；**同根因判定要改在共用层**，不要下沉到各调用方；同时检查下游消费方是否硬编码了单一场景文案。
- **5.1.26 构建产物 dts 入口与共享 chunk 文件名冲突（tsdown `hash:false`）**：多 entry 构建时用 `outputOptions.chunkFileNames` 把 chunk 隔离到 `chunks/` 子目录，entry 名保持稳定；构建后 `dist/` 出现 `index2.d.mts` / `index2.mjs` 即命中（详见 [backlog.md §已知边界](../plan/backlog.md#tsdown-hashfalse-下-entry-与共享-chunk-文件名冲突持续观察)）。
- **5.1.27 迁移 / 等价性判断前必须回读迁移前源码**：用 `git show HEAD:<file>`（或迁移前 commit）回读实际源码；库文档只用于解释**差异成因**，不得用于推断仓库现状。
- **5.1.28 「依赖卸载 + 引用归零」类任务的规模口径**：规模不在依赖数而在**引用面**；规划阶段必须定义 `rg` 归零口径（是否含注释 / 文档 / 历史编号），体积对比基线须回溯到迁移前 commit 现场构建。
- **5.1.29 配置优先级口径必须写明「字段级 / 逐条合并」并配证伪用例**：只写「优先」会让实现与测试各自漂移；口径须写全（如「中央一旦指定该字段即整体忽略目标仓库声明，不按 glob 逐条合并」），并配「高优先级来源存在但未覆盖该对象」的证伪用例。
- **5.1.30 构造期合并配置：保持 `readonly` 单次赋值**：不要为构造期合并把 `private readonly config` 改成可写；把依赖该字段的初始化块**后移**做单次赋值，避免引入第二份 effectiveConfig（双来源漂移）。
- **5.1.31 声明「与环境开关解耦」必须穷举同族开关**：只锁一个开关不足以成立，必须一次性穷举同族开关（典型 `migrationsRun` + `synchronize` 双 opt-in）并为每个开关配断言；配套打印**实际生效值**（而非按 env 打印的开关值）以消解「声明值 vs 生效值」错位。
- **5.1.32 pnpm overrides 的「通用钉定」会压过「版本化覆盖」**：同包同时存在无版本限定的通用覆盖与版本化覆盖时，通用钉定胜出 → 解析版本被压回旧版，令升级失效。**排查**：出现「升级了但漏洞还在」时先列 `pnpm-workspace.yaml` 的 overrides；**清理**保留版本化一条，再用 `pnpm audit` 复验计数。
- **5.1.33 同构站点穷举必须用「构建产物」**：源码 grep 只能发现**值不同**的站点，结构同构但取值已一致的站点会被整体漏掉；构建后扫 `.output/**` 的 CSS 并**合并同一选择器的多条规则**再按特征筛。通用提问：声明「范围已穷举」前先自问「我的筛选条件是否只能命中目标的一部分？」。
- **5.1.34 依赖升级的差异口径：语义级 diff + 无 release 时以 tarball 为权威**：① 剥掉文件名 hash 与 `[data-v-*]` scope 后逐文件**语义级** diff，传递依赖版本逐版核对；② 上游无 release / changelog 时以**产物本身**为权威（`npm pack` 后比对文件集 + d.ts 公开面 + token 值集合），比猜测 changelog 更可复现。
- **5.1.35 `rg -r` 是 `--replace` 而非递归（输出替换陷阱）**：`-r` / `--replace` 会把匹配片段替换为给定文本再输出（不改文件），误写 `rg -rn` 会产出**假象**输出；多文件搜索只用 `rg -n`（递归是默认行为），确需替换语义时才显式写 `-r`。
- **5.1.36 并发终态写必须用条件 UPDATE（乐观锁 = 读取时状态）**：禁止「读内存态 → 整行 `save`」；改用 `update({ id, status: <读取时状态> }, payload)`，`affected === 0` 即跳过写回；乐观锁条件取**读取时状态**而非写死 `'running'`。**配套**：`update()` 不触发 `@UpdateDateColumn`，payload 须显式写 `updatedAt`；写回被跳过时调用方应重读库中状态。
- **5.1.37 存在「第三态」时「全部失败」判据不能用「失败数 == 总数」**：多源 / 多分支判定只要存在第三态（既非成功也非失败，如 `ALERTS_DISABLED`），「全部失败」不能用 `失败数 === 总数`（总数含第三态时判据恒假）；**正确判据**为「失败数 > 0 且成功数 === 0」。**配套**：抛错前 per-source 状态必须已完整写入；仓库级 catch 追加信号前先判「该仓库是否已有带 `source` 的同类信号」，否则形成重复信号。平台侧实例见 [platform.md §6.1](./platform.md#61-错误码与告警状态口径平台展示消费-engine-错误码)。
- **5.1.38 失败路径写回只写终态字段（不得整行 save / 整份载荷条件写回）**：失败路径持有的是创建期或读取期内存实体，整行 `save()` 或复用整份聚合载荷会把并发详情 GET 已聚合的计数 / `summary` 覆盖回旧值（与 5.1.36 同族）；**做法**为失败通道单独提供只写 `status` / `finishedAt` / `updatedAt` 的条件写回 helper，`affected === 0` 时**不改库也不改内存实体**；同一子系统内多条失败路径应共用该 helper。

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
2. **Lint**：`pnpm lint` 零 error。
3. **Typecheck**：`pnpm typecheck` 零 error。
4. **测试**：定向测试通过；命中全量测试条件时执行 `pnpm test`。
5. **提交执行**：必须通过 `conventional-committer` skill 提交（禁止裸 `git commit -m`），见 [Git 规范](./git.md)。

## 10. Code Scanning 告警处理流程

1. **获取告警详情**：`gh api repos/owner/repo/code-scanning/alerts` 取告警类型、位置与描述。
2. **根因分析 + 搜索优先**：确认是否误报，避免不必要修复。
3. **制定修复方案**：按告警类型针对性修复（如命令注入 → `execFileSync` 替代 `execSync`）。
4. **质量门验证**：lint + typecheck + test 确保不引入回归；**安全修复用 `deep` 级别审计**。
5. **提交**：经 `conventional-committer` 提交，消息格式 `fix(scope): 描述`。

## 11. 相关文档

- [测试规范](./testing.md) / [API 规范](./api.md) / [安全规范](./security.md) / [文档规范](./documentation.md) / [项目规划规范](./planning.md)
- [AI 协作规范](./ai-collaboration.md) / [Git 规范](./git.md) / [平台开发规范](./platform.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进。
