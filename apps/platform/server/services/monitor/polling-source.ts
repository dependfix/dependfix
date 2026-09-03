import type { Octokit } from '@octokit/rest'
import type {
    PRCheckSnapshot,
    PRCheckSyncSource,
} from './types'
import type { PRCheckConclusion } from '#server/entities/pr-check'

/**
 * 轮询同步源：通过 GitHub REST API 拉取"目标 PR"的最新 check 状态。
 *
 * 数据流（详见 docs/plan/todo.md §M24.1 关键决策 D2）：
 * 1. `octokit.paginate(octokit.rest.pulls.list, { state: 'open' })` 拉取仓库所有 open PRs
 * 2. 过滤 author ∈ TARGET_PR_AUTHOR_LOGINS（`dependfix[bot]` / `dependabot[bot]`）
 * 3. 对每个目标 PR：`octokit.paginate(octokit.rest.checks.listForRef, { ref: headSha })`
 *    拉取该 HEAD 所有 check runs
 * 4. 取 `name === 'Test'` 的最新 check run（按 started_at 降序）
 * 5. 组装 PRCheckSnapshot 返回给 ActionStatusMonitor
 *
 * 凭据要求：依赖 AuthProvider 实例由调用方注入（M18.x 已落地 AuthProvider 抽象层）；
 * service 构造时校验 Octokit 实例非空，401 错误由上游 Octokit retry policy 自动重试。
 *
 * GitHub API 限流：`actions: read` scope 不计入主限流（5000 次/小时），polling 默认
 * 5min/仓（关键决策 D2）足够支撑小规模部署；429/secondary rate limit 由 packages/engine
 * retry policy 自动 backoff（详见 packages/engine/src/github/client.ts §applyRetryPolicy）。
 */
export class PollingSource implements PRCheckSyncSource {
    constructor(private readonly octokit: Octokit) {}

    async fetchSnapshots(input: { owner: string, repo: string, repositoryId: string }): Promise<PRCheckSnapshot[]> {
        const { owner, repo, repositoryId } = input
        const observedAt = new Date()

        // 1. 拉取所有 open PRs（按 updated_at 降序）
        const pulls = await this.octokit.paginate(this.octokit.rest.pulls.list, {
            owner,
            repo,
            state: 'open',
            sort: 'updated',
            direction: 'desc',
            per_page: 100,
        })

        const snapshots: PRCheckSnapshot[] = []
        for (const pr of pulls) {
            const authorLogin = pr.user?.login
            if (!authorLogin || !isTargetAuthor(authorLogin)) {
                continue
            }

            const headSha = pr.head.sha
            if (!headSha) {
                continue
            }

            // 2. 拉取该 HEAD 的 check runs
            const checkRuns = await this.octokit.paginate(this.octokit.rest.checks.listForRef, {
                owner,
                repo,
                ref: headSha,
                per_page: 100,
            })

            // 3. 取 'Test' check run 的最新一条（started_at 降序）
            const testRuns = checkRuns.filter((cr) => isTestCheckRun(cr.name))
            if (testRuns.length === 0) {
                continue
            }
            const latest = testRuns.reduce((acc, cur) => {
                const accTime = new Date(acc.started_at ?? '').getTime()
                const curTime = new Date(cur.started_at ?? '').getTime()
                return curTime > accTime ? cur : acc
            })

            // 4. 映射 GitHub status/conclusion → PRCheckConclusion
            const conclusion = mapGitHubConclusion(latest.conclusion, latest.status)

            snapshots.push({
                repositoryId,
                owner,
                repo,
                prNumber: pr.number,
                headSha,
                authorLogin,
                conclusion,
                checkRunId: latest.id !== undefined && latest.id !== null ? String(latest.id) : null,
                detailsUrl: pr.html_url,
                errorMessage: extractErrorMessage(latest.output?.text),
                observedAt,
            })
        }

        return snapshots
    }
}

/**
 * 判定 PR 作者是否为监测目标（详见 docs/plan/todo.md §M24.1）。
 *
 * 匹配规则（小写不敏感）：
 * - login === 'dependabot[bot]'（GitHub 官方 bot，所有 dependabot PR 一致）
 * - login.toLowerCase().endsWith('[bot]') && login.toLowerCase().includes('dependfix')：
 *   兼容 M18.x 接入 GitHub App 后动态生成的 bot 名（如 `12345+dependfix[bot]`）
 *
 * 不匹配的 PR（如人工创建的 PR）一律忽略，避免 alerts 噪声。
 */
const isTargetAuthor = (login: string): boolean => {
    const lower = login.toLowerCase()
    if (lower === 'dependabot[bot]') {
        return true
    }
    if (lower.endsWith('[bot]') && lower.includes('dependfix')) {
        return true
    }
    return false
}

/** check run 名匹配（GitHub Action 默认名为 `Test`；不同仓库可能有变体如 `test` / `CI / test`） */
const isTestCheckRun = (name: string | null | undefined): boolean => {
    if (!name) {
        return false
    }
    return name === 'Test' || name === 'test'
}

/**
 * 映射 GitHub check_run.conclusion + status → PRCheckConclusion。
 *
 * GitHub 官方 schema：
 * - status enum: `queued | in_progress | completed | waiting | requested | pending`
 * - conclusion enum: `success | failure | neutral | cancelled | skipped | timed_out | action_required | stale | null`
 *
 * 映射规则：
 * - status='completed' + conclusion in [success/failure/neutral/cancelled/skipped/timed_out/action_required/stale] → 保留原值
 * - status='completed' + conclusion=null → 'skipped'（check 完成但无结论）
 * - status in [queued/in_progress/waiting/requested/pending] → 'pending'（未完成）
 * - 其他（异常状态）→ 'skipped'（防御性）
 */
const mapGitHubConclusion = (
    conclusion: string | null,
    status: string | null,
): PRCheckConclusion => {
    if (status !== 'completed') {
        return 'pending'
    }
    switch (conclusion) {
        case 'success':
        case 'failure':
        case 'neutral':
        case 'cancelled':
        case 'skipped':
        case 'timed_out':
        case 'action_required':
        case 'stale':
            return conclusion
        case null:
        case undefined:
            return 'skipped'
        default:
            return 'skipped'
    }
}

/** 提取错误摘要（截断到 1000 字符，避免单条 PRCheck 记录过大） */
const ERROR_MESSAGE_MAX_LENGTH = 1000
const extractErrorMessage = (outputText: string | null | undefined): string | null => {
    if (!outputText) {
        return null
    }
    return outputText.length > ERROR_MESSAGE_MAX_LENGTH
        ? `${outputText.slice(0, ERROR_MESSAGE_MAX_LENGTH)}...`
        : outputText
}

/** 导出供 ActionStatusMonitor 单测引用 */
export { isTargetAuthor, mapGitHubConclusion, extractErrorMessage }
