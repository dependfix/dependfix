# Server Database Scripts

一次性数据迁移 + 运维脚本。所有脚本通过 `tsx` 直接运行 TypeScript 源码，无需先 build。

## backfill-scan-result（M20.7 一次性脚本）

### 背景

旧 schema 的 ScanResult 是"每次扫描 × 每个告警"存一行（91 行 vs 13 个独立告警），无 reconcile 逻辑，
上游已关闭的告警永远残留。M20.3 升级为 per-alert 模型（每行 = 一个独立告警），M20.5 API 加 `supersededAt IS NULL`
默认过滤，M20.6 前端"显示已解决"开关。

本脚本把现有 N×run 重复行迁移到新模型：

- **决策 1**：fixStatus='success' 永不被 supersede（保留修复记录）
- **决策 2**：聚合时若有 success 行保留该行；否则保留最早 createdAt 行；其他 DELETE
- **决策 3**：upstreamId 必须规范化。本脚本合成的 upstreamId 使用 `${source}:backfill-${rowId}` 命名空间隔离
  （避免与 todo.md §M20.1 `normalizeUpstreamId()` 输出冲突，未来 reconcile 用真 ID 创建新行不会命中）
- **决策 4**：fixStatus='success' 行不受 supersededAt 影响

### 用法

```bash
# 1. 预览迁移计划（默认模式，不写库）
pnpm db:backfill:dry-run

# 2. 实跑迁移（必须 --apply + y/N 二次确认）
pnpm db:backfill
# 脚本会先打印 dry-run 计划 + 询问 "确认实跑？(yes/no):"
```

### 数据库连接

沿用 `createDataSourceOptions` 逻辑，通过环境变量配置：

- `DATABASE_PATH`：SQLite 数据库路径（默认 `data/dependfix.sqlite`）
- `DATABASE_TYPE`：mysql / postgres / sqlite（默认 sqlite）
- `DATABASE_URL`：MySQL/PostgreSQL 连接串

### 安全门

1. **默认 dry-run 模式**：未传 `--apply` 时只打印计划
2. **y/N 二次确认**：apply 模式必须交互式确认
3. **整批事务化**：所有 DELETE / UPDATE 包在一个事务里，失败回滚保证"全成功或全失败"

### 幂等性

重复执行结果一致：

- 第二次执行时 `toDelete` 长度 0（行已删）
- 第二次执行时 `toSupersede` 长度 0（行已 superseded，filter IsNull（） 排除）
- 第二次执行时 `preservedSuccess` 计数仍正确（success 行永远保留）

### 回滚

本脚本**不**实现自动回滚。建议：

1. 迁移前备份数据库（`cp data/dependfix.sqlite data/dependfix.sqlite.bak`）
2. 迁移后发现问题：`cp data/dependfix.sqlite.bak data/dependfix.sqlite`
3. 严重场景：revert git commit + 重新跑 migrations

### 输出示例

```plain
[DRY-RUN] backfill 统计
  仓库数:           3
  处理前行数:       91
  处理后行数:       13  (减少 78 行)
  删除重复行:       78
  保留修复记录:     5  (fixStatus='success' 永不被 supersede)
  标记已关闭:       8
```
## backfill-run-failure（运行失败分类回填）

### 背景

运行列表支持按失败阶段筛选后，`ScanRun` 新增 `failure_code` / `failure_stage` / `failure_kind` 三列
（见 [platform.md §6.2](../../../../../docs/standards/platform.md)）。新增列对存量行为 NULL，
本脚本按落库的 `errorJson` 尽力归一：`failed` / `dispatched` 行写阶段与处置建议，无法判定一律写
`unknown`（不猜测）；`completed` / `running` / `pending` / `degraded` 行若残留分类则清空。

### 用法

```bash
# 1. 预览订正计划（默认模式，不写库）
pnpm db:backfill:run-failure:dry-run

# 2. 实跑（必须 --apply + y/N 二次确认）
pnpm db:backfill:run-failure
```

### 安全门

1. **默认 dry-run**：未传 `--apply` 时只打印计划（含阶段分布与逐行明细前 50 条）。
2. **y/N 二次确认**：apply 模式必须交互式确认。
3. **整批事务化**：所有 UPDATE 包在一个事务里，失败回滚。
4. **幂等**：仅写与当前列值不同的行，二次运行 0 变更。

### 边界

引擎 `result.errors` 未落库，无法直接按类别细分；细分依赖 `engine_delivery_failed` 的 message 中
回读的 `（CATEGORY）`，其余一律 `unknown`。

## db-restore（运维脚本）

### 背景

启动期自动备份（`server/database/backup.ts`）会在每次应用启动前把当前 SQLite 数据库快照到
`data/backups/`，但备份只有在能被恢复时才有意义。本脚本提供命令式恢复入口，是数据误删 /
误覆盖场景下的唯一回滚手段（背景见 [经验归档 §五十](../../../../../docs/design/governance/experience-archive.md)）。

### 用法

```bash
# 从指定备份恢复（--from 与 --yes 均为必填）
pnpm db:restore --from=data/backups/dependfix.sqlite.2026-09-01T12-00-00.bak --yes

# 恢复到非默认路径
pnpm db:restore --from=<backup> --to=data/other.sqlite --yes

# 查看帮助
pnpm db:restore --help
```

参数：

- `--from=<path>`：必填。备份文件路径。
- `--yes`：必填。显式确认覆盖当前数据库。
- `--to=<path>`：可选。恢复目标，默认取 `DATABASE_PATH` 环境变量，回退 `data/dependfix.sqlite`。

### 安全门

1. **双门控**：`--from` 与 `--yes` 缺任一个即拒绝执行，不猜测"最新备份"。
2. **源备份预校验**：恢复前对备份文件跑 `PRAGMA integrity_check`，文件缺失 / 为空 / 非 SQLite /
   校验未通过时直接拒绝，当前数据库不被触碰。
3. **覆盖前自动备份**：当前数据库先原子备份到 `data/backups/auto.<timestamp>-<ms>.bak`（复用
   `backup.ts` 的 `writeFileAtomicSync`），这份文件是"撤销恢复"的唯一凭据。文件名带毫秒，
   同一秒内二次恢复不会互相覆盖；这批文件同样受保留策略约束（默认最近 5 份，
   `BACKUP_RETENTION_COUNT` 环境变量可覆盖）。
4. **旁文件清理**：恢复后删除属于旧数据库的 `-wal` / `-shm` / `-journal` 文件，避免陈旧 WAL 或
   回滚日志被当作新库的崩溃恢复数据回放。
5. **恢复后自检**：再跑一次 `integrity_check` + 打印 `schema_version`，未通过则报错。

与启动期备份的 fail-open 策略相反，本脚本 fail-closed：任何一步失败都退出码 1，绝不留下
"半恢复"的数据库。

### 输出示例

```text
[RESTORE] 数据库恢复完成
  来源备份:       data/backups/dependfix.sqlite.2026-09-01T12-00-00.bak
  恢复目标:       data/dependfix.sqlite
  覆盖前备份:     data/backups/auto.2026-09-01T13-20-05-417.bak
  清理旁文件:     data/dependfix.sqlite-wal, data/dependfix.sqlite-shm
  integrity_check: ok
  schema_version:  42
```

## db-doctor（运维脚本）

### 背景

2026-09-01 数据清空事故排查时最耗时的一步是"判断数据是被清空、还是从未注入、还是 schema 升级中"，
当时靠手敲一串 PRAGMA 与 `COUNT(*)` 拼线索。本脚本把那次排查动作固化成一条命令
（背景见 [经验归档 §五十](../../../../../docs/design/governance/experience-archive.md)）。

脚本**只读**打开数据库（`readonly: true` + `fileMustExist: true`），不写入、不创建 WAL，
不会改变事故现场。

### 用法

```bash
# 自检默认数据库（DATABASE_PATH 环境变量，回退 data/dependfix.sqlite）
pnpm db:doctor

# 强制 JSON 输出（机读；非 TTY 环境自动启用，便于管道与 CI 断言）
pnpm db:doctor --json

# 自检指定文件（如 e2e 库或某个备份）
pnpm db:doctor --path=data/backups/dependfix.sqlite.2026-09-01T12-00-00.bak
```

### 输出内容

- **文件元信息**：path / size / mtime / atime / birth time
- **PRAGMA 全套**：`page_count`、`page_size`、`freelist_count`、`journal_mode`、`auto_vacuum`、
  `user_version`、`schema_version`、`application_id`、`wal_autocheckpoint`、`integrity_check`
- **各表行数**：扫描 `sqlite_master` 全部 table，逐表 `COUNT(*)`，非业务表（`sqlite_*` 与 `migrations`）单独标记
- **索引分类计数**：`sqlite_autoindex_*`（UNIQUE 隐式）/ `IDX_*`（TypeORM）/ `idx_*`（手工声明）/ 其他

### 结论判定

报告末尾直接给出结论，不需要读者自己解释数字：

| 条件 | 结论 |
| --- | --- |
| `integrity_check != 'ok'` | 数据库损坏（应立即 `pnpm db:restore` 恢复） |
| 无业务表 | schema 从未建立 |
| `schema_version = 0` + 业务表全空 | 全新数据库（首次启动的正常状态） |
| `schema_version > 0` + 业务表全空 | 数据被清空或从未注入 |
| 业务表有行 | 数据正常 |
| `freelist_count > 0` | 有数据被删除但未回收（`VACUUM` 可回收） |

"业务表全空"只统计业务表，排除 `sqlite_*` 内部表与 TypeORM `migrations` 记录表 —— 这些表在业务
数据被清空后依然有行，计入会把"数据被清空"误判成"数据正常"（事故现场实测踩到）。

### 输出示例

```text
[DOCTOR] SQLite 数据库自检

文件
  路径:           data/dependfix.sqlite
  大小:           176128 bytes
  最后修改:       2026-09-01T13:20:05.417Z
  ...

PRAGMA
  freelist_count      0
  schema_version      42
  integrity_check     ok
  ...

结论
  - 数据正常：13 张业务表共 87 行
```

## db-migrate（运维脚本）

### 背景

`synchronize` 与 `migrationsRun` 自 M22.4 / M22.5 起均为显式 opt-in，但仓库此前没有可用的
"手动执行迁移"入口——`.env.example` 记录的命令缺少 `-d <data-source>`，实测直接报
`Missing required argument: dataSource`。结果是 pending migration 无人执行、schema 漂移静默累积，
直到运行时查询报 `no such column`（2026-09-30 实测 `ScanRun__ScanRun_repository.verify_commands`）。
本脚本补齐入口，并复用 `createDataSourceOptions`（与运行时同一套连接 / 前缀 / 迁移注册）。

### 用法

```bash
# 1. 只读查看迁移状态（executed / pending，不写库）
pnpm db:migrate:show

# 2. 执行全部 pending migration
pnpm db:migrate

# 3. 回退最近一次已执行迁移（--yes 为必填双门控）
pnpm db:migrate:revert -- --yes
```

> 全新空库可直接用 `pnpm db:init`（一键初始化，见下节）或 `pnpm db:migrate`：迁移链首条
> `CreateInitialSchema1600000000000` 会从实体元数据创建全部基础表 / 索引 / 外键，其后增量迁移
> 因列已存在而 no-op。存量库仅补 pending，基线与守卫保证幂等、不破坏既有数据。

### 数据库连接

沿用 `createDataSourceOptions` 逻辑，通过 `DATABASE_*` 环境变量配置（`DATABASE_TYPE` /
`DATABASE_PATH` / `DATABASE_URL` / `DATABASE_ENTITY_PREFIX`）。

### 安全门

1. **显式动作**：不传动作即拒绝执行（exit 1），不猜"用户想 apply"
2. **动作互斥**：`--show` / `--apply` / `--revert` 同时出现即拒绝执行
3. **revert 双门控**：`--revert` 必须配 `--yes`，与 `db-restore` 同口径
4. **环境无关的确定性**：DataSource 强制 `synchronize: false` + `migrationsRun: false` —— 只锁后者不够：
   `DATABASE_SYNCHRONIZE=true` 时 `initialize()` 会先同步 schema，令 `--show` 实际写库
5. **只读保守**：`--show` 不创建迁移表；SQLite 库文件缺失时只报告状态，不创建空库文件

回退前建议先 `pnpm db:doctor` 自检；需要整库回滚时用 `pnpm db:restore`。

### 输出示例

```text
[MIGRATE] 迁移状态
  [X] 已执行  CreateInitialSchema1600000000000
  [X] 已执行  CreateAuditEventTable1700000000000
  [X] 已执行  AddScanResultIdentifiers1750000000000
  ...
  [ ] 待执行  AddRepositoryVerifyCommands2100000000000

  合计 9 条，待执行 1 条
```

## db-init（一键初始化）

### 背景

全新部署（尤其 Docker 首次启动）需要一个「一条命令建库」入口：空库既要执行 pending migration，
又要能确认业务表确实建好。`db-init` 复用 `db-migrate` 的连接配置与执行逻辑，额外打印初始化摘要，
适合部署脚本调用；可安全重复执行（幂等）。

### 用法

```bash
# 源码环境（apps/platform 下）：执行 pending migration 并打印摘要
pnpm db:init

# 帮助
pnpm db:init --help
```

Docker 场景：

- 常规启动时 compose 默认 `DATABASE_MIGRATIONS_RUN=true` 自动迁移，通常无需手动初始化；
- 需要显式初始化（如关闭了自动迁移）时用宿主脚本 `apps/platform/docker/init-db.sh`，
  以一次性容器执行迁移后退出（成功 0 / 失败 1）；
- 运行期镜像为 `.output`-only，**不含 `tsx` 与运维脚本**，因此容器内不能直接跑 `pnpm db:init`。
  源码环境用 `pnpm db:init`；容器场景用 `docker/init-db.sh`。

### 数据库连接

沿用 `createMigrateDataSource`：通过 `DATABASE_*` 环境变量配置（`DATABASE_TYPE` / `DATABASE_PATH` /
`DATABASE_URL` / `DATABASE_ENTITY_PREFIX`），强制 `synchronize=false` + `migrationsRun=false`，
不受 `DATABASE_MIGRATIONS_RUN` / `DATABASE_SYNCHRONIZE` 开关影响。

### 输出示例

```text
[INIT] 数据库初始化完成
  本次执行迁移: 9 条
    [X] CreateInitialSchema1600000000000
    [X] CreateAuditEventTable1700000000000
    ...
  业务表: 13 张
```


