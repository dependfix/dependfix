import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { BaseEntity } from './base-entity'

/** 仓库选择策略（定时计划触发时按策略解析目标仓库列表） */
export type ScheduleSelectorKind = 'all' | 'organization' | 'tag' | 'explicit'

/**
 * 计划业务类型（详见 docs/plan/todo.md §M24.1 关键决策 D4）：
 * - `scan`：定时批量扫描（原有模式，所有现有 schedule 默认为此值）
 * - `pr-check`：依赖更新 PR check 状态监测（M24.1 新增，按 kind 走 ActionStatusMonitor 链路而非 executeBatchRun）
 *
 * 兼容性：现有存量数据通过 migration 1800000000001-AddScheduleKind 自动回填 `scan`，
 * 应用层无需手动迁移。
 */
export type ScheduleKind = 'scan' | 'pr-check'

export const SCHEDULE_KINDS: readonly ScheduleKind[] = ['scan', 'pr-check'] as const

/**
 * 定时扫描计划（控制面配置，到点由调度器触发批量扫描）。
 * 调度机制双模（async 用 BullMQ upsertJobScheduler / sync 降级用 node-cron），
 * 见 docs/design/governance/platform-scheduled-batch.md §4。
 */
@Entity('schedule')
export class Schedule extends BaseEntity {
    /**
     * 计划业务类型（详见 docs/plan/todo.md §M24.1 关键决策 D4）。
     * 默认 `scan`（向后兼容现有 schedule）；`pr-check` 走 ActionStatusMonitor 链路。
     *
     * 索引由 migration 1800000000001 显式 CREATE INDEX 提供（idx_schedule_kind），
     * 避免 synchronize=true 路径下与列级 @Index() 默认名生成重复索引（与 PRCheck W1 教训同模式）。
     */
    @Column({ type: 'varchar', length: 32, default: 'scan' })
    kind!: ScheduleKind

    /** 计划名称（用户可读） */
    @Column({ type: 'varchar', length: 100 })
    name!: string

    /** cron 表达式（5 段或 6 段，cron-parser 校验） */
    @Column({ type: 'varchar', length: 100 })
    cron!: string

    /** 时区（IANA 名称，如 Asia/Shanghai；null 用服务器本地时区） */
    @Column({ type: 'varchar', length: 50, nullable: true })
    timezone!: string | null

    /** 仓库选择策略 */
    @Index()
    @Column({ type: 'varchar', length: 32 })
    selectorKind!: ScheduleSelectorKind

    /**
     * 选择策略参数（JSON 字符串，按 selectorKind 语义化）：
     * - all: {}
     * - organization: { organizationId: string }
     * - tag: { tag: string }
     * - explicit: { repositoryIds: string[] }
     */
    @Column({ type: 'text', nullable: true })
    selectorJson!: string | null

    /** 扫描模式（report-only / fix / fix-and-pr） */
    @Column({ type: 'varchar', length: 32, default: 'report-only' })
    mode!: string

    /** 严重级别阈值 */
    @Column({ type: 'varchar', length: 32, default: 'high' })
    severityThreshold!: string

    /** 启用/禁用（禁用时调度器注销对应任务） */
    @Index()
    @Column({ type: 'boolean', default: true })
    enabled!: boolean

    /** 最近触发时间（调度器触发后回填） */
    @Column({ type: 'datetime', nullable: true })
    lastTriggeredAt!: Date | null

    /** 最近触发创建的 BatchRun id */
    @Column({ type: 'varchar', length: 36, nullable: true })
    lastBatchRunId!: string | null

    /**
     * 所属组织 id（物理可空列：存量库 ALTER TABLE 无法加无默认值 NOT NULL 列；
     * 应用层强制非空——创建路径经 resolveOrganizationId 填充，与 Repository 模式一致）
     */
    @Index()
    @Column({ type: 'varchar', length: 36, nullable: true })
    organizationId!: string | null
}
