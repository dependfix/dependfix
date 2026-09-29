#!/usr/bin/env tsx
/**
 * db-migrate：数据库迁移命令式入口（show / apply / revert）。
 *
 * 背景（任务登记见 docs/plan/todo.md §M33.7）：`synchronize` 与 `migrationsRun` 自 2026-09-01 起
 * 均为显式 opt-in（口径见 docs/standards/development.md §5.1.19），但仓库此前没有可用的"手动执行迁移"入口——`.env.example` 记录的
 * `pnpm --filter @dependfix/platform exec typeorm migration:run` 缺少 `-d <data-source>`，
 * 实测直接报 `Missing required argument: dataSource`。结果是 pending migration 无人执行、
 * schema 漂移静默累积，直到运行时查询报 `no such column`（2026-09-30 实测
 * `ScanRun__ScanRun_repository.verify_commands`）。
 *
 * 本脚本补齐入口，并复用 `createDataSourceOptions`（与运行时同一套连接 / 前缀 / 迁移注册），
 * 不引入 typeorm CLI 与 ts-node（项目既有 `db:doctor` / `db:restore` / `db:backfill` 同为 tsx 脚本形态）。
 *
 * 用法：
 *   pnpm db:migrate:show                  # 列出全部已注册迁移及 executed / pending 状态（只读）
 *   pnpm db:migrate                       # 执行全部 pending migration
 *   pnpm db:migrate:revert -- --yes       # 回退最近一次已执行迁移（--yes 为双门控）
 *
 * 设计要点：
 * - **显式动作**：不传动作即拒绝执行（不猜"用户想 apply"），避免误写库
 * - **revert 双门控**：`--revert` 必须配 `--yes`，与 db-restore 同口径
 * - **不受 env 影响的确定性**：默认 DataSource **同时强制** `synchronize: false` 与
 *   `migrationsRun: false` —— 只覆盖后者不够：`DATABASE_SYNCHRONIZE=true` 时
 *   `DataSource.initialize()` 会先同步 schema，令 `--show`（声明只读）实际写库。
 * - **只读优先**：`--show` 不写库；迁移表不存在时视为"全部待执行"，不创建表；
 *   SQLite 文件不存在时只报告状态并退出（不创建空库文件）
 *
 * 迁移脚本只按 `dataSource.migrations` 注册顺序（由 TypeORM 按名字末 13 位时间戳排序）执行，
 * 与 `server/database/index.ts` 的 migrations 数组保持一致。
 *
 * 测试覆盖：apps/platform/server/database/scripts/db-migrate.test.ts
 */
import 'reflect-metadata'
import { existsSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DataSource } from 'typeorm'
import { createDataSourceOptions } from '../index'

/** CLI 动作（三者互斥） */
export type MigrateAction = 'show' | 'apply' | 'revert'

/** CLI 参数解析结果 */
export interface MigrateArgs {
    /** 目标动作；未指定时为 undefined（调用方报错） */
    action?: MigrateAction
    /** 是否显式确认（`--revert` 必填） */
    yes: boolean
    /** `--help` / `-h` */
    help: boolean
    /** 是否同时指定了多个动作（互斥，调用方报错） */
    conflict: boolean
}

/** 单条迁移的状态 */
export interface MigrationStatus {
    /** 迁移名（TypeORM 取 `name`，回退类名） */
    name: string
    /** 是否已执行（记录存在 migrations 表中） */
    executed: boolean
}

/** 依赖注入点（测试用；生产走默认实现） */
export interface MigrateDeps {
    /**
     * DataSource 工厂。默认实现为 `createMigrateDataSource` —— 复用连接配置并强制双 false，
     * 使 CLI 行为不受 `DATABASE_MIGRATIONS_RUN` / `DATABASE_SYNCHRONIZE` 影响（详见文件头"设计要点"）。
     */
    createDataSource?: () => DataSource
}

/**
 * CLI 专用 DataSource 工厂：复用 `createDataSourceOptions()` 的连接配置（单点声明），
 * 但**强制** `synchronize: false` + `migrationsRun: false`。
 *
 * 只覆盖 `migrationsRun` 是不够的：`DATABASE_SYNCHRONIZE=true` 时 TypeORM 的
 * `DataSource.initialize()` 会先执行 schema 同步，`--show`（对外声明只读）会真的写库。
 * 额外的 effective 日志用于消解 `createDataSourceOptions()` 按 env 打印的开关值与实际生效值错位。
 */
export const createMigrateDataSource = (): DataSource => {
    const dataSource = new DataSource({
        ...createDataSourceOptions(),
        synchronize: false,
        migrationsRun: false,
    })
    console.log('[migrate] effective: synchronize=false, migrationsRun=false（CLI 强制，忽略 DATABASE_* 开关）')
    return dataSource
}

/**
 * 解析 CLI 参数（纯函数，便于单测）。
 *
 * 只接受布尔 flag 形式（`--show` / `--apply` / `--revert` / `--yes`），不支持位置参数与
 * `--key=value`，避免"无值 flag 被当成 action"的歧义。
 */
export const parseMigrateArgs = (argv: string[]): MigrateArgs => {
    const actions: MigrateAction[] = []
    let yes = false
    let help = false
    for (const arg of argv) {
        if (arg === '--show' || arg === '--apply' || arg === '--revert') {
            actions.push(arg.slice(2) as MigrateAction)
        } else if (arg === '--yes') {
            yes = true
        } else if (arg === '--help' || arg === '-h') {
            help = true
        }
    }
    return {
        action: actions[actions.length - 1],
        yes,
        help,
        conflict: new Set(actions).size > 1,
    }
}

/** 合法 SQL 标识符（迁移表名会被拼进 SQL，禁引号 / 空白 / 注释符） */
const SQL_IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * 迁移记录表名（与 TypeORM 默认一致；`entityPrefix` 不作用于该表）。
 *
 * 该值会被拼进 `SELECT`（SQLite 不支持表名参数化）。当前 `createDataSourceOptions` 不暴露
 * `migrationsTableName`，取值恒为默认 `migrations`，**无注入面**；此处仍做标识符白名单校验，
 * 作为未来开放该配置时的纵深防御（跨后端安全，不依赖各后端不同的标识符引号规则）。
 */
export const migrationsTableName = (ds: DataSource): string => {
    const table = ds.options.migrationsTableName ?? 'migrations'
    if (!SQL_IDENTIFIER_PATTERN.test(table)) {
        throw new Error(`migrationsTableName 不是合法 SQL 标识符，拒绝拼进 SQL：${table}`)
    }
    return table
}

/** 读取已执行迁移名集合（迁移表不存在时返回空集，不创建表） */
export const readExecutedMigrationNames = async (ds: DataSource): Promise<Set<string>> => {
    const table = migrationsTableName(ds)
    const runner = ds.createQueryRunner()
    try {
        if (!(await runner.hasTable(table))) {
            return new Set()
        }
    } finally {
        await runner.release()
    }
    const rows = await ds.query(`SELECT name FROM ${table}`) as { name: string }[]
    return new Set(rows.map((row) => row.name))
}

/** 采集全部已注册迁移的执行状态（只读） */
export const collectMigrationStatus = async (ds: DataSource): Promise<MigrationStatus[]> => {
    const executed = await readExecutedMigrationNames(ds)
    return ds.migrations.map((migration) => {
        const name = migration.name ?? migration.constructor.name
        return { name, executed: executed.has(name) }
    })
}

/** 执行全部 pending migration，返回本次实际执行的迁移名 */
export const applyPendingMigrations = async (ds: DataSource): Promise<string[]> => {
    const applied = await ds.runMigrations()
    return applied.map((migration) => migration.name ?? migration.constructor.name)
}

/**
 * 回退最近一次已执行迁移，返回被回退的迁移名（无迁移记录时返回 null）。
 * 回退名通过"执行前后集合差"推导（TypeORM 的 `undoLastMigration` 不返回被回退的迁移）。
 */
export const revertLastMigration = async (ds: DataSource): Promise<string | null> => {
    const before = await collectMigrationStatus(ds)
    if (!before.some((status) => status.executed)) {
        return null
    }
    await ds.undoLastMigration()
    const after = await readExecutedMigrationNames(ds)
    return before.find((status) => status.executed && !after.has(status.name))?.name ?? null
}

/** 格式化迁移状态（只读输出） */
export const formatMigrationStatus = (rows: MigrationStatus[]): string => {
    const pending = rows.filter((row) => !row.executed)
    const lines = ['[MIGRATE] 迁移状态']
    if (rows.length === 0) {
        lines.push('  (未注册任何迁移)')
    }
    for (const row of rows) {
        lines.push(`  ${row.executed ? '[X] 已执行' : '[ ] 待执行'}  ${row.name}`)
    }
    lines.push('', `  合计 ${rows.length} 条，待执行 ${pending.length} 条`, '')
    return lines.join('\n')
}

/**
 * SQLite 目标库文件不存在时返回其路径（供 `--show` 保持"只读、不创建文件"语义）；
 * 非 SQLite（连接即建立）/ 内存库 / 文件已存在时返回 undefined。
 * 背景：better-sqlite3 在 `initialize()` 时会创建缺失的库文件，`--show` 不该因此写盘。
 */
export const missingSqliteDatabasePath = (ds: DataSource): string | undefined => {
    const options = ds.options
    if (options.type !== 'better-sqlite3') {
        return undefined
    }
    const database = options.database
    if (!database || database === ':memory:' || existsSync(database)) {
        return undefined
    }
    return database
}

/** 格式化 apply 结果 */
export const formatApplyResult = (applied: string[]): string => {
    const lines = [`[MIGRATE] 迁移执行完成，本次执行 ${applied.length} 条`]
    for (const name of applied) {
        lines.push(`  [X] ${name}`)
    }
    if (applied.length === 0) {
        lines.push('  (无待执行迁移，schema 已是最新)')
    }
    lines.push('')
    return lines.join('\n')
}

/** CLI 帮助文本 */
export const MIGRATE_HELP_TEXT = `
db-migrate：数据库迁移命令式入口（show / apply / revert）

用法：
  pnpm db:migrate:show                 列出全部已注册迁移及 executed / pending 状态（只读，不写库）
  pnpm db:migrate                      执行全部 pending migration
  pnpm db:migrate:revert -- --yes      回退最近一次已执行迁移（--yes 必填）

参数：
  --show          只读查看迁移状态
  --apply         执行全部 pending migration
  --revert        回退最近一次已执行迁移
  --yes           显式确认（--revert 必填，防止误回退）
  --help, -h      显示帮助

数据库连接：
  沿用 createDataSourceOptions 逻辑，通过 DATABASE_* 环境变量配置
  （DATABASE_TYPE / DATABASE_PATH / DATABASE_URL / DATABASE_ENTITY_PREFIX）。

安全说明：
  - 不传动作即拒绝执行，不猜测意图
  - --revert 需显式 --yes；回退前建议先跑 pnpm db:doctor 自检，或用 pnpm db:restore 回滚
  - --show 只读：不创建迁移表；SQLite 库文件缺失时只报告状态，不创建空库文件
  - 本脚本强制 synchronize=false + migrationsRun=false，不受 DATABASE_MIGRATIONS_RUN /
    DATABASE_SYNCHRONIZE 影响
`.trim()

/**
 * CLI main（导出便于单测，不在导入时执行）。
 *
 * @param argv `process.argv.slice(2)`
 * @param deps 依赖注入点（测试用）
 * @returns 进程退出码（0 成功 / 1 参数或迁移失败）
 */
export const main = async (
    argv: string[],
    deps: MigrateDeps = {},
): Promise<number> => {
    const args = parseMigrateArgs(argv)

    if (args.help) {
        console.log(MIGRATE_HELP_TEXT)
        return 0
    }
    if (args.conflict) {
        console.error('--show / --apply / --revert 三者互斥，只能指定一个。运行 pnpm db:migrate:show --help 查看用法。')
        return 1
    }
    if (!args.action) {
        console.error('缺少动作（--show / --apply / --revert）。运行 pnpm db:migrate:show --help 查看用法。')
        return 1
    }
    if (args.action === 'revert' && !args.yes) {
        console.error('缺少必填确认参数 --yes（回退会改回数据库 schema）。运行 pnpm db:migrate:show --help 查看用法。')
        return 1
    }

    const createDataSource = deps.createDataSource ?? createMigrateDataSource
    const ds = createDataSource()
    try {
        if (args.action === 'show') {
            // 只读优先：SQLite 文件不存在时不 initialize（否则 better-sqlite3 会创建空库文件）
            const missingPath = missingSqliteDatabasePath(ds)
            if (missingPath) {
                console.log(`[MIGRATE] 数据库文件不存在：${missingPath}\n  schema 未建立，视为全部迁移待执行；未创建文件（不写库）。\n`)
                return 0
            }
            await ds.initialize()
            console.log(formatMigrationStatus(await collectMigrationStatus(ds)))
            return 0
        }
        await ds.initialize()
        if (args.action === 'apply') {
            console.log(formatApplyResult(await applyPendingMigrations(ds)))
            return 0
        }
        const reverted = await revertLastMigration(ds)
        console.log(reverted
            ? `[MIGRATE] 已回退最近一次迁移：${reverted}\n`
            : '[MIGRATE] 无可回退的迁移（迁移记录为空）\n')
        return 0
    } catch (error) {
        console.error('迁移未完成：', (error as Error).message)
        return 1
    } finally {
        if (ds.isInitialized) {
            await ds.destroy()
        }
    }
}

/** 仅在直接运行本脚本时执行 CLI（模块导入时不触发） */
const isExecutedAsEntryPoint = (): boolean => {
    const entry = process.argv[1]
    if (!entry) {
        return false
    }
    return import.meta.url === pathToFileURL(entry).href
}

if (isExecutedAsEntryPoint()) {
    void main(process.argv.slice(2)).then((code) => process.exit(code))
}
