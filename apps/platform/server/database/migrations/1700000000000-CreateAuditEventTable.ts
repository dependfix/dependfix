import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 创建 audit_event 表（环境/容器审计事件）。
 *
 * 索引设计（类级复合索引，TypeORM 1.x 列级复合会生成单列索引）：
 * - idx_audit_event_type_created: [type, createdAt] — 按类型 + 时间范围查询
 * - idx_audit_event_repo_created: [repositoryId, createdAt] — 按仓库 + 时间范围查询
 * - 单索引 createdAt: 跨类型时间排序
 *
 * SQLite 限制：
 * - ALTER TABLE ADD CONSTRAINT FOREIGN KEY 不支持历史 SQLite 版本；用 TypeORM QueryRunner 自动处理
 * - 时间列用 datetime 字符串（与 base-entity 的 getDateType() 兼容，PostgreSQL 需带时区）
 */
export class CreateAuditEventTable1700000000000 implements MigrationInterface {
    name = 'CreateAuditEventTable1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS dependfix_audit_event (
                id varchar(36) NOT NULL PRIMARY KEY,
                type varchar(64) NOT NULL,
                severity varchar(16) NOT NULL,
                repositoryId varchar(36),
                scanRunId varchar(36),
                payloadJson text,
                notified boolean NOT NULL DEFAULT (0),
                notifiedVia varchar(32),
                createdAt datetime NOT NULL,
                updatedAt datetime NOT NULL
            )
        `)
        // 类级复合索引（TypeORM 1.x 列级复合 @Index([...]) 会生成单列索引，迁移必须显式声明）
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_type_created
                ON dependfix_audit_event (type, createdAt)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_repo_created
                ON dependfix_audit_event (repositoryId, createdAt)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_created
                ON dependfix_audit_event (createdAt)
        `)
        // 外键：repositoryId ON DELETE SET NULL（与实体定义一致）
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_repository_id
                ON dependfix_audit_event (repositoryId)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_scan_run_id
                ON dependfix_audit_event (scanRunId)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_scan_run_id`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_repository_id`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_created`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_repo_created`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_type_created`)
        await queryRunner.query(`DROP TABLE IF EXISTS dependfix_audit_event`)
    }
}
