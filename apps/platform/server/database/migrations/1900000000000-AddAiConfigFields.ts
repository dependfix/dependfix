/**
 * M25.2a AI 研判配置字段迁移。
 *
 * 涉及 3 张表（幂等处理：检查表 / 列存在性后再 ALTER）：
 * - organization：aiApiKeyEncrypted (text nullable) / aiProvider (varchar 32 default 'openai-compatible') /
 *                  aiModel (varchar 100 default 'deepseek-v4-flash') / aiBaseUrl (varchar 255 nullable) /
 *                  aiApiUrl (varchar 255 nullable)
 * - repository：aiEnabled (boolean default false) / aiTrigger (varchar 16 default 'both')
 * - scan_run：aiConfigSnapshot (text nullable；JSON 字符串记录本次扫描实际使用的 AI 配置，apiKey 不写入)
 *
 * 关联：[docs/design/governance/platform-ai-integration.md §5](../design/governance/platform-ai-integration.md)
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddAiConfigFields1900000000000 implements MigrationInterface {
    name = 'AddAiConfigFields1900000000000'

    private async addColumnIfMissing(
        queryRunner: QueryRunner,
        tableName: string,
        columnName: string,
        ddl: string,
    ): Promise<void> {
        const table = await queryRunner.getTable(tableName)
        if (!table) {
            return
        }
        const hasColumn = table.columns.some((c) => c.name === columnName)
        if (hasColumn) {
            return
        }
        await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN ${ddl}`)
    }

    async up(queryRunner: QueryRunner): Promise<void> {
        // organization
        await this.addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_api_key_encrypted',
            'ai_api_key_encrypted text',
        )
        await this.addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_provider',
            'ai_provider varchar(32) DEFAULT \'openai-compatible\'',
        )
        await this.addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_model',
            'ai_model varchar(100) DEFAULT \'deepseek-v4-flash\'',
        )
        await this.addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_base_url',
            'ai_base_url varchar(255)',
        )
        await this.addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_api_url',
            'ai_api_url varchar(255)',
        )

        // repository
        await this.addColumnIfMissing(
            queryRunner,
            'repository',
            'ai_enabled',
            'ai_enabled boolean DEFAULT 0',
        )
        await this.addColumnIfMissing(
            queryRunner,
            'repository',
            'ai_trigger',
            'ai_trigger varchar(16) DEFAULT \'both\'',
        )

        // scan_run
        await this.addColumnIfMissing(
            queryRunner,
            'scan_run',
            'ai_config_snapshot',
            'ai_config_snapshot text',
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        for (const [table, column] of [
            ['organization', 'ai_api_key_encrypted'],
            ['organization', 'ai_provider'],
            ['organization', 'ai_model'],
            ['organization', 'ai_base_url'],
            ['organization', 'ai_api_url'],
            ['repository', 'ai_enabled'],
            ['repository', 'ai_trigger'],
            ['scan_run', 'ai_config_snapshot'],
        ] as const) {
            const t = await queryRunner.getTable(table)
            if (!t) {
                continue
            }
            const hasColumn = t.columns.some((c) => c.name === column)
            if (!hasColumn) {
                continue
            }
            await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN ${column}`)
        }
    }
}
