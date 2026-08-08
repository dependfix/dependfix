import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { Credential } from './credential'

/** 仓库托管平台（当前仅 GitHub） */
export type RepositoryPlatform = 'github'

/** 目标仓库（平台控制面记录，数据面执行由 Executor 承担） */
@Entity('repository')
export class Repository extends BaseEntity {
    @Column({ type: 'varchar', length: 100 })
    owner!: string

    @Column({ type: 'varchar', length: 100 })
    name!: string

    /** owner/name/platform 组合唯一（同一平台同一仓库只允许一条记录） */
    @Index(['owner', 'name', 'platform'], { unique: true })
    @Column({ type: 'varchar', length: 32, default: 'github' })
    platform!: RepositoryPlatform

    @Column({ type: 'varchar', length: 100, default: 'main' })
    defaultBranch!: string

    /** 包管理器（默认 pnpm；支持 pnpm/npm/yarn） */
    @Column({ type: 'varchar', length: 32, default: 'pnpm' })
    packageManager!: string

    /** 关联凭据（可选：扫描依赖 GitHub API 时需要，如 Dependabot alerts） */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    credentialId!: string | null

    /** 关联凭据实体（仅查询时加载，不参与写入） */
    @ManyToOne(() => Credential, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'credential_id' })
    credential!: Credential | null

    /**
     * 目标 workflow 文件名（仓库内相对路径，如 `.github/workflows/security-auto-fix.yml`）。
     * ActionTriggerExecutor（B 模式）触发 `workflow_dispatch` 时使用；
     * 未配置则平台走容器内执行（A 模式，默认）。
     */
    @Column({ type: 'varchar', length: 255, nullable: true })
    actionWorkflowFile!: string | null

    /** 执行后端（默认 container；配置 actionWorkflowFile 后可切换 github-action） */
    @Column({ type: 'varchar', length: 32, default: 'container' })
    executorKind!: string

    /** 备注（可选） */
    @Column({ type: 'text', nullable: true })
    note!: string | null

    /** 最近扫描时间（扫描任务回填） */
    @Column({ type: 'datetime', nullable: true })
    lastScanAt!: Date | null
}
