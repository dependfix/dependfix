import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { Repository } from './repository'

/** 扫描运行状态 */
export type ScanRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'dispatched' | 'degraded'

/** 扫描运行状态枚举（API 校验用） */
export const SCAN_RUN_STATUSES: readonly ScanRunStatus[] = [
    'pending',
    'running',
    'completed',
    'failed',
    'dispatched',
    'degraded',
] as const

/** 扫描运行记录：一次扫描请求（同步执行模型 Q2，请求内完成） */
@Entity('scan_run')
export class ScanRun extends BaseEntity {
    @Index()
    @Column({ type: 'varchar', length: 36 })
    repositoryId!: string

    @ManyToOne(() => Repository, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'repository_id' })
    repository!: Repository | null

    /** 执行模式（report-only / fix / fix-and-pr） */
    @Column({ type: 'varchar', length: 32 })
    mode!: string

    /** 严重级别阈值 */
    @Column({ type: 'varchar', length: 32 })
    severityThreshold!: string

    /** 执行后端（container / github-action） */
    @Column({ type: 'varchar', length: 32, default: 'container' })
    executorKind!: string

    @Index()
    @Column({ type: 'varchar', length: 32 })
    status!: ScanRunStatus

    @Column({ type: 'datetime', nullable: true })
    startedAt!: Date | null

    @Column({ type: 'datetime', nullable: true })
    finishedAt!: Date | null

    /** 汇总统计（JSON：{repositoriesScanned, alertsFound, alertsFixed, ...}） */
    @Column({ type: 'text', nullable: true })
    summaryJson!: string | null

    /** 执行级错误（executor error.code/message，非业务失败） */
    @Column({ type: 'text', nullable: true })
    errorJson!: string | null

    /** 执行日志（JSON 数组：[{timestamp, level, message, context}]） */
    @Column({ type: 'text', nullable: true })
    logsJson!: string | null

    /** B 模式：action run 页面 URL（触发后轮询定位） */
    @Column({ type: 'varchar', length: 500, nullable: true })
    runUrl!: string | null

    /** 所属批量运行 id（定时/批量触发时关联；单独手动触发为 null） */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    batchRunId!: string | null
}
