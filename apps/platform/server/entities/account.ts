import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { getDateType } from '#server/database/type'

/** better-auth 账户表（邮箱密码凭据 / 第三方账户） */
@Entity('account')
export class Account extends BaseEntity {
    @Column({ type: 'text' })
    accountId!: string

    @Column({ type: 'text' })
    providerId!: string

    @Index()
    @Column({ type: 'varchar', length: 36 })
    userId!: string

    @Column({ type: 'text', nullable: true })
    accessToken!: string | null

    @Column({ type: 'text', nullable: true })
    refreshToken!: string | null

    @Column({ type: 'text', nullable: true })
    idToken!: string | null

    @Column({ type: getDateType(), nullable: true })
    accessTokenExpiresAt!: Date | null

    @Column({ type: getDateType(), nullable: true })
    refreshTokenExpiresAt!: Date | null

    @Column({ type: 'text', nullable: true })
    scope!: string | null

    @Column({ type: 'text', nullable: true })
    password!: string | null
}
