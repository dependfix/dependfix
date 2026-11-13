// engine-run.test.ts — 引擎执行的超时与协作式取消接入面。
//
// 覆盖 2026-10-16 生产复盘暴露的缺口：超时仅"放弃等待"（裸 Promise.race）→ 引擎继续跑并与
// 后续仓库争抢资源。本文件锁定：超时会先请求运行级取消，再以专属错误收尾；
// 取消回调抛错不得掩盖超时判定；宽限期等待有界且不抛错。
import { describe, expect, it, vi } from 'vitest'
import { ABORT_GRACE_MS, describeUnsettledRun, ExecutionTimeoutError, settleWithin, withTimeout } from './engine-run'

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
        })

        expect(text).toContain('未在 10000ms 宽限期内落定')
        expect(text).toContain('取消时刻在管受管子进程 2 个')
        expect(text).toContain('最后命令：pnpm install --frozen-lockfile')
        expect(text).toContain('取消原因：execution timeout (30 分钟上限)')
    })

    it('keeps placeholders when no command / reason was recorded', () => {
        const text = describeUnsettledRun({ graceMs: ABORT_GRACE_MS, childProcessCount: 0 })

        expect(text).toContain('取消时刻在管受管子进程 0 个')
        expect(text).toContain('最后命令：（无受管命令记录）')
        expect(text).toContain('取消原因：（未记录）')
    })
})
