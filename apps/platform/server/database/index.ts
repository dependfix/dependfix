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
import { CreateAuditEventTable1700000000000 } from './migrations/1700000000000-CreateAuditEventTable'
import { AddScanResultIdentifiers1750000000000 } from './migrations/1750000000000-AddScanResultIdentifiers'
import { CreatePrCheckTable1800000000000 } from './migrations/1800000000000-CreatePrCheckTable'
import { AddScheduleKind1800000000001 } from './migrations/1800000000001-AddScheduleKind'
import { runStartupBackup } from './backup'
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
        ],
        migrations: [
            CreateAuditEventTable1700000000000,
            AddScanResultIdentifiers1750000000000,
            CreatePrCheckTable1800000000000,
            AddScheduleKind1800000000001,
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
 * - 仅应用启动时执行一次（once 保护）：ensureDatabaseInitialized 是 hot path idempotent 函数
 *   （60+ 处 API endpoint / service 引用），备份必须在 schema 同步 / 数据写入前完成但不能在每次调用时执行
 */
let startupBackupRan = false

/**
 * SQLite 启动期 PRAGMA 优化（M23.1 根因排查落地）：
 * - `journal_mode = WAL`：rollback journal（默认 delete）→ WAL，让读不阻塞写 + 多个并发读不互锁
 *   （M22.7 ECONNRESET 根因候选 P0，详见 backlog.md §E2E global-setup 串行场景 ECONNRESET 根因段）；
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

export const ensureDatabaseInitialized = async (): Promise<DataSource> => {
    // 启动期备份（once 保护；详见 docs/standards/development.md §5.1.18）
    // 注：ensureDatabaseInitialized 是 hot path，每次调用都会执行；备份仅在首次调用时执行一次
    if (!startupBackupRan) {
        runStartupBackup()
        startupBackupRan = true
    }

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
