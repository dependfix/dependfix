/**
 * ScanRun 新增 logsJson 字段（执行日志存储）。
 *
 * 用途：存储执行期间的结构化日志，供前端展示执行详情。
 * 格式：JSON 数组 [{timestamp, level, message, context}]
 *
 * 幂等处理：表不存在时跳过（scan_run 由 synchronize 创建，非迁移）。
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddScanRunLogs1800000000002 implements MigrationInterface {
    name = 'AddScanRunLogs1800000000002'

    async up(queryRunner: QueryRunner): Promise<void> {
        // 幂等：检查表是否存在
        const table = await queryRunner.getTable('scan_run')
        if (!table) {
            // scan_run 表不存在（由 synchronize 创建），跳过
            return
        }

        // 检查列是否已存在
        const hasColumn = table.columns.some((c) => c.name === 'logs_json')
        if (hasColumn) {
            return
        }

        await queryRunner.query(`
            ALTER TABLE scan_run
            ADD COLUMN logs_json text
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('scan_run')
        if (!table) {
            return
        }

        const hasColumn = table.columns.some((c) => c.name === 'logs_json')
        if (!hasColumn) {
            return
        }

        await queryRunner.query(`
            ALTER TABLE scan_run
            DROP COLUMN logs_json
        `)
    }
}
