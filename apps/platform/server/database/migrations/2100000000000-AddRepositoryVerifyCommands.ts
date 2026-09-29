/**
 * 平台侧暴露验证命令配置 — Repository 表 verifyCommands 字段迁移。
 *
 * 涉及 1 张表（幂等处理：检查列存在性后再 ALTER）：
 * - repository：verify_commands (text nullable)
 *   · JSON 数组字符串（如 `'["pnpm install --frozen-lockfile","pnpm test"]'`）；空数组存 null
 *   · 作用：覆盖引擎默认验证链 DEFAULT_VERIFY_COMMANDS（平台发起的修复亦可追加 test 等命令）
 *
 * **表名前缀（与既有迁移的差异，刻意为之）**：平台 DataSource 默认 `entityPrefix='dependfix_'`
 * （createDataSourceOptions），而本目录早期的迁移（AddAiConfigFields / AddCredentialOwnerLogin 等）
 * 硬编码无前缀表名 `repository` / `credential` / `organization` → 在默认前缀下 `getTable()` 返回
 * undefined，迁移静默 no-op（既有问题，已登记 backlog §已知边界）。本迁移改为**前缀感知**：
 * 先按 `connection.options.entityPrefix + 表名` 查找，再回退无前缀表名，保证在默认前缀下真正生效。
 *
 * 安全边界：该列等价于「远程命令执行面」，写入门槛由 API 层 requireRole(['admin','org_admin'])
 * 保证，变更登记 AuditEvent（verify_commands_update）留痕。
 *
 * 关联：docs/plan/todo.md §M32.1 + docs/standards/platform.md §3.8
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddRepositoryVerifyCommands2100000000000 implements MigrationInterface {
    name = 'AddRepositoryVerifyCommands2100000000000'

    /**
     * 解析实际表名：优先 `entityPrefix + 基础表名`（平台默认 `dependfix_`），回退无前缀表名。
     * 表不存在（更早版本尚未建表 / 前缀不匹配）时返回 null，由调用方按 no-op 处理。
     */
    private async resolveTableName(queryRunner: QueryRunner, baseName: string): Promise<string | null> {
        const prefix = queryRunner.dataSource.options.entityPrefix ?? ''
        const candidates = prefix ? [`${prefix}${baseName}`, baseName] : [baseName]
        for (const name of candidates) {
            const table = await queryRunner.getTable(name)
            if (table) {
                return table.name
            }
        }
        return null
    }

    async up(queryRunner: QueryRunner): Promise<void> {
        const tableName = await this.resolveTableName(queryRunner, 'repository')
        if (!tableName) {
            return
        }
        const table = await queryRunner.getTable(tableName)
        if (table?.columns.some((c) => c.name === 'verify_commands')) {
            return
        }
        await queryRunner.query(`ALTER TABLE ${tableName} ADD COLUMN verify_commands text`)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const tableName = await this.resolveTableName(queryRunner, 'repository')
        if (!tableName) {
            return
        }
        const table = await queryRunner.getTable(tableName)
        if (!table?.columns.some((c) => c.name === 'verify_commands')) {
            return
        }
        await queryRunner.query(`ALTER TABLE ${tableName} DROP COLUMN verify_commands`)
    }
}
