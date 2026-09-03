import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * 创建 pr_check 表（M24.1 Phase 1 落地，详见 docs/plan/todo.md §M24.1）。
 *
 * 业务定位：监测 dependfix 自身 PR + dependabot PR 的最新 `Test` check 状态，
 * 让"发出去"的修复 PR 在 CI 跑挂时通过 alerts 系统 firing 并提供 ack UI
 * （详见 docs/plan/todo.md §M24.1）。
 *
 * 字段说明（与 apps/platform/server/entities/pr-check.ts 一一对应）：
 * - repositoryId（varchar(36)，NOT NULL）：所属仓库 id（冗余列，便于复合唯一索引 + dashboard 无 JOIN 统计）
 * - prNumber（integer，NOT NULL）：PR 编号（同仓库内单调递增）
 * - headSha（varchar(40)，NOT NULL）：PR HEAD SHA（HEAD 变化时同一编号产生新行）
 * - authorLogin（varchar(100)，NOT NULL）：PR 作者 login（service 按 `dependfix[bot]` / `dependabot[bot]` 过滤目标 PR）
 * - conclusion（varchar(32)，NOT NULL DEFAULT 'pending'）：Check 结论（GitHub check_run.conclusion 取值）
 * - checkRunId（varchar(64)，NULL）：关联 check_run.id（GitHub numeric bigint，作字符串存储便于跨库兼容）
 * - detailsUrl（varchar(500)，NULL）：PR HTML 链接
 * - errorMessage（text，NULL）：CI 失败时填充的错误摘要
 * - alertFiring（boolean，NOT NULL DEFAULT 0）：是否触发 alerts firing
 * - acknowledgedAt（datetime，NULL）：用户手动 ack 时间
 * - acknowledgedByUserId（varchar(36)，NULL）：ack 操作的用户 id
 * - lastPolledAt（datetime，NOT NULL）：最近一次 polling 时间
 *
 * 索引设计（类级复合索引，TypeORM 1.x 列级复合会生成单列索引，详见 development.md §5.1.19 + §3b 教训）：
 * - idx_pr_check_repo_pr_head: [repositoryId, prNumber, headSha] UNIQUE — 同一 PR 同一 HEAD 只存最新一行
 *   （service polling INSERT/UPDATE 时 ON CONFLICT 幂等）
 * - idx_pr_check_repo_conclusion: [repositoryId, conclusion] — dashboard 活跃失败查询
 * - idx_pr_check_repo_created: [repositoryId, createdAt] — 仓库详情 PR 时间线
 * - idx_pr_check_repository_id: [repositoryId] — 单索引保留（与 ScanResult / ScanRun 同模式）
 * - idx_pr_check_author_login: [authorLogin] — service 过滤 dependfix[bot] / dependabot[bot] 时快速定位
 * - idx_pr_check_alert_firing: [alertFiring] — alerts firing 状态查询
 *
 * SQLite 限制：
 * - ALTER TABLE ADD CONSTRAINT FOREIGN KEY 不支持历史 SQLite 版本；本表不强制外键（repositoryId 仅冗余列）
 * - 时间列用 datetime 字符串（与 base-entity 的 getDateType() 兼容，PostgreSQL 需带时区）
 */
export class CreatePrCheckTable1800000000000 implements MigrationInterface {
    name = 'CreatePrCheckTable1800000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS dependfix_pr_check (
                id varchar(36) NOT NULL PRIMARY KEY,
                repositoryId varchar(36) NOT NULL,
                prNumber integer NOT NULL,
                headSha varchar(40) NOT NULL,
                authorLogin varchar(100) NOT NULL,
                conclusion varchar(32) NOT NULL DEFAULT 'pending',
                checkRunId varchar(64),
                detailsUrl varchar(500),
                errorMessage text,
                alertFiring boolean NOT NULL DEFAULT (0),
                acknowledgedAt datetime,
                acknowledgedByUserId varchar(36),
                lastPolledAt datetime NOT NULL,
                createdAt datetime NOT NULL,
                updatedAt datetime NOT NULL
            )
        `)
        // 类级复合索引（TypeORM 1.x 列级复合 @Index([...]) 会生成单列索引，迁移必须显式声明）
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_check_repo_pr_head
                ON dependfix_pr_check (repositoryId, prNumber, headSha)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pr_check_repo_conclusion
                ON dependfix_pr_check (repositoryId, conclusion)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pr_check_repo_created
                ON dependfix_pr_check (repositoryId, createdAt)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pr_check_repository_id
                ON dependfix_pr_check (repositoryId)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pr_check_author_login
                ON dependfix_pr_check (authorLogin)
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_pr_check_alert_firing
                ON dependfix_pr_check (alertFiring)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_check_alert_firing`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_check_author_login`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_check_repository_id`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_check_repo_created`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_check_repo_conclusion`)
        await queryRunner.query(`DROP INDEX IF EXISTS idx_pr_check_repo_pr_head`)
        await queryRunner.query(`DROP TABLE IF EXISTS dependfix_pr_check`)
    }
}
