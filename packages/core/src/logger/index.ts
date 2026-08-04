export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogContext = Record<string, unknown>

export interface Logger {
    debug(message: string, context?: LogContext): void
    info(message: string, context?: LogContext): void
    warn(message: string, context?: LogContext): void
    error(message: string, context?: LogContext): void
}

export interface LoggerOptions {
    name: string
    minLevel?: LogLevel
    /** 强制使用 JSON 输出（覆盖 TTY 检测），CI 环境通常自动启用 */
    forceJson?: boolean
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
}

// ---------------------------------------------------------------------------
// ANSI color helpers (zero-dependency, inline to avoid bundling churn)
// ---------------------------------------------------------------------------

const ANSI_RESET = '\x1b[0m'
const ANSI_RED = '\x1b[31m'
const ANSI_YELLOW = '\x1b[33m'
const ANSI_BLUE = '\x1b[34m'
const ANSI_DIM = '\x1b[2m'

const LEVEL_COLOR: Record<LogLevel, string> = {
    debug: ANSI_DIM,
    info: ANSI_BLUE,
    warn: ANSI_YELLOW,
    error: ANSI_RED,
}

function padLevel(level: LogLevel): string {
    return level.toUpperCase().padEnd(5)
}

function colorize(text: string, color: string): string {
    return `${color}${text}${ANSI_RESET}`
}

// ---------------------------------------------------------------------------
// TTY detection
// ---------------------------------------------------------------------------

/**
 * 检测当前进程是否在交互终端中运行。
 * 非 TTY（管道、重定向、CI）通常返回 false。
 */
function isTTY(): boolean {
    return process.stdout.isTTY === true
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function shouldLog(minLevel: LogLevel, level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel]
}

function buildJsonPayload(name: string, level: LogLevel, message: string, context?: LogContext): string {
    const payload = {
        ts: new Date().toISOString(),
        level,
        logger: name,
        message,
        ...(context ? { context } : {}),
    }

    return JSON.stringify(payload)
}

function buildPrettyLine(name: string, level: LogLevel, message: string, context?: LogContext): string {
    const time = new Date().toISOString()
    const coloredLevel = colorize(padLevel(level), LEVEL_COLOR[level])

    let line = `${ANSI_DIM}${time}${ANSI_RESET} ${coloredLevel} ${ANSI_DIM}[${name}]${ANSI_RESET} ${message}`

    if (context && Object.keys(context).length > 0) {
        const ctxStr = Object.entries(context)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(' ')
        line += `  ${ANSI_DIM}${ctxStr}${ANSI_RESET}`
    }

    return line
}

function writeLine(level: LogLevel, line: string): void {
    if (level === 'error') {
        console.error(line)
    } else if (level === 'warn') {
        console.warn(line)
    } else {
        console.log(line)
    }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLogger(options: LoggerOptions): Logger {
    const minLevel = options.minLevel ?? 'info'
    const useJson = options.forceJson === true || !isTTY()

    function log(level: LogLevel, message: string, context?: LogContext) {
        if (!shouldLog(minLevel, level)) {
            return
        }

        if (useJson) {
            const line = buildJsonPayload(options.name, level, message, context)
            writeLine(level, line)
        } else {
            const line = buildPrettyLine(options.name, level, message, context)
            writeLine(level, line)
        }
    }

    return {
        debug(message, context) {
            log('debug', message, context)
        },
        info(message, context) {
            log('info', message, context)
        },
        warn(message, context) {
            log('warn', message, context)
        },
        error(message, context) {
            log('error', message, context)
        },
    }
}
