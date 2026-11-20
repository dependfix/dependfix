import { Table, TableColumn, TableIndex, type MigrationInterface, type QueryRunner } from 'typeorm'
import { getDateType } from '../type'
import { prefixedTableName } from './migration-helpers'

/**
 * v1 只读面所需的 API key 与访问日志表（自建 key 存储）。
 *
 * - `apikey`：`reference_id` = 组织 id，`key` 存 SHA-256（唯一索引）
 * - `api_request_log`：记录鉴权结论（200 / 401 / 403 / 429），不落请求体与明文
 * - 全新库由基线迁移按实体元数据建表；本迁移补存量库，`createTable(..., true)` 保证幂等
 */
export class CreateApiKeyTables3300000000000 implements MigrationInterface {
    name = 'CreateApiKeyTables3300000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const dateType = getDateType() as string
        const apiKeyTable = prefixedTableName(queryRunner, 'apikey')
        if (!(await queryRunner.hasTable(apiKeyTable))) {
            await queryRunner.createTable(new Table({
                name: apiKeyTable,
                columns: [
                    new TableColumn({ name: 'id', type: 'varchar', length: '36', isPrimary: true }),
                    new TableColumn({ name: 'name', type: 'varchar', length: '32', isNullable: true }),
                    new TableColumn({ name: 'start', type: 'varchar', length: '16', isNullable: true }),
                    new TableColumn({ name: 'reference_id', type: 'varchar', length: '36' }),
                    new TableColumn({ name: 'prefix', type: 'varchar', length: '32', isNullable: true }),
                    new TableColumn({ name: 'key', type: 'varchar', length: '64' }),
                    new TableColumn({ name: 'enabled', type: 'boolean', default: true }),
                    new TableColumn({ name: 'request_count', type: 'integer', default: 0 }),
                    new TableColumn({ name: 'last_request', type: dateType, isNullable: true }),
                    new TableColumn({ name: 'expires_at', type: dateType, isNullable: true }),
                    new TableColumn({ name: 'metadata', type: 'text', isNullable: true }),
                    new TableColumn({ name: 'created_at', type: dateType, default: 'CURRENT_TIMESTAMP' }),
                    new TableColumn({ name: 'updated_at', type: dateType, default: 'CURRENT_TIMESTAMP' }),
                ],
                indices: [
                    new TableIndex({ name: 'idx_apikey_reference', columnNames: ['reference_id'] }),
                    new TableIndex({ name: 'idx_apikey_key_unique', columnNames: ['key'], isUnique: true }),
                ],
            }), true)
        }

        const logTable = prefixedTableName(queryRunner, 'api_request_log')
        if (!(await queryRunner.hasTable(logTable))) {
            await queryRunner.createTable(new Table({
                name: logTable,
                columns: [
                    new TableColumn({ name: 'id', type: 'varchar', length: '36', isPrimary: true }),
                    new TableColumn({ name: 'api_key_id', type: 'varchar', length: '36', isNullable: true }),
                    new TableColumn({ name: 'organization_id', type: 'varchar', length: '36' }),
                    new TableColumn({ name: 'method', type: 'varchar', length: '10' }),
                    new TableColumn({ name: 'path', type: 'varchar', length: '255' }),
                    new TableColumn({ name: 'status_code', type: 'integer' }),
                    new TableColumn({ name: 'ip_address', type: 'varchar', length: '45', isNullable: true }),
                    new TableColumn({ name: 'user_agent', type: 'varchar', length: '255', isNullable: true }),
                    new TableColumn({ name: 'created_at', type: dateType, default: 'CURRENT_TIMESTAMP' }),
                    new TableColumn({ name: 'updated_at', type: dateType, default: 'CURRENT_TIMESTAMP' }),
                ],
                indices: [
                    new TableIndex({ name: 'idx_api_request_log_key_created', columnNames: ['api_key_id', 'created_at'] }),
                    new TableIndex({ name: 'idx_api_request_log_org_created', columnNames: ['organization_id', 'created_at'] }),
                ],
            }), true)
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropTable(prefixedTableName(queryRunner, 'api_request_log'), true)
        await queryRunner.dropTable(prefixedTableName(queryRunner, 'apikey'), true)
    }
}
