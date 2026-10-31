# 代码质量审查清单

## 错误处理

### 需要标记的反模式

- **吞异常（Swallowed exceptions）**：空 catch 块或只记录日志的 catch
  ```javascript
  try { ... } catch (e) { }  // 静默失败
  try { ... } catch (e) { console.log(e) }  // 只记录后忘记
  ```
- **catch 过宽**：捕获 `Exception`/`Error` 基类而不是具体类型
- **错误信息泄露**：向用户暴露堆栈或内部细节
- **缺失错误处理**：对易失败操作（I/O、网络、解析）没有 try-catch
- **异步错误处理**：未处理的 promise rejection、缺失 `.catch()`、无错误边界

### 最佳实践核对

- [ ] 错误在合适的边界被捕获
- [ ] 错误消息对用户友好（不暴露内部细节）
- [ ] 错误记录包含足够调试上下文
- [ ] 异步错误被正确传播或处理
- [ ] 可恢复错误有回退行为定义
- [ ] 关键错误触发告警/监控

### 应提出的问题

- "这个操作失败时会怎样？"
- "调用方能否知道出错了？"
- "是否有足够的上下文来调试这个错误？"

---

## 性能与缓存

### CPU 密集型操作

- **热路径上的昂贵操作**：循环中的正则编译、JSON 解析、加密
- **阻塞主线程**：同步 I/O、无 worker/async 的重计算
- **不必要的重复计算**：同一计算执行多次
- **缺失记忆化**：纯函数被相同输入重复调用

### 数据库与 I/O

- **N+1 查询**：循环内逐条查询而不是批量查询
  ```javascript
  // 坏：N+1
  for (const id of ids) {
    const user = await db.query(`SELECT * FROM users WHERE id = ?`, id)
  }
  // 好：批量
  const users = await db.query(`SELECT * FROM users WHERE id IN (?)`, ids)
  ```
- **缺失索引**：在未索引列上查询
- **过度获取**：只需几列却 `SELECT *`
- **无分页**：一次性把整个数据集加载进内存

### 缓存问题

- **昂贵操作缺少缓存**：重复 API 调用、DB 查询、计算
- **缓存无 TTL**：过期数据无限期提供
- **缓存无失效策略**：数据更新但缓存未清除
- **缓存 key 冲突**：key 唯一性不足
- **用户特定数据全局缓存**：安全/隐私问题

### 内存

- **无界集合**：无限增长的数组/map
- **大对象驻留**：持有引用阻碍 GC
- **循环内字符串拼接**：改用 StringBuilder/join
- **整体加载大文件**：改用流式处理

### 应提出的问题

- "这个操作的时间复杂度是多少？"
- "10x/100x 数据量下表现如何？"
- "这个结果可缓存吗？应该缓存吗？"
- "能否批量处理而不是逐个处理？"

---

## 边界条件

### Null/Undefined 处理

- **缺失 null 检查**：在可能为 null 的对象上访问属性
- **Truthy/falsy 混淆**：`if (value)` 当 `0` 或 `""` 是合法值时
- **可选链过度使用**：`a?.b?.c?.d` 掩盖结构性问题
- **null 与 undefined 不一致**：混用且无明确约定

### 空集合

- **空数组未处理**：代码假设数组有元素
- **空对象边界**：在空对象上 `for...in` 或 `Object.keys`
- **首/尾元素访问**：`arr[0]` 或 `arr[arr.length-1]` 未检查长度

### 数值边界

- **除零**：除法前缺少检查
- **整数溢出**：大数超过安全整数范围
- **浮点比较**：用 `===` 而不是 epsilon 比较
- **负值**：不应为负的索引或计数
- **差一错误**：循环边界、数组切片、分页

### 字符串边界

- **空字符串**：未作为边界情况处理
- **纯空白字符串**：通过 truthy 检查但实际为空
- **超长字符串**：无长度限制导致内存/显示问题
- **Unicode 边界**：emoji、RTL 文本、组合字符

### 需要标记的常见模式

```javascript
// 危险：无 null 检查
const name = user.profile.name

// 危险：数组访问无检查
const first = items[0]

// 危险：除法无检查
const avg = total / count

// 危险：truthy 检查排除合法值
if (value) { ... }  // 对 0, "", false 失效
```

### 应提出的问题

- "如果是 null/undefined 会怎样？"
- "如果集合为空会怎样？"
- "这个数字的合法范围是什么？"
- "在边界（0、-1、MAX_INT）会发生什么？"

---

## 规范一致性（Standards Compliance）

### 注释与测试名中的开发流程编号标记（必查）

审查新增/修改的注释与测试名是否残留规划/任务/审计/backlog 编号标记。规范见项目 [development.md §3 注释规范](../../../../docs/standards/development.md)。

- **禁止形态**：`C1:`、`T303`、`G2`、`M4+`、`R2`、`P0`、`P1-1` 等孤立编号（含 `C1：xxx` 中文冒号与 `it('C1: xxx')` 测试名前缀）
- **例外（允许保留）**：
  - 代码内真实常量：如 HTTP 错误码 `E401`
  - 带文档路径/章节名的导航指针：如"背景详见 `docs/plan/todo.md`「已知缺口 G2」"、"见 todo.md G3"
- **修复方式**：删除编号前缀，保留编号后的解释正文（如 `// 按包聚合（P2-1 修复）` → `// 按包聚合（避免同包多告警丢失）`）

### 新增发布包的链路完整性（必查项）

新增 `packages/*` 目录或修改 `scripts/packages.config.mjs` 时，检查发布/文档链路是否同步：

- **单点登记**：新包是否已在 [packages.config.mjs](../../../../scripts/packages.config.mjs) 登记（path/pkg/changelog/tags/publishOrder/publishable）
- **发布就绪语义**：未就绪包 `publishable: false`（release 脚本仅消费 publishable 就绪包，无需 ignore 联动；就绪时置 true 并启用 changelog）
- **README 与文档**：包 README 是否存在；[release.md](../../../../docs/guide/release.md) 发布包清单与 npm 链接是否更新
- **CI 引用**：release.yml / changelog.mjs / create-release-plan.mjs 是否自动覆盖（单点化后无需逐个改，但需确认无残留硬编码包列表）
- **Docker 影响面**：平台镜像（apps/platform/Dockerfile）是否需要在构建/运行时包含该包

详见 [经验归档 §二十五](../../../../docs/design/governance/experience-archive.md)（mcp 包遗漏 README/release 链路），规范见 [release.md](../../../../docs/guide/release.md)。

### CI 工作流类型解析完整性（必查项）

修改 `.github/workflows/*.yml` 或内部包依赖（package.json workspace 引用）时，检查 CI 各 job 的类型解析前提是否独立显式：

- **workspace 依赖包预构建**：lint/typecheck 前是否显式构建被 import 的 workspace 包（`pnpm --filter <dep> build`）？`pnpm i --frozen-lockfile` 不构建包；应用层（如 Nuxt platform）tsconfig 不映射 workspace 源码——`typescript.tsConfig.paths` 不合并、`alias` 指向 src 会把源码纳入 strict 编译上下文报错（两条路均不可靠），必须先构建 dist
- **job 独立环境**：coverage / test / lint / build 各自独立 runner，依赖生成产物（`.nuxt/tsconfig.json`、dist）的步骤是否在**该 job 内**显式准备？（test job 的 prepare 不继承给 coverage job——曾致 platform 测试 TSCONFIG_ERROR）
- **构建顺序**：多包预构建顺序是否与 Dockerfile 依赖图一致（core → engine → cli → platform）
- **新增内部包时**：新包的 src 是否需要加入根 tsconfig.json paths / vitest.config.ts alias（源码级解析，避免无 dist 时 "Failed to resolve entry"）

详见 [经验归档 §二十七](../../../../docs/design/governance/experience-archive.md)（monorepo CI 类型解析链），规范见 [ai-collaboration.md §4.2](../../../../docs/standards/ai-collaboration.md)。

### TypeORM 实体复合索引声明（必查项）

修改 `apps/platform/server/entities/*.ts`（TypeORM 实体）时，检查复合索引声明位置：

- **复合索引必须类级**：多列 `@Index(['a','b','c'])` 声明在列上时，TypeORM 1.x 会错误生成**仅末列**的单列索引（实测 SQLite DDL `UNIQUE("platform")`，`owner/name/platform` 复合唯一失效 → 第二个同 platform 仓库插入必 500，单仓库场景永不暴露）
- **正确写法**：`@Entity('table')` + 类上方 `@Index(['a','b','c'], { unique: true })`
- **验证手段**：e2e 二次运行（连跑两遍 `test:e2e` 验证幂等）；或查 SQLite DDL（`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='...'`）确认索引列集合
- **回归覆盖**：唯一约束语义是否被集成/回归测试覆盖（同键冲突报错 + 不同键共存）

详见 [经验归档 §三十](../../../../docs/design/governance/experience-archive.md)（TypeORM 1.x 列级复合索引 bug，e2e 二次运行暴露）。

### docs 裸 HTML 标签与本地 docs:build 验证（必查项）

修改 `docs/` 站点内 md（含 experience-archive.md 等持续追加文档、归档转接）时，检查：

- **裸 `<tag>` 占位符**：正文/表格中 `<tag>` / `<file>` / `<hash>` 等是否反引号包裹（`` `<hash>` ``）——markdown 裸 `<tag>` 被当 raw HTML 透传进 Vue 模板 → docs build 报 `Element is missing end tag`；报错行号是**转换产物行号**，不能按源文件行号找（lint:md 与 check:docs 均不查 HTML 配对）
- **加粗内裸 `*`**：`**...*.test.ts...**` 中裸 `*` 破坏强调解析（转换产物出现 `<em>` 嵌套错乱），须反引号包裹
- **本地 docs:build 证据**：`pnpm --filter dependfix-docs build` 是否已执行并提供通过证据？docs build 是唯一防线，缺失 → 退回补验证
- **排查命令**：`rg '<[a-z][a-z0-9-]*>'` 后人工过滤反引号内命中

规范见 [documentation.md §2 裸 HTML 标签禁令](../../../../docs/standards/documentation.md)，详见 [经验归档 §三十九](../../../../docs/design/governance/experience-archive.md)（§三十三 `<path>` 后二次复现：登记 ≠ 防御，教训必须落成检查点）。

### 契约字段端到端（必查项）

- **五段核对**：新增 / 修改契约字段（schema / 实体列 / JSON 列）时，是否沿「schema → 写入映射 → 实体 / JSON 列 → 视图 → 渲染」逐段核对？任一段手工重建对象都可能漏字段（实测：e2e fixtures 的 schema 接受 `attribution`，写入映射漏透传 → 注入值静默丢失，视觉断言长期假绿）。
- **测试基础设施同口径**：fixtures / 工厂 / 种子数据也是生产链路的镜像，字段透传同样要核。
- **端到端断言**：测试是否证明该字段真的落库并出现在响应 / 渲染里（而非仅 schema 接受）？
- 落点：[development.md §5.1.45](../../../../docs/standards/development.md)

### 本地 md 链接与锚点 check:docs 验证（必查项）

修改 `docs/**/*.md` / `.github/skills/**/*.md` / `.github/agents/**/*.md` / `docs/plan/**/*.md` 等含本地链接的 md 文件时，检查：

- **设计镜像结构映射**：diff 触及 `docs/design/**` 或 `docs/i18n/en-US/design/**` 时，是否同批更新 `docs/i18n/en-US/design/mirror-manifest.md`（新增 / 删除分片、en 页面、H2 映射）并跑 `pnpm run docs:check:mirror`？「英文侧小节」行的第三列是否写清 zh 落点或显式声明英文独有？
- **本地 check:docs 执行证据**：是否本地执行 `pnpm run check:docs`（`scripts/check-docs.mjs`，零依赖统一入口，覆盖 `links` / `vue-interp` / `link-text` / `link-syntax` / `emphasis` / `site-links` / `archive-anchors` / `anchor-id` 八类规则；锚点形态可用 `node scripts/check-docs.mjs --only=anchor-id` 单跑）并提供通过证据？CI 是兜底，但提交前自检可避免 PR 失败往返
- **五类「合法文本但语义漂移」信号（新规则面）**：① `link-text`——链接文本 `§N` 与目标锚点编号**不互为前缀**（锚点可指向父级章节，属合法）；② `link-syntax`——残留 `](` 或「`.md` 片段 + `#锚点` + 孤立 `)`」（文本被截断 / 就地改写错误）；③ `emphasis`——`**` 在段落 / 表格行内计数为奇数（渲染出字面 `**`）；④ `site-links`——站点静态绝对链接（nav / sidebar / 首页 frontmatter）无对应源文件（`ignoreDeadLinks: true` 会静默放过）；⑤ `archive-anchors`——归档文档的自锚点 / 跨文档锚点无对应标题（file-dead 维持豁免）。出现即检查该行是否被截断或批量替换误伤
- **CI check:docs 步骤**：CI Test job `Run pnpm run check:docs` 步骤是否通过？该步骤失败 → Test job 后续 `docs:build` / `typecheck` / `test` / `build` 共 5 步被 skipped（GitHub Actions 默认行为），盲区极大（run 32396605272 实证：Test job step 12 失败 → step 13-17 全部 skipped；其他类型如 `lint` / `lint:i18n` / `i18n:audit:missing` / `docs:check:i18n` / `lint:md:check` 在该 run 中均通过，唯 check:docs 卡住后续全部盲区）
- **典型失败场景**：标题重命名 / 文档归档 / 跨文档锚点迁移 → 锚点漂移 → 跨文档锚点链接失效；站内锚点必须以 VitePress 产物 id 书写（GitHub 口径的 `--` 连字符、数字开头缺 `_` 前缀都会在站点上死锚），`anchor-id` 规则按逐字符比对拦截，`docs:check:anchors` 以构建产物兜底
- **修复路径**：全局检索指向变更标题的锚点链接（`rg -n '\[[^]]*\]\([^)]*#.*'`）→ 同步改指新位置/新锚点；check:docs 输出 `path:line:col message` 格式可直接定位
- **与 lint:md / docs:build 边界**：lint:md 不查链接存在性；check:docs 不查 HTML 标签配对（`emphasis` 规则只覆盖 `**` **未配对**，成对但语义错位不查）；docs:build 不查链接锚点（VitePress 默认宽容）；三者是**互补**而非替代关系，缺一不可（详见 run 32396605272 与 [documentation.md §链接检查](../../../../docs/standards/documentation.md)）。

### Node 脚本 main 入口守卫（必查项）

新增/修改 `scripts/*.mjs` 或根目录可执行脚本时，检查：

- **入口守卫**：main 调用是否包裹 `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`？无守卫时 vitest import 模块即执行 main()（顶层副作用）
- **git 忽略文件依赖**：脚本/测试是否隐式依赖 `.session/`、`temp/` 等 git 忽略目录文件的存在性（本地有、CI 无 → 行为分叉）？依赖路径是否可注入或已模拟缺失场景验证
- **典型故障**：依赖缺失文件时 main() 内 `process.exit(0)` 被 vitest 拦截 → catch 再 `process.exit(1)` → `process.exit unexpectedly called` Unhandled Rejection，仅 CI 暴露

规范见 [engineering-practice-notes.md EP-04 / EP-05](../../../../docs/design/governance/engineering-practice-notes.md)，详见 [经验归档 §三十九](../../../../docs/design/governance/experience-archive.md)。

### 发布链路 tag 推送核验（必查项）

修改发布相关脚本/工作流（release.yml / changelog.mjs / release 脚本 / 手动发布文档）时，检查 tag 生命周期闭环：

- **创建与推送分离**：生成类步骤（release:publish）只保证本地创建 tag，是否配套显式推送步骤（`git push <url> --tags` 而非依赖 insteadOf 全局替换）
- **推送后核验**：推送步骤是否对比本地/远程 tag 集合（`git ls-remote` 缺失即报错）——CI 曾实测输出 `Everything up-to-date` 但 tag 未推送（run 31208208621，静默失败）
- **本地补打纪律**：手动补打 tag 后文档是否提示显式 `--tags` 推送 + followTags 建议（git 默认不推 tag）
- **判定多源兜底**：changelog 等"已发布"判定是否依赖 tag 单源——应有 npm registry 兜底（见 §二十五）

详见 [经验归档 §二十六](../../../../docs/design/governance/experience-archive.md)（tag 创建与推送分离 + CI 推送静默失败），规范见 [release.md](../../../../docs/guide/release.md)。

### 包依赖约束（必查项）

改动内部包依赖（`packages/*/package.json` 的 dependencies，或新增内部包）时，检查依赖方向是否符合 [development.md §4 依赖约束](../../../../docs/standards/development.md)：

- **单向分层**：依赖方向 `core` ← `engine` ← `{cli, mcp, platform}`；禁止反向依赖与循环引用
- **应用层禁互相依赖**：`cli` / `mcp` / `platform` 之间不得互相依赖——mcp 曾依赖 cli（`dependfix`）导致应用层互相依赖 + 安装膨胀 + 版本耦合（详见 [todo.md](../../../../docs/plan/todo.md)「已完成任务：@dependfix/engine 拆包」）
- **共享能力下沉 engine**：应用层不得复制 engine 已导出的实现或直连 core 内部模块；缺导出先补 1 行导出
- **core 纯净**：`@dependfix/core` 不得新增 Node / 浏览器运行时环境依赖（tslib 等编译辅助除外）
- **skills 资源包**：`@dependfix/skills` 不引入运行时依赖，仅被 cli 消费

违规（如 `cli` 依赖 `mcp`、`core` 引入 Node API 依赖）→ `Reject` 退回修正。

### 规范单点声明（必查项）

改动涉及治理定义（`docs/standards/*.md`、`.github/skills/*/SKILL.md`、`.github/agents/*.agent.md`）时，检查新增/修改的条款是否存在与权威文档重复抄写：

- **权威声明唯一**：每条规则只在其职责归属的权威文档完整声明一次；其他文档 / skill / agent 定义只做一行链接引用（`见 [X 规范 §Y](./xxx.md)`），禁止重复抄写完整条款、阈值或教训
- **冲突裁定**：同一规则出现两处完整声明时，按事实源层次（documentation.md §4：L0 > L1 > L2 > L3）更高层为准，退回执行角色收敛为引用
- **执行层例外**：宽松指引（应当、建议）可在执行阶段（skill/agent）声明；严格约束（必须、阈值、禁令）不得在执行文档复制完整条款，只能引用

规范见 [documentation.md §4 规范单点声明原则](../../../../docs/standards/documentation.md)，详见 [经验归档 §二十四](../../../../docs/design/governance/experience-archive.md)。

### 规范执行分层（严格约束须挂 review 检查点）

改动 `docs/standards/*.md`（新增/修改规范条款）时，检查新增条款的执行挂接：

- **分层判定**：条款是否明确区分"宽松指引"（应当、建议 → 执行阶段声明即可）与"严格约束"（必须、阈值、禁令 → 须挂 review 阶段检查点）？
- **挂接声明**：严格约束是否在规范文档中声明 review 挂钩（如 planning.md §1.1"合规核验由 review 阶段执行"句式）？
- **检查点落地**：是否已在 code-reviewer SKILL.md / 本 checklist / Code Auditor 必查项中实际存在对应检查点？缺失则要求补挂，或登记 backlog 并在本轮明确标记"待补挂"
- **反模式**：严格约束只写在执行文档（skill/agent）而未挂 review 检查点——执行阶段上下文杂、易跳过，review 阶段上下文干净才可强制

规范见 [documentation.md §4 规范单点声明原则](../../../../docs/standards/documentation.md)。

### 规范条款 review 检查点矩阵（严格约束逐条挂接）

> **定位**：`docs/standards/*.md` 已发布严格约束（必须 / 阈值 / 禁令）的**统一 review 落点**。上方「规范执行分层」检查新增条款**是否**挂接；本条给出**已挂接条款 → 可执行检查动作**的逐条映射。新增严格约束时，必须在本矩阵登记一行（或在 code-auditor 主责边界 / 本 checklist 挂接独立小节），否则按「规范执行分层」退回补挂。

改动触及下表「触发改动」列描述的实现面时，逐条核验对应「review 检查动作」；**同一规范条款可对应多行**（不同触发面 / 不同检查动作，如 `platform.md §7.4` 的接线约定与哨兵值两条）：

| 规范条款 | 触发改动 | review 检查动作 |
|:--|:--|:--|
| [engineering-practice-notes.md EP-21](../../../../docs/design/governance/engineering-practice-notes.md) | overrides / 映射 / 统计等「多输入 → 同 key」生成循环 | 同 key 多输入是否先预聚合（`Map<key, value>` 取 max）再统一写入；是否存在循环内 `map[key] = value` 的 last-write-wins |
| [development.md §5.1.25](../../../../docs/standards/development.md) | 声明「修复点单一 / 影响范围」的改动 | 是否以**行为特征**（argv / env 读取）为锚点全仓库穷举同根因调用点；共用映射 / 判定层改动是否**集中**在共用层；下游消费方是否硬编码单一场景文案 |
| [engineering-practice-notes.md EP-22](../../../../docs/design/governance/engineering-practice-notes.md) | `packages/*/tsdown.config.ts` / 多 entry 构建 | 构建后 `dist/` 是否出现 `index2.d.mts` / `index2.mjs`；共享 dts chunk 是否隔离到 `chunks/` 子目录 |
| [engineering-practice-notes.md EP-23](../../../../docs/design/governance/engineering-practice-notes.md) | 「迁移 / 等价性」判断、组件默认值或属性语义结论 | 是否用 `git show HEAD:<file>` **回读迁移前源码**（而非凭库文档推断仓库现状）；差异成因解释与仓库现状是否分开 |
| [engineering-practice-notes.md EP-24](../../../../docs/design/governance/engineering-practice-notes.md) | 「依赖卸载 + 引用归零」类任务 | 是否定义 `rg` 归零口径（含注释 / 文档 / 历史编号）；包体基线是否**回溯迁移前 commit 现场构建** |
| [development.md §5.1.29](../../../../docs/standards/development.md) | 写「A 优先于 B」的配置优先级 | 口径是否写明「字段级整体忽略 vs 逐条合并」；是否配**证伪用例**（高优先级来源存在但未覆盖该对象） |
| [development.md §5.1.29](../../../../docs/standards/development.md) | 构造期用外部数据合并 effective config | 是否保持 `readonly` 单次赋值（未改成可写）、是否避免引入第二份 effectiveConfig |
| [development.md §5.1.31](../../../../docs/standards/development.md) | 代码路径声明「只读 / 与环境解耦」 | 是否**穷举同族开关**（如 `migrationsRun` + `synchronize`）并各自配断言；是否打印 effective 覆盖行（**实际生效值**而非按 env 打印值） |
| [development.md §6](../../../../docs/standards/development.md) | 从父页拆出子组件 / 同行 label + 控件对齐 | 父页 `<style scoped>` 的同名规则是否随迁子组件（子组件 `<style>` 数与父页残留核对）；同行 `flex-end` 矮控件是否以「控件区补足控制档高度 + 居中」处理 |
| [testing.md §6.1](../../../../docs/standards/testing.md) | 新增 Playwright 容器 / e2e 用例 / 本机取证 / vitest 或文档遍历的排除配置 | 新容器是否同步 vitest `test.exclude` 并跑全量 `pnpm test`；容器内 Chromium 是否 `TMPDIR=/dev/shm`；权威证据是否 `--workers=1` 连跑两遍；**排除模式是否覆盖仓库根与包目录两个 root**（分别在两个模式下跑 `vitest list` 计数）；大目录排除是否在遍历器内**下降前剪枝**且用**路径前缀**（非通用目录名），相邻前缀是否有回归用例 |
| [testing.md §6.5](../../../../docs/standards/testing.md) | 新增 / 修改测试断言 | 是否**锁定独有子串 + 失败来源**（非恒真）；是否做 2-3 个 mutation（删 guard / 吞错 / 改回旧行为）标定确认用例会失败；mutation 存活的**不可达分支**是否登记为「已知边界」并为**可达**路径补调用点断言（非强行构造假场景，详见 testing.md §6.5 末段）；e2e **文案断言是否避免锁行尾**（用前缀 + 数字占位正则，超限态追加后缀不致假失败） |
| [testing.md §6.6](../../../../docs/standards/testing.md) | 需 mock ESM 命名导出 / 覆盖失败分支 | 优先级是否正确（真实故障注入 > 可选注入点 > `vi.mock`）；`it.skip` 是否带 TODO 理由并登记 backlog |
| [testing.md §6.7](../../../../docs/standards/testing.md) | **视觉回归**用例 / 基线 / 主题 token 改动 | 取证前先 build；加遮蔽须重生成基线；**反例验证纪律**（注入样式改动 → 用例如期失败 → 还原后全绿）；基线覆盖 fixtures 时须**写入路径锚定**（先断言行数 / 关键文案 / 标签色调再截图）+ 覆盖声明逐列核对；基线含**运行时派生值**（主键短 ID / 时间戳）时须在 fixtures 侧钉死（关键取值以 fail-fast 读取器兜底）；色板 / 间距类改动按内容核验（重建 + 逐像素 diff），不只看"用例通过"；**反例注入点是否落在新增层内部**（页面级样式不能证明目标区域敏感）；视觉 / e2e **测试库是否只含 fixtures**（审计 / 探针不得写库；出现整表差异先核对库内集合，不得用重建基线掩盖污染） |
| [testing.md §6.8](../../../../docs/standards/testing.md) | 审计 / 文档引用**取证工件** | 工件是否与冻结代码**同批生成**；文档数字是否只在验证链尾部落笔 |
| [security.md §2](../../../../docs/standards/security.md) | 读取外部可控配置文件（如目标仓库 `.github/*.yml`） | 外部可控配置**防护矩阵**五要素：错误摘要截断 / 原型链风险键过滤在 schema 之前 / 未知键 `Object.hasOwn` / 非普通文件不跟随符号链接 / 大小上限（完整矩阵以 [dependency-fixer.md §12.7](../../../../docs/design/modules/dependency-fixer-records.md) 为唯一权威） |
| [security.md §5.6](../../../../docs/standards/security.md) | 依赖审计阻断转正 / CI audit 步骤改动 | ① prod 阻断步骤无 `|| true`，含`--registry=https://registry.npmjs.org` + `--ignore-registry-errors`；② 全量 audit 信号步骤仍保留（`|| true`）；③ §5.6 记录转正日期 + **翻转后**连续 3 个`master`push run id（阻断步骤 conclusion=success 且日志含审计结果行；原「翻转前 3 次 clean」未达成 → 按 §5.7 修订通道转正，回填前不闭环）；④ 判据为阻断步骤 exit 0 **且日志含审计结果行**（`No known vulnerabilities found`；或`N vulnerabilities found` + `Severity: ... (N ignored)` 两行；ignored 不参与阻断），不得回退到 `No known vulnerabilities found` 字面串；⑤ 周回归 `security:audit-deps` 使用同一 prod 阻断命令，run 计为证据须日志含审计结果行（仅 `fetch failed` + success 不计） |
| [security.md §5.7](../../../../docs/standards/security.md) | 改动 `pnpm-workspace.yaml` 的 `audit.ignore` / CI 或 npm script 的 `pnpm audit` 命令 | 是否禁止 `--ignore` / `--ignore-unfixable` 入脚本（只写配置、不审计，会使门禁恒绿）；豁免条目是否含 GHSA + 依赖路径 + 复核条件；豁免是否属 §5.7 两类准入之一（patched 未发布 / 仅跨大版本修复且消费者未就绪）且写明消费者就绪判据；上游发布**兼容**修复版本、advisory 撤回或范围不再匹配后是否移除豁免 |
| [security.md §5.9](../../../../docs/standards/security.md) | `scripts/check-release-security-alerts.mjs` / `.github/release-security-exemptions.json` / `release.yml` 发布步骤 / 发布指南 | ① `release.yml` 的门禁步骤是否仍在 `release:publish` 之前，且 token / 台账 / API 异常为 **fail-closed**（不得跳过或视为无告警）？② critical 是否一律阻断（含 dismissed；脚本与台账均不接受 critical 豁免）？③ 台账条目 9 字段是否齐全（source / id / severity=high / category / target / path / reason / review / tracking；Code Scanning 另需 `location` 实例路径）并同步 backlog？`category` 与告警状态是否绑定（`false-positive` 仅 dismissed、`no-fix`/`hard-fix` 仅 open）？④ 级别归一是否正确（GitHub 原值 `medium` → moderate；Code Scanning 按 `security_severity_level`，缺失时 error→high / warning→moderate / note·none→low）？⑤ 是否用 dismiss / `audit.ignore` / `--ignore` 绕过 critical？⑥ 单测是否覆盖 critical 阻断、high 未豁免阻断、high 已豁免放行、unknown 级别阻断、stale 台账告警 |
| [platform.md §3.3](../../../../docs/standards/platform.md) | 新增 `apps/platform` migration | 是否**前缀感知**（先 `entityPrefix + 表名`、再回退无前缀）；用例是否覆盖两种前缀 + up/down 幂等 + 目标表缺失；**基线迁移**是否对 `metadata.foreignKeys` 逐个 `TableForeignKey.create` 内联（`Table.create` 不含 FK；SQLite 建表内联优于事后 `addForeignKey`）、`hasTable` 整表跳过保证幂等；**新增迁移类是否已登记进 `createDataSourceOptions().migrations` 数组**（未登记即失效，口径与防护见 [platform.md §3.3](../../../../docs/standards/platform.md)） |
| [platform.md §3.8](../../../../docs/standards/platform.md) | `Repository.verifyCommands` 字段 / 仓库级自定义验证命令 | 「命令执行面 + 写入门槛 + 审计留痕」三条安全边界是否保持（详细检查点分别落在 code-auditor 主责边界「修复执行安全基线」与「shell 命令安全」必查项，本条不重复其条目内容） |
| [development.md §5.1.52](../../../../docs/standards/development.md) | 新增验证命令来源（CI 镜像脚本 / 仓库声明脚本等） | 是否复用 `resolveVerifyCommands` → 同一 `runVerification`（超时 env / 取消面 / 基线归因 / 首失败短路同源）；动作是否标注 `commandSource`；显式自定义链是否仍整链替换且不与新来源叠加；新增来源是否有基线红 `preExisting` 与首失败短路用例 |
| [development.md §5.1.53](../../../../docs/standards/development.md) | 跨运行状态（尝试次数 / 上次结果）落在 PR 正文标记等可读回载体 | 读取失败 / 越界 / 标记被改写是否 **fail-open**（不误跳过）；计数键是否只用写入前可确定的输入（是否混入执行结果字段）；跳过是否落在安装与验证**之前**且不改变失败计数（`noOp` + 跳过原因分组，分组之和仍等于总数）；缓存是否按仓库 / 按轮复用而非逐告警重复查询 |
| [development.md §5.1.54](../../../../docs/standards/development.md) | 改自动提交的暂存面 / 新增写盘来源 | 是否以「固定白名单 ∪ 声明路径」执行 `git add -- <paths>`（无通配暂存）；未声明的**已跟踪**改动是否拒绝提交并打印路径；生成物是否不提交且不报未声明；空集合是否拒绝；索引区已有暂存内容是否全部落在提交集合内（越界即拒绝且不擅自 `git reset`）；新写盘来源是否声明 `FixAction.changedPaths`（仅成功且非 noOp）且路径经校验（绝对 / `..` / pathspec magic / 控制字符） |
| [development.md §5.1.55](../../../../docs/standards/development.md) | 新增等待 / 轮询外部异步结果（PR check / 部署 / 审批） | 空观测是否**绝不判成功**（宽限期 + 最少轮数后才允许未观测类终态）；是否双层预算（单对象 + 运行级，且受剩余 job 预算约束）并在超预算时记专用计数、保留对象；等待 / 评论 / 关闭失败是否只降级记录（不改结论与 exit code）；破坏性处置是否要求显式开关 + 归因一致（混合按未知）+ dry-run 守卫；采集失败是否与「零观测」区分 |
| [development.md §5.1.56](../../../../docs/standards/development.md) | 升级传递依赖 / 复核或移除审计豁免 | 是否用 `pnpm why` + `semver.satisfies` 逐边核验 range（overrides **替换**该包的解析范围：`^x` / `~x` 的同范围补丁由常规升级正常跟进，跨 minor 才需人工改配置）；`--frozen-lockfile` 与 `pnpm audit` 是否都不报错却被静默压低；advisory 撤回 / 影响范围不再匹配是否同样移除豁免并留复核记录 |
| [development.md §5.1.57](../../../../docs/standards/development.md) | 新增 / 调整供应链与工具链配置（成熟窗口、审计、镜像源） | 数值配置的**单位与默认值**是否按官方文档核对（如 `minimumReleaseAge` 以分钟计）？为绕开某条策略加例外前是否有**最小对照实验**证明原策略确实挡住目标？例外范围是否精确到版本、附移除条件且未放宽整体门禁？ |
| [development.md §5.1.58](../../../../docs/standards/development.md) | 改测试文件 / 异步回调内赋值 | 改动是否落在 typecheck 的 include 面（`tests/**` 亦在内）且**实跑** typecheck（exit 0 且 `error TS` 0 命中）？闭包内给外部变量赋值是否用对象持有而非非空断言？ |
| [development.md §5.1.59](../../../../docs/standards/development.md) | 新增 / 修改 `setInterval` 类周期插件 | 是否有 `running` 重入守卫（慢执行不并发进入）？状态是否按结果驱动（终态 / 可重试 / 退避 / 尝试上界）？退避是否以**完成时刻**计？配置关闭是否只清退避不清计数（避免关一下再开绕过上界）？ |
| [documentation.md §2](../../../../docs/standards/documentation.md) | 改 md 站内锚点 / 新增跨 locale 链接 | 锚点是否逐字符等于 VitePress 产物 id（`node scripts/check-docs.mjs --only=anchor-id`）？构建后是否跑 `docs:check:anchors`（锚点命中 + slug 自校验）？跨 locale 链接是否在 dist 里实测 href 目标存在（站点按路由解析，`check:docs` 只查磁盘路径） |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 新增 / 调整指南镜像或设计分片 | 指南改动是否跑 `docs:check:guides`（env / CLI / Action 输入键位 + H2 映射表）？设计分片增删是否同批更新 `mirror-manifest` 并跑 `docs:check:mirror`？ |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 新增 / 修改对外契约键位（CLI 参数 / Action input / 配置键 / `DEPENDFIX_*` / 报告字段 / 平台 DB 列） | 是否跑过 `check:contract-freeze` 且同时覆盖 zh·en quick-start 参数表？清单差异是被判为「代码越界」还是直接改清单修绿（后者须有契约变更结论）？新增键位是否按弃用策略留痕（1.x 只增不改不删、移除只在 2.0）？出现 `@Embedded` / `@ManyToMany` / env 解构 / 非常量 `readEnv` 实参时是否扩展抽取器而不是放过（`extractor-coverage` 失败项）？ |
| [testing.md §6.7](../../../../docs/standards/testing.md) | 新增 / 更新视觉基线、写「重建稳定」取证 | 重建是否验证了**副作用**（mtime / 字节变化或用 `=all`），而非只比未改写文件的哈希？断言是否收敛到**目标元素**（专属 class + 属性 + 文案成对）并用 mutation 证明能拦回归？`waitForVisualStable` 是否要求连续两帧一致？残余抖动是否量化登记（像素 / maxΔ / bbox / 与门禁余量） |
| [development.md §5.1.45](../../../../docs/standards/development.md) | 新增 / 修改契约字段、fixtures 写入路径 | 是否沿「schema → 写入映射 → 实体 / JSON 列 → 视图 → 渲染」逐段核对字段（任一段手工重建对象都可能漏）？端到端断言是否证明该字段真的落库并出现在响应里（而非仅 schema 接受） |
| [platform.md §3.9](../../../../docs/standards/platform.md) | `.github/dependfix.yml` 读取 / 合并 | **中央优先**（防目标仓库绕过）与**不提供 UI 入口**两条约束是否保持 |
| [planning.md §2.3](../../../../docs/standards/planning.md) | 候选上收 / 关闭 | 父段标题括号枚举是否同步收敛；已失效候选是否清理 |
| [planning.md §2.5](../../../../docs/standards/planning.md) | 条目含统计数字 / 跨文档引用同一批需求 | **量化断言**可复现口径：量级区间 + 测量方 + 可复现命令（第三方可复现）；**跨文档同源区分**：用户报告项数 / 登记候选数 / 上收原子数是否给出一致换算（无互相矛盾数字） |
| [planning.md §4.4 第 21-24 条](../../../../docs/standards/planning.md#_4-4-大批量归档批次操作规范) | 阶段归档 / 大批量文档迁移 / 批次闭环登记 | 「见 X」指针是否实测有落点？计数是否取**全部收口动作后的终态**并写明时点？切片是否按 `^##` H2 边界、骨架表是否保留表头 + 分隔行（产物 `<table>` 计数兜底）？是否同步 `docs/index.md` 等用户可见文档状态？ |
| [planning.md §4.4 第 13 条](../../../../docs/standards/planning.md) | 跨文件同步事实性口径 + 同源断言全仓改净 | 复扫是否用**结构化查询**（语义站点清单 + 组合 `rg`）而非字面 pattern；双语镜像是否单独扫 |
| [planning.md §4.4 第 14 条](../../../../docs/standards/planning.md) | 已知边界条目闭环 | 除 backlog 整段删除外，是否同步 `archive/index.md` §4 的「保留」清单与「当前基线」前向描述（`rg` 确认全部落点） |
| [planning.md §4.4 第 3 条](../../../../docs/standards/planning.md) | 跨目录相对路径 / 批量替换相对路径前缀 | old 片段是否**从路径字符（`../`）起写、未带上 `](`**（防吞 `]` 使链接退化）；改完是否做 malformed 检测（精确形态 `rg -n "\[[^]\n]*\((\.\.?/|/)"` 0 命中）并人工确认每处 `](` 与 `)` 成对（自建校验器对坏语法静默跳过，不能作为唯一证据） |
| [ai-collaboration.md §1.3 分级审计执行协议](../../../../docs/standards/ai-collaboration.md) | 规划 / 阶段启动批次 | 是否声明 `standard`（非 `quick`）；审计 prompt 是否携带 audit-depth + 变更清单 + 已验证证据 |
| [git.md §3.8](../../../../docs/standards/git.md) | 作用对象为被修复仓库的 `git commit` / `git push` 调用点 | 是否复用单一常量（`GIT_*_SIGNING_ISOLATION_ARGS` / `GIT_*_HOOKS_ISOLATION_ARGS`，无字面量漂移）；`--no-verify` 是否置于对应子命令**之后**；是否擅自提供签名 / hooks opt-in |
| [development.md §3](../../../../docs/standards/development.md) | 新增 / 修改源码注释或测试名（含新增文件） | 编号标记扫描是否**覆盖本批全部改动文件**（`git diff --name-only` + `git status --porcelain` + `git diff -U0` 新增行），而非只跑规范示例路径；命中是否为带文档路径的合规导航指针；**检测正则**是否同时覆盖裸写法与带连字符写法（如 `S-?\d`）、脚本头部是否声明未覆盖形态 |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 文档状态口径改写 / 双语镜像同步 | 反向改写是否有三重实证（commit + 代码现状 + 现存产物）、是否只改状态与元数据而未改写历史正文；镜像是否做到**链接级**一致（非仅行数）；状态口径清理是否**三向扫描**（同文档全状态字段 + zh/en 镜像成对 + 索引行 parity）；绝对 GitHub URL 锚点拼写是否人工核对 |
| [development.md §5.1.34](../../../../docs/standards/development.md) | 依赖升级差异 / 等价性结论、上游变更说明缺失；**依赖升级批次（含 dependabot PR）** | 是否按语义级 diff（剥 hash 与 scope，md5 判同文件）而非归一化近似；无 release 时是否以产物（tarball / dist）为权威；**升级是否只改「版本号 + lockfile」而未跑完整门禁（lint / typecheck / test / e2e / 视觉 `--update-snapshots=all`）与版本口径文档同步；是否存在未适配的断言级契约变化（类名 / token 取值）** |
| [planning.md §4.4 第 15 条](../../../../docs/standards/planning.md) | 执行期发现 AC 范围外的同源陈旧 / 同构遗漏 | 是否带 `file:line` 证据提请用户决策（未自行扩范围）；用户授权后是否在条目「范围」段与 commit 说明记录授权来源；AC 排除项是否以**无阶段编号**候选登记且登记位置与区块定义自洽；复扫面是否覆盖 `packages/**/*.ts` + `scripts/**/*.mjs` 注释 |
| [development.md §5.1.36](../../../../docs/standards/development.md) | 失败路径写回（全部入队失败 / 孤儿批次 / 零子项孤儿） | 是否只写 `status` / `finishedAt` / `updatedAt`（可选补空 `summary`）而非整行 `save` 或写回整份聚合载荷（内存实体为初值 / 旧快照，会覆盖并发聚合的计数）；`affected === 0` 时是否不改库不改实体且调用方不计数；收敛后无生产调用方的「整份载荷」变体是否删除 |
| [testing.md §6.9](../../../../docs/standards/testing.md) | 把本地检查脚本接入 CI 并声明阻断 | 三件套是否齐备：负例标定（植入违例确认退出码非 0，跑后删脚手架）/ 自指面核对（步骤所在文件若在扫描面内，新增注释不得含无指针规划编号）/ 阻断强度声明（无 required status checks 时写明仅为 workflow 级信号）。**mutation 是否打到数据落库 / 分支复用层**（仅端点传参覆盖不足）。**多入口复用**：同一门禁集被 Test / release / 回归 profile 多处消费时，是否收敛到单一集合脚本（如 `DOC_GATES`）？各调用方（含 `release.yml`）是否都引用该入口？单测是否锁定「Test 文档步骤与集合双向差集为空」（单向子串断言会漏掉「Test 新增、集合未同步」的危险方向）。 |
| [platform.md §7 前端规范（列表并发守卫 bullet）](../../../../docs/standards/platform.md#_7-前端规范-app) | 列表 / 表单页的并发请求守卫（inflight 短路） | 请求在途期间的筛选 / 分页 / 提交参数变更是否被静默丢弃（应记录最后一次待补跑参数并在收尾后补跑）；写入型守卫是否吞掉用户动作 |
| [development.md §5.1.43](../../../../docs/standards/development.md) | 前端 / 下游为预判引入上游阈值或枚举常量的镜像（上限、窗口大小、枚举取值） | 镜像侧是否用具名常量（非裸魔数）且注释指向权威常量？是否存在**权威侧等值断言**（`expect(镜像值).toBe(权威值)`）锁定两侧？权威侧校验（413 / 400）是否保留、镜像是否只决定预判提示？漂移后果是否限于「提示与响应不一致」（不得据此放行越权操作）？（条目为列表项无独立锚点，按 [documentation.md §2](../../../../docs/standards/documentation.md)「本地文件链接默认不带锚点」引用） |
| [development.md §5.1.44](../../../../docs/standards/development.md) | `packages/engine/src/**` 出现同步子进程 API（`execSync` / `execFileSync`）或新增长命令 / 交付命令调用（安装 / 锁文件修复 / 验证 / git push·commit·reset / checkpoint） | 是否走 `runners/process-control` 受管异步执行（`.cmd` 包裹的工具链经 shell，原生可执行文件——尤其 `git.exe`——是否**显式 `shell:false`**，引号化交 libuv）？命令启动前是否有取消前置守卫（已取消 → `started:false` 且不 spawn）？超时 / 取消后是否跳过 commit 与 PR？中止是否以独立类别上报（`ABORTED`，非 `ENVIRONMENT_ERROR`）？声明"已超时 / 已取消"是否有子进程真正终止的证据（仅 `Promise.race` 放弃等待不算完成）？（条目为列表项无独立锚点，按 [documentation.md §2](../../../../docs/standards/documentation.md)「本地文件链接默认不带锚点」引用） |
| [development.md §5.1.47](../../../../docs/standards/development.md) | 读取子进程失败证据 / 带执行超时的执行器日志 | 是否按「原始 stderr（非空时）→ **stdout（非空时）** → `err.message`」回退，并渲染 signal / exit code / errno / timed-out？失败原因是否**在失败发生点**写日志（不得只依赖收尾汇总——超时截断拿到的是早于收尾的快照）？（条目为列表项无独立锚点） |
| [planning.md §3.1.1 插队后的阶段容量再平衡](../../../../docs/standards/planning.md#_3-1-1-插队后的阶段容量再平衡-hard-requirement-2026-10-19) | 阶段期间出现插队（例外清单 3 类或用户授权追加） | 是否做了阶段容量影响评估（插队工作量 + 剩余原子 + 剩余验证预算）？命中阈值（累计 ≥ 3 批 / 插队 ≥ 原计划 50% / 无法在窗口内完成）时是否**移出低优先级原子到 backlog**（保留 8 要素并标注原因，不删除）？是否以压缩验收 / 跳过 Review Gate / 合并验证替代再平衡？三处记录（todo 阶段头 / 插队条目 / archive/index 批次记录）是否一致？ |
| [development.md §5.1.45](../../../../docs/standards/development.md) | 新增 / 修改仓库级 JSON 配置列（`prCheckFocus` 一类）或引入「已配置走新路径 / 未配置沿用旧值」双路径 | 写入闸门是否**宽容输入**（trim / 去重 / 枚举收敛）且对象 `.strict()` 拒绝未知键（防「配了但静默不生效」）？校验常量与规范化实现是否共用同一组常量？双路径是否补了**逐字段冲突**等价性用例（每个派生字段一个 mutant 可击杀）？（条目为列表项无独立锚点） |
| [planning.md §3.1 追加临时待办标记口径](../../../../docs/standards/planning.md#_3-1-新需求默认走-评估-→-backlog-原则-hard-requirement) | `todo.md` 当前阶段出现清单外（经用户授权）的追加事项 | 是否**追加在阶段段落末尾**并以「追加临时待办（不占阶段条目编号）」显式标记？是否**未占用 / 未重排**既有原子条目、**未分配编号**、未计入阶段条目容量与类型平衡？条目正文是否含评估结论（目标 / 范围 / 验收 / 风险）？是否存在把清单外需求包装成清单内例外的措辞？ |
| [git.md §3.7.2](../../../../docs/standards/git.md) | 未提交工作区上做临时变更 / 还原（mutation、探针） | 还原是否用备份回写或反向 patch（**禁用 `git checkout --` / `git restore`**——会整文件回退抹掉未提交实现）；还原后是否 `git diff --stat` / `git status` 核对与变更前一致；探针文件是否按明确路径一次删一个 |
| [engineering-practice-notes.md EP-26](../../../../docs/design/governance/engineering-practice-notes.md) | 「统一同类写法 / 复用化」类改动的范围穷举 | 是否用**构建产物**穷举（合并同选择器规则；注意 `server/chunks/build/*styles*.mjs`），而非只靠源码 grep（只能发现「值不同」的站点）；「范围已穷举」的结论是否经得起「筛选条件是否只命中目标一部分」的追问 |
| [platform.md §10.1 / §10.2](../../../../docs/standards/platform.md) | `apps/platform/Dockerfile` / `docker-compose*.yml` / `.github/workflows/docker.yml` 或 runtime 镜像改动 | 关键启动默认值（如 `DATABASE_MIGRATIONS_RUN`）是否用 Dockerfile runtime `ENV` 固化（非仅 compose）；推送门禁是否含真实镜像首启冒烟（不注入该 env，断言 HTTP 200 + 业务表数下限 + 无 `no such table`）；空库且未开迁移时启动是否打明确告警；runtime 阶段是否只 `COPY .output`（未复制根 `node_modules` / workspace dist）、`.output/server/package.json` 依赖是否逐项 `existsSync` 命中；**目标仓库原生模块回退编译工具链**是否逐个 `command -v python3/make/g++` 命中（`smoke-test.sh` 场景 0）且 `docker build --check` 无告警 |
| [platform.md §10.3 / §10.4 / §10.5](../../../../docs/standards/platform.md) | `server/services/queue/**` / `server/plugins/database-bootstrap.ts` / 队列 env 改动 | `auto` 模式是否含消费者维度（Redis 可用且 `inProcessWorker` 才 async，无合法消费者降级 sync）；容器 env 是否用 `NUXT_` 前缀；`DEPENDFIX_MIGRATIONS_ONLY=true` 的 `.catch` 是否补 `process.exit(1)`；锁参数是否显式配置且 `lockDuration` 引用 `resolveExecutionTimeoutMs()` 单一事实源（缺省 `DEFAULT_EXECUTION_TIMEOUT_MS`，非 BullMQ 隐式默认 30 秒）、`lockRenewTime` 为其一半且单测锁定对齐；`EXECUTION_TIMEOUT_MS` 变更时 ScanRun 孤儿清理阈值（`server/plugins/stale-cleanup.ts`）是否同源联动；`stalled` / `lockRenewalFailed` / `error` 三类事件是否注册、结构化日志的 `runId` 解析失败是否降级为显式 `null`（不吞告警）；续期类 `error` 是否标注 `duplicateOf` 供去重且 message 经 `sanitizeString` 脱敏；`error` 载荷是否不含 job 上下文 |
| [development.md §5.1.36](../../../../docs/standards/development.md) | 并发终态写 / 聚合状态写回 / 条件更新 | 是否用条件 `update({ id, status: <读取时状态> }, payload)` 而非整行 `save`；乐观锁条件是否取读取时状态（非固定 `'running'`）；`affected === 0` 是否跳过；payload 是否显式写 `updatedAt` |
| [engineering-practice-notes.md EP-28](../../../../docs/design/governance/engineering-practice-notes.md) | 多源 / 多分支「全部失败」判定 | 存在第三态（如 `ALERTS_DISABLED`）时判据是否为「失败数 > 0 且成功数 === 0」（非 `失败数 === 总数`）；抛错前 per-source 状态是否完整写入；仓库级 catch 追加同 `category` 信号前是否先判「该仓库已有带 `source` 的同类信号」（避免重复信号与日志汇总 `unknown` 归组） |
| [testing.md §6.4](../../../../docs/standards/testing.md) | e2e 控制服务端 locale / 操作请求 cookie header | 是否用显式 `cookie` header 剥离 / 附加（而非操作浏览器上下文 cookie，避免客户端框架异步回写竞态）；未认证 API 是否显式空 `storageState` |
| [git.md §3.7.1](../../../../docs/standards/git.md) | 多 atomic commit 隔离 / complement-stash | stash 补集前是否判断补集非空（为空直接 `git add` 目标，防 `git stash push --` 无路径暂存全部）；提交后 `git show --stat HEAD` 是否核对文件数；`git add -N` 的 intent-to-add 新文件是否先 `git reset --` 退回未跟踪再 stash；隔离脚本是否带 **EXIT trap 恢复补集**（commit 被拒时不得滞留 stash） |
| [planning.md §3.4](../../../../docs/standards/planning.md) | 规划条目标注历史 commit 的 C 编号 / M 阶段 | 是否 `git show --stat <hash>` + 归档分片核实归属（非凭同域描述推断） |
| [api.md §4 排序确定性](../../../../docs/standards/api.md#_4-分页格式) | 新增 / 修改列表查询（主排序键可并列：时间戳 / 分组名） | 是否在主排序后追加**唯一列次键**（通常主键 `DESC`），使同一查询两次行序一致？次键是否只承担确定性、业务意图顺序仍由数据显式决定？是否有同键多行「两次查询一致」的用例（而非仅集合包含断言）？ |
| [platform.md §6.2 运行失败分类口径](../../../../docs/standards/platform.md#_6-2-运行失败分类口径-failure-code-failure-stage-failure-kind) | 失败分类三列（`failure_code` / `failure_stage` / `failure_kind`）落库 / 回填 / 筛选改动 | 分类是否集中映射表 + `unknown` 兜底（未映射码保留 `code`）；落库是否覆盖**全部**失败写路径（含复用 run 时清空三列）；回填是否 dry-run 默认 + 幂等 + 无法判定写 `unknown` |
| [platform.md §7.4 caomei-ui 接线约定](../../../../docs/standards/platform.md#_7-4-caomei-ui-接线约定) | 筛选 / 偏好类下拉的「全部 / 未设置」项 | `SelectItem` 的 `value` 是否非空串（空串触发 SSR 500）；哨兵值是否在对外提交前映射为「不传参」或 `null`，且**不落盘 / 不参与枚举校验** |
| [platform.md §7.4 caomei-ui 接线约定](../../../../docs/standards/platform.md#_7-4-caomei-ui-接线约定) | `CaomeiDialog` 响应式宽度 / 弹窗宽度写法 | 需要响应式宽度时是否用设计钩子 `--caomei-dialog-width`（非 inline `:style="{width}"`——inline 恒胜 `:breakpoints`，会使其成为死代码，窄视口失效） |
| [platform.md §7.6 运行时 env 开关的 UI 状态暴露](../../../../docs/standards/platform.md#_7-6-运行时-env-开关的-ui-状态暴露用只读端点) | UI 反映服务端运行时 env 开关（如 `ACTION_STATUS_MONITOR_ENABLED`） | 是否用服务端**只读端点**按请求读 `process.env`（非 `runtimeConfig.public`——构建期烘焙会漂移）；UI 文案是否说明「设置后需重启」 |
| [documentation.md §2](../../../../docs/standards/documentation.md) | 规范 / 设计文档的条款标题 | 标题内是否嵌套了强调标记（`**`）导致渲染破损？边界说明 / 交叉引用是否放在正文？（**未配对**形态已由 `check:docs` 的 `emphasis` 规则机检，本检查点聚焦「成对但语义错位」——如嵌套进已加粗标题——的门禁盲区） |
| [testing.md §6.5](../../../../docs/standards/testing.md) | 交互断言（点击 / 提交）区分度 | 点击目标是否确认为**事件绑定元素**？断言是否只能由该行为产生的状态（如排序属性）满足？三态控件是否逐次操作并等待属性回写（避免过冲）？ |
| [testing.md §6.6](../../../../docs/standards/testing.md) | ESM 接线断言 | 是否用 `vi.mock` + `importOriginal` **部分 mock**（记录实参后委托真实实现），而非整体 mock 破坏依赖真实行为的既有用例？ |
| [testing.md §6.7](../../../../docs/standards/testing.md) | 页面可见改动 → 视觉基线 | 改动页面（含**文案**）的整页基线是否重建？**以该页为背景的视口基线**是否连带重建？重建后是否**不带 update 连跑两遍**验证幂等（update 落盘帧可能不是稳定帧）？基线含**运行时派生值**（主键短 ID / 时间戳）时须在 fixtures 侧钉死（关键取值以 fail-fast 读取器兜底）而非靠遮蔽或容差兜底？归因前是否比对失败谱跨运行一致性（一致即确定性变更，不得归为抖动）？无视觉守卫的页面是否显式登记？ |
| [testing.md §6.7](../../../../docs/standards/testing.md) | 视觉用例新增兜底 / 重试逻辑 | 兜底动作的副作用是否在**当前容器语义**下实测（模态内 `Escape` 会关闭宿主弹窗）？重试是否只重复原动作、首次等待不低于原口径？兜底有效性是否用**注入式标定**证明（最终成功 + 耗时 ≥ 首等窗口），而非仅靠连跑 N 轮全绿？ |
| [testing.md §6.7](../../../../docs/standards/testing.md) | 新增基线的反例标定 | 标定注入点是否按「页面主表面 → 文本色 → 边框」选，而非小面积 token（`bg-elevated` 之类只命中数百像素、余量偏薄）？是否记录差异像素与覆盖面积解释，避免把「通过」误当「灵敏」？ |
| [testing.md §6.10](../../../../docs/standards/testing.md) | 脚本级测试 / 被测服务同进程验证 | 入口脚本是否用真实 shell + PATH 桩测试？被测服务与测试同进程时是否**避免** `spawnSync`（阻塞事件循环导致观察为空）？以脚本输出行为同步点发信号的用例是否同时断言 `{ code, signal }`，并在竞态无法稳定复现时补**源码顺序断言**？ |
| [platform.md §10.8](../../../../docs/standards/platform.md) | pnpm store 持久化 / 目标仓库 `.git/info/exclude` 改动 | store 可写性是否按**真实运行身份写探针**判定（`test -w` 不看挂载只读属性，只读卷上已存在的 store 会误判可写）？不可用（只读挂载 / 权限不足 / 非绝对路径）是否 **unset 变量回退** pnpm 默认位置（只 warn 不 unset 会让 pnpm 继续用坏路径）？store 目录是否**以运行身份创建**（root 经 `su-exec`；不对用户指定路径做 `chown`，`/` 等根路径拒绝并回退）？提交卫生是否只写 `.git/info/exclude`（不改 `.gitignore`）、幂等且按 git「最后一条匹配胜出」处理取反行、写入失败 warn 不阻断，且仅在 `fix` / `fix-and-pr` 非 `dry-run` 预置？`entrypoint.test.mjs` 是否覆盖 root / 非 root 两条路径与绝对路径校验？ |
| [platform.md §10.9](../../../../docs/standards/platform.md) | 进程级日志通道 / `server/utils/logger.ts` / 日志落盘边界改动 | 已接入边界是否**无新增裸 `console.*`**（统一走 logger 门面）？运行级 `MemoryLogger` 是否仍只落控制台 + `logsJson`（未重复写文件）？多进程（HTTP + worker）的 audit 是否按「角色 + 文件类型」隔离、写探针名是否唯一（固定名 mutation 是否被击杀）？`LOG_LEVEL` / `LOGFILES` 非法值是否 **warn 回退**（不得静默按危险默认）、目录不可写是否回退控制台且不阻断？致命错误是否 **stderr + 同步错误文件 + exit(1)**（不得吞异常）、`process.exit` 前的最后一行是否同步写？消息 / context（含 `Error` / 循环引用 / 任意 scheme 的 URL 凭据）是否都脱敏？权威阈值与回退口径见 [platform-logging.md](../../../../docs/design/governance/platform-logging.md) §3-§4（不得在本规范重复数值） |
| [development.md §5.1.25](../../../../docs/standards/development.md) | 删除公共导出 | 是否全仓（**含全部测试目录**）grep 引用？是否区分代码引用与文档 / 归档描述性文本？ |
| [development.md §5.1.40](../../../../docs/standards/development.md) | 与外部工具语义对齐的判定 | 是否用该工具权威实现逐形态（**含反例**）实测比对？等价类扩展方向是否倾向保守（宁可多报不可漏判）？ |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 阶段状态口径翻转 | 「暂无进行中阶段」↔「Mxx 进行中」翻转时，是否同步**全部承载位置**（待办速查表 + 路线图指针 + 各文档速查表 + 首页里程碑）？ |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 规范 / 文档声明「覆盖面」（如「全部 N 处调用点」） | 是否限定**作用对象**并显式列出**不适用面**（防 repo-wide 读成零遗漏）？ |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 文档示例形态（如指针写法）与实现不一致 | 该形态是否属**既有文档已声明的约定**（是 → 在实现侧扩展容忍并补测，而非把文档改窄）？ |
| [development.md §5.1.41](../../../../docs/standards/development.md) | 「收窄 / 跳过」类改动（省成本、消除假失败、提前返回、降级）或对可能为空的结果集做聚合判定 | 被跳过步骤的产物是否有**别的消费者**（字段级穷举）？跳过后面临的判据空洞是否显式补上（新增信号 / 跨用例不变量）？**跳过 / 未验证是否被折叠为通过**（`every()` 对空集合恒真 → 是否用显式字段如 `verificationSkipped` 与通过分流，门禁不交付但不误记失败）？ |
| [engineering-practice-notes.md EP-31](../../../../docs/design/governance/engineering-practice-notes.md) | 给 composable 引入依赖注入（`useXxx(deps)`） | 缺省实现是否在 **setup 期**求值（`deps.x ?? resolveXxx()`）而非事件期延迟调用 setup-only composable（`useI18n` / `useRoute` / `useState`）？事件期是否只用 event-safe 全局？ |
| [testing.md §6.11](../../../../docs/standards/testing.md) | 门禁 / 脚本类单测（`scripts/**`） | CLI 早返回分支是否 `process.exit` **兼** `return`（mock 下不终止会 fall-through，使 mutation 存活）？夹具字面量是否会被被测门禁脚本自身扫到（改运行时拼接）？ |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 归档条目落点校验粒度 | 同一 `##` 下存在编号 `###` 子条目时是否**逐条**校验（不得由兄弟条目的落点代偿）？无编号子条目的 `##` 是否整体校验？自指落点（`本条` / `同上` / `详见本条`）是否判空？门禁：`pnpm check:experience-landing`。 |
| [platform.md §10.6](../../../../docs/standards/platform.md#_10-6-队列执行进程隔离-独立-worker-进程) | `apps/platform/docker/entrypoint.sh` 双进程编排 / 信号处置改动 | 容器停止（TERM / INT）的转发 trap 是否**先于**「启动子进程」与「输出就绪行」安装（就绪行是外部观测方唯一同步点，晚装则落在窗口的信号按默认处置终止 PID 1 → 观测方读到 signal 终止而非 143、看护循环与 worker 失去父进程）？子进程尚未启动时是否直接退出而非吞掉停止信号后照旧启动？源码顺序断言（`entrypoint.test.mjs`）是否同步更新？退避等待是否用 `sleep N & wait $!`（前台 `sleep` 阻塞 trap）并有真实 `sleep` + `TERM` 计时用例 |

| [development.md §5.1.48](../../../../docs/standards/development.md) | 新增统计项 / 去重键 / 「读不到就降级」分支 | 统计依赖的列 / 字段是否有**生产写入方**（`rg` 全部写入点，防基于死列统计恒 0）；去重前提是否随语义演进失效（计划命令 → 实际命令需改并集 / 失效键）；降级是否**整体**而非静默截断（只取前 N 个会漏判关键语义并产出假阳） |
| [development.md §5.1.49](../../../../docs/standards/development.md) | 分散判据收敛 / 「停止剩余步骤」/ 一次性记账 | 判据单点化是否同时收口**适配层**（取消 / 超时 / 空输出先适配成同形错误）？停机是否以**返回值向上传导**（void 只停本步）？`addSkipped` 一类记账是否放在**分区处**（尾部会被提前 return 整段跳过）？ |
| [development.md §5.1.43](../../../../docs/standards/development.md) | client / server 共享字符串哨兵 / 「是否未知」判定 | 是否导出**镜像常量**（或共享包导入）并在 server 测试断言两侧相等？「是否未知」类判定是否收敛到单一纯函数，而非两端各写裸字面量？（枚举 / 阈值镜像见 §5.1.43） |
| [engineering-practice-notes.md EP-34](../../../../docs/design/governance/engineering-practice-notes.md) | 某通知 / 投递类别豁免限流（指纹 / 冷却 / 每小时上限） | 是否只跳过自身限流判定，却仍让该类别的 `sent` 行计入**共享计数查询**（一次批量投递可挤掉常规类别）？是否补「豁免类别发送后常规类别仍可发送」用例？ |
| [testing.md §6.10](../../../../docs/standards/testing.md) | 脚本级测试中的 shell 管道 / 退出码断言 | 管道 + tail 后接双竖线 fail 在 dash（无 `pipefail`）下是否为死代码（管道状态取末命令）？是否拆分为「捕获输出（带失败判定）」与「解析输出」两步并单独断言关键日志行？ |
| [testing.md §6.14](../../../../docs/standards/testing.md) | 新增 / 修改时间敏感断言（`Date.now()` / timer / deadline / 预算余量） | 是否优先注入 `now`？无法注入时构造值是否留明确余量（而非「恰好等于阈值」）？边界两侧是否用显式常量断言（`= 阈值` 通过 / `阈值 - 1` 拒绝），而非让真实时钟充当边界？单文件连跑仅作 smoke，稳定性是否以注入 / 常量断言证明？ |
| [testing.md §6.13](../../../../docs/standards/testing.md) | 新增脚本 / CLI 入口 / 依赖环境变量的用例 | 默认参数箭头函数与 `isDirectExecution` 守卫是否拉低 patch 覆盖率（显式参数 seam + 真实最便宜命令；守卫 `v8 ignore` 是否注明理由）？依赖 `GITHUB_ACTIONS` 等变量的用例是否 `vi.stubEnv` + `finally vi.unstubAllEnvs()` 隔离（本地绿 ≠ CI 绿）？ |
| [testing.md §6.8](../../../../docs/standards/testing.md) | mutation / 审计取证工件 | 是否逐项记录**文件、变异前 md5、失败用例名、复现命令**，而非只写「N/N 击杀」汇总？还原后是否 md5 核对一致？ |
| [git.md §3.7.1](../../../../docs/standards/git.md) | 拆批提交 / lint-staged 文件级任务 | 拆批前是否先把**未暂存文档** stash / 还原到 HEAD（lint-staged 的 updateIndex 会按任务前后 diff 重暂存，未暂存文档可能被带入 feat commit）？每组 `git add` 后是否 `git diff --cached --name-only` 核对、提交后 `git show --stat HEAD` 复核？ |
| [git.md §3.7](../../../../docs/standards/git.md) | 为新增依赖跑过 `pnpm install`（lockfile 变更） | 是否 `git diff -U0 pnpm-lock.yaml` 逐 hunk 核验，只保留目标依赖的 importer / packages / snapshots 条目；非目标依赖的 range 内顺手升级是否已还原；还原后是否复跑 `--frozen-lockfile` |
| [documentation.md §2](../../../../docs/standards/documentation.md) | Markdown 表格单元格含双竖线 | 是否用「反斜杠 + 双竖线」转义？`check:docs` / `lint-md` / `docs:build` 都不校验列数（门禁全绿但渲染丢列），改完是否解析产物 HTML 复核列数？ |
| [documentation.md §6](../../../../docs/standards/documentation.md) | 实现形态反转（如「先建后 chown」→「以运行身份创建」） | 检查点矩阵行是否与条款**同批更新**？矩阵仍写旧形态会让后续审计按矩阵「整改」重新引入缺陷 |
| [planning.md §2.5](../../../../docs/standards/planning.md) | 设计 / 验收中出现计数 | 是否写明**单位与分母**（如「安装尝试数」而非「故障事件数」）？同一故障在多链路各落一条审计时，按事件理解会误判重复计数 |
| [platform.md §10.1](../../../../docs/standards/platform.md) | 官方 Node 基础镜像 / pnpm / node-gyp 工具链 | 是否先移除 corepack shim 再钉 pnpm 版本？受限网络是否设 `npm_config_nodedir`？pnpm 11 是否使用 `pnpm_config_*` 前缀（`npm_config_registry` 不保证生效，构建期两种前缀同时导出）？ |

> **维护纪律**：本矩阵为严格约束检查点的**单点落点**，其他文档 / skill / agent 只做一行链接引用（见上方「规范单点声明」）。矩阵行与条款对应（**同一条款可对应多行**，见上方说明）；条款废弃 / 合并时同步删行。

### todo.md / todo-archive.md 子任务详细度审计（必查项）

P 阶段规划 / 阶段实施 / 阶段归档批次触及 `docs/plan/todo.md` / `docs/plan/todo-archive.md` 时，按 [planning.md §2.5 任务详细度要求](../../../../docs/standards/planning.md#_2-5-任务详细度要求) 检查每条子任务（子阶段条目）的详细度：

- **8 要素完整性**：每条子任务必须含以下 8 要素，缺一项即 warning（按严重性可升级为 blocker）：
  1. **目标**：要达成什么（一句话可证伪）
  2. **优先级**：P1 / P2 / P3
  3. **范围**：包含什么（具体文件 / 模块）
  4. **验收标准**：可证伪的具体条款（checklist 形式，≥ 3 条）
  5. **不做什么**：边界（明确排除项）
  6. **依赖**：前置任务 / 关联 backlog 条目
  7. **交付物**：commits 数量 + files 清单 + 文档
  8. **风险与缓解措施**：潜在风险点 + 缓解方案（≥ 1 条）

- **禁止模糊口径**（按 [planning.md §1.1 L10 验收标准具体化](../../../../docs/standards/planning.md#_1-1-硬性约束) 扩展）：
  - "优化一下" / "清理一下" / "增强一下"
  - "先做最小版本" / "做个基础版" / "做个简化版"
  - "顺手做" / "一起处理" / "顺便改"
  - "后续完善" / "持续优化" / "视情况"
  - 仅 1-2 行描述的子任务清单（信息密度不足以指导实施）

- **执行场景**：
  - P 阶段规划 commit：每条 `M\d+\.\d+` 子任务清单必须满足 8 要素
  - 阶段实施 commit：todo.md 子任务从 `[ ]` → `[x]` 时若任务描述变更需重新核验
  - 阶段归档 commit：todo-archive.md 归档子任务需保留 8 要素（即使闭环后）

- **验证手段**：
  - 检索每条 `M\d+\.\d+` 条目，统计要素清单（标题 + 8 要素子条目 / 段落）
  - 模糊口径关键词扫描：`grep -nE "(优化一下|清理一下|先做最小版本|做个基础版|顺手做|后续完善)" docs/plan/todo.md docs/plan/todo-archive.md`
  - 缺失要素 ≥ 2 项或含模糊口径 → warning；缺失要素 ≥ 4 项或主条目整体过简 → blocker

本必查项由 M21 P 阶段规划新增（2026-08-31）：子任务描述必须含验收标准 / 风险 / 范围详细度，避免后续 session 接手时需重新理解需求，违反 [planning.md §1.1 L10 验收标准具体化](../../../../docs/standards/planning.md) 与 §2.2 L41 任务描述要求。

### 分级审计协议（audit-depth）必查项

审查调用方是否按改动风险等级声明 `audit-depth`（quick / standard / deep），审查输出是否在选档时间内收敛：

- **必查场景**：A 阶段审计 prompt 是否携带 `audit-depth` 声明 + 理由（变更文件清单 / 已验证证据摘要 / 复审问题编号清单）？
- **选档映射**：quick ≤ 5min（测试补强 / 文档措辞 / 简单配置 / 重命名）/ standard ≤ 10min（常规业务逻辑 / 模块内改动）/ deep ≤ 20min（发布流程 / 安全鉴权 / 外部调用 / 数据写入 / 配置与依赖变更 / agent 与 skill 定义）
- **未声明按 deep 防御**：调用方未声明时按 deep 执行（防御方向），但**小改动必须主动声明 quick**避免拖长用时
- **复审只审修复点**：第 2+ 轮只复查上轮问题编号对应的修复点 diff 与受影响断言，不得重读全量
- **并发分区**：diff 文件数 > 8 或涉及 ≥ 2 个独立模块时按模块分区并行发起多个审查任务；小改动不得并发
- **真实用时实测**：发起审计 task 前用宿主系统时钟记录启动时间戳，审计返回后实测 elapsed，超时仅作分级校准信号（agent 自报用时为 LLM 估算，不得作为时间盒核验依据）
- **未声明防御**：缺失 audit-depth 声明 → 提示执行角色补声明；理由缺失 → 退回补理由

规范见 [ai-collaboration.md §1.3 分级审计执行协议](../../../../docs/standards/ai-collaboration.md) + [code-reviewer SKILL.md §2.5](../SKILL.md)。

### 单次提交审计阈值（10 文件 / 800 行）必查项

审查 diff 规模是否触发拆分要求：

- **必查场景**：A 阶段审计输入的 `git diff --stat` 新增文件数 > 10 或新增行数 > 800 → 必须要求调用方说明批次拆分依据；未拆分且无正当理由 → Reject
- **阈值例外**：重构清理 / 单包小步迁移等场景可声明"既有阈值不适合"并提供新阈值（如 `5 files / 400 lines`），但需在 commit message 与 todo.md 阶段治理记录中固化
- **C65-A batch 上限实证**：某次 C65-A1/A2/A3/A4 共 4 sub-batch × 4-6 commits ≈ 20+ commits 推送被 CI Coverage 验证分割至 4 维度阈值——分批已隐含执行，不强制按本阈值拆分（避免与"PDTFC+ 多 sub-batch 子阶段独立闭环"惯例冲突）
- **反模式**：单次提交 50+ 文件 / 数千行 diff，审计耗时指数级上升、Review Gate Reject 概率增加、回滚粒度过粗

规范见 [ai-collaboration.md §1.4 单次提交审计阈值](../../../../docs/standards/ai-collaboration.md) + [规划规范 §1.1 任务粒度约束](../../../../docs/standards/planning.md) + [code-reviewer SKILL.md §2.5](../SKILL.md)。

### 验证分级矩阵（最低验证要求）必查项

审查 F 阶段本地验证是否覆盖改动类型的最低验证矩阵：

- **必查场景**：执行角色声明"F 阶段完整验证通过"时，是否覆盖 [ai-collaboration.md §2.2 验证分级矩阵](../../../../docs/standards/ai-collaboration.md) 列出的最低验证项？
- **分级映射**：文档 / 规划 → lint:md + RG；纯逻辑 / 工具函数 / 服务层 → lint + typecheck + 定向测试 + RG；API / 鉴权 / 数据模型 → lint + typecheck + 定向测试 + RG（关键写路径升级到流程验证）；UI 组件 / 页面交互 → lint + typecheck + 测试 + 浏览器验证 + RG；修复型 Hotfix → lint + typecheck + 复现与修复后结果 + RG；配置 / 依赖 / CI / 技能与 agent 定义 → lint + typecheck + 定向验证 + RG
- **执行验证 vs 声称验证**：执行角色可声明"已跑 lint / typecheck"但**未跑 build / test / coverage**，但 commit message / todo.md 验证证据段声称"完整验证全绿"——必查此类口径不一致
- **测试覆盖增量**：含测试改动的批次是否含 `pnpm test` 全 workspace 而非仅 `pnpm --filter <pkg> test`（避免非改动包引起的回归漏掉）

规范见 [ai-collaboration.md §2.2 验证分级矩阵](../../../../docs/standards/ai-collaboration.md) + §2.2 不同改动类型的最低验证要求子节。

### F 阶段本地验证必须含 coverage 必查项（hard requirement）

审查 F 阶段"完整验证"是否含 `pnpm run test:coverage`（全 workspace）+ 检查 4 维度（statements / branches / functions / lines）是否 ≥ 80% 阈值：

- **必查场景**：跨多包 / 含新增文件 / 含数据库 / 含 IO 的批次，声称 F 阶段验证"全绿"但**未跑 `pnpm run test:coverage`** → 退回补验证
- **二次复发警告**：M13.3 T1308 新增 code-quality-fetcher.ts 等 4 个新文件未被既有测试覆盖（防御分支 cursor 重复死循环 / URL parse catch / RATE_LIMITED 兜底 / 三源错误隔离），CI Coverage 79.98% < 80% 二次失败（run 32880889750）
- **"基线已通过"陷阱**：当 4 维度整体 ≥ 80% 阈值但新增文件分支未被覆盖时，默认 80% 阈值即通过但漏了多包增量回归——必须**逐新增文件检查分支覆盖**
- **CI 通过 = 最终裁决**：本地通过 ≠ 完成；本地全绿 + lint 0 error + typecheck 0 error 不等于 CI 全绿（CI 含 coverage / lint:md / check:docs / docs:build 多步骤，盲区极大）
- **实证 commit**：`0c57211`（C65-D 12 commits 推送后 branches 79.88% < 80% 失败，补测 commit）+ `e63cdb9`（M13.3 T1308 补测 14 case，branches 79.98% → 80.17%）

规范见 [ai-collaboration.md §4.4 F 阶段本地验证口径差异 + coverage 强制（hard requirement）](../../../../docs/standards/ai-collaboration.md)。

### audit warning 修复决策协议（修复 vs 登记 backlog）必查项

审查 audit warning 必须明确决策路径，不得"已记录但未行动"或"修复 vs 登记"含糊：

- **必查场景**：Code Auditor 输出 warning（建议修复）或 suggest（优化建议）时，执行角色是否明确决策（修复 / 登记 backlog）+ 提供理由？
- **修复判定标准**：低成本（通常 < 1 行 + 注释）+ 对齐验收 / 正确性 + 不扩大 scope → 修复（如 C65-D2 W1 清理 test.fixme 残留 + C65-D3 suggest-1 D3 缩写注释清理 + C65-D4 W1+S1 清理 MOCK_DASHBOARD_STATS + dead mock + stale doc + describe 标题）
- **登记 backlog 判定标准**：实现成本过高（与已知问题耦合 / 依赖外部升级）/ 不在本次 PR 范围 → 登记（如 C65-D2 S1 PrimeVue 4 rowToggleButton 默认无 aria-expanded——Pass-through 不传 context，低成本 dynamic 实现不可行，登记待 PrimeVue 升级 / C65-D3 suggest-2 viewMode 快速切换请求竞态——低概率 UI 闪一下旧数据，可加 lastRequestId 守卫但本次 PR 范围外）
- **决策三问**：是否影响用户行为？是否与 todo.md 验收条款一致？实现成本？三问中任一不满足"低成本可修复"→ 登记 backlog
- **必查决策痕迹**：commit message / diff / follow-up 段是否含决策理由（避免后续 agent 重新判断）
- **suggest 登记前的最小复现**：把审计 suggest 写入 backlog / 规范 / 记录前，是否先做过一次最小复现验证（源码定位 + 一次实验），证伪的是否已撤回？未验证的 suggest 不得升格为候选或结论。

规范见 [ai-collaboration.md §4.6 audit warning 修复决策协议](../../../../docs/standards/ai-collaboration.md) + [code-reviewer SKILL.md §2.5 决策框架](../SKILL.md)。

### 运行时校验 vs 类型断言（必查项）

审查涉及数据解析、外部输入、跨进程通信的代码是否正确区分类型断言与运行时校验：

- **类型断言 ≠ 运行时校验**：`JSON.parse(x) as RunResult` 是类型断言，不做运行时校验。typecheck 通过 ≠ 数据合法，契约漂移只能靠运行时校验兜底
- **对外边界必须配套 validate 函数**：容器 stdout / 网络响应 / 跨进程数据等对外边界必须配套 `validate*()` 函数
- **典型风险**：外部 API 返回格式变更、容器输出异常、跨版本兼容性问题——类型断言无法捕获

规范见 [testing.md §2 测试设计原则](../../../../docs/standards/testing.md)。

### 容器拼装类代码注释准确性（必查项）

审查涉及 Docker 容器拼装、execFile / exec 调用的代码注释是否准确：

- **禁止不准确表述**：`execFile` 不经过 shell，不会回显 argv（与 `exec` 不同）；注释禁止写"防 argv 回显"等不准确表述
- **准确语义**：`spec.env` 隔离，避免 cmd/test 日志、git URL、daemon config 可见 token（凭据走 `http.extraheader` 等带外通道，与 argv 无关）
- **注释必须真实反映防御机制**：错把"防 argv 回显"当成威胁模型会导致后续审计按错误方向找漏洞

规范见 [engineering-practice-notes.md EP-06](../../../../docs/design/governance/engineering-practice-notes.md)。

### JSDoc 注释与可见性声明一致性（必查项）

审查新增/修改的 JSDoc 注释是否与可见性声明一致：

- **禁止自相矛盾**：`private` 方法 + JSDoc 写"导出便于 snapshot 测试"自相矛盾；若实际不导出，改注释或改 `public` / `internal`
- **拼装类函数应在测试中 snapshot 验证**：拼装 bug 在真起容器前难暴露，靠运行时回显只能发现一半问题
- **注释与实现脱节会被 audit 作为 warning 处置**

规范见 [engineering-practice-notes.md EP-07](../../../../docs/design/governance/engineering-practice-notes.md)。

### 测试 Spy 与生产实现同模块时 @internal 标注（必查项）

审查测试 Spy 模块是否正确标注 `@internal`：

- **必须 @internal 标注**：`SpyAdapter` 与生产 `Adapter` 同模块导出时，必须在 Spy 类上加 `@internal` JSDoc + 文件级注释"生产代码禁止导入"
- **避免业务模块误用 spy 路径**：会导致测试覆盖率虚高、运行时行为错位
- **强约束**：eslint `no-restricted-imports` 规则限制生产代码 import spy 路径是最稳护栏

规范见 [engineering-practice-notes.md EP-08](../../../../docs/design/governance/engineering-practice-notes.md)。

### 删除"自动状态赋值"时被动接收路径审查（必查项）

审查删除状态自动赋值逻辑时是否已审视所有被动接收路径：

- **必须搜遍所有被动接收路径**：删除状态自动赋值逻辑（如 `selectedRepos.value = ...filter(...)`）前，必须审视所有调用路径是否依赖该自动行为收敛
- **被动接收态风险**：成功提交后重新调用 `loadImportable()` 时，已删的自动赋值语句留下的旧状态会导致 UI 状态不一致
- **修复范式**：在 `emit('success')` 后 `await reload()` 前主动重置状态，让"删除"与"主动重置"形成完整闭环

规范见 [engineering-practice-notes.md EP-09](../../../../docs/design/governance/engineering-practice-notes.md)。

### 调试临时代码清理（必查项）

审查提交前是否已清理所有调试临时代码：

- **必须清理**：任何调试临时代码（`// DEBUG` 注释、`console.log('[debug]', ...)`、`// TODO` 未跟踪项、`alert(...)` 弹窗、`debugger` 语句）必须在 `conventional-committer` 提交前手动清理
- **不能依赖 lint**：`no-console` 等规则仅限服务端日志场景，无法拦截浏览器端调试输出
- **调试完成后立即清理不留痕**：`git diff --staged` 容易遗漏单行 `console.log`，养成实时清理习惯
- **范围扩展**：ui-validator agent 视觉验证时自建的截图脚本也属同类

规范见 [engineering-practice-notes.md EP-10](../../../../docs/design/governance/engineering-practice-notes.md)。

### TypeORM 实体时间列类型（必查项）

审查 TypeORM 实体中时间列是否正确使用 `getDateType()`：

- **必须通过 getDateType() 获取列类型**：实体中 `CreateDateColumn` / `UpdateDateColumn` / 日期字段统一 `{ type: getDateType() }`
- **禁止硬编码**：禁止在实体中硬编码 `'datetime'` / `'timestamp'` 字面量（PostgreSQL 部署会静默出现时区偏移，且单测难以覆盖）
- **跨库类型归一**：SQLite 下 `datetime` / MySQL 下 `datetime` / PG 下 `timestamp with time zone`——由 `getDateType()` 统一处理

规范见 [platform.md §3.2 时区与列类型](../../../../docs/standards/platform.md)。

### better-auth 四表字段对齐（必查项）

审查 TypeORM 实体中 better-auth 四表字段是否与默认 schema 对齐：

- **不得增删字段**：`user` / `session` / `account` / `verification` 四表字段对齐 better-auth 默认 schema，不得增删字段
- **平台自有字段通过 additionalFields 配置**：如 `role` 字段通过 `user.additionalFields` 配置并同步实体
- **违反后果**：字段不一致会导致 better-auth 插件功能异常或数据迁移问题

规范见 [platform.md §3.4 实体规范](../../../../docs/standards/platform.md)。

### 应提出的问题

- "diff 中新增的注释/测试名是否含孤立编号标记？"
- "编号是否带可反查的文档路径（导航指针例外）？"
- "清理编号后解释正文是否保留、语义是否完整？"
- "新增/改动发布包时，单点登记、publishable 语义、README、release.md、CI 引用是否同步？"
- "本次内部包依赖改动是否符合依赖方向（core ← engine ← {cli, mcp, platform}）？应用层（cli/mcp/platform）是否互相依赖？"
- "本次新增/修改的条款是否与权威文档重复抄写？应改为一行链接引用（治理定义改动必查）？"
- "新增的严格约束（必须/阈值/禁令）是否已声明并挂接 review 检查点？宽松指引是否留在执行层？"
- "涉及数据解析/外部输入/跨进程通信的代码，是否区分了类型断言与运行时校验？"
- "Docker 容器拼装代码的注释是否准确反映了防御机制（execFile vs exec）？"
- "JSDoc 注释是否与可见性声明一致？private 方法是否误写为'导出便于测试'？"
- "测试 Spy 模块是否已标注 @internal？生产代码是否可能误用 spy 路径？"
- "删除自动状态赋值逻辑前，是否已审视所有被动接收该状态的路径？"
- "提交前是否已清理所有调试临时代码（console.log / debugger / alert）？"
- "TypeORM 实体中时间列是否通过 getDateType() 获取列类型？是否硬编码了 'datetime' / 'timestamp'？"
- "better-auth 四表（user/session/account/verification）字段是否与默认 schema 对齐？是否误增删了字段？"

### 批量替换与行尾完整性（批量替换/行尾审查）

diff 包含大范围替换（脚本/正则批量改写、多文件机械变更）时，重点检查：

- **行尾噪音**：`git diff --ignore-space-at-eol` 与普通 diff 行数差异大 → 说明整文件行尾被翻转（混合行尾仓库常见），要求按行保留原行尾重做
- **代码误伤**：替换正则是否误删代码 token（空调用 `()`、方法名 `trim`/`toUpperCase` 后丢失括号、URL `https:// /` 出现空格）——注意 `typecheck` 不总能覆盖字符串/注释误伤
- **外链破坏**：涉及 URL 文本时检查是否出现 `https:// /`、`http://` 等畸形（check:docs 只查本地链接）
- **PowerShell 转义残留（必查）**：diff 疑似经 PowerShell 批量替换（`-replace`/`Replace`/`Set-Content` 产物）时，检查：① 字面量转义残留——扫描变更文件中的字面量 `\r?\n`（反斜杠形态）与"反引号 + n"字符序列，命中即退回（PowerShell 替换文本不做转义解释、单引号完全字面）；② 既有内容误伤——`git diff` 中非预期行（如已知条目内容被拆行/截断）须逐条核验，`String.Replace` 短序列全局替换会拆坏"反引号 + n"（如代码块中的 `npm_config_registry` 变 "换行 + pm_config_registry"）；③ **修复路径（与 [git.md §3.7.2](../../../../docs/standards/git.md) 一致）**：先备份（`cp` 或 `git diff > patch`），再以备份回写 / 反向 patch 还原到损坏前内容，随后用精确 edit 重新应用改动；**禁止**用 `git checkout -- <file>` / `git restore <file>` 还原（未提交工作区会整文件回退到 HEAD，抹掉本次实现），**不得**再用 PowerShell 批量替换"修复"替换造成的损坏。lint:md / check:docs / docs:build 均不检测文本语义，内容级验证（Node 字节抽查）由调用方补证（详见 [经验归档 §四十](../../../../docs/design/governance/experience-archive.md)）

规范见 [ai-collaboration.md §1.2 执行原则 6](../../../../docs/standards/ai-collaboration.md)，详见 [经验归档 §十七 / §四十](../../../../docs/design/governance/experience-archive.md)。

### 应提出的问题

- "该改动是否为批量替换？若是，行尾/URL/代码 token 是否被误伤？"
- "是否存在全文件行尾翻转（--ignore-space-at-eol 前后行数差异）？"
- "是否经 PowerShell 批量替换？字面量转义残留与既有内容误伤是否已排除？"

### 协议/枚举全集核对（防护正则/白名单审查）

防护性正则、协议/枚举白名单、允许列表等"拒绝/放行判定"代码，重点检查：

- **全集覆盖**：判定逻辑是否对照权威全集编写（npm-package-arg 的 gitProtocols、semver 规范、语言关键字表、官方文档枚举），还是只覆盖"已知场景"？漏网变体（如 `git+ssh:` 之外的 `git+http:`/`git+file:`/`gitlab:`/`bitbucket:`）会在真实仓库静默触发
- **不可逆操作前的最后防线**：凡"改写前判定"（如版本声明改写、文件写入、URL 拼接），漏判的后果是数据/声明永久损坏时，全集核对是强制项
- **同类扫描**：修复审计发现（正则漏项等）后，是否对同正则家族/同判定模式全量扫描（grep 同 pattern 的其他位置），避免"修一个漏一批"

规范见 [经验归档 §十八](../../../../docs/design/governance/experience-archive.md)。

### 应提出的问题

- "这个正则/枚举是否覆盖协议/值域全集？能否用权威清单（npm-package-arg、规范文档）补测试用例？"
- "漏判的后果是什么？如果是不可逆改写/数据损坏，全集核对是否到位？"
- "本次发现的漏项，同类变体是否已全量扫描？"

### 维度字段传播检查（聚合/指纹/去重/渲染消费方）

新增或扩展实体语义字段（如 `FixAction.filePath`、alert 新增维度）时，重点检查：

- **消费方清单**：该实体的全部消费点——聚合键、指纹/去重键、fixed/状态判定、报告渲染、PR body、归档——是否逐一核对过新维度是否需纳入？
- **同构键一致性**：聚合键与指纹键若口径不一致（如聚合含维度、指纹不含），会导致"报告可见但去重错误"的隐性不一致
- **默认值语义**：新维度缺省值（如 `?? 'root'`）在所有消费方语义一致，不产生碰撞（根 vs 成员同键合并）

规范见 [经验归档 §十九](../../../../docs/design/governance/experience-archive.md)。

### 应提出的问题

- "新增字段后，聚合/指纹/去重/fixed 判定/报告渲染各消费点是否都已核对？"
- "同实体多形态（根 vs 成员、多实例）在同键下是否会产生错误合并或错误 skip？"

---

## 供应链信任边界与外部技能引入（必查项）

改动引入新依赖、MCP server、外部 skill/agent，或依赖 AI 推荐的包时，检查来源可信与锁定：

- **幻觉包验证**: AI 推荐的包是否在官方 registry 真实存在（约 20% 不存在）？安装前查 npm / PyPI 官方页，警惕 typosquatting 拼写相近包
- **钉版本 + 锁文件**: 新增依赖是否锁定精确版本并提交锁文件（pnpm-lock.yaml 等）；GitHub Actions 是否钉不可变版本
- **外部技能/agent/MCP 先验来源**: 引入前是否核对来源仓库 URL 与维护组织（只装官方组织或自有仓库）？是否绕过"伪装成有用文档/技能"的诱导信任（TrustFall）
- **依赖审计进 CI**: pnpm audit 等依赖审计是否进入 CI 门禁（本地抽查不代替）

规范见 [security.md §5.2](../../../../docs/standards/security.md)。

### 应提出的问题

- "引入的包/工具/MCP/技能，来源仓库与维护组织是否已核验？"
- "AI 推荐的包是否确认在官方 registry 存在，而非拼写相近的 typosquatting 包？"
- "新依赖是否钉版本并提交锁文件？依赖审计是否在 CI 门禁内？"

---

## 修复执行安全基线（必查项）

改动涉及执行路径（Executor、验证 runner、安装参数、镜像配置、凭据传递、供应链披露）时，对照 [security.md §5.3 修复执行安全](../../../../docs/standards/security.md) 逐项核验（dependfix 自身不得成为漏洞扩散工具）：

- **非 root 执行**: 执行不可信代码的进程/容器是否以非 root 用户运行？容器是否挂载 `docker.sock` / 授予额外特权？
- **工作目录隔离**: 执行工作目录是否为独立临时目录（如 `runs/{runId}/`）且执行后清理？
- **超时兜底**: 新增命令/子进程是否自带单命令超时（不得依赖外层总超时兜底）？
- **保持 pnpm 默认脚本防护**: 是否扩大依赖 lifecycle scripts 执行面（保持仅 `allowBuilds`/`onlyBuiltDependencies` 批准包执行）？是否代目标仓库追加批准？
- **凭据最小化**: 平台密钥（`ENCRYPTION_KEY`/`AUTH_SECRET`）是否永不传入执行进程？凭据是否仅注入本次执行最小集合、解密仅执行时内存用后即弃？凭据是否走带外通道（`http.extraheader`）不进 argv/URL？错误消息、命令输出、报告日志是否脱敏？
- **权限面收敛**: 扫描不可信仓库（owner 模式、平台仓库管理）是否使用专用低权限 token？超权限 token（classic repo scope）是否启动即警告？
- **升级前研判**: 自动升级前是否完成 changelog/diff 研判（研判不可省略）？
- **供应链信号披露**: 本次新增/升级包带 lifecycle scripts 且被目标仓库批准时，是否进入报告/PR 警示区（含包名/脚本类型）？
- **结果白名单回传**: 执行进程是否仅回传结构化结果，不赋予自由输出执行能力？
- **资源与网络**: 执行环境是否具备资源上限（cgroup 配额）？执行期网络出站是否受限（出站白名单计划）或至少保留外联审计记录（当前防线）？新增执行路径/镜像配置是否绕过既有外联审计？
- **新执行后端威胁建模评审**: 新增执行后端（ExecutorKind）或改变执行边界（网络、文件系统、权限、并发形态）时，是否对照 [executor-sandbox.md 风险表](../../../../docs/design/governance/executor-sandbox.md) 逐项评估并记录缓解措施（评审通过方可实现）？

规范见 [security.md §5.3](../../../../docs/standards/security.md)，治理登记与验收见 [sandbox-security-governance.md](../../../../docs/design/governance/sandbox-security-governance.md)。

### 应提出的问题

- "本次改动是否触及执行路径？§5.3 十三条必须级条款是否逐项对照核验？"
- "新增执行后端或改变执行边界，威胁建模评审结论是否登记？"

---

## 业务数值合理性检查

修复涉及数值计算、类型转换、阈值判断或溢出处理的 Bug 时，先验证触发 Bug 的数据是否在合理业务范围内：

- **数据范围**: 触发 Bug 的输入（数值、时间戳、长度等）是否在合理业务范围内；异常数据是真实业务场景，还是历史遗留/脏数据/测试数据
- **根因归位**: 数据明显超出合理范围（如任务耗时 100 天）时，根因是否可能是数据问题而非代码问题
- **阈值兜底优先**: 修复是否用业务阈值兜底（如 `Math.min(value, max)`），而不是无条件扩大字段类型容纳异常值
- **历史数据清理**: 修复后是否需要清理历史异常数据

### 应提出的问题

- "这个数值在正常业务流程中可能出现吗？合理上限是多少？"
- "用'扩大类型范围'修复是否会掩盖更深层的数据生命周期问题？"

---

## 简化合理性检查

涉及主动简化（重构、压缩、去重、删除）时，检查简化是否合规：

- **决策梯子**: 先查重、再复用、最后新写——不重复实现已有 util / composable / service / 规范入口
- **简化标记**: 主动简化的实现是否使用 `// lean:` 注释标记
- **不可简化清单**: 简化是否触及"不可简化清单"（输入校验、鉴权、XSS 防护、SQL 注入防护、敏感信息脱敏、错误处理、国际化文本——见 [security.md §8](../../../../docs/standards/security.md)）
- **升级路径**: 简化是否留有升级路径（什么条件下该加回来）

### 应提出的问题

- "这次简化是复用现有能力，还是重复实现了已有逻辑？"
- "简化是否触及不可简化清单？若触及，是否属于违规删减？"
