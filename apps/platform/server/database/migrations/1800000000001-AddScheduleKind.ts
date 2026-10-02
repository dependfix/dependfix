import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, createIndexIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * 为 schedule 表新增 `kind` 字段（业务类型区分 scan / pr-check）。
 *
 * 背景：Schedule 实体原有 `selectorKind`（仓库选择策略）与 `mode`（扫描模式），无法区分
 * 「定时批量扫描」与「依赖更新 PR check 监测」两类业务；本迁移新增 pr-check 类型 schedule，
 * 独立走 ActionStatusMonitor 链路而非 executeBatchRun。
 *
 * 兼容性策略：
 * - DEFAULT 'scan' 保证存量 schedule 自动回填业务类型 `scan`，应用层无需迁移脚本
 * - NOT NULL 约束：依赖 SQLite 列缺省语义，新 INSERT 时未填字段自动取默认值
 * - 历史数据保留：scan schedule 继续按原 triggerSchedule 路径执行
 *
 * 索引：`idx_schedule_kind`（scheduler initScheduler 按 kind 过滤注册对应 handler）。
 * 基线迁移已在全新库建列（及实体元数据单列索引），本迁移按守卫重放并**按列集合去重**，
 * 避免与实体元数据索引重复；表名经 `entityPrefix` 解析（前缀感知）。
 */
export class AddScheduleKind1800000000001 implements MigrationInterface {
    name = 'AddScheduleKind1800000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(
            queryRunner,
            'schedule',
            'kind',
            'kind varchar(32) NOT NULL DEFAULT \'scan\'',
        )
        await createIndexIfMissing(queryRunner, 'schedule', 'idx_schedule_kind', ['kind'])
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query('DROP INDEX IF EXISTS idx_schedule_kind')
        await dropColumnIfExists(queryRunner, 'schedule', 'kind')
    }
}
