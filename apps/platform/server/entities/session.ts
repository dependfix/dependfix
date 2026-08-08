import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { getDateType } from '#server/database/type'

/** better-auth 会话表（数据库持久化，30 天过期） */
@Entity('session')
export class Session extends BaseEntity {
    @Index()
    @Column({ type: getDateType() })
    expiresAt!: Date

    @Column({ type: 'text', unique: true })
    token!: string

    @Column({ type: 'text', nullable: true })
    ipAddress!: string | null

    @Column({ type: 'text', nullable: true })
    userAgent!: string | null

    @Index()
    @Column({ type: 'varchar', length: 36 })
    userId!: string

    @Column({ type: 'text', nullable: true })
    impersonatedBy!: string | null
}
