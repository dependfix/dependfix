import type { MigrationInterface, QueryRunner } from 'typeorm'
import { prefixedTableName } from './migration-helpers'

/**
 * 创建 audit_event 表（环境 / 容器审计事件）。
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
 * **表名前缀感知 + 幂等**：表名经 `entityPrefix` 计算（基线迁移已在全新库建表，`IF NOT EXISTS`
 * 保证重放 no-op；此前硬编码 `dependfix_`，自定义前缀下会建错表）。列名必须用 snake_case：
 * raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`，业务表实际列名为 snake_case。
 * 详见 [开发规范 §5.1.19](../standards/development.md)。
 */
export class CreateAuditEventTable1700000000000 implements MigrationInterface {
    name = 'CreateAuditEventTable1700000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const table = prefixedTableName(queryRunner, 'audit_event')
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS ${table} (
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
                ON ${table} (type, created_at)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_repo_created
                ON ${table} (repository_id, created_at)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_created
                ON ${table} (created_at)
        `)
        // 外键：repository_id ON DELETE SET NULL（与实体定义一致）
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_repository_id
                ON ${table} (repository_id)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_event_scan_run_id
                ON ${table} (scan_run_id)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = prefixedTableName(queryRunner, 'audit_event')
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_scan_run_id`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_repository_id`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_created`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_repo_created`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_audit_event_type_created`)
        await queryRunner.query(`DROP TABLE IF EXISTS ${table}`)
    }
}
