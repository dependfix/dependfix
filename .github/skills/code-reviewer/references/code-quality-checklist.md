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

教训见 [经验归档 §二十五](../../../../docs/design/governance/experience-archive.md)（mcp 包遗漏 README/release 链路），规范见 [release.md](../../../../docs/guide/release.md)。

### CI 工作流类型解析完整性（必查项）

修改 `.github/workflows/*.yml` 或内部包依赖（package.json workspace 引用）时，检查 CI 各 job 的类型解析前提是否独立显式：

- **workspace 依赖包预构建**：lint/typecheck 前是否显式构建被 import 的 workspace 包（`pnpm --filter <dep> build`）？`pnpm i --frozen-lockfile` 不构建包；应用层（如 Nuxt platform）tsconfig 不映射 workspace 源码——`typescript.tsConfig.paths` 不合并、`alias` 指向 src 会把源码纳入 strict 编译上下文报错（两条路均不可靠），必须先构建 dist
- **job 独立环境**：coverage / test / lint / build 各自独立 runner，依赖生成产物（`.nuxt/tsconfig.json`、dist）的步骤是否在**该 job 内**显式准备？（test job 的 prepare 不继承给 coverage job——曾致 platform 测试 TSCONFIG_ERROR）
- **构建顺序**：多包预构建顺序是否与 Dockerfile 依赖图一致（core → engine → cli → platform）
- **新增内部包时**：新包的 src 是否需要加入根 tsconfig.json paths / vitest.config.ts alias（源码级解析，避免无 dist 时 "Failed to resolve entry"）

教训见 [经验归档 §二十七](../../../../docs/design/governance/experience-archive.md)（monorepo CI 类型解析链），规范见 [ai-collaboration.md §4.2](../../../../docs/standards/ai-collaboration.md)。

### TypeORM 实体复合索引声明（必查项）

修改 `apps/platform/server/entities/*.ts`（TypeORM 实体）时，检查复合索引声明位置：

- **复合索引必须类级**：多列 `@Index(['a','b','c'])` 声明在列上时，TypeORM 1.x 会错误生成**仅末列**的单列索引（实测 SQLite DDL `UNIQUE("platform")`，`owner/name/platform` 复合唯一失效 → 第二个同 platform 仓库插入必 500，单仓库场景永不暴露）
- **正确写法**：`@Entity('table')` + 类上方 `@Index(['a','b','c'], { unique: true })`
- **验证手段**：e2e 二次运行（连跑两遍 `test:e2e` 验证幂等）；或查 SQLite DDL（`SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='...'`）确认索引列集合
- **回归覆盖**：唯一约束语义是否被集成/回归测试覆盖（同键冲突报错 + 不同键共存）

教训见 [经验归档 §三十](../../../../docs/design/governance/experience-archive.md)（TypeORM 1.x 列级复合索引 bug，e2e 二次运行暴露）。

### docs 裸 HTML 标签与本地 docs:build 验证（必查项）

修改 `docs/` 站点内 md（含 experience-archive.md 等持续追加文档、归档转接）时，检查：

- **裸 `<tag>` 占位符**：正文/表格中 `<tag>` / `<file>` / `<hash>` 等是否反引号包裹（`` `<hash>` ``）——markdown 裸 `<tag>` 被当 raw HTML 透传进 Vue 模板 → docs build 报 `Element is missing end tag`；报错行号是**转换产物行号**，不能按源文件行号找（lint:md 与 check:links 均不查 HTML 配对）
- **加粗内裸 `*`**：`**...*.test.ts...**` 中裸 `*` 破坏强调解析（转换产物出现 `<em>` 嵌套错乱），须反引号包裹
- **本地 docs:build 证据**：`pnpm --filter dependfix-docs build` 是否已执行并提供通过证据？docs build 是唯一防线，缺失 → 退回补验证
- **排查命令**：`rg '<[a-z][a-z0-9-]*>'` 后人工过滤反引号内命中

规范见 [documentation.md §2 裸 HTML 标签禁令](../../../../docs/standards/documentation.md)，教训见 [经验归档 §三十九](../../../../docs/design/governance/experience-archive.md)（§三十三 `<path>` 后二次复现：登记 ≠ 防御，教训必须落成检查点）。

### Node 脚本 main 入口守卫（必查项）

新增/修改 `scripts/*.mjs` 或根目录可执行脚本时，检查：

- **入口守卫**：main 调用是否包裹 `if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)`？无守卫时 vitest import 模块即执行 main()（顶层副作用）
- **git 忽略文件依赖**：脚本/测试是否隐式依赖 `.session/`、`temp/` 等 git 忽略目录文件的存在性（本地有、CI 无 → 行为分叉）？依赖路径是否可注入或已模拟缺失场景验证
- **典型故障**：依赖缺失文件时 main() 内 `process.exit(0)` 被 vitest 拦截 → catch 再 `process.exit(1)` → `process.exit unexpectedly called` Unhandled Rejection，仅 CI 暴露

规范见 [development.md §5.1.5/§5.1.6](../../../../docs/standards/development.md)，教训见 [经验归档 §三十九](../../../../docs/design/governance/experience-archive.md)。

### 发布链路 tag 推送核验（必查项）

修改发布相关脚本/工作流（release.yml / changelog.mjs / release 脚本 / 手动发布文档）时，检查 tag 生命周期闭环：

- **创建与推送分离**：生成类步骤（release:publish）只保证本地创建 tag，是否配套显式推送步骤（`git push <url> --tags` 而非依赖 insteadOf 全局替换）
- **推送后核验**：推送步骤是否对比本地/远程 tag 集合（`git ls-remote` 缺失即报错）——CI 曾实测输出 `Everything up-to-date` 但 tag 未推送（run 31208208621，静默失败）
- **本地补打纪律**：手动补打 tag 后文档是否提示显式 `--tags` 推送 + followTags 建议（git 默认不推 tag）
- **判定多源兜底**：changelog 等"已发布"判定是否依赖 tag 单源——应有 npm registry 兜底（见 §二十五）

教训见 [经验归档 §二十六](../../../../docs/design/governance/experience-archive.md)（tag 创建与推送分离 + CI 推送静默失败），规范见 [release.md](../../../../docs/guide/release.md)。

### 包依赖约束（必查项）

改动内部包依赖（`packages/*/package.json` 的 dependencies，或新增内部包）时，检查依赖方向是否符合 [development.md §4 依赖约束](../../../../docs/standards/development.md)：

- **单向分层**：依赖方向 `core` ← `engine` ← `{cli, mcp, platform}`；禁止反向依赖与循环引用
- **应用层禁互相依赖**：`cli` / `mcp` / `platform` 之间不得互相依赖——mcp 曾依赖 cli（`dependfix`）导致应用层互相依赖 + 安装膨胀 + 版本耦合（engine 拆包教训，见 [todo.md](../../../../docs/plan/todo.md)「已完成任务：@dependfix/engine 拆包」）
- **共享能力下沉 engine**：应用层不得复制 engine 已导出的实现或直连 core 内部模块；缺导出先补 1 行导出
- **core 纯净**：`@dependfix/core` 不得新增 Node / 浏览器运行时环境依赖（tslib 等编译辅助除外）
- **skills 资源包**：`@dependfix/skills` 不引入运行时依赖，仅被 cli 消费

违规（如 `cli` 依赖 `mcp`、`core` 引入 Node API 依赖）→ `Reject` 退回修正。

### 规范单点声明（必查项）

改动涉及治理定义（`docs/standards/*.md`、`.github/skills/*/SKILL.md`、`.github/agents/*.agent.md`）时，检查新增/修改的条款是否存在与权威文档重复抄写：

- **权威声明唯一**：每条规则只在其职责归属的权威文档完整声明一次；其他文档 / skill / agent 定义只做一行链接引用（`见 [X 规范 §Y](./xxx.md)`），禁止重复抄写完整条款、阈值或教训
- **冲突裁定**：同一规则出现两处完整声明时，按事实源层次（documentation.md §4：L0 > L1 > L2 > L3）更高层为准，退回执行角色收敛为引用
- **执行层例外**：宽松指引（应当、建议）可在执行阶段（skill/agent）声明；严格约束（必须、阈值、禁令）不得在执行文档复制完整条款，只能引用

规范见 [documentation.md §4 规范单点声明原则](../../../../docs/standards/documentation.md)，教训见 [经验归档 §二十四](../../../../docs/design/governance/experience-archive.md)。

### 规范执行分层（严格约束须挂 review 检查点）

改动 `docs/standards/*.md`（新增/修改规范条款）时，检查新增条款的执行挂接：

- **分层判定**：条款是否明确区分"宽松指引"（应当、建议 → 执行阶段声明即可）与"严格约束"（必须、阈值、禁令 → 须挂 review 阶段检查点）？
- **挂接声明**：严格约束是否在规范文档中声明 review 挂钩（如 planning.md §1.1"合规核验由 review 阶段执行"句式）？
- **检查点落地**：是否已在 code-reviewer SKILL.md / 本 checklist / Code Auditor 必查项中实际存在对应检查点？缺失则要求补挂，或登记 backlog 并在本轮明确标记"待补挂"
- **反模式**：严格约束只写在执行文档（skill/agent）而未挂 review 检查点——执行阶段上下文杂、易跳过，review 阶段上下文干净才可强制

规范见 [documentation.md §4 规范单点声明原则](../../../../docs/standards/documentation.md)。

### 应提出的问题

- "diff 中新增的注释/测试名是否含孤立编号标记？"
- "编号是否带可反查的文档路径（导航指针例外）？"
- "清理编号后解释正文是否保留、语义是否完整？"
- "新增/改动发布包时，单点登记、publishable 语义、README、release.md、CI 引用是否同步？"
- "本次内部包依赖改动是否符合依赖方向（core ← engine ← {cli, mcp, platform}）？应用层（cli/mcp/platform）是否互相依赖？"
- "本次新增/修改的条款是否与权威文档重复抄写？应改为一行链接引用（治理定义改动必查）？"
- "新增的严格约束（必须/阈值/禁令）是否已声明并挂接 review 检查点？宽松指引是否留在执行层？"

### 批量替换与行尾完整性（批量替换/行尾审查）

diff 包含大范围替换（脚本/正则批量改写、多文件机械变更）时，重点检查：

- **行尾噪音**：`git diff --ignore-space-at-eol` 与普通 diff 行数差异大 → 说明整文件行尾被翻转（混合行尾仓库常见），要求按行保留原行尾重做
- **代码误伤**：替换正则是否误删代码 token（空调用 `()`、方法名 `trim`/`toUpperCase` 后丢失括号、URL `https:// /` 出现空格）——注意 `typecheck` 不总能覆盖字符串/注释误伤
- **外链破坏**：涉及 URL 文本时检查是否出现 `https:// /`、`http://` 等畸形（check-links 只查本地链接）

规范见 [ai-collaboration.md §1.2 执行原则 6](../../../../docs/standards/ai-collaboration.md)，教训见 [经验归档 §十七](../../../../docs/design/governance/experience-archive.md)。

### 应提出的问题

- "该改动是否为批量替换？若是，行尾/URL/代码 token 是否被误伤？"
- "是否存在全文件行尾翻转（--ignore-space-at-eol 前后行数差异）？"

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
