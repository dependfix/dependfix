import { spawn } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * entrypoint.sh 队列 worker 看护行为测试（任务登记见 docs/plan/todo.md §M40.4）。
 *
 * 以真实 shell 执行 entrypoint.sh，通过 PATH 注入 id / sleep / date 桩：
 * - id 桩固定返回非 root（100/101），绕过降权链路，聚焦进程编排；
 * - sleep 桩置零，使崩溃重启在测试内即时发生；
 * - date 桩（仅稳定性场景）让运行时长快进到稳定窗口之上。
 * 命令桩（stub）以 NUXT_IN_PROCESS_WORKER 区分 worker / HTTP 两种身份。
 *
 * 仅 POSIX shell 环境运行（Windows 跳过；CI 为 ubuntu）。
 */

const skipOnWindows = process.platform === 'win32'
const entrypointPath = join(dirname(fileURLToPath(import.meta.url)), 'entrypoint.sh')

const active = []

const writeExecutable = (path, content) => {
    writeFileSync(path, content)
    chmodSync(path, 0o755)
}

const makeStub = (root, body) => {
    const path = join(root, 'stub.sh')
    writeExecutable(path, `#!/bin/sh\n${body}\n`)
    return path
}

const makeShims = (root, { dateShim = false } = {}) => {
    const bin = join(root, 'bin')
    mkdirSync(bin)
    writeExecutable(join(bin, 'id'), `#!/bin/sh
case "$*" in
    *-u*) echo 100 ;;
    *-g*) echo 101 ;;
    *) echo "uid=100(test) gid=101(test)" ;;
esac
`)
    // 退避 sleep 置零：崩溃重启即时发生，避免测试等待
    writeExecutable(join(bin, 'sleep'), `#!/bin/sh
exit 0
`)
    if (dateShim) {
        const counter = join(root, 'date-counter')
        writeFileSync(counter, '0')
        writeExecutable(join(bin, 'date'), `#!/bin/sh
case "$*" in
    *%s*)
        n="$(cat '${counter}')"
        n=$(( n + 120 ))
        printf '%s\\n' "$n" > '${counter}'
        printf '%s\\n' "$n"
        ;;
    *)
        printf '%s\\n' "2026-01-01T00:00:00Z"
        ;;
esac
`)
    }
    return bin
}

const start = ({ stub, env = {}, dateShim = false }) => {
    const root = mkdtempSync(join(tmpdir(), 'entrypoint-test-'))
    const bin = makeShims(root, { dateShim })
    const dataDir = join(root, 'data')
    const homeDir = join(root, 'home')
    mkdirSync(dataDir)
    mkdirSync(homeDir)
    const stubPath = makeStub(root, stub)

    const baseEnv = { ...process.env }
    delete baseEnv.DEPENDFIX_QUEUE_WORKER
    delete baseEnv.NUXT_QUEUE_ENABLED

    const child = spawn('sh', [entrypointPath, stubPath], {
        env: {
            ...baseEnv,
            PATH: `${bin}:${process.env.PATH}`,
            DATA_DIR: dataDir,
            HOME: homeDir,
            DEPENDFIX_ALLOW_ANY_DIR: '1',
            DEPENDFIX_QUEUE_WORKER_SOCKET: join(root, 'worker.sock'),
            ...env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
        output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
        output += chunk.toString()
    })

    const handle = { child, root, output: () => output, exited: undefined }
    child.on('exit', (code, signal) => {
        handle.exited = { code, signal }
    })
    active.push(handle)
    return handle
}

const waitFor = async (predicate, { timeout = 5000, interval = 10 } = {}) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
        if (predicate()) {
            return
        }
        await new Promise((resolve) => setTimeout(resolve, interval))
    }
    throw new Error('waitFor 超时')
}

const waitExit = (handle) => {
    if (handle.exited) {
        return Promise.resolve(handle.exited)
    }
    return new Promise((resolve) => {
        handle.child.on('exit', (code, signal) => resolve({ code, signal }))
    })
}

const terminate = async (handle) => {
    handle.child.kill('SIGTERM')
    return waitExit(handle)
}

const alive = (pid) => {
    try {
        process.kill(pid, 0)
        return true
    } catch {
        return false
    }
}

afterEach(() => {
    for (const handle of active.splice(0)) {
        try {
            handle.child.kill('SIGKILL')
        } catch {
            /* 进程可能已退出 */
        }
        rmSync(handle.root, { recursive: true, force: true })
    }
})

describe.skipIf(skipOnWindows)('entrypoint.sh 队列 worker 看护', () => {
    it('默认单进程形态：未设 DEPENDFIX_QUEUE_WORKER 时直接执行命令', async () => {
        const handle = start({
            stub: 'echo single-mode-marker\nexit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        const { code } = await waitExit(handle)
        expect(code).toBe(0)
        expect(handle.output()).toContain('single-mode-marker')
        expect(handle.output()).not.toContain('看护进程')
    })

    it('worker 与强制同步冲突：warn 后降级单进程', async () => {
        const handle = start({
            stub: 'echo conflict-marker\nexit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'false' },
        })
        const { code } = await waitExit(handle)
        expect(code).toBe(0)
        expect(handle.output()).toContain('冲突，跳过独立 worker 进程')
        expect(handle.output()).toContain('conflict-marker')
        expect(handle.output()).not.toContain('看护进程')
    })

    it('双进程形态：启动看护循环，容器停止时清理 worker 与看护', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exec tail -f /dev/null\nfi\nexec tail -f /dev/null',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true' },
        })
        await waitFor(() => /看护进程 pid=\d+/.test(handle.output()))
        await waitFor(() => /队列 worker 进程 pid=\d+/.test(handle.output()))
        const supervisorPid = Number(handle.output().match(/看护进程 pid=(\d+)/)[1])
        const workerPid = Number(handle.output().match(/队列 worker 进程 pid=(\d+)/)[1])
        expect(Number.isFinite(supervisorPid)).toBe(true)
        expect(Number.isFinite(workerPid)).toBe(true)

        const { code } = await terminate(handle)
        expect(code).toBe(143)
        // 容器停止后 worker 与看护循环均被终止（不再留驻），且不再触发重启
        await waitFor(() => !alive(supervisorPid))
        await waitFor(() => !alive(workerPid))
        expect(handle.output()).not.toContain('次重启')
    })

    it('worker 崩溃：自动重启并记录退出码 / 次数 / 时间', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 3\nfi\nexec tail -f /dev/null',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true' },
        })
        await waitFor(() => handle.output().includes('第 1 次重启'))
        const output = handle.output()
        expect(output).toContain('exit=3')
        expect(output).toContain('退避 1s')
        expect(output).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/)
        await terminate(handle)
    })

    it('连续重启超过上限：停止自动重启且 HTTP 进程不受影响', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 7\nfi\nexec tail -f /dev/null',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true' },
        })
        await waitFor(() => handle.output().includes('停止自动重启'))
        const output = handle.output()
        expect(output).toContain('连续重启 5 次')
        expect(output).toContain('exit=7')
        expect(output.match(/第 \d+ 次重启/g)).toHaveLength(5)
        await terminate(handle)
    })

    it('worker 稳定运行后崩溃：连续重启计数归零（不触发上限）', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 1\nfi\nexec tail -f /dev/null',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true' },
            dateShim: true,
        })
        // 稳定窗口（60s）快进后每次崩溃都视为「首次连续重启」，计数归零 → 永远停留在第 1 次
        await waitFor(() => (handle.output().match(/第 \d+ 次重启/g) || []).length >= 6)
        const output = handle.output()
        expect(output).not.toContain('停止自动重启')
        expect(output).not.toContain('第 2 次重启')
        await terminate(handle)
    })
})
