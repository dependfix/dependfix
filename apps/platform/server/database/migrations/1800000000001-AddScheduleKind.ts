import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * M24.1 Phase 2：为 schedule 表新增 `kind` 字段（业务类型区分 scan / pr-check）。
 *
 * 背景（详见 docs/plan/todo.md §M24.1 关键决策 D4）：
 * 现有 Schedule 实体仅有 `selectorKind`（仓库选择策略）与 `mode`（扫描模式），
 * 无法区分"定时批量扫描"与"依赖更新 PR check 监测"两类业务；M24.1 新增 pr-check
 * 类型 schedule，需独立走 ActionStatusMonitor 链路而非 executeBatchRun。
 *
 * 兼容性策略：
 * - DEFAULT 'scan' 保证现有存量 schedule 自动回填业务类型 `scan`，应用层无需迁移脚本
 * - NOT NULL 约束：依赖 SQLite 列缺省语义，新 INSERT 时未填字段自动取默认值
 * - 历史数据保留：scan schedule 继续按原 triggerSchedule 路径执行
 *
 * 索引（与 entity 列级 @Index() 对齐）：
 * - idx_schedule_kind: [kind] — scheduler initScheduler 按 kind 过滤注册对应 handler
 *
 * 注意（TypeORM 1.x 经验教训 §3b）：复合索引必须在类级声明；本字段为单索引保留列级声明
 * （entity 列级 @Index() 单索引仅生成默认名 `IDX_<hash>_<column>`，与 migration 显式命名索引
 * 不冲突——单索引 vs 复合索引行为一致，仅命名风格不同）。
 */
export class AddScheduleKind1800000000001 implements MigrationInterface {
    name = 'AddScheduleKind1800000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE dependfix_schedule
                ADD COLUMN kind varchar(32) NOT NULL DEFAULT 'scan'
        `)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS idx_schedule_kind
                ON dependfix_schedule (kind)
        `)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS idx_schedule_kind`)
        await queryRunner.query(`
            ALTER TABLE dependfix_schedule
                DROP COLUMN kind
        `)
    }
}
