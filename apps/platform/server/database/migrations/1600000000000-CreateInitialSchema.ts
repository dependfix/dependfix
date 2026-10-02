import {
    Table,
    TableForeignKey,
    type EntityMetadata,
    type MigrationInterface,
    type QueryRunner,
} from 'typeorm'

/**
 * 基线迁移：从实体元数据创建全部基础表 / 索引 / 外键。
 *
 * 背景：在本次基线迁移之前，平台的基础表（organization / repository / scan_run / scan_result 等）
 * 一直由 `synchronize` 创建，迁移链只有增量迁移（ALTER / 新建次要表），**没有任何迁移创建基础表**。
 * 后果是全新空库上执行迁移链会在首个 `ALTER TABLE` 处报 `no such table`，Docker 首次启动即不可用。
 *
 * 设计要点：
 * - **实体元数据驱动**：用 `Table.create(entityMetadata, driver)` 生成建表 DDL，天然继承
 *   `entityPrefix`（默认 `dependfix_`，可由 `DATABASE_ENTITY_PREFIX` 覆盖）与命名策略，
 *   跨 SQLite / MySQL / PostgreSQL 方言，避免手写 DDL 与前缀 / 方言漂移。
 * - **幂等**：表已存在则整表跳过（存量库由 `synchronize` 或旧迁移建表时零破坏），仅记录迁移；
 *   全新库则建全表，后续增量迁移因列已存在而 no-op。
 * - **依赖排序**：按 `relationsWithJoinColumns`（产生外键的一侧）拓扑排序，被引用表先建，
 *   满足 PostgreSQL / MySQL 的外键前置要求（SQLite 允许前向引用，排序无副作用）。
 * - **不可变性边界**：本迁移形态来自实体元数据，未来实体变更会改变「全新库基线」；因此约定
 *   新增列 / 表仍必须编写独立迁移，且所有迁移保持幂等（守卫），基线才能在任意版本重放。
 */
export class CreateInitialSchema1600000000000 implements MigrationInterface {
    name = 'CreateInitialSchema1600000000000'

    /**
     * 按外键依赖排序（被引用表在前）。循环依赖（当前 schema 无此形态）时退化为注册顺序，
     * 避免死循环。
     */
    private orderByDependencies(metadatas: EntityMetadata[]): EntityMetadata[] {
        const remaining = new Set(metadatas)
        const ordered: EntityMetadata[] = []
        while (remaining.size > 0) {
            let progressed = false
            for (const metadata of [...remaining]) {
                const pendingDependencies = metadata.foreignKeys
                    .map((foreignKey) => foreignKey.referencedEntityMetadata)
                    .filter((target) => target !== metadata && remaining.has(target))
                if (pendingDependencies.length === 0) {
                    ordered.push(metadata)
                    remaining.delete(metadata)
                    progressed = true
                }
            }
            if (!progressed) {
                ordered.push(...remaining)
                break
            }
        }
        return ordered
    }

    private baseTableMetadatas(queryRunner: QueryRunner): EntityMetadata[] {
        return queryRunner.dataSource.entityMetadatas
            .filter((metadata) => metadata.tableType === 'regular')
    }

    public async up(queryRunner: QueryRunner): Promise<void> {
        const { dataSource } = queryRunner
        for (const metadata of this.orderByDependencies(this.baseTableMetadatas(queryRunner))) {
            // 幂等：存量库表已存在时跳过（无论默认前缀还是自定义前缀）
            if (await queryRunner.hasTable(metadata.tableName)) {
                continue
            }
            const table = Table.create(metadata, dataSource.driver)
            // `Table.create` 不含外键（synchronize 走单独的 createForeignKeys 步骤）；
            // 建表时内联外键，避免 SQLite 在 `createForeignKeys` 中重建整表。
            for (const foreignKey of metadata.foreignKeys) {
                table.addForeignKey(TableForeignKey.create(foreignKey, dataSource.driver))
            }
            await queryRunner.createTable(table, true, true, true)
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // ⚠️ 回退本迁移会删除全部业务表及其数据（回到空库形态）；生产回退前务必先备份
        // （`pnpm db:doctor` 自检 / `pnpm db:restore` 或卷级备份，见开发规范与运维脚本 README）。
        // 反序删除（先删引用方），避免残留外键
        for (const metadata of this.orderByDependencies(this.baseTableMetadatas(queryRunner)).reverse()) {
            if (await queryRunner.hasTable(metadata.tableName)) {
                await queryRunner.dropTable(metadata.tableName, true, true, true)
            }
        }
    }
}
