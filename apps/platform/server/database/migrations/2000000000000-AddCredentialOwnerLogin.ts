/**
 * 批量导入 Resource owner 化 — Credential 表 ownerLogin 字段迁移。
 *
 * 涉及 1 张表（幂等 + 前缀感知：表名经 `entityPrefix` 解析，列缺失才 ALTER）：
 * - credential：ownerLogin (varchar 100 nullable)
 *   · fine-grained-pat（org-bound）：必填
 *   · github-app：可选，运行时可自动从 installationId 解析
 *   · classic-pat：可选，运行时通过 GET /user 自动发现
 *
 * 基线迁移已在全新库建列，本迁移按守卫重放（此前硬编码无前缀表名，非默认前缀下静默 no-op）。
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

export class AddCredentialOwnerLogin2000000000000 implements MigrationInterface {
    name = 'AddCredentialOwnerLogin2000000000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(
            queryRunner,
            'credential',
            'owner_login',
            'owner_login varchar(100)',
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'credential', 'owner_login')
    }
}
