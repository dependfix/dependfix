# 工程实践判例（engineering-practice-notes）

> **状态**：✅ 持续追加（2026-10-26 首版，承接 `development.md §5.1` 分层治理）
> **定位**：保存规则的**实现细节、原因与判例**，不是规范。强制规则只存在于 [开发规范 §5.1](../../standards/development.md#_5-1-工程实践规则) 的规则表；本文件不作为放行依据。
> **准入**：只收录已从规范迁出的条目、需要溯源的设计取舍、以及审查时值得对照的判例。新增内容必须有旧编号或明确来源，禁止在此另立新规则。
> **执行方式**：审查时先查 [review 检查点矩阵](../../../.github/skills/code-reviewer/references/code-quality-checklist.md)；矩阵指向本文件的锚点仅用于理解实现，不替代检查动作。

## 1. 使用边界

- 规则与判例冲突时，以 [开发规范 §5.1](../../standards/development.md#_5-1-工程实践规则) 的规则表为准。
- 本文件条目可被压缩、合并或删除；删除前确认其判例价值已由设计文档或经验归档承接。
- 旧编号保留在标题中，便于 `rg "5\.1\.N"` 追溯；新引用一律使用 `EP-xx` 锚点。
- `docs/design/governance/experience-archive*.md` 与 `spec-and-doc-governance.md` 中的旧 `§5.1.N` 引用是历史记录，保留原样；需要现行规则时以本文件 §6 映射表为准。


## 2. 代码、错误与状态

### EP-35 错误路径 helper 自身不抛异常（原 5.1.1）

统一用 `toErrorMessage(value)` 提取消息（Error→message / string→原样 / 可序列化→JSON / 其余→类型描述），禁止在 catch 手写 `instanceof` 分支；helper 内 `JSON.stringify` 必须 try/catch（循环引用会 throw 并掩盖原始错误）且有单测锚定。

### EP-01 日志输出人读 / 机读双模（原 5.1.2）

`process.stdout.isTTY` 检测 → TTY 输出格式化彩色文本，非 TTY（CI / 管道）输出 JSON。

### EP-02 截断带固定前缀的 ID 先去除前缀（原 5.1.3）

禁止对 `prefix-<唯一段>` 直接 `slice(0, N)`（唯一部分会被丢光）；先去掉固定前缀再截断或取最后分隔段；文件名 / 分支名采用 `YYYYMMDD-HHmmss-{唯一尾段}`（字典序 == 时间序且唯一）。

### EP-03 改名 / 迁移全局排查命名残留（原 5.1.4）

前缀抽为统一常量 + 封装读取辅助，所有读取必须走它；改名后全局搜索旧名（含 env 前缀、错误消息、注释、示例），不只看文件引用。

### EP-04 Node 脚本 main 入口守卫（必须）（原 5.1.5）

`scripts/*.mjs` 等可执行脚本**必须**用入口守卫包裹 `main()` 调用（`process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href`）；新脚本完成后 grep `process.argv[1]` 确认。

### EP-06 容器拼装类注释必须准确区分 `execFile` 与 `exec`（原 5.1.7）

`execFile` 不经过 shell、**不会**回显 argv；准确语义是 `spec.env` 隔离（避免 cmd/test 日志、git URL、daemon config 可见 token）；注释必须真实反映防御机制，错写威胁模型会把后续审计引向错误方向。

### EP-09 删除「自动状态赋值」时必须搜遍所有被动接收路径（原 5.1.10）

单点删除会留下隐式不一致（如已删自动赋值后旧 `selectedRepos` 让 checkbox 呈 disabled+checked、计数过期）；删除后须在 `emit('success')` 后、`await reload()` 前主动重置状态，形成闭环。

### EP-13 OR 链写回决策须逐项追踪条件真假（原 5.1.14）

`if (a || b || c || d || e)` 写回决策必须逐项追踪每个条件才能准确断言；常见错误是以为某标志为 false 就完全不写回；调试时打开真实 SQL 数据看写回后字段，不按单一标志反推。

### EP-15 一次性脚本 TypeScript 价值评估（避免 over-engineering）（原 5.1.17）

不为「项目完整性」添加不必要 devDep；装饰器密集型 ORM（TypeORM / Prisma / Drizzle）必须 TS（Node 内置 strip-types / transform-types 均不处理装饰器，需 `emitDecoratorMetadata`）；CLI 端 entity metadata 必须显式 import 触发装饰器注册；`engines` 应与实际部署的 Node LTS 版本对齐。

### EP-20 git config user identity 一致性 guard（原 5.1.23）

git config 优先级 `local > global > system`，`.git/config [user]` 会**静默**覆盖 global；以 `.husky/pre-commit-identity-guard.sh`（pre-commit 第一步）检测不一致并阻断 commit；session 启动时对齐 `.session/current-task.yaml` 段与 local / global user；**严禁批量改历史 commit author**（除非用户显式同意并走 rebase + 强制 push）。

### EP-21 多 key 生成循环必须按 key 预聚合取 max（last-write-wins 陷阱）（原 5.1.24）

循环内直接 `map[key] = value` 会让最终值取决于遍历顺序；先 `Map<key, value>` 预聚合（如 `compareSemver` 取 max）再统一写入。

### EP-22 构建产物 dts 入口与共享 chunk 文件名冲突（tsdown `hash:false`）（原 5.1.26）

多 entry 构建时用 `outputOptions.chunkFileNames` 把 chunk 隔离到 `chunks/` 子目录，entry 名保持稳定；构建后 `dist/` 出现 `index2.d.mts` / `index2.mjs` 即命中（详见 [backlog.md §已知边界](../../plan/backlog.md#tsdown-hash-false-下-entry-与共享-chunk-文件名冲突-持续观察)）。

### EP-23 迁移 / 等价性判断前必须回读迁移前源码（原 5.1.27）

用 `git show HEAD:<file>`（或迁移前 commit）回读实际源码；库文档只用于解释**差异成因**，不得用于推断仓库现状。

### EP-24 「依赖卸载 + 引用归零」类任务的规模口径（原 5.1.28）

规模不在依赖数而在**引用面**；规划阶段必须定义 `rg` 归零口径（是否含注释 / 文档 / 历史编号），体积对比基线须回溯到迁移前 commit 现场构建。

### EP-25 构造期合并配置：保持 `readonly` 单次赋值（原 5.1.30）

不要为构造期合并把 `private readonly config` 改成可写；把依赖该字段的初始化块**后移**做单次赋值，避免引入第二份 effectiveConfig（双来源漂移）。

### EP-26 同构站点穷举必须用「构建产物」（原 5.1.33）

源码 grep 只能发现**值不同**的站点，结构同构但取值已一致的站点会被整体漏掉；构建后扫 `.output/**` 的 CSS 并**合并同一选择器的多条规则**再按特征筛。通用提问：声明「范围已穷举」前先自问「我的筛选条件是否只能命中目标的一部分？」。

### EP-27 `rg -r` 是 `--replace` 而非递归（输出替换陷阱）（原 5.1.35）

`-r` / `--replace` 会把匹配片段替换为给定文本再输出（不改文件），误写 `rg -rn` 会产出**假象**输出；多文件搜索只用 `rg -n`（递归是默认行为），确需替换语义时才显式写 `-r`。

### EP-28 存在「第三态」时「全部失败」判据不能用「失败数 == 总数」（原 5.1.37）

多源 / 多分支判定只要存在第三态（既非成功也非失败，如 `ALERTS_DISABLED`），「全部失败」不能用 `失败数 === 总数`（总数含第三态时判据恒假）；**正确判据**为「失败数 > 0 且成功数 === 0」。**配套**：抛错前 per-source 状态必须已完整写入；仓库级 catch 追加信号前先判「该仓库是否已有带 `source` 的同类信号」，否则形成重复信号。平台侧实例见 [platform.md §6.1](../../standards/platform.md#_6-1-错误码与告警状态口径-平台展示消费-engine-错误码)。

### EP-29 失败路径写回只写终态字段（不得整行 save / 整份载荷条件写回）（原 5.1.38）

失败路径持有的是创建期或读取期内存实体，整行 `save()` 或复用整份聚合载荷会把并发详情 GET 已聚合的计数 / `summary` 覆盖回旧值（与 5.1.36 同族）；**做法**为失败通道单独提供只写 `status` / `finishedAt` / `updatedAt` 的条件写回 helper，`affected === 0` 时**不改库也不改内存实体**；同一子系统内多条失败路径应共用该 helper。

### EP-30 删除公共导出前必须全仓 grep 引用（含全部测试目录）（原 5.1.39）

测试文件可能分布在多处（同目录 `*.test.ts` 与集中 `tests/**` 目录）；对符号做**不带路径限定**的全仓检索，并区分「代码引用」（必改）与「文档 / 归档描述性文本」（保留）；`pnpm typecheck` 是兜底而非首选。**与 EP-03 的边界**：本条管**导出删除**的引用面，EP-03 管**改名 / 迁移**的命名残留。

### EP-33 跨端字符串哨兵与「是否未知」判定必须单点化（hard requirement）（原 5.1.50）

client 与 server 共享的哨兵字符串（如 `unknown`）不得两端各写裸字面量——前端导出镜像常量（或从共享包导入），server 测试断言 `expect(镜像值).toBe(权威值)`；「是否未知」一类判定收敛到单一纯函数返回结构体，避免同一判定两份实现。枚举 / 阈值镜像见 §5.1.43，本条不重复。


## 3. 测试与调试

### EP-05 测试不得依赖 git 忽略工作区文件的存在性（原 5.1.6）

不得隐式依赖 `.session/` / `temp/` 等 git 忽略目录下文件（本地有、CI 无 → 行为分叉）；必须依赖时把路径 / 内容作为参数注入，或模拟缺失场景验证两分支。

### EP-07 JSDoc 必须与可见性声明一致（原 5.1.8）

`private` 方法不得写「导出便于 snapshot 测试」；拼装类函数（`buildRunArgs` / `buildSpawnArgs`）应在测试中 snapshot 验证（拼装 bug 在真起容器前难暴露）。

### EP-08 测试 Spy 与生产实现同模块时必须 `@internal` 标注（原 5.1.9）

Spy 类加 `@internal` JSDoc + 文件级「生产代码禁止导入」；用 eslint `no-restricted-imports` 限制生产 import spy 路径作最稳护栏。

### EP-10 调试临时代码必须在 commit 前清理（原 5.1.11）

`// DEBUG` / `console.log('[debug]', …)` / `debugger` / `alert(…)` / 未跟踪 `// TODO` 一律清理（lint 拦不住浏览器端调试输出，code-auditor 会作 blocker Reject）；ui-validator 视觉验证时自建的截图脚本属同类，`git status` 不应有 untracked 临时文件。

### EP-12 覆盖率阈值回归优先在既有测试文件补 case（原 5.1.13）

不新建 test 文件、不临时修改 vitest 阈值；判断标准是 diff 文件数小 + 风险扩散低 + 价值密度高。


## 4. 平台、框架与数据库

### EP-11 `script setup` 顶部调试代码触发 TDZ 陷阱（原 5.1.12）

引用**尚未声明的 ref / computed** 会触发 `Cannot access 'X' before initialization` SSR 500（真错误，非 hydration warning）；引用前确认声明顺序，或放进 `watchEffect` / `onMounted`。

### EP-14 v-model 修改嵌套字段必须用 `reactive` + deep watch（hard requirement）（原 5.1.16）

Nuxt `useAsyncData` 内置 watch 为浅监听（reference equality），对 nested field mutation 不响应；v-model 嵌套字段须用 `reactive` 而非 `ref`，配 getter source + `{ deep: true }`；依赖默认 `dedupe: 'cancel'` 抑制双触发，改 dedupe 策略前须重新评估。

### EP-16 SQLite 数据库启动期自动备份（原 5.1.18）

应用范围 = 所有 better-sqlite3 部署形态（dev / e2e / prod / 容器），e2e 库与业务库各自独立（不交叉备份）；**禁止**用 `--no-verify-backup` 跳过、禁止备份目录走 `.gitignore` 之外位置、禁止备份阻塞启动超 5 秒；D 阶段自检与 A 阶段 Review Gate 均须验证 `backup.ts` 含 fsync + 保留策略。权威完整声明见 [security.md §2.1](../../standards/security.md#_2-1-sqlite-数据库防护-不可恢复数据事故防线)。

### EP-17 TypeORM 1.x `synchronize` 与 `migrationsRun` 反模式禁止（hard requirement）（原 5.1.19）

禁止二者同时为 `true`，禁止 dev 模式硬编码自动开启 synchronize；dev 走显式 opt-in + `migrationsRun: false`，prod 默认关闭，e2e 用 `synchronize: true` + `migrationsRun: false`；启动期日志必须打印生效值与来源；涉及 NOT NULL 列无 default 的 schema 变更**必须**走 migration（synchronize 在 SQLite 会失败）。

### EP-18 zod `.optional()` 接受 `undefined` 为合法值（陷阱模式）（原 5.1.21）

区分「未传字段」与「传 undefined」需**显式** `data !== undefined` 判断，否则 `data === 'value'` 三元恒为 false；对 `boolean` 字段必须保留该区分（`false` 是合法值）；统一用 `apps/platform/server/utils/zod-helpers.ts` 的 `parseOptional`（强制三态 success / value / isProvided）。

### EP-31 可注入 composable 的缺省实现必须在 setup 期解析 setup-only 依赖（hard requirement）（原 5.1.42）

为可测性给 composable 引入依赖注入（`useXxx(deps)`）时，缺省实现若写成**延迟求值**的缺省参数（如 `deps.t ?? ((key, params) => useI18n().t(key, params))`），`useI18n()` 会在**事件处理期**被调用，而 `useI18n` / `useRoute` / `useState` 等属 setup-only composable → 抛错被 handler 的 try/catch 吞掉 → **整条分支静默失效**（注入桩的单测不复现、`typecheck` / `lint` 均 0 报错，只能靠既有 e2e 全量复跑暴露）。**做法**：缺省分支用 `deps.x ?? resolveXxx()`，`resolveXxx()` 在 **setup 期**求值一次并由闭包持有；事件处理期只允许调用 event-safe 全局（`$fetch` / `navigateTo`）。


## 5. 配置、限流与数据

### EP-19 baseline lint 治理路径：删除占位符而非改写为 `void X`（原 5.1.22）

`no-unused-expressions` 与 `no-meaningless-void-operator` 双重禁止；治本方向为删除冗余表达式或改写为 `if` 块（本项目标准做法），禁止 `void X` 改写、禁止 eslint-disable 抑制、禁止提高 `max-warnings` 临时方案——CI 触发 ESLint 临界值是「信号」而非「阈值调整」。

### EP-32 新增「配置生效」分支时必须为旧路径提供逐字段等价护栏（hard requirement）（原 5.1.46）

聚合 / 派生逻辑引入「已配置走新路径、未配置沿用旧值」双路径时，须补一条**逐字段冲突**用例——把快照的每个派生字段都设为与「从信号重新派生」不同的值，断言存储结果等于快照原值。只覆盖其中一个字段会让其余分支的 mutant 存活；逐字段冲突才能保证任一分支被改成派生态时必然失败。实例：`ActionStatusMonitor.applyOne` 的 `overallStatus` / `checkRunId` / `errorMessage` / `conclusion`。

### EP-34 豁免计数型限流时必须同步排除计数查询（hard requirement）（原 5.1.51）

某类别豁免「每小时上限」这类**计数型限流**时，不能只跳过它自身的限流判定——共享计数查询也要排除该类别（冷却 / 指纹属逐类别判定，无共享计数面，另行处理）（例：周报逐封投递写入的 `sent` 行若计入共享上限，一次周报可把平台事件 / 安全告警全部挤成 `skipped_throttled`）。**做法**：豁免分支与计数查询同批修改，并补一条「豁免类别发送后，常规类别仍可发送」的用例。


## 6. 编号映射

| 旧编号 | 去向 | 说明 |
|:--|:--|:--|
| 5.1.15 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 1 行） |
| 5.1.20 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 2 行） |
| 5.1.25 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 3 行） |
| 5.1.29 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 4 行） |
| 5.1.31 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 5 行） |
| 5.1.32 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 6 行） |
| 5.1.34 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 7 行） |
| 5.1.36 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 8 行） |
| 5.1.40 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 9 行） |
| 5.1.41 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 10 行） |
| 5.1.43 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 11 行） |
| 5.1.44 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 12 行） |
| 5.1.45 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 13 行） |
| 5.1.47 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 14 行） |
| 5.1.48 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 15 行） |
| 5.1.49 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 16 行） |
| 5.1.52 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 17 行） |
| 5.1.53 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 18 行） |
| 5.1.54 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 19 行） |
| 5.1.55 | [开发规范 §5.1 规则表](../../standards/development.md#_5-1-工程实践规则) | 保留（规则表第 20 行） |
| 5.1.1 | 本文件 EP-35 | 错误路径 helper 自身不抛异常 |
| 5.1.2 | 本文件 EP-01 | 日志输出人读 / 机读双模 |
| 5.1.3 | 本文件 EP-02 | 截断带固定前缀的 ID 先去除前缀 |
| 5.1.4 | 本文件 EP-03 | 改名 / 迁移全局排查命名残留 |
| 5.1.5 | 本文件 EP-04 | Node 脚本 main 入口守卫（必须） |
| 5.1.6 | 本文件 EP-05 | 测试不得依赖 git 忽略工作区文件的存在性 |
| 5.1.7 | 本文件 EP-06 | 容器拼装类注释必须准确区分 `execFile` 与 `exec` |
| 5.1.8 | 本文件 EP-07 | JSDoc 必须与可见性声明一致 |
| 5.1.9 | 本文件 EP-08 | 测试 Spy 与生产实现同模块时必须 `@internal` 标注 |
| 5.1.10 | 本文件 EP-09 | 删除「自动状态赋值」时必须搜遍所有被动接收路径 |
| 5.1.11 | 本文件 EP-10 | 调试临时代码必须在 commit 前清理 |
| 5.1.12 | 本文件 EP-11 | `script setup` 顶部调试代码触发 TDZ 陷阱 |
| 5.1.13 | 本文件 EP-12 | 覆盖率阈值回归优先在既有测试文件补 case |
| 5.1.14 | 本文件 EP-13 | OR 链写回决策须逐项追踪条件真假 |
| 5.1.16 | 本文件 EP-14 | v-model 修改嵌套字段必须用 `reactive` + deep watch（hard requirement） |
| 5.1.17 | 本文件 EP-15 | 一次性脚本 TypeScript 价值评估（避免 over-engineering） |
| 5.1.18 | 本文件 EP-16 | SQLite 数据库启动期自动备份 |
| 5.1.19 | 本文件 EP-17 | TypeORM 1.x `synchronize` 与 `migrationsRun` 反模式禁止（hard requirement） |
| 5.1.21 | 本文件 EP-18 | zod `.optional()` 接受 `undefined` 为合法值（陷阱模式） |
| 5.1.22 | 本文件 EP-19 | baseline lint 治理路径：删除占位符而非改写为 `void X` |
| 5.1.23 | 本文件 EP-20 | git config user identity 一致性 guard |
| 5.1.24 | 本文件 EP-21 | 多 key 生成循环必须按 key 预聚合取 max（last-write-wins 陷阱） |
| 5.1.26 | 本文件 EP-22 | 构建产物 dts 入口与共享 chunk 文件名冲突（tsdown `hash:false`） |
| 5.1.27 | 本文件 EP-23 | 迁移 / 等价性判断前必须回读迁移前源码 |
| 5.1.28 | 本文件 EP-24 | 「依赖卸载 + 引用归零」类任务的规模口径 |
| 5.1.30 | 本文件 EP-25 | 构造期合并配置：保持 `readonly` 单次赋值 |
| 5.1.33 | 本文件 EP-26 | 同构站点穷举必须用「构建产物」 |
| 5.1.35 | 本文件 EP-27 | `rg -r` 是 `--replace` 而非递归（输出替换陷阱） |
| 5.1.37 | 本文件 EP-28 | 存在「第三态」时「全部失败」判据不能用「失败数 == 总数」 |
| 5.1.38 | 本文件 EP-29 | 失败路径写回只写终态字段（不得整行 save / 整份载荷条件写回） |
| 5.1.39 | 本文件 EP-30 | 删除公共导出前必须全仓 grep 引用（含全部测试目录） |
| 5.1.42 | 本文件 EP-31 | 可注入 composable 的缺省实现必须在 setup 期解析 setup-only 依赖（hard requirement） |
| 5.1.46 | 本文件 EP-32 | 新增「配置生效」分支时必须为旧路径提供逐字段等价护栏（hard requirement） |
| 5.1.50 | 本文件 EP-33 | 跨端字符串哨兵与「是否未知」判定必须单点化（hard requirement） |
| 5.1.51 | 本文件 EP-34 | 豁免计数型限流时必须同步排除计数查询（hard requirement） |


> **合并说明**：5.1.30 → 5.1.29；5.1.38 → 5.1.36；5.1.39 → 5.1.25；5.1.46 → 5.1.45；5.1.50 → 5.1.43。合并条目在上表保留独立行，矩阵引用统一改指合并后的规则。
