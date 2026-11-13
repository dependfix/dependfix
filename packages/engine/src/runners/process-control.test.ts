// process-control.test.ts — 运行级取消（abort）与受管子进程。
//
// 覆盖 2026-10-16 生产复盘暴露的缺口：平台执行超时后引擎继续跑（同步 execSync 阻塞事件循环 +
// `withTimeout` 只 race 不中断），僵尸 install 与后续仓库争抢内存 → 内核 OOM 级联。
// 本文件锁定两条行为：① abort 后立即终止已登记子进程树且不再启动新命令；
// ② 受管命令的结果形态（退出码 / 信号 / 超时 / errno / 输出限长）。
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach } from 'vitest'
import {
    getAbortReason,
    getAbortSnapshot,
    getLastTrackedCommand,
    isAbortRequested,
    killAllTrackedChildProcesses,
    requestAbort,
    resetProcessControlState,
    resolveShellOption,
    runTrackedCommand,
    trackChildProcess,
    trackedChildProcessCount,
    untrackChildProcess,
} from './process-control'

/** 睡眠命令（真实子进程；用于超时与取消的可观测行为）。 */
function sleepCommand(ms: number): { binary: string, args: string[] } {
    return { binary: process.execPath, args: ['-e', `setTimeout(() => {}, ${ms})`] }
}

beforeEach(() => {
    resetProcessControlState()
})

describe('运行级取消状态', () => {
    it('初始未取消，requestAbort 置位并记录原因', () => {
        expect(isAbortRequested()).toBe(false)
        expect(getAbortReason()).toBeUndefined()

        requestAbort('execution timeout')

        expect(isAbortRequested()).toBe(true)
        expect(getAbortReason()).toBe('execution timeout')
    })

    it('幂等：重复调用保留首次原因', () => {
        requestAbort('first')

        requestAbort('second')

        expect(getAbortReason()).toBe('first')
    })

    it('未提供原因时使用占位文案', () => {
        requestAbort()

        expect(getAbortReason()).toBe('abort requested')
    })

    it('resetProcessControlState 清除取消状态与登记表', () => {
        requestAbort('x')
        trackChildProcess(12345)

        resetProcessControlState()

        expect(isAbortRequested()).toBe(false)
        expect(trackedChildProcessCount()).toBe(0)
    })

    it('记录最近一条受管命令并随复位清空（取消未落定的诊断面）', async () => {
        expect(getLastTrackedCommand()).toBeUndefined()

        await runTrackedCommand({ binary: process.execPath, args: ['-e', 'process.exit(0)'], cwd: tmpdir(), timeoutMs: 5_000 })
        expect(getLastTrackedCommand()).toBe(`${process.execPath} -e process.exit(0)`)

        resetProcessControlState()
        expect(getLastTrackedCommand()).toBeUndefined()
    })

    it('受管命令超过 200 字符时截断记录', async () => {
        const longArg = `process.exit(0)${' '.repeat(300)}`
        await runTrackedCommand({ binary: process.execPath, args: ['-e', longArg], cwd: tmpdir(), timeoutMs: 5_000 })

        const recorded = getLastTrackedCommand() ?? ''
        expect(recorded.endsWith('…')).toBe(true)
        expect(recorded.length).toBeLessThanOrEqual(201)
    })

    it('取消时刻快照记录在管子进程数（kill 清空登记表后仍可回答）', async () => {
        const command = sleepCommand(2_000)
        const run = runTrackedCommand({ ...command, cwd: tmpdir(), timeoutMs: 5_000 })
        // 等子进程真正登记（spawn 是异步的）
        for (let i = 0; i < 50 && trackedChildProcessCount() === 0; i++) {
            await new Promise((resolve) => setTimeout(resolve, 10))
        }
        expect(trackedChildProcessCount()).toBe(1)

        requestAbort('execution timeout')

        // 登记表被立即清空，但快照保留取消当刻的现场
        expect(trackedChildProcessCount()).toBe(0)
        expect(getAbortSnapshot()).toMatchObject({ trackedCount: 1 })
        expect(getAbortSnapshot()?.lastCommand).toContain('setTimeout')

        // 重复取消（引擎自取消 + 平台超时）不覆盖首次现场：与 abortReason 同口径
        requestAbort('execution timeout again')
        expect(getAbortReason()).toBe('execution timeout')
        expect(getAbortSnapshot()).toMatchObject({ trackedCount: 1 })
        await run
    })

    it('trackChildProcess 忽略非法 PID，untrackChildProcess 幂等', () => {
        trackChildProcess(undefined)
        trackChildProcess(0)
        trackChildProcess(-1)
        expect(trackedChildProcessCount()).toBe(0)

        trackChildProcess(4242)
        expect(trackedChildProcessCount()).toBe(1)
        untrackChildProcess(4242)
        untrackChildProcess(4242)
        expect(trackedChildProcessCount()).toBe(0)
    })

    it('无登记子进程时 killAllTrackedChildProcesses 返回 0', () => {
        expect(killAllTrackedChildProcesses()).toBe(0)
    })
})

describe('平台分支（Windows 的 .cmd 包裹须经 shell）', () => {
    it('仅 Windows 经 shell 执行（其余平台保持直接 spawn）', () => {
        expect(resolveShellOption('win32')).toBe(true)
        expect(resolveShellOption('linux')).toBe(false)
        expect(resolveShellOption('darwin')).toBe(false)
    })

    it('显式 shell 覆盖优先于平台判定', async () => {
        const result = await runTrackedCommand({
            binary: process.execPath,
            args: ['-e', 'process.stdout.write(String(process.pid > 0))'],
            cwd: process.cwd(),
            timeoutMs: 30_000,
            shell: false,
        })

        expect(result.started).toBe(true)
        expect(result.exitCode).toBe(0)
    })
})

describe('runTrackedCommand', () => {
    it('成功命令：退出码 0 + 捕获 stdout/stderr + 退出后注销登记', async () => {
        const result = await runTrackedCommand({
            binary: process.execPath,
            args: ['-e', 'console.log("out"); console.error("err")'],
            cwd: process.cwd(),
            timeoutMs: 30_000,
        })

        expect(result.exitCode).toBe(0)
        expect(result.timedOut).toBe(false)
        expect(result.signal).toBeNull()
        expect(result.aborted).toBe(false)
        expect(result.stdout).toContain('out')
        expect(result.stderr).toContain('err')
        expect(trackedChildProcessCount()).toBe(0)
    })

    it('多字节字符跨 chunk 边界不被切断（StringDecoder）', async () => {
        // 「中」的 UTF-8 编码是 3 字节：分两次 write（前 2 字节 + 后 1 字节）——
        // 按 chunk 直接 toString 会乱码，StringDecoder 才能拼回完整字符
        const script = [
            'process.stdout.write(Buffer.from([0xE4, 0xB8]))',
            'setTimeout(() => { process.stdout.write(Buffer.from([0xAD])) }, 50)',
        ].join(';')
        const result = await runTrackedCommand({
            binary: process.execPath,
            args: ['-e', script],
            cwd: process.cwd(),
            timeoutMs: 30_000,
        })

        expect(result.exitCode).toBe(0)
        expect(result.stdout).toBe('中')
    })

    it('非零退出不抛错（结果形态暴露退出码与 stderr）', async () => {
        const result = await runTrackedCommand({
            binary: process.execPath,
            args: ['-e', 'console.error("boom"); process.exit(3)'],
            cwd: process.cwd(),
            timeoutMs: 30_000,
        })

        expect(result.exitCode).toBe(3)
        expect(result.stderr).toContain('boom')
        expect(result.timedOut).toBe(false)
    })

    it('超过 timeoutMs 时终止（timedOut 标记 + 子进程被杀）', async () => {
        const sleep = sleepCommand(30_000)

        const result = await runTrackedCommand({
            binary: sleep.binary,
            args: sleep.args,
            cwd: process.cwd(),
            timeoutMs: 200,
        })

        expect(result.timedOut).toBe(true)
        expect(result.exitCode).not.toBe(0)
        expect(result.durationMs).toBeLessThan(30_000)
        expect(trackedChildProcessCount()).toBe(0)
        if (process.platform !== 'win32') {
            expect(result.signal).toBe('SIGKILL')
        }
    })

    it('直接子进程退出但孙进程持有管道时，有界宽限期后落定', async () => {
        // 场景：安装脚本派生一个继承 stdout/stderr 的孙进程后自身退出。Node 的 `close`
        // 要等所有写端关闭才触发，孙进程不退出时旧实现会一直挂起（实测把 5 分钟超时拖到 12 分钟）。
        const pidFile = join(tmpdir(), `dependfix-grandchild-${process.pid}-${Date.now()}.pid`)
        const script = `
            const { spawn } = require('node:child_process');
            const fs = require('node:fs');
            const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], {
                stdio: ['ignore', 'inherit', 'inherit'],
            });
            fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
            setTimeout(() => process.exit(0), 20);
        `
        const startedAt = Date.now()
        try {
            const result = await runTrackedCommand({
                binary: process.execPath,
                args: ['-e', script],
                cwd: process.cwd(),
                timeoutMs: 30_000,
                // 直接 spawn node：脚本含换行 / 单引号，Windows 的 cmd 会把换行当命令分隔
                shell: false,
            })

            expect(result.exitCode).toBe(0)
            expect(result.timedOut).toBe(false)
            // 宽限期 2s；无兜底时本用例会等到孙进程 10s 后退出（8s 阈值留出 CI 负载余量）
            expect(Date.now() - startedAt).toBeLessThan(8_000)
        } finally {
            try {
                const pid = Number.parseInt(readFileSync(pidFile, 'utf-8'), 10)
                if (Number.isInteger(pid) && pid > 0) {
                    process.kill(pid)
                }
            } catch {
                // 孙进程已退出 / PID 文件未写入：无需清理
            }
            rmSync(pidFile, { force: true })
        }
    })

    it('超时且孙进程逃逸持有管道时，超时 + 宽限期后落定', async () => {
        // 真实事故路径：直接子进程 hang 住，孙进程以 detached 逃出进程组并继承 stdout/stderr。
        // kill 进程组收掉直接子进程后，孙进程仍持有管道 → `close` 不来；必须有超时 + 宽限期兜底。
        const pidFile = join(tmpdir(), `dependfix-escape-${process.pid}-${Date.now()}.pid`)
        const script = `
            const { spawn } = require('node:child_process');
            const fs = require('node:fs');
            const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
                detached: true, stdio: ['ignore', 'inherit', 'inherit'],
            });
            fs.writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
            setTimeout(() => {}, 30000);
        `
        const startedAt = Date.now()
        try {
            const result = await runTrackedCommand({
                binary: process.execPath,
                args: ['-e', script],
                cwd: process.cwd(),
                timeoutMs: 200,
                shell: false,
            })

            expect(result.timedOut).toBe(true)
            // 直接子进程已被 SIGKILL 收掉，不应标记 termination unconfirmed
            expect(result.terminationUnconfirmed).toBeUndefined()
            expect(Date.now() - startedAt).toBeLessThan(8_000)
        } finally {
            try {
                const pid = Number.parseInt(readFileSync(pidFile, 'utf-8'), 10)
                if (Number.isInteger(pid) && pid > 0) {
                    process.kill(pid)
                }
            } catch {
                // 孙进程已退出 / PID 文件未写入
            }
            rmSync(pidFile, { force: true })
        }
    })

    it('运行中 requestAbort：命令被终止且结果标记 aborted', async () => {
        const sleep = sleepCommand(30_000)
        const pending = runTrackedCommand({
            binary: sleep.binary,
            args: sleep.args,
            cwd: process.cwd(),
            timeoutMs: 30_000,
        })

        // 等子进程真正登记在案再取消（否则取消发生在 spawn 之前，测不到"终止运行中子进程"）
        await waitFor(() => trackedChildProcessCount() > 0)
        requestAbort('execution timeout')

        const result = await pending

        expect(result.aborted).toBe(true)
        expect(result.exitCode).not.toBe(0)
        expect(result.durationMs).toBeLessThan(30_000)
        expect(trackedChildProcessCount()).toBe(0)
    })

    it('已请求取消：不启动子进程（started=false 且登记表为空）', async () => {
        requestAbort('execution timeout')

        const sleep = sleepCommand(30_000)
        const result = await runTrackedCommand({
            binary: sleep.binary,
            args: sleep.args,
            cwd: process.cwd(),
            timeoutMs: 30_000,
        })

        // 取消是"单一入口"守卫：返回占位结果而非抛错，且**不产生任何子进程**
        expect(result.started).toBe(false)
        expect(result.aborted).toBe(true)
        expect(result.exitCode).toBeNull()
        expect(result.timedOut).toBe(false)
        expect(trackedChildProcessCount()).toBe(0)
    })

    it('工具链缺失：errno 暴露 ENOENT，退出码为 null', async () => {
        const result = await runTrackedCommand({
            binary: 'dependfix-definitely-missing-binary',
            args: [],
            cwd: process.cwd(),
            timeoutMs: 5_000,
        })

        expect(result.exitCode).toBeNull()
        expect(result.signal).toBeNull()
        expect(result.errno).toBe('ENOENT')
    })

    it('大输出限长累积（继续 drain 但不再累积，防大输出吃内存）', async () => {
        const chunk = 'x'.repeat(64 * 1024)
        const result = await runTrackedCommand({
            binary: process.execPath,
            // 输出约 1.5 MiB（> 1 MiB 捕获上限）
            args: ['-e', `for (let i = 0; i < 24; i++) process.stdout.write('${chunk}')`],
            cwd: process.cwd(),
            timeoutMs: 30_000,
        })

        expect(result.exitCode).toBe(0)
        expect(result.stdout.length).toBeGreaterThan(0)
        expect(result.stdout.length).toBeLessThanOrEqual(1024 * 1024 + chunk.length)
    })
})

/** 轮询等待条件成立（避免依赖固定 sleep 的脆弱测试）。 */
async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate()) {
        if (Date.now() > deadline) {
            throw new Error('waitFor timeout')
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
}
