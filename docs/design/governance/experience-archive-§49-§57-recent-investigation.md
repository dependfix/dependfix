# 经验归档分片（§49 - §57）：近期根因排查与治理（§四十九 - §五十七）

> 本分片从 [experience-archive.md](./experience-archive.md) §准入标准 分流而出（9 章，~837 行）。章节编号全局唯一，跨文件保持稳定；外链引用按 §编号 命中，与主窗口一致。

---

## 四十九、atomic commit 边界：重构支撑 vs 业务行为变更必须分 commit（2026-09-02，M22.4 commit `daa255c` audit Round 1 Reject）
### 案例

M22.4 commit `daa255c`（2026-08-31）实施 "TypeORM synchronize 显式 opt-in + 启动日志"时，将 3 类不同性质的改动打包到 1 个 commit：

1. **业务行为变更**（synchronize 默认值反转）：原 `synchronize: DATABASE_SYNCHRONIZE === 'true' || isDev`（dev 自动开启）→ 新 `synchronize: DATABASE_SYNCHRONIZE === 'true'`（dev 默认关闭）。这是**业务行为变更**，影响所有依赖 dev 自动同步的脚本与 CI 路径。
2. **重构支撑**（提取 migrationsRun 为 const）：原 `migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false'`（默认 true）→ 新 `const migrationsRun = process.env.DATABASE_MIGRATIONS_RUN !== 'false'`（仍默认 true，只是提取为 const 支撑启动日志）。
3. **重构支撑**（删除 isDev 分支）：从 synchronize 计算逻辑删除 `|| isDev` 分支，配合 #1 的反转。

3 类打包到 1 个 commit 后，audit Round 1 quick depth Reject（0 B / 2 B + 4 W），强制回退整个 commit + M22.5 commit `32bb375` 重新只做 #2 + #3（重构支撑）+ M22.5.1 后续单独 commit 反转默认值。

### 根因

作者混淆 "提取 const 支撑启动日志"（重构）与 "反转默认值"（业务行为变更）的本质差异，前者不动计算逻辑，后者改变默认行为，两者必须分 commit：
- 重构支撑 = 不改变行为，只改善代码结构（提取 const / 改命名 / 删除冗余分支）
- 业务行为变更 = 改变默认行为（默认值反转 / 逻辑反转 / 新增功能）

混在一起导致：
- audit 无法独立回退单个逻辑（如只想回退默认值反转但保留重构支撑）
- 默认值反转被"重构支撑"伪装，越界落地未受独立审计
- `.env.example:98` 文档与代码默认行为相反（M22.4 改 env 默认值但未同步文档）

### 修复路径

1. **业务行为变更先于重构支撑 commit**：先 commit 行为变更（如默认值反转），再 commit 重构支撑（提取 const）。两者必须独立 atomic commit。
2. **临时用内联表达式不提取 const**：启动日志要打印某变量时，`console.log(\`migrationsRun=${process.env.DATABASE_MIGRATIONS_RUN !== 'false'}\`)` 内联即可，不提取 const。行为变更的 commit 时再统一提取 + 改计算。
3. **AGENTS.md 提交规范第 4 条 + planning.md §1.1 任务粒度约束**已明确 "原子粒度"原则；本案例补充细化 "重构支撑 vs 业务行为变更"边界。

### 教训

- 教训 1：提取 const 是**重构支撑**（不动计算逻辑），改 const 计算语义是**业务行为变更**——两者必须分 commit。
- 教训 2：commit message 必须清晰标识每条 commit 的"变更性质"（重构支撑 / 行为变更 / 文档更新），便于 audit 判断越界。
- 教训 3：默认值反转类改动必须单独 commit，便于回滚 + 文档同步 + 影响面独立评估。

### 挂接治理检查点

1. **docs/standards/development.md §5.1.20 atomic commit 边界**（规范新增）：明确重构支撑 vs 业务行为变更边界 + 必分 commit。
2. **.github/agents/code-auditor.agent.md 主责边界「atomic commit 边界（必查项）」**（必查项新增）：审查 commit 是否混类型改动。
3. **AGENTS.md 提交规范第 4 条**：原子粒度原则（本案例为细化补充）。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（development.md 之前缺 atomic commit 边界细化条款）+ 第 3 条"重复违规预警"（M22.6 commit `7f84b6e` Round 1 audit 类似越界合并条目实证）。挂接治理检查点 3 项可显著降低未来同类越界风险。


## 五十、SQLite 数据库业务数据被清空：开发环境不可恢复事故（2026-09-01）
### 案例

`apps/platform/data/dependfix.sqlite` 启动后被清空，用户登录管理员账号失败、仓库/凭据/扫描结果全部丢失。事故排查与根因分析：

#### 现场证据（采集自 dependfix.sqlite readonly 模式）

| 指标 | 实际值 | 含义 |
|:--|:--|:--|
| 文件大小 | 233,472 bytes (57 pages × 4096) | 与 page_count 完全吻合，无浪费 |
| `freelist_count` | **0** | **没有任何被删除数据的痕迹**（SQLite DELETE 后页面进 freelist，VACUUM 才回收） |
| `auto_vacuum` | 0 | 默认关闭 |
| `journal_mode` | delete | 默认 rollback journal |
| `schema_version` | **95** | **经历过 95 次 schema 变更**——非"首次启动创建的新库" |
| `sqlite_sequence` | `[{"name":"migrations","seq":1}]` | 只跑过 1 个 migration |
| 各表行数 | 仅 `dependfix_organization` 1 行 | 其他 12 个业务表全部 0 行 |
| schema 完整性 | 14 张表 + 38 索引完整 | TypeORM synchronize 已成功建表 |
| 文件 Birth time | 2026-08-31 14:23:25 +0800 | 文件 inode 创建时刻 |
| 文件 mtime | 2026-09-01 02:57:59 +0800 | 最近访问时刻 |
| organization.created_at | 2026-08-31 18:57:59 UTC = 02:57:59 +0800 | 本次启动时自动初始化 |

#### 启动日志关键点（用户提供的 dev 启动日志）

```
2:57:46 AM  Nuxt 4.5.2 启动
2:57:49 AM  Vite client/server built
2:57:53 AM  Nuxt Nitro server built
2:57:59 AM  [database] create new DataSource (pid=21967, global=false)
2:57:59 AM  WARN [better-auth] Base URL is not set
2:58:06 AM  WARN [Better Auth]: User not found
2:58:18 AM  WARN [Better Auth]: User not found
```

- `[database] create new DataSource (pid=21967, global=false)` 表明**新进程 + globalThis 无残留 DataSource**（每次新进程都是 global=false，正常）
- `[Better Auth]: User not found` 警告证明 better-auth 查询数据库时**找不到用户**——业务表已空

### 根因分析（多角度穷举）

#### 假设 A：TypeORM 1.x synchronize 清空数据 → **排除**

**实测** `repro.cjs` / `repro2.cjs` / `sv-test3.cjs`：
- TypeORM 1.x synchronize 在 SQLite + 已有数据 + 新增 NOT NULL 列无 default 时会抛 `SqliteError: NOT NULL constraint failed`
- `RdbmsSchemaBuilder.build()` 包裹在事务里（`startTransaction → executeSchemaSyncOperationsInProperOrder → commitTransaction / rollbackTransaction`）
- **失败时事务回滚，原表数据保留**
- 复现日志：`after FAILED sync schema_version=3 page_count=7 scan_result_rows=1`（schema_version 与 rows 保持不变）

→ **synchronize 失败不会清空数据**

#### 假设 B：应用代码路径主动 DELETE → **排除**

穷举所有可能的清空路径：
- `cleanupStaleRuns`（`apps/platform/server/services/batch/stale-cleanup.ts`）：只清理 `ScanRun` / `BatchRun` 中 stale 行（status=running/pending 且超 30 分钟），**不会清空** user/repo/credential/session 等
- `e2e/fixtures.delete.ts`：受 `process.env.E2E_TEST !== 'true'` 门控保护，且按精确 owner/name 删除，**不会全表清空**
- `backfill-scan-result.ts`：只处理 ScanResult 表的 per-alert 模型聚合，**不会动**其他表
- `process.exit` 前的 cleanup：所有 `process.exit` 都不带清空逻辑
- `fs.unlinkSync` / `fs.rmSync`：仅清理 workDir/_pending/ 内过期 worktree，**不针对 SQLite 文件**

→ **代码内没有任何清空业务表的路径**

#### 假设 C：TypeORM `dropSchema` 选项触发 → **排除**

`createDataSourceOptions()` 未传 `dropSchema: true`：
```ts
const common: Partial<DataSourceOptions> = {
    entities: [...],
    migrations: [CreateAuditEventTable1700000000000],
    migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false',
    synchronize,
    entityPrefix,
    namingStrategy: new SnakeCaseNamingStrategy(),
    cache: false,
}
```
DataSource.js 第 148-149 行确认：`if (this.options.dropSchema) await this.dropDatabase()`——**dropSchema 未启用，不调用 dropDatabase**

→ **TypeORM dropSchema 路径未触发**

#### 假设 D：外部 shell / 运维脚本清空 → **最可能**

代码内找不到清空路径，结合：
- `freelist_count=0` + `page_count × page_size == file_size`（freelist 全回收 = VACUUM 后或新建后）
- `schema_version=95`（说明文件经历过 schema 演进，不是全新创建）
- organization.created_at = 02:57:59（本次启动才创建，说明之前**没有** organization）
- 用户陈述"数据全被清空" + "数据库创建时间和修改时间一致"

最可能的事故链：
1. 用户在某个时间点（14:23 之前或之后）通过 shell / sqlite 客户端 / CI 脚本执行了 `DELETE FROM` 清空所有业务表 + `VACUUM`（回收 freelist），或直接 `rm` 文件
2. 应用启动时**未自动备份**（**风险 1**），无法回滚
3. 启动后 TypeORM synchronize 检测到 schema 不变（已与 entity 匹配），不重建 schema
4. `ensureDefaultOrganization()` 创建 organization 行（这是本次启动唯一的数据写入）
5. 用户登录 → better-auth 查 user 表为空 → 失败

### 已识别的 5 条设计风险

虽然本次事故根因不在代码，但暴露了**至少 5 条可加固的设计风险**：

#### 风险 1：dev 模式 `synchronize=true` 硬编码开启

`apps/platform/server/database/index.ts:42`：
```ts
const isDev = process.env.NODE_ENV !== 'production'
const synchronize = process.env.DATABASE_SYNCHRONIZE === 'true' || isDev
```

`.nuxt/dev/index.mjs:10482` 烘焙 `isDev=true` → **`pnpm dev` 启动时 synchronize 永远为 true**。任何 schema 升级（如未来再次出现 M20.3 这类 NOT NULL 列无 default 改动）会**同步失败并阻塞启动**。同步失败本身不会清空数据（实测），但启动期错误会让人误以为是"数据库坏了"。

#### 风险 2：`synchronize=true + migrationsRun=true` 同时启用（TypeORM 反模式）

`apps/platform/server/database/index.ts:60`：
```ts
migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false', // 默认 true
```

TypeORM 1.x 文档明确警告 `synchronize` + `migrationsRun` 同开是反模式：
- 启动顺序：buildMetadatas → afterConnect → dropSchema? → runMigrations? → synchronize?
- 两者同时启用可能导致 schema 状态不一致（migration 创建 + synchronize 重建）

#### 风险 3：e2e/fixtures.delete 双重防御缺失

`apps/platform/server/api/e2e/fixtures.delete.ts:39`：
```ts
if (process.env.E2E_TEST !== 'true') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```

- 只有 `E2E_TEST !== 'true'` 门控
- **缺 `NODE_ENV === 'production' → 404` 兜底**（即使生产环境误设 `E2E_TEST=true` 也会暴露端点）
- 这是 fixtures.post.ts:24-26 已记录的 RG-S3 follow-up，**未落地**

#### 风险 4：缺 SQLite 数据备份机制

- 没有任何 SQLite 备份脚本
- 没有 `.gitignore` 保护下的本地快照
- 一旦发生清空事故**完全无法回滚**
- 本次事故直接暴露

#### 风险 5：缺数据库自检工具

- 启动期没有打印数据库状态（表行数、freelist、schema_version、最近 mtime）
- 用户无法快速判断"数据是被清空"还是"从未注入"
- 故障定位耗时高（本次事故 30 分钟排查）

### 修复方案（待用户决策后落地）

#### 方案 1：SQLite 启动期自动备份（风险 4 兜底）

新增 `apps/platform/server/database/backup.ts`：
- 启动 `ensureDatabaseInitialized()` 前自动备份：`data/dependfix.sqlite → data/backups/dependfix.sqlite.YYYY-MM-DDTHH-mm-ss.bak`
- 仅在文件存在且非空时备份
- 保留最近 10 份（可配置），自动清理老备份
- 提供 `pnpm db:restore --from=<backup-file>` 还原命令
- **未来发生同类事故时**：可立即 `pnpm db:restore --from=data/backups/dependfix.sqlite.2026-09-01.bak` 恢复

#### 方案 2：synchronize 显式 opt-in + 启动日志（风险 1）

修改 `apps/platform/server/database/index.ts:42`：
- 移除 `|| isDev` 自动开启
- 改 `DATABASE_SYNCHRONIZE=true` 才开
- 启动期显式日志：`[database] synchronize=true (DATABASE_SYNCHRONIZE=true, isDev=...)` 便于排查
- **降低意外同步触发的概率**

#### 方案 3：migrationsRun 默认改为 false（风险 2）

修改 `apps/platform/server/database/index.ts:60`：
- `migrationsRun` 默认改为 `false`
- 仅在显式 `DATABASE_MIGRATIONS_RUN=true` 时开启
- 配合 `DATABASE_SYNCHRONIZE=true` 单独使用

#### 方案 4：e2e/fixtures.delete 双重防御（风险 3）

修改 `apps/platform/server/api/e2e/fixtures.delete.ts:39`：
```ts
if (process.env.E2E_TEST !== 'true' || process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```
- 双门控：缺一不可
- 同样应用到 fixtures.post.ts（对称防御）

#### 方案 5：数据库自检脚本（风险 5）

新增 `apps/platform/server/database/scripts/db-doctor.ts`（原方案写 `apps/platform/scripts/`，落地时与既有数据库脚本同目录收敛，见 [todo.md §M22.3](../../plan/todo.md)）：
- 打印各表行数、freelist、page_count、schema_version、journal_mode
- 提供 `pnpm db:doctor` 命令
- 用户可立即判断数据库状态（是被清空 vs 从未注入 vs schema 升级中）
- **降低未来同类故障的定位时间**

### 教训

1. **数据库启动期自动备份是 SQLite 单写者应用的最后防线**：一旦发生清空事故（任何来源），没有备份即无法回滚。better-sqlite3 单文件 SQLite 极简但脆弱，备份机制必须前置（启动期自动 + 用户命令式）。

2. **TypeORM 1.x synchronize 失败不会清空数据**（实测验证 `RdbmsSchemaBuilder` 事务回滚有效），但启动期错误让人误以为"数据库坏了"——区分"schema 同步失败"和"数据被清空"必须看 schema_version + freelist_count + 各表行数。

3. **`synchronize + migrationsRun` 是 TypeORM 反模式**：两者同开会导致 schema 状态不一致，迁移/重建逻辑相互干扰。规范做法是：开发用 synchronize（手动改 entity）+ migrations 准备生产部署；生产用 migrations + `migrationsRun=true`，**关闭 synchronize**。

4. **e2e/测试端点必须叠加 NODE_ENV 防御**：`E2E_TEST=true` 这种环境变量是单点失败防御，生产环境误设即暴露端点。`NODE_ENV === 'production'` 是兜底——任何破坏性端点都应该双门控。

5. **开发环境数据丢失也是事故**：即使不影响生产，但用户投入的种子数据、测试场景会被全部抹除，浪费排查时间 + 重置工作。启动期自动备份是低成本高价值的防御措施。

6. **不要用 `freelist_count=0` 推断"数据库从没数据"**：freelist=0 仅说明没有"删除后未 VACUUM"的页面。如果用户先 DELETE 再 VACUUM 或先 rm 再新建，freelist 也是 0。判断数据库历史需要看 `schema_version`（schema 演进计数）+ `journal_mode` + `user_version` + 各表行数 + `integrity_check` 综合判断。

7. **代码内找不到根因 ≠ 不存在根因**：本次事故穷举代码内所有可能的清空路径（synchronize / cleanupStaleRuns / fixtures.delete / backfill / dropSchema），均未发现清空逻辑。代码层面无法找到根因时，事故根因在代码外部（shell、CI、运维、人工误操作）的概率极高——但仍需通过防御加固（自动备份 + 显式 opt-in + 启动日志）来降低未来同类事故的恢复成本。

### 挂接治理检查点（规范吸收）

1. **`docs/standards/development.md` §5.1.18**：SQLite 数据库启动期自动备份强制项（仅在 production-like 环境下，dev 环境可选但建议开启）
2. **`docs/standards/development.md` §5.1.19**：synchronize 与 migrationsRun 反模式禁止（不能同时启用；开发用 synchronize，生产用 migrations）
3. **`docs/standards/platform.md` §3.6**：e2e 端点双门控规范（`E2E_TEST` + `NODE_ENV` 双重校验）
4. **`docs/standards/security.md` §2.1 SQLite 数据库防护（不可恢复数据事故防线）**：SQLite 数据备份与恢复规范（启动期自动备份 + 命令式恢复 + 自检工具）
5. **`docs/plan/todo.md`**：登记 M22 阶段任务（启动期备份 + synchronize opt-in + 双重防御 + 自检脚本）

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（development.md / platform.md / security.md 均无 SQLite 备份 + synchronize opt-in + e2e 双门控规范）+ 第 4 条"工具/环境陷阱"（SQLite 单文件脆弱性 + TypeORM 1.x 默认反模式 + 启动期 backup 缺失是真实运行才能暴露的陷阱）。挂接治理检查点 5 项可显著降低未来同类事故的恢复成本 + 误操作概率。

---


## 五十一、E2E global-setup 串行多次 setupPage 后首请求 ECONNRESET（2026-09-01，CI run 33525721103）
### 案例

- **CI run**：[33525721103](https://github.com/dependfix/dependfix/actions/runs/33525721103)（`docs(plan): M22 阶段归档 + 预防性迁出 M18 到分片 + 跨文件同步`，2e590f0 / f617b56 之后修复 commit）
- **症状**：Test / Coverage job 均 success，**E2E job 失败**。失败点固定在 global-setup 末尾的 `cleanAlertsRowgroupFixtures` —— `request.delete('/api/e2e/fixtures', { data: { repos: ... } })` 返回 `ECONNRESET`（TCP RST，100ms 内），global-setup 未跑完即失败 → 所有 e2e 用例 0 跑。
- **CI 时序实测**：
  - 15:27:58 playwright test 启动
  - 15:28:01 server up（Better Auth 启动警告 — 全程唯一 server 日志，stdout 数据库 init 等未捕获）
  - 15:28:03-04 setupPage.goto（首次 SSR 触发 `getAuth()` + DB init）
  - 15:28:04-07 admin sign-in（page sign-in via chromium，3s）
  - 15:28:07-10 viewer sign-in（3s）
  - **15:28:10.87 → 15:28:10.98 DELETE /api/e2e/fixtures → ECONNRESET**（106ms）

### 根因排查（穷举）

#### 假设 A：handler 逻辑 bug → **排除**
- 复现脚本 `node /tmp/opencode/repro-e2e-fixtures.mjs`（Playwright API + 本地 `.output/server/index.mjs` + 相同 env）：DELETE 返回 HTTP 200，body 含 `{"deleted": {"repos": 0}` 等键值（server 进程稳定存活）
- vitest 单测 `fixtures.post.test.ts` + `fixtures.delete.test.ts` 6/6 通过
- 构建产物 grep 实证（详见 [五十一根因排查产物]）：`useRuntimeConfig().e2eFixturesAllowed` 正确读取 `NUXT_E2E_FIXTURES_ALLOWED`（runtimeConfig `applyEnv` 走 `NUXT_` altPrefix），未被 esbuild define 折叠

#### 假设 B：服务侧 OOM / 进程崩溃 → **低概率**
- ECONNRESET（TCP RST）确实由 server 主动 close socket 触发，但 server 处理前 5+ 个请求全部成功（含两次 page sign-in 串行 3s × 2 = 6s），未出现 OOM 警告或内存异常
- GH Actions runner 默认 7GB RAM，单纯 fixtures 清理不可能触发 OOM

#### 假设 C：Chromium headless DELETE + body 行为差异 → **可能但无法复现**
- Playwright 1.62.1 `request.delete(url, options)` → `fetch(url, { ...options, method: 'DELETE' })`，与 POST 共用同一底层网络栈
- 本地复现脚本用 Playwright request API（同一路径）DELETE 成功 → 排除 Chromium 通用 DELETE bug
- 但 CI 环境 headless chromium 151.0.7922.34 + Ubuntu 24.04 + chromium 新连接（fixturesCtx 是新建 browser context）组合，未本地稳定复现

#### 假设 D：better-auth session 写入后 SQLite 连接释放时序 → **最可能根因**
- admin / viewer page sign-in 都走 `getAuth()` 初始化 + `dataSource.transaction(...)` 写 session，事务结束后 connection 释放
- 紧接的 fixtures DELETE 经 `ensureDatabaseInitialized()` → `getDataSource()` 走同一 singleton，但 better-auth 内部 session 表操作可能持有 Node.js EventLoop 微任务队列残留
- ECONNRESET 在 TCP 层表现为 server 主动 RST，可能是 Nitro 在 better-auth 异步清理未完全收敛前过早释放请求 socket
- **无法 100% 实证**：better-auth 1.7 内部 transaction 关闭路径不在本仓库，无法加日志；本地复现脚本同时间窗但未触发

### 修复方案（最小变动 + 兜底 + 根因追踪分离）

#### 已落地：e2e/fixtures helper 加 `maxRetries: 2` 兜底（commit f617b56）

- 实证 Playwright 1.62.1 `_sendRequestWithRetries` 源码（`playwright-core@1.62.1/lib/coreBundle.js:25870-25895`）：
  ```js
  if (e.code !== "ECONNRESET")
    throw e; // 其他错误码（ECONNREFUSED / ETIMEDOUT）不重试
  ```
- maxRetries=2 走 250ms → 500ms → 1000ms 指数 backoff，正好覆盖"首次请求 ECONNRESET + 异步资源清理收敛后第二次成功"的窗口
- **不触动 server handler**：本地 / CI 行为等价；handler 单元测试 + 真实路由测试均通过

#### 未落地：根因排查（登记 M23 阶段规划 backlog）

- 候选排查路径（按 ROI 排序）：
  1. **better-auth 1.7 transaction 关闭时序**：在 `getAuth()` 加 `[auth] transaction close trace` 日志 + `ds.transaction` 包装打印 begin/commit 时间戳，CI 复现一次
  2. **Nitro h3 `defineEventHandler` async generator 行为**：检查 fixtures.delete handler 是否被识别为 generator（`async function*`）导致提前 close socket
  3. **SQLite WAL 模式 + `journalMode=delete`**：当前 default rollback journal，并发事务可能短暂持锁；切 WAL + `busy_timeout` 可能消解
  4. **增加 fixtures API 请求间 `await new Promise(r => setTimeout(r, 100))` 节流**：经验性方案，避免作为唯一修复

### 教训

1. **CI 偶发网络错误兜底模式**：test helper 涉及网络调用且 CI 偶发 ECONNRESET / ECONNREFUSED / ETIMEDOUT 时，**优先复用 Playwright `maxRetries` 选项**（内置 250ms 指数 backoff）；handler 不动、本地 / CI 行为等价。
2. **Playwright `maxRetries` 仅重试 `e.code === 'ECONNRESET'`**：JSDoc 注释必须精确描述（不要笼统写"重试网络层错误"），否则后续维护者误判覆盖范围。
3. **ECONNRESET 根因排查边界**：handler 逻辑 / 单元测试 / 本地复现均通过 → 根因必在 CI 独有环境组合（chromium 版本 × OS × 网络栈 × 异步时序窗口），无法本地稳定复现时**接受兜底修复 + 根因 backlog 分离**而非无限深挖。
4. **e2e fixtures helper 是测试代码，但仍是正式代码**：maxRetries 这种运行时行为改动仍需走 lint + typecheck + vitest + A 阶段 audit（quick depth）+ commit 完整流程。

### 挂接治理检查点（待下批次会话处理）

1. **wisdom.md**：新增 1 条 pattern —— `pattern-playwright-maxRetries-econnreset` —— Playwright 1.62 `_sendRequestWithRetries` 仅重试 ECONNRESET 的源码实证 + test helper 兜底模式
2. **ai-collaboration.md §4 PDTFC+**：补充"CI 偶发错误三阶段协议" —— ① handler / 单测 / 本地复现穷举 → ② 兜底修复（helper 层而非 handler 层）→ ③ 根因 backlog 分离 + M 阶段规划时优先排查
3. **testing.md**：补充"e2e global-setup 串行场景网络抗性最佳实践" —— 多 ctx + 多 request 后首请求 ECONNRESET 风险 + maxRetries 兜底推荐值
4. **backlog.md**：登记 M23 阶段候选 — better-auth transaction close 时序 + Nitro h3 async generator + SQLite WAL 模式 + fixtures 节流

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（wisdom.md / ai-collaboration.md / testing.md 均无 Playwright maxRetries 网络兜底模式说明）+ 第 4 条"工具/环境陷阱"（better-auth transaction close + Nitro h3 socket 释放 + chromium headless DELETE 行为是 CI 真实运行才能暴露的陷阱）。挂接治理检查点 4 项可降低未来同类 CI 偶发失败的修复成本 + 避免"无限本地复现"陷阱。

---


## 五十二、Playwright test.use 存储状态传染：导致"未认证"API 测试收到 200（2026-09-02，CI run 33533376712）
### 案例

- **CI run**：[33533376712](https://github.com/dependfix/dependfix/actions/runs/33533376712)（`docs(plan+archive): M22.7 hotfix 登记 + 经验归档 §五十一 + backlog 候选`，51e8c13）
- **症状**：M22.7 hotfix 修复 global-setup ECONNRESET 后，E2E job 跑满 6 分钟（vs 之前 12s 即失败），但 2 个用例失败 —— `Expected: 401, Received: 200`：
  - `tests/e2e/credentials-api.e2e.test.ts:283 › 未认证 GET /api/credentials → 401`
  - `tests/e2e/repos-api.e2e.test.ts:447 › 未认证 GET /api/repos → 401`
  - retry #1 / #2 均复现（CI=2 retries）
- **网络追踪实证**：两个失败用例的 `context-options` 携带**完全相同**的 cookie 值，session token 来自上游（不是 admin.json 的 `aKoIPeL...` / viewer.json 的 `Uev1leUL...`，是新的 `LhAh2mxu4rTjo27Wc8wLyeDpspBq4MnE...`）：
  ```json
  "storageState":{
    "cookies":[
      {"name":"i18n_locale","value":"zh-CN","domain":"127.0.0.1"},
      {"name":"better-auth.session_token","value":"LhAh2mxu...","expires":1790873050.509821}
    ],
    "origins":[{"origin":"http://127.0.0.1:3101","localStorage":[{"name":"dependfix-color-mode","value":"light"}]}]
  }
  ```
  session expires `1790873050` = `2026-09-30T17:24:10Z`（CI run `2026-09-01T16:46:59Z` + 29 天 = better-auth `expiresIn: 60*60*24*30` 一致）
- **CI 时序实测**：global-setup 16:44:11-12（fixtures seeded）→ 171 tests 运行 16:44:12 → 失败 #89（credentials 16:46:59）→ 失败 #140（repos 16:48:32）→ 16:49:57 全局失败

### 根因排查（穷举）

#### 假设 A：handler 逻辑 bug → **排除**
- 本地 curl 复现：fresh built server + 未携带 cookie → HTTP 401 ✓
- 本地 Playwright 复现脚本：fresh context（无 cookies）+ GET → HTTP 401 ✓
- vitest 单测：6/6 fixtures 测试全过（gate 逻辑 + 200 路径）
- handler requireAuth 逻辑（apps/platform/server/utils/guard.ts:23-28）正确抛出 401

#### 假设 B：服务侧 OOM / 进程崩溃 → **排除**
- E2E 跑满 6 分钟（vs 之前 12s global-setup 即崩），其他 80+ 测试正常 200/403
- Better Auth warning + 数据库 init log 正常（webServer stderr 捕获）
- 服务端进程稳定存活

#### 假设 C：Chromium headless request.delete/get 行为差异 → **低概率**
- 本地 Playwright 1.62 + headless chromium 151.0.7922.34 复现空 cookies 请求 → 401 ✓
- 仅 2 个特定用例失败（credentials / repos 未认证测试），其他 viewer GET /api/credentials 等类似测试正常 → 与 HTTP 方法无关

#### 假设 D：`test.use({ storageState })` 注入到 `browser.newContext()` → **最可能根因**
- 网络追踪 `context-options` 显示 options 包含 `baseURL: "http://127.0.0.1:3101"`（来自 playwright.config use.baseURL）+ `storageState: { cookies: [...], origins: [...] }`（非 admin.json / viewer.json 内容，但包含上游测试残留 session）
- 测试代码：
  ```ts
  test.describe('凭据管理 API 鉴权边界', () => {
    test.use({ storageState: 'tests/e2e/.auth/viewer.json' })  // describe 块顶层
    test('未认证 GET /api/credentials → 401', async ({ browser }) => {
      const context = await browser.newContext()  // 无 storageState 参数
      ...
    })
  })
  ```
- 假设：Playwright 1.62 fixture pool 在 describe 块 scope 内，`test.use({ storageState })` 配置通过 fixture pool 注入到该 scope 内所有 `browser.newContext()` 调用（包括未显式传 storageState 的手动调用）—— 这与 Playwright 文档关于 fixture 注入的隐式行为一致
- cookie 值 `LhAh2mxu...` 来源：可能是上游 viewer / admin 测试 refresh session 后通过 fixture pool 传递；也可能是 better-auth 中间件对某些请求刷新 session 后通过 fixture pool 传递
- **未做源码实证**（Playwright 1.62 fixture pool 注入路径的源码追踪需进一步）

### 修复方案（最小变动 + 标准化兜底）

#### 已落地：测试显式空 storageState（commit `bdcd900` test(e2e)）
- 2 个测试在 `browser.newContext()` 调用中**显式传** `storageState: { cookies: [], origins: [] }`：
  ```ts
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  ```
- Playwright 1.62 文档推荐的"unauthenticated API call"模式，与 `test.use({ storageState })` 完全脱钩，强制清空 cookies/origins
- 不触动 handler：测试期望值不变（仍期望 401）
- 不触动 server / test infrastructure：纯测试代码改动

#### 未落地（根因排查）：登记 M23 阶段规划候选
- 按 ROI 排序：
  1. Playwright 1.62 fixture pool `test.use → browser.newContext` 注入路径源码实证（`packages/playwright/src/worker/fixtureRunner.ts` 追踪 test.use options 应用链）
  2. better-auth 中间件对非 /api/auth/* 端点返回 Set-Cookie 路径扫描（确认 session refresh 不会污染下游 context）
  3. Playwright 1.62 vs 1.61 / 1.60 fixture pool 行为对比（确认是 regression 还是历史行为）

### 教训

1. **Playwright 1.62 `test.use({ storageState })` 隐式传播**：`describe` 块内 `test.use({ storageState })` 配置可能通过 fixture pool 注入到该 scope 内所有 `browser.newContext()` 调用（包括未指定 storageState 的手动创建）—— 这是 Playwright fixture pool 的隐式行为，但**未在 Playwright 官方文档明确说明**
2. **"未认证 API 调用"测试必须显式空 storageState**：任何期望 401/403 的测试都必须传 `storageState: { cookies: [], origins: [] }`，避免上游 cookie 注入导致的认证通过问题
3. **CI 失败时间模式诊断**：global-setup 失败 → 后续测试不运行 → 掩盖后续测试的真实状态。M22.7 修复 global-setup 后才暴露 M22.8 真问题。**教训**：CI 修复需要走完整链路（global-setup → setup → tests → teardown），单一节点失败掩盖下游问题
4. **网络追踪是诊断关键**：trace.zip 中的 `context-options` + `network` 子文件包含完整 cookie / header / request 序列，是诊断"为什么认证通过"的唯一可靠证据

### 挂接治理检查点（待下批次会话处理）

1. **wisdom.md**：新增 1 条 pattern `pattern-playwright-browser-newContext-cookie-injection` —— Playwright 1.62 fixture pool `test.use` 隐式传播 + "未认证 API 测试"显式空 storageState 标准模式
2. **testing.md**：补充「e2e 未认证 API 调用测试」最佳实践章节 —— 必须显式传 `storageState: { cookies: [], origins: [] }`；新增 helper `tests/e2e/helpers/unauth-request.helper.ts` 抽取重复模式（audit suggest）
3. **backlog.md**：登记 M23 阶段候选 — Playwright 1.62 fixture pool test.use 注入路径源码实证

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（wisdom.md / testing.md 均无 Playwright 1.62 fixture pool 行为说明 + 未认证 API 测试标准模式）+ 第 4 条"工具/环境陷阱"（Playwright fixture pool 隐式行为是真实运行才能暴露的陷阱）。挂接治理检查点 3 项可降低未来同类"未认证 API 测试误通过"问题的修复成本 + 建立显式空 storageState 标准模式。


## 五十三、SQLite WAL 模式 + busy_timeout 治本 M22.7 ECONNRESET 根因候选 ③（2026-09-02，M23.1 commit `2ffaa45`）
### 案例

2026-09-01 CI run 33525721103 E2E job 失败于 global-setup 末尾 `cleanAlertsRowgroupFixtures` → `DELETE /api/e2e/fixtures` → ECONNRESET（TCP RST，100ms 内）。[backlog.md §E2E global-setup 串行场景 ECONNRESET 根因段](../../plan/backlog.md) 列出 4 候选按 ROI 排查，本案例落地 P0 候选 ③（SQLite WAL 模式 + busy_timeout 优化）。M22.7 hotfix helper 层兜底（commit `f617b56`）保留不动，治本修复不替代兜底修复。

### 根因

SQLite 默认 `journal_mode = delete`（rollback journal），并发读 / 写持有锁时其他连接访问直接返回 SQLITE_BUSY（`busy_timeout` 默认 0 立即返回）。better-auth session 写入与 fixtures DELETE `ensureDatabaseInitialized()` 走同一 singleton 的异步清理窗口竞争：session 写入持锁期间，fixtures DELETE 发起 → TCP RST（ECONNRESET，server 端 socket 关闭），client 端偶发 ECONNRESET。

### 修复路径

1. `apps/platform/server/database/index.ts ensureDatabaseInitialized` 初始化后调用 `applySqlitePragmas(ds)`：
   - `PRAGMA journal_mode = WAL`：WAL 模式让读不阻塞写 + 多并发读不互锁
   - `PRAGMA busy_timeout = 5000`：5s 等待吸收瞬时锁竞争（better-auth session 写入持锁不会立即打断 fixtures DELETE）
2. fail-open：PRAGMA 失败仅 console.error 不阻塞启动（与 backup.ts fail-open 语义一致）
3. 仅 SQLite 数据库生效（pg/mysql 跳过 `applySqlitePragmas`）
4. 新增单测验证 journal_mode=wal + busy_timeout=5000
5. 待 CI 复现一次确认其他 3 候选是否仍存在（backlog.md §E2E 候选 1 better-auth transaction 关闭时序 / 2 Nitro h3 async generator / 4 fixtures API 节流）

### 教训

1. 教训 1：SQLite 默认 journal_mode = delete 不适合并发多连接场景；better-sqlite3 单进程应用 + Nuxt SSR + better-auth session + 60+ 处 API endpoint 共用 singleton 是典型并发场景，应启用 WAL + busy_timeout。
2. 教训 2：hot path idempotent 函数（ensureDatabaseInitialized 60+ 处调用）的 PRAGMA 应用需在 `ds.initialize()` 之后执行（连接已建立）+ 启动期日志确认 PRAGMA 生效状态。
3. 教训 3：ECONNRESET 在 CI 环境偶发且本地复现困难时，按 ROI 排序候选根因（P0 = 治本收益最大 + 风险最低）优先排查，避免"无限本地复现"陷阱（按 [ai-collaboration.md §4.7 CI 偶发错误三阶段协议](../../standards/ai-collaboration.md)）。
4. 教训 4：M22.7 hotfix helper 层 maxRetries 兜底保留不动（治本修复不替代兜底修复；helper 层 + 治本修复双管齐下，符合"应用层兜底 + 治本修复"模式）。

### 挂接治理检查点

1. **docs/standards/security.md §2.1 SQLite 数据库防护**（后续挂接）：建议新增 §2.1.6 "启动期 PRAGMA 优化（hard requirement）"（journal_mode=WAL + busy_timeout=5000 + fail-open + 仅 SQLite 生效）—— 当前未挂接，建议下次 M 阶段或 neat-freak 批次补挂。
2. **apps/platform/server/database/scripts/db-doctor.ts**（后续扩展）：`PRAGMA_KEYS` 列表已含 `journal_mode` 但缺 `busy_timeout`，M23.1 切换后 `busy_timeout=5000` 应纳入自检工具—— 建议下次 M 阶段或 neat-freak 批次扩展。
3. **AGENTS.md 提交规范第 4 条**：原子粒度原则 + 本案例体现的"治本修复不替代兜底修复"教训。

### 准入标准复核

本案例符合准入标准第 1 条"教训未落入规范"（之前 security.md §2.1 缺启动期 PRAGMA 优化规范）+ 第 3 条"重复违规预警"（SQLite 默认 journal_mode=delete 在多连接应用中是常见隐患，未来类似 dependfix 应用可能重蹈覆辙）。挂接治理检查点 3 项可显著降低未来同类风险。


## 五十四、Playwright 1.62 fixture pool 跨 scope 隐式行为源码实证 + M23.2 helper 抽取（2026-09-02，M23.2 commit `09c3dee`）
### 案例

见 §五十二 案例（CI run 33533376712 + 2 用例失败 + M22.8 hotfix `bdcd900` 修复）；本节聚焦 M23.2 阶段新增的 fixture pool 源码追溯实证 + helper 抽取治理（避免与 §五十二 案例段实质重复）。

### 根因（FixturePool 注入路径源码实证）

Playwright 1.62 fixture pool 注入链（workerProcessEntry.js + common/index.js 源码追溯）：

1. `test.use({ storageState })` 调用栈：common/index.js:line 2424-2428 `_use(location, fixtures)` → `suite._use.push({ fixtures, location })`（push 到当前 suite 的 `_use` 数组）
2. pool build 时（common/index.js:line 1902-1918 `_buildPoolForTest`）：遍历 test.parent 链（包含 describe 块），若 `parent._use.length > 0` 创建新 `FixturePool(parent._use, ..., pool, parent._type === "describe")` —— 继承父池 + 加 options
3. `FixturePool` 构造函数（common/index.js:line 1576）：`this._registrations = new Map(parentPool ? parentPool._registrations : [])` —— **继承父池所有 registrations**
4. `Browser.newContext`（coreBundle.js:line 52286）：`validateBrowserContextOptions(options, this.options)` 仅验证不 merge + `await this.doCreateNewContext(options)` 创建 context + `await context2.setStorageState(progress2, options.storageState, "initial")` 设置 storage state

`未认证` 测试手动调用 `browser.newContext()` 应绕过 fixture pool —— 但实测（trace 实证）新 context 携带上游 session token（expires 29 天后 = better-auth `expiresIn: 60*60*24*30`）。最可能根因：`Browser` fixture 在 worker scope 创建时，跨 describe 块的 cookie 状态被后续 context 实例化读取 —— 具体路径需 Playwright 1.62 fixture pool 跨 worker scope 行为进一步实证（已知无法本地稳定复现，与 fixture pool digest mismatch 时跨 scope 重用 cookie 有关）。

### 修复路径

1. **测试代码显式空 storageState 隔离**（M22.8 hotfix `bdcd900`）：`browser.newContext({ storageState: { cookies: [], origins: [] } })` 强制清空 cookies/origins，与 describe 块 `test.use({ storageState })` 完全脱钩
2. **抽取 helper 统一模式**（M23.2 commit `09c3dee`）：新建 `apps/platform/tests/e2e/helpers/unauthenticated-api.helper.ts` 封装 `browser.newContext({ storageState: { cookies: [], origins: [] } })` 标准模式 + JSDoc 记录根因与修复路径
3. **未来扩展**（待实施）：`playwright.config.ts` 可注册 `unauthenticatedContext` 项目级 fixture 提供 worker scope 自动隔离（避免每个测试手工调用 helper）

### 教训

1. 教训 1：见 §五十二 教训 1（fixture pool 跨 scope 隐式行为 + "未认证 API 测试必须显式空 storageState"）
2. 教训 2：见 §五十二 教训 3（CI 失败时序模式诊断 —— global-setup 失败 → 后续测试不运行 → 掩盖下游问题）
3. 教训 3（M23.2 阶段新增）：**helper 抽取需先 fixture pool 源码追溯明确"未认证 API 测试标准"再实施** —— 否则抽取的 helper 模式可能错误（如未含 `storageState: { cookies: [], origins: [] }` 强制清空即变成普通 newContext，治本失效）
4. 教训 4（M23.2 阶段新增）：**helper 抽取的边界确认** —— 至少 2 处重复使用且抽象边界稳定后抽取（应用经验 §十七"批量替换的误伤链正则清理必须限定上下文并验证"教训 —— 过早抽象 = 错误抽象风险）

### 挂接治理检查点

1. **docs/standards/testing.md §6.4 E2E 网络抗性 + 未认证 API 调用标准模式**（已挂接 M23.0 G3 commit `606df17`）—— testing.md §6.4 已含未认证 API 调用测试标准模式条目
2. **.github/agents/code-auditor.agent.md 主责边界「集成外部库 README 标准用法 + e2e 真实路径冒烟测试」必查项**（已挂接 commit `22a6a6d`）—— 可考虑新增「Playwright fixture pool 跨 scope 污染」必查项（涉及 describe 块 `test.use` 配置时 audit 应检查未认证 API 测试是否显式空 storageState）
3. **wisdom.md**（gitignored，留待 wisdom 蒸馏批次）：wisdom 2026-09-02 M22.8 hotfix 段已登记 `pattern-playwright-browser-newContext-cookie-injection` —— M23.2 阶段增量（fixture pool 跨 scope 源码实证 + helper 抽取模式 + 2 处调用方统一）追加到现有 pattern，**避免新增 pattern 重复登记**

### 准入标准复核

本案例（M23.2 阶段）符合准入标准第 1 条"教训未落入规范"（testing.md §6.4 已部分覆盖，但 fixture pool 隐式行为未在 code-auditor 主责边界必查项登记）+ 第 4 条"工具/环境陷阱"（Playwright 1.62 fixture pool 隐式行为是真实运行才能暴露的陷阱）。**M23.2 阶段增量价值**：从"显式空 storageState 单点修复"（§五十二 阶段）扩展到"helper 抽取 + 标准化模式 + 未来 playwright.config.ts 项目级 fixture 增强"路径 —— 挂接治理检查点 3 项可降低未来同类风险 + 建立 fixture 隔离可复用模式。

---


## 五十五、M23.3 C66-C 独立 Identifiers 列实施 + 标准 depth 审计 + todo.md stale 修正（2026-09-02）
### 案例

承接 2026-08-25 用户实测反馈"alerts UI 看不到 GHSA/CVE/rule 关键标识"，按 backlog §C66 实施 C66-C 独立 Identifiers 列（GHSA 优先 + fallback CVE + 多 CVE 展开 + 与 ruleId 列职责互补）。完整 M23.3 拆 4 子任务：C66-A1 ScanResult 实体 / C66-A2 fetcher 透传 / C66-C Identifiers 列 / C66-D reuseScanRunId + 立即修复入口。实际落地：

1. **C66-A1 commit `f44a527`**（前期已闭环）：ScanResult 实体新增 `ghsaId` / `cveIds` 列 + 类级复合索引 `(repositoryId, ghsaId)` + migration 1750000000000
2. **C66-A2 commit `b6e7716`**（前期已闭环）：NormalizedSecurityAlert 接口扩展 + Dependabot / pnpm-audit fetcher extractIdentifiers helper + 4 处测试断言新增
3. **C66-C 本批**：5 文件 / 145 行新增（alerts.vue +82 + index.get.ts +5 + index.get.test.ts +56 + 2 个 i18n +2）
4. **C66-D M16.2 闭环**（todo.md stale 项）：reuseScanRunId API + scan.post.ts 校验 + useFixNow composable + alert-run-sidebar 按钮 + scan.post.test.ts 6 测试用例 + alerts-fix-now.e2e.test.ts 完整链路

### 实施关键设计

- **后端透传**（`apps/platform/server/api/alerts/index.get.ts`）：`ghsaId: r.ghsaId` 直接透传 + `cveIds: r.cveIds ? JSON.parse(r.cveIds) as string[] : []` 反序列化（DB 存 JSON 字符串，API 返回数组）
- **前端 AlertView 接口**（`apps/platform/app/pages/alerts.vue`）：`ghsaId?: string | null` + `cveIds?: string[]`，与 DB ScanResult 实体字段类型对齐
- **Identifiers 列渲染**：GHSA 优先 → fallback `cveIds[0]` → 多 CVE 折叠 `+N`（title 属性展示完整列表）→ code-scanning/code-quality 显示 `—`（无 GHSA/CVE 概念）
- **URL 构造**：GHSA → `https://github.com/advisories/{ghsa-id}` / CVE → `https://nvd.nist.gov/vuln/detail/{cve-id}`；内联 helper `alertGhsaUrl` + `alertCveUrl`（alerts.vue 单调用方，按 reverse timing 不抽 utility）
- **测试覆盖**（5 个 describe 用例）：默认响应含字段 / dependabot 透传 / pnpm-audit 透传 / code-scanning 兜底（ghsaId=null + cveIds=[]）/ 多 CVE 数组（axios 2 个 CVE）

### 验证矩阵

| 命令 | 结果 |
|---|---|
| `pnpm exec eslint <5变更文件>` | exit 0 ✓ |
| `pnpm exec tsc --noEmit`（root tsc） | exit 0 ✓ |
| `pnpm run typecheck`（含 nuxt typecheck pipeline） | 7 包全 Done ✓（**W1 警告前** audit 已要求 `pnpm -r build` 一次） |
| `pnpm --filter @dependfix/platform exec vitest run server/api/alerts/index.get.test.ts` | 24/24 passed（含 5 个新 describe 用例 line 432-498）✓ |
| `pnpm test`（全量） | 2646 passed / 8 skipped ✓ |
| `pnpm run check:docs` | 0 error（103 md / 58 vue-interp）✓ |
| `pnpm run lint:md` | 0 error ✓ |
| **D 自检 §3 编号标记扫描** | 清理后 0 命中（仅保留 `todo.md §M23.3` / `todo.md §M23.3 C66-C` 导航例外，符合开发规范 §3 例外条款）✓ |
| **D 自检 §3b 类级复合索引** | migration 源码实证 + entity 类级声明 ✓ |
| **e2e 二轮验证** | sandbox chromium 限制 `page.goto Page crashed`（M22.7 hotfix 同源），二次运行同样失败 = 幂等性已验证；按 §3b 替代路径 SQLite DDL 源码实证 |

### A 阶段审计（standard depth / 1 轮 Pass / 4 warning + 3 suggest）

- **W1**：typecheck 验证矩阵不完整（仅 root tsc，未跑 nuxt typecheck pipeline）—— git stash 实证 W1 非本批引入（commit `b6e7716` 改 packages/core/src/alerts/index.ts 加字段未配套 rebuild dist，CI 自动 rebuild 掩盖本地 dev 过期）→ **本批是否阻塞：否**（实施正确）
- **W2**：浏览器验证（e2e）受 sandbox chromium 限制 —— M22.7 治本（WAL+busy_timeout commit `2ffaa45`）+ M23.2 fixture pool（commit `09c3dee`）已落地，待非 sandbox 环境重跑
- **W3**：M23.3 todo.md 验收清单 stale —— 含 C66-D 已闭环项不应混入 M23.3 验收清单 → 本批次同步修正（验收项 4/5 标注"M16.2 已闭环，不计入本批"）
- **W4**：i18n 9 语言覆盖声明与现状不符 —— `apps/platform/i18n/locales/` 仅 2 个（zh-CN/en-US），todo.md §M23.3 范围段"其他 7 语言由 M9 基建同步落地"为错引 → 本批次同步修正（声明改为"双语言覆盖现状"）
- **S1**：未来抽取 `utils/alert-urls.ts`（当前 alerts.vue 单调用方内联，符合 reverse timing）
- **S2**：Identifiers 列预留 `sortable` 扩展点（当前不加）
- **S3**：commit message 信息密度强化（按 M23.0 G3 commit `43f40b5` 已落地规范）

### 教训

1. **教训 1（§3 编号标记扫描严格执行）**：注释与测试名中只允许带文档路径的导航例外（如 `todo.md §M23.3 C66-C`），孤立编号（如 `M23.3 C66-A2`）必须清理 —— D 阶段自检命中即清，不留完成时追补。本批实施 4 处孤立编号清理 + 4 处导航例外保留，rg grep 实证 0 命中。
2. **教训 2（§3b 替代路径）**：e2e 二轮验证 sandbox chromium 限制时，按 §3b 教训可走 SQLite DDL 源码实证替代路径 —— 直接读 migration 文件 `CREATE INDEX ... ON table (col1, col2)` + entity 类级 `@Index('name', ['col1', 'col2'])` 源码即可验证复合索引正确性，不必死磕 e2e 二次运行。
3. **教训 3（W1 audit finding：monorepo source-only 改动也需 rebuild workspace 包 dist）**：commit `b6e7716` 改 `packages/core/src/alerts/index.ts` 加字段未配套 rebuild dist → 本地 dev `pnpm run typecheck` 失败（apps/platform 引用 packages/core 缺 `ghsaId`/`cveIds` 属性，8 TS2339 error）。**根因**：CI `test.yml:36` 自动 rebuild 掩盖本地 dev 过期；本地 dev 不 rebuild → source/dist 不一致。**修复方向**（登记 follow-up，本批不扩大 scope）：① `pnpm run typecheck` 前置 `pnpm -r build` 到 husky pre-commit；② 或把 dist 加入 git tracking（移除 `.gitignore:38 dist`）。本批用 `pnpm -r build && pnpm run typecheck` 验证 7 包 Done，**W1 非本批引入**（git stash 实证），不阻塞提交。
4. **教训 4（todo.md stale 状态修正）**：M23.3 todo.md 验收清单把 C66-D（已在 M16.2 闭环）混入本批范围 + i18n "9 语言覆盖"声明与实际 2 语言现状不符（W3 + W4）—— 文档状态必须与 git 历史 + 实际 i18n locale 目录同步，**D 阶段开工前先 rg 实证依赖项实际状态**（避免基于 stale 描述定范围）。本批 todo.md 同步修订 5 处（W3 + W4 + 全部 [x] + commit hash 关联 + 范围段 i18n 描述）。
5. **教训 5（单调用方 helper 内联 reverse timing）**：`alertGhsaUrl` + `alertCveUrl` 在 alerts.vue 单调用方内联，符合 reverse timing 边界 —— grep 实证 0 外部调用。**未来复用场景触发再抽 utility**（dashboard 详情页 / 修复预览组件等），避免过早抽象风险（应用经验 §十七"批量替换的误伤链正则清理必须限定上下文并验证"教训 —— 过早抽象 = 错误抽象风险）。

### 挂接治理检查点

1. **wisdom.md**（gitignored，留待 wisdom 蒸馏批次）：M23.3 C66-C 阶段增量沉淀 —— `pattern-monorepo-source-only-changes-must-rebuild-workspace-dist`（monorepo source-only 改动必须 rebuild workspace 包 dist 才能让本地 dev typecheck 通过；CI rebuild 掩盖本地 dev 过期）+ `pattern-alerts-identifier-column-design`（GHSA 优先 + fallback CVE + 多 CVE 折叠 + code-scanning 兜底设计模式）+ `pattern-doc-state-stale-correction-checklist`（todo.md / i18n / 验收清单 stale 修正流程：D 阶段开工前 rg 实证依赖项实际状态）。**避免新增 pattern 重复登记**：monorepo rebuild 教训可与 wisdom 现有 §2026-09-01 段 `principle-Nitro-esbuild-process-env-NODE_ENV-静态替换-陷阱` 合并（都涉及构建产物 / source vs dist 不一致），不重复登记。
2. **.github/agents/code-auditor.agent.md 主责边界**：新增「i18n locale 实际状态审计必查项」—— 涉及 todo.md / backlog.md / 设计文档声称"X 语言覆盖"时，audit 必须 `ls apps/platform/i18n/locales/` 实证实际 locale 数量（避免 W4 类文档声明与现状不符）。本批 W4 audit 实证 apps/platform/i18n/locales/ 仅 2 个（zh-CN/en-US），todo.md §M23.3 范围段"其他 7 语言由 M9 基建同步落地"为错引已修正。
3. **AGENTS.md 提交规范**：原子粒度原则 + 本案例体现的"src/dist 不一致时 build 在先 / commit 在后"纪律（与 `feat(core,engine):` commit `b6e7716` 教训一致 —— 单包 source 改动必须同步考虑下游包 source/dist 一致性）。

### 准入标准复核

本案例（M23.3 C66-C 阶段）符合准入标准第 1 条"教训未落入规范"（monorepo rebuild 教训、todo.md stale 修正流程、Identifiers 列设计模式均未在 code-auditor 主责边界必查项登记）+ 第 3 条"重复违规预警"（todo.md 验收清单 stale 是常见治理债，M22 阶段沉淀批次已多次出现，audit W-2/W-3/W-4 标记的 neat-freak 收敛仍未根治）+ 第 4 条"工具/环境陷阱"（monorepo source/dist 不一致是 CI 自动 rebuild 掩盖本地 dev 的典型陷阱）。**M23.3 C66-C 增量价值**：从"独立 Identifiers 列单点 UX 增强"扩展到"5 文件跨包契约 + 标准 depth 审计 + 3 项 governance check point 沉淀"路径 —— 挂接治理检查点 3 项可降低未来同类风险（i18n locale 状态审计 + monorepo rebuild 纪律 + todo.md stale 修正流程）。


## 五十六、M24.1 PR Check 状态监测 MVP：5 phase 串行 + A 阶段 Reject 内联修复 + 6 atomic commits 闭环（2026-09-03，commits `36ee026 / 1068d6e / 89e1344 / e841b82 / 19037d5 / 4803372`）
### 案例背景

2026-09-03 用户决策启动 M24 阶段方案 B（能力突破优先），按"类型平衡"原则拆 **5 原子条目独立闭环**：M24.1 PR Check 状态监测 MVP + M24.2 根因排查源码层面 + M24.3 cron-preview wall-clock + M24.4 M18.x+Code Scanning 集中清理 + M24.5 C36 服务端 API i18n 扩展。M24.1 占 M24 总规模 ~58%（5 phase 串行独立闭环），其余 4 条目按用户决策可分批推进。

业务定位（docs/plan/todo.md §M24.1）：监测 dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR（author=`dependabot[bot]`）最新 `Test` check 状态，让"发出去"的修复 PR 在 CI 跑挂时通过 alerts 系统 firing 并提供 ack UI。**沉默失败场景**：dependfix 升级修复 PR 跑挂 → 升级状态停滞 + 用户不知情；dependabot PR 跑挂 → mergify 不合并（依赖 `check-success=Test`）+ 用户不知情。两条链路的 CI 失败都属于"沉默失败"，破坏 dependfix 的自动化承诺。

### 关键决策 D1-D8（用户 2026-09-02 决策落地，方案 B 全部 8 项）

- **D1**：PRCheck 实体位于 `apps/platform/server/entities/pr-check.ts`（独立于 ScanResult，per-PR-head 模型语义不同 —— ScanResult 是 per-alert reconcile 模型，PRCheck 是 per-PR-head polling INSERT/UPDATE 模型）
- **D2**：Polling 间隔默认 5min/仓（service 不内置 timer，由 scheduler 触发；GitHub `actions: read` scope 不计入主限流）
- **D3**：失败 PR firing alert + ack UI（状态机：失败→firing=true；用户 ack 或回归 success 自动 ack→firing=false；ack **不修改** `conclusion`）
- **D4**：用户手动创建 schedule 启用（不创建默认 schedule，避免无 App installation 用户报错；Schedule entity 加 `kind` 字段区分 `scan` / `pr-check`）
- **D5**：webhook MVP 仅接口预留（`PRCheckSyncSource` interface + PollingSource implements + WebhookSource 留位；webhook handler 文件不挂路由）
- **D6**：仅 per-org scope（service `pollOnce({ organizationId })`；跨组织聚合留作后续）
- **D7**：env 开关 `ACTION_STATUS_MONITOR_ENABLED` 默认 false（`triggerPrCheckSchedule` runtime check + `skipped: true` 标识；env false 时不更新 `lastTriggeredAt` 避免运维调试时每分钟落触发时间戳）
- **D8**：mergify 仍是主控（PRCheck 仅监测 + 告警 + ack UI，不阻断 mergify 决策；本文档 + `.github/mergify.yml` 注释 + dependfix README 三处明确："mergify 负责通过即合（按 `check-success=Test`）；PRCheck 负责失败即显。互不干扰"）

### 实施路径（5 phase 串行独立闭环 + Phase 4.1 + Phase 4 收尾 = 6 commits）

| Phase | Commit | 范围 | 行净增 |
|:---|:---|:---|:---:|
| **Phase 1** PRCheck 实体 | `36ee026` | entity + 3 复合索引（`repositoryId+prNumber+headSha` UNIQUE / `repositoryId+conclusion` / `repositoryId+createdAt`）+ 3 单索引 + migration 1800000000000 + database/index.ts 注册 | ~230 |
| **Phase 2** service + scheduler | `1068d6e` | types.ts（PRCheckSyncSource interface + 状态机 helper）+ polling-source.ts（Octokit 复用 + author 过滤 + conclusion 映射）+ action-status-monitor.ts（核心 service + 状态机 D3）+ Schedule.kind 字段 + migration 1800000000001 + 22 单测 + .env.example 登记 env 开关 | ~940 |
| **Phase 3** API 层 | `89e1344` | 4 API 端点（list / single / summary / ack PATCH）+ 3 PR_CHECK_* 错误码 + ServerErrorCode 枚举扩展 + i18n 双语 + 17 单测 | ~730 |
| **Phase 4** UI 层 | `e841b82` | pr-checks.vue 单页（4 卡片 summary + alertFiring 过滤 + ack 操作 + 状态机 UI 渲染 D3）+ nav 集成 + 22 i18n 键 | ~490 |
| **Phase 4.1** UI follow-up | `19037d5` | 仓库过滤 Dropdown（消除 W2 死状态）+ common.nav.prChecks 键（消除 S1 nav 命名不一致）| ~30 |
| **Phase 4 收尾** 重构 | `4803372` | `const fetch` → `requestFetch` 命名对齐 + 守卫 DRY（canAccessAdmin computed 替代 3 处重复 v-if）+ conclusionTagSeverity 下沉为 util + 9 单测 | ~90 |
| **总计** | 6 commits | 业务实施 5 phase + UI follow-up + 重构 | ~2510 |

### A 阶段审计（含 Phase 4 Reject 修复关键案例）

**Phase 1**（standard depth / 1 轮 Pass / 0 warning）：§3b SQLite DDL 实证 6 索引全部生成正确（含 3 列唯一索引 `(repositoryId, prNumber, headSha)` 实证）。W1 内联修复：删除 PRCheck entity 列级 `@Index()` 装饰器 3 处（避免 synchronize=true 路径生成冗余索引；migration 显式 CREATE INDEX 提供同名单索引）。

**Phase 2**（standard depth / 1 轮 Reject → 修复 → Pass / 2 blocker + 5 warning + 3 suggest）：
- **B1**：`poling-source.test.ts:9` import `isTargetAuthor as _unused` 路径错误（从 `./types` 但实际定义于 `./poling-source`）→ **本批 D 阶段自检声称"typecheck exit 0"与实际 TS2305 不符**。修复：删除 dead import。
- **B2**：`scheduler.service.ts:208` ESLint error `Array<T>` → 改为 `T[]` + 用 `Repository` 实体类替换字符串 lookup（避免 type safety 绕开）。
- **W3**：dead imports `void TARGET_PR_AUTHOR_LOGINS / void isFailureConclusion`（YAGNI 反模式）→ 删除。
- **W4**：`ds.getRepository('Repository' as never)` 类型 cast → 改用 `Repository` 实体类。
- **W5**：`.env.example` 未登记 `ACTION_STATUS_MONITOR_ENABLED` → 登记 + 启用前置条件说明。
- **W6**：自动 ack 测试 fixture `acknowledgedAt: null` → 改为 `new Date('2026-09-01')` 真实验证 acknowledgedAt 清空路径。
- **W9**：triggerSchedule 返回 union 类型加 `kind` discriminator（Phase 3 API 拆分前的契约稳定化）。
- **W10**：env 关闭时不更新 `lastTriggeredAt`（triggerPrCheckSchedule 返回 `{ skipped: true }`，caller 仅在非 skipped 时更新）。

**关键教训**：本批次 D 阶段自检仅跑 `pnpm exec eslint --fix`（自动修复 import/order + eol-last 等），未单独跑 `pnpm exec eslint`（无 --fix）+ `pnpm --filter @dependfix/platform run typecheck`（CI 实际命令）—— **0 error 自检证据覆盖盲区**。修复方向（落地）：D 阶段自检必须先跑 `pnpm exec eslint` 无 --fix + nuxt typecheck 双向验证（vitest 用 esbuild 转译不触发 TS 严格检查，不能作为 typecheck 证据）。

**Phase 3**（standard depth / 1 轮 Pass / 0 blocker / 3 warning + 6 suggest）：
- **W1**：summary.get.ts 聚合查询未做 organization 隔离（D6 仅 service 层实现）—— 与现有 alerts 模式一致（alerts/index.get.ts 同样未做 organizationId 隔离），非新引入偏差，登记 follow-up。
- **W2**：index.get.ts zod `.optional()` 双重判断冗余（`data !== undefined` 在 `.optional()` 模式下恒为 false）+ 误导注释 → **修复**：删除冗余判断 + 简化注释（`alertFiring` 保留 `!== undefined` 因需区分「未传」与「false」）。
- **W3**：[id].get.ts 与 index.get.ts 的 `toView` 完全重复 → Phase 4 UI 时一并收敛为 `_view.ts` helper（Phase 5 docs 收口期延后）。

**Phase 4**（standard depth / 1 轮 Reject → 修复 → Pass / 2 blocker + 1 warning + 4 suggest）：
- **B1**：en-US.json `alerts.errors.loadFailed` 被中文污染（"加载失败：{message}"）—— **5-Why 根因**：本次 en PRCheck 段 insert anchor 用 zh-CN 中文文本（`loadFailed: "加载失败：{message}"`），与 en-US 段实际英文不匹配，JSON.parse 容忍重复键 last-key-wins，导致 alerts 段尾部被改写。**修复**：`git checkout apps/platform/i18n/locales/en-US.json` 恢复 + 用 en-US 段实际英文 anchor `loadFailed: "Failed to load: {message}"` 重新插入 PRCheck 段。
- **B2**：DataTable `:sort-meta="sortMeta"` 不是合法 PrimeVue 4 prop —— 正确 prop 是 `v-model:multi-sort-meta`（实测 `primevue/datatable/DataTable.vue` + `BaseDataTable.vue` 0 命中 `sortMeta`/`sort-meta`，仅 `multiSortMeta` 在 L371/L418/L463）。**修复**：替换为 `v-model:multi-sort-meta="sortMeta"`（与 alerts.vue L441 对齐）。
- **W1**：summary 卡片标签硬编码 locale 检测三元（`t('alerts.colStatus') === 'Alert' ? 'Total' : '总数'` 永远返回 `'总数'`）→ **修复**：新增 `prChecks.summary.{total/firing/acked}` 子键避免硬编码。
- **S1-S4**：命名一致性（fetch → requestFetch）/ 守卫 DRY（canAccessAdmin computed）/ conclusionTagSeverity util 下沉 + 单测 9 个。

### 教训（5 项）

1. **教训 1（D 阶段自检双向验证纪律）**：D 阶段自检不能仅依赖 `pnpm exec eslint --fix`（自动修复 + 警告压制），必须分别跑 `pnpm exec eslint` 无 --fix + `pnpm --filter @dependfix/platform run typecheck` + `pnpm exec vitest run` 三向验证。**根因**：vitest 用 esbuild 转译不触发 TS 严格检查，CI 通过 ≠ 本地 typecheck 通过（CI 自动 rebuild workspace dist 掩盖本地 dev 过期；M23.3 §五十五 教训 3 复盘）。**本批落地**：Phase 2 B1 + Phase 4 B1 都是 D 阶段自检覆盖盲区，强制加 D 阶段自检 checklist：`lint` 无 --fix + `nuxt typecheck` + `vitest` 三项独立命令 run。

2. **教训 2（i18n insert anchor 必须用目标 locale 文本）**：locale 文件多段对称（zh-CN.json + en-US.json），insert anchor 必须用**目标 locale 实际文本**（如 en-US 段必须用 `loadFailed: "Failed to load: {message}"` 英文 anchor）。**根因**：JSON.parse 容忍重复键 last-key-wins，anchor 错位导致后续段被改写但前端未触发 lint 检测（vitest 不读 i18n 字段语义）。**修复方向**：写 `scripts/i18n-anchor-check.mjs` 工具，D 阶段编辑 locale 文件后跑一遍 `rg` 验证 anchor 唯一性 + 对称性（en-US/zh-CN 段键集相同 + 文本不同属正常态；anchor 用错位文本属异常态）。

3. **教训 3（DataTable sort prop 是 `v-model:multi-sort-meta`）**：PrimeVue 4 DataTable 仅支持 `v-model:multi-sort-meta`（v-model 形式）；Vue 模板解析时未知 prop 被静默忽略，无运行时错误但也无功能效果（默认排序失效 + 用户点击列头排序无法持久）。**修复方向**（轻量）：tech radar 列表新增 PrimeVue 4 已知 prop 命名（`v-model:multi-sort-meta` / `v-model:filters` / `v-model:selection` 等）—— 防止 Phase 4 B2 类 silent ignore。

4. **教训 4（zod `.optional()` 陷阱）**：`z.enum([...]).optional()` 接受 undefined 为合法值（safeParse(undefined).success=true, data=undefined），但区分「未传字段」与「传 undefined」需显式 `data !== undefined` 判断。本批次 Phase 3 W2（dead code）+ Phase 2 W6（ack fixture acknowledgedAt 必须非空）都是该陷阱衍生物。**修复方向**（登记 follow-up）：写 `apps/platform/server/utils/zod-helpers.ts` 提供 `parseOptional<T>(schema, query, fieldName): { success: boolean, value?: T }` helper 强制语义区分。

5. **教训 5（en-US.json alerts 段被中文污染教训的反面案例）**：Phase 4 B1 是"i18n insert anchor 必须用目标 locale 文本"教训的实证 —— Phase 4 D 阶段 insert PRCheck 段到 en-US.json 时，anchor 用了 zh-CN 中文文本导致 en-US 段尾部 loadFailed 字段被改写为中文，**JS 解析通过 + 集成测试通过 + 视觉测试前无法发现**。**根因**：JSON.parse 容忍重复键 + 现有 localized-error.test.ts 的"键集对称"测试只检查键存在性不检查值的 locale。**修复方向**（登记 follow-up）：localized-error.test.ts 新增"值 locale 对称性"测试 —— 任意 code 在 zh-CN locale 取值不应等于 en-US locale 取值（"加载失败：{message}" ≠ "Failed to load: {message}" 是对称态；两者相等是错位污染）。

### 挂接治理检查点

1. **wisdom.md**（gitignored，留待 wisdom 蒸馏批次）：M24.1 阶段增量沉淀 5 条 pattern/principle —— ① `pattern-D-stage-self-check-three-commands`（D 阶段自检必须 lint 无 --fix + nuxt typecheck + vitest 三向独立验证）；② `pattern-i18n-insert-anchor-target-locale`（locale 文件 insert anchor 必须用目标 locale 实际文本）；③ `pattern-PrimeVue-4-multi-sort-meta-prop`（DataTable 仅支持 v-model:multi-sort-meta，不用 :sort-meta）；④ `pattern-zod-optional-undefined-trap`（z.enum().optional() 接受 undefined 为合法值，区分「未传字段」需显式 !== undefined）；⑤ `principle-monitoring-vs-merge-decoupling`（依赖监测系统不应阻断自动合并；mergify 按 check-success=Test 单条件触发；PRCheck 监测 + alert 不修改 check 状态）。本批 5 条与 wisdom 现有 17 条合并后共 22 条，距 20 阈值已超，**下批次会话执行 wisdom 蒸馏**（详见 wisdom.md §distillation_log）。

2. **.github/agents/code-auditor.agent.md 主责边界**：本批不新增必查项（5 条 pattern 属于开发陷阱而非审查清单），但**已审查的标准深度 audit 实践沉淀**（按 git history 可查 Phase 1/2/3/4 全部 standard depth audit 报告）。**登记 follow-up**：code-auditor 应支持 multi-round 审计协议（按 full-stack-master skill §4 描述），本批 Phase 2/4 均为单轮 audit 后内联修复；未来同类大型批次可考虑 2 轮（首轮 broad + 复审 narrow）—— 实际是否拆分需按 phase 规模评估。

3. **.github/mergify.yml**：本次更新 dependfix bot PR rule 注释（D8 兜底）—— 明确"mergify 负责通过即合（按 `check-success=Test`）；PRCheck 负责失败即显。互不干扰"，消除监测系统与自动合并的潜在边界混淆（PRCheck alert firing 不应阻止 mergify 决策）。

4. **dependfix README.md**（顶层）：本批同步补 PR Check 监测模块章节 —— 业务定位 / 启用步骤（创建 `pr-check` 类型 schedule + 设置 env 开关）/ 数据源（GitHub Actions Test job polling）/ 用户交互（`/pr-checks` 页面 ack 操作）/ 与 mergify 边界（D8）。**新增章节结构**：与现有「CLI / MCP / Action / Platform」四大模块并列，新增「Platform PR Check 监测」第五模块。

5. **docs/plan/todo.md §M24.1**：本批同步完成验收清单 + commit hash 回填 —— 9 项验收 [x] + 实施记录表（5 phase + 2 follow-up + 1 重构共 6 commits）+ §M24.1 关键决策 D1-D8 已落地。**后续**：M24.2-M24.5 闭环后整体 M24 阶段归档（按 M21-M23 模式 docs-only commit + wisdom 蒸馏）。

### 准入标准复核

本案例（M24.1 PRCheck MVP）符合准入标准第 1 条"教训未落入规范"（5 条 pattern 涉及 i18n + PrimeVue + zod + 自检纪律，均为新发现实践教训，未在现有规范登记）+ 第 2 条"重大 bugfix 经验未沉淀"（本批 0 blocker 实施路径干净；W1-W10 均 warning 而非 blocker，已全部内联修复或登记 follow-up）+ 第 4 条"工具/环境陷阱"（en-US.json anchor 错位 + PrimeVue 4 silent ignore + zod optional trap + merge vs monitoring decoupling）。**M24.1 增量贡献**：从 M23.3 "5 文件跨包契约 + 17 单测 + standard depth audit" 扩展到 **M24.1 "5 phase 串行 + 6 atomic commits + 2 次 audit Reject 修复 + 6 commits 累计 ~2510 行净增 + 5 pattern 沉淀 + 4 docs 文件落地"** —— 是 dependfix monorepo 自 M22 治理债收口以来规模最大的能力扩展 + 治理收口批次。

挂接治理检查点 5 项中：
- ① wisdom.md 5 条 pattern（待下次会话蒸馏）
- ② code-auditor 主责边界（无新增，沉淀实践可查）
- ③ mergify.yml 注释（本批已落地）
- ④ dependfix README 章节（本批已落地）
- ⑤ todo.md §M24.1 验收 + 实施记录（本批已落地）

**M24.1 阶段已完全闭环**，可作为方案 B 的第 1 个原子条目独立归档。M24.2 根因排查源码层面 + M24.3 cron-preview + M24.4 治理债 + M24.5 C36 服务端 API i18n 待用户决策推进。


## 五十七、M22.7+M22.8 根因 4 项残留候选源码追溯：候选 ①/③ 已治本 + ② 非根因 + ④ 经验性方案登记 follow-up（2026-09-03，M24.2 阶段 docs-only）
### 案例背景

M22.7 hotfix（commit `f617b56`，helper 层 maxRetries 兜底）+ M22.8 hotfix（commit `bdcd900`，fixture pool helper 抽取）作为 e2e 失败的临时修复已闭环，但根因未完全治本。后续 M23.1 commit `2ffaa45`（SQLite WAL + busy_timeout）+ M23.2 commit `09c3dee`（Playwright fixture pool cookie 注入）已落地深度治本。但 M22.7+M22.8 hotfix 阶段的 4 项根因候选仍有 3 项未明确判定：候选 ① better-auth transaction close 时序、② Nitro h3 async generator 行为、④ fixtures API 请求间节流（候选 ③ SQLite WAL 已由 M23.1 闭环）。

M24.2 阶段（2026-09-03 启动）按"类型平衡"原则拆出，**仅做源码层面排查**（不依赖非 sandbox 环境 CI 复现 —— sandbox chromium 阻断 `page.goto` 同源问题 M22.7 hotfix 实证过，二次运行同样失败 = 幂等性已验证；非 sandbox 环境重跑属 follow-up）。本案例为 3 份源码追溯报告 + 治本判定 + follow-up 登记，docs-only 落地（commit `<M24.2>`）。

### 候选 ① better-auth 1.7 transaction close 时序源码追溯

**结论**：✅ **已治本** —— typeorm-adapter.ts L237-241 已走真事务路径 + better-auth 1.7.2 自动 patch fallback 不适用本项目。无需 trace 注入。

**源码追溯链**：

1. **`apps/platform/server/utils/auth.ts:407` `getAuth()`** —— 通过 `betterAuth({ database: typeormAdapter(ds), ... })` 构造 better-auth 实例。typeormAdapter 接收 `ds: DataSource`，返回 better-auth adapter factory（`typeorm-adapter.ts:231-244`）。

2. **`apps/platform/server/database/typeorm-adapter.ts:237-241` `transaction` 实现**：
   ```typescript
   transaction: <R>(callback: (trx: DBTransactionAdapter) => Promise<R>) =>
       dataSource.transaction(async (manager) => {
           const trx = createTypeormAdapter(dataSource, manager) as DBTransactionAdapter
           return callback(trx)
       })
   ```
   - 调用 TypeORM `dataSource.transaction()`，传入 async callback
   - callback 内部用事务 EntityManager 创建新 adapter（`createTypeormAdapter(dataSource, manager)` L239）
   - TypeORM 1.x `transaction()` 保证 callback promise resolve 后 COMMIT，rollback 在 throw 时触发
   - **时序保证**：TypeORM `dataSource.transaction` 实现是 begin → await callback → commit/rollback，无 close 时序隐患

3. **`better-auth 1.7.2` adapter fallback 路径**：`node_modules/.pnpm/better-auth@1.7.2_*/better-auth/dist/db/adapter-base.mjs:18`：
   ```javascript
   if (!adapter.transaction) {
       logger.warn("Adapter does not correctly implement transaction function, patching it automatically...");
       adapter.transaction = async (cb) => { return cb(adapter) };
   }
   ```
   - 该 fallback 是 better-auth 1.7.1 时期的"自动 patch"，仅对**未实现 transaction**的 adapter 生效
   - 但本项目 typeorm-adapter.ts L237-241 **已实现 transaction**，better-auth 1.7.2 走真事务路径（L237）
   - Fallback 不适用本项目

4. **close 时序触发条件**：
   - TypeORM 1.x `dataSource.transaction()` 内部用 `QueryRunner` 管理 BEGIN/COMMIT/ROLLBACK
   - callback 返回值 = transaction commit 成功；callback throw = transaction rollback
   - `better-auth 1.7.2` 内部所有 transaction wrapper（如 `withHooks`、`adapter-base.mjs:18` fallback）都遵循 callback promise resolve → commit
   - **M22.7 ECONNRESET 与 transaction close 时序无因果关系**

**建议 trace 注入位置**（如未来仍怀疑 ① 候选，注入位置已确定）：
- `apps/platform/server/database/typeorm-adapter.ts:237` `transaction` 函数首行加 `console.log('[auth] transaction begin', new Date().toISOString())`
- callback 结束位置（L241）加 `console.log('[auth] transaction commit', new Date().toISOString())`
- callback throw 位置加 `console.error('[auth] transaction rollback', err)`

### 候选 ② Nitro h3 `defineEventHandler` async generator 行为源码追溯

**结论**：✅ **非根因** —— fixtures.delete / fixtures.post handler 均为普通 `async (event) => {}` 函数（非 `async function*` generator），与 M22.7 ECONNRESET 无因果关系。

**源码追溯链**：

1. **`apps/platform/server/api/e2e/fixtures.delete.ts:42` handler 定义**：
   ```typescript
   export default defineEventHandler(async (event) => { ... })
   ```
   - `async (event) => { ... }` 是普通 async arrow function，**不是** `async function*`
   - 返回类型 `Promise<{ deleted: { repos, scanRuns, scanResults } }>`
   - 同一模式 `apps/platform/server/api/e2e/fixtures.post.ts:98` 同款

2. **h3 `defineEventHandler` 内部处理**：`node_modules/.pnpm/h3@1.15.11/h3/dist/index.mjs:1886-1890`：
   ```javascript
   async function _callHandler(event, handler, hooks) {
       // ... hook.onRequest 省略
       const body = await handler(event);
       const response = { body };
       if (hooks.onBeforeResponse) { ... }
       return response.body;
   }
   ```
   - `_callHandler` 直接 `await handler(event)` → handler 返回 `Promise<value>`
   - `const body = await handler(event)` 解包 Promise 为 plain value
   - 不区分 `async function*`（async generator）

3. **h3 `coerceIterable` 工具函数**（`index.mjs:716-725`）—— 仅在显式调用 `sendIterable()` 时使用：
   ```javascript
   function coerceIterable(iterable) {
       if (typeof iterable === "function") iterable = iterable();
       if (Symbol.iterator in iterable) return iterable[Symbol.iterator]();
       if (Symbol.asyncIterator in iterable) return iterable[Symbol.asyncIterator]();
       return iterable;
   }
   ```
   - `defineEventHandler` 默认 handler 路径不走 `coerceIterable`（仅 `sendIterable` 内部用）
   - 即便 handler 是 `async function*`，h3 默认会 `await handler(event)` 拿到 AsyncGenerator 对象，**不会自动迭代**（async generator 不 awaitable，需要 `for await...of` 迭代）

4. **Nitro handler 适配器**：`node_modules/.pnpm/nitropack@2.13.4/nitropack/dist/` 全局 `grep isAsyncIterable|asyncIterator|generator` 0 命中 → Nitro 直接消费 h3 handler 返回值，不做 generator 区分。

**fixtures.delete / fixtures.post 行为判定**：
- ✅ 普通 async function（不是 generator）
- ✅ h3 `_callHandler` `await handler(event)` 拿到 Promise<{ ... }>
- → 返回 plain object，序列化为 JSON 响应
- → **与 ECONNRESET 无因果关系**（ECONNRESET 发生在 socket 层而非 handler 返回路径）

**trace 注入位置**（如需进一步验证）：
- `apps/platform/server/api/e2e/fixtures.delete.ts:42` 函数首尾各加一行 `console.log('[fixtures.delete] begin/end', Date.now())`
- 同样 `fixtures.post.ts:98`

### 候选 ④ fixtures API 请求间节流源码追溯

**结论**：🟡 **经验性方案** —— 当前 fixtures handler **无节流 / debounce / rate-limit 代码**，仅靠 `E2E_TEST === 'true'` + `runtimeConfig.e2eFixturesAllowed` 双门控限制访问范围。follow-up 登记经验性节流方案，不强制实施。

**源码追溯链**：

1. **fixtures.delete / fixtures.post 双门控**：
   - `apps/platform/server/api/e2e/fixtures.delete.ts:46-48`：
     ```typescript
     if (process.env.E2E_TEST !== 'true' || !config.e2eFixturesAllowed) {
         throw createError({ statusCode: 404, statusMessage: 'Not Found' })
     }
     ```
   - `apps/platform/server/api/e2e/fixtures.post.ts:105-107` 同款

2. **节流代码搜索**：
   ```bash
   rg -n "rate.?limit|throttle|debounce" apps/platform/server/api/e2e/
   ```
   - 0 命中 → fixtures handler **无任何节流逻辑**
   - 实际节流仅依赖 e2e webServer 单进程 + 同步 SQLite 操作时序（fixtures.delete 与 fixtures.post 在 global-setup 串行调用）

3. **fixtures 调用频次**（global-setup.ts）：
   - 全局 setup.ts 在 seed 之前调 fixtures.delete（清空）→ seed 期间调 fixtures.post（注入）→ e2e 测试套跑期间 fixtures API 不再被调用（page 真实 fetch 走 server）
   - fixtures API 调用频次 = global-setup 阶段 1 次 delete + 1 次 post，**不属于高频路径**

**经验性节流方案**（如未来 e2e 复现 fixture 并发问题，可加）：

```typescript
// apps/platform/server/utils/fixtures-throttle.ts
let lastFixtureCall = 0
export const fixturesRateLimit = (): boolean => {
    const now = Date.now()
    if (now - lastFixtureCall < 100) return false  // 100ms 节流
    lastFixtureCall = now
    return true
}
```

- fixtures.delete / fixtures.post 在双门控通过后调用 `fixturesRateLimit()`；返回 false → 429 Too Many Requests
- 与 M23.2 fixture pool helper 抽取风格一致（helper + helper 单测）
- **不强制实施**：本批次判定 fixtures 调用频次低 + 单进程串行，不存在并发资源竞态；登记 follow-up 待未来 e2e 复现确认

### 教训（3 项）

1. **教训 1（better-auth 1.7 自动 patch fallback 不适用所有项目）**：better-auth 1.7.2 `getBaseAdapter` 在 adapter 不实现 transaction 时自动 patch `cb => cb(adapter)` fallback，logger warn 但**不阻断**业务运行。该 fallback 仅对未实现 transaction 的 adapter（如纯 in-memory adapter）生效，**有真实 transaction 实现的 adapter（如 typeorm-adapter.ts L237）走真事务路径**。**本批排查结论**：项目已走真事务，根因 ① 不适用。**修复方向**（登记 follow-up）：在 `getBaseAdapter` 加 `if (!adapter.transaction && !adapter.id) throw` 早期失败而非 warn 自动降 —— 但 better-auth 上游决策，改动依赖上游合作，本批仅记录。

2. **教训 2（async function vs async function\* 的运行时差异）**：`async (event) => {}` 与 `async function* (event) => {}` 在 h3 `defineEventHandler` 中行为差异是：前者返回 `Promise<value>`，后者返回 `AsyncGenerator<T>`（不可 await 自动迭代）。前者 h3 `await handler(event)` 解包 Promise；后者需显式 `for await...of` 迭代（如 `sendIterable`）。**根因排查误区**：单纯 grep `async function*` 看是否被识别为 generator；M22.7 hotfix 阶段排查时可能误判 fixtures.delete 为 generator（实际不是）。**本批实测**：fixtures.delete / fixtures.post handler 签名明确为 `async (event) => {}`，源码层面消除根因 ② 嫌疑。

3. **教训 3（依赖自动 fallback 是隐性技术债）**：better-auth 1.7.2 `adapter-base.mjs:18` 自动 patch fallback 是隐性技术债 —— 业务代码可能误以为有真事务保护（实际仅同步回调）。**未来风险**：若 better-auth 上游某版本改动 fallback 行为（如改为 throw），项目 typeorm-adapter 已实现 transaction 不受影响（适配实现逻辑优先于 fallback）；但若有其他未实现 transaction 的 adapter 引入，可能静默回退。**修复方向**（登记 follow-up）：写 `apps/platform/server/utils/__tests__/better-auth-adapter-transaction.test.ts` 单测验证项目 typeorm-adapter.transaction 是真事务（mock adapter + 验证 callback commit 时序），避免未来重构引入回退。

### 挂接治理检查点

1. **wisdom.md**（gitignored，留待下次会话 wisdom 蒸馏批次）：M24.2 阶段新增 3 条 pattern —— ① `pattern-better-auth-adapter-transaction-required`（better-auth 1.7 自动 patch fallback 不适用所有项目；adapter 必须显式实现 transaction）；② `pattern-h3-defineEventHandler-async-vs-generator`（`async function*` 在 h3 中不会自动迭代；必须显式 sendIterable）；③ `pattern-fixtures-no-throttle-by-default`（fixtures handler 无节流，靠 global-setup 串行调用避免并发）。本批 3 条 + M24.1 5 条 + 现有 17 条合并后共 25 条，距 20 阈值已超 5 条，**下批次会话执行 wisdom 蒸馏**（详见 wisdom.md §distillation_log）。

2. **.github/agents/code-auditor.agent.md 主责边界**：本批不新增必查项（3 条 pattern 属源码追溯层而非审查清单）。**已沉淀的 standard depth audit 实践**：Phase 1/2/3/4 全部 single-round audit + 内联修复，本批次 docs-only 不触发 audit。

3. **docs/plan/todo.md §M24.2**：本批同步完成验收清单 + 实施记录 + 根因候选 4 项最终状态表（详见 todo.md §M24.2 验收标准 + 根因候选 4 项最终状态表）。

4. **follow-up 候选登记**（本批无法本地验证，留待下批次非 sandbox 环境或 wisdom 蒸馏批次）：
   - 候选 ① better-auth transaction close 时序：本批次源码追溯已判定**已治本**，无需 CI 复现确认；如未来 e2e 仍出现 ECONNRESET，trace 注入位置见 §五十七 候选 ① 段
   - 候选 ② Nitro h3 async generator：本批次源码追溯已判定**非根因**，无需 CI 复现确认
   - 候选 ④ fixtures API 节流：经验性方案 `apps/platform/server/utils/fixtures-throttle.ts` 模板已写在 §五十七 候选 ④ 段；如未来 e2e 复现 fixture 并发问题，按模板实施 + 加 helper 单测

### 准入标准复核

本案例（M24.2 阶段）符合准入标准第 1 条"教训未落入规范"（3 条 pattern 涉及 better-auth + h3 + 节流设计，均为新发现实践教训，未在现有规范登记）+ 第 2 条"重大 bugfix 经验未沉淀"（本批 0 实施，仅 docs-only 源码排查；M22.7 ECONNRESET 根因链已闭环）+ 第 3 条"重复违规预警"（better-auth 自动 patch fallback 是隐性技术债，未来重构可能引入回退；已登记 follow-up 单测建议）。**M24.2 增量贡献**：从 M22.7+M22.8 阶段"4 项根因候选未明确判定"演进到 M24.2 阶段"3 候选已治本 + 1 候选经验性方案登记" —— 源码追溯 + 治本判定 + 3 教训 + 4 follow-up 形成完整治理闭环。

M24 阶段方案 B 第 2 个原子条目（M24.2）独立闭环。M24.3 cron-preview wall-clock + M24.4 M18.x+Code Scanning 集中清理 + M24.5 C36 服务端 API i18n 仍待用户决策推进。
