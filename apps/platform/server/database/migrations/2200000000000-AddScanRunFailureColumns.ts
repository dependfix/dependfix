import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * ScanRun 新增失败分类三列（运行失败分类与筛选）。
 *
 * 涉及 1 张表（幂等 + 前缀感知：表名经 `entityPrefix` 解析，列缺失才 ALTER）：
 * - scan_run：failure_code (varchar(64) NULL) — 归一化原始码 / 引擎类别，便于审计
 * - scan_run：failure_stage (varchar(32) NULL) — source / clone / install / fix / verify / deliver / runtime / cleanup / unknown
 * - scan_run：failure_kind (varchar(16) NULL) — transient / deterministic / unknown
 *
 * 分类口径见 [run-failure-taxonomy.md §4](../../../../docs/design/governance/run-failure-taxonomy.md)，
 * 落库实现见 `server/services/run-failure-classify.ts`（单一事实源）。
 *
 * **不建索引**：单组织 run 量级小（summary 窗口上限 500），按 `failure_stage` 顺序扫描成本可忽略；
 * 且新增实体级索引会与基线迁移（实体元数据驱动）产生同名漂移，收益不足。后续如出现性能回归再单独加索引迁移。
 *
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`，
 * 业务表实际列名为 snake_case（详见开发规范 §5.1.19）。
 *
 * 存量行由 `server/database/scripts/backfill-run-failure.ts` 尽力回填（无法判定写 unknown）。
 */
export class AddScanRunFailureColumns2200000000000 implements MigrationInterface {
    name = 'AddScanRunFailureColumns2200000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'scan_run', 'failure_code', 'failure_code varchar(64) NULL')
        await addColumnIfMissing(queryRunner, 'scan_run', 'failure_stage', 'failure_stage varchar(32) NULL')
        await addColumnIfMissing(queryRunner, 'scan_run', 'failure_kind', 'failure_kind varchar(16) NULL')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'scan_run', 'failure_kind')
        await dropColumnIfExists(queryRunner, 'scan_run', 'failure_stage')
        await dropColumnIfExists(queryRunner, 'scan_run', 'failure_code')
    }
}
