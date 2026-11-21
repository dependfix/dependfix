import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, createIndexIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * batch_run 新增 `resumed_from_batch_run_id`（批次级「继续执行未完成项」派生批次）。
 *
 * 兼容性：nullable，存量批次为 null（非续跑批次）；索引用于按来源批次查询派生批次。
 */
export class AddBatchRunResume3400000000000 implements MigrationInterface {
    name = 'AddBatchRunResume3400000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(
            queryRunner,
            'batch_run',
            'resumed_from_batch_run_id',
            'resumed_from_batch_run_id varchar(36)',
        )
        await createIndexIfMissing(queryRunner, 'batch_run', 'idx_batch_run_resumed_from', ['resumed_from_batch_run_id'])
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS idx_batch_run_resumed_from')
        await dropColumnIfExists(queryRunner, 'batch_run', 'resumed_from_batch_run_id')
    }
}
