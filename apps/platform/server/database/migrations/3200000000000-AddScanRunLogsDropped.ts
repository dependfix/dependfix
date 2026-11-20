import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

/**
 * ScanRun 新增「采集侧日志丢弃数」列。
 *
 * 幂等 + 前缀感知：表名经 `entityPrefix` 解析，列缺失才 ALTER。
 * 三态语义：`NULL` = 未采集 / 不可知（存量行、github-action 执行器）；`0` = 确认未丢；`> 0` = 丢弃 N 条。
 * **列名必须用 snake_case**：raw SQL 走 `queryRunner.query()` 不经过 `SnakeCaseNamingStrategy`。
 *
 * 口径见 [platform-public-api.md §6.4](../../../../../docs/design/governance/platform-public-api.md#64-日志查询digest-契约)。
 */
export class AddScanRunLogsDropped3200000000000 implements MigrationInterface {
    name = 'AddScanRunLogsDropped3200000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'scan_run', 'logs_dropped', 'logs_dropped integer NULL')
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'scan_run', 'logs_dropped')
    }
}
