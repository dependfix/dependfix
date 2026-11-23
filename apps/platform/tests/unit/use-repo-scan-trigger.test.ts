import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
    useRepoScanTrigger,
    type ScanPollResponse,
    type ScanTriggerResponse,
} from '../../app/composables/use-repo-scan-trigger'
import type { RepoView } from '../../app/types/platform'

/**
 * use-repo-scan-trigger 单测：单仓库扫描触发的响应分支与轮询状态机（自 repos.vue 拆出）。
 *
 * 覆盖「合并/入队完成/入队失败/发布/直接完成/未知状态/轮询失败/轮询超时/请求异常」九条分支；
 * 浏览器侧轮询与列表刷新由 `tests/e2e/repos-crud.e2e.test.ts` 与 `scan-config.e2e.test.ts` 覆盖。
 */

const repo = (over: Partial<RepoView> = {}): RepoView => ({
    id: 'repo-1',
    owner: 'acme',
    name: 'app',
    platform: 'github',
    defaultBranch: 'main',
    packageManager: 'pnpm',
    credentialId: null,
    credentialName: null,
    actionWorkflowFile: null,
    executorKind: 'container',
    sandboxImage: null,
    note: null,
    tags: [],
    verifyCommands: [],
    prCheckFocus: null,
    vercelProjectId: null,
    cloudflareAccountId: null,
    cloudflareWorkerTag: null,
    executionTimeoutMs: null,
    verifyCommandTimeoutMs: null,
    installTimeoutMs: null,
    cloneTimeoutMs: null,
    allowMajorUpgrade: false,
    aiEnabled: false,
    aiTrigger: 'both',
    lastScanAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
})

const t = (key: string, params?: Record<string, string | number>) =>
    params ? `${key}|${JSON.stringify(params)}` : key

interface SetupOptions {
    response?: ScanTriggerResponse | Error
    polls?: ScanPollResponse[]
    timeoutMs?: number
    actionTimeoutMs?: number
}

const setup = ({ response = { id: 'run-1', status: 'completed', runUrl: null }, polls = [], timeoutMs = 60_000, actionTimeoutMs = 60_000 }: SetupOptions = {}) => {
    let now = 0
    const request = vi.fn(async () => {
        if (response instanceof Error) {
            throw response
        }
        return response
    })
    const pollResponses = [...polls]
    const poll = vi.fn(async (): Promise<ScanPollResponse> => pollResponses.shift() ?? { ok: true, run: { status: 'running', runUrl: null } })
    const refresh = vi.fn(() => Promise.resolve())
    // 每次 sleep 推进时钟：避免依赖真实定时器，又能覆盖超时分支
    const sleep = vi.fn(async (ms: number) => {
        now += ms
    })
    const scope = effectScope()
    const trigger = scope.run(() => useRepoScanTrigger({
        t,
        request,
        poll,
        refresh,
        sleep,
        now: () => now,
        pollIntervalMs: 2000,
        pollTimeoutMs: timeoutMs,
        actionPollTimeoutMs: actionTimeoutMs,
    }))!
    return { trigger, request, poll, refresh, sleep, scope }
}

describe('useRepoScanTrigger', () => {
    it('合并（merged）→ 只提示合并语义，不轮询，仍刷新列表', async () => {
        const { trigger, request, poll, refresh } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null, merged: { code: 'SCAN_PENDING_MERGED', message: 'merged' } },
        })

        await trigger.triggerScan(repo(), 'fix', 'high')

        expect(request).toHaveBeenCalledWith('repo-1', {
            mode: 'fix',
            severityThreshold: 'high',
            executorKind: undefined,
            aiEnabled: false,
            aiTrigger: 'both',
        })
        expect(poll).not.toHaveBeenCalled()
        expect(trigger.scanMerged.value).toBe('common.scanTriggerMerged')
        expect(trigger.scanSuccess.value).toBe('')
        expect(refresh).toHaveBeenCalledTimes(1)
        expect(trigger.scanningId.value).toBeNull()
    })

    it('入队后轮询到 completed → 成功提示', async () => {
        const { trigger, poll } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'running', runUrl: null } }, { ok: true, run: { status: 'completed', runUrl: null } }],
        })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanSuccess.value).toBe('repos.scanCompleted')
        expect(poll).toHaveBeenCalledTimes(2)
    }, 10_000)

    it('轮询到 failed + SCAN_PENDING_MERGED → 合并提示（清掉 success）', async () => {
        const { trigger } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'failed', runUrl: null, error: { code: 'SCAN_PENDING_MERGED' } } }],
        })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanMerged.value).toBe('common.scanTriggerMerged')
        expect(trigger.scanSuccess.value).toBe('')
        expect(trigger.scanError.value).toBe('')
    })

    it('轮询到一般 failed → 失败提示带服务端 message', async () => {
        const { trigger } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'failed', runUrl: null, error: { message: 'boom' } } }],
        })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanError.value).toBe('repos.scanFailed|{"message":"boom"}')
    })

    it('轮询到 dispatched → 记录 run URL，并区分是否带 URL 的提示', async () => {
        const withUrl = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'dispatched', runUrl: 'https://example.com/run/1' } }],
        })
        await withUrl.trigger.triggerScan(repo({ executorKind: 'github-action' }), 'report-only', 'high')
        expect(withUrl.trigger.lastRunUrl.value).toBe('https://example.com/run/1')
        expect(withUrl.trigger.scanSuccess.value).toBe('repos.scanDispatchedWithUrl')

        const noUrl = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'dispatched', runUrl: null } }],
        })
        await noUrl.trigger.triggerScan(repo({ executorKind: 'github-action' }), 'report-only', 'high')
        expect(noUrl.trigger.scanSuccess.value).toBe('repos.scanDispatched')
    })

    it('直接 completed → 成功提示，不轮询', async () => {
        const { trigger, poll } = setup({ response: { id: 'run-1', status: 'completed', runUrl: null } })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanSuccess.value).toBe('repos.scanCompleted')
        expect(poll).not.toHaveBeenCalled()
    })

    it('未知终态 → 失败提示（回退 unknown 文案）', async () => {
        const { trigger } = setup({ response: { id: 'run-1', status: 'weird', runUrl: null, error: null } })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanError.value).toBe('repos.scanFailed|{"message":"common.errors.unknown"}')
    })

    it('轮询响应非 2xx → 查询失败提示并停止轮询', async () => {
        const { trigger, poll } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: false }],
        })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanError.value).toBe('repos.scanStatusQueryFailed')
        expect(poll).toHaveBeenCalledTimes(1)
    })

    it('轮询超时 → 提示仍在进行，不报错', async () => {
        const { trigger, poll } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'running', runUrl: null } }, { ok: true, run: { status: 'running', runUrl: null } }],
            timeoutMs: 4000,
        })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanSuccess.value).toBe('repos.scanInProgress')
        expect(trigger.scanError.value).toBe('')
        expect(poll).toHaveBeenCalledTimes(2)
    })

    it('请求抛错 → 触发失败提示，列表仍不刷新成功语义', async () => {
        const { trigger, refresh } = setup({ response: Object.assign(new Error('nope'), { data: { message: 'oops' } }) })

        await trigger.triggerScan(repo(), 'report-only', 'high')

        expect(trigger.scanError.value).toBe('repos.errors.triggerFailed|{"message":"oops"}')
        expect(refresh).not.toHaveBeenCalled()
        expect(trigger.scanningId.value).toBeNull()
    })

    it('GitHub Action 模式：请求体显式携带 executorKind，且按 30min 上限轮询', async () => {
        const { trigger, request, poll } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            // 始终 running：只有 Action 上限（60s）会继续轮询，容器上限（4s）会在 2 次后停止
            polls: Array.from({ length: 20 }, () => ({ ok: true, run: { status: 'running', runUrl: null } }) as const),
            timeoutMs: 4000,
            actionTimeoutMs: 60_000,
        })

        await trigger.triggerScan(repo({ executorKind: 'github-action' }), 'report-only', 'high')

        expect(request).toHaveBeenCalledWith('repo-1', {
            mode: 'report-only',
            severityThreshold: 'high',
            executorKind: 'github-action',
            aiEnabled: false,
            aiTrigger: 'both',
        })
        expect(poll.mock.calls.length).toBeGreaterThan(2)
        expect(trigger.scanSuccess.value).toBe('repos.scanInProgress')
    })

    it('作用域释放后轮询停止（不继续请求）', async () => {
        const { trigger, poll, scope } = setup({
            response: { id: 'run-1', status: 'pending', runUrl: null },
            polls: [{ ok: true, run: { status: 'running', runUrl: null } }],
        })
        const pending = trigger.triggerScan(repo(), 'report-only', 'high')
        scope.stop()
        await pending

        // 入队提示已写入，但作用域释放后不再发起轮询、也不再改写成「仍在进行」
        expect(trigger.scanSuccess.value).toBe('repos.scanQueued')
        expect(poll).not.toHaveBeenCalled()
    })
})
