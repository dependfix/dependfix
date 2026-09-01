# 当前阶段待办

> 本文件**仅**登记当前阶段活跃待办；已闭环项归档于 [todo-archive.md](todo-archive.md)；未排期/延期/远期登记于 [backlog.md](backlog.md)。

## 当前阶段

> 当前阶段：M22 — SQLite 数据保护防御加固（进行中：M22.1 / M22.2 已闭环，M22.3 - M22.6 待推进）
>
> **阶段背景**：2026-09-01 `apps/platform/data/dependfix.sqlite` 启动后业务表数据被清空事故（用户管理账号/仓库/凭据/扫描结果全部丢失）。代码内未找到清空路径（TypeORM synchronize 失败会回滚、e2e fixtures 受门控保护、cleanupStaleRuns 只清理 ScanRun/BatchRun、backfill 只处理 ScanResult），最可能清空来源在代码外部（shell/CI/运维）。事故暴露出 5 条可加固的设计风险，详见 [经验归档 §五十](../design/governance/experience-archive.md#五十sqlite-数据库业务数据被清空开发环境不可恢复事故2026-09-01)。
>
> **本阶段目标**：实施 [development.md §5.1.18](./../standards/development.md) + [§5.1.19](./../standards/development.md) + [platform.md §3.6](./../standards/platform.md) + [§3.7](./../standards/platform.md) + [security.md §2.1](./../standards/security.md) 五条规范挂接的防御加固。

---

### M22.1 SQLite 启动期自动备份（apps/platform/server/database/backup.ts 新增）

- **状态**：✅ 已完成（commit `2a31597`）

- **范围**：`apps/platform/server/database/backup.ts` 新增 + `apps/platform/server/database/index.ts:ensureDatabaseInitialized` 之前同步调用 `backupDatabaseIfNeeded()`
- **实现要点**：
  - 备份路径：`data/backups/${basename}.${YYYY-MM-DDTHH-mm-ss}.bak`（ISO 8601 紧凑型时间戳）
  - 触发条件：源文件存在 + `fs.statSync(path).size > 0` + 后缀不是 `.bak`
  - 写入安全：`fs.openSync` + `fs.writeSync` + `fs.fsyncSync` + `fs.closeSync` + `fs.renameSync`（避免断电留半成品）
  - 保留策略：最近 N 份（默认 10，`BACKUP_RETENTION_COUNT` env 可覆盖），按 mtime 升序清理超出
  - 失败处理：`catch + console.error('[database] backup failed:', error)`，不阻塞启动（fail-open）
  - 启动日志：每次启动打印 `[database] backup created: ${path}` 或 `backup: backup skipped (no file)`
- **测试要求**：
  - `backup.test.ts` 覆盖：备份创建 / 跳过（空文件 / 已存在备份） / fsync 调用 / 保留策略清理 / 失败不抛
  - `e2e` 不必测（启动期调用是集成层，关注 unit 即可）
- **规范挂接**：[development.md §5.1.18](./../standards/development.md) + [security.md §2.1.1](./../standards/security.md) + [platform.md §3.7](./../standards/platform.md)
- **A 阶段 Review Gate**：code-auditor 必须验证 backup.ts 含 fsync + retention 清理逻辑 + fail-open 兜底
- **优先级**：P0（必须最先落地，未来同类事故的最后防线）

### M22.2 db-restore 命令式恢复（apps/platform/server/database/scripts/db-restore.ts 新增）

- **状态**：✅ 已完成
- **范围**：`apps/platform/server/database/scripts/db-restore.ts` 新增 + `package.json` 新增 `"db:restore": "tsx server/database/scripts/db-restore.ts"`
- **落地偏差**：脚本目录由原计划 `apps/platform/scripts/` 改为 `apps/platform/server/database/scripts/`，与既有 `backfill-scan-result.ts` 同目录复用同一份 README 与 `tsx` 运行约定（避免同类数据库运维脚本分散在两处）
- **实现要点**：
  - CLI 入口守卫必备（[development.md §5.1.5](./../standards/development.md)）：`process.argv[1] === pathToFileURL(process.argv[1]).href` 才执行 `main()`
  - 参数：`--from=<backup-file>` 必填 + `--yes` 必填（双门控，避免误操作覆盖）
  - 覆盖前自动备份：先把当前数据库备份到 `data/backups/auto.${timestamp}-${ms}.bak`（落地追加毫秒防同秒碰撞；`auto.` 前缀让这批文件纳入 `cleanupOldBackups` 保留策略，与启动期备份 `${basename}.` 前缀命名空间隔离）
  - 恢复：`fs.copyFileSync(from, to)`（原子操作，无需 fsync）
  - 校验：恢复前对备份文件 + 恢复后对目标库各跑一次 `integrity_check`，并打印新 schema_version
  - 落地追加：恢复后清理属于旧数据库的 `-wal` / `-shm` / `-journal` 旁文件（陈旧日志会被当作新库的崩溃恢复数据回放）
- **测试要求**：
  - 集成测试：创建测试数据库 → 写入数据 → 备份 → 删数据 → 恢复 → 验证数据回来
  - 二次确认测试：`--from` 缺 / `--yes` 缺 → 报错并退出（落地实现用 `--yes` 非交互式 flag 双门控，未采用交互式 `yes/no` 输入：运维脚本需可在无 TTY 的容器 / CI 中执行）
- **规范挂接**：[security.md §2.1.2](./../standards/security.md)
- **优先级**：P0（与 M22.1 同步落地）

### M22.3 db-doctor 自检工具（apps/platform/scripts/db-doctor.ts 新增）

- **范围**：`apps/platform/scripts/db-doctor.ts` 新增 + `package.json` 新增 `"db:doctor": "tsx scripts/db-doctor.ts"`
- **实现要点**：
  - CLI 入口守卫必备（[development.md §5.1.5](./../standards/development.md)）
  - 输出（人读 + 机读双模，参考 [development.md §5.1.2](./../standards/development.md)）：
    - 文件元信息：path / size / mtime / atime / birth time
    - PRAGMA 全套：page_count / page_size / freelist_count / journal_mode / auto_vacuum / user_version / schema_version / application_id / wal_autocheckpoint / integrity_check
    - 各表行数：扫描 sqlite_master type='table'，对每个 table 跑 `SELECT COUNT(*)`（依赖 dependfix.sqlite / e2e.sqlite，非 connection DB 可走 readonly mode）
    - 索引统计：sqlite_autoindex / IDX_ / idx_ 各分类计数
  - 末尾判定（人读段给出 1 行结论）：
    - `schema_version = 0` + 全表空 → 全新数据库
    - `schema_version > 0` + 全表空 → 数据曾被清空或从未注入
    - `freelist_count > 0` → 有数据被删除但未 VACUUM
    - `integrity_check != 'ok'` → 数据库损坏
- **测试要求**：
  - snapshot 测试：mock 各种 PRAGMA 状态，验证输出格式
  - 集成测试：创建数据库 → 跑 db-doctor → 验证输出含预期信息
- **规范挂接**：[security.md §2.1.3](./../standards/security.md) + [platform.md §3.7](./../standards/platform.md)
- **优先级**：P1（M22.1 / M22.2 落地后启动，节省未来事故定位时间）

### M22.4 synchronize 显式 opt-in + 启动日志（apps/platform/server/database/index.ts:42 修改）

- **范围**：`apps/platform/server/database/index.ts:42` 修改 `synchronize` 默认值
- **当前代码**：
  ```ts
  const isDev = process.env.NODE_ENV !== 'production'
  const synchronize = process.env.DATABASE_SYNCHRONIZE === 'true' || isDev
  ```
- **修改后**：
  ```ts
  const synchronize = process.env.DATABASE_SYNCHRONIZE === 'true'
  // 不再有 || isDev 自动开启
  ```
- **启动日志**：`createDataSourceOptions()` 函数末尾新增：
  ```ts
  console.log(`[database] synchronize=${synchronize} (DATABASE_SYNCHRONIZE=${process.env.DATABASE_SYNCHRONIZE ?? 'unset'}), migrationsRun=${migrationsRun} (DATABASE_MIGRATIONS_RUN=${process.env.DATABASE_MIGRATIONS_RUN ?? 'unset'})`)
  ```
- **dev 模式文档更新**：`apps/platform/.env.example` 新增 `DATABASE_SYNCHRONIZE=true` 注释（dev 模式默认关闭，需手动开启）
- **测试要求**：
  - `index.test.ts` 新增用例：dev 模式（`NODE_ENV=development`）+ 默认同步关闭 → `synchronize === false`
  - `index.test.ts` 新增用例：显式 `DATABASE_SYNCHRONIZE=true` → `synchronize === true`
- **规范挂接**：[development.md §5.1.19](./../standards/development.md) + [platform.md §3.3](./../standards/platform.md)
- **优先级**：P1（与 M22.1 / M22.2 同步落地）

### M22.5 migrationsRun 默认改为 false（apps/platform/server/database/index.ts:60 修改）

- **范围**：`apps/platform/server/database/index.ts:60` 修改 `migrationsRun` 默认值
- **当前代码**：
  ```ts
  migrationsRun: process.env.DATABASE_MIGRATIONS_RUN !== 'false', // 默认 true
  ```
- **修改后**：
  ```ts
  migrationsRun: process.env.DATABASE_MIGRATIONS_RUN === 'true', // 默认 false；显式开启
  ```
- **与 M22.4 协同**：`synchronize + migrationsRun` 同开的反模式禁止（M22.4 synchronize 默认 false 后，此项防御仍需保留）
- **测试要求**：
  - `index.test.ts` 新增用例：默认 migrationsRun=false
  - `index.test.ts` 新增用例：显式 `DATABASE_MIGRATIONS_RUN=true` → migrationsRun=true
- **规范挂接**：[development.md §5.1.19](./../standards/development.md) + [platform.md §3.3](./../standards/platform.md)
- **优先级**：P1（与 M22.4 同步落地）

### M22.6 e2e/fixtures 端点双门控（apps/platform/server/api/e2e/fixtures.post.ts + fixtures.delete.ts 修改）

- **范围**：
  - `apps/platform/server/api/e2e/fixtures.post.ts:96-98` 修改门控
  - `apps/platform/server/api/e2e/fixtures.delete.ts:39-41` 修改门控
- **当前代码**（两文件相同模式）：
  ```ts
  if (process.env.E2E_TEST !== 'true') {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  ```
- **修改后**：
  ```ts
  if (process.env.E2E_TEST !== 'true' || process.env.NODE_ENV === 'production') {
      throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  ```
- **测试要求**：
  - `fixtures.post.test.ts` / `fixtures.delete.test.ts` 新增用例：`E2E_TEST=true` + `NODE_ENV=production` → 404
  - `fixtures.post.test.ts` / `fixtures.delete.test.ts` 新增用例：`E2E_TEST=true` + `NODE_ENV=development` → 200
- **规范挂接**：[platform.md §3.6](./../standards/platform.md) + [security.md §2.1.4](./../standards/security.md)
- **优先级**：P1（与 M22.4 / M22.5 同步落地）

---

## M22 准入 / 验证标准

- **D 阶段自检**：6 项任务全部完成后，Full Stack Master (全栈大师) agent 验证 backup.ts / db-restore.ts / db-doctor.ts 存在 + 含核心实现（fsync / retention / `--yes` 门控 / 报告格式）
- **A 阶段 Review Gate**：code-auditor 必查项新增 5 项（backup fsync + retention / db-restore `--yes` 门控 / db-doctor schema_version 输出 / synchronize 默认 false / e2e 双门控）
- **测试**：`pnpm test` 全过 + `pnpm test:e2e` 全过 + `pnpm lint` 0 error + `pnpm typecheck` 0 error + `pnpm check:docs` 0 error
- **commit 粒度**：每个原子条目独立 commit（建议顺序 M22.1 → M22.2 → M22.4 → M22.5 → M22.6 → M22.3，M22.3 是工具可最后落地）

## M22 风险与缓解

- **R1：M22.1 启动期备份阻塞启动超过 5 秒** → 缓解：benchmark 测试 + 异步备份选项（不阻塞 Nitro 启动事件循环）
- **R2：M22.4 / M22.5 修改默认值后本地 dev 体验退步** → 缓解：`.env.example` 增加注释说明 + README "本地开发" 章节更新
- **R3：M22.6 双门控误伤 e2e 测试** → 缓解：playwright.config.ts 已是 `NODE_ENV=production` 启动 e2e webServer，需要在 e2e 启动时显式 unset `NODE_ENV=production` 或新增 `E2E_NITRO_DEV=true` 标志

## M22 后续（非本阶段）

- M23：考虑升级到 PostgreSQL（多写者安全 + docker-compose 多容器扩展）
- M24：考虑迁移到 TypeORM 0.3.x（1.x 已停止维护）
- 详细登记见 [backlog.md](./backlog.md)

---

## 文档位置速查

| 内容类型 | 位置 |
|:--|:--|
| 已完成阶段归档 | [todo-archive.md](todo-archive.md) |
| 未排期 / 延期 / 远期 / 长期主线 / 已知边界 | [backlog.md](backlog.md) |
| 里程碑与阶段交付 | [roadmap.md](roadmap.md) |