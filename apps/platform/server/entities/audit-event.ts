import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { Repository } from './repository'
import { ScanRun } from './scan-run'

/**
 * 环境/容器审计事件类型。
 * 触发源：
 * - sandbox_unavailable：sandbox.execute 抛 errno（B 场景运行时失败）
 * - sandbox_degraded：scan-orchestrator 产出的 degradedReason（A 场景 sandbox 启动降级）
 * - docker_daemon_down：docker daemon 全局不可用（预扩展，当前未自动触发，后续可加 sandbox-executor 启动期探测）
 *
 * 类型扩展点：未来可加 `cgroup_limit_hit` / `runtime_swap` 等
 * （保持小写 snake_case，便于 SQL 过滤与 i18n 键对齐）。
 */
export type AuditEventType =
    | 'sandbox_unavailable'
    | 'sandbox_degraded'
    | 'docker_daemon_down'

/** 审计事件类型枚举（API 校验用） */
export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
    'sandbox_unavailable',
    'sandbox_degraded',
    'docker_daemon_down',
] as const

/** 审计事件严重级别（与 alerts.severity 解耦：审计事件是系统信号，告警是业务信号） */
export type AuditEventSeverity = 'info' | 'warn' | 'error' | 'critical'

/** 审计事件严重级别枚举 */
export const AUDIT_EVENT_SEVERITIES: readonly AuditEventSeverity[] = [
    'info',
    'warn',
    'error',
    'critical',
] as const

/**
 * 环境/容器审计事件。
 * 用途：持久化 sandbox 启动/运行时的环境变化信号，供 env-events 视图查询 + 通知渠道消费。
 *
 * 索引设计：
 * - 类级复合索引 `[type, createdAt]`：按类型 + 时间范围查询（env-events 过滤面板）
 * - 类级复合索引 `[repositoryId, createdAt]`：按仓库 + 时间范围查询（仓库详情页）
 * - 列级单索引 `createdAt`：跨类型时间排序（最近事件列表）
 *
 * 注意（TypeORM 1.x 经验教训 §3b）：复合索引必须在类级声明，
 * 列级 `@Index(['col1', 'col2'])` 会被解析为单列索引，e2e 二次运行时会暴露第二个仓库的 500 错误。
 */
@Entity('audit_event')
@Index('idx_audit_event_type_created', ['type', 'createdAt'])
@Index('idx_audit_event_repo_created', ['repositoryId', 'createdAt'])
export class AuditEvent extends BaseEntity {
    /** 事件类型（env 变化信号） */
    @Column({ type: 'varchar', length: 64 })
    type!: AuditEventType

    /** 严重级别（系统信号级别，区别于 alerts.severity 业务信号） */
    @Column({ type: 'varchar', length: 16 })
    severity!: AuditEventSeverity

    /** 关联仓库 id（可空：全局环境事件如 docker daemon 整体不可用时不挂具体仓库） */
    @Column({ type: 'varchar', length: 36, nullable: true })
    repositoryId!: string | null

    @ManyToOne(() => Repository, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'repository_id' })
    repository!: Repository | null

    /** 关联 scan run id（可空：环境事件不一定伴随 scan run，如预检/启动期探测） */
    @Column({ type: 'varchar', length: 36, nullable: true })
    scanRunId!: string | null

    @ManyToOne(() => ScanRun, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'scan_run_id' })
    scanRun!: ScanRun | null

    /**
     * 事件原始 payload（JSON 字符串）：
     * - sandbox_unavailable: `{ errno, code, adapter, message }`
     * - sandbox_degraded: `{ degradedReason: { code, message }, fallback: 'container' }`
     */
    @Column({ type: 'text', nullable: true })
    payloadJson!: string | null

    /** 通知发送状态（fire-and-forget 后异步更新；本批次不实现通知重试） */
    @Column({ type: 'boolean', default: false })
    notified!: boolean

    /** 通知渠道名（email 等；预留 slack/webhook 占位） */
    @Column({ type: 'varchar', length: 32, nullable: true })
    notifiedVia!: string | null
}
