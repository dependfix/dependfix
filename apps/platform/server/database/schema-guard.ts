import type { DataSource } from 'typeorm'

/**
 * 判断 SQLite 数据库是否「无任何业务表」（全新 / 未初始化）。
 *
 * 用途：启动期在未开启迁移时提前告警。统计 `sqlite_master` 中的表，排除 `sqlite_%` 内部表与
 * TypeORM `migrations` 记录表；非 SQLite 后端统一返回 `false`（不适用该判据）。
 */
export const isEmptySqliteDatabase = async (ds: DataSource): Promise<boolean> => {
    if (ds.options.type !== 'better-sqlite3') {
        return false
    }
    const rows = await ds.query(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'
         LIMIT 1`,
    ) as { name: string }[]
    return rows.length === 0
}
