import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * entrypoint.sh 队列 worker 看护行为测试（任务登记见 docs/plan/todo-archive.md §M40.4）。
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

const makeShims = (root, { dateShim = false, sleepStub = 'exit 0', rootUid = false, denyStore = false } = {}) => {
    const bin = join(root, 'bin')
    mkdirSync(bin)
    // rootUid：模拟入口以 root 启动（`id -u` 无参 → 0），此时入口走 chown + su-exec 降权路径；
    // 带参查询（`id -u dependfix`）仍返回镜像内非 root uid，供 PUID/PGID 缺省解析。
    writeExecutable(join(bin, 'id'), `#!/bin/sh
case "$*" in
    "-u") echo ${rootUid ? '0' : '100'} ;;
    "-g") echo ${rootUid ? '0' : '101'} ;;
    *-u*) echo 100 ;;
    *-g*) echo 101 ;;
    *) echo "uid=100(test) gid=101(test)" ;;
esac
`)
    if (rootUid) {
        // chown 桩：真实 chown 会改动测试目录属主，这里只记录实参（用于断言不对 store 路径 chown）
        writeExecutable(join(bin, 'chown'), `#!/bin/sh
if [ -n "$STUB_CHOWN_LOG" ]; then
    echo "$*" >> "$STUB_CHOWN_LOG"
fi
exit 0
`)
        // su-exec 桩：按运行身份执行（本机无法真正 setuid 到 100），并支持模拟「运行身份不可写」。
        // 记录调用参数：用于断言 store 目录是**以运行身份**创建的（非 root 建目录后 chown）。
        writeExecutable(join(bin, 'su-exec'), `#!/bin/sh
if [ "${denyStore ? '1' : '0'}" = "1" ] && [ "$2" = "sh" ]; then
    exit 1
fi
if [ -n "$STUB_SUEXEC_LOG" ]; then
    echo "$*" >> "$STUB_SUEXEC_LOG"
fi
shift
exec "$@"
`)
    }
    // 退避 sleep 默认置零：崩溃重启即时发生，避免测试等待。
    // 需要验证「TERM 可打断长 sleep」的用例通过 sleepStub 注入真实 sleep。
    writeExecutable(join(bin, 'sleep'), `#!/bin/sh
${sleepStub}
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

const start = ({ stub, env = {}, dateShim = false, sleepStub = 'exit 0', rootUid = false, denyStore = false }) => {
    const root = mkdtempSync(join(tmpdir(), 'entrypoint-test-'))
    const bin = makeShims(root, { dateShim, sleepStub, rootUid, denyStore })
    const dataDir = join(root, 'data')
    const homeDir = join(root, 'home')
    mkdirSync(dataDir)
    mkdirSync(homeDir)
    const stubPath = makeStub(root, stub)

    const baseEnv = { ...process.env }
    delete baseEnv.DEPENDFIX_QUEUE_WORKER
    delete baseEnv.NUXT_QUEUE_ENABLED
    // 角色由入口注入（单进程形态不注入）：清理宿主环境残留，保证三态断言确定性
    delete baseEnv.DEPENDFIX_ROLE
    // store 路径由入口默认注入：清理宿主残留，保证「默认值」断言确定性
    delete baseEnv.PNPM_CONFIG_STORE_DIR
    // 日志目录同样由入口派生：清理宿主残留
    delete baseEnv.LOG_DIR

    const child = spawn('sh', [entrypointPath, stubPath], {
        env: {
            ...baseEnv,
            PATH: `${bin}:${process.env.PATH}`,
            DATA_DIR: dataDir,
            HOME: homeDir,
            DEPENDFIX_ALLOW_ANY_DIR: '1',
            DEPENDFIX_QUEUE_WORKER_SOCKET: join(root, 'worker.sock'),
            STUB_SUEXEC_LOG: join(root, 'suexec.log'),
            STUB_CHOWN_LOG: join(root, 'chown.log'),
            ...env,
        },
        cwd: root,
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
    const exit = handle.exited
        ? Promise.resolve(handle.exited)
        : new Promise((resolve) => {
            handle.child.on('exit', (code, signal) => resolve({ code, signal }))
        })
    // `exit` 早于 stdio 关闭：短命令的尾部输出可能还没进入 output()。等两个管道 close（上限 200ms，
    // 后台子进程可能继承管道导致迟迟不关）再返回，避免「恰一条 warn」这类计数断言偶发少一条。
    return exit.then(async (result) => {
        await Promise.race([
            new Promise((resolve) => {
                let pending = 2
                const settle = () => {
                    pending -= 1
                    if (pending === 0) {
                        resolve()
                    }
                }
                for (const stream of [handle.child.stdout, handle.child.stderr]) {
                    if (stream.readableEnded) {
                        settle()
                    } else {
                        stream.once('close', settle)
                    }
                }
            }),
            new Promise((resolve) => setTimeout(resolve, 200)),
        ])
        return result
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

        const { code, signal } = await terminate(handle)
        // signal 非 null 说明 TERM 落在 trap 安装之前（默认处置下 PID 1 直接被终止）；安装顺序约束见 entrypoint.sh
        expect({ code, signal }, '容器停止须由 entrypoint 转发 TERM 并以 143 退出').toEqual({ code: 143, signal: null })
        // 容器停止后 worker 与看护循环均被终止（不再留驻），且不再触发重启
        await waitFor(() => !alive(supervisorPid))
        await waitFor(() => !alive(workerPid))
        expect(handle.output()).not.toContain('次重启')
    })

    it('角色注入：worker / HTTP 两进程分别收到角色，并继承同一 LOG_DIR', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    echo "role-marker worker=[$DEPENDFIX_ROLE] log=[$LOG_DIR]"\n    exec tail -f /dev/null\nfi\necho "role-marker http=[$DEPENDFIX_ROLE] log=[$LOG_DIR]"\nexec tail -f /dev/null',
            // 不预置 DEPENDFIX_ROLE（start() 已清理宿主残留）：worker 侧取值只可能来自入口注入
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true' },
        })
        const expectedLogDir = join(handle.root, 'data', 'logs')
        await waitFor(() => handle.output().includes('role-marker worker=[worker]'))
        await waitFor(() => handle.output().includes('role-marker http=[server]'))
        const output = handle.output()
        expect(output).toContain(`role-marker worker=[worker] log=[${expectedLogDir}]`)
        expect(output).toContain(`role-marker http=[server] log=[${expectedLogDir}]`)
        await terminate(handle)
    })

    it('角色归一化：父进程预置未识别值时两进程均被入口归一化（注入点唯一）', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    echo "role-marker worker=[$DEPENDFIX_ROLE]"\n    exec tail -f /dev/null\nfi\necho "role-marker http=[$DEPENDFIX_ROLE]"\nexec tail -f /dev/null',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true', DEPENDFIX_ROLE: 'queue' },
        })
        // 两份标记的输出顺序不作保证（看护循环与 HTTP 主进程异步启动）：到齐后再取快照，避免只等到 http 就断言 worker
        await waitFor(() => handle.output().includes('role-marker http=[server]'))
        await waitFor(() => handle.output().includes('role-marker worker=[worker]'))
        const output = handle.output()
        expect(output).toContain('role-marker worker=[worker]')
        expect(output).toContain('role-marker http=[server]')
        expect(output).not.toContain('role-marker http=[queue]')
        await terminate(handle)
    })

    it('单进程形态：入口归一化为 server（外部误设 worker 不生效，不跳过任何插件）', async () => {
        const handle = start({
            stub: 'echo "single-role=[$DEPENDFIX_ROLE]"\nexit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '0', DEPENDFIX_ROLE: 'worker' },
        })
        const { code } = await waitExit(handle)
        expect(code).toBe(0)
        expect(handle.output()).toContain('single-role=[server]')
    })

    it('单进程形态：未预置角色时同样归一化为 server', async () => {
        const handle = start({
            stub: 'echo "single-role=[$DEPENDFIX_ROLE]"\nexit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        const { code } = await waitExit(handle)
        expect(code).toBe(0)
        expect(handle.output()).toContain('single-role=[server]')
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

    it('连续重启超过上限：转为慢重试（不永久放弃）且 HTTP 进程不受影响', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 7\nfi\nexec tail -f /dev/null',
            env: { DEPENDFIX_QUEUE_WORKER: '1', NUXT_QUEUE_ENABLED: 'true' },
        })
        await waitFor(() => handle.output().includes('转为慢重试'))
        const output = handle.output()
        expect(output).toContain('连续重启 5 次')
        expect(output).toContain('exit=7')
        expect(output.match(/第 \d+ 次重启/g)).toHaveLength(5)
        // 慢重试模式下 worker 仍会继续被拉起（HTTP 进程不受影响）
        await waitFor(() => handle.output().includes('慢重试第 1 次'))
        expect(handle.exited).toBeUndefined()
        await terminate(handle)
    })

    it('慢重试间隔非法值：回退 300s（避免 sleep 失败导致看护退出）', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 9\nfi\nexec tail -f /dev/null',
            env: {
                DEPENDFIX_QUEUE_WORKER: '1',
                NUXT_QUEUE_ENABLED: 'true',
                DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS: 'abc',
            },
        })
        await waitFor(() => handle.output().includes('转为慢重试（每 300s）'))
        expect(handle.exited).toBeUndefined()
        await terminate(handle)
    })

    it('慢重试间隔 00：数值等价 0，回退 300s（不形成重启风暴）', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 8\nfi\nexec tail -f /dev/null',
            env: {
                DEPENDFIX_QUEUE_WORKER: '1',
                NUXT_QUEUE_ENABLED: 'true',
                DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS: '00',
            },
        })
        await waitFor(() => handle.output().includes('转为慢重试（每 300s）'))
        expect(handle.exited).toBeUndefined()
        await terminate(handle)
    })

    it('慢重试间隔超出 shell 整数范围：回退 300s（不因 Illegal number 绕过校验）', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 6\nfi\nexec tail -f /dev/null',
            env: {
                DEPENDFIX_QUEUE_WORKER: '1',
                NUXT_QUEUE_ENABLED: 'true',
                DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS: '99999999999999999999',
            },
        })
        await waitFor(() => handle.output().includes('转为慢重试（每 300s）'))
        expect(handle.exited).toBeUndefined()
        await terminate(handle)
    })

    it('慢重试中收到 TERM：立即退出（后台 sleep 可被 trap 打断）', async () => {
        const handle = start({
            stub: 'if [ "$NUXT_IN_PROCESS_WORKER" = "true" ]; then\n    exit 7\nfi\nexec tail -f /dev/null',
            env: {
                DEPENDFIX_QUEUE_WORKER: '1',
                NUXT_QUEUE_ENABLED: 'true',
                DEPENDFIX_QUEUE_WORKER_SLOW_RETRY_SECONDS: '7',
            },
            // 只让慢重试值（7）真实睡眠；快速退避（1/2/4/8/16）仍即时返回
            sleepStub: 'case "$1" in\n    7) exec /bin/sleep 5 ;;\n    *) exit 0 ;;\nesac',
        })
        await waitFor(() => handle.output().includes('转为慢重试'))
        const started = Date.now()
        const { code, signal } = await terminate(handle)
        const elapsed = Date.now() - started
        expect({ code, signal }, '容器停止须由 entrypoint 转发 TERM 并以 143 退出').toEqual({ code: 143, signal: null })
        // 前台 sleep 会阻塞到 5s；后台 sleep + wait 应在 1.5s 内退出
        expect(elapsed).toBeLessThan(1_500)
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
        expect(output).not.toContain('转为慢重试')
        expect(output).not.toContain('第 2 次重启')
        await terminate(handle)
    })

    // 竞态守卫（静态）：上面「双进程形态」用例以「看护进程 pid」公告行为同步点发信号，若 trap 晚于该公告行安装，
    // 信号即落在默认处置窗口内（PID 1 直接被终止 → 退出码为 null 而非 143）。该窗口只在特定调度下出现，
    // 运行期用例无法稳定复现（CI 曾偶发红），故把「安装先于启动子进程与就绪输出」固化为源码顺序断言。
    // entrypoint 内的 fail-safe 分支（MAIN_PID 未赋值即退出）同样不可确定性触发，登记为已知边界（见 platform.md §10.6）。
    it('信号处置顺序：TERM / INT trap 先于子进程启动与「看护进程 pid」公告行', () => {
        const source = readFileSync(entrypointPath, 'utf8')
        const trapIndex = source.search(/^[ \t]*trap '[^']*stop_queue_worker[^']*' TERM INT$/m)
        const spawnIndex = source.indexOf('supervise_queue_worker "$prefix" "$@" &')
        const announceIndex = source.indexOf('看护进程 pid=${SUPERVISOR_PID}')
        expect(trapIndex).toBeGreaterThan(-1)
        expect(spawnIndex).toBeGreaterThan(-1)
        expect(announceIndex).toBeGreaterThan(-1)
        expect(trapIndex).toBeLessThan(spawnIndex)
        expect(spawnIndex).toBeLessThan(announceIndex)
    })
})

describe.skipIf(skipOnWindows)('entrypoint.sh pnpm store 持久化', () => {
    it('默认把 store 放到数据卷内并注入 PNPM_CONFIG_STORE_DIR', async () => {
        const handle = start({
            stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"\nexit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        const { code } = await waitExit(handle)
        const expected = join(handle.root, 'data', 'pnpm-store')

        expect(code).toBe(0)
        expect(handle.output()).toContain(`store=[${expected}]`)
        expect(handle.output()).toContain(`[entrypoint] pnpm store: ${expected}`)
        expect(existsSync(expected)).toBe(true)
    })

    it('显式 PNPM_CONFIG_STORE_DIR 优先于默认路径', async () => {
        const storeDir = mkdtempSync(join(tmpdir(), 'entrypoint-store-'))
        try {
            const handle = start({
                stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"\nexit 0',
                env: { DEPENDFIX_QUEUE_WORKER: '0', PNPM_CONFIG_STORE_DIR: storeDir },
            })
            const { code } = await waitExit(handle)

            expect(code).toBe(0)
            expect(handle.output()).toContain(`store=[${storeDir}]`)
        } finally {
            rmSync(storeDir, { recursive: true, force: true })
        }
    })

    it('store 目录不可创建时 warn 并回退 pnpm 默认位置（不阻断启动）', async () => {
        // 父路径是普通文件 → mkdir -p 必然失败（root / 非 root 两种 uid 下都成立）
        const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
        writeFileSync(join(dataDir, 'blocked'), 'not a directory')
        try {
            const handle = start({
                stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"\nexit 0',
                env: {
                    DEPENDFIX_QUEUE_WORKER: '0',
                    DATA_DIR: dataDir,
                    PNPM_CONFIG_STORE_DIR: join(dataDir, 'blocked', 'store'),
                },
            })
            const { code } = await waitExit(handle)

            expect(code).toBe(0)
            expect(handle.output()).toContain('回退 pnpm 默认位置')
            expect(handle.output()).toContain('store=[]')
        } finally {
            rmSync(dataDir, { recursive: true, force: true })
        }
    })

    it('同一数据卷跨两次启动复用同一 store（内容保留）', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
        try {
            const first = start({
                stub: 'echo marker > "$PNPM_CONFIG_STORE_DIR/probe"\nexit 0',
                env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir },
            })
            expect((await waitExit(first)).code).toBe(0)

            const second = start({
                stub: 'echo "probe=[$(cat "$PNPM_CONFIG_STORE_DIR/probe" 2>/dev/null)]"\nexit 0',
                env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir },
            })
            expect((await waitExit(second)).code).toBe(0)

            expect(second.output()).toContain('probe=[marker]')
        } finally {
            rmSync(dataDir, { recursive: true, force: true })
        }
    })

    it('拒绝相对路径（相对路径会按目标仓库 cwd 解析到仓库内）', async () => {
        const handle = start({
            stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
            env: { DEPENDFIX_QUEUE_WORKER: '0', PNPM_CONFIG_STORE_DIR: 'relative-store' },
        })
        const { code } = await waitExit(handle)

        expect(code).toBe(0)
        expect(handle.output()).toContain('pnpm store 目录必须是绝对路径')
        expect(handle.output()).toContain('store=[]')
        // 校验先于 mkdir：相对路径不得在 cwd（此处为测试根）留下目录
        expect(existsSync(join(handle.root, 'relative-store'))).toBe(false)
    })

    it('root 启动（compose 默认形态）：以运行身份建目录 → 探针判定后注入', async () => {
        const handle = start({
            rootUid: true,
            stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        const { code } = await waitExit(handle)
        const expected = join(handle.root, 'data', 'pnpm-store')

        expect(code).toBe(0)
        expect(handle.output()).toContain(`store=[${expected}]`)
        // 目录必须经 su-exec 以运行身份创建：root 先建再 chown 的形态会让自定义路径永久不可写
        expect(readFileSync(join(handle.root, 'suexec.log'), 'utf-8')).toContain(`mkdir -p ${expected}`)
        // 且不得对用户指定路径做 chown（`PNPM_CONFIG_STORE_DIR=/` 这类值会波及根目录）
        expect(readFileSync(join(handle.root, 'chown.log'), 'utf-8')).not.toContain(expected)
    })

    it('root 启动：根路径被拒绝（不对任意路径 mkdir / chown）', async () => {
        const handle = start({
            rootUid: true,
            stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
            env: { DEPENDFIX_QUEUE_WORKER: '0', PNPM_CONFIG_STORE_DIR: '/' },
        })
        const { code } = await waitExit(handle)

        expect(code).toBe(0)
        expect(handle.output()).toContain('pnpm store 目录不能是根路径')
        expect(handle.output()).toContain('store=[]')
        const suexecLog = readFileSync(join(handle.root, 'suexec.log'), 'utf-8')
        expect(suexecLog.split('\n').some((line) => line.trim().endsWith('mkdir -p /'))).toBe(false)
        // 也不得对根路径 chown（chown 桩记录实参，避免「不对任意路径 chown」只停留在标题里）
        expect(readFileSync(join(handle.root, 'chown.log'), 'utf-8')).not.toContain('-R 100:101 /\n')
    })

    it('root 启动：运行身份写探针失败时 warn 并回退（只读挂载 / 权限不足）', async () => {
        const handle = start({
            rootUid: true,
            denyStore: true,
            stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        const { code } = await waitExit(handle)

        expect(code).toBe(0)
        expect(handle.output()).toContain('对运行身份不可写')
        expect(handle.output()).toContain('store=[]')
    })

    it('回退文案给出 pnpm 实际落点（数据卷挂载点根 .pnpm-store），不再声称 $HOME', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
        try {
            const handle = start({
                stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir, PNPM_CONFIG_STORE_DIR: '/' },
            })
            const { code } = await waitExit(handle)

            expect(code).toBe(0)
            expect(handle.output()).toContain('回退 pnpm 默认位置')
            expect(handle.output()).toContain(`默认部署下为 ${join(dataDir, '.pnpm-store')}`)
            expect(handle.output()).not.toContain('$HOME')
        } finally {
            rmSync(dataDir, { recursive: true, force: true })
        }
    })

    describe('遗留 .pnpm-store 检出', () => {
        it('数据卷根存在遗留目录：单次启动恰一条 warn、含路径与清理命令、不改动该目录', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
            const legacyDir = join(dataDir, '.pnpm-store')
            mkdirSync(legacyDir)
            writeFileSync(join(legacyDir, 'blob'), 'keep')
            try {
                const handle = start({
                    stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                    env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir },
                })
                const { code } = await waitExit(handle)
                const output = handle.output()
                const managedDir = join(dataDir, 'pnpm-store')

                expect(code).toBe(0)
                expect(output.split('遗留 pnpm store').length - 1).toBe(1)
                expect(output).toContain(legacyDir)
                expect(output).toContain(managedDir)
                expect(output).toContain(`du -sh "${legacyDir}"`)
                expect(output).toContain(`rm -rf "${legacyDir}"`)
                // 只检出：内容不变、无新增探针文件、受管 store 照常建立
                expect(readdirSync(legacyDir)).toEqual(['blob'])
                expect(readFileSync(join(legacyDir, 'blob'), 'utf-8')).toBe('keep')
                expect(existsSync(managedDir)).toBe(true)
            } finally {
                rmSync(dataDir, { recursive: true, force: true })
            }
        })

        it('root 启动（compose 默认形态）同样检出：恰一条 warn 且受管 store 建立', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
            mkdirSync(join(dataDir, '.pnpm-store'))
            try {
                const handle = start({
                    rootUid: true,
                    stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                    env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir },
                })
                const { code } = await waitExit(handle)
                const output = handle.output()

                expect(code).toBe(0)
                expect(output.split('遗留 pnpm store').length - 1).toBe(1)
                expect(output).toContain(join(dataDir, '.pnpm-store'))
                expect(existsSync(join(dataDir, 'pnpm-store'))).toBe(true)
                // 不得额外对该目录 mkdir / 显式 chown（chown -R 数据卷属既有行为，见设计 §3 I2）
                const suexecLog = readFileSync(join(handle.root, 'suexec.log'), 'utf-8')
                expect(suexecLog).not.toContain('.pnpm-store')
                expect(readFileSync(join(handle.root, 'chown.log'), 'utf-8')).not.toContain('.pnpm-store')
            } finally {
                rmSync(dataDir, { recursive: true, force: true })
            }
        })

        it('不存在遗留目录时不输出遗留告警', async () => {
            const handle = start({
                stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                env: { DEPENDFIX_QUEUE_WORKER: '0' },
            })
            expect((await waitExit(handle)).code).toBe(0)
            expect(handle.output()).not.toContain('遗留 pnpm store')
        })

        it('受管 store 显式指向该目录时不算遗留（不告警）', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
            const legacyDir = join(dataDir, '.pnpm-store')
            mkdirSync(legacyDir, { recursive: true })
            try {
                const handle = start({
                    stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                    env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir, PNPM_CONFIG_STORE_DIR: legacyDir },
                })
                const { code } = await waitExit(handle)

                expect(code).toBe(0)
                expect(handle.output()).toContain(`store=[${legacyDir}]`)
                expect(handle.output()).not.toContain('遗留 pnpm store')
            } finally {
                rmSync(dataDir, { recursive: true, force: true })
            }
        })

        it('等价路径形态（尾斜杠 / ./ 段 / 软链）不算遗留：告警给出的删除命令不得指向正在使用的 store', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
            const legacyDir = join(dataDir, '.pnpm-store')
            mkdirSync(legacyDir)
            symlinkSync(legacyDir, join(dataDir, 'link-store'))
            try {
                const variants = [`${legacyDir}/`, `${dataDir}/./.pnpm-store`, join(dataDir, 'link-store')]
                for (const storeDir of variants) {
                    const handle = start({
                        stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                        env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir, PNPM_CONFIG_STORE_DIR: storeDir },
                    })
                    expect((await waitExit(handle)).code).toBe(0)
                    expect(handle.output()).not.toContain('遗留 pnpm store')
                }
            } finally {
                rmSync(dataDir, { recursive: true, force: true })
            }
        })

        it('回退发生时该目录是 pnpm 当前落点：只报回退，不报遗留', async () => {
            const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
            mkdirSync(join(dataDir, '.pnpm-store'), { recursive: true })
            try {
                const handle = start({
                    stub: 'echo "store=[$PNPM_CONFIG_STORE_DIR]"',
                    env: { DEPENDFIX_QUEUE_WORKER: '0', DATA_DIR: dataDir, PNPM_CONFIG_STORE_DIR: 'relative-store' },
                })
                const { code } = await waitExit(handle)

                expect(code).toBe(0)
                expect(handle.output()).toContain('回退 pnpm 默认位置')
                expect(handle.output()).not.toContain('遗留 pnpm store')
            } finally {
                rmSync(dataDir, { recursive: true, force: true })
            }
        })
    })

    it('日志目录默认跟随数据卷并导出 LOG_DIR', async () => {
        const handle = start({
            stub: 'echo "log=[$LOG_DIR]"\nexit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        const { code } = await waitExit(handle)
        const expected = join(handle.root, 'data', 'logs')

        expect(code).toBe(0)
        expect(handle.output()).toContain(`log=[${expected}]`)
        expect(existsSync(expected)).toBe(true)
    })

    it('显式 LOG_DIR 优先于数据卷默认值', async () => {
        const logDir = mkdtempSync(join(tmpdir(), 'entrypoint-logs-'))
        try {
            const handle = start({
                stub: 'echo "log=[$LOG_DIR]"\nexit 0',
                env: { DEPENDFIX_QUEUE_WORKER: '0', LOG_DIR: logDir },
            })
            expect((await waitExit(handle)).code).toBe(0)
            expect(handle.output()).toContain(`log=[${logDir}]`)
        } finally {
            rmSync(logDir, { recursive: true, force: true })
        }
    })

    it('日志目录不可创建时不阻断启动（日志模块自身写探针兜底）', async () => {
        const dataDir = mkdtempSync(join(tmpdir(), 'entrypoint-data-'))
        writeFileSync(join(dataDir, 'blocked'), 'not a directory')
        try {
            const handle = start({
                stub: 'echo "log=[$LOG_DIR] marker"\nexit 0',
                env: { DEPENDFIX_QUEUE_WORKER: '0', LOG_DIR: join(dataDir, 'blocked', 'logs') },
            })
            const { code } = await waitExit(handle)

            expect(code).toBe(0)
            expect(handle.output()).toContain('marker')
            expect(handle.output()).toContain('log=[')
        } finally {
            rmSync(dataDir, { recursive: true, force: true })
        }
    })

    it('root 启动：日志目录以运行身份创建', async () => {
        const handle = start({
            rootUid: true,
            stub: 'exit 0',
            env: { DEPENDFIX_QUEUE_WORKER: '0' },
        })
        expect((await waitExit(handle)).code).toBe(0)
        const expected = join(handle.root, 'data', 'logs')
        expect(readFileSync(join(handle.root, 'suexec.log'), 'utf-8')).toContain(`mkdir -p ${expected}`)
    })

    it('相对 LOG_DIR：入口不代建（按平台进程 cwd 解析）', async () => {
        const handle = start({
            stub: 'echo "log=[$LOG_DIR]"',
            env: { DEPENDFIX_QUEUE_WORKER: '0', LOG_DIR: 'relative-logs' },
        })
        expect((await waitExit(handle)).code).toBe(0)
        expect(handle.output()).toContain('log=[relative-logs]')
        expect(existsSync(join(handle.root, 'relative-logs'))).toBe(false)
    })

    it('root 路径顺序：chown → 以运行身份建目录 → 探针判定', () => {
        const source = readFileSync(entrypointPath, 'utf8')
        // 只看「最终降权段」（非 root 分支之后）：锚定稳定 token，不依赖空行 / 缩进
        const rootBlock = source.slice(source.lastIndexOf('if [ "$(id -u)" != "0" ]'))
        const chownAt = rootBlock.indexOf('chown -R "$RUN_IDENTITY"')
        const prepareAt = rootBlock.indexOf('\nprepare_pnpm_store\n')
        const activateAt = rootBlock.indexOf('\nactivate_pnpm_store\n')
        const logDirAt = rootBlock.indexOf('\nprepare_log_dir\n')

        expect(chownAt).toBeGreaterThan(-1)
        expect(prepareAt).toBeGreaterThan(chownAt)
        expect(activateAt).toBeGreaterThan(prepareAt)
        // 日志目录同样必须在 chown 之后以运行身份创建（root 先建会让运行身份写不进去）
        expect(logDirAt).toBeGreaterThan(chownAt)
    })
})
