/**
 * 内存日志捕获器（用于执行期间收集日志，存储到 ScanRun.logsJson）。
 *
 * 设计要点：
 * - 实现 @dependfix/core Logger 接口
 * - 内部维护一个日志数组，执行结束后导出
 * - 敏感信息脱敏（token/密码/URL 凭据）
 * - 可选同时输出到控制台（默认启用）
 *
 * 使用场景：
 * - ContainerExecutor 执行期间捕获引擎日志
 * - 批量执行期间捕获每个仓库的日志
 * - 日志存储到 ScanRun.logsJson 供前端展示
 */

import type { Logger, LogContext } from '@dependfix/core'
import { sanitizeDeep } from './sanitize'

/** 单条日志记录 */
export interface LogEntry {
    timestamp: string
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    context?: Record<string, unknown>
}

/** MemoryLogger 配置 */
export interface MemoryLoggerOptions {
    /** 日志名称（用于前缀标识） */
    name: string
    /** 是否同时输出到控制台（默认 true） */
    console?: boolean
    /** 最大日志条数（超出自动截断旧条目，默认1000） */
    maxEntries?: number
    /** 最小日志级别（默认 info） */
    minLevel?: 'debug' | 'info' | 'warn' | 'error'
}

const LOG_LEVEL_ORDER: Record<string, number> = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
}

/**
 * 内存日志捕获器。
 *
 * @example
 * ```ts
 * const memLogger = new MemoryLogger({ name: 'executor', console: true })
 * const app = new DependfixApp({ ..., logger: memLogger })
 * await app.run()
 * const logs = memLogger.getEntries() // 获取所有日志
 * const logsJson = memLogger.toJson() // JSON 序列化
 * ```
 */
export class MemoryLogger implements Logger {
    private readonly entries: LogEntry[] = []
    private readonly name: string
    private readonly consoleOutput: boolean
    private readonly maxEntries: number
    private readonly minLevel: number

    constructor(options: MemoryLoggerOptions) {
        this.name = options.name
        this.consoleOutput = options.console !== false
        this.maxEntries = options.maxEntries ?? 1000
        this.minLevel = LOG_LEVEL_ORDER[options.minLevel ?? 'info'] ?? 20
    }

    debug(message: string, context?: LogContext): void {
        this.log('debug', message, context)
    }

    info(message: string, context?: LogContext): void {
        this.log('info', message, context)
    }

    warn(message: string, context?: LogContext): void {
        this.log('warn', message, context)
    }

    error(message: string, context?: LogContext): void {
        this.log('error', message, context)
    }

    /**
     * 获取所有日志条目（副本）。
     */
    getEntries(): LogEntry[] {
        return [...this.entries]
    }

    /**
     * 获取日志条数。
     */
    get count(): number {
        return this.entries.length
    }

    /**
     * JSON 序列化（用于存储到 ScanRun.logsJson）。
     * 返回格式化后的日志字符串数组，每行格式：`[timestamp] LEVEL message`
     */
    toJson(): string {
        return JSON.stringify(this.entries)
    }

    /**
     * 人类可读格式（用于调试和控制台输出）。
     * 每行格式：`[timestamp] LEVEL [name] message`
     */
    toPrettyString(): string {
        return this.entries
            .map((e) => {
                const ctx = e.context ? ` ${JSON.stringify(e.context)}` : ''
                return `[${e.timestamp}] ${e.level.toUpperCase().padEnd(5)} [${this.name}] ${e.message}${ctx}`
            })
            .join('\n')
    }

    // -----------------------------------------------------------------------
    // 内部实现
    // -----------------------------------------------------------------------

    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: LogContext): void {
        // 级别过滤
        const levelOrder = LOG_LEVEL_ORDER[level] ?? 0
        if (levelOrder < this.minLevel) {
            return
        }

        // 脱敏
        const sanitizedContext = context ? sanitizeDeep(context) as Record<string, unknown> : undefined
        const sanitizedMessage = sanitizeDeep(message) as string

        // 构建日志条目
        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            level,
            message: sanitizedMessage,
            ...(sanitizedContext && Object.keys(sanitizedContext).length > 0 ? { context: sanitizedContext } : {}),
        }

        // 添加到内存
        this.entries.push(entry)

        // 超出最大条数时截断（保留最新的）
        if (this.entries.length > this.maxEntries) {
            this.entries.splice(0, this.entries.length - this.maxEntries)
        }

        // 同时输出到控制台
        if (this.consoleOutput) {
            const prefix = `[${this.name}]`
            const fullMessage = `${prefix} ${sanitizedMessage}`
            if (level === 'error') {
                console.error(fullMessage, sanitizedContext ?? '')
            } else if (level === 'warn') {
                console.warn(fullMessage, sanitizedContext ?? '')
            } else {
                console.log(fullMessage, sanitizedContext ?? '')
            }
        }
    }
}

/**
 * 从 JSON 字符串解析日志条目。
 * 用于 API 返回给前端。
 */
export function parseLogEntries(logsJson: string | null | undefined): LogEntry[] {
    if (!logsJson) {
        return []
    }
    try {
        const parsed = JSON.parse(logsJson) as unknown
        if (!Array.isArray(parsed)) {
            return []
        }
        return parsed.filter((entry): entry is LogEntry => entry
            && typeof entry === 'object'
            && typeof (entry as LogEntry).timestamp === 'string'
            && typeof (entry as LogEntry).level === 'string'
            && typeof (entry as LogEntry).message === 'string')
    } catch {
        return []
    }
}

/**
 * 将日志条目格式化为人类可读字符串。
 * 用于 run-detail-dialog 展示。
 */
export function formatLogEntries(entries: LogEntry[]): string {
    return entries
        .map((e) => {
            const ctx = e.context ? ` ${JSON.stringify(e.context)}` : ''
            return `[${e.timestamp}] ${e.level.toUpperCase().padEnd(5)} ${e.message}${ctx}`
        })
        .join('\n')
}
