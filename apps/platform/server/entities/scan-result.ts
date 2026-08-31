import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { ScanRun } from './scan-run'
import { Repository } from './repository'

/**
 * 扫描结果明细：每个独立告警只存一行（per-alert 模型，2026-08-31 M20.3）。
 *
 * 字段对齐 core NormalizedSecurityAlert 的关键切片（source/severity/packageName/fixable/fixStrategy/recommendedVersion）。
 *
 * 索引设计（M20.3 重构后）：
 * - 类级复合唯一索引 `(repositoryId, upstreamId)`：每个独立告警只存一行，reconcile 函数
 *   通过 ON CONFLICT 语义保证不重复 INSERT；fixStatus='success' 行永不被 supersede
 * - 类级复合索引 `(repositoryId, supersededAt)`：dashboard 活跃 vs 已关闭查询（活跃 = supersededAt IS NULL）
 * - 列级单索引 `scanRunId`：保留向后兼容（M20.5 后考虑废弃——届时 alerts API 不再按 scanRunId JOIN）
 *
 * 注意（TypeORM 1.x 经验教训 §3b）：复合索引必须在类级声明，
 * 列级 `@Index(['col1', 'col2'], { unique: true })` 会被解析为单列索引，
 * e2e 二次运行时会暴露第二个仓库的 500 错误（参考 audit-event.ts 同模式注释）。
 */
@Entity('scan_result')
@Index('idx_scan_result_repo_upstream', ['repositoryId', 'upstreamId'], { unique: true })
@Index('idx_scan_result_repo_superseded', ['repositoryId', 'supersededAt'])
export class ScanResult extends BaseEntity {
    @Index()
    @Column({ type: 'varchar', length: 36 })
    scanRunId!: string

    @ManyToOne(() => ScanRun, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'scan_run_id' })
    scanRun!: ScanRun | null

    /** 仓库 id（M20.3 新增冗余列；便于唯一索引 + dashboard 统计无需 JOIN ScanRun） */
    @Column({ type: 'varchar', length: 36 })
    repositoryId!: string

    @ManyToOne(() => Repository, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'repository_id' })
    repository!: Repository | null

    /**
     * 上游告警唯一 ID（M20 新增）。
     * 由引擎侧 `normalizeUpstreamId(source, raw)` 注入；格式详见
     * [`packages/core/src/alerts/upstream-id.ts`](../../../../packages/core/src/alerts/upstream-id.ts)。
     * 平台 ScanResult 唯一索引第二段（与 repositoryId 组成复合唯一键）。
     */
    @Column({ type: 'varchar', length: 255 })
    upstreamId!: string

    /** 告警来源（dependabot / code-scanning / pnpm-audit / code-quality） */
    @Column({ type: 'varchar', length: 32 })
    source!: string

    @Column({ type: 'varchar', length: 32 })
    severity!: string

    @Column({ type: 'varchar', length: 255 })
    packageName!: string

    @Column({ type: 'varchar', length: 500, nullable: true })
    manifestPath!: string | null

    @Column({ type: 'varchar', length: 255, nullable: true })
    ruleId!: string | null

    @Column({ type: 'text', nullable: true })
    summary!: string | null

    @Column({ type: 'boolean', default: false })
    fixable!: boolean

    /** 修复策略（upgrade / lock / wait-upstream / manual / override） */
    @Column({ type: 'varchar', length: 32, nullable: true })
    fixStrategy!: string | null

    @Column({ type: 'varchar', length: 100, nullable: true })
    recommendedVersion!: string | null

    /** 告警 HTML 链接 */
    @Column({ type: 'varchar', length: 500, nullable: true })
    htmlUrl!: string | null

    /** 修复结果（success / failed / skipped / converged / not-tried） */
    @Column({ type: 'varchar', length: 32, default: 'not-tried' })
    fixStatus!: string

    @Column({ type: 'text', nullable: true })
    errorMessage!: string | null

    /**
     * 首次发现时间（M20.3 新增；reconcile 函数在 INSERT 时填 new Date()，
     * 后续扫描该告警存在时该字段不变）。
     */
    @Column({ type: 'datetime' })
    firstSeenAt!: Date

    /**
     * 最近一次见到时间（M20.3 新增；reconcile 函数每次 UPDATE 活跃告警时刷新）。
     */
    @Column({ type: 'datetime' })
    lastSeenAt!: Date

    /**
     * 跨次扫描累计出现次数（M20.3 新增；reconcile 函数每次活跃时 +1）。
     * 注意：fixStatus='success' 行的 occurrenceCount 持续累加（业务语义："曾出现 N 次"），
     * 即使该告警被 supersede 也不减（决策 1：fixStatus='success' 永不被 supersede，
     * 所以 N 不会减；superseded 后该告警仍显示 occurrenceCount 历史值）。
     */
    @Column({ type: 'integer', default: 1 })
    occurrenceCount!: number

    /**
     * 标记该独立告警是否被上游关闭（M20.3 新增；reconcile 函数在上游消失时设置 NOW()）。
     * NULL = 活跃；非 NULL = 已被 upstream 关闭（前端 UI 需根据 fixStatus 决定显示文案）。
     *
     * 设计要点：
     * - fixStatus='success' 永不被 supersede（决策 1）—— 保留修复记录
     * - supersede 后 occurrenceCount / firstSeenAt / lastSeenAt 不变（历史快照）
     * - 默认 NULL + 类级索引 `(repositoryId, supersededAt)` 便于查询活跃 vs 已关闭
     *
     * **已知业务 gap（M20.3 + audit 2026-08-31 W2）**：
     * 已 supersede 告警若上游再次出现，reconcile 当前**不会重新激活**（supsersededAt 保持非 NULL），
     * M20.5 实施时必须补齐"重新激活语义"——本批次决策仅 supersede（不重新打开），属 audit suggest backlog。
     */
    @Column({ type: 'datetime', nullable: true })
    supersededAt!: Date | null
}
