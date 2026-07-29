import { spawn } from 'node:child_process'

/**
 * 单条命令的执行结果
 */
export interface CommandResult {
    /** 执行的命令文本 */
    command: string
    /** 退出码（0 = 成功） */
    exitCode: number
    /** 执行耗时（毫秒） */
    durationMs: number
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

const MAX_OUTPUT_LINES = 200

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
        const result = await execCommand(command, params.workDir)
        commandResults.push(result)

        if (result.exitCode !== 0) {
            return {
                success: false,
                commandResults,
                failedCommand: command,
                failure: `command "${command}" exited with code ${result.exitCode}`,
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
 */
function execCommand(command: string, workDir: string): Promise<CommandResult> {
    return new Promise((resolve) => {
        const startTime = Date.now()
        const cp = spawn(command, {
            cwd: workDir,
            shell: true,
            stdio: 'pipe',
        })

        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []

        cp.stdout.on('data', (data: Buffer) => {
            stdoutChunks.push(data.toString('utf-8'))
        })

        cp.stderr.on('data', (data: Buffer) => {
            stderrChunks.push(data.toString('utf-8'))
        })

        cp.on('error', (err) => {
            resolve({
                command,
                exitCode: -1,
                durationMs: Date.now() - startTime,
                stdout: '',
                stderr: sanitizeOutput(err.message),
            })
        })

        cp.on('close', (code) => {
            const stdout = truncateLines(stdoutChunks.join(''), MAX_OUTPUT_LINES)
            const stderr = truncateLines(stderrChunks.join(''), MAX_OUTPUT_LINES)
            resolve({
                command,
                exitCode: code ?? -1,
                durationMs: Date.now() - startTime,
                stdout: sanitizeOutput(stdout),
                stderr: sanitizeOutput(stderr),
            })
        })
    })
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
