/**
 * 平台 AI 研判配置字段迁移。
 *
 * 涉及 3 张表（幂等 + 前缀感知：表名经 `entityPrefix` 解析，列缺失才 ALTER）：
 * - organization：aiApiKeyEncrypted (text nullable) / aiProvider (varchar 32 default 'openai-compatible') /
 *                  aiModel (varchar 100 default 'deepseek-v4-flash') / aiBaseUrl (varchar 255 nullable) /
 *                  aiApiUrl (varchar 255 nullable)
 * - repository：aiEnabled (boolean default false) / aiTrigger (varchar 16 default 'both')
 * - scan_run：aiConfigSnapshot (text nullable；JSON 字符串记录本次扫描实际使用的 AI 配置，apiKey 不写入)
 *
 * 基线迁移已在全新库建全列，本迁移按守卫重放（此前硬编码无前缀表名，非默认前缀下静默 no-op）。
 *
 * 关联：[平台 AI 研判集成设计](../design/governance/platform-ai-integration.md)。
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

export class AddAiConfigFields1900000000000 implements MigrationInterface {
    name = 'AddAiConfigFields1900000000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        // organization
        await addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_api_key_encrypted',
            'ai_api_key_encrypted text',
        )
        await addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_provider',
            'ai_provider varchar(32) DEFAULT \'openai-compatible\'',
        )
        await addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_model',
            'ai_model varchar(100) DEFAULT \'deepseek-v4-flash\'',
        )
        await addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_base_url',
            'ai_base_url varchar(255)',
        )
        await addColumnIfMissing(
            queryRunner,
            'organization',
            'ai_api_url',
            'ai_api_url varchar(255)',
        )

        // repository
        await addColumnIfMissing(
            queryRunner,
            'repository',
            'ai_enabled',
            'ai_enabled boolean DEFAULT 0',
        )
        await addColumnIfMissing(
            queryRunner,
            'repository',
            'ai_trigger',
            'ai_trigger varchar(16) DEFAULT \'both\'',
        )

        // scan_run
        await addColumnIfMissing(
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
            await dropColumnIfExists(queryRunner, table, column)
        }
    }
}
