import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * Provider 日志富化所需列（口径见
 * [pr-build-deploy-signals.md §3.12](../../../../docs/design/governance/pr-build-deploy-signals.md)）。
 *
 * 涉及 2 张表（幂等 + 前缀感知：表名经 `entityPrefix` 解析，列缺失才创建）：
 * - repository：`vercel_project_id` / `cloudflare_account_id` / `cloudflare_worker_tag`
 *   （仓库级目标；全部 NULL = 该 provider 不启用日志富化，采集零请求）
 * - pr_check：`provider_logs_json`（失败详情的日志尾部或不可用原因；成功 / pending 清空）
 *
 * 存量行全部为 NULL，不回溯历史 PR；下一次失败轮询自然回填。
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 */
export class AddProviderLogTargets3500000000000 implements MigrationInterface {
    name = 'AddProviderLogTargets3500000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'repository', 'vercel_project_id', 'vercel_project_id varchar(64) NULL')
        await addColumnIfMissing(queryRunner, 'repository', 'cloudflare_account_id', 'cloudflare_account_id varchar(64) NULL')
        await addColumnIfMissing(queryRunner, 'repository', 'cloudflare_worker_tag', 'cloudflare_worker_tag varchar(128) NULL')
        await addColumnIfMissing(queryRunner, 'pr_check', 'provider_logs_json', 'provider_logs_json text NULL')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'pr_check', 'provider_logs_json')
        await dropColumnIfExists(queryRunner, 'repository', 'cloudflare_worker_tag')
        await dropColumnIfExists(queryRunner, 'repository', 'cloudflare_account_id')
        await dropColumnIfExists(queryRunner, 'repository', 'vercel_project_id')
    }
}
