import type { PRCheckConclusion } from '#server/entities/pr-check'

/**
 * PR Check 同步源抽象层（详见 docs/plan/todo.md §M24.1 关键决策 D5）。
 *
 * 设计动机：MVP 阶段实现 PollingSource（定时轮询 GitHub），未来可扩展 WebhookSource
 * （GitHub check_run webhook 实时推送）—— 通过统一接口互换，不影响上游 ActionStatusMonitor。
 *
 * 接口约束：
 * - 输入：单个仓库（owner + repo + 应用层 repositoryId）
 * - 输出：该仓库所有"目标 PR"的最新 check 快照数组
 * - 目标 PR 定义：author 在 [`dependfix[bot]`, `dependabot[bot]`] 集合内（详见 todo.md §M24.1）
 * - 快照包含足够信息支持 PRCheck 实体 INSERT/UPDATE 幂等
 * - 不暴露 Octokit / HTTP 细节给上游（监控器只关心快照语义）
 *
 * 注意：快照层抽象掉"status='in_progress' → 落 conclusion='pending'"等 GitHub 协议
 * 细节（GitHub 官方 schema: status enum 不含 'stale'，conclusion enum 不含 'stale'/'pending'），
 * 由具体 SyncSource 实现做映射（PollingSource 内部落地）。
 */
export interface PRCheckSyncSource {
    /**
     * 拉取指定仓库所有目标 PR 的最新 check 快照。
     * @param input.owner GitHub 仓库 owner
     * @param input.repo GitHub 仓库名
     * @param input.repositoryId 应用层仓库 id（写入 PRCheck.repositoryId 用）
     * @returns 快照数组；空数组表示该仓库无目标 PR 或全部 PR 已 close
     */
    fetchSnapshots(input: { owner: string, repo: string, repositoryId: string }): Promise<PRCheckSnapshot[]>
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
 * 状态机（关键决策 D3）：失败时 firing=true → 用户 ack 或回归 success 自动 ack → firing=false。
 * 注意：用户 ack 操作仅设置 firing=false + acknowledgedAt=NOW，**不修改** `conclusion`，
 * alert 状态机严格基于 polling 结果。
 */
export const isFailureConclusion = (conclusion: PRCheckConclusion): boolean =>
    FAILURE_CONCLUSIONS.includes(conclusion)
