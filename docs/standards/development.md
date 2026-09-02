# 开发规范

## 1. 核心原则

- **模块化与组件化**: 遵循高内聚低耦合，公共逻辑迁移到 `utils/` 或可复用模块。
- **降低耦合度**: 纯函数与副作用代码分层；核心模块依赖方向单向、可注入。
- **提升复用率**: 重复逻辑抽象为工具函数，删减样板代码。
- **类型安全**: 全面使用 TypeScript。严禁使用 `any`，不确定类型时优先使用 `unknown` + 类型守卫。
- **显式假设原则**: 需求、边界不清晰时，必须先暴露假设并澄清，禁止靠默认猜测推进实现。
- **搜索优先原则**: 当需要外部信息或根因不明确时，优先搜索获取一手信息。详见 [AI 协作规范](./ai-collaboration.md)。
- **最小变更原则**: 聚焦目标本身，减少对无关代码的触动。
- **实用性优先**: 避免过度设计。引入新功能前评估真实价值与成本。
- **决策梯子原则**: 实现前按顺序判断 —
  1. 真的需要做吗？不需要就跳过（YAGNI）
  2. 代码库里已经有了？复用，别重写
  3. 已安装的依赖能解决？用现有依赖
  4. 能用 util 封装？封装复用
  5. 能一行搞定？一行
  6. 实在不行：写最少能工作的代码

## 2. 命名约定

| 类别 | 规则 | 示例 |
|------|------|------|
| 文件 | `kebab-case.ts` | `app-error.ts`、`runtime-config.ts` |
| Vue 组件 | `kebab-case.vue` | `app-header.vue`、`dashboard-view.vue` |
| 类型/接口 | `PascalCase`，优先 `interface` | `NormalizedSecurityAlert`、`RuntimeConfig` |
| 函数/变量 | `camelCase` | `resolveRuntimeConfig`、`isValidRepoIdentifier` |
| 常量 | `UPPER_SNAKE_CASE` | `RUNTIME_MODES`、`SEVERITY_THRESHOLDS` |

## 3. 注释规范

- **注释只解释关键点**: 优先说明"为什么这样写""边界条件""隐含约束/副作用"，不把代码表面行为复述一遍。
- **复杂逻辑必须补注释**: 涉及复杂分支、状态切换、兼容性兜底、协议契约、性能或安全取舍的代码必须加注释。
- **导出函数默认应有 JSDoc**: 简要说明用途、边界、返回语义与副作用。
- **禁止无效或过量注释**: 不机械给每行、每个变量加注释。
- **注释必须随实现同步**: 修改逻辑时同步更新或删除过时注释。
- **禁止开发流程编号标记**: 注释与测试名中一律不得出现 `C1:`、`T303`、`G2`、`M4+`、`R2`、`P0` 这类规划 / 任务 / 审计 / backlog 编号（含 `C1：xxx` 与 `it('C1: xxx')` 形式）。阶段与编号是规划文档（`docs/plan/`）中区分进度的概念，代码中无意义且无法反查；追溯用 `git blame` / 审计记录。例外：代码内真实存在的常量（如 HTTP 错误码 `E401`），以及**指向规划文档的导航说明**（如"背景详见 `docs/plan/todo.md`「已知缺口 G2」"、"见 todo.md G3"、"见 backlog B1"）——导航指针内的规划编号属例外，因为它们提供真实可查的文档锚点，但必须同时写明文档路径或章节名，不得只写孤立编号。**执行挂接**：D 阶段自检（Full Stack Master (全栈大师) agent）与 A 阶段 Review Gate 必查项（Code Auditor (代码审计员) agent）均含本检查；违反案例见 [经验归档 §十六](../design/governance/experience-archive.md)。
- **同一解释只写一处**: 相同背景说明（平台坑、口径、设计取舍）在仓库内只保留一处，通常放在首次出现或语义最贴近的位置；其他位置要么不写，要么用一句话指向文档。
- **详细解释放文档，代码只留短指针**: 完整设计背景、复盘结论、口径变更写入 `docs/design/`、`docs/research/` 或复盘文档；代码注释只保留一句"为什么"或文档指针，不展开长文。
- **简化标记约定**: 主动选择简化实现时使用 `// lean:` 标记：
  ```typescript
  // lean: global lock, per-account locks if throughput matters
  // lean: single query, batch if > 1000 items
  ```

## 4. 目录约束

```
packages/core/src/           # 核心域层，不依赖任何运行时环境
├── alerts/                  # 告警标准化模型
├── errors/                  # 错误模型（AppError）
├── filters/                 # 告警过滤引擎
├── logger/                  # 日志工具
├── planner/                 # 修复规划模型
├── report/                  # 报告模型
├── toolchain/               # 工具链策略
└── utils/                   # 纯函数工具（不依赖外部服务）

packages/engine/src/         # 共享执行引擎（DependfixApp），cli / mcp / platform 共同依赖
├── ai/                      # AI 研判（breaking change 分析、patch 生成）
├── alerts/                  # 告警处理
├── app/                     # DependfixApp 应用骨架
├── code-scanning/           # Code Scanning 集成
├── config/                  # 配置层（多源合并、校验）
├── fixers/                  # 修复器（dependency / pnpm / code-scanning）
├── github/                  # GitHub API 集成
├── grouping/                # 依赖分组升级
├── helpers/                 # 公共辅助
├── multirepo/               # 多仓库治理
├── report/                  # 报告模型
├── runners/                 # 执行器
└── verification/            # 验证链（install / lint / build）

packages/cli/src/            # CLI 入口（薄壳），编排依赖 engine
├── app/                     # pipeline（本地执行编排）
├── cli/                     # 参数解析与运行入口
└── skills/                  # skill 编排（agents / doctor / installer / source）

packages/mcp/src/            # MCP Server，能力复用 engine
├── bin.ts                   # 进程入口
└── tools/                   # MCP tools（run_scan / fix_dependency 等）

packages/skills/             # 产品 skill 权威源（dependfix-remediator，发布 npm）
├── dependfix-remediator/    # skill 内容（SKILL.md / REFERENCES.md）
└── test/                    # 一致性测试

apps/platform/               # Nuxt 全栈平台
├── app/                     # 前端（pages / components / composables / utils / layouts / middleware）
├── server/                  # API 路由、数据库、服务
└── data/                    # 运行时数据（不入库内容）
```

### 依赖约束

- `packages/core/` 不依赖任何运行时环境（Node / 浏览器 API）与任何内部包
- `packages/engine/` 承载共享执行能力（`DependfixApp`），内部包依赖仅 `@dependfix/core`
- `packages/cli/` 为薄壳，依赖 engine 编排
- **禁止 cli / mcp / platform 应用层之间互相依赖**：mcp 曾依赖 cli（`dependfix` 包）导致应用层互相依赖 + 连带安装膨胀 + 版本耦合，engine 拆包解决（见 [todo.md](../plan/todo.md)「已完成任务：@dependfix/engine 拆包」）；`packages/mcp/` 与 `apps/platform/` 均只依赖 `@dependfix/engine` + `@dependfix/core`
- `packages/skills/` 为资源包（无运行时依赖），仅被 cli 消费
- 依赖方向单向：`core` ← `engine` ← `{cli, mcp, platform}`；禁止反向与循环引用
- 共享能力一律下沉 engine 后在应用层复用，禁止应用层复制实现或直连 core 内部模块

**执行挂接**：本依赖约束的合规核验由 A 阶段 Review Gate 必查项执行（见 [code-quality-checklist 包依赖约束](../../.github/skills/code-reviewer/references/code-quality-checklist.md) 与 `Code Auditor (代码审计员)` 必查项）。

## 5. TypeScript

- 严格模式逐步收紧（当前 `noImplicitAny: false` 为过渡状态）
- `tsc --noEmit` 必须通过
- 禁止 `any` 逃逸（逐步清零）
- 优先使用 `interface` 定义类型，需要联合类型时使用 `type`

### 5.1 工程经验

#### 5.1.1 错误路径 helper 自身不抛异常

- 统一用 `toErrorMessage(value)` 提取错误消息（Error→message、string→原样、可序列化→JSON、其余→类型描述），禁止在 catch 块手写 `instanceof` 分支。
- 错误路径 helper 必须 try/catch 包裹 `JSON.stringify`（循环引用会 throw，掩盖原始错误），且必须有单测锚定。

#### 5.1.2 日志输出人读/机读双模

- 所有输出考虑"人读 vs 机读"双路径：`process.stdout.isTTY` 检测 → TTY 输出格式化彩色文本，非 TTY（CI/管道）输出 JSON。

#### 5.1.3 截断带固定前缀的 ID 先去除前缀

- 对 `prefix-<唯一段>` 形式的 ID，禁止直接 `slice(0, N)`（唯一部分会被丢光）；先去掉固定前缀再截断，或取最后一个分隔段。
- 文件名/分支名采用 `YYYYMMDD-HHmmss-{唯一尾段}`（字典序==时间序且唯一）。

#### 5.1.4 改名/迁移全局排查命名残留

- 命名前缀抽为统一常量 + 封装读取辅助，所有读取必须走它（防漏网）。
- 改名后全局搜索旧名（含 env 前缀、错误消息、注释、示例），不只看文件引用。

#### 5.1.5 Node 脚本 main 入口守卫（必须）

- `scripts/*.mjs` 等可执行脚本**必须**用入口守卫包裹 `main()` 调用：

  ```javascript
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
      main().catch(...)
  }
  ```

- 原因：vitest 单测 `import` 模块时会执行顶层副作用——无守卫时 main() 无条件运行，若依赖工作区文件（如 `.session/wisdom.md`）会 `process.exit` 被 vitest 拦截报 `Unhandled Rejection`，且仅 CI（无该文件）暴露、本地侥幸通过（2026-08-13 distill-wisdom 案例，见 [经验归档 §三十九](../design/governance/experience-archive.md)）。
- vitest 4 起拦截更严：`process.exit` 在 import 阶段触发会抛 `Error: process.exit unexpectedly called with "1"`，stack trace 同时指向脚本自身 + 测试 import 行（CI 在 nuxt prepare + workspace build 后文件状态变化时命中）。新增脚本复制既有脚本骨架时，守卫是最容易被漏掉的一行——完成新脚本后 grep `process.argv[1]` 确认。

#### 5.1.7 容器拼装类代码注释必须准确区分 `execFile` 与 `exec`

- docker 拼装类代码注释禁止写"防 argv 回显"等不准确表述。`execFile` 不经过 shell，**不会**回显 argv（与 `exec` 不同）。
- 准确语义：`spec.env` 隔离，避免 cmd/test 日志、git URL、daemon config 可见 token（凭据走 `http.extraheader` 等带外通道，与 argv 无关）。
- 注释必须真实反映防御机制，错把"防 argv 回显"当成威胁模型会导致后续审计按错误方向找漏洞。

#### 5.1.8 JSDoc 注释必须与可见性声明一致

- `private` 方法 + JSDoc 写"导出便于 snapshot 测试"自相矛盾。若实际不导出，改注释或改 `public` / `internal`。
- 拼装类函数（如 `buildRunArgs`、`buildSpawnArgs`）应在测试中 snapshot 验证——拼装 bug 在真起容器前难暴露，靠运行时回显只能发现一半问题。
- 注释与实现脱节会被 audit 作为 warning 处置；统一规范后减少文档维护成本。

#### 5.1.9 测试 Spy 与生产实现同模块时必须 `@internal` 标注

- `SpyAdapter` 与生产 `Adapter` 同模块导出时，必须在 Spy 类上加 `@internal` JSDoc + 文件级注释"生产代码禁止导入"，避免业务模块误用 spy 路径导致测试覆盖率虚高、运行时行为错位。
- 强约束：eslint `no-restricted-imports` 规则限制生产代码 import spy 路径是最稳护栏，新写 Spy 模块时同步配置。
- 已有项目内案例：`packages/engine/src/runners/*.ts` 中 Docker adapter 与 spy 同模块导出（commit `b189aaa` 落地）。

#### 5.1.10 删除"自动状态赋值"时必须搜遍所有被动接收路径

- 删除状态自动赋值逻辑（如 `selectedRepos.value = ...filter(...)`）前，必须审视所有调用路径是否依赖该自动行为收敛。
- 被动接收态举例：成功提交后重新调用 `loadImportable()` 时，已删的自动赋值语句留下的旧 selectedRepos 会让 checkbox 呈 disabled+checked 态、计数过期、按钮仍可点——误导用户。
- 修复范式：在 `emit('success')` 后 `await reload()` 前主动 `selectedRepos.value = []`，让"删除"与"主动重置"形成完整闭环。
- 原则：**删"自动逻辑"必须搜遍所有"被动接收该状态的路径"**——单点删除会留下隐式不一致。

#### 5.1.11 调试临时代码必须在 commit 前清理

- 任何调试临时代码（`// DEBUG` 注释、`console.log('[debug]', ...)`、`// TODO` 未跟踪项、`alert(...)` 弹窗、`debugger` 语句）必须在 `conventional-committer` 提交前手动清理。
- 不能依赖 lint（`no-console` 等规则仅限服务端日志场景，无法拦截浏览器端调试输出），code-auditor 会作为 blocker Reject。
- 调试完成后立即清理，不要等到 commit 前——`git diff --staged` 容易遗漏单行 `console.log`，养成实时清理习惯。
- 范围扩展：ui-validator agent 视觉验证时自建的截图脚本（如 `*-visual-verify.e2e.test.ts`）属同类——`git status` 不应有 untracked 临时文件。

#### 5.1.6 测试不得依赖 git 忽略工作区文件的存在性

- 测试/脚本不得隐式依赖 `.session/`、`temp/` 等 git 忽略目录下文件的存在性（本地有、CI 无 → 行为分叉，CI 挂、本地过）。
- 必须依赖时：把路径/内容作为参数注入，或模拟缺失场景（临时移走文件）验证两分支。

#### 5.1.12 调试临时代码触发 TDZ（Temporal Dead Zone）陷阱

- `script setup` 顶部加临时调试 `console.log` 引用**尚未声明的 ref/computed** 会触发 TDZ `Cannot access 'X' before initialization` SSR 500 错误——即使 `console.log` 只是 debug 也会让整个 SSR 阶段失败（不是 hydration warning 而是真错误）。
- 教训：临时调试代码引用变量前必须确认其在执行前已声明，或放在 `watchEffect` / `onMounted` 里。
- 调试完成后立刻清理不留痕（与 §5.1.11 调试临时代码清理规则配合）。
- 实证：某批次 `users.vue` 调试时 `console.log(users[0])` 引用了下面才声明的 `const users = ref(...)` 导致 SSR 500，移除 console.log 即修复。

#### 5.1.13 已测试文件补测胜于新建（CI 覆盖率阈值回归修复模式）

- CI Coverage 阈值回归（差 7 分支）时，**优先在已有测试文件加 case**，而不是新建 test 文件或临时修改 vitest 阈值。
- 判断标准：diff 文件数 = 1 / 风险扩散 = 0 / 价值密度 = 高（覆盖核心聚合更新策略 / 失败终态保护 / 多状态流转等业务关键路径）。
- 实证：某次 CI Coverage 阈值回归（79.88% < 80%）时，目标文件 `apps/platform/server/api/batch-runs/[id].get.test.ts` 已有 2 case（success + 404），文件本身有测试基础设施（mock + beforeAll 创建 batchRun/scanRun）+ 目标文件 branches 55.17%（13 未覆盖）+ 1 文件 3 case 即可覆盖 line 36/45-49/50/58/65 全部未命中分支 → branches 55.17% → 82.75%（+27.58%），全 workspace 79.88% → 80.02%（+8 分支）。

#### 5.1.14 OR 链触发条件精确追踪（`if (a || b || c || d || e)` 写回决策测试模式）

- `if (a || b || c || d || e)` 写回决策的 OR 链必须**逐项追踪每个条件真假**才能准确断言测试用例。
- 常见错误：以为 "statusWriteBack=false 就完全不写回"，但 counts 差异仍会触发 OR 链进入写回块（只跳过 status 赋值，counts/summaryJson 仍更新）。
- 修复模式：调试 case 时打开真实 SQL 数据看 `batchRepo.save` 后的状态字段；不要"想当然"按 statusWriteBack 反推。
- 实证：Case 3（running + 1 running）的 `pendingCount=0 → 1` 实际写回后不是 0，断言 `toBe(0)` 失败即源于此错误假设（CI Coverage 修复批次 commit `0c57211`）。

#### 5.1.15 集成外部库前必须读 README 标准用法 + 落地真实路径 e2e 冒烟测试（hard requirement）

集成任何外部库（`@octokit/*`、Vue 插件、TypeORM、Playwright、better-auth 等）前**必须**先查 README 官方示例（installation / authentication / getting started 章节的契约代码）——训练数据 / 直觉写法可能与最新库契约不符（如 `@octokit/auth-app` v8.x README 要求 `authStrategy: createAppAuth, auth: {...}` 双字段，凭直觉写 `auth: createAppAuth(...)` 必抛 `Token passed to createTokenAuth is not a string`）。

**集成层测试不 mock 真实被集成库**：mock 仅替换被测单元边界（如 mock `@octokit/auth-app` 时**不** mock `@octokit/rest`，让 `@octokit/core` 真实构造路径可执行）；mock 形态永远无法完整模拟真实 dispatch 行为（@octokit/auth-app 内部 `auth(state, authOptions)` 走 `switch (authOptions.type)` 异步拒绝分支；mock 让 `authCallable` 同步返回 `{hook}` 绕开真实 type dispatch）。**真实路径冒烟测试必须用真实 RSA / 真实私钥 / 真实 nock 拦截**（fixture 字符串无法 JWT signing），不能仅凭单测通过即认为集成完成。详见 [testing.md §6.2](./testing.md) + [经验归档 §四十三](../../docs/design/governance/experience-archive.md#四十三集成外部库必须读-readme-标准用法--e2e-真实路径冒烟测试2026-08-29m18.4-audit-round-1-reject-后补修)。

**「单测全过 + typecheck 0 error」≠ 集成 Done**：必须有「真实路径调用 + 断言关键行为」的可执行验证；A 阶段 code-auditor 主责边界已挂「集成外部库时验证 README 标准用法引用 + e2e 真实路径测试存在」必查项（[code-auditor.agent.md 主责边界](../../.github/agents/code-auditor.agent.md)）。

教训（M18.4 audit round 1 Reject 实证）：M18.1 commit 4 凭直觉写 `auth: createAppAuth(...)`（错误用法）+ `app-provider.test.ts` `vi.mock('@octokit/rest')` + `vi.mock('@octokit/auth-app')` 完全跳过 `@octokit/core` 真实构造路径 → 所有单测通过但生产必抛 `Invalid auth type: undefined` / `Cannot read properties of undefined (reading 'bind')`，直到 M18.4 e2e 真实路径冒烟测试才暴露。

#### 5.1.16 v-model 修改嵌套字段必须用 reactive + deep watch（hard requirement）

Nuxt `useAsyncData` 内置 `watch` 默认浅监听（reference equality），对 nested field mutation（如 v-model 改 `filters.includeSuperseded = true`）不响应——任何 v-model 嵌套字段修改需要用 `reactive` 而非 `ref`，配合 `deep: true` watch。

**错误模式**：
```ts
const filters = ref<Filters>({...})  // ref + watch 浅监听不响应 nested field mutation
watch: [viewMode, filters], // 对 ref 浅比较
```

**正确模式**：
```ts
const filters = reactive<Filters>({...})  // reactive 字段级修改
watch: [viewMode, () => filters, { deep: true }],  // getter source + deep watch

// 或显式兜底
watch(filters, () => { void refreshAlerts() }, { deep: true })
```

**依赖 Nuxt useAsyncData 默认 `dedupe: 'cancel'` 抑制双触发**：内置 watch + 显式 watch 都可能触发 refresh，但 abortController 会取消旧 execute；改 dedupe 策略前需重新评估。

**调试技巧**：用 `page.on('request')` 跟踪浏览器侧 `/api/alerts` 请求数（而不是 Vue devtools），直接判断 refetch 是否触发。

教训（M20.6 alerts-rowgroup + ToggleSwitch v-model 嵌套字段触发实证）：e2e test 10（"视图切换：includeSuperseded 关闭 → 隐藏已关闭告警；打开 → 显示已关闭告警"）失败——点击 `#include-superseded` 开关后 `aria-checked=true` 但 `/api/alerts?includeSuperseded=true` 请求数 = 0（refetch 未触发）。修复：`filters` 改 `reactive` + `watch(filters, () => refreshAlerts(), { deep: true })`。详见 [经验归档 §四十六](../design/governance/experience-archive.md#四十六primevuetoggleswitchvmodel嵌套字段触发useasyncdatawatch浅监听失效20260831m206)。

#### 5.1.17 一次性脚本 TypeScript 价值评估（避免 over-engineering）

不要为了"项目完整性"添加不必要的 dev 依赖：一次性脚本 + 永久 devDep 代价不匹配价值；评估价值 / 成本比。

**Node 运行时支持矩阵**（影响 .ts 脚本运行）：
- Node 20 LTS：不支持 .ts 直接运行；需 tsx / ts-node / esbuild-register 等中间层
- Node 22.6+ `--experimental-strip-types`：**只剥离类型注解**，不处理装饰器
- Node 23.6+ / 24 `--experimental-transform-types`：转换 enum / namespace，**仍不处理装饰器**
- 装饰器依赖 `emitDecoratorMetadata`（TS 编译器专属能力），Node 内置 TS 支持均无法替代

**TypeORM 装饰器需要 emitDecoratorMetadata**：`@Entity('table_name')` + `@Column({...})` 装饰器运行后必须 emit 元数据到 `reflect-metadata`，否则 DataSource 构造时找不到 entity metadata → `EntityMetadataNotFoundError`。

**何时必须 TypeScript**（一次性脚本场景）：
- ✅ TypeORM / Prisma / Drizzle 等装饰器密集型 ORM
- ✅ 类型安全严格（DB schema → API 契约同步）
- ❌ 纯 SQL / 简单业务逻辑（改 JavaScript 即可）

**CLI 端 entity metadata 必须显式 import 触发装饰器**：tsx / vitest CLI 路径不走 Nitro auto-load，需在脚本入口处显式 import 触发 `@Entity` / `@Column` 装饰器注册。

**helper 文件模式**（避免 ESLint unused-vars warning）：
```ts
// register-entities.ts 文件级 eslint-disable
/* eslint-disable @typescript-eslint/no-unused-vars -- TypeORM 装饰器注册用 side-effect import */
import { ScanResult } from '../../entities/scan-result'
import { Repository } from '../../entities/repository'
// ... 其他 entity imports
void ScanResult
void Repository
// ...
/* eslint-enable @typescript-eslint/no-unused-vars */
```

**engines 应该与 Node LTS 实际部署版本对齐**：Node 20 已 EOL（2026-04-30），engines `>=20` 是历史遗留，实际部署是 Node 22+ 或 Node 24+。建议升级到 `>=22`（兼容 Node 22 LTS）+ 注释说明 Node 22.6+ 内置 strip-types 仍不处理装饰器（tsx 仍必须）。

教训（M20.7 backfill 一次性脚本反思实证）：用户质疑"添加 tsx 是为什么？这个脚本为什么要 TypeScript？"→诚实分析：tsdown / tsx 不可替代（装饰器约束），但 register-entities.ts 单独文件可整合到主脚本顶部 inline 块（净 -21 行），engines 升级 `>=20` → `>=22`（Node 20 EOL）。详见 [经验归档 §四十七](../design/governance/experience-archive.md#四十七一次性脚本不应-over-engineeringtsx-cli-装饰器依赖-vs-node-22-strip-types2026-08-31m20.7)。

#### 5.1.18 SQLite 数据库启动期自动备份（引用 security.md §2.1 + 开发角度差异化信息）

> 权威完整声明（备份路径 / fsync / 保留策略 / 命令式恢复 / 自检工具等）见 [security.md §2.1](./security.md)。本节仅保留开发角度差异化信息（应用范围 / 禁止 / 实证 / D 阶段自检 + A 阶段 Review Gate）。

**应用范围**：所有 better-sqlite3 部署形态（dev / e2e / prod / Docker 容器）。e2e.sqlite 与 dependfix.sqlite 各自独立（不交叉备份）。

**禁止**：
- 禁用 `--no-verify-backup` 跳过备份（无备份时应用启动期打印醒目 WARN 但仍允许启动——这是 fail-open 而非 fail-closed；恢复依赖用户的本地副本或外部备份）
- 禁用备份目录走 `.gitignore` 之外的位置（避免误提交）
- 禁用备份过程阻塞启动超过 5 秒（超过视为备份实现有问题，需审计）

**实证**：2026-09-01 dependfix.sqlite 数据清空事故 + 防御加固挂接详见 [security.md §2.1.5](./security.md) + [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)。

**D 阶段自检（Full Stack Master (全栈大师) agent）**：必须验证 apps/platform/server/database/backup.ts 存在 + 含 backup-on-startup 调用 + 含 fsync + 含保留策略清理逻辑

**A 阶段 Review Gate 必查项**：apps/platform/server/database/backup.ts 文件存在 + 含 fsync 证据 + 含保留策略

#### 5.1.19 TypeORM 1.x synchronize 与 migrationsRun 反模式禁止（hard requirement）

`apps/platform/server/database/index.ts` 配置必须遵守以下约束：

**禁止组合**：
- ❌ `synchronize: true` **同时** `migrationsRun: true`（TypeORM 1.x 文档明文警告的反模式）
- ❌ dev 模式下 `synchronize` 硬编码自动开启（如 `|| isDev`）

**强制组合**：
- ✅ **dev 模式**：`synchronize: DATABASE_SYNCHRONIZE === 'true'`（显式 opt-in，不自动开启）+ `migrationsRun: false`
- ✅ **prod 构建**：`synchronize: DATABASE_SYNCHRONIZE === 'true'`（默认关闭）+ `migrationsRun: DATABASE_MIGRATIONS_RUN === 'true' || false`
- ✅ **e2e 测试**：`synchronize: true`（独立数据库，schema 同步可接受）+ `migrationsRun: false`

**启动期日志强制项**：
- 必须打印当前生效的 `synchronize` 值 + `migrationsRun` 值 + 触发来源（环境变量或默认）
- 例：`[database] synchronize=false (DATABASE_SYNCHRONIZE unset, NODE_ENV=production), migrationsRun=false`
- 便于排查"为什么数据库 schema 没更新"或"为什么数据库被自动改写"

**NOT NULL 列无 default 时同步失败的恢复路径**：
- 当 schema 升级需要给已有数据的表新增 NOT NULL 列且无 default value，TypeORM 1.x synchronize 在 SQLite 上会失败（`SqliteError: NOT NULL constraint failed`）
- 事务回滚保证数据不丢（`RdbmsSchemaBuilder.build()` 内嵌 startTransaction / commitTransaction / rollbackTransaction）
- 启动期需打印明确错误：`[database] synchronize FAILED: ...请写 migration 而非改 entity`
- D 阶段自检必须验证：涉及 NOT NULL 列无 default 的 schema 变更必须走 migration 路径，不可仅靠 synchronize

#### 5.1.20 atomic commit 边界（重构支撑 vs 业务行为变更必须分 commit）

> 教训来源：M22.4 commit `daa255c` 实施 "TypeORM synchronize 显式 opt-in + 启动日志" 时将 3 类改动打包到 1 个 commit ——（1）**业务行为变更** synchronize 默认值反转（`DATABASE_SYNCHRONIZE === 'true' || isDev` → `DATABASE_SYNCHRONIZE === 'true'`）+ （2）**重构支撑** 提取 migrationsRun 为 const + （3）**重构支撑** 删除 isDev 分支。3 类打包越界落地 M22.5 核心改动（默认值反转属 M22.5 范围），audit Round 1 quick depth Reject（0 B / 2 B + 4 W），强制回退整个 commit + M22.5 commit `32bb375` 重新只做重构支撑 + 后续单独 commit 反转默认值。详见 [经验归档 §四十九（M22.4 教训沉淀）](../design/governance/experience-archive.md)。

**核心规则**：
- 重构支撑 = 不改变行为，只改善代码结构（提取 const / 改命名 / 删除冗余分支）
- 业务行为变更 = 改变默认行为（默认值反转 / 逻辑反转 / 新增功能）——两者必须分 commit

**安全做法**：
- 启动日志要打印某变量时，**临时用内联表达式**（`console.log(\`migrationsRun=${process.env.DATABASE_MIGRATIONS_RUN !== 'false'}\`)`），不提取 const
- 业务行为变更的 commit（如默认值反转）时再统一提取 + 改计算

**规范支撑**：[AGENTS.md §提交规范](../../AGENTS.md) 第 4 条"原子粒度——一个提交对应一个逻辑变更" + [规划规范 §1.1 任务粒度约束](./planning.md)

**实证**（repro.cjs / sv-test3.cjs）：
- TypeORM 1.x 在 SQLite + 已有数据 + 新增 NOT NULL 列无 default 时实测：`Init FAILED: SqliteError: NOT NULL constraint failed`，事务回滚后 `schema_version` 不变 + 数据保留
- **synchronize 失败不会清空数据**（事务回滚保证），但启动失败需用户明确知道是 schema 同步失败而非数据库损坏
- dev 模式硬编码 `synchronize=true` 会让 schema 升级每次都触发同步逻辑，频繁启动期失败

教训（2026-09-01 dependfix.sqlite 事故关联风险）：dev 模式 `synchronize: true || isDev` 硬编码导致任何 schema 变更都会触发同步，未来再次出现 NOT NULL 列无 default 改动时启动期失败。详见 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01) + §二十七（M20.3 ScanResult NOT NULL 列加列风险首次复现）。

---

## 6. 样式规范（平台阶段适用）

- **纯 SCSS**: 禁止 CSS-in-JS、Tailwind。所有样式以纯 SCSS 编写。
- **SCSS 复用**: 优先使用全局变量（Variables）和混合宏（Mixins）。
- **BEM 命名**: 组件样式遵循 `block__element--modifier` 规范。
- **禁止 `!important`**: 破坏 CSS 层级结构。
- **暗色模式**: 通过 `:global(.dark) .selector` 覆盖样式（**注意**：`main.scss` 是全局 CSS 无 scope，原 `:global(.dark) &` 编译失败，正确写法 `.dark &`，让 mixin 自动工作；详见 [平台开发规范 §7](./platform.md)）。
- **响应式基线（768px）**: dashboard / 列表 / 表格页都应默认支持 768px 响应式（不是 mobile-specific feature 而是响应式基线）——`@media (max-width: 768px)` 切换 `grid-template-columns: 1fr`、表格水平滚动、侧栏折叠。V 阶段 ui-validator 自动检测 768px 适配遗漏，遗漏会被列为 Blocker。
- **跨 Dialog i18n label key 共享**: 共享选项数据（mode / severity / batch-start 等）时，i18n label key 也应共享（如 `repos.batchMode` / `repos.batchSeverity` 同时用于批量与单仓库 Dialog），避免冗余 key（如 `repos.scanConfigMode` 与批量 Dialog 相同 label 但不同 key）。仅在 Dialog 标题 / 目标信息等真正差异处新增 key。

## 7. 包命名规范

| 子包 | npm 名 | 类型 | 说明 |
|------|--------|------|------|
| `packages/core` | `@dependfix/core` | 内部库 | 核心领域模型，被其他包消费 |
| `packages/engine` | `@dependfix/engine` | 内部库 | 共享执行引擎（DependfixApp），cli / mcp / platform 共同依赖 |
| `packages/skills` | `@dependfix/skills` | 内部库 | 产品 skill 权威源（dependfix-remediator） |
| `packages/cli` | `dependfix` | CLI 工具 | 用户通过 `npx dependfix` 调用 |
| `packages/mcp` | `@dependfix/mcp` | MCP Server | MCP 协议服务 |
| `apps/platform` | `@dependfix/platform` | 应用（Nuxt 全栈） | 管理平台，非库；归 `apps/` 目录体系 |

> 可发布包清单单点权威声明见 [packages.config.mjs](../../scripts/packages.config.mjs)；新增发布包须登记并同步 README / release.md / CI 引用（见 [code-quality-checklist 新增发布包链路完整性](../../.github/skills/code-reviewer/references/code-quality-checklist.md)）。`packages/github`、`packages/action` 为规划中未实现的包，按需添加（见 [AGENTS.md 项目简介](../../AGENTS.md)）。

- CLI / 可执行入口使用 **unscoped** `dependfix` 名称
- 内部库使用 **scoped** `@dependfix/*` 前缀
- 应用（`apps/*`）使用 **scoped** `@dependfix/*` 前缀，仅限工作区内部消费，不发布 npm

## 8. 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/)：

- 提交类型（`feat` / `fix` / `docs` / `refactor` / `test` / `ci` / `chore` / `perf` / `style` / `build` / `revert`）、主题行与正文的完整编写规则见 [Git 规范 §3.1 提交消息格式](./git.md)。

提交语言使用中文或用户使用的语言。单次提交对应一个逻辑变更，避免"大杂烩"提交。

## 9. 提交前检查

在 `git commit` 之前必须通过以下检查：

1. **Review Gate**: 所有改动必须经过至少一轮 review，且 A 阶段（`Code Auditor (代码审计员)`）已放行。
2. **Lint**: `pnpm lint` 零 error。
3. **Typecheck**: `pnpm typecheck` 零 error。
4. **测试**: 定向测试通过；命中全量测试条件时执行 `pnpm test`。
5. **提交执行**: 必须通过 `conventional-committer` skill 提交（禁止裸 `git commit -m`），详见 [Git 规范](./git.md) 与 [AGENTS.md 提交规范](../../AGENTS.md#提交规范-commit-convention)。

## 10. Code Scanning 告警处理流程

当 GitHub Code Scanning 报告安全告警时，按以下流程处理：

1. **获取告警详情**：使用 `gh api repos/owner/repo/code-scanning/alerts` 获取告警类型、位置和描述
2. **根因分析 + 搜索优先**：使用搜索优先模式确认是否为误报，避免不必要的修复
3. **制定修复方案**：根据告警类型制定针对性修复方案（如命令注入 → 使用 `execFileSync` 替代 `execSync`）
4. **质量门验证**：运行 lint + typecheck + test 确保修复不引入回归
5. **深度审计**：安全修复应使用 `deep` 级别审计，确保全面覆盖
6. **提交**：使用 `conventional-committer` skill 提交，消息格式为 `fix(scope): 描述`

## 11. 相关文档

- [测试规范](./testing.md)
- [API 规范](./api.md)
- [安全规范](./security.md)
- [文档规范](./documentation.md)
- [项目规划规范](./planning.md)

> 本文档在 1.0.0 前参考 momei 项目的成熟做法完成继承与适配；1.0.0 后按项目自身实践持续演进，形成自有规范。
