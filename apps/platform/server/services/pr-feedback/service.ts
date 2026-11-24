// service.ts — PR 回环反馈：按「观察态 + 失败终态」在 PR 上产出幂等副作用。
//
// 触发方式：监测器同一节拍（scheduler 的 pr-check 轮询）在每个仓库 poll 完成后调用本服务，
// 不新增调度器、不做长轮询（口径见 docs/design/governance/pr-feedback-loop.md §6）。
// 失败一律只 warn：反馈是旁路能力，不得改变 run 结论与轮询结果。

import { IsNull, MoreThanOrEqual, Not, type DataSource } from 'typeorm'
import type { Octokit } from '@octokit/rest'
import { closePullRequest, commentOnPullRequest } from '@dependfix/engine'
import type { Logger } from '@dependfix/core'
import { cleanupClosedPullRequestBranch } from './branch-cleanup'
import { parsePrFeedbackConfig } from './config'
import { buildFeedbackCommentBody, hasFeedbackMarker, isFeedbackFailureConclusion } from './decision'
import { isPrFeedbackObservationOpen } from './observation'
import { AuditEvent, type AuditEventType } from '#server/entities/audit-event'
import { PRCheck } from '#server/entities/pr-check'
import { Repository } from '#server/entities/repository'
import { ScanRun } from '#server/entities/scan-run'

/** `retryFailed` 未实现的提醒：每仓库每进程只 warn 一次（避免按节拍刷日志）。 */
const retryWarned = new Set<string>()

/** 单仓库单轮的反馈结果（供调度层汇总日志）。 */
export interface PrFeedbackRunResult {
    commented: number
    closed: number
    errors: number
}

interface FailureSource {
    provider: string
    name: string
    kind?: string
}

/** 解析 `PRCheck.failureSourcesJson`（脏数据一律返回空数组，不抛错）。 */
function parseFailureSources(raw: string | null): FailureSource[] {
    if (!raw) {
        return []
    }
    try {
        const parsed: unknown = JSON.parse(raw)
        if (!Array.isArray(parsed)) {
            return []
        }
        return parsed
            .filter((item): item is FailureSource => Boolean(item) && typeof item === 'object')
            .map((item) => ({
                provider: typeof item.provider === 'string' ? item.provider : 'unknown',
                name: typeof item.name === 'string' ? item.name : 'unknown',
                kind: typeof item.kind === 'string' ? item.kind : undefined,
            }))
    } catch {
        return []
    }
}

/** 写审计事件（失败不阻断反馈主流程）。 */
async function recordFeedbackAudit(
    ds: DataSource,
    type: AuditEventType,
    input: { repositoryId: string, scanRunId: string | null, payload: Record<string, unknown> },
): Promise<void> {
    const repo = ds.getRepository(AuditEvent)
    await repo.save(repo.create({
        type,
        severity: 'info',
        repositoryId: input.repositoryId,
        scanRunId: input.scanRunId,
        payloadJson: JSON.stringify(input.payload),
        notified: false,
        notifiedVia: null,
    }))
}

/**
 * 对单个仓库执行一轮 PR 回环反馈。
 *
 * 处理对象：`ScanRun.prNumber` 非空（平台交付过 PR）且仍在观察窗口内的 PR。
 * 对每个对象取**最新 headSha** 的 `PRCheck` 行：
 * - 失败终态 + `comment` 开 → 按 `headSha` 幂等评论一次（评论区 marker 判定）
 * - 失败终态 + `closeFailed` 开 → 关闭 PR 并写审计
 * - 其它结论 / 窗口外 / 无 PRCheck → 不动作
 */
export async function runPrFeedbackForRepository(params: {
    ds: DataSource
    octokit: Octokit
    repositoryId: string
    now?: Date
    logger?: Pick<Logger, 'info' | 'warn'>
}): Promise<PrFeedbackRunResult> {
    const { ds, octokit, repositoryId } = params
    const now = params.now ?? new Date()
    const logger = params.logger
    const result: PrFeedbackRunResult = { commented: 0, closed: 0, errors: 0 }

    const repository = await ds.getRepository(Repository).findOne({ where: { id: repositoryId } })
    if (!repository) {
        return result
    }
    const config = parsePrFeedbackConfig(repository.prFeedback)
    if (config.retryFailed && !retryWarned.has(repositoryId)) {
        retryWarned.add(repositoryId)
        logger?.warn(`[pr-feedback] ${repository.owner}/${repository.name}: retryFailed 已开启但本批未实现（仅解析），忽略`)
    }
    // 评论与关闭均关 / 窗口关闭 → 无需查询（省 DB 与 API）
    if ((!config.comment && !config.closeFailed) || config.windowHours <= 0) {
        return result
    }

    const cutoff = new Date(now.getTime() - config.windowHours * 3_600_000)
    const runs = await ds.getRepository(ScanRun).find({
        where: {
            repositoryId,
            prNumber: Not(IsNull()),
            finishedAt: MoreThanOrEqual(cutoff),
        },
        select: { id: true, prNumber: true, finishedAt: true },
        order: { finishedAt: 'DESC', id: 'DESC' },
    })

    const seenPrNumbers = new Set<number>()
    for (const run of runs) {
        const prNumber = run.prNumber
        if (typeof prNumber !== 'number' || seenPrNumbers.has(prNumber)) {
            continue
        }
        seenPrNumbers.add(prNumber)

        try {
            const prCheck = await ds.getRepository(PRCheck).findOne({
                where: { repositoryId, prNumber },
                order: { createdAt: 'DESC', id: 'DESC' },
            })
            if (!prCheck) {
                continue
            }
            const observationOpen = isPrFeedbackObservationOpen({
                prNumber,
                reference: { runFinishedAt: run.finishedAt, prCheckCreatedAt: prCheck.createdAt },
                now,
                windowHours: config.windowHours,
            })
            if (!observationOpen) {
                continue
            }
            if (!isFeedbackFailureConclusion(prCheck.conclusion)) {
                continue
            }

            // PR 终态即观察上限（设计 §5.3）：关闭过 / 人工合并的 PR 不再评论、不再重复关闭
            const pull = await octokit.rest.pulls.get({
                owner: repository.owner,
                repo: repository.name,
                pull_number: prNumber,
            })
            if (pull.data.state !== 'open') {
                continue
            }

            if (config.comment) {
                const comments = await octokit.paginate(octokit.rest.issues.listComments, {
                    owner: repository.owner,
                    repo: repository.name,
                    issue_number: prNumber,
                    per_page: 100,
                })
                const bodies = comments.map((comment) => comment.body ?? '')
                if (!hasFeedbackMarker(bodies, prCheck.headSha)) {
                    await commentOnPullRequest(
                        octokit,
                        repository.owner,
                        repository.name,
                        prNumber,
                        buildFeedbackCommentBody({
                            headSha: prCheck.headSha,
                            conclusion: prCheck.conclusion,
                            failureSources: parseFailureSources(prCheck.failureSourcesJson),
                            closeFailed: config.closeFailed,
                        }),
                    )
                    result.commented += 1
                    await recordFeedbackAudit(ds, 'pr_feedback_commented', {
                        repositoryId,
                        scanRunId: run.id,
                        payload: { prNumber, headSha: prCheck.headSha, conclusion: prCheck.conclusion },
                    })
                }
            }

            if (config.closeFailed) {
                await closePullRequest(octokit, repository.owner, repository.name, prNumber)
                result.closed += 1
                // 先回收 head 分支再写审计：审计写库失败（SQLITE_BUSY 等）会抛到外层 catch，
                // 而 PR 已关闭 → 下一轮不会再进入本分支，分支将永久残留（正是本能力要消灭的形态）。
                // 回收自身已吞掉删除失败并落清理审计，不阻断反馈主流程。
                await cleanupClosedPullRequestBranch({
                    octokit,
                    repository,
                    run,
                    expectedHeadSha: prCheck.headSha,
                    head: {
                        ref: pull.data.head.ref,
                        sha: pull.data.head.sha,
                        repoFullName: pull.data.head.repo?.full_name ?? null,
                    },
                })
                await recordFeedbackAudit(ds, 'pr_feedback_closed', {
                    repositoryId,
                    scanRunId: run.id,
                    payload: { prNumber, headSha: prCheck.headSha, conclusion: prCheck.conclusion },
                })
            }
        } catch (error) {
            result.errors += 1
            const message = error instanceof Error ? error.message : String(error)
            logger?.warn(
                `[pr-feedback] ${repository.owner}/${repository.name} PR #${prNumber} 反馈失败（不影响轮询）：${message}`,
            )
        }
    }

    return result
}
