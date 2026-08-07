import type { ColumnType } from 'typeorm'

/**
 * 数据库列类型映射：按数据库类型返回正确的列类型。
 * PostgreSQL 必须使用带时区的 `timestamp with time zone`，
 * 否则跨时区写入/读取会出现偏移（momei 已验证的时区陷阱）。
 */

export type DatabaseType = 'sqlite' | 'mysql' | 'postgres'

/** 从环境推断数据库类型（支持显式指定与 URL 前缀推断）。 */
export const resolveDatabaseType = (): DatabaseType => {
    const explicit = process.env.DATABASE_TYPE?.toLowerCase()
    if (explicit === 'mysql' || explicit === 'postgres' || explicit === 'sqlite') {
        return explicit
    }
    const url = (process.env.DATABASE_URL ?? '').toLowerCase()
    if (url.startsWith('mysql:')) {
        return 'mysql'
    }
    if (url.startsWith('postgres:') || url.startsWith('postgresql:')) {
        return 'postgres'
    }
    return 'sqlite'
}

/** 时间列类型：sqlite/mysql → datetime；postgres → timestamp with time zone */
export const getDateType = (dbType?: DatabaseType): ColumnType => {
    switch (dbType ?? resolveDatabaseType()) {
        case 'postgres':
            return 'timestamp with time zone'
        case 'mysql':
            return 'datetime'
        case 'sqlite':
        default:
            return 'datetime'
    }
}
