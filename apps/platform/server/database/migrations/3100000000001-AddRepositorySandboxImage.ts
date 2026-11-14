import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * Repository 新增「仓库级沙箱镜像」列。
 *
 * - repository：sandbox_image varchar(255) NULL（空 = 走平台 SANDBOX_IMAGE* / 发布沙箱镜像）
 *
 * 外置 rootless daemon 未必有平台本地镜像名，仓库级覆盖避免全局改 env。
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 */
export class AddRepositorySandboxImage3100000000001 implements MigrationInterface {
    name = 'AddRepositorySandboxImage3100000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(
            queryRunner,
            'repository',
            'sandbox_image',
            'sandbox_image varchar(255)',
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'repository', 'sandbox_image')
    }
}
