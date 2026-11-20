import { Column, Entity, Index } from 'typeorm'
import { BaseEntity } from './base-entity'

/**
 * v1 API 访问日志（设计稿 §5.4）。
 *
 * 记录每次 v1 鉴权结果：`statusCode` 是该次鉴权结论（200 允许 / 401 无效 key / 403 越权或缺少 scope /
 * 429 限流），用于 key 泄露排查与审计；不记录请求体与响应体。
 */
@Entity('api_request_log')
@Index('idx_api_request_log_key_created', ['apiKeyId', 'createdAt'])
@Index('idx_api_request_log_org_created', ['organizationId', 'createdAt'])
export class ApiRequestLog extends BaseEntity {
    /** 使用的 API key id；会话访问为 null（仅记录 key 访问） */
    @Column({ type: 'varchar', length: 36, nullable: true })
    apiKeyId!: string | null

    @Column({ type: 'varchar', length: 36 })
    organizationId!: string

    @Column({ type: 'varchar', length: 10 })
    method!: string

    @Column({ type: 'varchar', length: 255 })
    path!: string

    @Column({ type: 'integer' })
    statusCode!: number

    @Column({ type: 'varchar', length: 45, nullable: true })
    ipAddress!: string | null

    @Column({ type: 'varchar', length: 255, nullable: true })
    userAgent!: string | null
}
