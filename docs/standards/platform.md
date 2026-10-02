# 平台开发规范（apps/platform）

> 状态: 已确认（2026-08-07 人工审查通过，6 项决策全部确认，见 §11）
> 适用范围: `apps/platform/`（Nuxt 4 全栈管理平台）的代码、配置、实体、API、样式与测试。
> 基础规范: 本规范是 [开发规范](./development.md)、[API 规范](./api.md)、[测试规范](./testing.md)、[安全规范](./security.md) 在平台子系统的细化与补充；冲突时以本规范（平台专属）为准。
> 参考蓝本: [momei 平台实现参考分析](../research/2026-08-07-momei-platform-reference.md)

---

## 1. 技术选型（版本以 pnpm-lock.yaml 为准）

| 类别 | 选型 | 说明 |
|:--|:--|:--|
| 框架 | Nuxt 4（全栈 SSR + API Routes） | `app/` + `server/` 目录结构 |
| 语言 | TypeScript（strict 逐步收紧） | 平台独立 tsconfig（`nuxt typecheck`） |
| UI | caomei-ui 0.3.0（`caomei-ui/nuxt` 模块，精确锁版本） | 自建组件库；2026-09-29 M31 完成 PrimeVue 4 迁移并卸载其 5 个依赖 |
| 主题 | caomei-ui `theme` 配置 + `_caomei-tokens.scss` 明暗 token 覆盖 | 暗色模式 `caomeiUI.darkMode: 'class'`（`.dark` 挂 `<html>`） |
| 图标 | `@lucide/vue`（经 `CaomeiIcon` 的 `icon` prop 传入图标组件） | 迁移前 30 个 `pi pi-*` 用法已全量替换 |
| 样式 | 纯 SCSS + BEM，无 CSS-in-JS / Tailwind | 全局变量 + mixin |
| 认证 | better-auth（邮箱密码） | TypeORM adapter（自研，见 §4.2） |
| ORM | TypeORM 1.x | 显式驱动注入，多后端兼容 |
| 数据库 | SQLite（M6 默认）/ MySQL / PostgreSQL（预留） | `DATABASE_TYPE` / `DATABASE_URL` 切换 |
| 校验 | Zod | server API 输入 |
| 构建 | Nuxt build（`nuxt build` / `.output/`） | |
| 测试 | Vitest（node 环境）+ 组件测试（按需） | |

> 版本策略：`nuxt`、`better-auth`、`typeorm` 等核心依赖跟随 momei 已验证版本线（monorepo 内 workspace 依赖用 `workspace:*`）；`caomei-ui` 以**精确版本**锁定（1.0 前 API 可能调整）。**禁止引入未经验证的新大版本**；跨大版本升级必须先走 TypeORM 1.x 升级评估式的 probe 流程（见 [momei 参考 §5](../research/2026-08-07-momei-platform-reference.md)）。

## 2. 目录结构（Nuxt 4）

```
apps/platform/
├── app/                        # Nuxt 4 srcDir：前端代码
│   ├── app.vue                 # 根组件
│   ├── assets/styles/          # SCSS（_variables / _mixins / main）
│   ├── components/             # Vue 组件（kebab-case.vue）
│   ├── composables/            # 组合式函数（kebab-case.ts，自动导入）
│   ├── layouts/                # 布局（default.vue）
│   ├── middleware/             # 路由中间件（auth.ts）
│   ├── pages/                  # 页面路由
│   ├── plugins/                # 客户端插件（按需）
│   └── utils/                  # 前后端共享前端工具（auth-client 等）
├── server/
│   ├── api/                    # REST API（Nuxt server routes）
│   │   ├── auth/               # better-auth 挂载
│   │   ├── repos/              # 仓库 CRUD + 扫描触发（T602/T603，任务归属见 [archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)）
│   │   ├── credentials/        # 凭据管理（T602，任务归属见 [archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)）
│   │   ├── runs/               # 扫描历史/报告（T603/T604，任务归属见 [archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)）
│   │   └── alerts/             # 告警查询（T604，任务归属见 [archive/todo-archive-phases-m6-m7-t711.md §M6](archive/todo-archive-phases-m6-m7-t711.md#m6-最小平台-mvp已归档)）
│   ├── database/               # 数据库层
│   │   ├── index.ts            # DataSource 初始化（多后端）
│   │   ├── type.ts             # getDateType() 列类型映射
│   │   ├── naming-strategy.ts  # snake_case 命名策略
│   │   └── typeorm-adapter.ts  # better-auth TypeORM adapter
│   ├── entities/               # TypeORM 实体
│   ├── services/               # 业务逻辑层（扫描编排、凭据加解密）
│   ├── middleware/             # server 中间件（按需）
│   └── utils/                  # server 工具（auth 实例、加密、雪花 ID）
├── Dockerfile                  # 多阶段镜像（alpine-nodejs 构建 / minimize 运行时，仅含 Nuxt .output；引擎由 Nitro 打包）
├── docker-compose.build.yml    # 本地构建覆盖文件（可选；默认不本地打包）
├── docker-compose.yml          # SQLite 数据卷部署（默认拉取已发布镜像；PUID/PGID 控制卷权限）
├── nuxt.config.ts
└── package.json
```

### 目录约束

- `app/` 与 `server/` 不得互相 import（跨层通信走 API / runtimeConfig）
- `server/utils/` 只放无状态工具与单例工厂；有状态业务放 `server/services/`
- `server/entities/` 只放实体定义，不放业务逻辑
- 文件名统一 **kebab-case**（`use-color-mode.ts`、`credential.service.ts`）；Vue 组件同样 **kebab-case.vue**（与全局 [开发规范 §2](./development.md) 一致）

## 3. 数据库规范（多后端兼容 + 时区）

### 3.1 环境变量（DATABASE_* 族）

| 变量 | 默认值 | 说明 |
|:--|:--|:--|
| `DATABASE_TYPE` | 自动推断（`sqlite`） | `sqlite` / `mysql` / `postgres`；按 `DATABASE_URL` 前缀推断 |
| `DATABASE_URL` | `''` | MySQL/PG 连接串；SQLite 支持 `sqlite:path` / `file:path` |
| `DATABASE_PATH` | `data/dependfix.sqlite` | SQLite 文件路径（必须可配，容器内指向数据卷） |
| `DATABASE_SSL` | `false` | 多后端时启用 SSL |
| `DATABASE_ENTITY_PREFIX` | `dependfix_` | 表前缀 |
| `DATABASE_SYNCHRONIZE` | `false` | 全场景显式 opt-in 才同步 schema（详见 [development.md §5.1.19](./development.md)） |
| `MACHINE_ID` | `process.pid % 1024` | 雪花 ID 机器位 |

### 3.2 时区与列类型（关键约束）

**所有时间列必须通过 `getDateType()` 获取列类型，禁止写死 `'datetime'`**：

```typescript
// server/database/type.ts
export const getDateType = (dbType?: string): string => {
    switch (dbType ?? 'sqlite') {
        case 'sqlite':
            return 'datetime'
        case 'mysql':
            return 'datetime'
        case 'postgres':
            return 'timestamp with time zone' // PG 必须带时区，否则跨时区读写偏移
        default:
            return 'datetime'
    }
}
```

- 实体中 `CreateDateColumn` / `UpdateDateColumn` / 日期字段统一 `{ type: getDateType() }`
- **禁止**在实体中硬编码 `'datetime'` / `'timestamp'` 字面量（PostgreSQL 部署会静默出现时区偏移，且单测难以覆盖）
- 代码中一律使用 `Date` 对象；存储层由 TypeORM 按列类型转换

### 3.3 DataSource 初始化

- 支持三后端，**显式传入 driver 实例**（`better-sqlite3` / `mysql2` / `pg`），绕过 TypeORM 1.x 动态 require（Docker/Vercel 已知坑）
- 顶层 `import` 驱动模块，供 Nitro Rolldown 静态分析
- `synchronize` / `migrationsRun` 全场景显式 opt-in（dev/test 也不再自动开启 synchronize）；详见 [development.md §5.1.19 TypeORM 1.x synchronize 与 migrationsRun 反模式禁止](./development.md)
- 启动期日志打印 `synchronize` + `migrationsRun` + 各自 env（development.md §5.1.19 hard requirement）
- 初始化失败不抛致命错误：日志告警 + 功能降级（对齐 momei `reportDatabaseInitializationFailure` 语义）
- 幂等单例 + 并发初始化锁（`ensureDatabaseInitialized`）

- **新增迁移必须前缀感知**：`entityPrefix` 默认 `dependfix_`。统一用 [`migration-helpers.ts`](../../apps/platform/server/database/migrations/migration-helpers.ts)（`resolveTableName` 先试 `dataSource.options.entityPrefix + 表名`、再回退无前缀，配 `addColumnIfMissing` / `dropColumnIfExists` / `createIndexIfMissing` 幂等守卫），并配「两种前缀 + 两者同时存在（前缀优先）+ up/down 幂等 + 表缺失」用例；`queryRunner.connection` 在 TypeORM 1.x 已 deprecated，改用 `queryRunner.dataSource`。存量迁移已统一前缀感知 + 幂等（M36.8 闭环），背景与实证见 [backlog.md §已知边界](../plan/backlog.md)。
- **基线迁移与空库自举**：迁移链首条 `CreateInitialSchema1600000000000` 从实体元数据（`Table.create`）建全部基础表 / 索引 / 外键，前缀感知 + 跨方言 + 幂等（存量库整表跳过）。全新部署可直接 `pnpm db:init` 或由 Docker compose 默认 `DATABASE_MIGRATIONS_RUN=true` 在启动时自动建表；`db:init` 为幂等一键初始化入口。**注意**：基线由实体元数据生成，新增实体列若忘记写独立迁移，全新库 / CI 会带上该列（全绿）而存量库永久缺列——约定任何列 / 表变更必须编写独立迁移。见 [server/database/scripts/README.md §db-init](../../apps/platform/server/database/scripts/README.md#db-init一键初始化)。
- **schema 漂移的排查与修复序（双 opt-in 下）**：`synchronize` / `migrationsRun` 双 opt-in 下 schema 漂移会静默累积，直到运行时查询报 `no such column`。修复序：① 复制 dev 库到临时目录、以独立 DataSource 跑完整迁移链验证；② 读 `migrations` 表比对已注册迁移；③ 再对真实库执行（执行前确认启动期自动备份已生成）。**判断某迁移是否生效要查物理表列**（非默认前缀下需靠前缀感知解析，`migrations` 记录不代表加列成功）。**手动入口**：`pnpm db:init` / `pnpm db:migrate`（`db:migrate:show` 只读预览 / `db:migrate:revert -- --yes` 回退），见 [server/database/scripts/README.md](../../apps/platform/server/database/scripts/README.md)。

### 3.4 实体规范

- 继承 `BaseEntity`（雪花 ID + `getDateType()` 时间戳）
- 属性名 camelCase（与 better-auth schema 一致），列名由 `SnakeCaseNamingStrategy` 转 snake_case
- better-auth 四表（`user` / `session` / `account` / `verification`）字段对齐 better-auth 默认 schema，**不得增删字段**；平台自有字段（如 `role`）通过 better-auth `user.additionalFields` 配置并同步实体
- 跨库类型归一：SQLite 下 `bigint` → `integer`；PG 下 `bigint` → `integer`、长文本 → `text`（M6 以 SQLite 为默认目标，但实体写法必须保持三后端可编译）

### 3.5 TypeORM 查询模式

- **`find()` 不支持嵌套路径 order by**：TypeORM 1.x `find({ order: { 'scanRun.repository.owner': 'ASC' } })` **不支持嵌套路径 order by**（仅支持 entity 顶层字段），会抛 `EntityPropertyNotFoundError: Property "scanRun.repository.owner" was not found in "ScanResult". Make sure your query is correct.`（`node_modules/typeorm/query-builder/SelectQueryBuilder.js:2371` 等抛出位置）。任何"按关联实体字段排序"的需求必须用 QueryBuilder：`createQueryBuilder('result').leftJoinAndSelect('result.scanRun', 'scanRun').leftJoinAndSelect('scanRun.repository', 'repository').orderBy('repository.owner', 'ASC').addOrderBy('repository.name', 'ASC')`。统一代码路径优先（全部走 QueryBuilder 而非 find + QueryBuilder 两条路径），简化维护 + 行为等价。修复 commit `374a278`（alerts 视图切换按包 / 按项目）。

### 3.6 e2e / fixtures 端点双门控规范

`apps/platform/server/api/e2e/*` 下的所有端点（fixtures.post.ts / fixtures.delete.ts 等）**必须**叠加两道门控，防止生产环境误暴露。

**强制门控**（两条件同时满足才放行；`useRuntimeConfig()` 来自 Nuxt auto-import，server/api/ 路由可直接调用，**无需显式 import**）：
```typescript
import { createError, defineEventHandler } from 'h3'

const config = useRuntimeConfig() // Nuxt auto-import，无需 import；h3 不导出 useRuntimeConfig
if (process.env.E2E_TEST !== 'true' || !config.e2eFixturesAllowed) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```

**`e2eFixturesAllowed` 在 `nuxt.config.ts` 的 runtimeConfig 注册**：
```typescript
// nuxt.config.ts
runtimeConfig: {
    // 生产构建默认 false（NUXT_E2E_FIXTURES_ALLOWED 未设）；仅 e2e webServer 启动时显式开启
    e2eFixturesAllowed: process.env.NUXT_E2E_FIXTURES_ALLOWED === 'true' || process.env.E2E_TEST === 'true',
}
```

**双门控要求**：
- 单门控 `E2E_TEST === 'true'` 风险：生产环境误设 `E2E_TEST=true`（运维误操作、docker-compose 复制粘贴、CI 环境变量泄漏）即暴露端点
- 叠加 `runtimeConfig.e2eFixturesAllowed` 兜底：仅当显式 `NUXT_E2E_FIXTURES_ALLOWED=true` 时才放行；prod build 默认 false

**第二门控不能用 `process.env.NODE_ENV === 'production'`（陷阱）**：
- ⚠️ **Nitro / esbuild 构建期会把 `process.env.NODE_ENV` 静态替换为构建时值**（prod build 时折叠为 `"production"`，dev build 时折叠为 `"development"`）
- 表达式 `process.env.E2E_TEST !== 'true' || process.env.NODE_ENV === 'production'` 在产物中被折叠为 `... || true`，**永远 404**，e2e 套件必然破裂
- **runtimeConfig 是 Nuxt 官方运行时覆盖通道**（`NUXT_` 前缀），运行时由 `NUXT_E2E_FIXTURES_ALLOWED` 注入，可绕开 esbuild define；prod build 时 `e2eFixturesAllowed` 默认 false，端点 404，e2e webServer 启动时设 `NUXT_E2E_FIXTURES_ALLOWED=true` 覆盖为 true
- 详见 [archive/todo-archive-phases-m22.md §M22 段](../plan/archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档) M22.6 + [经验归档 §五十](../design/governance/experience-archive.md)

**应用范围**：
- `apps/platform/server/api/e2e/fixtures.post.ts` — POST /api/e2e/fixtures
- `apps/platform/server/api/e2e/fixtures.delete.ts` — DELETE /api/e2e/fixtures
- 未来新增的 `apps/platform/server/api/e2e/*.ts` 文件全部适用

**禁止**：
- ❌ 单 `E2E_TEST` 门控（缺 `runtimeConfig.e2eFixturesAllowed` 兜底）
- ❌ `process.env.NODE_ENV === 'production'` 门控（**esbuild define 折叠陷阱**，prod build 永远 404；M22 阶段实证）
- ❌ `NODE_ENV !== 'development'` 门控（dev/test/staging 区分不清晰）
- ❌ `import.meta.dev` 门控（仅 Nuxt 内置 dev/prod 区分，部署到 staging 仍误暴露）

**D 阶段自检**：
- Full Stack Master (全栈大师) agent 检查所有 `apps/platform/server/api/e2e/*.ts` 文件，确认含双门控代码（`useRuntimeConfig().e2eFixturesAllowed` 第二门控）
- **构建产物 grep 兜底**：`pnpm --filter @dependfix/platform build` 后 `rg -n "E2E_TEST\|e2eFixturesAllowed" apps/platform/.output/server/chunks/routes/api/e2e/*.mjs`，确认产物未折叠表达式（不应出现 `|| true`）

**A 阶段 Review Gate**：code-auditor 主责边界新增"e2e 端点双门控 + runtimeConfig 兜底 + 构建产物 grep"必查项

**应用示例**：详见 [经验归档 §五十](../design/governance/experience-archive.md) + [archive/todo-archive-phases-m22.md §M22.6](../plan/archive/todo-archive-phases-m22.md#m22-sqlite-数据保护防御加固m221m222m223m224m225m226-全部已闭环--2026-09-01-归档)。

### 3.7 SQLite 启动期备份 + 自检工具（引用 security.md §2.1 + 平台角度差异化信息）

> 权威完整声明（备份路径 / fsync / 保留策略 / 命令式恢复 / 自检工具判断逻辑等）见 [security.md §2.1](./security.md)。本节仅保留平台角度差异化信息（调用时机 / 协同关系 / D 阶段自检 + A 阶段 Review Gate）。

**调用时机**：backup.ts 在 `ensureDatabaseInitialized()` 之前同步调用（详见 [security.md §2.1.1](./security.md)）

**协同关系**：与 e2e / fixtures 端点双门控（[platform.md §3.6](#36-e2e--fixtures-端点双门控规范)）协同——防止生产环境误暴露清空端点（详见 [security.md §2.1.4](./security.md)）

**D 阶段自检**：必须验证 backup.ts / db-restore.ts / db-doctor.ts 3 个文件存在且含核心实现（fsync / retention / `--yes` 门控 / 报告格式；文件路径见 [security.md §2.1](./security.md)）

**A 阶段 Review Gate**：backup.ts 必须含 fsync + retention 清理逻辑；db-restore.ts 必须含 `--yes` 二次确认；db-doctor.ts 必须打印 schema_version + freelist_count

### 3.7.1 fixtures API 无节流默认 + 经验性节流方案

fixtures handler（`apps/platform/server/api/e2e/fixtures.{post,delete}.ts`）**当前无任何节流 / debounce / rate-limit 代码**，依赖调用方（`tests/e2e/global-setup.ts` + 各 test suite）按顺序串行调用。**M24.2 阶段源码追溯判定**（`rg -n "rate.?limit|throttle|debounce" apps/platform/server/api/e2e/` 0 命中）：调用频次低（global-setup 阶段 ≤ 2 次），不存在并发资源竞态。

**经验性节流方案**（M24.2 follow-up，未来 e2e 复现 fixture 并发问题时实施）：

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

fixtures.delete / fixtures.post 在双门控通过后调用 `fixturesRateLimit()`；返回 false → `429 Too Many Requests`。

**未来触发条件**：CI 偶现 fixtures DELETE 502/503 + 资源释放竞态时优先复现 → 启用节流而非加复杂锁。详见 [经验归档 §五十七 M24.2 候选 ④（experience-archive.md §五十七段）](../design/governance/experience-archive.md)。

### 3.8 仓库级自定义验证命令（verifyCommands，M32.1 C76）

**是什么**：`Repository.verifyCommands`（text 列，JSON 数组字符串）声明该仓库的验证命令链，覆盖引擎默认链 `DEFAULT_VERIFY_COMMANDS`（install / lint / build / test）。语义与 CLI `--commands` 对齐——数组每项一条命令；空数组（存 null）走默认链。

**链路（单一事实源）**：

| 层 | 落点 | 行为 |
|:--|:--|:--|
| 存储 | `apps/platform/server/entities/repository.ts` `verifyCommands` | JSON 数组字符串；`parseVerifyCommands` 容错解析（非法/缺失 → `[]`） |
| 校验 | `apps/platform/server/schemas/repository.ts` | 最多 20 条 / 每条非空且 ≤ 500 字符 / 禁止换行与控制字符（保持「一项 = 一条命令行」） |
| 写入口 | `POST /api/repos` + `PUT /api/repos/[id]` | 数组 ↔ JSON 列；更新语义 `undefined`=不修改 / `null` 或 `[]`=清空（与 `tags` 同模式） |
| 审计 | `apps/platform/server/services/repository-audit.ts` | 仅在命令实际变化时登记 `AuditEvent`（`verify_commands_update`，payload 记 previous/next） |
| 执行 | `scan-orchestrator.service.ts` → `ScanExecutorContext.repository.verifyCommands` → `ContainerExecutor` → `DependfixApp({ commands })` | 未配置 → 引擎默认链 |

**安全边界（hard requirement）**：

- **该字段等价于远程命令执行面**：引擎以 `spawn(command, { shell: true })` 执行每条命令（`packages/engine/src/runners/verification-runner.ts`），自定义命令**不经过** `validateVerifyCommands` 的脚本存在性校验——与 CLI `--commands` 语义一致，属于**预期内的高权限能力**。
- **权限门槛**：写操作走 API 层 `requireRole(event, ['admin', 'org_admin'])`（repos POST/PUT 既有守卫，不新增旁路）——viewer 一律 403。
- **留痕**：变更登记 `AuditEvent`（`verify_commands_update`），审计失败仅日志不阻断保存（与 `recordEnvAuditEvent` 同策略，避免「已落库但接口 500」）。
- **不做的边界**：不提供自由 shell 会话（仅命令数组）；不因该字段放宽单命令超时；沙箱真实执行序列尚未实现（`sandbox-executor.ts` 为最小占位），本配置仅对容器执行器生效——**不得**把它当作沙箱已缓解该风险的依据。
- **不校验脚本存在性**：与 CLI 一致，命令写错由验证链运行时失败暴露（属目标仓库自身问题，非平台校验缺口）。

**UI**：仓库新增/编辑弹窗 `apps/platform/app/components/repo-form-dialog.vue`（M32.1 自 `repos.vue` 拆出，页面 max-lines 治理），多行文本一行一条。

**review 检查点挂接**：该字段的「命令执行面 + 写入门槛 + 审计留痕」三条安全边界已落入 code-auditor 主责边界必查项的「修复执行安全基线」与「shell 命令安全」覆盖范围（见 [code-auditor.agent.md](../../.github/agents/code-auditor.agent.md)），无需另立检查点。

### 3.9 目标仓库配置文件 `.github/dependfix.yml`（C85）

**是什么**：目标仓库在自身仓库内声明的 dependfix 配置（与 `dependabot.yml` / `mergify.yml` 同范式），首批仅支持 `overrideProtect`。读取 / 合并 / 降级矩阵以 [依赖升级修复器 §12.7](../design/modules/dependency-fixer.md) 为唯一权威，本节只记**平台侧接线与可观测性**。

- **平台侧无需额外接线**：`container-executor.ts` 在 fix / fix-and-pr 模式下**先 clone 到工作目录、再构造 `DependfixApp`**（`new DependfixApp({ config, workDir, ... })`），引擎在构造期读取 `<workDir>/.github/dependfix.yml`。报告模式下不 clone → 无该文件 → 行为不变。
- **不提供 UI 配置入口**：该文件按设计随目标仓库走，平台不落库、不暴露表单（与 `verifyCommands` 的「平台字段」形态刻意区分）。
- **优先级**：中央配置优先（完整语义见 §12.7）——平台透传的中央 `overrideProtect`（env / CLI）一旦指定，目标仓库声明即被整体忽略。
- **可观测性**：生效（`info`）/ 被中央覆盖（`debug`）/ 降级告警（`warn`，含非法 YAML、schema 不匹配、未知键）均写入引擎日志——平台注入 `MemoryLogger` 会捕获并展示在执行日志中；命中保护仍按既有口径记 `OVERRIDE_PROTECTED` 审计（见 [override-protect-policy.md](../design/governance/override-protect-policy.md)）。

**review 检查点挂接**：本节的「中央优先（防绕过）」与「不提供 UI 入口」两条约束已挂 [code-quality-checklist 规范条款 review 检查点矩阵](../../.github/skills/code-reviewer/references/code-quality-checklist.md#规范条款-review-检查点矩阵严格约束逐条挂接)。

## 4. 认证规范（better-auth）

### 4.1 实例配置（`server/utils/auth.ts`）

- 邮箱密码登录；`requireEmailVerification` 与 `sendVerificationEmail` 由 `smtpEnabled`（`SMTP_HOST` 是否配置）驱动——**SMTP 未配置自动跳过验证**（未配置自动禁用模式）
- 会话：`expiresIn 30d`、`updateAge 1d`、`storeSessionInDatabase: true`
- `advanced.database.generateId` = 雪花 ID（与实体 `@BeforeInsert` 同源）
- **首用户自动 admin**：`databaseHooks.user.create.before` 中判断用户数，首个注册用户 `role = 'admin'`
- `role` 字段通过 `user.additionalFields` 声明（`input: false`，防客户端注入）
- 认证 API 挂载：`server/api/auth/[...].ts` → `auth.handler(toWebRequest(event))`
- 客户端：`app/utils/auth-client.ts`（`createAuthClient`）+ `app/composables/use-session.ts`（SSR 拉取会话）+ `app/middleware/auth.ts`（未登录跳 `/login`）

### 4.2 TypeORM adapter（`server/database/typeorm-adapter.ts`）

- 使用 better-auth 1.6+ `createAdapterFactory`，实现 CustomAdapter 8 方法
- `consumeOne` / `incrementOne` 提供原生实现（语义对齐 momei；factory 缺省回退也可接受，但原生实现减少一次事务包装）
- 事务：`dataSource.transaction(async (manager) => callback(createAdapter(manager)))`
- 字段映射：实体属性名 = better-auth schema 字段名（camelCase）；列名由命名策略转换，**adapter 不感知列名**
- 禁止在 adapter 中 import 业务实体（保持通用）
- **better-auth adapter 必须显式实现 `transaction`**：better-auth 1.7.2 `getBaseAdapter` 在 adapter 不实现 `transaction` 时**自动 patch fallback** `cb => cb(adapter)`（非真事务，仅同步回调）+ logger warn 但**不阻断**业务运行。**M24.2 源码追溯结论**：项目 `typeorm-adapter.ts:209` 已实现 `dataSource.transaction(...)` 真事务，better-auth 走真事务路径（fallback 不适用）。**防御**（防 future 重构引入回退）：在 `server/utils/__tests__/better-auth-adapter-transaction.test.ts` 写单测验证项目 typeorm-adapter.transaction 是真事务（mock adapter + 验证 callback commit 时序），不依赖 better-auth 上游 fallback。详见 [经验归档 §五十七 M24.2 教训 1 + 教训 3](../design/governance/experience-archive.md)。

## 5. 凭据安全规范（T602 起生效）

- 平台级密钥：环境变量 `NUXT_ENCRYPTION_KEY`（AES-256-GCM 密钥，32 字节 base64 或 hex；Nuxt `NUXT_` 前缀约定）；未配置时**禁用凭据功能并明确报错**（不静默降级为明文）—— 治理口径为 service 直读 env 改为 `useRuntimeConfig().encryptionKey` 并移除 inline fallback，闭环记录见 [todo-archive.md §M17.1](../plan/todo-archive.md)
- Credential 实体：`type`（classic-pat / fine-grained-pat / github-app）、`encryptedToken` / `encryptedPrivateKey`（GitHub App 路径）、`appId` / `installationId` / `botLogin`（GitHub App 路径公开信息）、`name`、`repoId` 关联——M18.3 接入 GitHub App 路径扩展
- 加解密工具（`server/services/credential.service.ts`）：AES-256-GCM + 随机 IV（12 字节），密文格式 `{iv}.{authTag}.{ciphertext}`（三段 base64 点号拼接，GCM 自带完整性校验）；PAT 路径加密 `token`，GitHub App 路径加密 `privateKey`（PEM）；解密仅在执行时 worker 内存中，用完即弃。算法细节与审计必查项见 [security.md §5.5](./security.md#55-凭据加密存储c28-已闭环2026-08-20)
- **禁止**：token / privateKey 明文落库、token 进日志、token 进前端响应（API 返回 `hasToken` 布尔即可）
- Dependabot alerts 读取必须显式凭据（`GITHUB_TOKEN` 不可用，见 [G2 处置记录](../plan/todo-archive.md)）
- 测试用独立随机密钥（不读生产 env）

## 6. API 规范（server/api）

- 遵循 [API 规范](./api.md)；Nuxt server routes 命名 `*.get.ts` / `*.post.ts` / `*.put.ts` / `*.delete.ts`
- 所有输入用 Zod 校验（`z.object`），非法输入返回 400 + 结构化错误
- 响应统一：成功直接返回数据；错误 `{ statusCode, statusMessage, data? }`（h3 原生结构），业务错误在 `data.code` 区分
- 认证守卫：除 `auth/**` 与登录相关外，API 默认要求会话（`requireSession` 工具），未登录 401
- 凭据类 API 永不返回明文 token
- API 层只做参数校验与响应组装，业务逻辑下沉 `server/services/`
- **h3 `defineEventHandler` 行为：handler 是 `async function` 而非 `async function*` generator**：`async function*` 在 h3 默认 handler 路径下不会自动迭代（需显式 `sendIterable`）；如误用 `async function*` 写 API handler，Nitro 默认路径下行为异常（不会自动 yield）。**防御**：写 Nuxt server route 时 handler 一律 `defineEventHandler(async (event) => { ... })`；如确需流式响应（SSE / 长轮询），显式 `defineEventHandler(async (event) => { ... return sendIterable(event, generator) })`。详见 [经验归档 §五十七 M24.2 候选 ②](../design/governance/experience-archive.md)。

### 6.1 错误码与告警状态口径（平台展示消费 engine 错误码）

平台 UI / API 展示 engine 层 `AppError.code` 时，按以下口径区分文案与语义（M29.5 C78）：

| 错误码 | 语义 | 平台展示口径 | 是否计入失败 |
|:--|:--|:--|:--:|
| `ALERTS_DISABLED` | 仓库**未启用** alerts 功能（Dependabot alerts / GitHub Advanced Security 下的 Code Scanning、Code Quality） | 「未启用」+ **按源**给出开启指引（Settings → Code security）；单列计数，不标红 | **否**（预期状态） |
| `PERMISSION_DENIED` | token 权限不足 | 「权限不足」+ token 权限指引 | 是 |
| `AUTHENTICATION_FAILED` | token 无效 / 过期 | 「认证失败」+ 检查 token 配置 | 是 |
| `RATE_LIMITED` | API 限流（ratelimit 归零） | 「限流」+ 等待重置时间 | 是 |
| `REPO_NOT_FOUND` | 仓库不存在 / 无访问权 | 「仓库不可达」 | 是 |
| `NETWORK_ERROR` / `GITHUB_API_ERROR` | 网络 / API 异常 | 「获取失败」 | 是 |

**关键区分**：`ALERTS_DISABLED` ≠ `PERMISSION_DENIED`。前者是仓库设置问题（非 token 权限），不应误导用户排查 token。未启用仓库计入 `RunSummary.reposWithAlertsDisabled` 单列计数 + `RunResult.alertsDisabled`（含 `source`）明细，不影响 exitCode。

**文案落点（区分两层）**：
- **报告**：`Alerts Disabled` 段用**源无关的通用开启指引** + `Source` 列区分来源（报告层不逐源给路径，避免 core 反向依赖 engine 文案）。
- **日志 / 运行提示**：由 `alertsDisabledHint(source)` 给出**按源的开启路径**（Dependabot alerts / GitHub Advanced Security 下的 Code Scanning、Code Quality）。

**匹配口径**：`ALERTS_DISABLED` 覆盖 `dependabot` / `code-scanning` / `code-quality`；403 判定的权威说明见 [github-client.md §5.3](../design/modules/github-client.md)（Dependabot 精确文案 / GHAS 容忍匹配 / 匹配失败退回 `PERMISSION_DENIED`）。

## 7. 前端规范（app/）

- Vue 3 Composition API + `<script setup lang="ts">`
- caomei-ui 组件按需使用（`caomei-ui/nuxt` 自动导入，无需手动注册）；模板中 PascalCase（`Caomei*`）
- 样式：SCSS + BEM；全局变量/ mixin 通过 `vite.css.preprocessorOptions.scss.additionalData` 注入，**组件内直接使用 `$space-4` / `$color-primary` 等变量**
- 暗色模式：`use-color-mode.ts` 切换 `<html>.dark` + localStorage 持久化；caomei-ui 主题按 `.dark` class 切换（`caomeiUI.darkMode: 'class'`）。**全局 SCSS mixin 适配**：`main.scss` 是全局 CSS 无 scope，`@mixin dark-mode { :global(.dark) & { @content; } }` 编译失败（`:global()` 是 CSS Modules 语法只在 `<style scoped>` 有效）；正确写法是 `.dark &`（mixin 改动 1 行，4 处 `@include dark-mode` 自动 work）。
- composables / utils 文件 **kebab-case**；Vue 组件 **kebab-case.vue**；样式类 BEM
- 页面组件默认导出为空（布局/路由由 Nuxt 管理），业务状态放 composables 或组件内
- 禁止 `any`；模板中不写复杂逻辑（抽到 computed / 函数）

### 7.1 caomei-ui 集成实践

> 平台组件库已从 PrimeVue 4 迁移到 caomei-ui 0.3.0（M31 迁移完成，PrimeVue 依赖已卸载）。具体接线约定（token 覆盖 / 图标 / 选择器 / 受控状态 / 密度）见 [§7.4](#74-caomei-ui-接线约定)；本节只登记**与组件库无关的通用实践**。迁移前的组件库实现契约（sortable 用 data attribute / `default-sort-order` / `sort-mode="multiple"` 的 `multiSortMeta` 约定 / `:sort-meta` 静默忽略 / `Select` disabled 渲染等 9 条陷阱）已随卸载退役：多列排序与受控状态部分见[迁移评估 §15.10-§15.13](../design/governance/caomei-ui-migration.md)，其余（如 `Select` disabled 渲染、`:sort-meta` 静默忽略）正文仅存于归档页与 git 历史。

- **派生字段运行时修改路径必须同步**：派生字段（`_severityRank` / `_statusRank` / `_roleRank`）的首次注入（fetch 时 `withXxxRank`）不能覆盖后续运行时修改路径——必须每次同步（如 `updateStatusRank` / `updateRoleRank`）。否则 fetchDetail 修改 row.status 后没更新 _statusRank，DataTable 排序引用陈旧 rank → 业务语义错位。
- **图表组件体积**：引入第三方图表包装组件前先 grep 其内部是否 `import('chart.js/auto')` 等全量依赖。本项目自实现 `chart-canvas.vue`（仅注册用到的 controllers / elements / scales / plugins 子集），实测 bundle < 50KB gzip（第三方包装约 200KB，节省 ~75%）。`<ClientOnly>` 包裹避免 SSR `window is not defined`。
- **类型 vs 运行时契约核验**：编写 v-model 绑定、ref 形态、callback 契约时**必须直接看依赖包内部实现**（`node_modules/<pkg>/dist/*.mjs`），不能只信 TypeScript 类型声明。Vue 对未知 prop / 未知事件是**静默忽略**（无运行时错误也无功能效果），命名错误只能靠核实源码发现——本项目已积累多条同类 latent bug，案例见 [经验归档](../design/governance/experience-archive.md)。
- **bugfix 烟雾脚本**：一次性 smoke 验证脚本（`tests/e2e/_smoke-xxx.mjs`，跑完即删）能精准捕获类型/运行时契约类 bug 的修复有效性：监听 `pageerror` + `console.error`，过滤已知 noise（preload warnings），断言关键错误文本。比单纯 typecheck 更具说服力，特别是 e2e 未覆盖真实数据加载路径的场景。验证后清理脚本不留痕（开发规范 §5.1.11 调试临时代码清理规则）。

### 7.2 i18n 配置单点声明

- **配置中心位置**：`apps/platform/i18n/` 目录下两个文件协作承载全部 i18n 配置：
  - `apps/platform/nuxt-i18n-config.ts` —— @nuxtjs/i18n 模块层配置（locales / strategy / langDir / defaultLocale / detectBrowserLanguage / detector 路径），被 `nuxt.config.ts` 顶层 import 后 spread 到 `i18n` 字段；**jiti 安全**（无 `defineI18nConfig` 顶层调用）。
  - `apps/platform/i18n/i18n.config.ts` —— vue-i18n 构建期配置（datetime/number formats 本地化），通过 `nuxt.config.ts` 的 `i18n.vueI18n` 字段按文件路径加载，**仅可由 Nuxt transform pipeline 加载**（注入了 `defineI18nConfig` 全局）。
  - `apps/platform/i18n/localeDetector.ts` —— 浏览器语言检测器（`resolveLocale` 纯函数，便于单测）；`nuxt-i18n-config.ts` 仅以路径常量引用。
  - `apps/platform/nuxt.config.ts` 的 `i18n` 块仅做引用（spread `nuxtI18n` + `vueI18n` 路径 + `experimental.localeDetector`），不再重复 locales / strategy / langDir / detectBrowserLanguage 等字段；当前 i18n 块 6 行（含括号）。
- **jiti 加载边界（关键约束）**：`nuxt.config.ts` 顶层 import 走 jiti（轻量 TS 转换器，无 Nuxt transform pipeline），而 `defineI18nConfig` 是 @nuxtjs/i18n 模块加载时通过 addImports 注入的运行时全局。因此 `nuxt.config.ts` 顶层 **只能 import 拆出的 `nuxt-i18n-config.ts`**（仅 named export const 定义，无模块顶层副作用），**不能 import `i18n.config.ts`**（其 default export 会触发 jiti 顶层 evaluate `defineI18nConfig(...)` → `is not defined` 报错）。这是双文件拆分的唯一根因，不接受合并尝试（合并会在 typecheck 时暴露）。
- **`as const` 锁定字面量类型**：`nuxtI18n = { ... } as const` 是必需的，避免 spread 后被 Nuxt 模块类型推断为宽化（`string` 而非字面量），引发 `@nuxtjs/i18n` 字段契约检查报错。
- **nuxt.config.ts i18n 块行数上限**：≤ 10 行（仅引用 + 必要 override）。超出即视为散落配置点回归，应回收到 `nuxt-i18n-config.ts`。
- **新增语言流程**：仅改 `nuxt-i18n-config.ts` 一处（`nuxtI18n.locales` 追加 1 项 `{ code, name, file, language }`）+ 在 `apps/platform/i18n/locales/` 下复制对应 `.json` 并补翻译。`nuxt.config.ts` 与 `i18n.config.ts` 不需任何 i18n 字段调整。
- **职责边界**：本节聚焦 i18n **配置实现层**（字段归属与单点声明）；语言标识规范 / fallback 链 / 文案归属层级 / 翻译流程见 [i18n.md §3](./i18n.md#3-平台-ui-国际化)。
- **禁止反模式**：
  - 在 `nuxt.config.ts` i18n 块内重复声明 `locales` / `strategy` / `langDir`（散落点回归）
  - 把 `vueI18n` 字段写成内联对象而非文件路径（无法承载 `locales` 等模块层字段，也丢失 i18n.config.ts 作为运行时配置中心的边界）
  - 把 `i18n.config.ts` 的 named export（含 vue-i18n 配置以外的代码）放到会被 jiti 顶层 import 的位置（必须物理拆分）
  - 在 detector 文件里直接 hard-code `defaultLocale` 或 locale 列表（应通过 `nuxtI18n` 配置中心维护）

### 7.3 Utility 抽取与跨组件共享

- **抽取时机**：D 阶段实现收尾时若发现同一格式化函数在 ≥ 2 个 SFC 中重复出现（如 `modeLabel` / `executorLabel` / `formatDuration`），立即抽到 `apps/platform/app/utils/<feature>.ts` 单文件集中维护；同时接受 Review Gate `suggest` 触发的反向抽取（先实现后抽取）。
- **utility 签名**：仅接受纯函数（无副作用、依赖参数化）；i18n 相关函数应接收 `t: (key, params?) => string` 翻译函数作为参数，而非在 utility 内部 `useI18n()`——避免 utility 与 Vue 实例耦合，提高单测覆盖度（无需 mock i18n）。
- **utility 单测一次性覆盖所有分支**：抽取后立即补单测覆盖所有分支（含 NaN / Infinity / 缺失字段 / 负时长 / 非法日期等边界）；不接受"先实现后补测"的两段式——utility 函数纯度高，单测零成本，理应一次到位（M15.1 run-view.test.ts 16 case 单批覆盖 6 函数所有分支）。
- **函数签名变更必须同步所有调用方**：utility 函数签名变更后必须 grep 全仓所有调用方同步更新；`pnpm typecheck` 不捕捉 vitest mock 下的类型错误（mock 路径可能跳过部分类型检查），Review Gate `audit-depth: quick` 仍能命中此类 blocker（M15.1 第 1 轮 Reject B1 `alertsFound` 误用——调用方传整个 run 对象，签名已变）。
- **跨组件复用边界**：utility 一旦抽到 `utils/<feature>.ts`，所有 SFC（含 dialog 组件）通过 import 复用；禁止在第二个 SFC 中复制定义（即使仅微调）。

### 7.4 caomei-ui 接线约定

> 迁移背景、分批计划与逐批实证见 [apps/platform UI 组件库迁移评估](../design/governance/caomei-ui-migration.md)（PrimeVue 迁移已于 M31 闭环、依赖已卸载）；本节只登记**接线约定**与**实证结论**。

- **模块注册**：`modules: ['caomei-ui/nuxt', '@nuxtjs/i18n']` + `caomeiUI: { prefix: 'Caomei', darkMode: 'class', theme: { ... } }`。组件名 `Caomei*`、类名 `caomei-*`、token `--caomei-*`。
- **token 覆盖分两处，不可合并**：`caomeiUI.theme` **只生成一条跨明暗的 `:root` 声明**（适合 `--caomei-color-primary-solid` 这类跨主题稳定的实底色）；随明暗自适应的 token 必须在 CSS 中按明暗分别覆盖，落在 `app/assets/styles/_caomei-tokens.scss`。原因：库内暗色档由 `caomei-ui/theme.css` 的 `:is(.dark, [data-theme="dark"])`（特异性 0,1,0）提供，会被模块生成的后加载 `:root`（同为 0,1,0）压过；因此暗色档改用 `:root.dark` / `:root[data-theme="dark"]`（0,2,0），与打包顺序无关。
- **`_caomei-tokens.scss` 必须显式 `@use './variables' as *`**：经 `@use` 引入的 partial 不会继承 Vite `additionalData` 注入的变量层（Sass `@use` 不传播注入），漏写时 `nuxt build` 报 `Undefined variable` —— **typecheck / lint 不编译 SCSS，唯 `build` 能暴露**。
- **主色 token 取值（对比度实测）**：`--caomei-color-primary-solid: #0f766e`（teal-700）配 `--caomei-color-on-solid`（白）实测 **5.47:1**（≥ AA 4.5:1）；`--caomei-color-primary` 亮色 `#0d9488`（teal-600）/ 暗色 `#5eead4`（teal-300），其作底时配 `--caomei-color-primary-foreground: #0b0b0d`（实测亮色 5.25:1 / 暗色 13.29:1，库默认白字仅 3.74:1 不达标）；`bg` / `bg-elevated` / `text` / `text-muted` / `border` 对齐 `_variables.scss` 的 `$color-*` 明暗两档。
- **图标**：`CaomeiIcon` 的 prop 是 `icon: Component`（`@lucide/vue` 图标组件），**不存在** `name` 字符串 prop；`@lucide/vue` 已是平台直接依赖（`^1.48.0`），`#icon` 槽一律写 `<CaomeiIcon :icon="X" />`——`CaomeiIcon` 默认 `size="1em"`，直接写 `<X />` 会按 lucide 默认 24px 渲染偏大。
- **全局 provider 接线**：`app/app.vue` 用 `CaomeiConfigProvider`（`:locale` 单点映射平台 i18n：`en` → `en-US`，其余 → `zh-CN`）→ `CaomeiToastProvider` → `CaomeiConfirmDialog` 包裹应用；`useToast()` / `useConfirm()` 由 `caomei-ui/nuxt` 自动导入，任意后代组件可直接调用。原生 `confirm()` 已改为 `useConfirm().open({ tone: 'danger' })`（返回 `Promise<boolean>`）。
- **选择器家族全宽**：caomei Select / MultiSelect / AutoComplete 默认上限 `20rem`（无 `fluid` prop）；仓库统一覆盖 `--caomei-select-max-width: none`，宽度交由容器约束。**覆盖必须用 `:root:root`（0,2,0）**——`caomei-ui/theme.css` 的 `:root` 在 `main.scss` 之后加载，同特异性（0,1,0）会被它压过（与下方暗色档用 `:root.dark` 同理）。
- **选择器家族的可见根元素不是组件根 vnode**：`CaomeiSelect` 的可见根是 Reka `SelectTrigger` 渲染的按钮，**页面 scoped 与全局样式写在该按钮上都会被库 scoped 规则（`.caomei-select[data-v]`，0,2,0）压过** → 给单个选择器限宽必须用外层容器（`display: inline-block` + 定宽；如 `users.vue` 的 `.users__role-select` 与页头 `.platform__lang`）或 `:deep()`。`CaomeiInput` 的根是普通 div（`useAttrForwarding` 的 `rootAttrs`），不受此限。
- **组件差异速查**：`CaomeiSelect` 无 `#value` 槽（触发器只渲染 `optionLabel`，自定义触发器内容需外置）与 `loading` prop；`CaomeiDrawer` 只 emit `update:open`（**无 `hide`**，`Dialog` 才有）；`CaomeiCheckbox` 根是 `role="checkbox"` 的按钮（无原生 input，**不可嵌套在 `<label>` 内**，可见文案走 `text` prop）；`CaomeiInput` 的 `type` 联合不含 `datetime-local`（原生属性仍会透传到内层 input，需显式收窄断言）；`CaomeiInput` / `CaomeiTextarea` 透传的 `@input` **先于** v-model 写回触发（内层 v-model 走 `vModelDynamic` / `vModelText` 指令，在 `created` 阶段注册，晚于透传的 `onInput`）→ 依赖新值的同步 handler 必须用 `@update:model-value`。
- **受控状态必须回写**：`expandedRowGroups` / `expandedRows` / `multiSortMeta` / `page` 等受控 prop 需配合 `@update:*` 回写（等价 `v-model:*`）。只声明 prop 而不回写会出现"内建按钮点了没反应"（V1 验证页曾命中）。
- **DataTable 密度与覆盖特异性**：caomei 无 `size` prop，默认单元格内边距大于迁移前的 `size="small"`；仓库统一在 `_caomei-tokens.scss` 收敛为 small 档（覆盖单元格须用 `.caomei-data-table__table th.caomei-data-table__th` 级别的选择器，caomei 的 scoped 规则特异性为 0,2,0）。**例外**：`pr-checks.vue` 未设 `size`，已按用户裁定恢复 caomei 默认密度（详见[迁移评估 §15.11](../design/governance/caomei-ui-migration.md#1511-其余表页迁移实证m3132026-09-28)）。
- **分组列与分组连续性**：本仓库做法是从 `columns` 剔除 `groupRowsBy` 同名列（迁移前组件库在 subheader 模式本就省略该列），并依赖服务端 `orderBy(groupBy)` 保证同组相邻；**不要保留分组字段的客户端排序键**（TanStack 只对列模型中存在的列排序，会被静默丢弃）。详见[迁移评估 §15.10](../design/governance/caomei-ui-migration.md#1510-datatable-核心页迁移实证m3122026-09-28)。
- **验证命令**：`pnpm --filter @dependfix/platform typecheck` + `lint` + `test` + `build`；样式类改动必须跑 `build`（见上）；浏览器侧证据（截图与断言脚本）留在 gitignored 的 `artifacts/`。

> 执行分层说明：以上为接线约定，其中「影响打包 / 入口 / 产物时必跑 `build`」由 [AGENTS.md 必要检查](../../AGENTS.md) 第 3 条（既有强制门禁）承接；其余条目为执行层指引，不新增 review 检查点。

### 7.5 上游组件问题归因与 issue 上报流程

> 适用：平台页面 / 组件行为异常，且怀疑根因在组件库（`caomei-ui`）或其传递依赖（`reka-ui` / `lucide` 等），而非本仓代码。
> 首个案例：弹窗内 Select 面板层叠缺陷——归因判定为上游问题，且上游已在 `0.5.0` 修复（见[迁移评估 §15.14](../design/governance/caomei-ui-migration.md#1514-caomei-ui-050-升级实证m3422026-10-01)），故本流程的「上报」分支当时未触发。

- **第 1 步 · 归因判定清单（三条全过才按上游问题上报）**：
  1. **能否脱离本仓代码复现**——把本仓的样式覆盖 / 容器约束 / 受控状态写法全部移除后仍复现 → 上游行为；仅在叠加本仓覆盖后才出现 → 本仓配置问题，先回到 [§7.4 接线约定](#74-caomei-ui-接线约定) 排查。
  2. **官方示例是否复现**——库自带 demo / 文档示例同样复现 → 库行为；不覆盖 → 可能是 prop 组合越界使用。
  3. **版本与 prop 是否越界**——prop / slot / 事件的存在性以**已安装版本**的 `node_modules/<pkg>/dist/**` 源码为准（类型声明可能滞后或过宽，见 [§7.1「类型 vs 运行时契约核验」](#71-caomei-ui-集成实践)）；用了未发布 / 已移除 API 时先改用法。
- **第 2 步 · 取证**：最小复现片段 + 浏览器侧实测值（`getComputedStyle` / `getBoundingClientRect` / `elementFromPoint`）+ 截图，且**与冻结代码同批生成**（同 [测试规范 §6.8](./testing.md#68-取证工件必须与冻结代码同批生成)）。已有载体：视觉套件的门户面板用例把诊断 JSON 与截图作为 attachment 落盘（见 [测试规范 §6.7](./testing.md#67-视觉回归截图识别层appsplatform)）。
- **第 3 步 · 上报路径**：目标仓库的 `.github/ISSUE_TEMPLATE/` 模板优先（本项目模板形态可参考 [`.github/ISSUE_TEMPLATE/bug_report.yml`](../../.github/ISSUE_TEMPLATE/bug_report.yml)）；目标仓库无模板时按其通用 bug 结构（描述 / 复现步骤 / 期望行为 / 环境）提交——**不因缺模板而放弃上报**。
- **第 4 步 · 模板要素（缺一不可）**：环境版本（组件库版本 + 浏览器 + Node）+ 最小复现（可粘贴代码或链接）+ 期望与实际 + 截图（含第 2 步诊断值）。**不写入**本仓私有代码、内部数据或凭据。
- **第 5 步 · 本仓侧处置**：在 [backlog](../plan/backlog.md) 登记「已上报上游 + 影响面 + 临时措施」；**不在本仓为上游缺陷做二次封装兜底**（需兜底时由用户明确决策并单独登记）。上游修复后随依赖升级回归，并按 [测试规范 §6.7](./testing.md#67-视觉回归截图识别层appsplatform) 核验基线。

> 执行分层说明：以上为**执行层指引**（判定顺序 / 取证要求 / 上报路径 / 模板要素）；其中「不写入本仓私有代码、内部数据或凭据」属 [安全规范](./security.md) 与 [AGENTS.md 安全与行为红线](../../AGENTS.md) 既有禁令的适用面，不新增 review 检查点。

## 8. 测试规范

- server 层纯逻辑（加密、adapter、服务）用 Vitest node 环境，位于 `server/**/*.test.ts`
- 涉及 Nuxt runtime（`useRuntimeConfig` / API 路由）的测试：API 集成测试放 `tests/` 或 `server/api/**/*.test.ts`，通过 `@nuxt/test-utils` 启动（M6 按需引入，T602 起）
- 数据库测试：SQLite `:memory:` + `DATABASE_TYPE=sqlite`，每个测试独立 DataSource（`beforeEach` 重建）
- 时间列断言：使用 `getDateType('sqlite')` 期望值，避免硬编码
- 测试命令：`pnpm --filter @dependfix/platform test`（vitest run）
- 视觉回归（截图识别层）：`pnpm --filter @dependfix/platform test:visual`（更新基线加 `:update`）；独立 config / 独立库 / 基线入仓库，口径见 [测试规范 §6.7](./testing.md)

## 9. 质量门禁

- `pnpm lint` / `pnpm typecheck`（根目录，含平台）
- **平台 Vue 模板规则只在平台自己的 ESLint 配置生效**：根 `pnpm run lint` 不覆盖平台 `eslint.config.js`（`eslint-config-cmyr/nuxt`）的模板规则，且两侧 `lint` 脚本都带 `--fix`（会静默修正、exit 0）→ 平台改动收尾须额外跑**非 `--fix`** 检查：`pnpm --filter @dependfix/platform exec eslint . --max-warnings 10`，确保提交态 fix-stable。属**执行层验证指引**（不新增 review 检查点）。
- `nuxt build` 必须通过（Docker 构建前置）
- 平台相关改动需运行 `pnpm --filter @dependfix/platform test`
- 提交走 [conventional-committer 流程](./git.md)，scope 用 `platform`（如 `feat(platform): ...`）
- 注释禁止规划编号标记（T601 等），违反即清理（[开发规范 §3](./development.md)）

## 10. 环境变量总表（.env.example 对齐）

| 变量 | 必需 | 默认值 | 说明 |
|:--|:--:|:--|:--|
| `PORT` | 否 | `3000` | 平台监听端口（容器内固定 3000，外部映射） |
| `AUTH_SECRET` | 生产必需 | 开发随机 | better-auth 密钥 |
| `DATABASE_PATH` | 否 | `data/dependfix.sqlite` | SQLite 路径（容器内 `/app/data/dependfix.sqlite`） |
| `DATABASE_TYPE` / `DATABASE_URL` | 否 | `sqlite` | 多后端切换 |
| `DATABASE_SSL` | 否 | `false` | MySQL/PG 启用 SSL（多后端时生效） |
| `DATABASE_ENTITY_PREFIX` | 否 | `dependfix_` | 表前缀 |
| `DATABASE_SYNCHRONIZE` | 否 | `false` | 全场景显式 opt-in 才同步 schema（详见 [development.md §5.1.19](./development.md)） |
| `NUXT_ENCRYPTION_KEY` | 凭据功能必需 | 空 | AES-256-GCM 平台密钥（PAT token + GitHub App PEM 私钥共用同一密钥派生） |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 否 | 空 | 配置后启用邮件验证 |
| `NUXT_PUBLIC_BETTER_AUTH_URL` | 反向代理时 | 自动推断 | 认证基础 URL |
| `MACHINE_ID` | 否 | `pid % 1024` | 雪花机器位 |

## 11. 决策记录（2026-08-07 人工审查确认）

1. **多后端时机**：M6 默认 SQLite 交付，`getDateType()` + driver 注入 + `DATABASE_URL` 推断一次性做对（避免 T601 后返工）；MySQL/PG 真实部署验证延后到 M7 —— ✅ 确认
2. **表前缀**：默认 `dependfix_`（`DATABASE_ENTITY_PREFIX` 可配）—— ✅ 确认（需要前缀）
3. **synchronize 策略**：M6 开发/测试自动同步 + 生产显式开启（`DATABASE_SYNCHRONIZE=true`）；正式迁移链排期 M7 —— ✅ 确认（2026-09-01 演进：synchronize / migrationsRun 均显式 opt-in，详见 [development.md §5.1.19](./development.md)）
4. **雪花 ID**：沿用 momei 方案（48 位时间戳 + 10 位机器 + 12 位序列，hex 输出）；与 better-auth 默认 UUID 不同，全局统一 —— ✅ 确认
5. **首用户 admin**：首个注册用户自动 `role=admin`（`databaseHooks.user.create.before`）—— ✅ 确认
6. **文件命名**：文件与 Vue 组件统一 **kebab-case**（Nuxt 自动导入 `use-session.ts` → `useSession`）—— ✅ 确认；全局 [开发规范 §2](./development.md) 已同步修订（Vue 组件由 PascalCase 改为 kebab-case）

## 12. 相关文档

- [开发规范](./development.md)
- [API 规范](./api.md)
- [安全规范](./security.md)
- [测试规范](./testing.md)
- [momei 平台实现参考分析](../research/2026-08-07-momei-platform-reference.md)
- [架构设计](../design/governance/architecture.md)
