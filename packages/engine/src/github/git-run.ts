// git-run.ts — git 命令的受管异步执行（交付类 git 调用的单一入口）。
//
// 背景：`git push` / `git commit` / `git checkout` / `git reset --hard` / `git read-tree`
// 此前走同步 `execFileSync`。引擎与平台**同进程**运行时，同步调用会阻塞事件循环，
// 使平台执行超时定时器无法按时触发（实测名义 14:15:29 截止 → 实际 14:21:01 才 abort），
// 取消请求也无法及时落到子进程树。
//
// 本模块把这类调用统一改为 `runTrackedCommand`（异步 spawn + 进程登记 + 进程树终止）：
// - 事件循环不再被阻塞：超时定时器 / abort 能按时生效
// - abort 后不再启动新的 git 子进程（`runTrackedCommand` 的取消前置守卫）
// - abort / 超时会按进程树终止（POSIX 进程组、Windows `taskkill /T /F`）
//
// 边界：仓库**状态查询**（`git rev-parse` / `git diff --quiet`）仍是短命令，留在
// `app/helpers.ts` 的同步实现（口径见 executor-process-isolation §8.5）；本模块只覆盖
// 交付与回滚路径上的 git 命令。
//
// Windows 口径：`shell` 必须显式关闭。`runTrackedCommand` 对 `.cmd` 包裹（pnpm / npx）默认走
// shell，但 git 在 Windows 上是 `git.exe`，**不需要** shell；`shell: true` 会让 Node 只按空格
// 拼接 argv（不引号化），提交信息 / `:(literal)` 路径里的空格与括号会被 cmd 拆开（交付链失败），
// 并形成命令注入面。
import { runTrackedCommand } from '../runners/process-control'

/** 交付类 git 命令的默认上限（弱网 push 的主要风险面；本地命令通常毫秒级结束）。 */
export const GIT_COMMAND_TIMEOUT_MS = 300_000

/**
 * 错误信息里的命令展示：跳过 `-c key=value` 隔离参数，取真实子命令（如 `git push`）。
 *
 * 交付命令普遍带 `-c push.gpgSign=false` 之类的隔离项，直接取 `args[0]` 会渲染成 `git -c`。
 */
function describeGitCommand(args: readonly string[]): string {
    const parts: string[] = []
    for (let index = 0; index < args.length; index++) {
        const arg = args[index]!
        if (arg === '-c' || arg === '--config') {
            index += 1
            continue
        }
        parts.push(arg)
        if (parts.length >= 2) {
            break
        }
    }
    return `git ${parts.join(' ')}`
}

/** 错误信息里保留的 stderr 尾部长度（避免把整页输出塞进审计条目）。 */
const STDERR_TAIL_LENGTH = 400

export interface RunGitOptions {
    /** 工作目录 */
    cwd: string
    /** 超时（毫秒；默认 {@link GIT_COMMAND_TIMEOUT_MS}） */
    timeoutMs?: number
    /** 显式 env（缺省继承父进程，但经平台密钥过滤，见 process-control） */
    env?: NodeJS.ProcessEnv
    /** 可执行文件（缺省 `git`；仅测试注入替身时使用） */
    binary?: string
}

export interface GitCommandResult {
    stdout: string
    stderr: string
    /** 退出码（信号终止 / spawn 失败 / 未启动时为 null） */
    code: number | null
    /** 是否因超时被终止 */
    timedOut: boolean
    /** 执行期间是否处于取消状态（含调用时已被取消） */
    aborted: boolean
    /** 是否真正启动过子进程（`false` = 取消前置守卫拦下） */
    started: boolean
    /** 输出是否触顶被截断（超过捕获上限；调用方不得把结果当成完整输出） */
    truncated: boolean
}

/** 失败原因的一句话描述（超时 / 取消前置守卫 / 退出码）。 */
function describeFailure(params: {
    code: number | null
    timedOut: boolean
    aborted: boolean
    started: boolean
}): string {
    if (params.timedOut) {
        return 'timed out'
    }
    if (params.aborted && !params.started) {
        return 'aborted before start'
    }
    if (params.aborted) {
        // 已启动后被 abort 终止（进程树被杀），与「前置守卫拦下」区分，便于审计判断
        return 'terminated by abort'
    }
    return `exit code ${params.code}`
}

/** git 命令失败（非 0 退出 / 超时 / 未启动）的统一错误。 */
export class GitCommandError extends Error {
    readonly args: readonly string[]
    readonly code: number | null
    readonly timedOut: boolean
    readonly aborted: boolean
    /** 是否真正启动过子进程（`false` = 取消前置守卫拦下） */
    readonly started: boolean
    readonly stderr: string

    constructor(params: {
        what: string
        args: readonly string[]
        code: number | null
        timedOut: boolean
        aborted: boolean
        started: boolean
        stderr: string
    }) {
        const detail = describeFailure(params)
        const tail = params.stderr.trim().slice(-STDERR_TAIL_LENGTH)
        super(`${params.what} failed: ${describeGitCommand(params.args)} — ${detail}${tail ? `: ${tail}` : ''}`)
        this.name = 'GitCommandError'
        this.args = params.args
        this.code = params.code
        this.timedOut = params.timedOut
        this.aborted = params.aborted
        this.started = params.started
        this.stderr = params.stderr
    }
}

/** 执行 git 命令（不抛错；退出码 / 超时 / 取消经返回值暴露）。 */
export async function runGit(args: readonly string[], options: RunGitOptions): Promise<GitCommandResult> {
    const outcome = await runTrackedCommand({
        binary: options.binary ?? 'git',
        args: [...args],
        cwd: options.cwd,
        timeoutMs: options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS,
        // argv 按数组直接传给 git.exe：不经 shell 拼接（Windows 上的引号化由 libuv 负责）
        shell: false,
        ...(options.env ? { env: options.env } : {}),
    })
    return {
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        code: outcome.exitCode,
        timedOut: outcome.timedOut,
        aborted: outcome.aborted,
        started: outcome.started,
        truncated: outcome.outputTruncated === true,
    }
}

/**
 * 执行 git 命令并要求成功（非 0 退出 / 超时 / 取消前置守卫 → 抛 {@link GitCommandError}）。
 *
 * @param what 业务动作名（错误信息前缀，如 `checkout fix branch`）
 * @returns 标准输出（已 trim 的换行由调用方决定）
 */
export async function runGitOrThrow(
    args: readonly string[],
    options: RunGitOptions & { what: string },
): Promise<string> {
    const result = await runGit(args, options)
    // `started === false` 表示取消前置守卫拦下（未产生子进程）：按 aborted 处理
    const failed = !result.started || result.code !== 0
    if (failed) {
        throw new GitCommandError({
            what: options.what,
            args,
            code: result.code,
            timedOut: result.timedOut,
            aborted: result.aborted || !result.started,
            started: result.started,
            stderr: result.stderr,
        })
    }
    return result.stdout
}
