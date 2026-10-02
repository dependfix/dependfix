/**
 * 平台侧暴露验证命令配置 — Repository 表 verifyCommands 字段迁移。
 *
 * 涉及 1 张表（幂等 + 前缀感知：表名经 `entityPrefix` 解析，列缺失才 ALTER）：
 * - repository：verify_commands (text nullable)
 *   · JSON 数组字符串（如 `'["pnpm install --frozen-lockfile","pnpm test"]'`）；空数组存 null
 *   · 作用：覆盖引擎默认验证链 DEFAULT_VERIFY_COMMANDS（平台发起的修复亦可追加 test 等命令）
 *
 * **表名前缀**：平台 DataSource 默认 `entityPrefix='dependfix_'`（createDataSourceOptions），
 * 而本目录早期迁移的表名处理不统一（部分硬编码前缀、部分硬编码无前缀）→ 非预期前缀组合下
 * `getTable()` 返回 undefined、迁移静默 no-op。本迁移与 `migration-helpers` 统一改为前缀感知
 * （先试 `entityPrefix + 表名`，再回退无前缀表名）。存量问题见
 * [backlog §已知边界](../../../../docs/plan/backlog.md)。
 *
 * 安全边界：该列等价于「远程命令执行面」，写入门槛由 API 层 requireRole(['admin','org_admin'])
 * 保证，变更登记 AuditEvent（verify_commands_update）留痕。
 *
 * 关联：[平台规范 §3.8](../../../../docs/standards/platform.md)。
 */

import type { MigrationInterface, QueryRunner } from 'typeorm'
import { addColumnIfMissing, dropColumnIfExists } from './migration-helpers'

export class AddRepositoryVerifyCommands2100000000000 implements MigrationInterface {
    name = 'AddRepositoryVerifyCommands2100000000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await addColumnIfMissing(queryRunner, 'repository', 'verify_commands', 'verify_commands text')
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await dropColumnIfExists(queryRunner, 'repository', 'verify_commands')
    }
}
