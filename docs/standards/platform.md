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
| UI | PrimeVue 4 + `@primevue/nuxt-module` | 组件库 |
| 主题 | `@primeuix/themes`（Aura preset + 自定义 primary） | 暗色模式 `darkModeSelector: '.dark'` |
| 样式 | 纯 SCSS + BEM，无 CSS-in-JS / Tailwind | 全局变量 + mixin |
| 认证 | better-auth（邮箱密码） | TypeORM adapter（自研，见 §4.2） |
| ORM | TypeORM 1.x | 显式驱动注入，多后端兼容 |
| 数据库 | SQLite（M6 默认）/ MySQL / PostgreSQL（预留） | `DATABASE_TYPE` / `DATABASE_URL` 切换 |
| 校验 | Zod | server API 输入 |
| 构建 | Nuxt build（`nuxt build` / `.output/`） | |
| 测试 | Vitest（node 环境）+ 组件测试（按需） | |

> 版本策略：`nuxt`、`better-auth`、`typeorm`、`primevue` 等核心依赖跟随 momei 已验证版本线（monorepo 内 workspace 依赖用 `workspace:*`）。**禁止引入未经验证的新大版本**；跨大版本升级必须先走 TypeORM 1.x 升级评估式的 probe 流程（见 [momei 参考 §5](../research/2026-08-07-momei-platform-reference.md)）。

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
│   │   ├── repos/              # 仓库 CRUD + 扫描触发（T602/T603，任务归属见 `docs/plan/todo.md` §M6）
│   │   ├── credentials/        # 凭据管理（T602，任务归属见 `docs/plan/todo.md` §M6）
│   │   ├── runs/               # 扫描历史/报告（T603/T604，任务归属见 `docs/plan/todo.md` §M6）
│   │   └── alerts/             # 告警查询（T604，任务归属见 `docs/plan/todo.md` §M6）
│   ├── database/               # 数据库层
│   │   ├── index.ts            # DataSource 初始化（多后端）
│   │   ├── type.ts             # getDateType() 列类型映射
│   │   ├── naming-strategy.ts  # snake_case 命名策略
│   │   └── typeorm-adapter.ts  # better-auth TypeORM adapter
│   ├── entities/               # TypeORM 实体
│   ├── services/               # 业务逻辑层（扫描编排、凭据加解密）
│   ├── middleware/             # server 中间件（按需）
│   └── utils/                  # server 工具（auth 实例、加密、雪花 ID）
├── Dockerfile                  # 多阶段镜像（alpine-nodejs 构建 / minimize 运行时，含 cli/core dist）
├── docker-compose.yml          # SQLite 数据卷部署
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

### 3.4 实体规范

- 继承 `BaseEntity`（雪花 ID + `getDateType()` 时间戳）
- 属性名 camelCase（与 better-auth schema 一致），列名由 `SnakeCaseNamingStrategy` 转 snake_case
- better-auth 四表（`user` / `session` / `account` / `verification`）字段对齐 better-auth 默认 schema，**不得增删字段**；平台自有字段（如 `role`）通过 better-auth `user.additionalFields` 配置并同步实体
- 跨库类型归一：SQLite 下 `bigint` → `integer`；PG 下 `bigint` → `integer`、长文本 → `text`（M6 以 SQLite 为默认目标，但实体写法必须保持三后端可编译）

### 3.5 TypeORM 查询模式

- **`find()` 不支持嵌套路径 order by**：TypeORM 1.x `find({ order: { 'scanRun.repository.owner': 'ASC' } })` **不支持嵌套路径 order by**（仅支持 entity 顶层字段），会抛 `EntityPropertyNotFoundError: Property "scanRun.repository.owner" was not found in "ScanResult". Make sure your query is correct.`（`node_modules/typeorm/query-builder/SelectQueryBuilder.js:2371` 等抛出位置）。任何"按关联实体字段排序"的需求必须用 QueryBuilder：`createQueryBuilder('result').leftJoinAndSelect('result.scanRun', 'scanRun').leftJoinAndSelect('scanRun.repository', 'repository').orderBy('repository.owner', 'ASC').addOrderBy('repository.name', 'ASC')`。统一代码路径优先（全部走 QueryBuilder 而非 find + QueryBuilder 两条路径），简化维护 + 行为等价。修复 commit `374a278`（alerts 视图切换按包 / 按项目）。

### 3.6 e2e / fixtures 端点双门控规范

`apps/platform/server/api/e2e/*` 下的所有端点（fixtures.post.ts / fixtures.delete.ts 等）**必须**叠加两道门控，防止生产环境误暴露。

**强制门控**（两条件同时满足才放行）：
```typescript
if (process.env.E2E_TEST !== 'true' || process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
}
```

**为什么需要双门控**：
- 单门控 `E2E_TEST === 'true'` 风险：生产环境误设 `E2E_TEST=true`（运维误操作、docker-compose 复制粘贴、CI 环境变量泄漏）即暴露端点
- 叠加 `NODE_ENV === 'production'` 兜底：即使 `E2E_TEST=true`，生产环境永远返回 404

**应用范围**：
- `apps/platform/server/api/e2e/fixtures.post.ts` — POST /api/e2e/fixtures
- `apps/platform/server/api/e2e/fixtures.delete.ts` — DELETE /api/e2e/fixtures
- 未来新增的 `apps/platform/server/api/e2e/*.ts` 文件全部适用

**禁止**：
- ❌ 单 `E2E_TEST` 门控（缺 NODE_ENV 兜底）
- ❌ `NODE_ENV !== 'development'` 门控（dev/test/staging 区分不清晰）
- ❌ `import.meta.dev` 门控（仅 Nuxt 内置 dev/prod 区分，部署到 staging 仍误暴露）

**D 阶段自检**：Full Stack Master (全栈大师) agent 检查所有 `apps/platform/server/api/e2e/*.ts` 文件，确认含双门控代码

**A 阶段 Review Gate**：code-auditor 主责边界新增"e2e 端点双门控"必查项

**实证**（2026-09-01 dependfix.sqlite 数据清空事故关联风险）：事故排查发现 `apps/platform/server/api/e2e/fixtures.delete.ts:39` 只有 `E2E_TEST !== 'true'` 单门控，与 fixtures.post.ts 同模式（post.ts:24-26 已记录 RG-S3 follow-up 未落地）。详见 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)。

### 3.7 SQLite 启动期备份 + 自检工具

依赖 better-sqlite3 的 `apps/platform` 应用必须提供：

1. **`apps/platform/server/database/backup.ts`**（hard requirement）：启动期自动备份
   - 调用时机：`ensureDatabaseInitialized()` 之前同步调用
   - 备份路径：`data/backups/${basename}.${YYYY-MM-DDTHH-mm-ss}.bak`
   - 触发条件：源文件存在 + size > 0 + 后缀不是 `.bak`
   - 写入安全：`fsync` + `rename`（避免断电留半成品）
   - 保留策略：最近 N 份（默认 10，`BACKUP_RETENTION_COUNT` env 可覆盖），按 mtime 升序清理
   - 失败处理：catch + console.error，**不阻塞启动**

2. **`apps/platform/server/database/scripts/db-restore.ts`**（CLI 入口守卫必备，见 development.md §5.1.5）：
   - 用法：`pnpm db:restore --from=<backup-file>`
   - 安全门控：必须 `--yes` flag 二次确认（避免误操作覆盖当前数据库）
   - 实现：先备份当前数据库到 `data/backups/auto.${timestamp}-${ms}.bak`（覆盖前再留一份），再 `cp` 目标备份到 `data/dependfix.sqlite`，最后清理旧库的 `-wal` / `-shm` / `-journal` 旁文件

3. **`apps/platform/server/database/scripts/db-doctor.ts`**（自检工具）：
   - 打印：各表行数、`freelist_count`、`page_count`、`schema_version`、`journal_mode`、`integrity_check`、`sqlite_sequence`
   - 判断"数据是被清空 vs 从未注入 vs schema 升级中"：
     - schema_version > 0 + 各表全空 → 数据被清空或从未注入
     - schema_version = 0 → 全新数据库
     - freelist_count > 0 → 有数据被删除但未 VACUUM
   - 输出可读报告（人读 + 机读双模，见 §5.1.2 development.md）

**D 阶段自检**：必须验证上述 3 个文件存在且含核心实现（fsync / retention / `--yes` 门控 / 报告格式）

**A 阶段 Review Gate**：backup.ts 必须含 fsync + retention 清理逻辑；db-restore.ts 必须含 `--yes` 二次确认；db-doctor.ts 必须打印 schema_version + freelist_count

详见 [development.md §5.1.18](./development.md) 与 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)。

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

## 5. 凭据安全规范（T602 起生效）

- 平台级密钥：环境变量 `NUXT_ENCRYPTION_KEY`（AES-256-GCM 密钥，32 字节 base64 或 hex；Nuxt `NUXT_` 前缀约定）；未配置时**禁用凭据功能并明确报错**（不静默降级为明文）—— M17.1 标准化（C38 治理：service 直读 env → `useRuntimeConfig().encryptionKey` + 移除 inline fallback；详见 M17 闭环记录 [todo-archive.md §M17.1](../plan/todo-archive.md)）
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

## 7. 前端规范（app/）

- Vue 3 Composition API + `<script setup lang="ts">`
- PrimeVue 组件按需使用（`@primevue/nuxt-module` 自动导入，无需手动注册）；模板中 PascalCase
- 样式：SCSS + BEM；全局变量/ mixin 通过 `vite.css.preprocessorOptions.scss.additionalData` 注入，**组件内直接使用 `$space-4` / `$color-primary` 等变量**
- 暗色模式：`use-color-mode.ts` 切换 `<html>.dark` + localStorage 持久化；PrimeVue 主题 `darkModeSelector: '.dark'`。**全局 SCSS mixin 适配**：`main.scss` 是全局 CSS 无 scope，原 `@mixin dark-mode { :global(.dark) & { @content; } }` 编译失败（`:global()` 是 CSS Modules 语法只在 `<style scoped>` 有效）；正确写法是 `.dark &`（mixin 改动 1 行，4 处 `@include dark-mode` 自动 work）—— 这是 2026-08-20 C59 mixin 修复的根因。
- composables / utils 文件 **kebab-case**；Vue 组件 **kebab-case.vue**；样式类 BEM
- 页面组件默认导出为空（布局/路由由 Nuxt 管理），业务状态放 composables 或组件内
- 禁止 `any`；模板中不写复杂逻辑（抽到 computed / 函数）

### 7.1 PrimeVue 4 集成实践

- **sortable 用 `data-p-sortable-column` 属性**（PrimeVue 4 把 sortable class 改成 data attribute，CSS-in-JS 模式；CSS class `.p-sortable-column` 已废弃）：e2e selector 必须用 `th[data-p-sortable-column="true"]`。写 PrimeVue 4 e2e 前 grep 实际渲染产物确认 attribute vs class。
- **业务语义排序需 `:default-sort-order="-1"`**：PrimeVue 默认 asc 排序与 critical-first 业务顺序相反；column sortable 必须加 `:default-sort-order="-1"`，否则用户首次点击得到反语义结果。`sort-helpers` 的 `_xxxRank` 是升序的 asc 顺序（0 在前），要 desc 显示业务优先级必须显式 -1。
- **派生字段运行时修改路径必须同步**：派生字段（`_severityRank` / `_statusRank` / `_roleRank`）的首次注入（fetch 时 `withXxxRank`）不能覆盖后续运行时修改路径——必须每次同步（如 `updateStatusRank` / `updateRoleRank`）。否则 fetchDetail 修改 row.status 后没更新 _statusRank，DataTable 排序引用陈旧 rank → 业务语义错位。
- **`<Chart>` 引入体积警告**：PrimeVue `<Chart>` 内部 `import('chart.js/auto')` 引入 ~200KB 全量依赖，与 tree-shakable 原则冲突。引入 PrimeVue wrapper 组件前先 grep 内部是否引入了全量依赖；如确实需要 Chart.js，**自实现 `ChartCanvas.vue` 包装**（仅注册用到的 controllers/elements/scales/plugins 子集，如 `LinearScale` + `CategoryScale` + `BarController` + `BarElement` + `DoughnutController` + `ArcElement` + `Tooltip` + `Legend`），实测 bundle < 50KB gzip（vs PrimeVue wrapper 200KB，节省 75%）。`<ClientOnly>`  包裹避免 SSR `window is not defined` 报错。
- **类型 vs 运行时契约核验**：编写 PrimeVue v-model 绑定、ref 形态、callback 契约时**必须直接看 `node_modules/primevue/<comp>/index.mjs` 内部实现**（如 `this.expandedRowGroups.indexOf(...)` 调用），不能信 TypeScript 类型声明（已知 type bug 案例：`DataTableExpandedRows = Record<string, boolean>` 类型允许，但 PrimeVue 4 `v-model:expanded-row-groups` 内部要求 `string[]`，传 Record 触发 `TypeError: ...indexOf is not a function`）。本项目已积累 2 条同类 latent bug：`alerts.vue expandedPackages Record → string[]` 修复（C64，commit `de28ae4`）+ `alerts.vue multiSortMeta` 修复（commit `5c39fe5`）。核验流程：grep `node_modules/primevue/<comp>/index.mjs` 找 `this.<ref>.indexOf` / `this.<ref>[0].field` 等内部契约调用点。
- **`sort-mode="multiple"` 必须用 `v-model:multi-sort-meta` 传初始排序**：PrimeVue 4 `sort-field` + `sort-order` 仅在 `sort-mode="single"` 下生效；切到 `multiple` 后 `d_multiSortMeta` 不会被自动填充（保持空数组 `[]`），但 `d_sortField` 被赋值后 `sorted` 仍为 `true`（`node_modules/primevue/datatable/index.mjs:6091-6093` `sorted = d_sortField || ...`），进入 `processedData` 走 `sortMultiple(data)` → `multisortField(d, d, 0)` → `d_multiSortMeta[0].field` → 空数组 `TypeError: Cannot read properties of undefined (reading 'field')`。正确写法：`v-model:multi-sort-meta="ref<DataTableSortMeta[]>([{field: 'packageName', order: 1}])"`（PrimeVue Volt UI 官方文档明确："In multiple sort mode, `multiSortMeta` should be used"）。触发条件：必须有真实数据加载（e2e 因 mock 数据未真正进入 DataTable 计算路径，被 hydration fixme 掩盖，调试时易误判）。修复 commit `5c39fe5`。
- **`<Select>` disabled 不渲染 root `.p-disabled` class**：PrimeVue 4 `<Select>`（非 editable 形态，default）的 `disabled` 状态**不渲染 root `.p-disabled` class**，而是写到内部 `<span role="combobox">` 的 `aria-disabled="true"` + `tabindex="-1"`（`node_modules/primevue/select/index.mjs:1134-1167` span 渲染分支）。editable 形态才走 `<input>` 的 `disabled` 属性。e2e 断言必须用 selector `.p-select span[role="combobox"]` 而非 root `.p-select` class（`.p-disabled` class 来自 `style/index.mjs:10` 的 CSS-in-JS 模板，PrimeVue 4 默认未注入到 DOM）。
- **bugfix 烟雾脚本**：一次性 smoke 验证脚本（`tests/e2e/_smoke-xxx.mjs`，跑完即删）能精准捕获 PrimeVue 类型/运行时契约类 bug 的修复有效性：监听 `pageerror` + `console.error`，过滤已知 noise（preload warnings），断言关键 TypeError 文本（如 `multisortField` / `Cannot read properties of undefined.*reading 'field'`）。比单纯 typecheck 更具说服力，特别是 e2e 被 known-issue fixme 掩盖的场景。验证后清理脚本不留痕（开发规范 §5.1.11 调试临时代码清理规则）。

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

## 8. 测试规范

- server 层纯逻辑（加密、adapter、服务）用 Vitest node 环境，位于 `server/**/*.test.ts`
- 涉及 Nuxt runtime（`useRuntimeConfig` / API 路由）的测试：API 集成测试放 `tests/` 或 `server/api/**/*.test.ts`，通过 `@nuxt/test-utils` 启动（M6 按需引入，T602 起）
- 数据库测试：SQLite `:memory:` + `DATABASE_TYPE=sqlite`，每个测试独立 DataSource（`beforeEach` 重建）
- 时间列断言：使用 `getDateType('sqlite')` 期望值，避免硬编码
- 测试命令：`pnpm --filter @dependfix/platform test`（vitest run）

## 9. 质量门禁

- `pnpm lint` / `pnpm typecheck`（根目录，含平台）
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
