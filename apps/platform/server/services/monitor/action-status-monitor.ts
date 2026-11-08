import type { DataSource } from 'typeorm'
import {
    isFailureConclusion,
    type PRCheckLifecycleState,
    type PRCheckSnapshot,
    type PRCheckSyncSource,
} from './types'
import {
    aggregateOverallStatus,
    dedupeSignalsByLatestRound,
    deriveWorstConclusion,
    pickCheckRunId,
    pickErrorSummary,
    shouldSkipTerminalPr,
    summarizeFailureSources,
} from './build-signals'
import { filterSignalsByFocus, parsePRCheckFocus, type PRCheckFocus } from '#server/utils/pr-check-focus'
import { Repository as RepositoryEntity } from '#server/entities/repository'
import { PRCheck, isTerminalPrState, type PRCheckConclusion } from '#server/entities/pr-check'

/**
 * 依赖更新 PR Check 状态监测器（详见 docs/plan/todo.md §M24.1 关键决策 D2/D3/D6）。
 *
 * 业务定位：监测 dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR
 * （author=`dependabot[bot]`）最新 `Test` check 状态，让"发出去"的修复 PR 在 CI
 * 跑挂时通过 alerts 系统 firing 并提供 ack UI。
 *
 * 核心方法 `pollOnce` 数据流：
 * 1. 拉取目标仓库列表（schedule.selectorKind 解析；MVP 阶段 per-org scope，D6）
 * 2. 对每个仓库：syncSource.fetchSnapshots → 快照数组（PR + check run）
 * 2b. 按仓库级关注集（`Repository.prCheckFocus`）过滤信号：未配置 = 全量，配置 = 只保留命中项
 *    （全量信号仍落库；关注面只影响聚合与告警判定）
 * 3. 对每个快照：INSERT/UPDATE PRCheck 表（按 `(repositoryId, prNumber, headSha)` 复合唯一索引幂等）
 * 4. 状态机推断（关键决策 D3 + M43.2b 承接）：
 *    - 关注面快照失败（conclusion ∈ failure / timed_out / action_required）→ alertFiring=true
 *    - 关注面聚合成功（`overallStatus === 'success'`）→ alertFiring=false 且**清空** acknowledgedAt /
 *      acknowledgedByUserId（自动 ack；判定按聚合状态，含 neutral 信号的 PR 亦能清零）
 *    - 其他（pending / skipped / cancelled 等）→ alertFiring=false（保留既有 ack 记录）
 * 5. lastPolledAt = observedAt
 *
 * 用户 ack 操作（PATCH /api/pr-checks/[id] { alertFiring: false }）由 Phase 3 API 层实现，
 * 本 service 仅负责落库 + 状态机推断，不处理 ack 操作。
 *
 * 与 ScanResult 的语义边界：
 * - ScanResult 是 per-alert 模型，reconcile 按 upstreamId 复合唯一索引去重
 * - PRCheck 是 per-PR-head 模型，pollOnce 按 (repositoryId, prNumber, headSha) 幂等，
 *   同一 PR HEAD 只存最新一行
 *
 * 注意：本 service **不**自动启动 polling 循环（避免与现有 scheduler 双源触发）；
 * Phase 2 末尾由 scheduler.service.ts registerSchedule 按 kind='pr-check' 分支调用。
 */
export class ActionStatusMonitor {
    private readonly ds: DataSource
    private readonly source: PRCheckSyncSource

    constructor(ds: DataSource, source: PRCheckSyncSource) {
        this.ds = ds
        this.source = source
    }

    /**
     * 单轮 polling：拉取 target 仓库的所有目标 PR check 状态 → 落库。
     *
     * @param options.organizationId 组织 id（per-org scope）
     * @param options.repositoryIds 限定仓库 id 列表（undefined = 当前组织全部仓库；Phase 2 scheduler 触发时会传入 schedule 解析后的 id 列表）
     * @returns 处理汇总（processed = 落库快照数；errors = 失败快照数）
     */
    async pollOnce(options: {
        organizationId: string | null
        repositoryIds?: string[]
    }): Promise<{ processed: number, errors: number }> {
        // 1. 解析目标仓库列表
        const repos = await this.loadTargetRepositories(options)
        let processed = 0
        let errors = 0

        for (const repo of repos) {
            try {
                // 终态节流：读取既有行，构造「终态 + HEAD 未变 + 静默窗口内」的跳过集（省三源 API）；
                // 同一份行快照同时用于生命周期候选，避免重复查询
                const rows = await this.loadRepoRows(repo.id)
                const knownTerminalHeads = this.buildTerminalHeadMap(rows, new Date())
                // 关注集按仓库解析：null = 未配置（全量告警）；配置变更仅在下一轮 polling 生效
                const focus = parsePRCheckFocus(repo.prCheckFocus)
                const snapshots = await this.source.fetchSnapshots({
                    owner: repo.owner,
                    repo: repo.name,
                    repositoryId: repo.id,
                    knownTerminalHeads,
                })
                for (const snapshot of snapshots) {
                    const applied = await this.applyOne(snapshot, focus)
                    if (applied) {
                        processed += 1
                    }
                }
                // 生命周期解析必须在快照落库后：本轮快照本身就是「仍 open」的证据
                await this.applyPrLifecycles(repo, rows, new Set(snapshots.map((snapshot) => snapshot.prNumber)))
            } catch (error) {
                // 单仓失败不影响其他仓库继续 polling（错误隔离 + fail-open）
                console.error(
                    `[pr-check-monitor] 仓库 ${repo.owner}/${repo.name} polling 失败：`,
                    error,
                )
                errors += 1
            }
        }

        return { processed, errors }
    }

    /**
     * 加载目标仓库列表（per-org scope）：
     * - 显式传 repositoryIds 时 → 仅监测该列表（schedule explicit 策略解析结果）
     * - 未传时 → 加载当前组织全部仓库（schedule all / organization 策略解析结果）
     */
    private async loadTargetRepositories(options: {
        organizationId: string | null
        repositoryIds?: string[]
    }): Promise<RepositoryEntity[]> {
        const repo = this.ds.getRepository(RepositoryEntity)
        if (options.repositoryIds && options.repositoryIds.length > 0) {
            return repo.find({ where: options.repositoryIds.map((id) => ({ id })) })
        }
        const where = options.organizationId
            ? { organizationId: options.organizationId }
            : {}
        return repo.find({ where })
    }

    /** 读取仓库全部既有 PRCheck 行（生命周期解析与终态跳过共用同一份快照） */
    private async loadRepoRows(repositoryId: string): Promise<PRCheck[]> {
        // 同一 PR 可能有多行（不同 HEAD）：按 lastPolledAt 降序取「最新行」作为跳过判定依据，
        // 避免 find 无 ORDER BY 时的 last-write-wins 不确定（最坏只是漏节流，此处求稳定）
        return this.ds.getRepository(PRCheck).find({
            where: { repositoryId },
            order: { lastPolledAt: 'DESC' },
        })
    }

    /**
     * 构造「终态 + 静默窗口内」跳过集（`prNumber → headSha`）。
     *
     * 静默窗口外的终态行**不跳过**——同一 SHA 上可能发生 workflow 重跑 / 迟到写入的部署状态，
     * 永久跳过会漏掉本特性要捕获的失败场景（口径见 `build-signals.ts` 的 `TERMINAL_REPOLL_QUIET_MS`）。
     */
    private buildTerminalHeadMap(rows: PRCheck[], now: Date): Map<number, string> {
        const map = new Map<number, string>()
        for (const row of rows) {
            if (map.has(row.prNumber)) {
                continue
            }
            if (shouldSkipTerminalPr(row, now)) {
                map.set(row.prNumber, row.headSha)
            }
        }
        return map
    }

    /**
     * 生命周期解析与落库（口径见 [pr-build-deploy-signals.md §3.11](../../../../docs/design/governance/pr-build-deploy-signals.md)）。
     *
     * 候选项 = 既有行中「生命周期未终态」且本轮未产出快照的 PR（快照即 open 证据）。
     * 解析结果 `closed` / `merged` → 该 PR 全部 HEAD 行同步终态并关闭 firing；`open` → 回填 unknown。
     * `acknowledgedAt` / 信号快照保持不变（历史信号只读可追溯）。
     *
     * 失败 / 缺失项保持原状（`unknown` 或既有 `open`），下一轮重试；不改变 `processed` 计数。
     */
    private async applyPrLifecycles(
        repo: RepositoryEntity,
        rows: PRCheck[],
        snapshotPrNumbers: ReadonlySet<number>,
    ): Promise<void> {
        if (!this.source.fetchPrLifecycles) {
            return
        }
        const candidates = [...new Set(
            rows
                .filter((row) => !isTerminalPrState(row.prState) && !snapshotPrNumbers.has(row.prNumber))
                .map((row) => row.prNumber),
        )]
        if (candidates.length === 0) {
            return
        }

        let states: Map<number, PRCheckLifecycleState>
        try {
            states = await this.source.fetchPrLifecycles({
                owner: repo.owner,
                repo: repo.name,
                prNumbers: candidates,
            })
        } catch (error) {
            // 生命周期解析失败不影响信号采集结果（fail-open）
            console.warn(`[pr-check-monitor] 仓库 ${repo.owner}/${repo.name} 生命周期解析失败（fail-open）：`, error)
            return
        }

        const prCheckRepo = this.ds.getRepository(PRCheck)
        for (const row of rows) {
            const state = states.get(row.prNumber)
            if (!state) {
                continue
            }
            const terminal = isTerminalPrState(state)
            // 已是目标状态且无需抑制 firing 的行跳过（减少无意义写盘）
            if (row.prState === state && !(terminal && row.alertFiring)) {
                continue
            }
            // 条件 UPDATE（乐观锁 = 读取时的 prState）而非整行 save：
            // `rows` 是轮询开始时的快照，期间用户 ack / 另一轮 polling 可能已改写该行；
            // 整行 save 会把 stale 的 acknowledgedAt / alertFiring 写回，静默撤销 ack。
            // affected=0 表示行已被其它写方改动 → 让位于对方，本轮不覆盖。
            await prCheckRepo.update(
                { id: row.id, prState: row.prState },
                terminal ? { prState: state, alertFiring: false } : { prState: state },
            )
        }
    }

    /**
     * 应用单个快照：按 (repositoryId, prNumber, headSha) 复合唯一索引幂等 INSERT/UPDATE。
     *
     * **关注集**：`focus` 非空时，只有命中关注集的信号参与聚合与告警判定
     * （`overallStatus` / `conclusion` / `failureSources` / `checkRunId` / `errorMessage` / `alertFiring`）；
     * 未命中信号仍**全量**写入 `signalsJson`（同名收敛已在采集层完成，此处不再折叠）；
     * `signalsJson` 仍写入**全量信号**（审计面，未命中的信号不丢弃）。命中集合为空时按空集聚合口径
     * 视为 `success`（关注面没有任何需要告警的信号），但整行照常落库。
     *
     * 状态机推断（关键决策与后续承接）：
     * - INSERT / UPDATE 路径：alertFiring = isFailureConclusion(关注面 conclusion)
     * - **自动 ack 清空判定按 `overallStatus === 'success'`**（后续承接项）：聚合成功（含
     *   `neutral` / `skipped` 信号但无失败 / 无 pending）即视为回归成功并清 ack；
     *   若沿用 `conclusion === 'success'`，含 `neutral` 信号的 PR 将永不清 ack。
     *
     * 注意：用户 ack 操作（alertFiring=false + acknowledgedAt=NOW）**不修改** conclusion；
     * 状态机严格基于 polling 结果，下轮 polling 失败时 alertFiring 会被覆盖回 true。
     *
     * @param focus 仓库级关注集（`null` = 未配置 = 现状：全量信号参与判定）
     * @returns 是否实际落库（`false` = 空信号被守卫跳过，不计入 `processed`）
     */
    private async applyOne(snapshot: PRCheckSnapshot, focus: PRCheckFocus | null): Promise<boolean> {
        // 空信号守卫：无信号不落库（`aggregateOverallStatus([])` 为真空真，直接消费会把「无信号」
        // 误写为聚合 success；见设计稿 §3.7「空集真空真」）。采集层已过滤，此处为接口级防御。
        // 注意：关注集过滤发生在守卫之后——「有信号但全部未命中」属于关注面空集，应落库并视为 success。
        if (snapshot.signals.length === 0) {
            return false
        }

        const repo = this.ds.getRepository(PRCheck)
        // 关注面信号：未配置（null）时沿用快照原值（与改动前逐字节一致）；已配置时只保留命中项并重新派生。
        // 无论哪条路径，`signalsJson` 都写入**全量信号**（审计面，未命中的信号不丢弃）。
        // 关注面内同名多轮收敛：只保留最新一轮（与采集层 `PollingSource` 同口径，见设计稿 §3.10）
        const focusedSignals = focus ? dedupeSignalsByLatestRound(filterSignalsByFocus(snapshot.signals, focus)) : null
        const overallStatus = focusedSignals ? aggregateOverallStatus(focusedSignals) : snapshot.overallStatus
        const conclusion = focusedSignals ? deriveWorstConclusion(focusedSignals) : snapshot.conclusion
        const inferredAlertFiring = isFailureConclusion(conclusion)
        const signalsJson = JSON.stringify(snapshot.signals)
        const failureSourcesJson = JSON.stringify(
            summarizeFailureSources(focusedSignals ?? snapshot.signals),
        )
        // 代表字段（checkRunId / errorMessage）与告警同源：已配置时取关注面，未配置时沿用快照派生值
        const checkRunId = focusedSignals ? pickCheckRunId(focusedSignals) : snapshot.checkRunId
        const errorMessage = focusedSignals ? pickErrorSummary(focusedSignals) : snapshot.errorMessage

        const existing = await repo.findOne({
            where: {
                repositoryId: snapshot.repositoryId,
                prNumber: snapshot.prNumber,
                headSha: snapshot.headSha,
            },
        })

        if (existing) {
            existing.conclusion = conclusion
            existing.signalsJson = signalsJson
            existing.overallStatus = overallStatus
            existing.failureSourcesJson = failureSourcesJson
            existing.checkRunId = checkRunId
            existing.detailsUrl = snapshot.detailsUrl
            existing.errorMessage = errorMessage
            existing.authorLogin = snapshot.authorLogin
            existing.alertFiring = inferredAlertFiring
            // 快照只来自 `state: 'open'` 的 PR：写入 open 即生命周期证据
            existing.prState = 'open'
            // 聚合回归成功 → 自动 ack（清空 acknowledgedAt / acknowledgedByUserId）
            if (overallStatus === 'success') {
                existing.acknowledgedAt = null
                existing.acknowledgedByUserId = null
            }
            existing.lastPolledAt = snapshot.observedAt
            await repo.save(existing)
        } else {
            const row = new PRCheck()
            row.repositoryId = snapshot.repositoryId
            row.prNumber = snapshot.prNumber
            row.headSha = snapshot.headSha
            row.authorLogin = snapshot.authorLogin
            row.conclusion = conclusion
            row.signalsJson = signalsJson
            row.overallStatus = overallStatus
            row.failureSourcesJson = failureSourcesJson
            row.checkRunId = checkRunId
            row.detailsUrl = snapshot.detailsUrl
            row.errorMessage = errorMessage
            row.alertFiring = inferredAlertFiring
            row.prState = 'open'
            row.acknowledgedAt = null
            row.acknowledgedByUserId = null
            row.lastPolledAt = snapshot.observedAt
            await repo.save(row)
        }
        return true
    }
}

/** 导出 PRCheckConclusion 类型供 Phase 3 API 类型校验引用 */
export type { PRCheckConclusion }
