# momei 平台实现参考分析（dependfix apps/platform 蓝本）

> 调研日期: 2026-08-07
> 方法: 源码扫描（momei master 分支：`lib/auth.ts`、`nuxt.config.ts`、`server/database/*`、`server/entities/*`、`server/utils/*`、`docker-compose.yml`、`utils/shared/env.ts`）+ 官方文档交叉验证（better-auth 1.6、Nuxt 4）
> 结论: momei 的「多数据库兼容 + 显式驱动注入 + 数据库类型驱动的列类型映射 + 自研 better-auth TypeORM adapter」是 dependfix 平台应整体借鉴的骨架；直接照搬会引入与 dependfix 需求无关的复杂度（i18n/存储/队列），需按依赖边界裁剪。

---

## 摘要

momei 是 dependfix 架构文档指定的平台参考实现（Nuxt 4 + better-auth + TypeORM + PrimeVue）。本次分析聚焦平台骨架必需的五块能力：

1. **多数据库兼容与时区处理**（本次重点，用户指出 dependfix 当前骨架存在 PostgreSQL 时区隐患）
2. **better-auth × TypeORM 集成**（官方无 TypeORM adapter，momei 自研）
3. **实体与 ID 设计**（雪花 ID 双源一致）
4. **部署与运行**（Docker Compose、驱动注入、环境变量体系）
5. **工程习惯**（Windows 开发防护、TypeORM 1.x 迁移教训）

结论：momei 的 `getDateType()` + `CustomColumn` + 显式 driver + 连接分层初始化是**必取**项；`DATABASE_URL` 智能推断、`DATABASE_*` 环境变量族、雪花 ID、scrypt、二级存储回退是**应取**项；i18n、存储、队列、OpenAPI、PWA 等与 M6 非目标无关，不取。

---

## 关键事实（含出处/链接）

### 1. 多数据库兼容与时区处理（核心参考）

**时区问题根源**：SQLite / MySQL 使用 `datetime` 列即可；PostgreSQL 若使用 `datetime`（无时区语义）会导致跨时区写入/读取偏移。momei 通过 `getDateType()` 按数据库类型映射列类型，杜绝此问题。

```typescript
// momei server/database/type.ts
export const getDateType = (dbType?: string) => {
    const actualDbType = dbType || DATABASE_TYPE
    switch (actualDbType) {
        case 'sqlite':
            return 'datetime'
        case 'mysql':
            return 'datetime'
        case 'postgres':
            return 'timestamp with time zone'
        default:
            return 'datetime'
    }
}
```

**CustomColumn 装饰器**（`server/decorators/custom-column.ts`）：所有实体列统一走该装饰器，按 `DATABASE_TYPE` 做跨库归一：

- SQLite：`bigint` → `integer`
- PostgreSQL：`bigint` → `integer`；`Date`/`datetime` → `timestamp with time zone`；`mediumtext/longtext` → `text`
- MySQL：`text` 类型限制 `length` 移除、索引长度裁剪（utf8mb4 下 ≤ 768 字符）、`simple-json` 不支持 `default`
- 索引：`index: true` 时自动展开 `@Index({ unique })`，删除自定义 flag

**DataSource 构造**（`server/database/index.ts`）：

- 支持 `sqlite`（better-sqlite3）/ `mysql`（mysql2）/ `postgres`（pg），**显式传入 driver 实例**，绕过 TypeORM 1.x `PlatformTools.load()` 动态 require（Vercel trace / Docker 无 node_modules 场景的已知坑）
- `entityPrefix`（表前缀，momei 用 `momei_`）+ `SnakeCaseNamingStrategy`
- `synchronize: DATABASE_SYNCHRONIZE || DEMO_MODE || TEST_MODE || isDevEnv`（开发/测试自动同步，生产显式关闭）
- `logger` 自定义、`maxQueryExecutionTime` 慢查询监控
- SQLite 在 production/serverless 场景打印警告（数据不跨部署持久化）

**连接分层初始化**（幂等 + 并发锁）：

```
initializeDatabaseConnection()   # 仅连接（安装态冷路径）
initializeDB()                   # 连接 + 维护动作（角色同步、数据修复）
ensureDatabaseReady()            # 完整就绪检查
ensureDatabaseConnectionReady()  # 连接就绪检查
```

- `connectionInitializationPromise` / `initializationPromise` 作为并发初始化锁，完成后释放
- 初始化失败不抛致命错误：日志告警 + 应用继续运行（数据库相关功能禁用），避免启动即崩溃

**按路由懒加载 DB**（`server/middleware/0b-db-ready.ts`）：中间件按 pathname 判定是否预热数据库（`/api` 前缀、`/feed`、`/sitemap` 等需要 DB 的路由触发；`/api/install*`、`_nuxt` 静态资源跳过），降低冷启动延迟。

**DATABASE_* 环境变量族**（`utils/shared/env.ts`）：

| 变量 | 用途 | dependfix 采纳 |
|:--|:--|:--|
| `DATABASE_TYPE` | 显式指定类型；未指定时按 `DATABASE_URL` 前缀自动推断（`mysql:`/`postgres:`/`sqlite:`/`file:`） | 是（M6 默认 sqlite，URL 推断简化） |
| `DATABASE_URL` | MySQL/PostgreSQL 连接串；SQLite 也支持 `sqlite:path` / `file:path` | 是 |
| `DATABASE_PATH` | SQLite 文件路径（默认 `data/dependfix.sqlite`） | 是 |
| `DATABASE_SSL` | 是否启用 SSL（MySQL/PG） | 是（仅多后端时生效） |
| `DATABASE_CHARSET` / `DATABASE_TIMEZONE` | MySQL 字符集与时区（默认 `local`） | 是（归入 M7 多后端验证；M6 SQLite 不涉及） |
| `DATABASE_ENTITY_PREFIX` | 表前缀 | 是（默认 `dependfix_`） |
| `DATABASE_SYNCHRONIZE` | 生产是否同步 schema（默认 false） | 是 |
| `MACHINE_ID` | 雪花 ID 机器位（默认 `process.pid % 1024`） | 是 |

### 2. better-auth × TypeORM 集成

**自研 adapter**（`server/database/typeorm-adapter.ts`，约 470 行）：better-auth 官方只有 Drizzle/Kysely/Prisma/Mongo/Memory adapter，TypeORM 需自研。momei 实现要点：

- 实现 `DBAdapter` 全部方法：`create/update/updateMany/delete/deleteMany/findOne/findMany/count/transaction` + **`consumeOne`**（一次性消费，delete+return）+ **`incrementOne`**（原子计数）
- `getAuthTables(options)` 获取 better-auth 内部 schema，用 `fieldName` 做字段映射；支持 `entityPrefix` + snake_case 表名解析
- 事务：`dataSource.transaction(async (manager) => callback(createAdapter(manager)))`
- 错误统一包装 `BetterAuthError`

> dependfix 注：better-auth 1.6.26 已提供 `createAdapterFactory`（`@better-auth/core/db/adapter`），CustomAdapter 只需 8 个方法，`consumeOne`/`incrementOne` 缺省时 factory 提供事务回退。dependfix 采用 factory 路径（更精简），语义对齐 momei。

**认证配置**（`lib/auth.ts`）：

- `databaseHooks.user.create.before`：**首个注册用户自动授予 admin**（`dataSource.getRepository(User).count() === 0`）
- `session`：`expiresIn 30d`、`updateAge 1d`、`storeSessionInDatabase: true`、cookieCache compact 策略
- `emailAndPassword.requireEmailVerification`：测试/Demo 或未配置 SMTP 时自动关闭（**未配置自动禁用模式**）
- `secondaryStorage`：Redis 可选（`REDIS_URL`），未配置时 LRUCache 内存回退（`server/database/storage.ts`），用于限流与 cookie 缓存
- `advanced.database.generateId`：雪花 ID 生成（与实体 `@BeforeInsert` 同源）
- 第三方登录（GitHub/Google）未配置时自动禁用，不阻塞启动
- `trustedOrigins` 从 `AUTH_BASE_URL`/`SITE_URL` 推导

### 3. 实体与 ID 设计

- `BaseEntity`：`@PrimaryColumn('varchar', { length: 36 })` + `@BeforeInsert` 自动雪花 ID + `CreateDateColumn/UpdateDateColumn`（列类型走 `getDateType()`）
- 雪花 ID（`server/utils/snowflake.ts`）：48 位时间戳 + 10 位机器 ID + 12 位序列号，hex 输出（最长 18 字符，适配 varchar(36)）
- better-auth 四表：`user` / `session` / `account` / `verification`，字段对齐 better-auth 默认 schema（camelCase 属性 + snake_case 列名）
- `SnakeCaseNamingStrategy`：属性 camelCase → 列 snake_case（`emailVerified` → `email_verified`）

### 4. 部署与运行

- `docker-compose.yml`：`TZ: "Asia/Shanghai"` 显式设置容器时区 + `NITRO_HOST: 0.0.0.0` + 数据卷（logs/database/uploads）
- Dockerfile：多阶段构建；生产镜像**不含 node_modules**（依赖 external PostgreSQL），`CMD ["node", ".output/server/index.mjs"]`
- 环境变量双通道：`process.env.X`（服务端私有）+ `NUXT_PUBLIC_X`（客户端可见），集中定义在 `utils/shared/env.ts`
- `dev-worker-guard` 插件（`server/plugins/dev-worker-guard.ts`）：Windows 本地开发时挂 `uncaughtException`/`unhandledRejection` 诊断钩子

### 5. TypeORM 1.x 迁移教训（已踩坑，dependfix 直接规避）

- **字符串数组 `select` / `relations` 语法已移除**（1.0.0），必须用对象语法 `{ field: true }`；momei 迁移时 22 处 `select: [...]` + 38 处 `relations: [...]` 逐一改写
- 驱动必须显式传入（`driver: betterSqlite3 / pg / mysql2`），依赖顶层 ESM import 供 Nitro Rolldown 静态分析
- `Node.js 20+` 硬性要求
- 升级评估流程（go/no-go + 隔离 probe worktree + 失败分桶）见 momei 仓库 `docs/design/governance/archive/typeorm-v1-upgrade-assessment.md`（dependfix 未落盘此文档），是依赖大版本升级的标准流程模板

---

## 交叉验证

- better-auth 官方数据库文档确认：官方适配器清单不含 TypeORM；`createAdapterFactory` 为 1.6+ 推荐的 CustomAdapter 构建路径（momei 的完整 DBAdapter 实现早于 factory 出现，dependfix 用 factory 更贴合新版 API）
- TypeORM 1.0 Release Notes + momei 升级评估双向印证：字符串 select/relations 移除、显式 driver 注入是 1.x 的两个主要行为变化
- momei 生产运行（Vercel + PostgreSQL + Upstash Redis）与 docker-compose（SQLite）双场景证明其多后端抽象有效

## 与 dependfix 的差异与适配决策

| 维度 | momei | dependfix 适配 |
|:--|:--|:--|
| 数据库 | 三后端同时支持，URL 自动推断 | M6 默认 SQLite + 架构预留三后端；`DATABASE_TYPE`/`DATABASE_URL` 全量支持 |
| 列类型映射 | `CustomColumn` 装饰器 | 简化版：`getDateType()` 工具 + 实体统一引用（M6 无 MySQL 长文本场景） |
| better-auth adapter | 自研全量 DBAdapter（470 行） | `createAdapterFactory` + 8 方法 CustomAdapter（~180 行），consumeOne/incrementOne 由 factory 回退 |
| ID | 雪花（可配 MACHINE_ID） | 雪花（沿用，MACHINE_ID 支持） |
| 表前缀 | `momei_` | `dependfix_`（`DATABASE_ENTITY_PREFIX` 可配） |
| 二级存储 | Redis/LRU 双态 | M6 不引入（限流用 better-auth 默认内存即可，M7 评估） |
| 初始化 | 四层 + 懒加载中间件 | 简化两层（`ensureDatabaseInitialized`），路由级懒加载按需引入 |
| 环境变量 | 全量 DATABASE_* / NUXT_PUBLIC_* | 仅取平台必需子集（见规范） |

## 结论与建议

1. **必取**：`getDateType()` 时区映射、显式 driver 注入、`DATABASE_TYPE`/`DATABASE_PATH` 环境变量、SnakeCaseNamingStrategy、雪花 ID、首用户 admin hook、SMTP 未配置自动禁用
2. **应取**：`DATABASE_URL` 智能推断（降低部署心智）、`DATABASE_ENTITY_PREFIX`、`MACHINE_ID`、失败不致命启动、Docker Compose 显式 TZ
3. **不取（M6）**：CustomColumn 全量跨库归一（M6 只有 SQLite + 预留类型映射）、二级存储、路由懒加载中间件、i18n/存储/队列/OpenAPI
4. **落地去向**：适配结论已写入 `docs/standards/platform.md`（平台开发规范），T601 实现按该规范执行

> 处置：本调研结论已落入平台开发规范（`docs/standards/platform.md`），作为 T601-T604 实现依据；momei 具体实现细节保留在本文档备查。
