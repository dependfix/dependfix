import { spawn, spawnSync } from 'node:child_process'

/**
 * 单条命令的执行结果
 */
export interface CommandResult {
    /** 执行的命令文本 */
    command: string
    /** 退出码（0 = 成功；-1 = 启动失败或超时被杀） */
    exitCode: number
    /** 执行耗时（毫秒） */
    durationMs: number
    /** 是否因超时被中止（默认 false） */
    timedOut?: boolean
    /** stdout 摘要（截断到 200 行，已脱敏） */
    stdout: string
    /** stderr 摘要（截断到 200 行，已脱敏） */
    stderr: string
}

/**
 * 验证执行参数
 */
export interface VerificationParams {
    /** 工作目录 */
    workDir: string
    /**
     * 要执行的命令序列。
     * 默认: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm build`
     */
    commands?: string[]
    /**
     * 单命令超时（毫秒），超时中止该命令并终止其进程树。
     * 默认 10 分钟（恶意死循环脚本超时中止，防长时间占用）。
     */
    commandTimeoutMs?: number
}

/**
 * 验证执行结果
 */
export interface VerificationResult {
    /** 所有命令是否全部成功 */
    success: boolean
    /** 每条命令的详细结果 */
    commandResults: CommandResult[]
    /** 失败的命令（仅 success=false 时填充） */
    failedCommand?: string
    /** 失败详情（仅 success=false 时填充） */
    failure?: string
}

const DEFAULT_COMMANDS = [
    'pnpm install --frozen-lockfile',
    'pnpm lint',
    'pnpm build',
]

const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60 * 1000

const MAX_OUTPUT_LINES = 200

/**
 * 压缩验证命令输出为报告可读的摘要（首尾各取若干行，超长中间省略）。
 * 完整输出由日志承载；报告保持紧凑，避免 error 字段失控膨胀。
 */
export function summarizeVerificationOutput(output: string): string {
    const maxLength = 1200
    if (output.length <= maxLength) {
        return output
    }
    const head = output.slice(0, 600).trimEnd()
    const tail = output.slice(-500).trimStart()
    return `${head}\n... (${output.length - head.length - tail.length} chars omitted) ...\n${tail}`
}

/**
 * 构造失败验证命令的 error 描述：`exit code N — <stdout/stderr 摘要>`。
 * 无输出时退化为裸 `exit code N`；超时命令归类为 `timed out after Xms`。
 * stdout/stderr 已在 execCommand 中脱敏、截断 200 行。
 */
export function formatVerificationError(cr: CommandResult): string {
    if (cr.timedOut) {
        return `timed out after ${cr.durationMs}ms`
    }
    const detail = [cr.stdout, cr.stderr].filter(Boolean).join('\n--- stderr ---\n').trim()
    return detail
        ? `exit code ${cr.exitCode} — ${summarizeVerificationOutput(detail)}`
        : `exit code ${cr.exitCode}`
}

/**
 * 按顺序在工作目录执行命令序列，任一命令失败则停止。
 *
 * @example
 * ```ts
 * const result = await runVerification({ workDir: '/repo' })
 * if (!result.success) {
 *     console.error(result.failure)
 * }
 * ```
 */
export async function runVerification(params: VerificationParams): Promise<VerificationResult> {
    const commands = params.commands ?? DEFAULT_COMMANDS
    const commandResults: CommandResult[] = []

    for (const command of commands) {
        const result = await execCommand(command, params.workDir, params.commandTimeoutMs)
        commandResults.push(result)

        if (result.exitCode !== 0 || result.timedOut) {
            return {
                success: false,
                commandResults,
                failedCommand: command,
                failure: result.timedOut
                    ? `command "${command}" timed out after ${result.durationMs}ms`
                    : `command "${command}" exited with code ${result.exitCode}`,
            }
        }
    }

    return {
        success: true,
        commandResults,
    }
}

/**
 * 执行单条 shell 命令，捕获 stdout/stderr（截断到 200 行）并脱敏。
 * 超过超时时间后中止命令并终止其进程树（防死循环脚本孙进程残留）。
 */
function execCommand(
    command: string,
    workDir: string,
    timeoutMs: number = DEFAULT_COMMAND_TIMEOUT_MS,
): Promise<CommandResult> {
    return new Promise((resolve) => {
        const startTime = Date.now()
        let timedOut = false
        const cp = spawn(command, {
            cwd: workDir,
            shell: true,
            stdio: 'pipe',
            // POSIX 下创建独立进程组，超时时可终止整个进程树
            detached: process.platform !== 'win32',
        })

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        const timer = setTimeout(() => {
            timedOut = true
            killProcessTree(cp.pid)
            cp.kill('SIGKILL')
        }, timeoutMs)

        cp.stdout.on('data', (data: Buffer) => {
            stdoutChunks.push(data.toString('utf-8'))
        })

        cp.stderr.on('data', (data: Buffer) => {
            stderrChunks.push(data.toString('utf-8'))
        })

        cp.on('error', (err) => {
            clearTimeout(timer)
            resolve({
                command,
                exitCode: -1,
                durationMs: Date.now() - startTime,
                stdout: '',
                stderr: sanitizeOutput(err.message),
            })
        })

        cp.on('close', (code) => {
            clearTimeout(timer)
            const stdout = truncateLines(stdoutChunks.join(''), MAX_OUTPUT_LINES)
            const stderr = truncateLines(stderrChunks.join(''), MAX_OUTPUT_LINES)
            resolve({
                command,
                exitCode: code ?? -1,
                durationMs: Date.now() - startTime,
                timedOut,
                stdout: sanitizeOutput(stdout),
                stderr: sanitizeOutput(stderr),
            })
        })
    })
}

/**
 * 终止进程树：POSIX 杀进程组（detached 进程组组长），Windows 用 taskkill /T /F。
 * 失败时静默退化（主终止路径已由调用方 cp.kill 兜底）。
 */
function killProcessTree(pid?: number): void {
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

/** 截断文本到指定行数 */
function truncateLines(text: string, maxLines: number): string {
    const lines = text.split('\n')
    if (lines.length <= maxLines) {
        return text
    }
    return `${lines.slice(0, maxLines).join('\n')}\n... (truncated, ${lines.length - maxLines} more lines)`
}

/**
 * 脱敏处理：移除命令输出中可能包含的敏感信息。
 *
 * 过滤规则：
 * - 包含 `token=` / `secret=` / `password=` 的行
 * - `npm_config_` / `GITHUB_TOKEN` / `NPM_TOKEN` 等环境变量暴露
 * - URL 中的 user:password@ 模式
 */
const SECRET_PATTERNS: [RegExp, string][] = [
    // 环境变量赋值（大写下划线变量 = 敏感值）
    [/^(GITHUB_TOKEN|NPM_TOKEN|NODE_AUTH_TOKEN|DOCKER_PASSWORD)=.+/gim, '$1=***'],
    // Token=xxx / secret=xxx 模式
    [/\b(token|secret|password|api[_-]?key)\s*[=:]\s*\S+/gi, '$1=***'],
    // URL 中的认证信息 user:pass@host
    [/\/\/[^@\n]+@/g, '//***@'],
    // npm_config 环境变量（可能包含 registry token）
    [/npm_config_[a-z_]+=\S+/g, 'npm_config_***=***'],
]

/**
 * 对外暴露以支持单独测试
 */
export function sanitizeOutput(output: string): string {
    let result = output
    for (const [pattern, replacement] of SECRET_PATTERNS) {
        result = result.replace(pattern, replacement)
    }
    return result
}
