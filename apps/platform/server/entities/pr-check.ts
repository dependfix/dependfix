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
 * PR 生命周期状态（口径见 [pr-build-deploy-signals.md §3.11](../../../../docs/design/governance/pr-build-deploy-signals.md)）。
 *
 * - `open`：轮询观测到的开启态（每轮快照写入）
 * - `closed` / `merged`：生命周期解析确认的终态；不再计入 firing，后续轮询不再采集
 * - `unknown`：迁移存量行 / 生命周期解析失败值（fail-open：仍按原 alertFiring 计数，视图展示「未知」）
 */
export type PRCheckPrState = 'open' | 'closed' | 'merged' | 'unknown'

export const PR_CHECK_PR_STATES: readonly PRCheckPrState[] = [
    'open',
    'closed',
    'merged',
    'unknown',
] as const

/** 生命周期终态：关闭 / 合并的 PR 不再计入 firing，也不再产生新快照 */
export const PR_CHECK_TERMINAL_PR_STATES: readonly PRCheckPrState[] = ['closed', 'merged'] as const

/** 判定生命周期是否已终态（`unknown` / `null` 按未终态处理，保持 fail-open） */
export const isTerminalPrState = (state: string | null | undefined): boolean =>
    state === 'closed' || state === 'merged'

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
 * - 类级复合索引 `(repositoryId, prState)`：生命周期候选项查询 / 终态过滤。
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
@Index('idx_pr_check_repo_pr_state', ['repositoryId', 'prState'])
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

    /**
     * PR 生命周期状态：`open` / `closed` / `merged` / `unknown`。
     *
     * 写入路径：
     * - 信号快照落库 → `open`（快照仅来自 `state: 'open'` 的 PR）
     * - 生命周期解析（`PollingSource.fetchPrLifecycles`）→ 关闭 / 合并的 PR 全部 HEAD 行同步终态
     *
     * `closed` / `merged` 行 `alertFiring` 强制为 false（历史 ack 与信号快照保留）；
     * `unknown` = 迁移存量行 / 解析未完成，按 fail-open 继续参与 firing 统计，视图标注「未知」。
     */
    @Column({ type: 'varchar', length: 16, default: 'unknown' })
    prState!: PRCheckPrState

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
     * 归一化三源信号快照（JSON 字符串）。
     *
     * 口径见 [pr-build-deploy-signals.md §3.2 / §3.7](../../../../docs/design/governance/pr-build-deploy-signals.md)：
     * 每条含 `kind` / `provider` / `name` / `state` / `rawState` / `sourceId` / `targetUrl` / `logUrl` / `summary` / `observedAt`；
     * 条数上限由 `MAX_SIGNALS_PER_PR` 约束（写入侧截断）。NULL = 本列上线前采集的历史行。
     */
    @Column({ type: 'text', nullable: true })
    signalsJson!: string | null

    /**
     * 聚合构建 / 部署状态（`failure` / `pending` / `success`）。
     *
     * **告警与自动 ack 判定以本列为准**（`failure` → `alertFiring=true`；`success` → 自动清 ack）。
     * NULL = 本列上线前采集的历史行（此类行按「非终态」处理，下次轮询会重采并回填）。
     */
    @Column({ type: 'varchar', length: 16, nullable: true })
    overallStatus!: string | null

    /**
     * 失败源清单（JSON 字符串；`[{ provider, name, kind }]` 去重，上限 `MAX_FAILURE_SOURCES`）。
     * 供 UI / 筛选直接消费，避免解析整份 `signalsJson`。
     */
    @Column({ type: 'text', nullable: true })
    failureSourcesJson!: string | null

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

    /**
     * 最近一次 polling 写入时间（service 落库时更新；用于诊断轮询是否健康）。
     *
     * **语义（M43.2b 起）**：仅在该 PR 本轮**实际采集并落库**时推进——「终态 + HEAD 未变 + 静默窗口内」
     * 的 PR 本轮跳过采集（三源 API 降频），故其 `lastPolledAt` 可能早于当前时间；
     * 陈旧 `lastPolledAt` **不等于**轮询故障（口径见 pr-build-deploy-signals.md §3.7）。
     */
    @Column({ type: 'datetime' })
    lastPolledAt!: Date
}
