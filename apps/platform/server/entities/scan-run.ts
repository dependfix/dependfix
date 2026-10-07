import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import type { RunFailureKind, RunFailureStage } from '../services/run-failure-classify'
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

    /**
     * 失败归一化码（`failure_code`）：原始 `error.code` 或引擎 `FixError.category`，
     * 便于审计；非失败终态为 null。见 [run-failure-taxonomy.md §5.2](../design/governance/run-failure-taxonomy.md)。
     */
    @Column({ type: 'varchar', length: 64, nullable: true })
    failureCode!: string | null

    /** 失败阶段（`failure_stage`）：source / clone / install / fix / verify / deliver / runtime / cleanup / unknown */
    @Column({ type: 'varchar', length: 32, nullable: true })
    failureStage!: RunFailureStage | null

    /** 处置建议（`failure_kind`）：transient（可重试）/ deterministic（需研判）/ unknown */
    @Column({ type: 'varchar', length: 16, nullable: true })
    failureKind!: RunFailureKind | null

    /** 执行日志（JSON 数组：[{timestamp, level, message, context}]） */
    @Column({ type: 'text', nullable: true })
    logsJson!: string | null

    /**
     * AI 研判配置快照（JSON 字符串）
     * - 记录本次扫描实际使用的 AI 配置：{ enabled, provider, model, baseUrl?, apiUrl?, trigger, hasApiKey }
     * - apiKey 不写入快照（避免日志/审计泄露）；hasApiKey 布尔代替
     * - 用于审计 + run-history 聚合（参见 [platform-ai-integration.md §8.3](../design/governance/platform-ai-integration.md)）
     */
    @Column({ type: 'text', nullable: true, name: 'ai_config_snapshot' })
    aiConfigSnapshot!: string | null

    /** B 模式：action run 页面 URL（触发后轮询定位） */
    @Column({ type: 'varchar', length: 500, nullable: true })
    runUrl!: string | null

    /** 所属批量运行 id（定时/批量触发时关联；单独手动触发为 null） */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    batchRunId!: string | null
}
