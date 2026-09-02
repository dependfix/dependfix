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
 */
export class AddScanResultIdentifiers1750000000000 implements MigrationInterface {
    name = 'AddScanResultIdentifiers1750000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                ADD COLUMN ghsaId varchar(32) NULL
        `)
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                ADD COLUMN cveIds text NULL
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_scan_result_repo_ghsa
                ON dependfix_scan_result (repositoryId, ghsaId)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP INDEX IF EXISTS idx_scan_result_repo_ghsa
        `)
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                DROP COLUMN cveIds
        `)
        await queryRunner.query(`
            ALTER TABLE dependfix_scan_result
                DROP COLUMN ghsaId
        `)
    }
}
