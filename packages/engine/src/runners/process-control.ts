// process-control.ts — 运行级取消（abort）与受管子进程的单一事实源。
//
// 背景（2026-10-16 生产复盘）：引擎与平台**同进程**运行，且安装 / lockfile 修复链走同步
// `execSync` / `execFileSync`。平台执行超时（`withTimeout` 只 `Promise.race`、不中断底层工作）
// 之后引擎继续跑，僵尸 install 与后续仓库争抢内存 → 内核 OOM 级联
// （实测 4 核 4 GB 主机 4.5 小时内 41 次 `Out of memory: Killed process`，时间戳与引擎日志行同秒对齐）。
//
// 本模块提供「超时后真正终止」所需的两件事：
// 1. **运行级 abort 状态**：`requestAbort()` 幂等置位，并**立即终止已登记的子进程树**；
//    `isAbortRequested()` 供调用方在启动新工作之前短路（abort 后不再产生新子进程）。
// 2. **受管子进程**：`runTrackedCommand()` 以异步 `spawn` 执行并登记 PID，退出 / 出错时注销；
//    超时或 abort 时按**进程树**终止（POSIX 杀进程组，Windows `taskkill /T /F`），避免
//    "杀掉 shell 而 pnpm 子进程存活并继续占用内存 / 持有管道"。
//
// 平台差异：Windows 上 npm 系 CLI（`pnpm` / `npx`）是 `.cmd` 包裹，**不能**直接
// `spawn`（Node 官方口径：`.cmd` / `.bat` 须经 shell 或 cmd.exe 执行）；POSIX 上直接 `spawn`
// 与旧 `execSync` 一样经 PATH 解析，行为等价。故 `shell` 缺省由 `resolveShellOption()` 按平台决定。
//
// 生命周期：模块级单例，由 `DependfixApp` 构造期 `resetProcessControlState()` 复位
// （与 `resetActiveRulesConfig()` 同族的进程级状态口径——同一进程多次运行不得互相污染）。
//
// 边界：本模块只做状态与进程控制，不感知业务语义。经 `runners/index.ts` 只暴露**受支持的最小诊断面**
// （`getAbortReason` / `getAbortSnapshot`，只读）；kill / 记录原语不出包，新增导出需按公共 API 变更评估
// （口径同 `runners/verification-gate.ts` 的「非必要不外露」）。
import { spawn, spawnSync } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { getEgressProxyEnv } from './egress-audit'

/** 单流捕获上限（与 `execSync` 默认 `maxBuffer` 同量级）：超限后继续 drain 但不再累积。 */
const MAX_STREAM_CAPTURE_BYTES = 1024 * 1024

/**
 * 子进程退出后等待 stdio 关闭的有界宽限期。
 *
 * `close` 事件只有在**所有**持有 stdout / stderr 写端的进程都退出后才会触发；安装脚本
 * （node-gyp / prebuild-install / postinstall）可能派生出脱离直接子进程生命周期的孙进程，
 * 即使进程组已被终止，只要孙进程仍持有管道，`close` 就永远不会到来。实测一次 5 分钟
 * 安装超时因此拖到 12 分钟才落定，直接吃掉单仓 30 分钟执行预算。
 *
 * 超时只约束"等待退出"，不改变输出语义：宽限期内正常关闭仍走 `close`；超期则主动
 * destroy 管道并用已捕获的输出落定。
 */
export const STREAM_CLOSE_GRACE_MS = 2_000

/** 运行级 abort 原因（`undefined` = 未请求取消）。 */
let abortReason: string | undefined

/** 已登记的活跃子进程 PID（超时 / abort 时按进程树终止）。 */
const trackedPids = new Set<number>()

/** 最近一条受管命令（`binary args…`，截断 200 字符）：取消未落定时用于归因。 */
let lastTrackedCommandLine: string | undefined

/**
 * 取消时刻的现场快照。
 *
 * `killAllTrackedChildProcesses()` 会**立即清空登记表**（PID 可能被系统复用），
 * 因此「取消后仍有几个受管子进程」只能在取消当刻取数；诊断（宽限期结束后）读它。
 */
let abortSnapshot: { trackedCount: number, lastCommand?: string } | undefined

/**
 * 复位运行级进程控制状态（每次构造 `DependfixApp` 时调用）。
 *
 * 只清状态、**不杀进程**：复位发生在两次运行之间，此时上一次运行的子进程应由其调用方
 * 正常收尾（`runTrackedCommand` 在 close / error 时已注销）。
 */
export function resetProcessControlState(): void {
    abortReason = undefined
    trackedPids.clear()
    lastTrackedCommandLine = undefined
    abortSnapshot = undefined
}

/**
 * 请求运行级取消（幂等）。
 *
 * 首次调用记录原因；**每次调用都终止当前已登记的子进程树**——这样在"平台放弃等待"之后，
 * 正在跑的 install / 验证命令会被立即杀掉，而不是继续与新仓库争抢资源。
 */
export function requestAbort(reason?: string): void {
    if (abortReason === undefined) {
        abortReason = reason ?? 'abort requested'
    }
    // 取数先于 kill：登记表在 kill 时被清空，之后无法再回答「取消时在管几个」。
    // 与 abortReason 同口径「首次为准」：重复取消（引擎自取消 + 平台超时）不覆盖首次现场，
    // 否则第二次的 trackedCount 恒 0，诊断会退化成常量。
    if (!abortSnapshot) {
        abortSnapshot = {
            trackedCount: trackedPids.size,
            ...(lastTrackedCommandLine ? { lastCommand: lastTrackedCommandLine } : {}),
        }
    }
    killAllTrackedChildProcesses()
}

/**
 * 取消时刻的现场快照（未取消时为 `undefined`）。
 *
 * 用于「宽限期结束仍未落定」的诊断：`trackedCount` 是**取消当刻**的受管子进程数，
 * 不是当前登记数（后者在取消后即为 0）。
 */
export function getAbortSnapshot(): { trackedCount: number, lastCommand?: string } | undefined {
    return abortSnapshot
}

/** 是否已请求取消（调用方在启动新命令 / 新仓库之前短路）。 */
export function isAbortRequested(): boolean {
    return abortReason !== undefined
}

/** 取消原因（未取消时为 `undefined`）。 */
export function getAbortReason(): string | undefined {
    return abortReason
}

/** 登记活跃子进程 PID（无 PID / 非法 PID 静默忽略——如 spawn 立即失败）。 */
export function trackChildProcess(pid?: number): void {
    if (typeof pid === 'number' && pid > 0) {
        trackedPids.add(pid)
    }
}

/** 注销活跃子进程 PID（进程已退出）。 */
export function untrackChildProcess(pid?: number): void {
    if (typeof pid === 'number' && pid > 0) {
        trackedPids.delete(pid)
    }
}

/**
 * 终止所有已登记的子进程树，返回终止数量。
 *
 * 终止后立即清空登记表：再次调用不会重复 kill（PID 可能已被系统复用）。
 */
export function killAllTrackedChildProcesses(): number {
    let killed = 0
    for (const pid of [...trackedPids]) {
        killProcessTree(pid)
        trackedPids.delete(pid)
        killed++
    }
    return killed
}

/** 当前登记的活跃子进程数量（测试 / 诊断用）。 */
export function trackedChildProcessCount(): number {
    return trackedPids.size
}

/**
 * 最近一条受管命令（`binary args…`）；无命令时为 `undefined`。
 *
 * 用于「取消后未在宽限期内落定」的诊断：与存活子进程数一起说明卡在哪一步。
 */
export function getLastTrackedCommand(): string | undefined {
    return lastTrackedCommandLine
}

/** 记录最近一条受管命令（内部接线；截断防超长参数撑爆日志）。 */
export function recordTrackedCommand(commandLine: string): void {
    lastTrackedCommandLine = commandLine.length > 200 ? `${commandLine.slice(0, 200)}…` : commandLine
}

/**
 * 终止进程树：POSIX 杀进程组（spawn 时 `detached` 使子进程成为进程组组长），
 * Windows 用 `taskkill /T /F`。失败时静默退化（调用方另有直接 `kill` 兜底）。
 *
 * 单一事实源：verification-runner 的超时终止与本模块的 abort 终止共用此实现。
 */
export function killProcessTree(pid?: number): void {
    if (pid === undefined || pid <= 0) {
        return
    }
    if (process.platform === 'win32') {
        try {
            spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
        } catch {
            // taskkill 不可用时由调用方 cp.kill 兜底
        }
    } else {
        try {
            process.kill(-pid, 'SIGKILL')
        } catch {
            // 进程组不存在时由调用方 cp.kill 兜底
        }
    }
}

/** 受管命令执行结果（不抛错——调用方按 `exitCode` / `signal` / `timedOut` 自行判定）。 */
export interface TrackedCommandResult {
    /**
     * 是否真正启动过子进程。
     * `false` = 调用时已处于取消状态 → 命令被跳过（未产生任何子进程），其余字段为占位值。
     */
    started: boolean
    /** 进程退出码（被信号终止 / spawn 失败时为 null） */
    exitCode: number | null
    /** 终止进程的信号（如 `SIGKILL`）；非信号终止时为 null */
    signal: NodeJS.Signals | null
    /** 是否因超过 `timeoutMs` 被本模块终止 */
    timedOut: boolean
    /**
     * 超时兜底落定时是否未能确认直接子进程已退出。
     * `true` 表示进程可能仍处于不可中断状态，资源占用未被证实释放（调用方应显式告警 / 保守处理）。
     */
    terminationUnconfirmed?: boolean
    /** 执行期间是否处于"已请求取消"状态（含被 abort 终止） */
    aborted: boolean
    /** spawn 级 errno（如 `ENOENT`——工具链缺失）；无时为 null */
    errno: string | null
    /**
     * 捕获是否触顶（超过 {@link MAX_STREAM_CAPTURE_BYTES} 后只 drain 不累积）。
     *
     * 与旧 `execSync` 的 `ENOBUFS` 抛错不同：超限不抛错，但调用方必须能看出输出不完整
     * （否则会把截断的输出当成完整结果）。
     */
    outputTruncated?: boolean
    stdout: string
    stderr: string
    durationMs: number
}

/**
 * 是否经 shell 执行（Windows 需要；见模块头「平台差异」）。
 *
 * 抽成纯函数以便用例锁定平台分支：仅 `win32` 返回 true，其余平台 false
 * （POSIX 保持直接 `spawn`，与改造前行为一致）。
 */
export function resolveShellOption(platform: NodeJS.Platform = process.platform): boolean {
    return platform === 'win32'
}

/** `runTrackedCommand` 入参。 */
export interface TrackedCommandParams {
    binary: string
    args: string[]
    cwd: string
    timeoutMs: number
    /** 显式 env（缺省继承父进程环境——与既有 `execFileSync` 语义一致） */
    env?: NodeJS.ProcessEnv
    /** 显式覆盖 shell 行为（缺省按平台：Windows 经 shell，其余平台直接 spawn） */
    shell?: boolean
}

/**
 * 异步执行命令并登记子进程（超时 / abort 时按进程树终止）。
 *
 * **取消前置守卫**：调用时若已请求取消，直接返回 `started: false`（不 spawn）——这是
 * "abort 后不再启动新工作"在安装 / 验证类命令上的**单一入口**（各调用方无需各写一遍）。
 *
 * 与旧 `execFileSync` 的差异（有意为之）：
 * - **不阻塞事件循环**——引擎与平台同进程运行，同步调用会让平台 HTTP、定时器（含执行超时）
 *   与队列全部停摆（实测：超时定时器比设定值晚约 9.5 分钟才触发）
 * - **输出限长累积**：超过 `MAX_STREAM_CAPTURE_BYTES` 后继续 drain（避免子进程写满管道阻塞）
 *   但不再累积，防大输出把内存吃掉
 * - 不抛错：退出码 / 信号 / 超时 / errno 全部经返回值暴露，由调用方决定语义
 */
export function runTrackedCommand(params: TrackedCommandParams): Promise<TrackedCommandResult> {
    if (isAbortRequested()) {
        return Promise.resolve({
            started: false,
            exitCode: null,
            signal: null,
            timedOut: false,
            aborted: true,
            errno: null,
            stdout: '',
            stderr: '',
            durationMs: 0,
        })
    }

    // 诊断面：记录最近一条受管命令（取消未落定时可归因到具体步骤）
    recordTrackedCommand([params.binary, ...params.args].join(' '))

    // 运行级外联审计：默认把代理注入所有受管命令（安装链 / 验证链 / 交付 git）。
    // 显式 env 里已带代理时不覆盖（调用方自知其网络路径）。
    const egressProxyEnv = getEgressProxyEnv()
    const mergedEnv = egressProxyEnv && params.env
        ? { ...egressProxyEnv, ...params.env }
        : (params.env ?? egressProxyEnv)

    return new Promise((resolve) => {
        const startedAt = Date.now()
        let timedOut = false
        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []
        // StringDecoder：按完整字符解码，避免多字节字符（中文路径 / 输出）在 chunk 边界被切断
        const stdoutDecoder = new StringDecoder('utf-8')
        const stderrDecoder = new StringDecoder('utf-8')
        let stdoutBytes = 0
        let stderrBytes = 0
        let outputTruncated = false

        const cp = spawn(params.binary, params.args, {
            cwd: params.cwd,
            stdio: 'pipe',
            // Windows 经 shell（`.cmd` 包裹不可直接 spawn）；其余平台保持直接 spawn
            shell: params.shell ?? resolveShellOption(),
            // POSIX 下创建独立进程组，超时 / abort 时可终止整个进程树
            detached: process.platform !== 'win32',
            ...(mergedEnv ? { env: mergedEnv } : {}),
        })

        trackChildProcess(cp.pid)

        let settled = false
        let exited = false
        let closeGraceTimer: NodeJS.Timeout | undefined

        const timer = setTimeout(() => {
            timedOut = true
            killProcessTree(cp.pid)
            cp.kill('SIGKILL')
            // 直接子进程未触发 exit（kill 失败 / 卡在不可中断状态）时的最终兜底
            settleAfterStreamGrace({ exitCode: null, signal: 'SIGKILL' })
        }, params.timeoutMs)

        function finish(result: {
            exitCode: number | null
            signal: NodeJS.Signals | null
            errno?: string | null
        }): void {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timer)
            if (closeGraceTimer) {
                clearTimeout(closeGraceTimer)
            }
            untrackChildProcess(cp.pid)
            // 冲刷解码器残留（不足一个字符的字节不丢弃）
            if (!outputTruncated) {
                stdoutChunks.push(stdoutDecoder.end())
                stderrChunks.push(stderrDecoder.end())
            }
            resolve({
                started: true,
                exitCode: result.exitCode,
                signal: result.signal,
                timedOut,
                terminationUnconfirmed: timedOut && !exited ? true : undefined,
                aborted: isAbortRequested(),
                errno: result.errno ?? null,
                stdout: stdoutChunks.join(''),
                stderr: stderrChunks.join(''),
                ...(outputTruncated ? { outputTruncated: true } : {}),
                durationMs: Date.now() - startedAt,
            })
        }

        /**
         * 直接子进程已退出（或已被主动终止）后，等待 stdio 关闭的**有界**窗口。
         * `close` 正常到来时由 `finish` 清掉本定时器；孙进程持有管道时由本定时器兜底。
         */
        function settleAfterStreamGrace(result: {
            exitCode: number | null
            signal: NodeJS.Signals | null
            errno?: string | null
        }): void {
            if (settled) {
                return
            }
            if (closeGraceTimer) {
                clearTimeout(closeGraceTimer)
            }
            closeGraceTimer = setTimeout(() => {
                // 直接子进程已退出，但进程组内可能仍有幸存孙进程：落定前再收一次
                killProcessTree(cp.pid)
                cp.stdout?.destroy?.()
                cp.stderr?.destroy?.()
                finish(result)
            }, STREAM_CLOSE_GRACE_MS)
        }

        const capture = (
            decoder: StringDecoder,
            chunks: string[],
            bytes: number,
            data: Buffer,
        ): number => {
            const next = bytes + data.byteLength
            if (bytes < MAX_STREAM_CAPTURE_BYTES) {
                chunks.push(decoder.write(data))
            } else if (!outputTruncated) {
                outputTruncated = true
                // 触顶后丢弃解码器残留，避免后续 write 继续累积
                decoder.end()
            }
            return next
        }

        cp.stdout?.on('data', (data: Buffer) => {
            stdoutBytes = capture(stdoutDecoder, stdoutChunks, stdoutBytes, data)
        })
        cp.stderr?.on('data', (data: Buffer) => {
            stderrBytes = capture(stderrDecoder, stderrChunks, stderrBytes, data)
        })

        cp.on('error', (err: NodeJS.ErrnoException) => {
            finish({ exitCode: null, signal: null, errno: err.code ?? 'UNKNOWN' })
        })
        // `exit` 早于 `close`：先启动有界宽限期，由 `close` 正常关闭或超期强制落定
        cp.on('exit', (code, signal) => {
            exited = true
            settleAfterStreamGrace({ exitCode: code, signal })
        })
        cp.on('close', (code, signal) => {
            finish({ exitCode: code, signal })
        })
    })
}
