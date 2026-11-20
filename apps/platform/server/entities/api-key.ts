import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base-entity'
import { getDateType } from '#server/database/type'

/**
 * API key（自建存储，`dfk_` 前缀）。
 *
 * - `referenceId` = 组织 id（所有查询按组织隔离）
 * - `key` 只存 SHA-256 摘要（唯一索引，便于按哈希定位）
 * - `metadata` 存 `{ scopes: ['read'] }`；明文仅在创建响应返回一次
 * - 表名 `apikey`（与历史 better-auth 插件表名保持兼容，插件已移除）
 */
@Entity('apikey')
@Index('idx_apikey_key_unique', ['key'], { unique: true })
export class ApiKey extends BaseEntity {
    @Column({ type: 'varchar', length: 32, nullable: true })
    name!: string | null

    @Column({ type: 'varchar', length: 16, nullable: true })
    start!: string | null

    @Index()
    @Column({ type: 'varchar', length: 36 })
    referenceId!: string

    @Column({ type: 'varchar', length: 32, nullable: true })
    prefix!: string | null

    @Column({ type: 'varchar', length: 64 })
    key!: string

    @Column({ type: 'boolean', default: true })
    enabled!: boolean

    @Column({ type: 'integer', default: 0 })
    requestCount!: number

    @Column({ type: getDateType(), nullable: true })
    lastRequest!: Date | null

    @Column({ type: getDateType(), nullable: true })
    expiresAt!: Date | null

    @Column({ type: 'text', nullable: true })
    metadata!: string | null
}
