/**
 * M26.2 C67 批量导入 Resource owner 化 — Credential 表 ownerLogin 字段迁移。
 *
 * 涉及 1 张表（幂等处理：检查列存在性后再 ALTER）：
 * - credential：ownerLogin (varchar 100 nullable)
 *   · fine-grained-pat（org-bound）：必填
 *   · github-app：可选，运行时可自动从 installationId 解析
 *   · classic-pat：可选，运行时通过 GET /user 自动发现
 *
 * 关联：[docs/plan/todo.md §M26.2](../../plan/todo.md) + [backlog.md §C67](../../plan/backlog.md)
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'

export class AddCredentialOwnerLogin2000000000000 implements MigrationInterface {
    name = 'AddCredentialOwnerLogin2000000000000'

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
        await this.addColumnIfMissing(
            queryRunner,
            'credential',
            'owner_login',
            'owner_login varchar(100)',
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('credential')
        if (!table) {
            return
        }
        const hasColumn = table.columns.some((c) => c.name === 'owner_login')
        if (!hasColumn) {
            return
        }
        await queryRunner.query('ALTER TABLE credential DROP COLUMN owner_login')
    }
}
