/**
 * 平台层统一日志（Winston + 文件轮转 + Axiom）。
 *
 * 设计参照 momei/server/utils/logger.ts，适配 dependfix 平台需求：
 * - 控制台输出（TTY 带颜色，非 TTY JSON）
 * - 文件输出（DailyRotateFile，按日期轮转，生产压缩）
 * - Axiom 远程日志（可选，AXIOM_DATASET + AXIOM_TOKEN）
 * - 敏感信息脱敏（token/密码/URL 凭据）
 *
 * 环境变量：
 * - LOG_LEVEL：日志级别（debug/info/warn/error，默认 info）
 * - LOG_DIR：日志文件目录（默认 data/logs）
 * - LOGFILES：是否启用文件日志（true/false，默认 true）
 * - AXIOM_DATASET：Axiom 数据集名称（可选）
 * - AXIOM_TOKEN：Axiom API token（可选）
 */

import fs from 'node:fs'
import path from 'node:path'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { sanitizeDeep } from './sanitize'

// ---------------------------------------------------------------------------
// 环境变量解析
// ---------------------------------------------------------------------------

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info'
const LOG_DIR = process.env.LOG_DIR ?? 'data/logs'
const LOGFILES = process.env.LOGFILES !== 'false' // 默认启用
const AXIOM_DATASET = process.env.AXIOM_DATASET
const AXIOM_TOKEN = process.env.AXIOM_TOKEN
const __PROD__ = process.env.NODE_ENV === 'production'
const __DEV__ = process.env.NODE_ENV === 'development'

// ---------------------------------------------------------------------------
// 敏感信息脱敏（复用 sanitize.ts 统一规则）
// ---------------------------------------------------------------------------

/**
 * 脱敏敏感信息（token/密码/URL 凭据）。
 * 已迁移至 ./sanitize.ts，此处 re-export 以兼容既有导入。
 */
export { sanitizeDeep as sanitizeLogData } from './sanitize'

// ---------------------------------------------------------------------------
// 日志目录初始化
// ---------------------------------------------------------------------------

const logDir = path.isAbsolute(LOG_DIR) ? LOG_DIR : path.join(process.cwd(), LOG_DIR)
let canWriteToFile = LOGFILES

if (LOGFILES) {
    try {
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true })
        }
        // 测试写入权限
        const testFile = path.join(logDir, '.write-test')
        fs.writeFileSync(testFile, 'test')
        fs.unlinkSync(testFile)
    } catch {
        console.warn('[logger] Failed to create log directory, file logging disabled')
        canWriteToFile = false
    }
}

// ---------------------------------------------------------------------------
// Winston 格式
// ---------------------------------------------------------------------------

/** 文件格式（不带颜色） */
const fileFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message, ...meta }: Record<string, unknown>) => {
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
        return `${String(timestamp)} ${String(level).toUpperCase().padEnd(5)} ${String(message)}${metaStr}`
    }),
)

/** 控制台格式（TTY 带颜色） */
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.errors({ stack: true }),
    winston.format.ms(),
    winston.format.colorize({ all: true }),
    winston.format.printf(({ timestamp, level, message, ...meta }: Record<string, unknown>) => {
        const metaStr = Object.keys(meta).length > 0
            ? ` ${Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`
            : ''
        return `${String(timestamp)} ${String(level)} ${String(message)}${metaStr}`
    }),
)

// ---------------------------------------------------------------------------
// Winston Logger 创建
// ---------------------------------------------------------------------------

const createWinstonLogger = () => {
    const transports: winston.transport[] = [
        // 控制台输出
        new winston.transports.Console({
            format: __DEV__ ? consoleFormat : fileFormat,
            level: LOG_LEVEL,
        }),
    ]

    // 文件输出（DailyRotateFile）
    if (canWriteToFile) {
        const rotateOptions = {
            dirname: logDir,
            datePattern: 'YYYY-MM-DD',
            zippedArchive: __PROD__,
            maxSize: '20m',
            maxFiles: '31d',
            format: fileFormat,
            auditFile: path.join(logDir, '.audit.json'),
        }

        transports.push(
            // 所有日志
            new DailyRotateFile({
                ...rotateOptions,
                filename: '%DATE%.log',
                level: LOG_LEVEL,
            }),
            // 错误日志
            new DailyRotateFile({
                ...rotateOptions,
                level: 'error',
                filename: '%DATE%.errors.log',
            }),
        )
    }

    // Axiom 远程日志（可选）
    if (AXIOM_DATASET && AXIOM_TOKEN) {
        try {
            // 动态导入 AxiomTransport（可选依赖）
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { WinstonTransport: AxiomTransport } = require('@axiomhq/winston') as { WinstonTransport: new (opts: Record<string, unknown>) => winston.transport }
            transports.push(
                new AxiomTransport({
                    dataset: AXIOM_DATASET,
                    token: AXIOM_TOKEN,
                    level: LOG_LEVEL,
                }),
            )
        } catch {
            console.warn('[logger] @axiomhq/winston not installed, Axiom logging disabled')
        }
    }

    return winston.createLogger({
        level: LOG_LEVEL,
        transports,
        exitOnError: false,
    })
}

const winstonLogger = createWinstonLogger()

// ---------------------------------------------------------------------------
// Logger 接口（兼容 @dependfix/core Logger）
// ---------------------------------------------------------------------------

export interface PlatformLogger {
    debug(message: string, context?: Record<string, unknown>): void
    info(message: string, context?: Record<string, unknown>): void
    warn(message: string, context?: Record<string, unknown>): void
    error(message: string, context?: Record<string, unknown>): void
}

/**
 * 创建平台 Logger 实例。
 * 与 @dependfix/core 的 createLogger 接口兼容，但输出到 Winston。
 */
export function createPlatformLogger(name: string): PlatformLogger {
    const log = (level: string, message: string, context?: Record<string, unknown>) => {
        const sanitized = context ? sanitizeLogData(context) as Record<string, unknown> : undefined
        winstonLogger.log(level, `[${name}] ${message}`, sanitized ?? {})
    }

    return {
        debug: (message, context) => log('debug', message, context),
        info: (message, context) => log('info', message, context),
        warn: (message, context) => log('warn', message, context),
        error: (message, context) => log('error', message, context),
    }
}

/** 默认平台 logger */
export const logger = createPlatformLogger('platform')

// ---------------------------------------------------------------------------
// 导出 Winston 实例（高级用途）
// ---------------------------------------------------------------------------

export { winstonLogger }
