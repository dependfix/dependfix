import { describe, expect, it, vi } from 'vitest'
import type { DataSource } from 'typeorm'
import type { Octokit } from '@octokit/rest'
import { buildFeedbackMarker } from './decision'
import { runPrFeedbackForRepository } from './service'

// 分支清理的审计写入走真实 DB 初始化；单测替身只保留调用记录（清理逻辑本身另有断言）
const { mockRecordDeliveryCleanupEvent } = vi.hoisted(() => ({ mockRecordDeliveryCleanupEvent: vi.fn() }))
vi.mock('#server/services/sandbox-delivery-cleanup', () => ({
    recordDeliveryCleanupEvent: mockRecordDeliveryCleanupEvent,
}))

const SHA = 'a'.repeat(40)
const now = new Date('2026-10-30T12:00:00Z')
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000)

interface Harness {
    ds: DataSource
    octokit: Octokit
    commentBodies: string[]
    createComment: ReturnType<typeof vi.fn>
    closePull: ReturnType<typeof vi.fn>
    getPull: ReturnType<typeof vi.fn>
    deleteRef: ReturnType<typeof vi.fn>
    savedAudits: Record<string, unknown>[]
}

function makeHarness(options: {
    prFeedback?: string | null
    run?: { prNumber: number, finishedAt: Date | null } | null
    prCheck?: { headSha: string, conclusion: string, failureSourcesJson: string | null, createdAt: Date } | null
    comments?: string[]
    commentError?: Error
    prState?: 'open' | 'closed' | (() => 'open' | 'closed')
    head?: { ref: string, sha: string, repoFullName: string | null }
    deleteRefError?: Error
    defaultBranch?: string
    /** 让 `pr_feedback_closed` 审计写库抛错（验证审计失败不阻断分支回收） */
    failClosedAudit?: boolean
} = {}): Harness {
    const savedAudits: Record<string, unknown>[] = []
    const createComment = vi.fn(async () => {
        if (options.commentError) {
            throw options.commentError
        }
        return {}
    })
    const closePull = vi.fn(async () => ({}))
    const head = options.head ?? { ref: 'dependfix/auto-fix-abc12345', sha: SHA, repoFullName: 'acme/app' }
    const getPull = vi.fn(async () => ({
        data: {
            state: typeof options.prState === 'function' ? options.prState() : (options.prState ?? 'open'),
            head: { ref: head.ref, sha: head.sha, repo: head.repoFullName ? { full_name: head.repoFullName } : null },
        },
    }))
    const deleteRef = vi.fn(async () => {
        if (options.deleteRefError) {
            throw options.deleteRefError
        }
        return {}
    })
    const commentBodies = options.comments ?? []

    const repos: Record<string, unknown> = {
        Repository: {
            findOne: vi.fn(async () => ({
                id: 'repo-1',
                owner: 'acme',
                name: 'app',
                defaultBranch: options.defaultBranch ?? 'main',
                prFeedback: options.prFeedback === undefined ? null : options.prFeedback,
            })),
        },
        ScanRun: {
            find: vi.fn(async () => (options.run ? [{ id: 'run-1', prNumber: options.run.prNumber, finishedAt: options.run.finishedAt }] : [])),
        },
        PRCheck: {
            findOne: vi.fn(async () => (options.prCheck
                ? { ...options.prCheck, createdAt: options.prCheck.createdAt }
                : null)),
        },
        AuditEvent: {
            create: vi.fn((input: Record<string, unknown>) => input),
            save: vi.fn(async (input: Record<string, unknown>) => {
                if (options.failClosedAudit && input.type === 'pr_feedback_closed') {
                    throw new Error('SQLITE_BUSY: database is locked')
                }
                savedAudits.push(input)
                return input
            }),
        },
    }

    const ds = {
        getRepository: (entity: { name?: string }) => repos[(entity as { name?: string }).name ?? ''],
    } as unknown as DataSource

    const octokit = {
        paginate: async () => commentBodies.map((body) => ({ body })),
        rest: {
            issues: {
                listComments: vi.fn(),
                createComment,
            },
            pulls: { update: closePull, get: getPull },
            git: { deleteRef },
        },
    } as unknown as Octokit

    return { ds, octokit, commentBodies, createComment, closePull, getPull, deleteRef, savedAudits }
}

const defaultRun = { prNumber: 7, finishedAt: hoursAgo(1) }
const failedCheck = {
    headSha: SHA,
    conclusion: 'failure',
    failureSourcesJson: JSON.stringify([{ provider: 'github-actions', name: 'Test', kind: 'check' }]),
    createdAt: hoursAgo(1),
}

describe('runPrFeedbackForRepository', () => {
    it('失败终态：评论一次并写审计（marker 幂等）', async () => {
        const h = makeHarness({ run: defaultRun, prCheck: failedCheck })
        const first = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(first).toEqual({ commented: 1, closed: 0, errors: 0 })
        expect(h.createComment).toHaveBeenCalledTimes(1)
        const body = h.createComment.mock.calls[0]![0] as { body: string }
        expect(body.body).toContain(buildFeedbackMarker(SHA))
        expect(body.body).toContain('`github-actions/Test`')
        expect(h.savedAudits.map((audit) => audit.type)).toEqual(['pr_feedback_commented'])
    })

    it('已存在同 headSha 的 marker → 不重复评论', async () => {
        const h = makeHarness({ run: defaultRun, prCheck: failedCheck, comments: [`old\n${buildFeedbackMarker(SHA)}`] })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(result).toEqual({ commented: 0, closed: 0, errors: 0 })
        expect(h.createComment).not.toHaveBeenCalled()
    })

    it('closeFailed 开启：评论 + 关闭 + 两条审计', async () => {
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
        })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(result).toEqual({ commented: 1, closed: 1, errors: 0 })
        expect(h.closePull).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 7, state: 'closed' }))
        expect(h.savedAudits.map((audit) => audit.type)).toEqual(['pr_feedback_commented', 'pr_feedback_closed'])
    })

    it('关闭后回收 head 分支：本仓 + dependfix/auto-fix-* + sha 匹配 → 删除并写清理审计', async () => {
        mockRecordDeliveryCleanupEvent.mockReset()
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
        })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

        expect(result).toEqual({ commented: 1, closed: 1, errors: 0 })
        expect(h.deleteRef).toHaveBeenCalledWith({
            owner: 'acme',
            repo: 'app',
            ref: 'heads/dependfix/auto-fix-abc12345',
        })
        expect(mockRecordDeliveryCleanupEvent).toHaveBeenCalledWith(
            expect.objectContaining({ owner: 'acme' }),
            expect.objectContaining({ id: 'run-1' }),
            'dependfix/auto-fix-abc12345',
            'deleted',
        )
    })

    it('head sha 与 PRCheck 不一致（有新提交）→ 跳过删除并记录原因', async () => {
        mockRecordDeliveryCleanupEvent.mockReset()
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            head: { ref: 'dependfix/auto-fix-abc12345', sha: 'b'.repeat(40), repoFullName: 'acme/app' },
        })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

        expect(result).toEqual({ commented: 1, closed: 1, errors: 0 })
        expect(h.deleteRef).not.toHaveBeenCalled()
        expect(mockRecordDeliveryCleanupEvent).toHaveBeenCalledWith(
            expect.anything(), expect.anything(), 'dependfix/auto-fix-abc12345', 'skipped', 'head_sha_mismatch',
        )
    })

    it('fork head / 源仓库缺失 / 非 auto-fix 分支 → 跳过删除（非自有分支零误删）', async () => {
        const cases: { head: { ref: string, sha: string, repoFullName: string | null }, reason: string }[] = [
            { head: { ref: 'dependfix/auto-fix-abc12345', sha: SHA, repoFullName: 'someone/fork' }, reason: 'fork_head' },
            // head.repo 为 null（源仓库已删除 / fork 已删）同样按 fork 跳过
            { head: { ref: 'dependfix/auto-fix-abc12345', sha: SHA, repoFullName: null }, reason: 'fork_head' },
            { head: { ref: 'feature/x', sha: SHA, repoFullName: 'acme/app' }, reason: 'branch_out_of_scope' },
        ]
        for (const { head, reason } of cases) {
            mockRecordDeliveryCleanupEvent.mockReset()
            const h = makeHarness({ prFeedback: '{"closeFailed":true}', run: defaultRun, prCheck: failedCheck, head })
            const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

            expect(result.closed).toBe(1)
            expect(h.deleteRef).not.toHaveBeenCalled()
            expect(mockRecordDeliveryCleanupEvent).toHaveBeenCalledWith(
                expect.anything(), expect.anything(), head.ref, 'skipped', reason,
            )
        }
    })

    it('head 是默认分支（同名）→ 跳过删除', async () => {
        mockRecordDeliveryCleanupEvent.mockReset()
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            defaultBranch: 'dependfix/auto-fix-abc12345',
            head: { ref: 'dependfix/auto-fix-abc12345', sha: SHA, repoFullName: 'acme/app' },
        })
        await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

        expect(h.deleteRef).not.toHaveBeenCalled()
        expect(mockRecordDeliveryCleanupEvent).toHaveBeenCalledWith(
            expect.anything(), expect.anything(), 'dependfix/auto-fix-abc12345', 'skipped', 'default_branch',
        )
    })

    it('仓库全名大小写不同（用户输入 vs GitHub 规范）→ 仍按本仓处理', async () => {
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            head: { ref: 'dependfix/auto-fix-abc12345', sha: SHA, repoFullName: 'Acme/App' },
        })
        await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

        expect(h.deleteRef).toHaveBeenCalledWith({
            owner: 'acme',
            repo: 'app',
            ref: 'heads/dependfix/auto-fix-abc12345',
        })
    })

    it('关闭审计写库失败（SQLITE_BUSY）不阻断分支回收', async () => {
        mockRecordDeliveryCleanupEvent.mockReset()
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            failClosedAudit: true,
        })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

        // 审计抛错会进外层 catch（errors+1），但回收已先执行——分支不会永久残留
        expect(result.closed).toBe(1)
        expect(h.deleteRef).toHaveBeenCalledTimes(1)
        expect(mockRecordDeliveryCleanupEvent).toHaveBeenCalledWith(
            expect.anything(), expect.anything(), 'dependfix/auto-fix-abc12345', 'deleted',
        )
    })

    it('删除失败 → 记 failed 审计，反馈主流程不报错', async () => {
        mockRecordDeliveryCleanupEvent.mockReset()
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            deleteRefError: new Error('Reference does not exist'),
        })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })

        expect(result).toEqual({ commented: 1, closed: 1, errors: 0 })
        expect(mockRecordDeliveryCleanupEvent).toHaveBeenCalledWith(
            expect.anything(), expect.anything(), 'dependfix/auto-fix-abc12345', 'failed', expect.any(String),
        )
    })

    it('非失败结论 / 窗口外 / 无 PRCheck / 无 PR 交付 → 不动作', async () => {
        for (const scenario of [
            { run: defaultRun, prCheck: { ...failedCheck, conclusion: 'success' } },
            { run: { prNumber: 7, finishedAt: hoursAgo(30) }, prCheck: failedCheck },
            { run: defaultRun, prCheck: null },
            { run: null, prCheck: failedCheck },
        ]) {
            const h = makeHarness(scenario as Parameters<typeof makeHarness>[0])
            const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
            expect(result).toEqual({ commented: 0, closed: 0, errors: 0 })
            expect(h.createComment).not.toHaveBeenCalled()
        }
    })

    it('PR 已关闭（终态）→ 不评论、不重复关闭', async () => {
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            prState: 'closed',
        })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(result).toEqual({ commented: 0, closed: 0, errors: 0 })
        expect(h.createComment).not.toHaveBeenCalled()
        expect(h.closePull).not.toHaveBeenCalled()
    })

    it('连续两轮：关闭后 PR 变 closed → 只关闭一次、只写一条审计', async () => {
        let state: 'open' | 'closed' = 'open'
        const h = makeHarness({
            prFeedback: '{"closeFailed":true}',
            run: defaultRun,
            prCheck: failedCheck,
            prState: () => state,
        })
        const first = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(first).toEqual({ commented: 1, closed: 1, errors: 0 })
        state = 'closed'
        const second = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(second).toEqual({ commented: 0, closed: 0, errors: 0 })
        expect(h.closePull).toHaveBeenCalledTimes(1)
        expect(h.savedAudits.filter((audit) => audit.type === 'pr_feedback_closed')).toHaveLength(1)
    })

    it('comment=false 且 closeFailed=false → 直接返回（不发 API 调用）', async () => {
        const h = makeHarness({ prFeedback: '{"comment":false,"closeFailed":false}', run: defaultRun, prCheck: failedCheck })
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now })
        expect(result).toEqual({ commented: 0, closed: 0, errors: 0 })
        expect(h.createComment).not.toHaveBeenCalled()
    })

    it('PR 状态查询失败 → 不动作但计入 errors（fail-safe，不影响轮询）', async () => {
        const h = makeHarness({ prFeedback: '{"closeFailed":true}', run: defaultRun, prCheck: failedCheck })
        h.getPull.mockRejectedValueOnce(new Error('404 Not Found'))
        const logger = { info: vi.fn(), warn: vi.fn() }
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now, logger })
        expect(result).toEqual({ commented: 0, closed: 0, errors: 1 })
        expect(h.createComment).not.toHaveBeenCalled()
        expect(h.closePull).not.toHaveBeenCalled()
    })

    it('评论失败只记 errors 并 warn，不抛出', async () => {
        const h = makeHarness({ run: defaultRun, prCheck: failedCheck, commentError: new Error('boom') })
        const logger = { info: vi.fn(), warn: vi.fn() }
        const result = await runPrFeedbackForRepository({ ds: h.ds, octokit: h.octokit, repositoryId: 'repo-1', now, logger })
        expect(result).toEqual({ commented: 0, closed: 0, errors: 1 })
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('反馈失败'))
    })
})
