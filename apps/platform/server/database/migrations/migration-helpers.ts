import type { QueryRunner } from 'typeorm'

/**
 * 迁移共用的前缀感知表名解析与列 / 索引守卫。
 *
 * 背景：平台 DataSource 默认 `entityPrefix='dependfix_'`（`createDataSourceOptions`，可由
 * `DATABASE_ENTITY_PREFIX` 覆盖）。早期迁移的表名处理不统一（部分硬编码 `dependfix_`、部分硬编码
 * 无前缀），导致非默认前缀下 `getTable()` 返回 `undefined`、迁移静默 no-op（无日志信号）。
 *
 * 本模块统一按「先试 `entityPrefix + 表名`，再回退无前缀表名」解析真实表名，并在此基础上提供
 * 幂等的加列 / 删列 / 建索引守卫，使全新库（基线迁移已建全列）与存量库（迁移已记录）都能安全重放。
 */

/**
 * 解析实际表名：优先 `entityPrefix + baseName`（平台默认 `dependfix_`），回退无前缀 `baseName`。
 * 两候选表均不存在时返回 `null`，由调用方按 no-op 处理。
 */
export const resolveTableName = async (
    queryRunner: QueryRunner,
    baseName: string,
): Promise<string | null> => {
    const prefix = queryRunner.dataSource.options.entityPrefix ?? ''
    const candidates = prefix ? [`${prefix}${baseName}`, baseName] : [baseName]
    for (const name of candidates) {
        const table = await queryRunner.getTable(name)
        if (table) {
            return table.name
        }
    }
    return null
}

/**
 * 按当前 `entityPrefix` 计算目标表名（不检查是否存在）。
 * 供 `CREATE TABLE` 类迁移使用：表尚未创建时无法用 `resolveTableName` 探测。
 */
export const prefixedTableName = (queryRunner: QueryRunner, baseName: string): string => {
    const prefix = queryRunner.dataSource.options.entityPrefix ?? ''
    return `${prefix}${baseName}`
}

/**
 * 幂等加列：目标表不存在或列已存在时跳过（返回 `false`），否则执行 `ALTER TABLE ADD COLUMN`。
 *
 * @param columnDdl 单个列定义（如 `ghsa_id varchar(32) NULL`），不含 `ADD COLUMN` 关键字。
 */
export const addColumnIfMissing = async (
    queryRunner: QueryRunner,
    baseName: string,
    columnName: string,
    columnDdl: string,
): Promise<boolean> => {
    const tableName = await resolveTableName(queryRunner, baseName)
    if (!tableName) {
        return false
    }
    const table = await queryRunner.getTable(tableName)
    if (table?.columns.some((column) => column.name === columnName)) {
        return false
    }
    await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnDdl}`)
    return true
}

/** 幂等删列：目标表不存在或列不存在时跳过（返回 `false`），否则执行 `ALTER TABLE DROP COLUMN`。 */
export const dropColumnIfExists = async (
    queryRunner: QueryRunner,
    baseName: string,
    columnName: string,
): Promise<boolean> => {
    const tableName = await resolveTableName(queryRunner, baseName)
    if (!tableName) {
        return false
    }
    const table = await queryRunner.getTable(tableName)
    if (!table?.columns.some((column) => column.name === columnName)) {
        return false
    }
    await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`)
    return true
}

/**
 * 幂等建索引：目标表不存在时跳过；同名索引或**列集合完全相同**的索引已存在时跳过
 * （避免基线的实体元数据索引与迁移显式命名索引重复）。
 *
 * 边界：去重仅比较索引名与列集合，**不含 `unique` / `where`**（当前调用点均为普通索引）；
 * 未来若要建唯一 / 部分索引需扩展该判定。生成的 `CREATE INDEX IF NOT EXISTS` 沿用项目既有
 * 迁移语法（SQLite / PostgreSQL 支持；MySQL 无该子句）。
 */
export const createIndexIfMissing = async (
    queryRunner: QueryRunner,
    baseName: string,
    indexName: string,
    columns: string[],
): Promise<boolean> => {
    const tableName = await resolveTableName(queryRunner, baseName)
    if (!tableName) {
        return false
    }
    const table = await queryRunner.getTable(tableName)
    const covered = table?.indices.some((index) => {
        if (index.name === indexName) {
            return true
        }
        return index.columnNames.length === columns.length
            && index.columnNames.every((column, position) => column === columns[position])
    }) ?? false
    if (covered) {
        return false
    }
    await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columns.join(', ')})`,
    )
    return true
}
