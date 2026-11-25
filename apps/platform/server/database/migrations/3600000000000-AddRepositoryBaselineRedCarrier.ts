import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * 仓库级基线红交付载体配置（`skip` / `issue` / `draft`，默认 `skip`）。
 *
 * 存量行取默认值 `skip`，与引擎 `DEPENDFIX_ON_BASELINE_RED` 缺省行为一致，不改既有运行结果。
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 */
export class AddRepositoryBaselineRedCarrier3600000000000 implements MigrationInterface {
    name = 'AddRepositoryBaselineRedCarrier3600000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(
            queryRunner,
            'repository',
            'baseline_red_carrier',
            'baseline_red_carrier varchar(16) NOT NULL DEFAULT \'skip\'',
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'repository', 'baseline_red_carrier')
    }
}
