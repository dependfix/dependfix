// verification-runner.oom.test.ts — 命令级 OOM 判定（与运行级 cgroup OOM 分层）。
//
// 判据三选一：SIGKILL / 退出码 137 / 堆错误文本；本次运行主动发起的超时与取消不算 OOM。
// 背景：运行日志复盘发现 `completed` 运行同时输出「OOM 终止：是」，把命令级 OOM 读成运行级。
import { describe, expect, it } from 'vitest'
import { isCommandOomKilled } from './verification-runner'

describe('isCommandOomKilled', () => {
    it('SIGKILL / 退出码 137 视为命令级 OOM', () => {
        expect(isCommandOomKilled({ exitCode: -1, signal: 'SIGKILL' })).toBe(true)
        expect(isCommandOomKilled({ exitCode: 137 })).toBe(true)
    })

    it('堆错误文本视为命令级 OOM（退出码可能是 1 / 134）', () => {
        expect(isCommandOomKilled({
            exitCode: 134,
            output: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
        })).toBe(true)
        expect(isCommandOomKilled({ exitCode: 1, output: 'JavaScript heap out of memory' })).toBe(true)
    })

    it('普通非零退出不算 OOM', () => {
        expect(isCommandOomKilled({ exitCode: 1, output: 'ERR_PNPM_BROKEN_LOCKFILE' })).toBe(false)
        expect(isCommandOomKilled({ exitCode: 0, output: 'ok' })).toBe(false)
    })

    it('本次运行主动发起的超时 / 取消不算 OOM（由各自语义承载）', () => {
        expect(isCommandOomKilled({ exitCode: 137, timedOut: true })).toBe(false)
        expect(isCommandOomKilled({ exitCode: 137, aborted: true })).toBe(false)
    })
})
