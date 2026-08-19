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
| `DATABASE_SYNCHRONIZE` | `false` | 生产环境显式开启才同步 schema |
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
- `synchronize`：开发/测试自动同步；生产仅 `DATABASE_SYNCHRONIZE=true` 时开启
- 初始化失败不抛致命错误：日志告警 + 功能降级（对齐 momei `reportDatabaseInitializationFailure` 语义）
- 幂等单例 + 并发初始化锁（`ensureDatabaseInitialized`）

### 3.4 实体规范

- 继承 `BaseEntity`（雪花 ID + `getDateType()` 时间戳）
- 属性名 camelCase（与 better-auth schema 一致），列名由 `SnakeCaseNamingStrategy` 转 snake_case
- better-auth 四表（`user` / `session` / `account` / `verification`）字段对齐 better-auth 默认 schema，**不得增删字段**；平台自有字段（如 `role`）通过 better-auth `user.additionalFields` 配置并同步实体
- 跨库类型归一：SQLite 下 `bigint` → `integer`；PG 下 `bigint` → `integer`、长文本 → `text`（M6 以 SQLite 为默认目标，但实体写法必须保持三后端可编译）

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

- 平台级密钥：环境变量 `ENCRYPTION_KEY`（AES-256-GCM 密钥，32 字节 base64 或 hex）；未配置时**禁用凭据功能并明确报错**（不静默降级为明文）
- Credential 实体：`type`（classic-pat / fine-grained-pat / github-app）、`encryptedToken`、`name`、`repoId` 关联
- 加解密工具（`server/utils/credential-crypto.ts`）：AES-256-GCM + 随机 IV，密文格式 `iv:tag:ciphertext`（base64）；解密仅在执行时 worker 内存中，用完即弃
- **禁止**：token 明文落库、token 进日志、token 进前端响应（API 返回 `hasToken` 布尔即可）
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
- **`<Chart>` 引入体积警告**：PrimeVue `<Chart>` 内部 `import('chart.js/auto')` 引入 ~200KB 全量依赖，与 tree-shakable 原则冲突。引入 PrimeVue wrapper 组件前先 grep 内部是否引入了全量依赖；如确实需要 Chart.js，**自实现 `ChartCanvas.vue` 包装**（仅注册用到的 controllers/elements/scales/plugins 子集，如 `LinearScale` + `CategoryScale` + `BarController` + `BarElement` + `DoughnutController` + `ArcElement` + `Tooltip` + `Legend`），实测 bundle < 50KB gzip（vs PrimeVue wrapper 200KB，节省 75%）。`<ClientOnly>` 包裹避免 SSR `window is not defined` 报错。

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
| `DATABASE_SYNCHRONIZE` | 否 | `false` | 生产环境显式开启才同步 schema |
| `ENCRYPTION_KEY` | 凭据功能必需 | 空 | AES-256-GCM 平台密钥 |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | 否 | 空 | 配置后启用邮件验证 |
| `NUXT_PUBLIC_BETTER_AUTH_URL` | 反向代理时 | 自动推断 | 认证基础 URL |
| `MACHINE_ID` | 否 | `pid % 1024` | 雪花机器位 |

## 11. 决策记录（2026-08-07 人工审查确认）

1. **多后端时机**：M6 默认 SQLite 交付，`getDateType()` + driver 注入 + `DATABASE_URL` 推断一次性做对（避免 T601 后返工）；MySQL/PG 真实部署验证延后到 M7 —— ✅ 确认
2. **表前缀**：默认 `dependfix_`（`DATABASE_ENTITY_PREFIX` 可配）—— ✅ 确认（需要前缀）
3. **synchronize 策略**：M6 开发/测试自动同步 + 生产显式开启（`DATABASE_SYNCHRONIZE=true`）；正式迁移链排期 M7 —— ✅ 确认
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
