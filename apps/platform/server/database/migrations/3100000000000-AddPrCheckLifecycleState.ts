import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, createIndexIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * PRCheck 新增 PR 生命周期列（口径见
 * [pr-build-deploy-signals.md §3.11](../../../../docs/design/governance/pr-build-deploy-signals.md)）。
 *
 * 涉及 1 张表（幂等 + 前缀感知：表名经 `entityPrefix` 解析，列 / 索引缺失才创建）：
 * - pr_check：pr_state (varchar(16) NOT NULL DEFAULT 'unknown') — open / closed / merged / unknown
 * - idx_pr_check_repo_pr_state (repository_id, pr_state) — 生命周期候选项查询
 *
 * **存量行默认 `unknown`**（不臆造为 `open`）：下一次轮询会用 open 快照或生命周期解析回填；
 * 解析完成前按 fail-open 继续参与 firing 统计，视图标注「未知」。
 *
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 */
export class AddPrCheckLifecycleState3100000000000 implements MigrationInterface {
    name = 'AddPrCheckLifecycleState3100000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(
            queryRunner,
            'pr_check',
            'pr_state',
            `pr_state varchar(16) NOT NULL DEFAULT 'unknown'`,
        )
        await createIndexIfMissing(
            queryRunner,
            'pr_check',
            'idx_pr_check_repo_pr_state',
            ['repository_id', 'pr_state'],
        )
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS idx_pr_check_repo_pr_state')
        await dropColumnIfExists(queryRunner, 'pr_check', 'pr_state')
    }
}
