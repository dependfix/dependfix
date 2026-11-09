import type { DataSource, EntityMetadata } from 'typeorm'

/**
 * 启动期 schema 漂移检测：比对实体元数据与实库表 / 列。
 *
 * 背景（2026-11-09 生产事故）：存量库在 `DATABASE_MIGRATIONS_RUN=false` 下升级镜像后，
 * pending migration 不会执行，实体已声明的新列在库中不存在；应用照常启动，直到首次查询该表才
 * 报 `SQLITE_ERROR: no such column`（表现为多个页面 500 + 周期任务持续失败）。全新库 / CI /
 * 单测（`synchronize=true`）都不会暴露，属于典型的「静默累积」漂移。
 *
 * 本模块只做只读检测：`detectSchemaDrift` 返回缺失表 / 列，状态经 `setSchemaStatus` 落 globalThis
 * （跨 Nitro 模块实例共享，口径同 DataSource 单例），由 `/api/health` 读取。
 *
 * 边界：
 * - 只检测「实体声明了、实库没有」的缺失项；实库多出的列（回退残留）不报漂移。
 * - 只比对 `metadata.columns`（关系外键列由 TypeORM 归入该集合）；不覆盖索引 / 默认值 / 类型差异。
 * - 标识符比较不区分大小写（平台统一走 `SnakeCaseNamingStrategy`，全部小写；PostgreSQL 未加引号
 *   的标识符也会折叠为小写）。
 */

/** schema 漂移结果（表 / 列均为实库缺失项） */
export interface SchemaDrift {
    /** 是否存在缺失表或缺失列 */
    hasDrift: boolean
    /** 缺失的表名（含 `entityPrefix`） */
    missingTables: string[]
    /** 缺失的列（表名为实库表名，含 `entityPrefix`） */
    missingColumns: { table: string, column: string }[]
}

/** 启动期检测状态 */
export type SchemaStatus = 'ok' | 'drift' | 'unknown'

const GLOBAL_STATUS_KEY = '__dependfix_schema_status__'

interface SchemaStatusGlobal {
    [GLOBAL_STATUS_KEY]?: SchemaStatus
}

const globalScope = (): SchemaStatusGlobal => globalThis as SchemaStatusGlobal

/** 写入检测状态（跨模块实例共享）。 */
export const setSchemaStatus = (status: SchemaStatus): void => {
    globalScope()[GLOBAL_STATUS_KEY] = status
}

/** 读取检测状态；未检测 / 检测失败 / 进程重启后均为 `unknown`。 */
export const getSchemaStatus = (): SchemaStatus => {
    const status = globalScope()[GLOBAL_STATUS_KEY]
    return status === 'ok' || status === 'drift' ? status : 'unknown'
}

/** 标识符归一：统一小写后比较（见模块头「边界」）。 */
const normalizeIdentifier = (name: string): string => name.toLowerCase()

/** 需要检测的实体：只取真实表（跳过视图 / closure table 等特殊形态）。 */
const regularTables = (ds: DataSource): EntityMetadata[] =>
    ds.entityMetadatas.filter((metadata) => metadata.tableType === 'regular')

/** 实体元数据声明的列集合（跳过 virtual 列）。 */
const expectedColumns = (metadata: EntityMetadata): Set<string> =>
    new Set(
        metadata.columns
            .filter((column) => !column.isVirtual)
            .map((column) => column.databaseName),
    )

/**
 * 只读比对实体元数据与实库 schema。
 *
 * 调用方负责决定是否「值得检测」（`synchronize=true` 或 worker 进程应跳过），本函数不做跳过判定，
 * 便于单测直接验证比对语义。
 */
export const detectSchemaDrift = async (ds: DataSource): Promise<SchemaDrift> => {
    const runner = ds.createQueryRunner()
    try {
        const actualTables = await runner.getTables()
        const actualByName = new Map(
            actualTables.map((table) => [normalizeIdentifier(table.name), table]),
        )
        const missingTables: string[] = []
        const missingColumns: SchemaDrift['missingColumns'] = []
        for (const metadata of regularTables(ds)) {
            const actual = actualByName.get(normalizeIdentifier(metadata.tableName))
            if (!actual) {
                missingTables.push(metadata.tableName)
                continue
            }
            const actualColumns = new Set(actual.columns.map((column) => normalizeIdentifier(column.name)))
            for (const column of expectedColumns(metadata)) {
                if (!actualColumns.has(normalizeIdentifier(column))) {
                    missingColumns.push({ table: metadata.tableName, column })
                }
            }
        }
        return {
            hasDrift: missingTables.length > 0 || missingColumns.length > 0,
            missingTables,
            missingColumns,
        }
    } finally {
        await runner.release()
    }
}
