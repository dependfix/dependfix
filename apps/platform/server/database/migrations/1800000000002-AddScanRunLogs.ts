/**
 * ScanRun 新增 logsJson 字段（执行日志存储）。
 *
 * 用途：存储执行期间的结构化日志，供前端展示执行详情。
 * 格式：JSON 数组 [{timestamp, level, message, context}]
 *
 * 幂等 + 前缀感知：基线迁移已在全新库建列；本迁移按「表存在 + 列缺失」守卫重放，
 * 表名经 `entityPrefix` 解析（此前硬编码无前缀 `scan_run`，非默认前缀下静默 no-op）。
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

export class AddScanRunLogs1800000000002 implements MigrationInterface {
    name = 'AddScanRunLogs1800000000002'

    async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'scan_run', 'logs_json', 'logs_json text')
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'scan_run', 'logs_json')
    }
}
