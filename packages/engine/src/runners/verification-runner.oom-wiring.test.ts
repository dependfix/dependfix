// verification-runner.oom-wiring.test.ts — 命令级 OOM 的**接线**（信号捕获 / 取消排除）。
//
// 纯函数判据见 `verification-runner.oom.test.ts`；本文件锁定真实执行路径：
// `cp.on('exit', (code, signal))` 必须把信号传给 `isCommandOomKilled`，
// 且本次运行主动取消导致的 SIGKILL 不得被记成 OOM。
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MockChildProcess extends EventEmitter {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
}

const { mockSpawn } = vi.hoisted(() => ({ mockSpawn: vi.fn() }))

vi.mock('node:child_process', () => ({ spawn: mockSpawn, spawnSync: vi.fn() }))

import { requestAbort, resetProcessControlState } from './process-control'
import { runVerification } from './verification-runner'

function makeCp(exit: { code: number | null, signal?: NodeJS.Signals | null }): MockChildProcess {
    const cp = new EventEmitter() as MockChildProcess
    cp.stdout = new EventEmitter()
    cp.stderr = new EventEmitter()
    cp.kill = vi.fn(() => cp.emit('close', null))
    return cp
}

const runOne = (cp: MockChildProcess) => {
    mockSpawn.mockReturnValueOnce(cp)
    return runVerification({
        workDir: '/tmp/oom-wiring',
        commands: ['pnpm test'],
        networkAuditDisabled: true,
    })
}

describe('runVerification 命令级 OOM 接线', () => {
    beforeEach(() => {
        mockSpawn.mockReset()
        resetProcessControlState()
    })

    afterEach(() => {
        resetProcessControlState()
    })

    it('exit 携带 SIGKILL 时记 oomKilled（信号必须透传）', async () => {
        const cp = makeCp({ code: null, signal: 'SIGKILL' })
        const pending = runOne(cp)
        cp.emit('exit', null, 'SIGKILL')
        cp.emit('close', null)

        const result = await pending

        expect(result.commandResults[0]).toMatchObject({ exitCode: -1, oomKilled: true })
    })

    it('退出码 137 时记 oomKilled', async () => {
        const cp = makeCp({ code: 137 })
        const pending = runOne(cp)
        cp.emit('exit', 137, null)
        cp.emit('close', 137)

        const result = await pending

        expect(result.commandResults[0]?.oomKilled).toBe(true)
    })

    it('长输出（>200 行）尾部的堆错误文本仍判 OOM（探针取原始尾部）', async () => {
        const cp = makeCp({ code: 1 })
        const pending = runOne(cp)
        const long = Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n')
        cp.stdout.emit('data', Buffer.from(`${long}\nFATAL ERROR: Reached heap limit\n`))
        cp.emit('exit', 1, null)
        cp.emit('close', 1)

        const result = await pending

        expect(result.commandResults[0]?.oomKilled).toBe(true)
    })

    it('本次运行主动取消导致的 SIGKILL 不算 OOM', async () => {
        const cp = makeCp({ code: null, signal: 'SIGKILL' })
        const pending = runOne(cp)
        requestAbort('test abort')
        cp.emit('exit', null, 'SIGKILL')
        cp.emit('close', null)

        const result = await pending

        expect(result.commandResults[0]?.oomKilled).toBeUndefined()
    })
})
