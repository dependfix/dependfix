import {
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
} from 'typeorm'
import { BaseEntity } from './base-entity'
import { Repository } from './repository'

/** PR Check 结论枚举（GitHub check_run / check_suite.conclusion 取值） */
export type PRCheckConclusion =
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required'
    | 'stale'
    | 'pending'
    | 'skipped'

export const PR_CHECK_CONCLUSIONS: readonly PRCheckConclusion[] = [
    'success',
    'failure',
    'neutral',
    'cancelled',
    'timed_out',
    'action_required',
    'stale',
    'pending',
    'skipped',
] as const

/**
 * PR Check 状态监测实体（详见 docs/plan/todo.md §M24.1 Phase 1）。
 *
 * 业务定位：监测 dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR
 * （author=`dependabot[bot]`）最新 `Test` check 状态，让"发出去"的修复 PR 在 CI
 * 跑挂时通过 alerts 系统 firing 并提供 ack UI（详见 docs/plan/todo.md §M24.1）。
 *
 * 与 ScanResult 的语义边界：
 * - ScanResult 是**单次扫描**的告警明细（per-alert 模型）；
 *   reconcile 函数按 upstreamId 复合唯一索引去重，state 在扫描运行间切换。
 * - PRCheck 是**单个 PR HEAD** 的最新 check 状态（per-PR-head 模型）；
 *   按 `(repositoryId, prNumber, headSha)` 复合唯一索引去重，state 跟随 GitHub
 *   Action 实时结论变化（service polling 5min/仓 写入）。
 *
 * 索引设计（关键决策 D1 / §3b 教训，详见 docs/plan/todo.md §M24.1）：
 * - 类级复合唯一索引 `(repositoryId, prNumber, headSha)`：同一 PR 同一 HEAD
 *   只存最新一行（service polling INSERT/UPDATE 时 ON CONFLICT 幂等）。
 * - 类级复合索引 `(repositoryId, conclusion)`：dashboard 活跃失败查询
 *   （WHERE repositoryId = ? AND conclusion IN ('failure', 'timed_out')）。
 * - 类级复合索引 `(repositoryId, createdAt)`：仓库详情 PR 时间线。
 * - 类级单索引 `(repositoryId)` / `(authorLogin)` / `(alertFiring)`：service
 *   过滤 dependfix[bot] / dependabot[bot] + alerts firing 状态查询。
 *
 * **索引声明原则**（与 AuditEvent 同模式对齐，详见 migration：
 * 全部索引均通过类级 `@Index()` 显式命名 + migration `CREATE INDEX` 提供；
 * synchronize=true 路径不依赖列级 `@Index()` 装饰器，避免双重声明生成
 * 冗余索引（DB 占空间 + 双索引维护开销 + synchronize 同步冲突告警）。
 *
 * 注意（TypeORM 1.x 经验教训 §3b）：复合索引**必须类级声明**，列级
 * `@Index(['col1', 'col2'], { unique: true })` 会被解析为单列索引，
 * e2e 二次运行时会暴露第二个仓库的 500 错误（参考 scan-result.ts / audit-event.ts 同模式注释）。
 */
@Entity('pr_check')
@Index('idx_pr_check_repo_pr_head', ['repositoryId', 'prNumber', 'headSha'], { unique: true })
@Index('idx_pr_check_repo_conclusion', ['repositoryId', 'conclusion'])
@Index('idx_pr_check_repo_created', ['repositoryId', 'createdAt'])
export class PRCheck extends BaseEntity {
    /** 所属仓库 id（冗余列：与 ScanResult 同模式，便于复合唯一索引 + dashboard 无 JOIN 统计） */
    @Column({ type: 'varchar', length: 36 })
    repositoryId!: string

    @ManyToOne(() => Repository, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'repository_id' })
    repository!: Repository | null

    /** PR 编号（GitHub pull_request.number；同仓库内单调递增） */
    @Column({ type: 'integer' })
    prNumber!: number

    /** PR HEAD SHA（Git SHA-1 长度 40 字符；HEAD 变化时同一编号产生新行） */
    @Column({ type: 'varchar', length: 40 })
    headSha!: string

    /** PR 作者 login（如 `dependfix[bot]` / `dependabot[bot]`；service 按此过滤目标 PR） */
    @Column({ type: 'varchar', length: 100 })
    authorLogin!: string

    /** Check 结论（GitHub check_run.conclusion / check_suite.conclusion） */
    @Column({ type: 'varchar', length: 32, default: 'pending' })
    conclusion!: PRCheckConclusion

    /** 关联 check_run.id（GitHub numeric bigint，作字符串存储便于跨库兼容；与 ScanResult.scanRunId 同模式） */
    @Column({ type: 'varchar', length: 64, nullable: true })
    checkRunId!: string | null

    /** PR HTML 链接（`https://github.com/{owner}/{repo}/pull/{number}`） */
    @Column({ type: 'varchar', length: 500, nullable: true })
    detailsUrl!: string | null

    /** 错误摘要（CI 失败时填充，取自 check_run.output.text 或 check_suite 输出截断） */
    @Column({ type: 'text', nullable: true })
    errorMessage!: string | null

    /**
     * 是否触发 alerts firing。
     * 状态机（关键决策 D3，详见 docs/plan/todo.md §M24.1）：失败时 firing=true → 用户 ack 或回归 success 自动 ack → firing=false。
     * 默认 false；service 在 INSERT/UPDATE 时根据 `conclusion` 推断：
     * - `failure` / `timed_out` / `action_required` → 推断为 firing=true
     * - 其他（含 `success` / `neutral` / `cancelled` / `stale` / `pending` / `skipped`）→ 推断为 firing=false
     * 注意：用户 ack 操作仅设置 firing=false + acknowledgedAt=NOW，**不修改** `conclusion`，
     * alert 状态机严格基于 polling 结果。
     */
    @Column({ type: 'boolean', default: false })
    alertFiring!: boolean

    /** 用户手动 ack 时间（NULL = 未 ack；状态机详见 docs/plan/todo.md §M24.1 关键决策 D3） */
    @Column({ type: 'datetime', nullable: true })
    acknowledgedAt!: Date | null

    /** ack 操作的用户 id（NULL = 系统自动 ack / 未 ack） */
    @Column({ type: 'varchar', length: 36, nullable: true })
    acknowledgedByUserId!: string | null

    /** 最近一次 polling 时间（service 启动 polling 时更新；用于诊断轮询是否健康） */
    @Column({ type: 'datetime' })
    lastPolledAt!: Date
}
