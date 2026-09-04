/**
 * ScanRun 新增 logsJson 字段（执行日志存储）。
 *
 * 用途：存储执行期间的结构化日志，供前端展示执行详情。
 * 格式：JSON 数组 [{timestamp, level, message, context}]
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddScanRunLogs1800000000002 implements MigrationInterface {
    name = 'AddScanRunLogs1800000000002'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE scan_run
            ADD COLUMN logs_json text
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE scan_run
            DROP COLUMN logs_json
        `)
    }
}
