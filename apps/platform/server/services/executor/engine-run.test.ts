// engine-run.test.ts — 引擎执行的超时与协作式取消接入面。
//
// 覆盖 2026-10-16 生产复盘暴露的缺口：超时仅"放弃等待"（裸 Promise.race）→ 引擎继续跑并与
// 后续仓库争抢资源。本文件锁定：超时会先请求运行级取消，再以专属错误收尾；
// 取消回调抛错不得掩盖超时判定；宽限期等待有界且不抛错。
import { describe, expect, it, vi } from 'vitest'
import {
    ABORT_GRACE_MS,
    classifyUnsettledCause,
    describeUnsettledRun,
    diffActiveResources,
    ExecutionTimeoutError,
    settleWithin,
    snapshotActiveResources,
    withTimeout,
} from './engine-run'

/** 永不落定的 promise（模拟悬挂的引擎运行）。 */
function pending(): Promise<never> {
    return new Promise<never>(() => { /* never resolves */ })
}

describe('withTimeout', () => {
    it('resolves normally when the promise settles before the limit', async () => {
        const onTimeout = vi.fn()

        const result = await withTimeout(Promise.resolve('done'), 1_000, { onTimeout })

        expect(result).toBe('done')
        expect(onTimeout).not.toHaveBeenCalled()
    })

    it('propagates rejection before the limit without calling onTimeout', async () => {
        const onTimeout = vi.fn()

        await expect(withTimeout(Promise.reject(new Error('boom')), 1_000, { onTimeout }))
            .rejects.toThrow('boom')
        expect(onTimeout).not.toHaveBeenCalled()
    })

    it('calls onTimeout then rejects with ExecutionTimeoutError (execution source)', async () => {
        const onTimeout = vi.fn()

        const error = await withTimeout(pending(), 20, { onTimeout }).catch((err: unknown) => err)

        expect(error).toBeInstanceOf(ExecutionTimeoutError)
        expect((error as ExecutionTimeoutError).source).toBe('execution')
        expect((error as Error).message).toContain('operation timeout after 20ms')
        // 关键：超时先请求运行级取消（终止子进程树 / 停止启动新工作 / 放弃交付）
        expect(onTimeout).toHaveBeenCalledTimes(1)
        expect(onTimeout).toHaveBeenCalledWith(20)
    })

    it('does not mask the timeout error when the cancel callback throws', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* 静音 */ })

        const error = await withTimeout(pending(), 20, {
            onTimeout: () => {
                throw new Error('abort blew up')
            },
        }).catch((err: unknown) => err)

        expect(error).toBeInstanceOf(ExecutionTimeoutError)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('abort blew up'))
        warnSpy.mockRestore()
    })

    it('works without a cancel callback (backward compatible)', async () => {
        const error = await withTimeout(pending(), 20).catch((err: unknown) => err)

        expect(error).toBeInstanceOf(ExecutionTimeoutError)
    })
})

describe('settleWithin', () => {
    it('returns true when the promise settles before the limit', async () => {
        await expect(settleWithin(Promise.resolve('ok'), 1_000)).resolves.toBe(true)
        // reject 同样视为"已落定"（不抛错）
        await expect(settleWithin(Promise.reject(new Error('x')), 1_000)).resolves.toBe(true)
    })

    it('returns false when the limit is reached (never hangs, never throws)', async () => {
        await expect(settleWithin(pending(), 20)).resolves.toBe(false)
    })

    it('defaults to a bounded grace period', () => {
        // 宽限期是运维面常量：取值依据（取消已同步终止子进程树，剩余只是收尾落盘）见模块头注释
        expect(ABORT_GRACE_MS).toBe(10_000)
    })
})

describe('describeUnsettledRun', () => {
    it('reports grace, surviving children, last command and abort reason', () => {
        const text = describeUnsettledRun({
            graceMs: 10_000,
            childProcessCount: 2,
            lastCommand: 'pnpm install --frozen-lockfile',
            abortReason: 'execution timeout (30 分钟上限)',
            activeResourceDelta: { Timeout: 1 },
        })

        expect(text).toContain('未在 10000ms 宽限期内落定')
        expect(text).toContain('取消时刻在管受管子进程 2 个')
        expect(text).toContain('最后命令：pnpm install --frozen-lockfile')
        expect(text).toContain('取消原因：execution timeout (30 分钟上限)')
        // 取消当刻的读数，不得读作「宽限期结束仍在跑」
        expect(text).toContain('诊断分类：在管子进程（取消时刻 2 个，已请求终止）')
        expect(text).toContain('运行期句柄：净增 Timeout×1')
    })

    it('keeps placeholders when no command / reason was recorded', () => {
        const text = describeUnsettledRun({ graceMs: ABORT_GRACE_MS, childProcessCount: 0 })

        expect(text).toContain('取消时刻在管受管子进程 0 个')
        expect(text).toContain('最后命令：（无受管命令记录）')
        expect(text).toContain('取消原因：（未记录）')
        // 未传增量 = 探针未取证，不得写成「无新增句柄」
        expect(text).toContain('诊断分类：无法归类（句柄采集不可用）')
        expect(text).toContain('运行期句柄：采集不可用')
    })

    it('distinguishes leaked handles when no managed child survives', () => {
        const text = describeUnsettledRun({
            graceMs: ABORT_GRACE_MS,
            childProcessCount: 0,
            activeResourceDelta: { Timeout: 1, PipeWrap: 2 },
        })

        // 子进程已停但仍未落定 → 判为「未 settle 句柄」并列出运行期净增类型
        expect(text).toContain('诊断分类：未 settle 句柄（无在管的受管子进程）')
        expect(text).toContain('净增 PipeWrap×2、Timeout×1')
        // 句柄读数是进程级口径，必须写明不归属单次运行
        expect(text).toContain('进程级口径，可能含平台自身连接与并发运行')
    })

    it('does not claim handle leaks when the delta is empty', () => {
        const text = describeUnsettledRun({
            graceMs: ABORT_GRACE_MS,
            childProcessCount: 0,
            activeResourceDelta: {},
        })

        expect(text).toContain('诊断分类：无法归类（无在管的受管子进程、无运行期句柄净增')
        expect(text).toContain('运行期句柄：无净增')
    })
})

describe('classifyUnsettledCause', () => {
    it('prefers surviving child processes over handle deltas', () => {
        expect(classifyUnsettledCause({ graceMs: 10, childProcessCount: 1, activeResourceDelta: { Timeout: 3 } }))
            .toBe('child-processes')
    })

    it('classifies a non-empty runtime handle delta as open handles', () => {
        expect(classifyUnsettledCause({ graceMs: 10, childProcessCount: 0, activeResourceDelta: { PipeWrap: 1 } }))
            .toBe('open-handles')
    })

    it('distinguishes an unavailable probe from a zero delta', () => {
        expect(classifyUnsettledCause({ graceMs: 10, childProcessCount: 0 })).toBe('probe-unavailable')
        expect(classifyUnsettledCause({ graceMs: 10, childProcessCount: 0, activeResourceDelta: {} })).toBe('unknown')
    })

    it('ignores zero counters inside the delta', () => {
        expect(classifyUnsettledCause({ graceMs: 10, childProcessCount: 0, activeResourceDelta: { Timeout: 0 } }))
            .toBe('unknown')
    })
})

describe('snapshotActiveResources / diffActiveResources', () => {
    it('counts handle types and reports an unavailable probe as undefined', () => {
        const spy = vi.spyOn(process, 'getActiveResourcesInfo')
            .mockReturnValue(['TTYWrap', 'Timeout', 'Timeout'])

        try {
            expect(snapshotActiveResources()).toEqual({ TTYWrap: 1, Timeout: 2 })

            spy.mockImplementation(() => {
                throw new Error('probe unavailable')
            })
            // 采集失败不得抛错，也不得伪装成「零句柄」（会把全量快照读成新增）
            expect(snapshotActiveResources()).toBeUndefined()
        } finally {
            spy.mockRestore()
        }
    })

    it('keeps only handles added since the baseline', () => {
        expect(diffActiveResources({ TTYWrap: 1, Timeout: 1 }, { TTYWrap: 1, Timeout: 3, PipeWrap: 1 }))
            .toEqual({ Timeout: 2, PipeWrap: 1 })
        // 基线之外的减少不计入增量（否则会被读成「新增」）
        expect(diffActiveResources({ Timeout: 3 }, { Timeout: 1 })).toEqual({})
    })

    it('returns undefined when either side of the diff is unavailable', () => {
        // 基线不可用 + 当前全量相减会伪造成「新增」，必须显式不可用
        expect(diffActiveResources(undefined, { Timeout: 5 })).toBeUndefined()
        expect(diffActiveResources({ Timeout: 1 }, undefined)).toBeUndefined()
    })

    it('detects a real pending timer added after the baseline', () => {
        const baseline = snapshotActiveResources()
        const timer = setTimeout(() => { /* noop */ }, 60_000)
        try {
            const delta = diffActiveResources(baseline, snapshotActiveResources())
            expect(delta?.Timeout ?? 0).toBeGreaterThanOrEqual(1)
        } finally {
            clearTimeout(timer)
        }
    })
})
