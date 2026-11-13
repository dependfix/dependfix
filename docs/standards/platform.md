# 平台开发规范（apps/platform）

> 状态：已确认（2026-08-07 人工审查通过，6 项决策见 §12）
> 适用范围：`apps/platform/`（Nuxt 4 全栈管理平台）的代码、配置、实体、API、样式与测试。
> 基础规范：本规范是 [开发规范](./development.md)、[API 规范](./api.md)、[测试规范](./testing.md)、[安全规范](./security.md) 在平台子系统的细化与补充；冲突时以本规范（平台专属）为准。

## 1. 技术选型（版本以 pnpm-lock.yaml 为准）

Nuxt 4（全栈 SSR + API Routes，`app/` + `server/`）/ TypeScript strict / UI `caomei-ui`（`caomei-ui/nuxt` 模块，**精确锁版本**，1.0 前 API 可能调整）/ 纯 SCSS + BEM / better-auth（邮箱密码）+ 自研 TypeORM adapter / TypeORM 1.x / SQLite（默认，MySQL · PostgreSQL 预留）/ Zod / Vitest。

- 版本唯一事实源 = `apps/platform/package.json` + `pnpm-lock.yaml`，选型对应见 [技术栈](../guide/tech-stack.md)。
- **禁止引入未做验证的新大版本**；跨大版本升级须先走 probe 评估（参照 [momei 参考 §5](../research/2026-08-07-momei-platform-reference.md)）。

## 2. 目录结构（Nuxt 4）

`app/`（前端 srcDir：`assets/styles` · `components` · `composables` · `layouts` · `middleware` · `pages` · `plugins` · `utils`）+ `server/`（`api` · `database` · `entities` · `services` · `middleware` · `utils`）+ `Dockerfile` · `docker-compose*.yml` · `nuxt.config.ts` · `package.json`；逐目录职责见 [`apps/platform/`](../../apps/platform)。

- **目录约束**：`app/` 与 `server/` 不得互相 import（跨层通信走 API / runtimeConfig）；`server/utils/` 只放无状态工具与单例工厂，有状态业务放 `server/services/`；`server/entities/` 只放实体定义；文件名统一 **kebab-case**（含 Vue 组件 `kebab-case.vue`，与 [开发规范 §2](./development.md) 一致）。

## 3. 数据库规范（多后端兼容 + 时区）

- **3.1 环境变量（DATABASE_* 族）**：`DATABASE_TYPE` · `DATABASE_URL` · `DATABASE_PATH` · `DATABASE_SSL` · `DATABASE_ENTITY_PREFIX` · `DATABASE_SYNCHRONIZE` · `MACHINE_ID`——默认值与口径以 [平台配置指南](../guide/configuration.md) + [`.env.full.example`](../../apps/platform/.env.full.example) 为准（[§11](#_11-环境变量总表-env-example-对齐) 只列平台差异点）；`DATABASE_SYNCHRONIZE` 的反模式禁止见 [工程实践判例 EP-17](../design/governance/engineering-practice-notes.md)。
- **3.2 时区与列类型（关键约束）**：时间列**必须**经 `getDateType()` 取列类型（`server/database/type.ts`），**禁止**硬编码 `'datetime'` / `'timestamp'`（PostgreSQL 会静默产生时区偏移）；`postgres` 映射 `timestamp with time zone`；`CreateDateColumn` / `UpdateDateColumn` / 日期字段统一 `{ type: getDateType() }`，代码一律用 `Date` 对象。

### 3.3 DataSource 初始化

- 支持 sqlite / mysql / postgres，**显式传入 driver 实例**并顶层 `import` 驱动模块（供 Nitro Rolldown 静态分析，绕过 TypeORM 1.x 动态 require）。
- `synchronize` / `migrationsRun` 全场景显式 opt-in（含 dev / test）；启动期日志打印两值与各自 env；初始化失败不抛致命错误（告警 + 功能降级）；幂等单例 + 并发初始化锁。
- **迁移必须前缀感知 + 幂等**：统一用 `migration-helpers.ts`（`resolveTableName` 前缀回退 + `addColumnIfMissing` / `dropColumnIfExists` / `createIndexIfMissing`），并配「两种前缀 / 同时存在 / up-down 幂等 / 表缺失」用例；`queryRunner.connection` 已 deprecated，改用 `queryRunner.dataSource`。
- **基线迁移与空库自举**：首条迁移从实体元数据建全部基础表 / 索引 / 外键（前缀感知 + 跨方言 + 幂等，存量库整表跳过）；全新部署走 `pnpm db:init` 或 compose 默认 `DATABASE_MIGRATIONS_RUN=true`。⚠️ **任何列 / 表变更必须编写独立迁移**——基线由元数据生成，漏写会让全新库 / CI 全绿而存量库永久缺列。**且新迁移类必须登记进 `createDataSourceOptions().migrations` 数组**（唯一登记点；未登记则生产 `DATABASE_MIGRATIONS_RUN=true` + `synchronize=false` 路径永不执行，存量库永久缺列；防护见 `server/database/migrations/migrations-registry.test.ts` 的登记一致性与存量库真实迁移链用例）。
- **启动期 schema 漂移检测**：启动时只读比对实体元数据与实库表 / 列，缺失时打 ERROR 并把 `/api/health` 的 `schema` 置为 `drift`；`synchronize=true` 与 worker 进程跳过、检测失败 fail-open（`unknown`）。**只告警不阻断启动**，恢复路径见 [deployment.md「schema 漂移恢复清单」](../guide/deployment.md#schema-漂移恢复清单-no-such-column)。

- **3.4 实体规范**：继承 `BaseEntity`（雪花 ID + `getDateType()` 时间戳）；属性名 camelCase，列名由 `SnakeCaseNamingStrategy` 转 snake_case；better-auth 四表（`user` / `session` / `account` / `verification`）字段对齐默认 schema，**不得增删**，平台自有字段（如 `role`）经 `user.additionalFields` 声明并同步实体；跨库类型归一（SQLite `bigint` → `integer`；PG `bigint` → `integer`、长文本 → `text`），实体写法须保持三后端可编译。
- **3.5 TypeORM 查询模式**：`find()` **不支持嵌套路径 order by**（仅顶层字段，否则抛 `EntityPropertyNotFoundError`），「按关联实体字段排序」一律用 QueryBuilder（`leftJoinAndSelect` + `orderBy` / `addOrderBy`）；统一代码路径优先，同一查询不并存 `find` 与 QueryBuilder 两条路径。
- **3.6 e2e / fixtures 端点双门控规范**：`server/api/e2e/*` 端点**必须**叠加两道门控——① `process.env.E2E_TEST === 'true'`；② `useRuntimeConfig().e2eFixturesAllowed`（`nuxt.config.ts` runtimeConfig 注册，由 `NUXT_E2E_FIXTURES_ALLOWED` 注入），两条件同时满足才放行，否则 404。**禁止**以任何 `process.env.NODE_ENV` 形态（`=== 'production'` / `!== 'development'`）或 `import.meta.dev` 作第二门控（Nitro / esbuild 构建期把 `process.env.NODE_ENV` 静态替换为构建时值致表达式折叠，prod build 恒 404；`NODE_ENV !== 'development'` 无法清晰区分 dev / test / staging；`import.meta.dev` 无法区分 staging），**禁止**单 `E2E_TEST` 门控。D 阶段自检：逐个核对 `server/api/e2e/*.ts` 含双门控；`pnpm --filter @dependfix/platform build` 后 grep 产物确认表达式未折叠；A 阶段由 code-auditor 必查项覆盖。
- **3.7 SQLite 启动期备份 + 自检工具**：权威完整声明（备份路径 / fsync / 保留策略 / 命令式恢复 / 自检判断逻辑）见 [security.md §2.1](./security.md)，本节只保留平台角度差异化信息——**调用时机** `backup.ts` 在 `ensureDatabaseInitialized()` 之前同步调用，且与 3.6 双门控协同（见 [security.md §2.1.4](./security.md)）；**D 阶段自检**核对 `backup.ts` / `db-restore.ts` / `db-doctor.ts` 三文件存在且含核心实现（fsync / retention / `--yes` 门控 / 报告格式）；**A 阶段 Review Gate** 要求 `backup.ts` 含 fsync + retention、`db-restore.ts` 含 `--yes` 二次确认、`db-doctor.ts` 打印 schema_version + freelist_count。

### 3.7.1 fixtures API 无节流默认 + 节流触发条件

- fixtures handler **默认无节流 / debounce / rate-limit**，依赖调用方（`tests/e2e/global-setup.ts` 与各 suite）顺序串行调用；调用频次低（global-setup ≤ 2 次），不存在并发资源竞态。**触发条件**：CI 偶现 fixtures DELETE 502/503 + 资源释放竞态时，先复现再启用轻量节流（`server/utils/fixtures-throttle.ts`，100ms；超限 429），不加复杂锁。

- **3.8 仓库级自定义验证命令（verifyCommands，M32.1 C76）**：`Repository.verifyCommands`（text 列，JSON 数组字符串）声明该仓库验证命令链，覆盖引擎默认链，语义与 CLI `--commands` 对齐（空数组 / null 走默认链）。**单一事实源链路**：存储 `server/entities/repository.ts`（`parseVerifyCommands` 容错）→ 校验 `server/schemas/repository.ts`（≤ 20 条 / 每条非空且 ≤ 500 字符 / 禁换行与控制字符）→ 写入口 `POST /api/repos` + `PUT /api/repos/[id]`（`undefined` 不改 / `null` 或 `[]` 清空）→ 审计 `repository-audit.ts`（仅实际变化时记 `verify_commands_update`）→ 执行 `scan-orchestrator` → `ContainerExecutor` → 引擎 `{ commands }`。**安全边界（hard requirement）**：该字段等价于远程命令执行面（引擎以 `spawn(command, { shell: true })` 执行，不做脚本存在性校验）；写操作走 `requireRole(['admin', 'org_admin'])`（viewer 403）；变更登记 `AuditEvent`（审计失败仅日志不阻断保存）；**不**提供自由 shell 会话、**不**放宽单命令超时、**不**得当作沙箱已缓解该风险（`SandboxExecutor` 自 2026-11-09 起仅放行 report-only 真实执行，fix / fix-and-pr 降级 `container`；本配置仅对容器执行器生效）。**UI** 为仓库新增 / 编辑弹窗 `repo-form-dialog.vue`（多行文本一行一条）；review 检查点已由 code-auditor 必查项「修复执行安全基线」+「shell 命令安全」覆盖。
- **3.9 目标仓库配置文件 `.github/dependfix.yml`（C85）**：目标仓库自声明配置（与 `dependabot.yml` 同范式），首批仅 `overrideProtect`；读取 / 合并 / 降级矩阵以 [依赖升级修复器 §12.7](../design/modules/dependency-fixer-records.md) 为唯一权威，本节只记平台侧接线。**平台侧无需额外接线**（`container-executor.ts` 在 fix / fix-and-pr 下先 clone 再构造引擎实例，引擎构造期读取 `<workDir>/.github/dependfix.yml`；报告模式（report-only）不 clone、不 commit → 行为不变）；**不提供 UI 入口**（随目标仓库走，平台不落库、不暴露表单，与 3.8 的「平台字段」形态刻意区分）；**中央优先**（平台透传的中央 `overrideProtect`（env / CLI）一旦指定，目标仓库声明即整体被忽略）；**可观测性**（生效 / 被中央覆盖 / 降级告警均写引擎日志，平台 `MemoryLogger` 捕获并展示在执行日志；命中保护记 `OVERRIDE_PROTECTED`，见 [override-protect-policy.md](../design/governance/override-protect-policy.md)）；**review 检查点挂接**——「中央优先（防绕过）」与「不提供 UI 入口」两条已挂 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵-严格约束逐条挂接)。

## 4. 认证规范（better-auth）

- **4.1 实例配置（`server/utils/auth.ts`）**：邮箱密码登录；`requireEmailVerification` + `sendVerificationEmail` 由服务端按 `smtpHost`（运行时 `NUXT_SMTP_HOST`）是否非空派生——**SMTP 未配置自动跳过验证**；裸 `SMTP_*` 只在构建期求值，容器运行期必须用 `NUXT_SMTP_*`；会话 `expiresIn 30d` / `updateAge 1d` / `storeSessionInDatabase: true`，`advanced.database.generateId` 用雪花 ID（与实体 `@BeforeInsert` 同源）；**首用户自动 admin**（`databaseHooks.user.create.before` 判断用户数，首个注册用户 `role = 'admin'`），`role` 经 `user.additionalFields` 声明（`input: false`，防客户端注入）；认证 API 挂载 `server/api/auth/[...].ts`，客户端 `app/utils/auth-client.ts` + `app/composables/use-session.ts` + `app/middleware/auth.ts`（未登录跳 `/login`）。

### 4.2 TypeORM adapter（`server/database/typeorm-adapter.ts`）

- 使用 better-auth `createAdapterFactory` 实现 CustomAdapter 8 方法；`consumeOne` / `incrementOne` 提供原生实现。
- **必须显式实现 `transaction`**：`dataSource.transaction(async (manager) => callback(createAdapter(manager)))`——adapter 不实现时 better-auth 会自动 patch 非事务 fallback（仅同步回调）+ warn 但不阻断。**防御**：写单测锁定项目 adapter 走真事务路径，防后续重构回退。
- 字段映射：实体属性名 = better-auth schema 字段名（camelCase），列名由命名策略转换（adapter 不感知列名）；禁止在 adapter 中 import 业务实体。

## 5. 凭据安全规范（T602 起生效）

- 平台级密钥 `NUXT_ENCRYPTION_KEY`（AES-256-GCM，32 字节 base64 或 hex）；未配置时**禁用凭据功能并明确报错**（不静默降级为明文）。服务经 `useRuntimeConfig().encryptionKey` 读取（无 inline fallback）。
- Credential 实体字段：`type`（classic-pat / fine-grained-pat / github-app）、`encryptedToken` / `encryptedPrivateKey`、`appId` / `installationId` / `botLogin`、`name`、`repoId`。
- 加解密（`server/services/credential.service.ts`）：AES-256-GCM + 随机 IV（12 字节），密文 `{iv}.{authTag}.{ciphertext}`；解密仅在执行时 worker 内存中，用完即弃（算法细节与审计必查项见 [security.md §5.5](./security.md#_5-5-凭据加密存储-c28-已闭环-2026-08-20)）。
- **禁止** token / privateKey 明文落库、进日志、进前端响应（API 只返回 `hasToken` 布尔）；Dependabot alerts 读取必须显式凭据（`GITHUB_TOKEN` 不可用）；测试用独立随机密钥。

## 6. API 规范（server/api）

- 遵循 [API 规范](./api.md)；路由命名 `*.get.ts` / `*.post.ts` / `*.put.ts` / `*.delete.ts`；所有输入用 Zod 校验，非法输入 400 + 结构化错误。
- 响应统一：成功直接返回数据，错误 `{ statusCode, statusMessage, data? }`（业务错误在 `data.code` 区分）；凭据类 API 永不返回明文 token；认证守卫除 `auth/**` 与登录相关外默认要求会话（`requireSession`），未登录 401。
- 业务逻辑下沉 `server/services/`，API 层只做参数校验与响应组装；handler **必须**用 `defineEventHandler(async (event) => { ... })`（普通 async function），误用 `async function*` generator 在默认路径下不会自动迭代（需显式 `sendIterable`，仅流式响应场景）。

### 6.1 错误码与告警状态口径（平台展示消费 engine 错误码）

- 展示 engine `AppError.code` 时按口径区分文案与语义；**关键区分** `ALERTS_DISABLED` ≠ `PERMISSION_DENIED`：前者计「未启用」+ 按源给开启指引、**不计失败**；`PERMISSION_DENIED` / `AUTHENTICATION_FAILED` / `RATE_LIMITED` / `REPO_NOT_FOUND` / `NETWORK_ERROR` / `GITHUB_API_ERROR` 均计失败并给对应指引。
- **仓库级失败判据（多源并行）**：engine `fetchRepoAlerts` 在「**无任何成功源且存在失败源**」时抛错——某源未启用而其余启用源全部真实失败 → 按仓库失败处理（不再以 0 告警走成功路径）；成功源与失败源并存时按 per-source 隔离、不抛错。失败仓库走失败分支（`defaultBranch` 空串 / `alertsCount` 0），错误信号由每源 `FETCH_FAILED` 承载；退出码仍由 `allErrors` 非空判定。未启用仓库计入 `RunSummary.reposWithAlertsDisabled` + `RunResult.alertsDisabled`（含 `source`）明细，不影响 exitCode；403 判定权威见 [github-client.md §5.3](../design/modules/github-client.md)；**文案落点分层**——报告层用源无关通用指引 + `Source` 列，日志 / 运行提示由 `alertsDisabledHint(source)` 给按源开启路径。

### 6.2 运行失败分类口径（`failure_code` / `failure_stage` / `failure_kind`）

- `ScanRun.status='failed'` 语义过载，故落库三列支持筛选与汇总：`failure_code` / `failure_stage` / `failure_kind`；成功态与 `degraded` 三列为 null。
- **单一事实源**：`server/services/run-failure-classify.ts` 集中映射 + `unknown` 兜底；覆盖写路径、回填命令与索引边界见 [run-failure-taxonomy.md §5.12](../design/governance/run-failure-taxonomy.md#_5-12-平台写入-回填与部署版本戳接线)。运行结果可信度（`exit_code` / `environmental_failure_count`、未修复 / 结果缺失口径）见同文 §5.7–§5.8；执行内存 / OOM 归因见 §5.10 与 [executor-process-isolation.md §8.4](../design/governance/executor-process-isolation.md)。

### 6.3 仓库级跨大版本升级授权（`allowMajorUpgrade`）

- **默认关闭**：跨 major 告警记 `alertsSkippedByReason['cross-major']` 并按人工处理披露；不得混淆「开关未开」与「准入不满足」。
- **准入**：仅「根 manifest 直接依赖 + lockfile 单版本」进入升级链，间接依赖 / 多版本共存维持人工；升级仍走完整验证链，失败自动回滚。
- **配置面**：`NUXT_PUBLIC_ALLOW_MAJOR_UPGRADE_DEFAULT`（构建期 `ALLOW_MAJOR_UPGRADE_DEFAULT`）只影响**新建仓库**；写入需 admin / org_admin，变化记 `major_upgrade_policy_update`；**不新增**引擎 CLI / Action / env 隐式通道。
- **可观测**：仓库视图返回开关状态；运行摘要 `cross-major` 计数与人工标签表达「被跳过」，已授权但准入不满足时日志输出 `require a cross-major upgrade ... manual review`。

## 7. 前端规范（app/）

- Vue 3 Composition API + `<script setup lang="ts">`；禁止 `any`；模板不写复杂逻辑（抽 computed / 函数）。
- caomei-ui 组件按需使用（`caomei-ui/nuxt` 自动导入，无需注册）；模板中 PascalCase（`Caomei*`）；样式 SCSS + BEM，全局变量 / mixin 经 Vite `additionalData` 注入（组件内直接使用 `$space-4` / `$color-primary` 等）。
- 暗色模式：`use-color-mode.ts` 切换 `<html>.dark` + localStorage；全局 mixin 适配须写 `.dark &`（`@mixin` 内 `:global(.dark) &` 编译失败——`:global()` 仅在 `<style scoped>` 有效）。
- 文件 kebab-case（含组件），与 [开发规范 §2](./development.md) 一致；页面组件默认导出为空，业务状态放 composables 或组件内。
- **列表并发守卫不得静默丢弃用户输入**：`if (inflight) return` 型短路守卫须记录**最后一次**待补跑参数，当前请求 `finally` 收尾后补跑一次（实例 `scans.vue` 的 `queuedRunFetch`）；写入型守卫同理不得吞掉用户动作。

### 7.1 caomei-ui 集成实践

- 派生字段（`_severityRank` / `_statusRank` / `_roleRank`）的**运行时修改路径必须同步**（每次 `updateXxxRank`），否则排序引用陈旧 rank → 业务语义错位。
- 图表组件：优先自实现 `chart-canvas.vue`（仅注册用到的 controllers / elements / scales / plugins，避免全量 `chart.js/auto` 体积）；用 `<ClientOnly>` 包裹避免 SSR `window is not defined`。
- **类型 vs 运行时契约核验**：编写 v-model / ref / callback 契约时**必须直读依赖包源码**（`node_modules/<pkg>/dist/*.mjs`）——Vue 对未知 prop / 事件**静默忽略**，类型声明可能滞后或过宽；bugfix 可用一次性 smoke 脚本（`tests/e2e/_smoke-xxx.mjs`，跑完即删）监听 `pageerror` / `console.error`、过滤已知噪声（如 preload warnings）并断言关键错误文本，比单纯 typecheck 更具说服力，验证后清理不留痕（[工程实践判例 EP-10](../design/governance/engineering-practice-notes.md)）。

### 7.2 i18n 配置单点声明

- **配置中心** = `apps/platform/i18n/`：`nuxt-i18n-config.ts`（模块层 locales / strategy / langDir / defaultLocale / detector，被 `nuxt.config.ts` 顶层 import 后 spread）+ `i18n.config.ts`（vue-i18n 构建期配置，按文件路径加载）+ `localeDetector.ts`（`resolveLocale` 纯函数）。
- **jiti 加载边界（关键约束）**：`nuxt.config.ts` 顶层只能 import `nuxt-i18n-config.ts`（仅 named export const、无顶层副作用），**不能** import `i18n.config.ts`（其 default export 会触发 jiti 顶层求值 `defineI18nConfig` → `is not defined`）；这是双文件拆分的唯一根因。`nuxtI18n = { ... } as const` 必需（防 spread 后字面量类型宽化引发模块字段契约检查报错）。
- **`nuxt.config.ts` 的 i18n 块 ≤ 10 行**（仅引用 + 必要 override），超出即视为散落配置点回归；**新增语言流程**仅改 `nuxt-i18n-config.ts` 一处 + 在 `i18n/locales/` 复制对应 `.json` 并补翻译。语言标识规范 / fallback 链 / 文案归属见 [i18n.md §3](./i18n.md#_3-平台-ui-国际化)。
- **禁止**：i18n 块内重复声明 `locales` / `strategy` / `langDir`；把 `vueI18n` 写成内联对象；把 `i18n.config.ts` 的 named export 放到会被 jiti 顶层 import 的位置；detector 内 hard-code locale 列表。

### 7.3 Utility 抽取与跨组件共享

- **抽取时机**：同一纯格式化函数在 ≥ 2 个 SFC 重复出现即抽到 `app/utils/<feature>.ts`；同时接受 Review Gate `suggest` 触发的反向抽取。
- **签名**：仅接受纯函数（无副作用、依赖参数化）；i18n 相关函数接收 `t` 翻译函数为参数，不在 utility 内 `useI18n()`。抽取后**立即**补单测覆盖全部分支（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期）；函数签名变更必须 grep 全仓同步调用方（`typecheck` 不捕捉 vitest mock 下的类型错误）。
- 一旦抽到 `utils/<feature>.ts`，所有 SFC（含 dialog）一律 import 复用，禁止在第二处复制定义（即使仅微调）。
- **有状态 composable 的 SSR 与可测性**：localStorage 偏好**不得**在构造期读存储（SSR 首帧错配），由 `onMounted` 或打开弹窗时填充；存储以可选参数注入，读写与解析全路径 try/catch（访问 `localStorage` 本身可能抛错）；单测用内存实现 + 抛错 getter 覆盖读写 / 脏数据 / 抛错分支。实例见 `app/composables/use-scan-preferences.ts`。

- 依赖注入型 composable 的**缺省实现求值时机**（setup 期 vs 事件期）见 [工程实践判例 EP-31](../design/governance/engineering-practice-notes.md)（条目为列表项无独立锚点，按 §2「本地文件链接默认不带锚点」引用）。

### 7.4 caomei-ui 接线约定

> 迁移缘由、分批计划与逐批结论见 [UI 组件库迁移评估](../design/governance/caomei-ui-migration.md)；token 覆盖 / 组件差异 / 选择器限宽 / DataTable 密度等接线细则见同文 §16。

- **模块注册**：`modules: ['caomei-ui/nuxt', '@nuxtjs/i18n']` + `caomeiUI: { prefix: 'Caomei', darkMode: 'class', theme }`；组件名 `Caomei*` / 类名 `caomei-*` / token `--caomei-*`。
- **受控状态必须回写**：DataTable 的展开行 / 多列排序 / 分页等受控 prop 须配 `@update:*`（细则见 [§16](../design/governance/caomei-ui-migration.md#_16-caomei-ui-接线细则)）。
- **严格约束**：`CaomeiSelect` 的 `SelectItem` 不接受空串 `value`（SSR 直接抛错 → 500），「全部」/「未设置」项必须用哨兵值（`__all__` / `__auto__`）并在对外提交前映射为不传参 / `null`；`CaomeiDialog` 响应式宽度用 `--caomei-dialog-width` 钩子，不用 inline `:style="{width}"`（inline 恒高于样式表，会让 `:breakpoints` 成死代码）。
- **验证命令**：`pnpm --filter @dependfix/platform typecheck` + `lint` + `test`；样式类改动必须跑 `build`（唯 `build` 编译 SCSS）。
- **执行分层**：`build` 必跑由 [AGENTS.md](../../AGENTS.md) 必要检查承接；上述两条严格约束已登记 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵-严格约束逐条挂接)，其余为执行层指引。

### 7.5 上游组件问题归因与 issue 上报流程

> 适用：平台页面 / 组件行为异常，且怀疑根因在组件库（`caomei-ui`）或其传递依赖，而非本仓代码。

- **第 1 步 · 归因判定（三条全过才按上游问题上报）**：① 移除本仓样式覆盖 / 容器约束 / 受控状态写法后仍复现；② 库自带 demo 同样复现；③ 版本与 prop 未越界（存在性以已安装版本 `node_modules/<pkg>/dist/**` 源码为准）；仅在叠加本仓覆盖后才出现 → 回 [§7.4](#_7-4-caomei-ui-接线约定) 排查。
- **第 2–4 步 · 取证与上报**：最小复现片段 + 浏览器侧实测值（`getComputedStyle` / `getBoundingClientRect` / `elementFromPoint`）+ 截图，且**与冻结代码同批生成**（[测试规范 §6.8](./testing.md#_6-8-取证工件必须与冻结代码同批生成)）；上报路径以目标仓库 `.github/ISSUE_TEMPLATE/` 模板优先（无模板按其通用 bug 结构提交，**不因缺模板而放弃**）；模板要素（环境版本 + 最小复现 + 期望与实际 + 截图）缺一不可，**不写入**本仓私有代码 / 内部数据 / 凭据。
- **第 5 步 · 本仓侧处置**：在 [backlog](../plan/backlog.md) 登记「已上报上游 + 影响面 + 临时措施」；**不在本仓为上游缺陷做二次封装兜底**（需兜底时由用户明确决策并单独登记）。

### 7.6 运行时 env 开关的 UI 状态暴露用只读端点

- **不要用 `runtimeConfig.public`**：`nuxt.config` 求值发生在**构建期**，非 `NUXT_PUBLIC_` 前缀的根级 env 只在构建时烘焙，容器运行时 `-e` 注入不会刷新 → 公开配置与 `process.env` 口径漂移。
- **做法**：由服务端**只读端点**按请求读取 `process.env` 返回状态（如 `GET /api/schedules/monitor-status`），前端据此渲染提示，与服务端开关**同源、无烘焙漂移**；进程级 env 不可热更 → UI 文案须说明「设置后需重启进程生效」。本条为**严格约束**，已登记 [review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵-严格约束逐条挂接)。

## 8. 测试规范

- server 层纯逻辑（加密 / adapter / 服务）用 Vitest node 环境，位于 `server/**/*.test.ts`；涉及 Nuxt runtime（`useRuntimeConfig` / API 路由）的集成测试放 `tests/` 或 `server/api/**/*.test.ts`，经 `@nuxt/test-utils` 启动。
- 数据库测试用 SQLite `:memory:` + `DATABASE_TYPE=sqlite`，每个测试独立 DataSource（`beforeEach` 重建）；时间列断言用 `getDateType('sqlite')` 期望值，避免硬编码。
- 命令：`pnpm --filter @dependfix/platform test`；视觉回归 `pnpm --filter @dependfix/platform test:visual`（更新基线加 `--update-snapshots`），口径见 [测试规范 §6.7](./testing.md#_6-7-视觉回归-截图识别层-apps-platform)。

## 9. 质量门禁

- `pnpm run lint:check` / `pnpm run lint:css:check` / `pnpm typecheck`（根目录）：前两者无 `--fix`，且 `lint:check` 链式跑平台配置；Test / Release / Docker 均执行前三者。
- **两套 ESLint 配置不是同一规则集**：根用 type-aware 子集；平台（`eslint-config-cmyr/nuxt`）另启 `strictTypeChecked` / stylistic（`array-type`、`consistent-type-definitions`、`vue/object-curly-spacing`）。平台改动须同时满足。
- 平台告警预算 `--max-warnings 11`（9 条有意保留的 `no-deprecated` + 2 条存量 `max-lines`），只可随清理下调。
- `nuxt build` 必须通过（Docker 构建前置）；平台相关改动须运行平台 `test`；提交走 [conventional-committer 流程](./git.md)，scope 用 `platform`；注释禁止规划编号标记（[开发规范 §3](./development.md)）。

## 10. 运行时与部署（容器镜像 / 启动 / 队列降级）

> 镜像构建产物与运行契约；容器编排文件见 [§2](#_2-目录结构-nuxt-4)。完整选型与依据见 [平台执行模型隔离设计](../design/governance/executor-process-isolation.md)。

### 10.1 镜像自足性优先于部署侧 env

- Docker 镜像的关键启动默认值（如 `DATABASE_MIGRATIONS_RUN=true`）**必须**用 Dockerfile runtime `ENV` 固化，不能只靠 compose 注入（用户可能沿用旧 compose 或直接 `docker run`，导致镜像「能启动但功能不可用」）；**发布门禁**为推送前对真实构建镜像跑首启冒烟（不注入该 env），断言 HTTP 200 + 业务表数下限 + 无 `no such table`（`apps/platform/docker/smoke-test.sh`，已接入 `docker.yml`）；空库 + 未开迁移时启动须打明确告警。**官方 Node 基础镜像工具链口径**：官方镜像默认启用 corepack shim，会按 `packageManager` 回源下载 pnpm 并覆盖镜像内 `npm i -g` 的版本——钉定 pnpm 版本前先移除 shim；node-gyp 默认回源 nodejs.org 下载 headers，受限网络需 `npm_config_nodedir=/usr/local`；pnpm 11 的 registry 覆盖使用 `pnpm_config_*` 前缀（`npm_config_registry` 不保证生效），构建期切 registry 时两种前缀同时导出以兼容；镜像冒烟可核对 pnpm 版本。

- **10.2 runtime 镜像的 Node 依赖面只含 .output（Nitro trace 自包含）**：`.output/server/node_modules` 由 Nitro trace 自带全部运行时依赖（含 better-sqlite3 的 musl prebuild），workspace 包被打进 `.output/server/chunks`——runtime 阶段**只 `COPY .output`**，**不得**再复制根 `node_modules` + workspace dist（曾致镜像膨胀至约 1.1GB，移除后约 239MB）。**校验口径**：`rg "from ['\"]@dependfix" apps/platform/.output/server` 应 0 命中（排除注释）；`.output/server/package.json` 声明依赖逐项 `existsSync` 全命中 + 容器 HTTP 冒烟 + 原生模块 PRAGMA。**系统工具链**：目标仓库原生模块回退编译所需 `python3/make/g++` 的安装口径、体积实测与 `smoke-test.sh` 校验见 [dependency-fixer-records.md §12.11](../design/modules/dependency-fixer-records.md)。

### 10.3 Nitro 插件不阻塞监听（启动引导语义）

- `defineNitroPlugin(() => { void asyncInit() })` **不会 await**，日志 `Listening on …` 早于初始化完成——启动引导注释不得写「对外服务前就绪」，应说明与首次请求共享 single-flight promise。
- 一次性 / 迁移专用模式（`DEPENDFIX_MIGRATIONS_ONLY=true`）用 `process.exit` 退出；`.catch` 中**必须**按该 env 补 `process.exit(1)`，否则一次性容器遇异常会挂起而非失败退出。

### 10.4 队列模式自动降级必须含「消费者维度」

- 「Redis 可用即异步」的降级矩阵若不含「是否存在消费者」，会形成静默黑洞：job 入队后无人消费 → pending 永远挂起 → stale cleanup 约 30 分钟后判 `orphan_run`。
- `auto` 模式**必须**仅在「Redis 可用**且**本进程消费队列（`inProcessWorker`）」时异步；本进程不消费且无独立 worker 消费时须降级 `sync`（容器默认形态由独立 worker 进程消费，见 [设计稿 §9](../design/governance/executor-process-isolation.md#_9-队列执行进程隔离-运行时形态)——该形态应显式 `QUEUE_ENABLED=true`）。
- **env 口径**：Nuxt runtimeConfig 运行时覆盖只认 `NUXT_` 前缀（容器需 `NUXT_IN_PROCESS_WORKER`）；`.env.example` 的无前缀名只是 compose 插值源，直接注入容器无效。

- **10.5 队列锁参数显式化与锁问题观测**：in-process Worker **必须**显式配置 `lockDuration`（取平台执行封顶 `resolveExecutionCeilingMs()`）/ `lockRenewTime`（取其一半），并注册 `stalled` / `lockRenewalFailed` / `error` 事件输出结构化日志。取值理由、载荷字段与同根因去重口径见 [executor-process-isolation.md §9.1](../design/governance/executor-process-isolation.md#_9-1-队列锁参数与观测)。
- **编排层终态写回**：须按 [development.md §5.1.36](development.md) 条件更新（不得整行 `save`）；`affected = 0` 时保留库内终态、跳过通知并记 `run_terminal_write_skipped`，设计与残余见 [queue-stale-recovery.md](../design/governance/queue-stale-recovery.md)。

### 10.6 队列执行进程隔离（独立 worker 进程）

- **权威声明已迁出**：容器双进程形态、进程角色与 HTTP-only 插件清单、向后兼容、崩溃自愈、信号处置顺序与已知边界的完整约束见 [executor-process-isolation.md §9](../design/governance/executor-process-isolation.md#_9-队列执行进程隔离-运行时形态)（2026-11-08 文档预算治理迁入，语义未变）。
- **要点（执行时必须遵守）**：容器默认 `DEPENDFIX_QUEUE_WORKER=1` 双进程（worker 消费队列、HTTP 进程 event loop 不被阻塞）；`DEPENDFIX_ROLE` 由入口按进程注入，worker 跳过 HTTP-only 插件；`queue-consumer` 是消费端唯一启动点，不得依赖 HTTP-only 插件副作用；信号转发 trap **必须**先于「启动子进程」与「输出就绪行」安装；退避等待用 `sleep N & wait $!`（前台 `sleep` 阻塞 trap）。

- **10.7 部署产物版本戳（构建期注入 + 运行时核对）**：`BUILD_COMMIT/BUILD_VERSION` 经 CI `--build-arg` → Dockerfile `ENV NUXT_BUILD_*` → `runtimeConfig`，`GET /api/health` 与启动 `[build]` 行公开只读暴露，运行级回执写入 `scan_run.build_version` / `build_commit`。`/api/health` 同时返回 `schema` 状态枚举（`ok` / `drift` / `unknown`，口径见 §3.3），**只允许状态枚举，不得暴露表名 / 列名 / 数据库路径**。CI 接线、字段语义、`github-action` 边界与刷新语义见 [run-failure-taxonomy.md §5.12](../design/governance/run-failure-taxonomy.md#_5-12-平台写入-回填与部署版本戳接线) 与 §5.11。
- **10.8 pnpm store 持久化与安装产物提交卫生**：目标仓库依赖安装的 store **必须**落持久卷（入口默认 `PNPM_CONFIG_STORE_DIR=$DATA_DIR/pnpm-store`，compose 转发），且 store 与 `RUN_WORK_ROOT` 同卷（跨盘退化为复制）；入口三条不变式（运行身份写探针 / 不可用 unset 回退 / 以运行身份创建且不对用户路径 `chown`）与部署侧配置见 [deployment.md「pnpm store 与依赖缓存」](../guide/deployment.md#pnpm-store-与依赖缓存)。安装产物不得进入交付提交：运行开始前把 `.pnpm-store/` / `node_modules/` 幂等写入目标仓库 `.git/info/exclude`（**不得**改 `.gitignore`，仅 `fix` / `fix-and-pr` 非 `dry-run`），清单与边界见 [gitignore-management.md §7](../design/governance/gitignore-management.md#_7-安装产物排除-git-info-exclude)。
- **10.9 进程级日志通道**：进程级日志**必须**经 `server/utils/logger.ts` 输出（已接入边界禁新增裸 `console.*`），运行级 `MemoryLogger` 不得重复落文件；文件布局 / 轮转 / 配置回退 / 致命路径 / 脱敏 / 多进程边界的硬约束与唯一权威见 [platform-logging.md](../design/governance/platform-logging.md)，检查点见矩阵 §10.9 行。

## 11. 环境变量总表（.env.example 对齐）

> 默认值与完整说明以 [`apps/platform/.env.full.example`](../../apps/platform/.env.full.example) + [平台配置指南](../guide/configuration.md) 为唯一权威；本节只列平台差异点。

- **执行 / 队列**：`EXECUTION_TIMEOUT_MS`、`DEPENDFIX_MAX_EXECUTION_TIMEOUT_MS`、`DEPENDFIX_QUEUE_WORKER` / `DEPENDFIX_ROLE`、`DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS`、`STALE_CLEANUP_*_GRACE_MS`——取值与边界见 [设计稿 §9](../design/governance/executor-process-isolation.md#_9-队列执行进程隔离-运行时形态) 与 [queue-stale-recovery.md](../design/governance/queue-stale-recovery.md)；队列锁来源见 10.5。
- **构建 / 存储 / 日志**：`NUXT_BUILD_*`（10.7）、`PNPM_CONFIG_STORE_DIR`（10.8）、`LOG_*`（10.9）、`DEPENDFIX_WEEKLY_DIGEST_HOUR`（[platform-notification.md §6.5](../design/governance/platform-notification.md#_6-5-周汇总触发)）。
- **数据 / 认证 / 监测**：`DATABASE_*` 见 [§3](#_3-数据库规范-多后端兼容-时区)；`NUXT_ENCRYPTION_KEY` 见 [§5](#_5-凭据安全规范-t602-起生效)；`ACTION_STATUS_MONITOR_ENABLED` 见 [§7.6](#_7-6-运行时-env-开关的-ui-状态暴露用只读端点)；`AUTH_SECRET` / `SMTP_*`（compose 插值名，容器运行期 `NUXT_SMTP_*`） / `NUXT_PUBLIC_BETTER_AUTH_URL` / `PORT` / `MACHINE_ID` 见 [`.env.full.example`](../../apps/platform/.env.full.example)。

## 12. 决策记录（2026-08-07 人工审查确认）

- **多后端时机**：默认 SQLite 交付，`getDateType()` + driver 注入 + `DATABASE_URL` 推断一次性做对，MySQL / PG 真实部署验证延后。—— ✅ 确认
- **表前缀**：默认 `dependfix_`（`DATABASE_ENTITY_PREFIX` 可配）；**synchronize 策略**：后续统一演进为 `synchronize` / `migrationsRun` 均显式 opt-in（见 [工程实践判例 EP-17](../design/governance/engineering-practice-notes.md)）。—— ✅ 确认
- **雪花 ID**：48 位时间戳 + 10 位机器 + 12 位序列（hex 输出），全局统一；**首用户 admin**：首个注册用户自动 `role=admin`；**文件命名**：文件与 Vue 组件统一 kebab-case（已同步 [开发规范 §2](./development.md)）。—— ✅ 确认

## 13. 相关文档

- 规范：[开发规范](./development.md) / [API 规范](./api.md) / [安全规范](./security.md) / [测试规范](./testing.md) / [i18n 规范](./i18n.md)；指南：[技术栈](../guide/tech-stack.md) / [平台配置指南](../guide/configuration.md)；[平台执行模型隔离设计](../design/governance/executor-process-isolation.md) / [UI 组件库迁移评估](../design/governance/caomei-ui-migration.md) / [运行失败分类与筛选设计](../design/governance/run-failure-taxonomy.md) / [架构设计](../design/governance/architecture.md)；调研：[momei 平台实现参考分析](../research/2026-08-07-momei-platform-reference.md)
