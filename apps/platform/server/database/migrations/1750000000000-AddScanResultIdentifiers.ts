import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * M23.3 C66-A1：ScanResult 新增 ghsaId / cveIds 列。
 *
 * 设计要点：
 * - ghsaId：varchar(32) nullable，存 GitHub Security Advisory ID（如 `GHSA-xxxx-xxxx-xxxx`）
 *   类级复合索引 `(repositoryId, ghsaId)` 便于 dashboard 按 GHSA 维度查询
 * - cveIds：text nullable，存 JSON 序列化字符串（如 `'["CVE-2021-23337"]'`）
 *   SQLite 不支持 string[]，用 JSON 序列化；不建索引（JSON 字段不适合 B-Tree 索引）
 *
 * 历史数据：旧行 ghsaId / cveIds = NULL，reconcile 时通过 alert.ghsaId / alert.cveIds 透传更新
 * （C66-A1 + C66-A2 实施后下次扫描自动填充）。
 *
 * **列名必须用 snake_case**（2026-09-03 修复）：raw SQL 走 `queryRunner.query()` 不经过
 * `SnakeCaseNamingStrategy`（命名策略仅作用于 TypeORM 自动生成的 SQL，如 entity / QueryBuilder）。
 * 业务表的实际列名经 namingStrategy 转换 = snake_case；raw SQL 引用 camelCase 会导致
 * `no such column: repositoryId`（SQLite 列名大小写敏感）。详见
 * [development.md §5.1.19](../standards/development.md) + [todo.md §M24 follow-up #6](../plan/todo.md)。
 */
export class AddScanResultIdentifiers1750000000000 implements MigrationInterface {
    name = 'AddScanResultIdentifiers1750000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                ADD COLUMN ghsa_id varchar(32) NULL
        `)
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                ADD COLUMN cve_ids text NULL
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_scan_result_repo_ghsa
                ON dependfix_scan_result (repository_id, ghsa_id)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_scan_result_repo_ghsa
        `)
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                DROP COLUMN cve_ids
        `)
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                DROP COLUMN ghsa_id
        `)
    }
}
