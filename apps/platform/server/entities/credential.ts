import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { Organization } from './organization'

/**
 * 凭据类型：GitHub 访问凭据。
 * - classic-pat：经典 PAT（全仓库级，scope 由 token 自身决定）
 * - fine-grained-pat：细粒度 PAT（按仓库授权，权限最小化）
 * - github-app：GitHub App（installation token 模式；M18.3 接入实施，详见 docs/design/governance/c22-pat-backward-compat.md §4.5）
 */
export type CredentialType = 'classic-pat' | 'fine-grained-pat' | 'github-app'

/** 凭据类型枚举（API 校验用） */
export const CREDENTIAL_TYPES: readonly CredentialType[] = [
    'classic-pat',
    'fine-grained-pat',
    'github-app',
] as const

/** GitHub 平台凭据：token 加密存储（AES-256-GCM，ENCRYPTION_KEY 平台级密钥） */
@Entity('credential')
export class Credential extends BaseEntity {
    /**
     * 所属组织 id（物理可空列：存量库 ALTER TABLE 无法加无默认值 NOT NULL 列；
     * 应用层强制非空——创建路径经 resolveOrganizationId 填充，初始化时存量数据统一挂默认组织）
     */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    organizationId!: string | null

    /** 所属组织实体（仅查询时加载，不参与写入） */
    @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization | null

    /** 展示名称（用户可辨识，如 "dependfix-bot"） */
    @Column({ type: 'varchar', length: 100 })
    name!: string

    @Index()
    @Column({ type: 'varchar', length: 32 })
    type!: CredentialType

    /**
     * 加密后的 token（AES-256-GCM）。
     * 格式：`{iv}.{authTag}.{ciphertext}`（均为 base64）。
     * 解密仅在执行时 worker 内存中进行，用后即弃（见 security.md）。
     *
     * PAT 路径（type='classic-pat' / 'fine-grained-pat'）使用；
     * GitHub App 路径（type='github-app'）下为空字符串，由 `encryptedPrivateKey` 替代。
     */
    @Column({ type: 'text' })
    encryptedToken!: string

    // ----- GitHub App 路径字段（M18.3 接入）-----

    /** GitHub App ID（公开信息，明文存储；type='github-app' 时必填） */
    @Column({ type: 'varchar', length: 32, nullable: true })
    appId!: string | null

    /** 加密后的 PEM 私钥（AES-256-GCM；type='github-app' 时必填，PAT 路径下为空） */
    @Column({ type: 'text', nullable: true })
    encryptedPrivateKey!: string | null

    /** Installation ID（公开信息，明文存储；type='github-app' 时必填） */
    @Column({ type: 'varchar', length: 32, nullable: true })
    installationId!: string | null

    /** Bot 用户名（用于 commit author 动态生成；type='github-app' 时可选） */
    @Column({ type: 'varchar', length: 128, nullable: true })
    botLogin!: string | null

    /** 备注（可选） */
    @Column({ type: 'text', nullable: true })
    note!: string | null

    /** 最近使用时间（审计辅助，可选填） */
    @Column({ type: 'datetime', nullable: true })
    lastUsedAt!: Date | null
}
