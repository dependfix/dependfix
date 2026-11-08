import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * 仓库级执行预算与超时 + 运行预算快照列。
 *
 * - repository：execution_timeout_ms / verify_command_timeout_ms / install_timeout_ms /
 *   clone_timeout_ms（integer NULL = 继承全局）
 * - scan_run：execution_timeout_ms（integer NULL = 本列上线前的存量行，stale-cleanup 回退全局默认）
 *
 * 口径见 [repo-execution-limits.md](../../../../../docs/design/governance/repo-execution-limits.md) §4。
 *
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 */
export class AddRepositoryExecutionLimits3000000000000 implements MigrationInterface {
    name = 'AddRepositoryExecutionLimits3000000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'repository', 'execution_timeout_ms', 'execution_timeout_ms integer NULL')
        await addColumnIfMissing(queryRunner, 'repository', 'verify_command_timeout_ms', 'verify_command_timeout_ms integer NULL')
        await addColumnIfMissing(queryRunner, 'repository', 'install_timeout_ms', 'install_timeout_ms integer NULL')
        await addColumnIfMissing(queryRunner, 'repository', 'clone_timeout_ms', 'clone_timeout_ms integer NULL')
        await addColumnIfMissing(queryRunner, 'scan_run', 'execution_timeout_ms', 'execution_timeout_ms integer NULL')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'scan_run', 'execution_timeout_ms')
        await dropColumnIfExists(queryRunner, 'repository', 'clone_timeout_ms')
        await dropColumnIfExists(queryRunner, 'repository', 'install_timeout_ms')
        await dropColumnIfExists(queryRunner, 'repository', 'verify_command_timeout_ms')
        await dropColumnIfExists(queryRunner, 'repository', 'execution_timeout_ms')
    }
}
