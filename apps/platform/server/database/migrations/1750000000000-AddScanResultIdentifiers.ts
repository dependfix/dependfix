import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, createIndexIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * ScanResult 新增 ghsaId / cveIds 列。
 *
 * 设计要点：
 * - ghsaId：varchar(32) nullable，存 GitHub Security Advisory ID（如 `GHSA-xxxx-xxxx-xxxx`）
 *   类级复合索引 `(repositoryId, ghsaId)` 便于 dashboard 按 GHSA 维度查询
 * - cveIds：text nullable，存 JSON 序列化字符串（如 `'["CVE-2021-23337"]'`）
 *   SQLite 不支持 string[]，用 JSON 序列化；不建索引（JSON 字段不适合 B-Tree 索引）
 *
 * 历史数据：旧行 ghsaId / cveIds = NULL，reconcile 时通过 alert.ghsaId / alert.cveIds 透传更新
 * （实施后下次扫描自动填充）。
 *
 * **幂等 + 前缀感知**：基线迁移已在全新库建全列，本迁移按「表存在 + 列缺失」守卫重放，
 * 表名经 `entityPrefix` 解析，非默认前缀（`DATABASE_ENTITY_PREFIX`）下不再静默 no-op。
 *
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`
 * （命名策略仅作用于 TypeORM 自动生成的 SQL，如 entity / QueryBuilder）。业务表实际列名为
 * snake_case，raw SQL 引用 camelCase 会报 `no such column`。详见
 * [开发规范 §5.1.19](../standards/development.md)。
 */
export class AddScanResultIdentifiers1750000000000 implements MigrationInterface {
    name = 'AddScanResultIdentifiers1750000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'scan_result', 'ghsa_id', 'ghsa_id varchar(32) NULL')
        await addColumnIfMissing(queryRunner, 'scan_result', 'cve_ids', 'cve_ids text NULL')
        await createIndexIfMissing(
            queryRunner,
            'scan_result',
            'idx_scan_result_repo_ghsa',
            ['repository_id', 'ghsa_id'],
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS idx_scan_result_repo_ghsa')
        await dropColumnIfExists(queryRunner, 'scan_result', 'cve_ids')
        await dropColumnIfExists(queryRunner, 'scan_result', 'ghsa_id')
    }
}
