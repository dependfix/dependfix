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
 *
 * **列名必须用 snake_case**（2026-09-03 修复）：raw SQL 走 `queryRunner.query()` 不经过
 * `SnakeCaseNamingStrategy`（命名策略仅作用于 TypeORM 自动生成的 SQL，如 entity / QueryBuilder）。
 * 业务表的实际列名经 namingStrategy 转换 = snake_case；raw SQL 引用 camelCase 会导致
 * `no such column: repositoryId`（SQLite 列名大小写敏感）。详见
 * [development.md §5.1.19](../standards/development.md) + [todo.md §M24 follow-up #6](../plan/todo.md)。
 */
export class CreateAuditEventTable1700000000000 implements MigrationInterface {
    name = 'CreateAuditEventTable1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS dependfix_audit_event (
                id varchar(36) NOT NULL PRIMARY KEY,
                type varchar(64) NOT NULL,
                severity varchar(16) NOT NULL,
                repository_id varchar(36),
                scan_run_id varchar(36),
                payload_json text,
                notified boolean NOT NULL DEFAULT (0),
                notified_via varchar(32),
                created_at datetime NOT NULL,
                updated_at datetime NOT NULL
            )
        `)
        // 类级复合索引（TypeORM 1.x 列级复合 @Index([...]) 会生成单列索引，迁移必须显式声明）
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_type_created
                ON dependfix_audit_event (type, created_at)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_repo_created
                ON dependfix_audit_event (repository_id, created_at)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_created
                ON dependfix_audit_event (created_at)
        `)
        // 外键：repository_id ON DELETE SET NULL（与实体定义一致）
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_repository_id
                ON dependfix_audit_event (repository_id)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_scan_run_id
                ON dependfix_audit_event (scan_run_id)
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
