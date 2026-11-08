import type { CheckAttribution } from '@dependfix/core'
import type { PRCheckConclusion } from '#server/entities/pr-check'

/**
 * PR Check 同步源抽象层（详见 docs/plan/todo.md §M24.1 关键决策 D5）。
 *
 * 设计动机：MVP 阶段实现 PollingSource（定时轮询 GitHub），未来可扩展 WebhookSource
 * （GitHub check_run webhook 实时推送）—— 通过统一接口互换，不影响上游 ActionStatusMonitor。
 *
 * 接口约束：
 * - 输入：单个仓库（owner + repo + 应用层 repositoryId）+ 可选「已确认终态」跳过集
 * - 输出：该仓库所有"目标 PR"的最新构建 / 部署信号快照数组
 * - 目标 PR 定义：author 在 [`dependfix[bot]`, `dependabot[bot]`] 集合内（详见 todo.md §M24.1）
 * - 快照包含足够信息支持 PRCheck 实体 INSERT/UPDATE 幂等
 * - 不暴露 Octokit / HTTP 细节给上游（监控器只关心快照语义）
 *
 * 派生字段归属：快照携带的 `conclusion` / `overallStatus` / `checkRunId` / `errorMessage` 是
 * **按全量信号**派生的参考值；实现方（新 SyncSource）必须一并填充 `signals`——当仓库配置了
 * PR Check 关注集时，监控器会**忽略这些参考值并从 `signals` 重新派生**（见 `action-status-monitor.ts`）。
 *
 * 注意：快照层抽象掉"status='in_progress' → 落 conclusion='pending'"等 GitHub 协议
 * 细节（GitHub 官方 schema: status enum 不含 'stale'，conclusion enum 不含 'stale'/'pending'），
 * 由具体 SyncSource 实现做映射（PollingSource 内部落地）。
 */
export interface PRCheckSyncInput {
    /** GitHub 仓库 owner */
    owner: string
    /** GitHub 仓库名 */
    repo: string
    /** 应用层仓库 id（写入 PRCheck.repositoryId 用） */
    repositoryId: string
    /**
     * 已确认「终态 + HEAD 未变 + 静默窗口内」的 PR（`prNumber → headSha`），采集层可跳过这些 PR
     * 以省下三源 API 调用；由监控器读库计算后传入（判定见 `build-signals.ts` 的 `shouldSkipTerminalPr`）。
     * 可选：不传表示不做该层节流（WebhookSource 等实现可忽略）。
     */
    knownTerminalHeads?: ReadonlyMap<number, string>
}

export interface PRCheckSyncSource {
    /**
     * 拉取指定仓库所有目标 PR 的最新构建 / 部署信号快照。
     * @returns 快照数组；空数组表示该仓库无目标 PR / 全部 PR 已 close / 全部被节流跳过
     */
    fetchSnapshots(input: PRCheckSyncInput): Promise<PRCheckSnapshot[]>

    /**
     * 解析 PR 生命周期（可选）：仅需在「既有行未确认终态且本轮未产出快照」时调用。
     *
     * 实现约定（口径见 [pr-build-deploy-signals.md §3.11](../../../../docs/design/governance/pr-build-deploy-signals.md)）：
     * - 返回 map 仅包含成功解析的 `prNumber`；缺失项保持 `unknown`，由下一轮重试
     * - 实现方负责单轮请求上限与失败 fail-open（不得因生命周期解析失败阻断信号采集）
     * - WebhookSource 等未来实现可不提供该方法（监控器跳过生命周期解析）
     */
    fetchPrLifecycles?(input: PRCheckLifecycleInput): Promise<Map<number, PRCheckLifecycleState>>
}

/** PR 生命周期解析输入（仓库 + 待解析 PR 编号集合） */
export interface PRCheckLifecycleInput {
    owner: string
    repo: string
    /** 待解析的 PR 编号（由监控器按「未终态且本轮无快照」筛出） */
    prNumbers: readonly number[]
}

/** PR 生命周期状态（采集层只产出 open / closed / merged；unknown 由监控器按缺失回退） */
export type PRCheckLifecycleState = 'open' | 'closed' | 'merged'

/**
 * 归一化构建 / 部署信号状态（三源统一枚举，详见 [pr-build-deploy-signals.md §3.2](../../../../docs/design/governance/pr-build-deploy-signals.md)）。
 */
export type UnifiedBuildSignalState = 'pending' | 'success' | 'failure' | 'error' | 'neutral' | 'skipped'

/** 聚合构建 / 部署状态（PR 级派生，供告警与展示使用） */
export type OverallBuildStatus = 'pending' | 'success' | 'failure'

/**
 * 归一化构建 / 部署信号（三源统一模型）。
 *
 * 来源与 provider 归因：
 * - `kind='check'`：`checks.listForRef`；provider = `check_run.app.slug`（如 `github-actions`）
 * - `kind='status'`：`repos.listCommitStatusesForRef`（分页，见设计稿 §3.7）；provider = `context` 前缀（如 `vercel`）
 * - `kind='deployment'`：`repos.listDeployments` + `listDeploymentStatuses`；provider = `creator.login`（归一化机器人形态：去 `<安装号>+` 前缀与 `[bot]` 后缀，如 `vercel[bot]` / `12345+vercel[bot]` → `vercel`）
 *
 * 相对设计稿 §3.2 的两处扩展（见 `build-signals.ts` 文件头）：`rawState` 保留原始 GitHub 取值
 * （用于保留既有 `conclusion` 粒度），`sourceId` 为源侧 id（落库与前端链接用）。
 */
export interface UnifiedBuildSignal {
    /** 来源 GitHub API */
    kind: 'check' | 'status' | 'deployment'
    /** provider 归因（无法判定时为 `unknown`，不臆造） */
    provider: string
    /** 展示名（check 名 / commit status context / deployment environment） */
    name: string
    /** 归一化状态 */
    state: UnifiedBuildSignalState
    /** 原始 GitHub 取值（check conclusion / status state / deployment status state；未完成时为 null） */
    rawState: string | null
    /** 源侧 id（check run id / commit status id / deployment id） */
    sourceId: string | null
    /** 详情链接（`details_url` / `target_url` / `environment_url`） */
    targetUrl: string | null
    /** 原始日志链接（deployment status `log_url`，如有） */
    logUrl: string | null
    /** 摘要（`check_run.output.text` / status description / deployment description，已截断） */
    summary: string | null
    /**
     * 观测时刻（轮询 wall clock，同批信号相同）。
     */
    observedAt: Date
    /**
     * 该轮次的时间戳（ISO 8601；用于同名多轮去重，见 `dedupeSignalsByLatestRound`）。
     *
     * 取值：check `started_at ?? completed_at`、commit status `updated_at ?? created_at`、
     * deployment `created_at`（不用 `updated_at`：迟到的 status 会刷新它，把旧部署排到新部署之后）。
     * 缺失 / 非法一律 `null`（排序时回退数值 `sourceId`）。
     * 可选：历史 `signalsJson` 行无该字段（读取后为 `undefined`，按「不可比」处理）。
     */
    roundAt?: string | null
    /**
     * 失败归因（与 CLI 报告同一纯函数 `classifyCheckFailure`；未完成信号为 `undefined`）。
     *
     * 平台侧不采集父提交 check，因此 `self_caused` / `pre_existing` 在本数据面不可达——
     * 只可能出现 `external_noise` / `cancelled` / `unknown`；字段可选以兼容历史 `signalsJson` 行。
     * 归因只用于**解释**，不参与 `overallStatus` / 告警 / mergify 合并放行（见 pr-build-deploy-signals.md §3.9）。
     */
    attribution?: CheckAttribution
}

/**
 * PR Check 快照：SyncSource 对外暴露的标准化数据结构。
 *
 * 与 PRCheck 实体的关系：
 * - 快照是"观测结果"，不含 PRCheck 实体特有的状态机字段（alertFiring / acknowledgedAt）
 * - ActionStatusMonitor 接收快照后做 INSERT/UPDATE + 状态机推断
 *
 * 字段命名对齐：
 * - authorLogin / prNumber / headSha / conclusion 与 PRCheck 实体一致
 * - observedAt 由 SyncSource 填充（GitHub API 调用时刻），用于 lastPolledAt 字段
 *
 * 多源字段（三源聚合；口径见 docs/design/governance/pr-build-deploy-signals.md §3.2）：
 * - `signals`：该 HEAD 的三源归一化信号（check runs + commit statuses + deployments）
 * - `overallStatus`：由 `signals` 聚合出的 PR 级状态（`failure` / `pending` / `success`）
 * - `conclusion`：由 `signals` 派生的既有枚举值（保留 `timed_out` / `action_required` 粒度）
 */
export interface PRCheckSnapshot {
    /** 应用层仓库 id（写入 PRCheck.repositoryId） */
    repositoryId: string
    /** GitHub owner（写 detailsUrl 用） */
    owner: string
    /** GitHub repo 名 */
    repo: string
    /** PR 编号 */
    prNumber: number
    /** PR HEAD SHA（GitHub SHA-1 长度 40 字符） */
    headSha: string
    /** PR 作者 login（如 `dependfix[bot]` / `dependabot[bot]`） */
    authorLogin: string
    /** Check 结论（已映射为 PRCheckConclusion enum；status='in_progress' → 'pending'） */
    conclusion: PRCheckConclusion
    /** 该 HEAD 的归一化三源信号（归一化规则见 ./build-signals.ts） */
    signals: UnifiedBuildSignal[]
    /** 由 signals 聚合出的 PR 级状态（失败优先，判定见 ./build-signals.ts） */
    overallStatus: OverallBuildStatus
    /** 关联 check_run.id（GitHub numeric bigint 字符串化，便于跨库兼容） */
    checkRunId: string | null
    /** PR HTML 链接（`https://github.com/{owner}/{repo}/pull/{prNumber}`） */
    detailsUrl: string | null
    /** CI 失败摘要（取自 check_run.output.text 截断，避免单条记录过大） */
    errorMessage: string | null
    /** 观测时刻（SyncSource 调用 GitHub API 的 wall clock；用于回填 PRCheck.lastPolledAt） */
    observedAt: Date
}

/**
 * 目标 PR 作者集合（详见 docs/plan/todo.md §M24.1 范围 / 非目标）。
 * MVP 阶段仅监测 dependfix 自身 PR（author 含 `dependfix[bot]`）+ dependabot PR（author=`dependabot[bot]`）。
 * 未来扩展候选：监测其他 PR 作者（如 dependabot PR reviewer、Renovate bot 等）。
 */
export const TARGET_PR_AUTHOR_LOGINS: readonly string[] = [
    'dependfix[bot]',
    'dependabot[bot]',
] as const

/** 观测时"失败"语义：决定 alert 是否 firing（详见 docs/plan/todo.md §M24.1 关键决策 D3 状态机） */
export const FAILURE_CONCLUSIONS: readonly PRCheckConclusion[] = [
    'failure',
    'timed_out',
    'action_required',
] as const

/**
 * 判定快照结论是否应触发 alerts firing。
 * 状态机（关键决策）：失败时 firing=true → 用户 ack 或回归 success 自动 ack → firing=false。
 * 注意：用户 ack 操作仅设置 firing=false + acknowledgedAt=NOW，**不修改** `conclusion`，
 * alert 状态机严格基于 polling 结果。
 */
export const isFailureConclusion = (conclusion: PRCheckConclusion): boolean =>
    FAILURE_CONCLUSIONS.includes(conclusion)
