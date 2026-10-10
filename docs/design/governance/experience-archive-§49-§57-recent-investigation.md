# 经验归档分片（§四十九 - §六十八）：近期根因排查与归档沉淀

> 本分片从 [experience-archive.md](./experience-archive.md) 分流而出（章节编号全局唯一、跨文件稳定，外链按 `§编号` 命中）。**正文只写结论与落点**；过程叙事不写入本体系。

## 四十九、atomic commit 边界：重构支撑 vs 业务行为变更必须分 commit（2026-09-02，M22.4 commit `daa255c` audit Round 1 Reject）
### 教训

- 教训 1：提取 const 是**重构支撑**（不动计算逻辑），改 const 计算语义是**业务行为变更**——两者必须分 commit。
- 教训 2：commit message 必须清晰标识每条 commit 的"变更性质"（重构支撑 / 行为变更 / 文档更新），便于 audit 判断越界。
- 教训 3：默认值反转类改动必须单独 commit，便于回滚 + 文档同步 + 影响面独立评估。

- **落点**：development.md §5.1.20（atomic commit 边界）；.github/agents/code-auditor.agent.md 主责边界必查项；AGENTS.md §提交规范
## 五十、SQLite 数据库业务数据被清空：开发环境不可恢复事故（2026-09-01）
### 教训

1. **数据库启动期自动备份是 SQLite 单写者应用的最后防线**：一旦发生清空事故（任何来源），没有备份即无法回滚。better-sqlite3 单文件 SQLite 极简但脆弱，备份机制必须前置（启动期自动 + 用户命令式）。

2. **TypeORM 1.x synchronize 失败不会清空数据**（实测验证 `RdbmsSchemaBuilder` 事务回滚有效），但启动期错误让人误以为"数据库坏了"——区分"schema 同步失败"和"数据被清空"必须看 schema_version + freelist_count + 各表行数。

3. **`synchronize + migrationsRun` 是 TypeORM 反模式**：两者同开会导致 schema 状态不一致，迁移/重建逻辑相互干扰。规范做法是：开发用 synchronize（手动改 entity）+ migrations 准备生产部署；生产用 migrations + `migrationsRun=true`，**关闭 synchronize**。

4. **e2e/测试端点必须叠加 NODE_ENV 防御**：`E2E_TEST=true` 这种环境变量是单点失败防御，生产环境误设即暴露端点。`NODE_ENV === 'production'` 是兜底——任何破坏性端点都应该双门控。

5. **开发环境数据丢失也是事故**：即使不影响生产，但用户投入的种子数据、测试场景会被全部抹除，浪费排查时间 + 重置工作。启动期自动备份是低成本高价值的防御措施。

6. **不要用 `freelist_count=0` 推断"数据库从没数据"**：freelist=0 仅说明没有"删除后未 VACUUM"的页面。如果用户先 DELETE 再 VACUUM 或先 rm 再新建，freelist 也是 0。判断数据库历史需要看 `schema_version`（schema 演进计数）+ `journal_mode` + `user_version` + 各表行数 + `integrity_check` 综合判断。

7. **代码内找不到根因 ≠ 不存在根因**：本次事故穷举代码内所有可能的清空路径（synchronize / cleanupStaleRuns / fixtures.delete / backfill / dropSchema），均未发现清空逻辑。代码层面无法找到根因时，事故根因在代码外部（shell、CI、运维、人工误操作）的概率极高——但仍需通过防御加固（自动备份 + 显式 opt-in + 启动日志）来降低未来同类事故的恢复成本。

- **落点**：security.md §2.1（SQLite 保护）；development.md §5.1.18 / §5.1.19；platform.md §3.6 / §3.7
## 五十一、E2E global-setup 串行多次 setupPage 后首请求 ECONNRESET（2026-09-01，CI run 33525721103）
### 教训

1. **CI 偶发网络错误兜底模式**：test helper 涉及网络调用且 CI 偶发 ECONNRESET / ECONNREFUSED / ETIMEDOUT 时，**优先复用 Playwright `maxRetries` 选项**（内置 250ms 指数 backoff）；handler 不动、本地 / CI 行为等价。
2. **Playwright `maxRetries` 仅重试 `e.code === 'ECONNRESET'`**：JSDoc 注释必须精确描述（不要笼统写"重试网络层错误"），否则后续维护者误判覆盖范围。
3. **ECONNRESET 根因排查边界**：handler 逻辑 / 单元测试 / 本地复现均通过 → 根因必在 CI 独有环境组合（chromium 版本 × OS × 网络栈 × 异步时序窗口），无法本地稳定复现时**接受兜底修复 + 根因 backlog 分离**而非无限深挖。
4. **e2e fixtures helper 是测试代码，但仍是正式代码**：maxRetries 这种运行时行为改动仍需走 lint + typecheck + vitest + A 阶段 audit（quick depth）+ commit 完整流程。

- **落点**：ai-collaboration.md §4.7（CI 偶发错误三阶段协议）；testing.md §6.4（E2E 网络抗性）
## 五十二、Playwright test.use 存储状态传染：导致"未认证"API 测试收到 200（2026-09-02，CI run 33533376712）
### 教训

1. **Playwright 1.62 `test.use({ storageState })` 隐式传播**：`describe` 块内 `test.use({ storageState })` 配置可能通过 fixture pool 注入到该 scope 内所有 `browser.newContext()` 调用（包括未指定 storageState 的手动创建）—— 这是 Playwright fixture pool 的隐式行为，但**未在 Playwright 官方文档明确说明**
2. **"未认证 API 调用"测试必须显式空 storageState**：任何期望 401/403 的测试都必须传 `storageState: { cookies: [], origins: [] }`，避免上游 cookie 注入导致的认证通过问题
3. **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续测试的真实状态。M22.7 修复 global-setup 后才暴露 M22.8 真问题。**教训**：CI 修复需要走完整链路（global-setup → setup → tests → teardown），单一节点失败掩盖下游问题
4. **网络追踪是诊断关键**：trace.zip 中的 `context-options` + `network` 子文件包含完整 cookie / header / request 序列，是诊断"为什么认证通过"的唯一可靠证据

- **落点**：testing.md §6.4（未认证 API 调用标准模式）；code-auditor 主责边界必查项（集成外部库 + e2e 真实路径）
## 五十三、SQLite WAL 模式 + busy_timeout 治本 M22.7 ECONNRESET 根因候选 ③（2026-09-02，M23.1 commit `2ffaa45`）
### 教训

1. 教训 1：SQLite 默认 journal_mode = delete 不适合并发多连接场景；better-sqlite3 单进程应用 + Nuxt SSR + better-auth session + 60+ 处 API endpoint 共用 singleton 是典型并发场景，应启用 WAL + busy_timeout。
2. 教训 2：hot path idempotent 函数（ensureDatabaseInitialized 60+ 处调用）的 PRAGMA 应用需在 `ds.initialize()` 之后执行（连接已建立）+ 启动期日志确认 PRAGMA 生效状态。
3. 教训 3：ECONNRESET 在 CI 环境偶发且本地复现困难时，按 ROI 排序候选根因（P0 = 治本收益最大 + 风险最低）优先排查，避免"无限本地复现"陷阱（按 [ai-collaboration.md §4.7 CI 偶发错误三阶段协议](../../standards/ai-collaboration.md)）。
4. 教训 4：M22.7 hotfix helper 层 maxRetries 兜底保留不动（治本修复不替代兜底修复；helper 层 + 治本修复双管齐下，符合"应用层兜底 + 治本修复"模式）。

- **落点**：security.md §2.1（启动期 PRAGMA：WAL + busy_timeout）；platform.md §10.6 已知边界
## 五十四、Playwright 1.62 fixture pool 跨 scope 隐式行为源码实证 + M23.2 helper 抽取（2026-09-02，M23.2 commit `09c3dee`）
### 教训

1. 教训 1：见 §五十二 教训 1（fixture pool 跨 scope 隐式行为 + "未认证 API 测试必须显式空 storageState"）
2. 教训 2：见 §五十二 教训 3（CI 失败时序模式诊断 —— global-setup 失败 → 后续测试不运行 → 掩盖下游问题）
3. 教训 3（M23.2 阶段新增）：**helper 抽取需先 fixture pool 源码追溯明确"未认证 API 测试标准"再实施** —— 否则抽取的 helper 模式可能错误（如未含 `storageState: { cookies: [], origins: [] }` 强制清空即变成普通 newContext，治本失效）
4. 教训 4（M23.2 阶段新增）：**helper 抽取的边界确认** —— 至少 2 处重复使用且抽象边界稳定后抽取（应用经验 §十七"批量替换的误伤链正则清理必须限定上下文并验证"教训 —— 过早抽象 = 错误抽象风险）

- **落点**：testing.md §6.4（fixture pool 隐式行为 + 标准模式）；code-auditor 主责边界必查项
## 五十五、M23.3 C66-C 独立 Identifiers 列实施 + 标准 depth 审计 + todo.md stale 修正（2026-09-02）
### 教训

1. **教训 1（§3 编号标记扫描严格执行）**：注释与测试名中只允许带文档路径的导航例外（如 `todo.md §M23.3 C66-C`），孤立编号（如 `M23.3 C66-A2`）必须清理 —— D 阶段自检命中即清，不留完成时追补。本批实施 4 处孤立编号清理 + 4 处导航例外保留，rg grep 实证 0 命中。
2. **教训 2（§3b 替代路径）**：e2e 二轮验证 sandbox chromium 限制时，按 §3b 教训可走 SQLite DDL 源码实证替代路径 —— 直接读 migration 文件 `CREATE INDEX ... ON table (col1, col2)` + entity 类级 `@Index('name', ['col1', 'col2'])` 源码即可验证复合索引正确性，不必死磕 e2e 二次运行。
3. **教训 3（W1 audit finding：monorepo source-only 改动也需 rebuild workspace 包 dist）**：commit `b6e7716` 改 `packages/core/src/alerts/index.ts` 加字段未配套 rebuild dist → 本地 dev `pnpm run typecheck` 失败（apps/platform 引用 packages/core 缺 `ghsaId`/`cveIds` 属性，8 TS2339 error）。**根因**：CI `test.yml:36` 自动 rebuild 掩盖本地 dev 过期；本地 dev 不 rebuild → source/dist 不一致。**修复方向**（登记 follow-up，本批不扩大 scope）：① `pnpm run typecheck` 前置 `pnpm -r build` 到 husky pre-commit；② 或把 dist 加入 git tracking（移除 `.gitignore:38 dist`）。本批用 `pnpm -r build && pnpm run typecheck` 验证 7 包 Done，**W1 非本批引入**（git stash 实证），不阻塞提交。
4. **教训 4（todo.md stale 状态修正）**：M23.3 todo.md 验收清单把 C66-D（已在 M16.2 闭环）混入本批范围 + i18n "9 语言覆盖"声明与实际 2 语言现状不符（W3 + W4）—— 文档状态必须与 git 历史 + 实际 i18n locale 目录同步，**D 阶段开工前先 rg 实证依赖项实际状态**（避免基于 stale 描述定范围）。本批 todo.md 同步修订 5 处（W3 + W4 + 全部 [x] + commit hash 关联 + 范围段 i18n 描述）。
5. **教训 5（单调用方 helper 内联 reverse timing）**：`alertGhsaUrl` + `alertCveUrl` 在 alerts.vue 单调用方内联，符合 reverse timing 边界 —— grep 实证 0 外部调用。**未来复用场景触发再抽 utility**（dashboard 详情页 / 修复预览组件等），避免过早抽象风险（应用经验 §十七"批量替换的误伤链正则清理必须限定上下文并验证"教训 —— 过早抽象 = 错误抽象风险）。

- **落点**：AGENTS.md §提交规范（src/dist 不一致时 build 在先）；code-auditor 主责边界必查项；本分片（monorepo source-only 改动须 rebuild）
## 五十六、M24.1 PR Check 状态监测 MVP：5 phase 串行 + A 阶段 Reject 内联修复 + 6 atomic commits 闭环（2026-09-03，commits `36ee026 / 1068d6e / 89e1344 / e841b82 / 19037d5 / 4803372`）
### 教训（5 项）

1. **教训 1（D 阶段自检双向验证纪律）**：D 阶段自检不能仅依赖 `pnpm exec eslint --fix`（自动修复 + 警告压制），必须分别跑 `pnpm exec eslint` 无 --fix + `pnpm --filter @dependfix/platform run typecheck` + `pnpm exec vitest run` 三向验证。**根因**：vitest 用 esbuild 转译不触发 TS 严格检查，CI 通过 ≠ 本地 typecheck 通过（CI 自动 rebuild workspace dist 掩盖本地 dev 过期；M23.3 §五十五 教训 3 复盘）。**本批落地**：Phase 2 B1 + Phase 4 B1 都是 D 阶段自检覆盖盲区，强制加 D 阶段自检 checklist：`lint` 无 --fix + `nuxt typecheck` + `vitest` 三项独立命令 run。

2. **教训 2（i18n insert anchor 必须用目标 locale 文本）**：locale 文件多段对称（zh-CN.json + en-US.json），insert anchor 必须用**目标 locale 实际文本**（如 en-US 段必须用 `loadFailed: "Failed to load: {message}"` 英文 anchor）。**根因**：JSON.parse 容忍重复键 last-key-wins，anchor 错位导致后续段被改写但前端未触发 lint 检测（vitest 不读 i18n 字段语义）。**修复方向**：写 `scripts/i18n-anchor-check.mjs` 工具，D 阶段编辑 locale 文件后跑一遍 `rg` 验证 anchor 唯一性 + 对称性（en-US/zh-CN 段键集相同 + 文本不同属正常态；anchor 用错位文本属异常态）。

3. **教训 3（DataTable sort prop 是 `v-model:multi-sort-meta`）**：PrimeVue 4 DataTable 仅支持 `v-model:multi-sort-meta`（v-model 形式）；Vue 模板解析时未知 prop 被静默忽略，无运行时错误但也无功能效果（默认排序失效 + 用户点击列头排序无法持久）。**修复方向**（轻量）：tech radar 列表新增 PrimeVue 4 已知 prop 命名（`v-model:multi-sort-meta` / `v-model:filters` / `v-model:selection` 等）—— 防止 Phase 4 B2 类 silent ignore。

4. **教训 4（zod `.optional()` 陷阱）**：`z.enum([...]).optional()` 接受 undefined 为合法值（safeParse(undefined).success=true, data=undefined），但区分「未传字段」与「传 undefined」需显式 `data !== undefined` 判断。本批次 Phase 3 W2（dead code）+ Phase 2 W6（ack fixture acknowledgedAt 必须非空）都是该陷阱衍生物。**修复方向**（登记 follow-up）：写 `apps/platform/server/utils/zod-helpers.ts` 提供 `parseOptional<T>(schema, query, fieldName): { success: boolean, value?: T }` helper 强制语义区分。

5. **教训 5（en-US.json alerts 段被中文污染教训的反面案例）**：Phase 4 B1 是"i18n insert anchor 必须用目标 locale 文本"教训的实证 —— Phase 4 D 阶段 insert PRCheck 段到 en-US.json 时，anchor 用了 zh-CN 中文文本导致 en-US 段尾部 loadFailed 字段被改写为中文，**JS 解析通过 + 集成测试通过 + 视觉测试前无法发现**。**根因**：JSON.parse 容忍重复键 + 现有 localized-error.test.ts 的"键集对称"测试只检查键存在性不检查值的 locale。**修复方向**（登记 follow-up）：localized-error.test.ts 新增"值 locale 对称性"测试 —— 任意 code 在 zh-CN locale 取值不应等于 en-US locale 取值（"加载失败：{message}" ≠ "Failed to load: {message}" 是对称态；两者相等是错位污染）。

- **落点**：ai-collaboration.md §2.0（D 阶段自检三向验证）；git.md §3.6（commit message 信息密度）；本分片 §六十二
## 五十七、M22.7+M22.8 根因 4 项残留候选源码追溯：候选 ①/③ 已治本 + ② 非根因 + ④ 经验性方案登记 follow-up（2026-09-03，M24.2 阶段 docs-only）
### 教训（3 项）

1. **教训 1（better-auth 1.7 自动 patch fallback 不适用所有项目）**：better-auth 1.7.2 `getBaseAdapter` 在 adapter 不实现 transaction 时自动 patch `cb => cb(adapter)` fallback，logger warn 但**不阻断**业务运行。该 fallback 仅对未实现 transaction 的 adapter（如纯 in-memory adapter）生效，**有真实 transaction 实现的 adapter（如 typeorm-adapter.ts L237）走真事务路径**。**本批排查结论**：项目已走真事务，根因 ① 不适用。**修复方向**（登记 follow-up）：在 `getBaseAdapter` 加 `if (!adapter.transaction && !adapter.id) throw` 早期失败而非 warn 自动降 —— 但 better-auth 上游决策，改动依赖上游合作，本批仅记录。

2. **教训 2（async function vs async function\* 的运行时差异）**：`async (event) => {}` 与 `async function* (event) => {}` 在 h3 `defineEventHandler` 中行为差异是：前者返回 `Promise<value>`，后者返回 `AsyncGenerator<T>`（不可 await 自动迭代）。前者 h3 `await handler(event)` 解包 Promise；后者需显式 `for await...of` 迭代（如 `sendIterable`）。**根因排查误区**：单纯 grep `async function*` 看是否被识别为 generator；M22.7 hotfix 阶段排查时可能误判 fixtures.delete 为 generator（实际不是）。**本批实测**：fixtures.delete / fixtures.post handler 签名明确为 `async (event) => {}`，源码层面消除根因 ② 嫌疑。

3. **教训 3（依赖自动 fallback 是隐性技术债）**：better-auth 1.7.2 `adapter-base.mjs:18` 自动 patch fallback 是隐性技术债 —— 业务代码可能误以为有真事务保护（实际仅同步回调）。**未来风险**：若 better-auth 上游某版本改动 fallback 行为（如改为 throw），项目 typeorm-adapter 已实现 transaction 不受影响（适配实现逻辑优先于 fallback）；但若有其他未实现 transaction 的 adapter 引入，可能静默回退。**修复方向**（登记 follow-up）：写 `apps/platform/server/utils/__tests__/better-auth-adapter-transaction.test.ts` 单测验证项目 typeorm-adapter.transaction 是真事务（mock adapter + 验证 callback commit 时序），避免未来重构引入回退。

- **落点**：platform.md §4.2（adapter transaction）/ §6（handler 形态）/ §3.7.1（fixtures 节流）
## 五十八、M25.1 PrimeUI 商业 License 降级治理：`@primeuix/themes` 3.x → 2.x + `primeicons` 8.x → 7.x（2026-09-08，commits `35e4935 / 4c51d19 / 7ce7803`）
### 教训（3 项）

1. **教训 1（License 治理是治本 vs 临时的边界）**：消除 PrimeUI 商业 License 风险有 3 候选路径——(a) 申请 Commercial License（付费 + 年度续费 + 强制 license key）；(b) 扩展 `max-warnings` 临时方案（让 License 检查告警不阻塞 CI）；(c) 降级到 MIT 协议版本（v2/v7 仍为纯 MIT）。**本批选 (c) 治本**：依赖 4 个 PrimeUI 商业包中 2 个（@primeuix/themes + primeicons）降级到 MIT 版本；2 个（@primevue/themes-aura + primelocale）通过依赖结构调整避免（@primevue/nuxt-module 4.x 自动注入 themes-aura 但 @primeuix/themes v2 替代 aura preset；primelocale 2.5.0 是独立维护不触发 PrimeUI License）。**根因**：依赖 License 治理不在"加 disable 注释"或"扩展 max-warnings"范畴，必须从依赖链本身治本。

2. **教训 2（v8 → v7 跨主版本降级是图标 CSS 兼容性可逆路径）**：primeicons v7.0.0 → v8.0.0 是**图标 CSS class 命名 100% 兼容** + 新增图标 + License 协议变更的混合升级。本项目实际使用 30 个 icon class（grep `pi pi-[a-z-]+` apps/platform/app/ apps/platform/server/ 实证）在 v7.0.0 全部命中（`primeicons.css` 2077 行覆盖 230+ 图标）。**修复模式**：主版本降级前必须 ① 确认 v_latest-1 API 与 v_latest 兼容性；② grep 全仓库实际使用 API 范围；③ 在 v_latest-1 验证全部命中。**反向风险**：若 v7 缺关键图标则 pin v7.0.0 之前 minor 版本（已实测无需降 minor）。**M26.4a 验收**：30 个 icon class 7.0.0 primeicons.css 全部命中（commit message 显式列出），`pnpm --filter @dependfix/platform build` 0 error。

3. **教训 3（commit message 锚点错误传播）**：commit `4c51d19` message 标题写 `docs(standards): platform.md §3.7 主题引擎版本号 + 协议 + 降级时间戳同步`，但实际写入到 §1 技术选型表「主题」行——`docs/standards/platform.md` §3 段是「数据库规范」，不存在 §3.7。**根因**：作者写 commit message 时凭印象引用 §3.7（与 todo.md §M25.1 验收清单"§3.7 主题引擎版本号 + 协议 + 降级时间戳同步"误导一致——todo.md 同步时也引用错误）。**M26.4a 配套**：commit `7ce7803` 显式说明"todo.md §M26.4a 描述的 §3.7 实际不存在——上次 4c51d19 写到了 §1，延续同位置"，避免错误引用继续传播。**防御**：commit message 引用文档段时必须 `rg -n "^## " <目标文件>` 实证锚点真实存在（与 [规划规范 §4.4 anchor 实证](../../standards/planning.md) 一致）。

- **落点**：platform.md §1（技术选型，PrimeUI 已由 caomei-ui 取代）+ design/governance/caomei-ui-migration.md（后续治理路径）
## 五十九、M25.2a AI 研判集成基础层：三执行器同步透传 + 实体 + migration（2026-09-08，commits `1c65582 / f174cce / 7250ec1 / 49480a6`）
### 教训（4 项）

1. **教训 1（三执行器物理隔离下的同步透传模式）**：container-executor / sandbox-executor / github-action-executor 三个执行器分别走不同运行路径——container 走 Docker exec 调用（参数通过 `...ctx.config` 透传给 execFile），sandbox 走进程内 mock（参数通过 `process.env.DEPENDFIX_AI_*` 注入），action 走 GitHub workflow_dispatch（参数通过 `inputs` 字段透传）。**关键设计**：AI 参数透传必须三执行器**同步支持**——不能仅在某一执行器实现，否则用户用其他执行器时 AI 研判静默失效（无错误无警告）。**修复模式**：建立 `RuntimeConfig.ai` 单一 source of truth + 三个执行器分别实现 `toExecutorConfig()` / `toSandboxEnv()` / `toActionInputs()` 适配方法。**M25.2a 实证**：`scan-orchestrator.ts` 单一 `resolveAiConfig(ctx)` helper + 三个执行器 adapter 调用，避免散落。

2. **教训 2（Schema 扩展的向后兼容约束）**：`ScanRequest` Zod schema 加 4 字段（`aiProvider` / `aiModel` / `aiBaseUrl` / `aiEnabled` / `aiTrigger`）必须保持向后兼容——已存在的 scan 调用方不传这 4 字段时仍走默认路径（aiEnabled=false）。**修复模式**：Zod schema 用 `.default()` 显式声明默认值而非 `.optional()`——前者自动填充，后者需要运行时 `?? defaultValue` 兜底。**M25.2a 实证**：`aiEnabled: z.boolean().default(false)` + `aiTrigger: z.enum(['on-violation', 'on-demand', 'both']).default('both')`，零迁移成本。

3. **教训 3（entity `@Index` 必须在类级声明）**：TypeORM 1.x 列级 `@Index(['col1', 'col2'])` 实际只生成单列索引（不是复合索引）——e2e 二次运行暴露第二个仓库 500 错误。**本批 D 阶段自检 §3b**：新增/修改 `apps/platform/server/entities/*.ts` 时，复合索引必须声明在类级——`@Index('idx_name', ['col1', 'col2'], { unique: true })` 形式。**M25.2a 实证**：`Repository` 实体加 `@Index('idx_repository_ai_enabled', ['aiEnabled'])` + `Organization` 实体加 `@Index('idx_organization_ai_provider', ['aiProvider'])` 全部类级。教训见 [经验归档 §五十五 W1](../../design/governance/experience-archive-§49-§57-recent-investigation.md#五十五m233-c66-c-独立-identifiers-列实施--标准-depth-审计--todomd-stale-修正2026-09-02)。

4. **教训 4（`void` union 触发 `no-invalid-void-type`）**：`Promise<{ ... } | void>` 触发 `@typescript-eslint/no-invalid-void-type` 警告——`void` 不允许作为联合类型成分，TypeScript 推荐 `undefined`。**本批 commit `49480a6` 实证**：`apps/platform/server/entities/ai-config.test.ts:56` `Promise<{ ... } | void>` → `Promise<{ ... } | undefined>`。**M26.4b commit 2 同步**：`auth-self-guard.test.ts:56` 同样模式同步修复。**根因**：ESLint `@typescript-eslint/no-invalid-void-type` 规则在 `void` 出现于 union 类型时报错——`void` 在 TypeScript 中是"无返回值"语义，不应作为类型位置。**修复模式**：函数可能无返回值时用 `T | undefined` 而非 `T | void`。

- **落点**：经验归档 §五十五 W1
## 六十、M25.3 baseline lint 治理：`@typescript-eslint/no-unused-expressions` + `no-meaningless-void-operator` 双重禁止的治本路径（2026-09-08，commits `57f3b88 / 4030f3b`）
### 教训（3 项）

1. **教训 1（ESLint autofix 陷阱：仅依赖 `--fix` 会掩盖压制）**：本批 `pnpm --filter @dependfix/platform lint` 命令含 `--fix` 参数，会自动修复可修复的 warning——但**自动修复有时会引入新问题**（如 `import` 重排导致不期望的 import 顺序）。**修复模式**：D 阶段自检必须三向独立命令（`pnpm exec eslint` 无 `--fix` + `pnpm --filter @dependfix/platform run typecheck` + `pnpm exec vitest run`）——仅依赖 `--fix` 模式会掩盖 lint 警告压制。教训见 [经验归档 §五十六 教训 1](../../design/governance/experience-archive-§49-§57-recent-investigation.md#五十六m241-pr-check-状态监测-mvp5-phase-串行--a-阶段-reject-内联修复--6-atomic-commits-闭环2026-09-03commits)（M24.1 阶段实证 + 已挂 [ai-collaboration.md §2.0 D 阶段自检三向验证纪律](../../standards/ai-collaboration.md#20-d-阶段自检三向验证纪律)）。

2. **教训 2（删除占位符 vs 改写为 `void X` 的治本决策）**：`void X` 双重禁止（`no-unused-expressions` + `no-meaningless-void-operator`）的修复必须选择**删除占位符**（方向 A）而非**改写为 `void X`**（方向 B）——后者与 `no-meaningless-void-operator` 规则冲突。**关键判定**：`void X` 的"显式表达未使用"语义可以用 ESLint 注释 `// eslint-disable-next-line @typescript-eslint/no-unused-expressions` 抑制，但本项目不采用抑制（与 [规划规范 §4.4 治本 vs 临时](../../standards/planning.md) 一致）。**M25.3 实证**：16 errors 中 12 个 `void X` 直接删除，4 个 `condition && doSomething()` 改写为 `if` 块，0 个使用 eslint-disable 抑制。

3. **教训 3（lint baseline 治理 vs 扩展 `max-warnings` 临时方案）**：`max-warnings` 默认 10 是 CI 触发临界值。本批 baseline 9 warnings（M25.3 闭环后）未超临界值，但 M26.1 实施期间新增 13 warnings（9 await-thenable + 2 未用 import + 2 scan-result-ddl TypeORM deprecated）累计 22 warnings，超临界值。**M26.4b 实证**：22 → 0 warnings 全部治本（不扩展 `max-warnings` 临时方案）。**决策依据**：扩展 `max-warnings` 是"接受错误"临时方案，违反治本原则；CI 触发 ESLint 临界值是"信号"而非"阈值调整"——治理方向是"清空 warnings"而非"提高阈值"。

- **落点**：经验归档 §五十六 教训 1
## 六十一、M25.4 i18n-anchor-check 工具化：locale 文件 insert anchor 错位污染检测 + zod `.optional()` 陷阱 helper（2026-09-08，commits `80912c2 / 65a8ec1`）
### 教训（4 项）

1. **教训 1（locale 文件 insert anchor 必须用目标 locale 文本）**：M24.1 Phase 4 B1 教训工具化——i18n-anchor-check 脚本必须**双向**检测（en-US → zh-CN + zh-CN → en-US），覆盖"M24.1 Phase 4 B1 模式"（用错位 locale 文本作 anchor）+"反 M24.1 模式"（同一字段双 locale 文本相同 = 错位污染）。**根因**：JSON.parse 容忍重复键 last-key-wins + 现有 localized-error.test.ts 的"键集对称"测试只检查键存在性不检查值的 locale。**M25.4 实证**：anchor-check 脚本包含"键集对称性" + "anchor locale 匹配" + "值 locale 区分度" 3 维度检查，31 个单测覆盖正常态 + 异常态 + 边界态。

2. **教训 2（zod `.optional()` 陷阱的 helper 化）**：`z.enum([...]).optional()` 接受 undefined 为合法值（safeParse(undefined).success=true, data=undefined），但区分「未传字段」与「传 undefined」需显式 `data !== undefined` 判断——本项目 M24.1 Phase 3 W2 实证（`alertFiring` 简化注释保留 `!== undefined`）+ M24.1 Phase 2 W6 实证（ack fixture `acknowledgedAt` 必须非空）。**修复模式**：`parseOptional<T>(schema, query, fieldName)` helper 统一三态语义（`{ success: true, value: T | undefined, isProvided: boolean }`），消除"是不是 undefined = 是不是未传"的判断歧义。**M25.4 实证**：8 个单测覆盖三态语义边界 + 应用替换 2 处。

3. **教训 3（CI 集成测试步骤必须包含 anchor-check）**：anchor-check 是"locale 文件"专项检查，与 `check:docs` 互补——`check:docs` 不查 i18n locale 文本；`lint:md` 不查 JSON 锚点。**M25.4 实证**：`scripts/ci-prebuild.mjs` 链入 anchor-check + GitHub Actions test job step 9 跑 `pnpm run i18n:anchor-check`——本批 CI 步骤新增不破坏现有 `check:docs` / `lint:md` / `typecheck` 链路。**教训关联**：与 [经验归档 §五十六 教训 2](../../design/governance/experience-archive-§49-§57-recent-investigation.md#五十六m241-pr-check-状态监测-mvp5-phase-串行--a-阶段-reject-内联修复--6-atomic-commits-闭环2026-09-03commits) 一致（"locale 错位污染教训"工具化）。

4. **教训 4（链接锚点 slug 实证 + 修正）**：M25.4 commit `3947279` 实证——`docs/plan/todo.md §M25.4` 引用 [经验归档 §五十六](../../design/governance/experience-archive-§49-§57-recent-investigation.md) 时，锚点 slug 写 `#五十六m241-pr-check-状态监测-mvp`（基于"印象"猜测），但 §五十六 实际锚点 slug 是 `#五十六m241-pr-check-状态监测-mvp5-phase-串行--a-阶段-reject-内联修复--6-atomic-commits-闭环2026-09-03commits`（含完整标题）。**根因**：check-docs.mjs 是兜底而非首选——写 markdown 链接前应 `rg -n "^## " <目标文件>` 实证锚点真实形式（与 [规划规范 §4.4 anchor 实证](../../standards/planning.md) 一致）。**M25.4 实证**：commit `3947279` 修正锚点 + commit message 显式说明"通过 `rg -n "^## " docs/design/governance/experience-archive-§49-§57-recent-investigation.md` 实证 §五十六 真实锚点 slug"。

- **落点**：i18n.md §3.X（locale insert anchor）；testing.md §6（zod parseOptional 三态）；scripts/i18n/i18n-anchor-check.mjs（L1，CI step 9）
## 六十二、M25 → 当前 commit 25 commits 文档治理批次：规范精简 + experience-archive 分片 + dependabot 拦截 + §1.4 内部一致性（2026-09-09，ahead commits 25）
### 教训（4 项）

1. **教训 1（规范内部一致性核验）**：M25 阶段触发 `ai-collaboration.md §1.4` 内部一致性修正（commit `9bf640c`）——`docs/standards/ai-collaboration.md §1.4` + `AGENTS.md §新需求处理原则` + `docs/standards/planning.md §3.1` 三处对新需求处理原则（默认 backlog 评估 + 插队例外清单 3 类）描述必须保持一致。**根因**：规范在不同阶段（M0 基础规范建立 + M15 增强 + M24 拆分）多次修改，跨文档同步不彻底。**修复模式**：(a) 规范修改前先 `rg -n "新需求.*处理原则" docs/standards/ docs/standards/ai-collaboration.md AGENTS.md docs/standards/planning.md` 实证所有相关描述；(b) 修改后 `pnpm run check:docs` 验证链接 + `rg -n` 交叉验证措辞一致；(c) 关键原则（hard requirement / 插队例外）必须 3 处同步 + commit message 显式说明"3 处同步落地"。**wisdom 蒸馏**：原则 `principle-specification-internal-consistency`（M25 P 阶段新增）→ 挂 [ai-collaboration.md §1.4](../../standards/ai-collaboration.md) / [planning.md §1.1](../../standards/planning.md)。

2. **教训 2（baseline lint 治理 "治本 vs 删除" 决策）**：M25.3 阶段决策实证——baseline 16 errors 全部"删除占位符"治本（不留 `void X` + 不用 eslint-disable 抑制 + 不扩展 max-warnings），与 M22.6 §五十五 monorepo rebuild + M23.3 typecheck 实证构成"治本 vs 临时"原则的 3 次验证。**关键边界**：`max-warnings` 临时方案只在"无法立即修复"场景使用（如依赖链上游 bug 待修复），本项目 baseline lint 错误/警告均属"项目自身代码可立即修复"范畴——必须治本。**wisdom 蒸馏**：原则 `principle-baseline-lint-error-形式 vs 删除 占位符决策`（M25.3 沉淀）→ 挂 [development.md §5.1.x](../../standards/development.md)。

3. **教训 3（大批量文档治理批次的 4 子条款）**：本批 25 commits 涉及多个文档归档 / 跨文件引用 / 相对路径变更，必须严格执行 [规划规范 §4.4 大批量归档批次操作规范](../../standards/planning.md#44-大批量归档批次操作规范) 4 子条款：(a) **anchor 实证**——写 markdown 链接前 `rg -n "^## " <目标文件>` 确认锚点真实形式（避免凭印象写错）；(b) **跨文件外链主动追踪**——段删除前 `rg -n "<删除段标题>"` 全仓库扫描所有外链；(c) **跨目录相对路径精确**——从 `docs/<dir1>/` 引用 `docs/<dir2>/` 需 `../<dir2>/`，多级目录按 `../../` 累加；(d) **commit 分组追踪**——归档文案分组前先列每个 commit 归属，避免子批次 commit 与"收口 commit"重复计数。本批 commit `3947279` 实证教训 4——`docs/plan/todo.md §M25.4` 引用 [经验归档 §五十六](../../design/governance/experience-archive-§49-§57-recent-investigation.md) 时锚点 slug 写错，`rg -n "^## " <目标文件>` 实证修正。

4. **教训 4（commit message 锚点错误传播与纠正）**：commit `4c51d19` message 标题写 `docs(standards): platform.md §3.7 主题引擎版本号 + 协议 + 降级时间戳同步`，实际写入到 §1 技术选型表——`docs/standards/platform.md` §3 段是「数据库规范」，不存在 §3.7。**根因链**：作者写 commit message 时凭印象引用 §3.7（与 todo.md §M25.1 验收清单"§3.7 主题引擎版本号 + 协议 + 降级时间戳同步"误导一致）。**M26.4a 配套**：commit `7ce7803` 显式说明"todo.md §M26.4a 描述的 §3.7 实际不存在——上次 4c51d19 写到了 §1，延续同位置"，避免错误引用继续传播。**防御**：(a) commit message 引用文档段时 `rg -n "^## " <目标文件>` 实证锚点真实存在；(b) todo.md 验收清单引用文档段时同步实证；(c) 错误引用在后续 commit 中显式纠正 + commit message 注明"修正 NNN 引用"。

- **落点**：规划规范 §4.4 大批量归档批次操作规范
## 六十三、M26 阶段 git config user 错位事故与防护（2026-09-09）

### 教训

1. **git config 优先级 local > global > system 静默覆盖**——pre-commit guard 是必要防护
2. **commit 不可批量修改 author**——`git commit --amend --author` 只能改最后 1 个，批量改需 `git rebase -i HEAD~N --exec`（风险高）
3. **identity 错位只能事后发现**——session 启动时第一件事 `git log -1 --format="%an <%ae>"` + 预期 author 对比

- **落点**：`.husky/pre-commit-identity-guard.sh`；docs/standards/development.md §5.1.23
## 六十四、M27.1 C66 告警视图增强 重复评估教训：阶段启动决策时未对照"已闭环清单"导致规划无效工作（2026-09-10，commit `0ddd4e2` 决策 D2 错误）

### 教训（5 项）

1. **教训 1（阶段启动决策必须对照"已闭环清单"三重交叉核验）**：M27.1 重复评估根本原因是 commit `0ddd4e2` 决策 D2 未做"已闭环检查"——决策 backlog 候选时必须三重交叉核验：(a) `todo-archive.md §当前 + 历史阶段表格` + (b) `git log <候选相关路径>` + (c) **实际打开候选相关代码文件验证现状**。三项中任意一项均可发现 C66-C / C66-D 已闭环。**fix 模式**：(a) 决策 D 阶段前用 `git log --oneline -- <相关路径>` 5 分钟实证；(b) `rg -n "已闭环|不计入本批" docs/plan/todo-archive.md` 扫描已 ahead=0 闭环条目；(c) 对每个候选都打开实际代码 1 分钟确认状态。**wisdom 蒸馏**：新增 principle `principle-stage-launch-must-cross-verify-recent-archive` → 挂 [planning.md §3.4 决策前置交叉核验硬要求](../../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估问题--2026-09-10) + [ai-collaboration.md §1.7 阶段启动重复评估自检流程（PDTFC+ P 阶段必经）](../../standards/ai-collaboration.md#17-阶段启动重复评估自检流程pdtfc-p-阶段必经--m271-重复评估问题)。

2. **教训 2（backlog 描述与实际状态漂移治理）**：backlog.md C66 L143「保留为后续增强候选」+ L144 无明确闭环标注 = 描述与实际状态漂移。**fix 模式**：backlog 候选每次被上收至 todo.md §当前阶段时，必须同步：(a) backlog 候选描述追加"已闭环子任务"明确标注（✅ A1/A2/C/D 已闭环 ahead=0 推 origin/master + ⏸️ B 暂缓）；(b) 关联 commit hash 回填；(c) 「保留为后续增强候选」措辞必须基于"当前未落地"前提，否则删除。本批已修订 backlog.md C66 5 子任务状态标注。**wisdom 蒸馏**：新增 pattern `pattern-backlog-state-must-sync-with-archive-table`。

3. **教训 3（"参考 M16.2 实施"自相矛盾 = 决策者未厘清前提）**：commit `0ddd4e2` D2 决策描述「参考 M16.2 实施：useFixNow composable + alert-run-sidebar 按钮 + alerts-fix-now.e2e.test.ts 6 case + audit」——若 M16.2 仅"参考实施"则 C66-D 未落地，若 M16.2 已 100% 落地则 C66-D 不需 M27.1 增强。（注：本批修订实测 alerts-fix-now.e2e.test.ts 实际 3 case 非 6 case——D2 描述本身 stale；按 W1 audit 警告补修）**fix 模式**：决策描述中出现"参考 NNN 实施"时必须先验证 NNN 是否已落地（`git log --grep="NNN"` + `rg -n "NNN" docs/plan/todo-archive.md` 5 分钟内可验证）；决策前提矛盾必须先厘清才能进入下一步。

4. **教训 4（决策时"代码侧 anchor 实证"是 hard requirement）**：M27.1 决策时仅读 todo-archive.md / backlog.md 文档侧资料，未实际打开 alerts.vue / use-fix-now.ts / scan.post.ts 验证。**fix 模式**：决策 D 阶段必须做"代码侧 anchor 实证"——`cat <候选相关文件>` 或 `grep -n "<候选特征字段>" <候选相关文件>` 验证候选是否已落地；这是 [规划规范 §4.4 大批量归档批次操作规范 §1 anchor 实证](../../standards/planning.md#44-大批量归档批次操作规范) 的延伸应用（不仅 commit 时，决策时也需 anchor 实证）。**wisdom 蒸馏**：新增 principle `principle-decision-must-do-code-side-anchor-verification`。

5. **教训 5（重复评估类错误的 code-auditor 主责边界扩展）**：原 `code-auditor` agent 主责边界仅包含「新需求未默认升级为下一阶段 todo」必查项；本次重复评估错误（M27.1 任务段基于错误前提设计）不属于"新需求默认升级"范畴——属于"已闭环候选被错误纳入当前阶段 todo"。**fix 模式**：扩展 `code-auditor` agent 主责边界 → 新增「阶段启动重复评估自检」必查项——当 todo.md §当前阶段新增条目涉及 backlog 候选时，必须验证该候选对应 backlog 条目描述与 todo-archive.md 历史阶段表格 / commit history / 实际代码状态三者一致；若发现不一致必须 Reject 退回。

- **落点**：.github/agents/code-auditor.agent.md
## 六十五、M30 归档批次经验沉淀

> 2026-09-28 M30 归档批次。本阶段为治理债清理 + UI 组件库迁移可行性验证（caomei-ui 0.3.0），衍生暴露工具链 / 测试架构 / 提交态自洽三类教训。

### 教训摘要

1. **tsdown `hash:false` 产物错位**：多 entry 与共享 dts chunk 争名 `index.d.mts`，下游解析错位 → chunk 隔离到 `chunks/`。
2. **pnpm 11 `allowBuilds` 严格校验**：未赋值占位串被视为非法值阻断安装 → 显式赋值。
3. **ESM 模块 mock 受限**：命名导出无法 `vi.spyOn` → 可注入依赖 / 进程级隔离，不得静默 skip 或写恒真断言。
4. **提交态自洽**：支撑文件必须与修复点同 commit 入库；审计以提交态而非工作区为准。

### 案例一：tsdown `hash:false` 下 entry 与共享 dts chunk 同名冲突（commit `644f9f0`）

- **现象**：接入 `caomei-ui@0.3.0` 后 `apps/platform` 对 `@dependfix/engine` 的导入报 TS2305（无导出成员），而 engine 单包 typecheck 通过。 **根因**：engine 多 entry（`index` + `auth`）构建，tsdown `hash:false` 时 entry 与共享 dts chunk 争用 `index.d.mts`，入口声明被挤出 `index2.d.mts`；`package.json#types` 指向 `index.d.mts` → 下游解析到错位产物。
- **修法**：`outputOptions.chunkFileNames` 把 chunk 统一隔离到 `chunks/` 子目录，entry 名保持稳定；chunk 名解析用 `chunk.name.slice(0, -2)` 而非占位符（规避 tsdown 升级回归）。
- **沉淀**：[development.md §5.1.26](../../standards/development.md)（规范）+ [backlog.md §已知边界](../../plan/backlog.md)（`core` / `cli` / `mcp` 同类潜在风险持续观察）。

### 案例二：pnpm 11 `allowBuilds` 未赋值占位串阻断安装（commit `124078a`）

- **现象**：`caomei-ui@0.3.0` 依赖链引入 `vue-demi`（需 postinstall 切换 Vue3 产物），`pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS`。 **根因**：`pnpm-workspace.yaml` 的 `allowBuilds` 条目存在未赋值的占位串，pnpm 11 严格校验后阻断安装前依赖校验链路。
- **修法**：显式赋值 `vue-demi`（及其他占位项）为确定值。
- **启示**：占位串在 pnpm 11 下不再是"未配置"语义而是非法值；新增构建脚本依赖时必须同步 `allowBuilds`（pnpm 大版本迁移时复核）。

### 案例三：ESM 模块 mock 受限导致失败分支无法覆盖（commit `80dff3f`，M30.5）

- **现象**：`db-restore` 两条失败分支（恢复后 `integrity_check` 失败注入 / sidecar `unlinkSync` 部分失败状态一致性）无法测试。 **根因**：Vitest `vi.spyOn(fs, 'unlinkSync')` 对 ESM 命名导出无效；被测模块内部调用无法直接注入失败。
- **处理**：两分支 `it.skip` + TODO 理由 + 残留登记 backlog C90（不静默 skip，也不写恒真断言）。
- **沉淀**：[testing.md §6.6](../../standards/testing.md)（ESM mock 受限处理原则）。

### 案例四：提交态自洽（M29.7 教训，本批蒸馏）

- **现象**：M29.7 修复 commit 只含 4 文件，`disabled` 透传 + i18n key 留在工作区未暂存 → 提交态运行时半失效；A 阶段审计 RG-B3 判定"支撑文件未入库" Reject。
- **修法**：`git commit` / `--amend` 前 `git status` 核对全部关联文件已暂存；审计以「提交态自洽」而非「工作区自洽」为准。
- **沉淀**：[git.md §3.7](../../standards/git.md)（规范）+ code-auditor 主责边界必查项。

- **落点**：git.md §3.7；development.md §5.1.26；development.md §5.1.24；development.md §5.1.25；testing.md §6.5；testing.md §6.6；planning.md §2.5；planning.md §4.4 第 13 条
## 六十六、M36 归档批次经验沉淀（运行时 / 部署 / 并发写 / 三态判定 / e2e cookie）

> 2026-10-05 M36 归档批次。本阶段为 M36 队列 / 迁移 / 启动引导 / 并发写 / e2e 治理闭环，衍生暴露运行时部署、并发终态写、多源判定与测试时序四类教训。

### 案例一：队列 `auto` 模式缺「消费者维度」形成静默黑洞

- **现象**：Redis 可用即异步的降级矩阵下，job 入队后无人消费 → pending 永远挂起 → stale cleanup 约 30 分钟后判 `orphan_run`，重触发被 BullMQ 去重键合并为 `SCAN_PENDING_MERGED`。 **根因**：降级矩阵只判「Redis 可用」，未判「是否存在消费者」。
- **修法**：`auto` 仅在「Redis 可用且本进程消费队列（`inProcessWorker`）」时异步，否则降级 `sync`；独立 worker 进程未实现时 `inProcessWorker=false` 无合法消费者。
- **沉淀**：[platform.md §10.4](../../standards/platform.md#104-队列模式自动降级必须含消费者维度)。

### 案例二：镜像自足性优先于部署侧 env + runtime 只含 `.output`

- **现象**：仅改 compose 默认值时，用户沿用旧 compose / 直接 `docker run` 仍 `no such table`（插件已执行但 `migrationsRun=false`）；runtime 阶段额外复制根 `node_modules` + workspace dist 曾使镜像达约 1.1GB。
- **修法**：关键启动默认值用 Dockerfile runtime `ENV` 固化 + 发布前对真实镜像跑首启冒烟（不注入 env）作为推送门禁 + 空库未开迁移时启动告警；runtime 阶段只 `COPY .output`（Nitro trace 自包含，engine 打包进 `.output/server/chunks`），移除后约 239MB。
- **沉淀**：[platform.md §10.1 / §10.2](../../standards/platform.md#101-镜像自足性优先于部署侧-env)。

### 案例三：Nitro 插件不阻塞监听 + 迁移专用模式退出语义

- **现象**：`defineNitroPlugin(() => { void asyncInit() })` 不 await，`Listening on …` 早于初始化完成；一次性容器 `.catch` 未按 env 补 `process.exit(1)` 时遇异常挂起而非失败退出。
- **修法**：启动引导注释说明与首次请求共享 single-flight promise，不写「对外服务前就绪」；`DEPENDFIX_MIGRATIONS_ONLY=true` 的 `.catch` 补 `process.exit(1)`。
- **沉淀**：[platform.md §10.3](../../standards/platform.md#103-nitro-插件不阻塞监听启动引导语义)。

### 案例四：TypeORM 基线迁移自举（`Table.create` 不含外键）

- **现象**：全新空库无法通过既有增量迁移链建基表，首个 `ALTER TABLE` 报 `no such table`。 **根因**：`Table.create(metadata, driver)` 不含外键；SQLite `createForeignKeys` 会重建整表。
- **修法**：对 `metadata.foreignKeys` 逐个 `TableForeignKey.create` 后 `addForeignKey`，再 `createTable(..., true, true, true)` 内联 FK；按 `referencedEntityMetadata` 拓扑排序；`hasTable` 整表跳过保证幂等。
- **沉淀**：[platform.md §3.3 基线迁移自举实现口径](../../standards/platform.md#33-datasource-初始化)。

### 案例五：并发终态写用条件 UPDATE（乐观锁 = 读取时状态）

- **现象**：聚合写回 `repo.save(entity)`（整行 UPDATE 含 status）与 admin `force-fail` 并发，把库中 `failed` 回写成 `completed`；对账只扫 `running`，错标永久无法纠正。
- **修法**：条件更新 `update({ id, status: <读取时状态> }, payload)`，`affected === 0` 跳过；乐观锁取读取时状态而非固定 `'running'`；`update()` 不触发 `@UpdateDateColumn`，payload 显式写 `updatedAt`。
- **沉淀**：[development.md §5.1.36](../../standards/development.md)。

### 案例六：存在「第三态」时「全部失败」判据不能用「失败数 == 总数」

- **现象**：`ALERTS_DISABLED`（未启用）既非成功也非失败；原判据 `failedSources.length === totalSources`（总数=启用源数）在「1 源未启用 + 其余启用源全失败」时不成立，仓库被当成功以 0 告警写入 `repoResults`。
- **修法**：判据改为「失败数 > 0 且成功数 === 0」；抛错前 per-source 状态完整写入；成功与失败并存仍 per-source 隔离保留成功数据。
- **沉淀**：[development.md §5.1.37](../../standards/development.md)；平台侧实例见 [platform.md §6.1](../../standards/platform.md#61-错误码与告警状态口径平台展示消费-engine-错误码)。

### 案例七：e2e 控制服务端 locale 用显式 cookie header

- **现象**：操作浏览器上下文 cookie 决定服务端 locale 时，`@nuxtjs/i18n` `detectBrowserLanguage.useCookie` 在 `goto` 后约 300ms 异步回写，覆盖接受语言 → 全量顺序运行偶发「期望英文返回中文」。
- **修法**：请求 header 内显式剥离 / 附加目标 cookie；Playwright `APIRequestContext` 显式传 `cookie` header 时不再合并上下文 cookie jar。
- **沉淀**：[testing.md §6.4](../../standards/testing.md#64-e2e-网络抗性--未认证-api-调用标准模式)。

### 案例八：多 commit 隔离用 complement-stash（补集非空判断）

- **现象**：lint-staged 无 pathspec `git add` 会连带暂存其它已改文件；用补集 stash 隔离时若目标是当前全部改动（补集为空），`git stash push -m x --`（无路径）会暂存全部，随后 `git add` 落空、commit 报 `nothing to commit`。
- **修法**：stash 前判断补集数组非空，为空时直接 `git add` 目标并提交；补集经 `git status --porcelain` + `comm -23` 求出。
- **沉淀**：[git.md §3.7.1](../../standards/git.md)（与既有 lint-staged 暂存副作用条款合并为两点配套）。

### 案例九：跨阶段 commit 归属须回读归档实证

- **现象**：规划批次凭同域描述把 C89 / M32.3 的 `00a11ff` 误标为 C78 / M29，A 阶段审计 RG-W2 命中后订正。
- **修法**：标注历史 commit 的「C 编号 / M 阶段」前，`git show --stat <hash>` + 归档分片核实归属。
- **沉淀**：[planning.md §3.4 第 4 项](../../standards/planning.md#34-阶段启动决策前置交叉核验硬要求m271-重复评估问题--2026-09-10)。

### 案例十：编号检测正则必须同时覆盖裸写法与带连字符写法

- **现象**：检测正则只写 `S-\d+` 漏裸 `W\d` / `S\d`，全仓复扫报「0 命中」成为假阴性；补 `W\d{1,2}` / `S-?\d{1,2}` 后真正归零，且发现 6 文件 21 处漏网。
- **修法**：正则用可选连字符形式覆盖两形态；脚本头部显式声明未覆盖形态；存量清理批次须审查检测口径本身。
- **沉淀**：[development.md §3](../../standards/development.md)。

### 案例十一：文档状态口径清理必须三向扫描

- **现象**：改了文档状态横幅却漏同文档 §关联阶段字段，被 A 阶段判 blocker；zh 侧未同步 en 已更新的横幅；绝对 GitHub URL 锚点拼写错误（`m264m264b` 缺 `a` 且重复）不受 `check:docs` 校验。
- **修法**：① 扫同文档全部状态字段；② zh/en 镜像成对核对；③ 索引行状态 + 行数 / 链接级 parity；绝对 URL 锚点人工核对。
- **沉淀**：[documentation.md §6](../../standards/documentation.md)。

- **落点**：platform.md §10.4；platform.md §10.1；platform.md §10.2；platform.md §10.3；platform.md §3.3；development.md §5.1.36；development.md §5.1.37；testing.md §6.4；git.md §3.7.1；planning.md §3.4；development.md §3；documentation.md §6
## 六十七、M37 归档批次经验沉淀（分类落库 / 设备级偏好 / 失败写回 / 信号去重 / 口径分治 / 门禁接线）

> 2026-10-08 M37 归档批次。本阶段为运行可观测性与体验记忆闭环（失败分类 + 筛选 / 偏好记忆 / 治理债残余 / 文档口径 / CI 门禁），衍生暴露分类模型落地、设备级偏好 SSR、失败写回载荷、错误信号去重、文档口径分治与阻断门禁接线六类教训。

### 案例一：失败分类「落库 + unknown 兜底 + 回填幂等」三件套

- **现象**：`ScanRun.status='failed'` 语义过载（网络可重试 / 验证需研判），UI 只能显示「失败」；三套失败信号（平台 `error.code`、引擎 `FixError.category`、GitHub 错误码）碎片化。
- **修法**：集中映射表 + `unknown` 兜底（未映射码保留 `code` 供审计）；`engine_delivery_failed` 从 message 的类别括号回读细分；落库三列 + 前缀感知幂等迁移 + 回填脚本（dry-run 默认、无法判定写 `unknown`、幂等）；落库点穷举**全部失败写路径**（含复用既有 run 时清空三列）。
- **沉淀**：[run-failure-taxonomy.md §4/§5](../../design/governance/run-failure-taxonomy.md)（设计稿，已落地）+ [platform.md §6.2 运行失败分类口径](../../standards/platform.md#62-运行失败分类口径)。

### 案例二：caomei SelectItem 不接受空串 value（e2e 首轮捕获 500）

- **现象**：筛选控件「全部」项用 `value: ''` → SSR 渲染抛错（页面 500：「`<SelectItem />` must have a value prop that is not an empty string」）。仅靠单测 / lint / typecheck 全绿，首轮 e2e 才暴露。
- **修法**：哨兵值（`__all__` / `__auto__`）承载「全部 / 未设置」，对外提交前映射为「不传该参数」或 `null`；哨兵**不得落盘**（否则枚举校验会丢弃该次写入、旧值残留）。
- **沉淀**：[platform.md §7.4 caomei-ui 接线约定](../../standards/platform.md#74-caomei-ui-接线约定)。

### 案例三：设备级偏好 composable 的 SSR 与可测性

- **现象**：localStorage 偏好若在构造期读取，SSR 首帧与客户端值不一致 → hydration 错配；`localStorage` 在 SSR / 隐私策略 / 配额下不可用或**访问即抛错**，若位于 try 之外，「提交前记录偏好」会抛错打断扫描触发（弹窗已关但未触发）。
- **修法**：`preferences` 初始为空对象、由 `onMounted` 或打开弹窗时 `refresh()` 填充；存储以可选参数注入（缺省解析 `localStorage`），**存储解析与读写全路径纳入 try/catch**；单测用内存实现 + 抛错 getter 覆盖（vitest node 环境无 `localStorage`）。
- **沉淀**：[platform.md §7.3 Utility 抽取与跨组件共享](../../standards/platform.md#73-utility-抽取与跨组件共享) + [scan-preferences.md](../../design/governance/scan-preferences.md)（设计稿）。

### 案例四：失败路径写回只写终态字段（内存实体为初值 / 旧快照）

- **现象**：三处失败路径（executor「全部入队失败」/ cleanup 孤儿批次 / 对账零子项孤儿）持有创建期或读取期内存实体，整行 `save()` 会把并发详情 GET 已聚合的计数与 `summary` 覆盖回旧值。
- **修法**：失败通道单独 helper 只写 `status` / `finishedAt` / `updatedAt`（可选补空 summary），乐观锁取读取时状态；`affected === 0` 时不改库不改实体且调用方不计数；三条路径收敛到同一 helper，收敛后无生产调用方的「整份载荷」变体删除。
- **沉淀**：[development.md §5.1.38](../../standards/development.md) + [platform-scheduled-batch.md §5.2](../../design/governance/platform-scheduled-batch.md#52-聚合更新策略)。

### 案例五：错误信号去重 + 提示链三源合一（含「不可达分支」处置）

- **现象**：全部启用源失败时，既有 per-source `FETCH_FAILED`（带 `source`）与 catch 追加的仓库级 `FETCH_FAILED`（无 `source`）重复，且后者在日志汇总中落入 `unknown` 分组；同类提示链在三处 catch 重复书写（修复模式漏 Code Quality）。
- **修法**：仓库级 catch 追加前判「该仓库是否已有带 `source` 的同类信号」；提示链抽出三源合一函数；**不可达的防御性分支不强求测试守护**——登记「已知边界」+ 为可达调用点补断言（mutation 验证可击杀）。
- **沉淀**：[development.md §5.1.37](../../standards/development.md)（信号去重）+ [testing.md §6.5](../../standards/testing.md)（不可达分支处置）+ [platform.md §6.1](../../standards/platform.md#61-错误码与告警状态口径平台展示消费-engine-错误码)。

### 案例六：文档「版本类当前口径」与「历史叙述」分治 + 复扫账目必须可复现

- **现象**：文档当前版本口径（技术栈表 / 选型表 / 现状陈述）滞后于实际依赖版本；而迁移评估补记、升级实证、规划归档中的同版本号属历史叙述，不可一并改写。
- **修法**：结构化复扫枚举全部站点后**逐处分类**（当前口径 → 改；历史 / from-version → 保留），并在验收标准中留下**可复现的账目**（总命中数 + 文件清单 + 判定口径命令）。**教训**：首轮账目写「排除部分文件后 0 命中」不可复现（实测仍有残留），被审计判 warning 后重写为「无版本类当前口径命中 + 完整分类」。
- **沉淀**：[documentation.md §6](../../standards/documentation.md) + [planning.md §4.4 第 13 条](../../standards/planning.md#44-大批量归档批次操作规范)（结构化复扫）。

### 案例七：接入阻断式 CI 门禁的三件套（负例标定 / 自指面 / 阻断强度）

- **现象**：检测脚本已就绪但未接线，门禁长期缺失；若只加步骤不标定，无法区分「真绿」与「命令写错 / 脚本失效」；步骤所在文件自身也受该脚本扫描（自指面）；仓库未配 required status checks 时「变红」不等于禁止合并。
- **修法**：植入 `// T9999` 探针确认退出码非 0（跑后删脚手架）+ 新增 workflow 注释不得含无指针编号 + 步骤注释写明「workflow 级信号」。
- **沉淀**：[testing.md §6.9 CI 阻断门禁接线](../../standards/testing.md#69-ci-阻断门禁接线负例标定--自指面--阻断强度)。

- **落点**：platform.md §6.2；platform.md §7.4；platform.md §7.3；development.md §5.1.38；development.md §5.1.37；testing.md §6.5；documentation.md §6；testing.md §6.9；platform.md §7；git.md §3.7.2
## 六十八、M39 归档批次经验沉淀（信号边界 / 通知白名单 / 分组连续性 / 弹窗宽度钩子 / 口径同源 / 运行时开关只读端点）

> 2026-10-10 M39 归档批次。本阶段为「平台视图体验与可观测补强」闭环（扫描页筛选分页 / 扫描历史弹窗 / 告警按包聚合 / 日志下载 / PR Check 启用链路 / 环境事件覆盖），衍生暴露信号语义边界、通知策略单一入口、行分组连续性、弹窗响应式宽度、跨文档量化口径与运行时开关取数六类教训。

### 案例一：环境事件与运行失败分类的语义边界 + 通知策略下沉单一入口

- **现象**：`AuditEvent`（环境事件）与 `ScanRun.failure_code/stage/kind`（运行失败分类）都会记录「失败」，若不做边界，同一现象会被双重记录；通知此前靠「调用方是否调用 `notifyEnvEvent`」隐式决定是否发信，缺显式策略，易随新事件类型放大通知量。
- **修法**：**边界定稿**——环境事件 = 执行器 / 执行环境健康信号（`sandbox_unavailable` / `sandbox_degraded` / `container_unavailable`，可跨 run 反映环境健康）；单次运行结果类（`execution_timeout` / `clone_timeout` / `execution_failed` / `push_failed`）只记失败分类，不额外记环境事件。**通知策略下沉**到 `notifyEnvEvent` 入口的 `shouldNotifyEnvEvent(type)` 白名单（环境异常类发 / 配置留痕类仅留痕不发；**未白名单默认不发** = fail-safe），而非散落在各调用方。
- **沉淀**：代码注释（`audit-event.ts` 类型注释 + `notification/policy.ts`）为事实源；通知白名单 + fail-safe 属设计决策（暂未抽为独立 strict 条款，复发则蒸馏）。

### 案例二：告警「一个包一组」靠组排序键（组间唯一）而非行级排序

- **现象**：caomei/TanStack DataTable 为**相邻行分组**；`groupRowsBy` 字段列被剔除后无法以其排序，默认行级 severity 降序会把同包跨档行拆到不同区块 → 同名分组头重复。
- **修法**：让「严重级别」列在按包模式返回**组排序键**（组内最高级别 rank × 步长 − 包名升序序号，组间唯一）→ 同包所有行共享同一排序值且键组间唯一，任何排序下同包相邻；组键固定为第一排序键。视觉基线 `--update-snapshots=all` 重建 + mutation 标定。
- **沉淀**：[platform.md §7.4「分组列与分组连续性」](../../standards/platform.md#74-caomei-ui-接线约定)。

### 案例三：`CaomeiDialog` inline `:style` 宽度压过 `:breakpoints`（死代码）

- **现象**：`:style="{width:'720px'}"` 的 inline 样式优先级**恒高于**样式表规则（含 `:breakpoints` 生成的媒体查询）→ 既有 `:breakpoints` 成死代码，窄视口不生效。
- **修法**：改用 caomei 设计钩子 `:style="{'--caomei-dialog-width':'720px'}"`（自定义属性是「值」而非宽度声明，不参与优先级竞争）；基类自带 `min(90vw, var(...))` + `@media (width<=640px)` 全宽规则天然响应式。定宽且无 breakpoint 需求者仍可用 inline。
- **沉淀**：[platform.md §7.4](../../standards/platform.md#74-caomei-ui-接线约定) + 检查点矩阵新增行（弹窗响应式宽度写法）。

### 案例四：跨文档引用同一批需求须区分「用户报告项数 / 登记候选数 / 上收原子数」

- **现象**：同一批需求在 `todo.md` / `roadmap.md` / `backlog.md` 三处出现互相矛盾的数字（8 项 vs 9 项），A 阶段审计命中。
- **修法**：分三类计数并给换算关系（用户 8 项平台问题 → 归并 6 原子；backlog 批次 9 项候选 = 6 项上收 + 3 项保留），并标注测量方与可复现口径。
- **沉淀**：[planning.md §2.5 跨文档量化口径同源区分](../../standards/planning.md#25-任务详细度要求) + 检查点矩阵既有行扩展。

### 案例五：运行时 env 开关的 UI 状态暴露用只读端点

- **现象**：需要在 UI 反映服务端**运行时** env 开关（如 `ACTION_STATUS_MONITOR_ENABLED`）时，若用 Nuxt `runtimeConfig.public`——`nuxt.config` 求值在**构建期**，非 `NUXT_PUBLIC_` 前缀的根级 env 只在构建时烘焙，容器运行时 `-e` 注入不刷新公开配置 → 公开配置与 `process.env` 口径漂移。
- **修法**：由服务端**只读端点**按请求读 `process.env` 返回状态（如 `GET /api/schedules/monitor-status`），前端据此渲染提示；UI 文案说明「设置后需重启」。
- **沉淀**：[platform.md §7.6 运行时 env 开关的 UI 状态暴露用只读端点](../../standards/platform.md#76-运行时-env-开关的-ui-状态暴露用只读端点) + 检查点矩阵新增行。

### 案例六：新增前端 e2e 断言同样需要 mutation 标定

- **现象**：UI 口径类改动（如下拉选项全量对齐）缺少后端断言，A 阶段审计指出「断言非恒真但『会失败』的因果链未实测」。
- **修法**：对 e2e 断言做 mutation——移除被断言的选项后重建 `.output` 复跑，确认断言如期失败（本例计数 6→5），再还原。
- **沉淀**：[testing.md §6.5](../../standards/testing.md)（现有「新增 / 修改断言须 mutation 标定」条款的适用面扩展到 e2e）。

- **落点**：planning.md §2.5；platform.md §7.6；platform.md §7.4；testing.md §6.5

## 六十九、M41 归档批次经验沉淀（规范瘦身 / 经验收敛 / 门禁落地 / 导航分层 / 阈值统一）

- **案例一：批量压缩脚本重建文件时必须保留文件头** —— 以「按 `##` 标题段重建」的方式重写文件会**静默丢弃 H1 与前言引语**（本次 6 个经验分片被删 H1，由 A 阶段审计判 blocker）。做法：重建类脚本先断言首行形如 `#` 标题或显式拼接头部。
- **案例二：脚本按「子串包含」判定编号会贪婪误匹配** —— 用 `'§五十' in text` 形式的键匹配回填锚点时，命中了「§五十**六**」（本次致 2 处链接跳到错误章节；`check:docs` 只校验锚点**存在**、不校验链接文本章节号与锚点一致，故不被拦截）。做法：编号匹配用**边界锚定**（如 `§五十(?![一二三四五六七八九])`）或精确等值表 + 回填后逐条核对「链接文本 §N ↔ 锚点 §N」。
- **案例三：新门禁接入 CI 必须三件套齐备** —— 每个阻断步骤的注释需含**负例标定 + 自指面核对 + 阻断强度声明**；缺任一项即被审查判 blocker（本次 R1 命中）。做法：接线时逐步骤勾对三件套，不留「集群级声明」隐含依赖。
- **案例四：静态校验脚本存在结构性盲区，须以人工或独立脚本补位** —— `check:docs` 不覆盖 `archive/` 目录、不校验**站点绝对链接**（站点配置与首页卡片的 `link:`）、不校验「链接文本章节号 ↔ 锚点章节号」一致性；三类盲区本次各有命中（归档锚点回归 / 导航旧路径死链 / 锚点误指）。做法：改归档、站点配置或批量改锚点时，按盲区清单人工复扫或临时脚本核对。
- **案例五：多批次提交必须用隔离手段防 lint-staged 连带暂存** —— 仓库 lint-staged 的无 pathspec `git add` 会把工作区其它已改文件一并暂存（既有条款复现；本次首启批次误含 4 个其它文件）。做法：按批次 `git stash push -- <其它路径>` → 提交 → `git stash pop`，提交后 `git show --stat` 逐条核对。
- **案例六：同一口径在正文复述会与唯一权威漂移** —— 阈值取值散落在设计稿正文 / 验收项 / 索引时，与唯一权威表形成多处事实源（本次统一为「表 + 指针」）。做法：口径收敛后，正文一律改为指向权威表的一行引用，只在权威处保留取值。
- **落点**：① 案例一 / 二 → [开发规范 §5.1.4 / §5.1.11](../../standards/development.md#51-工程实践规则)（脚本化编辑与批量的验证纪律）+ [AI 协作规范 §1.2 第 6 条](../../standards/ai-collaboration.md#12-执行原则)；② 案例三 → [测试规范 §6.9](../../standards/testing.md#69-ci-阻断门禁接线负例标定--自指面--阻断强度)（CI 阻断门禁接线三件套）+ code-auditor 主责边界必查项；③ 案例四 → 候选登记「链接 / 锚点一致性机检」（backlog §候选评估中）+ 归档/站点盲区人工复扫清单；④ 案例五 → [Git 规范 §3.7.1](../../standards/git.md)（lint-staged 暂存副作用 + 补集 stash 隔离）；⑤ 案例六 → [文档规范 §3 / §4](../../standards/documentation.md#3-文档行数阈值)（唯一阈值权威 + 单点声明原则）。
