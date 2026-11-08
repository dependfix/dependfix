import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * Repository 新增「仓库级跨大版本升级授权」列。
 *
 * - repository：allow_major_upgrade boolean NOT NULL DEFAULT 0（默认关闭）
 *
 * 关闭时跨 major 告警记 `cross-major` 跳过；开启后仍走完整修复 / 验证链与失败自动回滚。
 * 存量行为默认关闭（与既有平台行为一致）。
 *
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 */
export class AddRepositoryAllowMajorUpgrade3000000000001 implements MigrationInterface {
    name = 'AddRepositoryAllowMajorUpgrade3000000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const isPostgres = queryRunner.dataSource.options.type === 'postgres'
        const boolDefault = isPostgres ? 'false' : '(0)'
        await addColumnIfMissing(
            queryRunner,
            'repository',
            'allow_major_upgrade',
            `allow_major_upgrade boolean NOT NULL DEFAULT ${boolDefault}`,
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'repository', 'allow_major_upgrade')
    }
}
