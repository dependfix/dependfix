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

    // better-auth 1.7 (PR #10403 "Scope account identity by trusted issuer"):
    // 账户键改为 (issuer, accountId)；issuer 必填（"This release requires Account.issuer"）。
    // credential provider 由 better-auth 内部用 createLocalAccountIssuer("credential")
    // 生成稳定 issuer 字符串；OAuth/SSO 账户则填对应 IdP issuer。nullable 是为兼容 1.6 存量数据
    // （1.7 升级指南要求先 backfill 已有账户再启用 NOT NULL；当前项目 OIDC 尚未投产，留 nullable）
    @Index()
    @Column({ type: 'text', nullable: true })
    issuer!: string | null

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
