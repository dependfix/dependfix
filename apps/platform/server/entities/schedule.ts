import {
    Column,
    Entity,
    Index,
} from 'typeorm'
import { BaseEntity } from './base-entity'

/** 仓库选择策略（定时计划触发时按策略解析目标仓库列表） */
export type ScheduleSelectorKind = 'all' | 'organization' | 'tag' | 'explicit'

/**
 * 定时扫描计划（控制面配置，到点由调度器触发批量扫描）。
 * 调度机制双模（async 用 BullMQ upsertJobScheduler / sync 降级用 node-cron），
 * 见 docs/design/governance/platform-scheduled-batch.md §4。
 */
@Entity('schedule')
export class Schedule extends BaseEntity {
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
