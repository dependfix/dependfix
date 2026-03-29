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
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
}

function shouldLog(minLevel: LogLevel, level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel]
}

function writeLog(name: string, level: LogLevel, message: string, context?: LogContext) {
    const payload = {
        ts: new Date().toISOString(),
        level,
        logger: name,
        message,
        ...(context ? { context } : {}),
    }

    const line = JSON.stringify(payload)

    if (level === 'error') {
        console.error(line)
        return
    }

    if (level === 'warn') {
        console.warn(line)
        return
    }

    console.log(line)
}

export function createLogger(options: LoggerOptions): Logger {
    const minLevel = options.minLevel ?? 'info'

    function log(level: LogLevel, message: string, context?: LogContext) {
        if (!shouldLog(minLevel, level)) {
            return
        }

        writeLog(options.name, level, message, context)
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
