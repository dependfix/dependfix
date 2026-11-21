import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { BaseEntity } from './base-entity'

/** 批量运行触发来源 */
export type BatchRunSource = 'scheduled' | 'manual'

/** 批量运行整体状态（终态判定：下属 ScanRun 全部到达终态即 completed，含部分失败） */
export type BatchRunStatus = 'running' | 'completed' | 'failed'

/**
 * 批量运行聚合：一次定时触发或手动批量触发产生的多仓库扫描汇总。
 * 关联语义：BatchRun 1 — N ScanRun（ScanRun.batchRunId 反向关联，不加载关系避免 N+1）。
 * 聚合更新双通道：详情接口 GET /api/batch-runs/[id] 实时聚合写回（用户查看时收敛）+
 * 周期兜底对账（batch-reconciler.ts，收敛未被查看的批次），
 * 见 docs/design/governance/platform-scheduled-batch.md §5.2。
 */
@Entity('batch_run')
export class BatchRun extends BaseEntity {
    /** 触发来源 */
    @Index()
    @Column({ type: 'varchar', length: 32 })
    source!: BatchRunSource

    /** 关联的 Schedule id（source=scheduled 时；manual 时为 null） */
    @Column({ type: 'varchar', length: 36, nullable: true })
    scheduleId!: string | null

    /** 触发者用户 id（手动批量触发写入；定时 / 系统为 null）。 */
    @Column({ type: 'varchar', length: 36, nullable: true, name: 'triggered_by_user_id' })
    triggeredByUserId!: string | null

    /** 扫描模式 */
    @Column({ type: 'varchar', length: 32 })
    mode!: string

    /** 严重级别阈值 */
    @Column({ type: 'varchar', length: 32 })
    severityThreshold!: string

    /** 目标仓库总数 */
    @Column({ type: 'int', default: 0 })
    repositoryCount!: number

    /** 已到达终态数（completed + failed + dispatched） */
    @Column({ type: 'int', default: 0 })
    finishedCount!: number

    /** 成功数（completed） */
    @Column({ type: 'int', default: 0 })
    completedCount!: number

    /** 失败数（failed） */
    @Column({ type: 'int', default: 0 })
    failedCount!: number

    /** 进行中数（pending + running） */
    @Column({ type: 'int', default: 0 })
    pendingCount!: number

    /** 跨仓库聚合统计（JSON：{ alertsTotal, severityCounts, fixedCount }） */
    @Column({ type: 'text', nullable: true })
    summaryJson!: string | null

    /**
     * 续跑来源批次 id（「继续执行未完成项」派生批次；原始批次为 null）。
     *
     * 消费方：批次列表 / 详情展示来源链路，审计事件同时记录；不建外键（批次可被清理）。
     */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true, name: 'resumed_from_batch_run_id' })
    resumedFromBatchRunId!: string | null

    /** 批量运行整体状态 */
    @Index()
    @Column({ type: 'varchar', length: 32, default: 'running' })
    status!: BatchRunStatus

    @Column({ type: 'datetime', nullable: true })
    finishedAt!: Date | null

    /**
     * 所属组织 id（物理可空列，应用层强制非空——触发路径填充，与 Repository 模式一致；
     * 权限隔离：列表/详情按当前组织过滤）
     */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    organizationId!: string | null
}
