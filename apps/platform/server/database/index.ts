import 'reflect-metadata'
import {
    DataSource,
    type DataSourceOptions,
} from 'typeorm'
import betterSqlite3 from 'better-sqlite3'
import mysql2 from 'mysql2'
import pg from 'pg'
import { SnakeCaseNamingStrategy } from './naming-strategy'
import { resolveDatabaseType, type DatabaseType } from './type'
import { isEmptySqliteDatabase } from './schema-guard'
import { detectSchemaDrift, setSchemaStatus, type SchemaDrift } from './schema-drift'
import { CreateInitialSchema1600000000000 } from './migrations/1600000000000-CreateInitialSchema'
import { CreateAuditEventTable1700000000000 } from './migrations/1700000000000-CreateAuditEventTable'
import { AddScanResultIdentifiers1750000000000 } from './migrations/1750000000000-AddScanResultIdentifiers'
import { CreatePrCheckTable1800000000000 } from './migrations/1800000000000-CreatePrCheckTable'
import { AddScheduleKind1800000000001 } from './migrations/1800000000001-AddScheduleKind'
import { AddScanRunLogs1800000000002 } from './migrations/1800000000002-AddScanRunLogs'
import { AddAiConfigFields1900000000000 } from './migrations/1900000000000-AddAiConfigFields'
import { AddCredentialOwnerLogin2000000000000 } from './migrations/2000000000000-AddCredentialOwnerLogin'
import { AddRepositoryVerifyCommands2100000000000 } from './migrations/2100000000000-AddRepositoryVerifyCommands'
import { AddScanRunFailureColumns2200000000000 } from './migrations/2200000000000-AddScanRunFailureColumns'
import { AddPrCheckBuildSignals2300000000000 } from './migrations/2300000000000-AddPrCheckBuildSignals'
import { AddScanRunRetriedFromRunId2400000000000 } from './migrations/2400000000000-AddScanRunRetriedFromRunId'
import { AddRepositoryPrCheckFocus2500000000000 } from './migrations/2500000000000-AddRepositoryPrCheckFocus'
import { AddScanRunOutcomeColumns2600000000000 } from './migrations/2600000000000-AddScanRunOutcomeColumns'
import { AddPlatformNotification2700000000000 } from './migrations/2700000000000-AddPlatformNotification'
import { AddScanRunResourceColumns2800000000000 } from './migrations/2800000000000-AddScanRunResourceColumns'
import { AddScanRunBuildColumns2900000000000 } from './migrations/2900000000000-AddScanRunBuildColumns'
import { AddScanRunPrNumber2900000000001 } from './migrations/2900000000001-AddScanRunPrNumber'
import { AddRepositoryPrFeedback2900000000002 } from './migrations/2900000000002-AddRepositoryPrFeedback'
import { AddRepositoryExecutionLimits3000000000000 } from './migrations/3000000000000-AddRepositoryExecutionLimits'
import { AddRepositoryAllowMajorUpgrade3000000000001 } from './migrations/3000000000001-AddRepositoryAllowMajorUpgrade'
import { AddPrCheckLifecycleState3100000000000 } from './migrations/3100000000000-AddPrCheckLifecycleState'
import { AddRepositorySandboxImage3100000000001 } from './migrations/3100000000001-AddRepositorySandboxImage'
import { runStartupBackup } from './backup'
import { isQueueWorkerProcess } from '#server/utils/process-role'
import { Account } from '#server/entities/account'
import { Session } from '#server/entities/session'
import { User } from '#server/entities/user'
import { Verification } from '#server/entities/verification'
import { Credential } from '#server/entities/credential'
import { Repository } from '#server/entities/repository'
import { Organization } from '#server/entities/organization'
import { ScanRun } from '#server/entities/scan-run'
import { ScanResult } from '#server/entities/scan-result'
import { Schedule } from '#server/entities/schedule'
import { BatchRun } from '#server/entities/batch-run'
import { AuditEvent } from '#server/entities/audit-event'
import { PRCheck } from '#server/entities/pr-check'
import { NotificationPreference } from '#server/entities/notification-preference'
import { NotificationLog } from '#server/entities/notification-log'

/**
 * TypeORM DataSource 单例（多后端：SQLite 默认 / MySQL / PostgreSQL）。
 * 设计要点（对齐 momei 已验证方案）：
 * - 显式传入 driver 实例，绕过 TypeORM 1.x PlatformTools 动态 require（Docker 已知坑）
 * - 数据库路径 / 连接串通过 DATABASE_* 环境变量隔离
 * - synchronize + migrationsRun 均显式 opt-in（dev 模式不再自动开 synchronize）；
 *   详见 development.md §5.1.19 TypeORM 1.x synchronize 与 migrationsRun 反模式禁止
 * - 初始化失败不抛致命错误：日志告警 + 功能降级
 */

export const createDataSourceOptions = (): DataSourceOptions => {
    const dbType = resolveDatabaseType()
    const databasePath = process.env.DATABASE_PATH ?? 'data/dependfix.sqlite'
    const databaseUrl = process.env.DATABASE_URL ?? ''
    const ssl = process.env.DATABASE_SSL === 'true'
    const entityPrefix = process.env.DATABASE_ENTITY_PREFIX || 'dependfix_'
    // 显式 opt-in（hard requirement：development.md §5.1.19）：
    // - synchronize 必须 DATABASE_SYNCHRONIZE=true 才开；dev 模式也不再自动开启
    // - migrationsRun 必须 DATABASE_MIGRATIONS_RUN=true 才开；默认 false（不再自动执行 pending migration）
    const synchronize = process.env.DATABASE_SYNCHRONIZE === 'true'
    const migrationsRun = process.env.DATABASE_MIGRATIONS_RUN === 'true' // 默认 false；显式开启

    // 启动期日志（hard requirement：development.md §5.1.19）：打印 synchronize + migrationsRun +
    // 触发来源 + NODE_ENV 上下文，便于排查「为什么数据库 schema 没更新」或「为什么数据库被自动改写」
    console.log(
        `[database] synchronize=${synchronize} (DATABASE_SYNCHRONIZE=${process.env.DATABASE_SYNCHRONIZE ?? 'unset'}, NODE_ENV=${process.env.NODE_ENV ?? 'unset'}), `
        + `migrationsRun=${migrationsRun} (DATABASE_MIGRATIONS_RUN=${process.env.DATABASE_MIGRATIONS_RUN ?? 'unset'})`,
    )

    const common: Partial<DataSourceOptions> = {
        entities: [
            User,
            Session,
            Account,
            Verification,
            Credential,
            Repository,
            Organization,
            ScanRun,
            ScanResult,
            Schedule,
            BatchRun,
            AuditEvent,
            PRCheck,
            NotificationPreference,
            NotificationLog,
        ],
        migrations: [
            CreateInitialSchema1600000000000,
            CreateAuditEventTable1700000000000,
            AddScanResultIdentifiers1750000000000,
            CreatePrCheckTable1800000000000,
            AddScheduleKind1800000000001,
            AddScanRunLogs1800000000002,
            AddAiConfigFields1900000000000,
            AddCredentialOwnerLogin2000000000000,
            AddRepositoryVerifyCommands2100000000000,
            AddScanRunFailureColumns2200000000000,
            AddPrCheckBuildSignals2300000000000,
            AddScanRunRetriedFromRunId2400000000000,
            AddRepositoryPrCheckFocus2500000000000,
            AddScanRunOutcomeColumns2600000000000,
            AddPlatformNotification2700000000000,
            AddScanRunResourceColumns2800000000000,
            AddScanRunBuildColumns2900000000000,
            AddScanRunPrNumber2900000000001,
            AddRepositoryPrFeedback2900000000002,
            AddRepositoryExecutionLimits3000000000000,
            AddRepositoryAllowMajorUpgrade3000000000001,
            AddPrCheckLifecycleState3100000000000,
            AddRepositorySandboxImage3100000000001,
        ],
        migrationsRun,
        synchronize,
        entityPrefix,
        namingStrategy: new SnakeCaseNamingStrategy(),
        cache: false,
    }

    switch (dbType) {
        case 'mysql': {
            return {
                ...common,
                type: 'mysql',
                url: databaseUrl,
                // 显式传入驱动，绕过 TypeORM PlatformTools.load() 动态 require
                driver: mysql2,
                ssl: ssl ? { rejectUnauthorized: false } : false,
                charset: process.env.DATABASE_CHARSET || 'utf8mb4',
                timezone: process.env.DATABASE_TIMEZONE || 'local',
            } as DataSourceOptions
        }
        case 'postgres': {
            return {
                ...common,
                type: 'postgres',
                url: databaseUrl,
                // 显式传入驱动
                driver: pg,
                ssl: ssl ? { rejectUnauthorized: false } : false,
                extra: {
                    max: 20,
                },
            } as DataSourceOptions
        }
        case 'sqlite':
        default: {
            return {
                ...common,
                type: 'better-sqlite3',
                database: databasePath,
                // 显式传入驱动
                driver: betterSqlite3,
            } as DataSourceOptions
        }
    }
}

let appDataSource: DataSource | null = null
let initializationPromise: Promise<DataSource> | null = null

/**
 * DataSource 单例挂载到 globalThis：跨 Nitro HMR 模块重载存活，
 * 避免重载后旧连接未关闭、新实例 synchronize 与旧索引冲突。
 */
const GLOBAL_DS_KEY = '__dependfix_data_source__'

interface DataSourceGlobal {
    [GLOBAL_DS_KEY]?: DataSource | null
}

const getGlobalScope = (): DataSourceGlobal => globalThis as DataSourceGlobal

export const getDataSource = (): DataSource => {
    if (!appDataSource) {
        const existing = getGlobalScope()[GLOBAL_DS_KEY]
        if (existing?.isInitialized) {
            console.log(`[database] reuse global DataSource (pid=${process.pid})`)
            appDataSource = existing
        } else {
            console.log(`[database] create new DataSource (pid=${process.pid}, global=${Boolean(existing)})`)
            appDataSource = new DataSource(createDataSourceOptions())
            getGlobalScope()[GLOBAL_DS_KEY] = appDataSource
        }
    }
    return appDataSource
}

/**
 * 幂等初始化（带并发锁）。初始化失败时销毁 DataSource 并重置单例，
 * 允许下次调用完整重建（TypeORM synchronize 失败后实例状态不可信）。
 *
 * 启动期自动备份（hard requirement，规范见 docs/standards/security.md §2.1.1 + todo.md §M22.1）：
 * - 仅 SQLite 数据库生效（其他数据库类型由 runStartupBackup 内部跳过）
 * - fail-open：备份失败不阻塞启动（恢复依赖用户的本地副本或外部备份）
 * - 仅应用启动时执行一次（single-flight）：ensureDatabaseInitialized 是 hot path 幂等函数
 *   （60+ 处 API endpoint / service 引用），备份必须在 schema 同步 / 数据写入前完成但不能在每次调用时执行。
 *   用 Promise 而非布尔标记：并发首调时全部等待同一次快照完成，避免「第二个调用者越过备份直接初始化」
 */
let startupBackupPromise: Promise<unknown> | null = null

/**
 * SQLite 启动期 PRAGMA 优化：
 * - `journal_mode = WAL`：rollback journal（默认 delete）→ WAL，让读不阻塞写 + 多个并发读不互锁
 *   （详见 backlog.md §E2E global-setup 串行场景 ECONNRESET 根因段）；
 * - `busy_timeout = 5000ms`：默认 0 立即返回 SQLITE_BUSY，5s 等待可吸收 better-auth session 写入
 *   与 fixtures DELETE `ensureDatabaseInitialized()` 走同一 singleton 的异步清理窗口竞争。
 *
 * 仅 SQLite 数据库生效（pg/mysql 跳过）。fail-open：PRAGMA 失败仅警告不阻塞。
 */
const applySqlitePragmas = async (ds: DataSource): Promise<void> => {
    if (currentDatabaseType() !== 'sqlite') {
        return
    }
    try {
        await ds.query('PRAGMA journal_mode = WAL')
        await ds.query('PRAGMA busy_timeout = 5000')
        const journalMode = await ds.query('PRAGMA journal_mode')
        console.log(`[database] SQLite PRAGMA applied: journal_mode=${String(journalMode[0]?.journal_mode ?? 'unknown')}, busy_timeout=5000`)
    } catch (error) {
        console.error('[database] SQLite PRAGMA apply failed (non-fatal):', error)
    }
}

/**
 * 空库 + 未开启迁移的启动告警。
 *
 * 全新部署若忘记开启迁移（`DATABASE_MIGRATIONS_RUN` 非 true），`DataSource.initialize()` 不会建表，
 * 首次业务请求才报 `no such table`（用户侧表现为 Server Error，排查成本高）。此处提前给出明确提示。
 * 仅 SQLite + 未开启迁移时执行；fail-open，不影响启动。
 */
const warnIfSchemaMissing = async (ds: DataSource): Promise<void> => {
    if (currentDatabaseType() !== 'sqlite') {
        return
    }
    // 队列 worker 进程跳过：迁移由 HTTP 主进程执行（worker 侧 DATABASE_MIGRATIONS_RUN 恒 false），
    // 双进程同时启动时 worker 会先于迁移打开空库，此处告警属误报（2026-10-31 运维实测命中）。
    if (isQueueWorkerProcess()) {
        return
    }
    // 用 DataSource 生效值判定（含 createMigrateDataSource 强制 false 等场景），避免二次读 env 漂移
    if (ds.options.migrationsRun) {
        return
    }
    try {
        if (await isEmptySqliteDatabase(ds)) {
            console.error(
                '[database] 数据库为空且未开启迁移：请设置 DATABASE_MIGRATIONS_RUN=true 或执行 pnpm db:init 初始化 schema',
            )
        }
    } catch (error) {
        // 告警查询失败不阻塞启动
        console.warn('[database] 检查数据库 schema 状态失败（非致命）:', error)
    }
}

/** 漂移日志单类最多列出的条目数（完整结果由 `/api/health` 的状态与 `db:migrate:show` 提供） */
const MAX_DRIFT_LOG_ITEMS = 5

/**
 * 启动期 schema 漂移检测（只读，fail-open）。
 *
 * 触发场景：存量库在 `DATABASE_MIGRATIONS_RUN=false` 下升级镜像，pending migration 不执行，
 * 首次查询缺列表即 500（2026-11-09 生产事故）。检测把「逐请求失败」提前为启动期 ERROR +
 * `/api/health` 的 `schema` 状态，便于部署后一条命令确认。
 *
 * 跳过条件（避免误报与重复成本）：
 * - `synchronize=true`：TypeORM 初始化时自行补齐 schema，检测无意义；
 * - 队列 worker 进程：不执行迁移且启动早于 HTTP 主进程，此刻缺列属预期（口径同空库告警）；
 * - SQLite 空库：由 `warnIfSchemaMissing` 单独给出「空库 + 未开迁移」告警，避免同一启动打两条 ERROR。
 *
 * 检测本身失败只告警不阻断启动（状态记 `unknown`）。
 */
export const checkSchemaDrift = async (ds: DataSource): Promise<SchemaDrift | null> => {
    if (ds.options.synchronize || isQueueWorkerProcess()) {
        return null
    }
    try {
        if (ds.options.type === 'better-sqlite3' && await isEmptySqliteDatabase(ds)) {
            return null
        }
        const drift = await detectSchemaDrift(ds)
        setSchemaStatus(drift.hasDrift ? 'drift' : 'ok')
        if (!drift.hasDrift) {
            return drift
        }
        const tables = drift.missingTables.slice(0, MAX_DRIFT_LOG_ITEMS)
        const columns = drift.missingColumns
            .slice(0, MAX_DRIFT_LOG_ITEMS)
            .map((item) => `${item.table}.${item.column}`)
        const ellipsis = (shown: number, total: number) => (total > shown ? ' …等' : '')
        const tableSummary = tables.length
            ? `（表：${tables.join(', ')}${ellipsis(tables.length, drift.missingTables.length)}）`
            : ''
        const columnSummary = columns.length
            ? `（列：${columns.join(', ')}${ellipsis(columns.length, drift.missingColumns.length)}）`
            : ''
        console.error([
            `[database] schema 漂移：缺 ${drift.missingTables.length} 张表 / ${drift.missingColumns.length} 列`,
            tableSummary,
            columnSummary,
            '；请执行 pending migration（DATABASE_MIGRATIONS_RUN=true 或 docker/init-db.sh / pnpm db:migrate）后重启',
        ].join(''))
        return drift
    } catch (error) {
        setSchemaStatus('unknown')
        console.warn('[database] schema 漂移检测失败（非致命）:', error)
        return null
    }
}

export const ensureDatabaseInitialized = async (): Promise<DataSource> => {
    // 启动期备份（once 保护；详见 docs/standards/development.md §5.1.18）
    // 注：ensureDatabaseInitialized 是 hot path，每次调用都会执行；备份仅在首次调用时执行一次
    if (!startupBackupPromise) {
        // 兜住同步异常（如 statSync 竞态）：缓存 rejected promise 会让后续所有调用方永久失败，
        // 与「备份 fail-open」语义相反；一次失败只影响本次快照，下次调用不再重试（single-flight 语义）
        startupBackupPromise = runStartupBackup().catch(() => undefined)
    }
    await startupBackupPromise

    const ds = getDataSource()
    if (ds.isInitialized) {
        return ds
    }
    if (initializationPromise) {
        return initializationPromise
    }
    initializationPromise = (async () => {
        try {
            if (!ds.isInitialized) {
                await ds.initialize()
            }
            // PRAGMA 应用必须在 initialize 之后（连接已建立）
            if (ds.isInitialized) {
                await applySqlitePragmas(ds)
                await checkSchemaDrift(ds)
                await warnIfSchemaMissing(ds)
            }
        } catch (error) {
            console.error('[database] initialization failed:', error)
            // 销毁半初始化实例，重置单例，下次调用重建
            try {
                if (ds.isInitialized) {
                    await ds.destroy()
                }
            } catch {
                // destroy 失败不阻断重建
            }
            appDataSource = null
            getGlobalScope()[GLOBAL_DS_KEY] = null
        } finally {
            initializationPromise = null
        }
        return getDataSource()
    })()
    return initializationPromise
}

/** 当前数据库类型（供业务侧按类型做差异化处理）。 */
export const currentDatabaseType = (): DatabaseType => resolveDatabaseType()
