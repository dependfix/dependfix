import 'reflect-metadata'
import {
    DataSource,
    type DataSourceOptions,
} from 'typeorm'
import betterSqlite3 from 'better-sqlite3'
import mysql2 from 'mysql2'
import pg from 'pg'
import { Account } from '../entities/account'
import { Session } from '../entities/session'
import { User } from '../entities/user'
import { Verification } from '../entities/verification'
import { Credential } from '../entities/credential'
import { Repository } from '../entities/repository'
import { ScanRun } from '../entities/scan-run'
import { ScanResult } from '../entities/scan-result'
import { SnakeCaseNamingStrategy } from './naming-strategy'
import { resolveDatabaseType, type DatabaseType } from './type'

/**
 * TypeORM DataSource 单例（多后端：SQLite 默认 / MySQL / PostgreSQL）。
 * 设计要点（对齐 momei 已验证方案）：
 * - 显式传入 driver 实例，绕过 TypeORM 1.x PlatformTools 动态 require（Docker 已知坑）
 * - 数据库路径 / 连接串通过 DATABASE_* 环境变量隔离
 * - 开发环境自动同步 schema；生产需 DATABASE_SYNCHRONIZE=true 显式开启
 * - 初始化失败不抛致命错误：日志告警 + 功能降级
 */

const isDev = process.env.NODE_ENV !== 'production'

export const createDataSourceOptions = (): DataSourceOptions => {
    const dbType = resolveDatabaseType()
    const databasePath = process.env.DATABASE_PATH ?? 'data/dependfix.sqlite'
    const databaseUrl = process.env.DATABASE_URL ?? ''
    const ssl = process.env.DATABASE_SSL === 'true'
    const entityPrefix = process.env.DATABASE_ENTITY_PREFIX || 'dependfix_'
    const synchronize = process.env.DATABASE_SYNCHRONIZE === 'true' || isDev

    const common: Partial<DataSourceOptions> = {
        entities: [
            User,
            Session,
            Account,
            Verification,
            Credential,
            Repository,
            ScanRun,
            ScanResult,
        ],
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
        if (existing && existing.isInitialized) {
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
 */
export const ensureDatabaseInitialized = async (): Promise<DataSource> => {
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
