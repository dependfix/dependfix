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
 * 系统审计事件类型。
 *
 * **语义边界**：本实体收录「需要留痕的系统事实」——执行器 / 执行环境健康、配置变更留痕、
 * 以及 PR 回环副作用；**单次 run 结果**不在此列（归 `ScanRun.failure_code / failure_stage /
 * failure_kind`，见 run-failure-classify.ts）。判据：`execution_timeout` / `clone_timeout` /
 * `execution_failed` / `push_failed` 等「单次 run 结果」只记失败分类，不额外记环境事件，
 * 避免同一现象双重记录；只有「执行器不可用 / 路径偏离」（可跨 run 反映环境健康）与
 * 「对外可见的副作用（配置写入 / PR 评论与关闭）」才落本表。
 *
 * 触发源：
 * - sandbox_unavailable：sandbox.execute 抛 errno（B 场景运行时失败）
 * - sandbox_degraded：scan-orchestrator 产出的 degradedReason（A 场景 sandbox 启动降级）
 * - sandbox_egress_blocked：fix 类出站策略偏离（审计关闭 / 白名单为空 / clone 基地址未命中白名单，
 *   执行器执行前拒绝；属配置偏离而非运行事故）
 * - delivery_branch_cleanup：沙箱交付失败后的远端分支副作用处置（删除成功 / 失败 / 跳过及原因）
 * - container_unavailable：container 路由前 `ContainerExecutor.isAvailable()` 返回 false
 *   （工作根不可写 / 磁盘满 / 只读 FS）——默认部署下的执行环境健康信号
 * - ai_config_update：Organization / Repository AI 研判配置更新（todo.md §M26.1 / [platform-ai-integration.md §8.3](../design/governance/platform-ai-integration-governance.md) 审计要求）
 * - verify_commands_update：Repository 自定义验证命令更新（todo.md §M32.1 / docs/standards/platform.md §3.8）——
 *   该字段等价于远程命令执行面，变更必须留痕
 * - execution_limits_update：Repository 仓库级执行预算 / 超时配置更新（repo-execution-limits.md §8.2）——
 *   变更影响运行预算与锁窗口，必须留痕
 * - major_upgrade_policy_update：Repository 跨大版本升级授权变更（repo-execution-limits 同批决策）
 * - pr_feedback_commented / pr_feedback_closed：PR 回环对交付 PR 的评论与自动关闭
 *   （[pr-feedback-loop.md](../design/governance/pr-feedback-loop.md)）——不可逆 / 对外可见，必须留痕
 *
 * 通知策略（见 notification/policy.ts）：仅「执行器不可用 / 降级」类发通知；
 * 配置留痕类（ai_config_update / verify_commands_update / execution_limits_update）、配置偏离类
 * （sandbox_egress_blocked）、交付副作用处置（delivery_branch_cleanup）与 PR 回环类
 * （pr_feedback_commented / pr_feedback_closed）仅落库、不发通知。
 *
 * 类型扩展点：未来可加 `cgroup_limit_hit` / `runtime_swap` 等
 * （保持小写 snake_case，便于 SQL 过滤与 i18n 键对齐）。
 */
export type AuditEventType =
    | 'sandbox_unavailable'
    | 'sandbox_degraded'
    | 'sandbox_egress_blocked'
    | 'delivery_branch_cleanup'
    | 'container_unavailable'
    | 'ai_config_update'
    | 'verify_commands_update'
    | 'execution_limits_update'
    | 'major_upgrade_policy_update'
    | 'notification_settings_update'
    | 'pr_feedback_commented'
    | 'pr_feedback_closed'

/** 审计事件类型枚举（API 校验用） */
export const AUDIT_EVENT_TYPES: readonly AuditEventType[] = [
    'sandbox_unavailable',
    'sandbox_degraded',
    'sandbox_egress_blocked',
    'delivery_branch_cleanup',
    'container_unavailable',
    'ai_config_update',
    'verify_commands_update',
    'execution_limits_update',
    'major_upgrade_policy_update',
    'notification_settings_update',
    'pr_feedback_commented',
    'pr_feedback_closed',
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

    /** 关联仓库 id（可空：预留全局 / 跨仓库的执行环境事件不挂具体仓库） */
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
     * - sandbox_egress_blocked: `{ code, message, fallback: 'none', notificationSuppressed: true }`
     *   （`notificationSuppressed` 只抑制本环境事件通知，运行终态的业务失败通知仍照常发送）
     * - delivery_branch_cleanup: `{ branch, outcome: 'deleted' | 'failed' | 'skipped', reason? }`
     * - container_unavailable: `{ code, executor: 'container', message }`
     * - pr_feedback_commented / pr_feedback_closed: `{ prNumber, headSha, conclusion }`
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
