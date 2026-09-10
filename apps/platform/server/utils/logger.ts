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
 *
 * 重构（M27.3 / 2026-09-10）：
 * - 顶层副作用（fs 检测 + winstonLogger 创建）封装到 initLogger() 函数
 * - 拆分 createWinstonLogger 为可测纯函数（readEnv / resolveLogDir / tryInitLogDir /
 *   buildFileFormat / buildConsoleFormat / tryLoadAxiomTransport）
 * - 加 isDirectExecution(import.meta.url) 顶层守卫（与 scripts/shared/cli.mjs 模式一致）
 * - 导出所有核心函数让 vitest 可 import 测试（与 check-readme-i18n.mjs 守卫惯例一致）
 * - line 244 顶层 if (isDirectExecution(...)) 守卫按惯例不可测，保持未覆盖
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

// ---------------------------------------------------------------------------
// 敏感信息脱敏（复用 sanitize.ts 统一规则）
// ---------------------------------------------------------------------------

/**
 * 脱敏敏感信息（token/密码/URL 凭据）。
 * 已迁移至 ./sanitize.ts，此处 re-export 以兼容既有导入。
 */
import { sanitizeDeep } from './sanitize'
export const sanitizeLogData = sanitizeDeep

// ---------------------------------------------------------------------------
// 纯函数：环境变量解析
// ---------------------------------------------------------------------------

export interface LoggerEnv {
    LOG_LEVEL: string
    LOG_DIR: string
    LOGFILES: boolean
    AXIOM_DATASET: string | undefined
    AXIOM_TOKEN: string | undefined
    __PROD__: boolean
    __DEV__: boolean
}

/**
 * 解析环境变量为 LoggerEnv（纯函数 + 默认值兜底）。
 * 测试可传入 mock env 对象验证各分支。
 */
export function readEnv(env: NodeJS.ProcessEnv = process.env): LoggerEnv {
    return {
        LOG_LEVEL: env.LOG_LEVEL ?? 'info',
        LOG_DIR: env.LOG_DIR ?? 'data/logs',
        LOGFILES: env.LOGFILES !== 'false',
        AXIOM_DATASET: env.AXIOM_DATASET,
        AXIOM_TOKEN: env.AXIOM_TOKEN,
        __PROD__: env.NODE_ENV === 'production',
        __DEV__: env.NODE_ENV === 'development',
    }
}

/**
 * 解析日志目录绝对路径（绝对路径直接使用，相对路径以 cwd 为基准）。
 */
export function resolveLogDir(rawDir: string, cwd: string = process.cwd()): string {
    return path.isAbsolute(rawDir) ? rawDir : path.join(cwd, rawDir)
}

// ---------------------------------------------------------------------------
// 副作用封装：日志目录初始化（mockable fs）
// ---------------------------------------------------------------------------

/**
 * 测试日志目录可写性；成功返回 true，失败返回 false 并 warn。
 * fsModule 默认为 node:fs；测试可传入 mock fs 验证边界。
 */
export function tryInitLogDir(logDir: string, fsModule: typeof fs = fs): boolean {
    try {
        if (!fsModule.existsSync(logDir)) {
            fsModule.mkdirSync(logDir, { recursive: true })
        }
        const testFile = path.join(logDir, '.write-test')
        fsModule.writeFileSync(testFile, 'test')
        fsModule.unlinkSync(testFile)
        return true
    } catch {
        console.warn('[logger] Failed to create log directory, file logging disabled')
        return false
    }
}

// ---------------------------------------------------------------------------
// Winston 格式构建器（纯函数 + 闭包）
// ---------------------------------------------------------------------------

/**
 * 文件格式 meta 行（无 meta 返回 ''，否则 ' {...}'）。
 * 独立可测函数（M27.3 重构——避免 printf 闭包逻辑不可覆盖）。
 */
export function buildFileMetaLine(meta: Record<string, unknown>): string {
    return Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : ''
}

/**
 * 控制台格式 meta 行（无 meta 返回 ''，否则 ' k1=v1 k2=v2'）。
 * 独立可测函数（M27.3 重构）。
 */
export function buildConsoleMetaLine(meta: Record<string, unknown>): string {
    return Object.keys(meta).length > 0
        ? ` ${Object.entries(meta).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ')}`
        : ''
}

/**
 * 文件格式日志行组装（winston format.printf callback）。
 * 独立可测函数（M27.3 重构）——mock winston printf 不实际调用 callback，
 * 提取为顶层函数让 coverage 工具能跟踪。
 */
export function buildFileFormatLine(info: Record<string, unknown>): string {
    const { timestamp, level, message, ...meta } = info as { timestamp?: unknown, level?: unknown, message?: unknown }
    return `${String(timestamp)} ${String(level).toUpperCase().padEnd(5)} ${String(message)}${buildFileMetaLine(meta)}`
}

/**
 * 控制台格式日志行组装（winston format.printf callback）。
 * 独立可测函数（M27.3 重构）。
 */
export function buildConsoleFormatLine(info: Record<string, unknown>): string {
    const { timestamp, level, message, ...meta } = info as { timestamp?: unknown, level?: unknown, message?: unknown }
    return `${String(timestamp)} ${String(level)} ${String(message)}${buildConsoleMetaLine(meta)}`
}

/**
 * 文件格式（不带颜色）。
 */
export function buildFileFormat(): winston.Logform.Format {
    return winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSSZ' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.printf(buildFileFormatLine),
    )
}

/**
 * 控制台格式（TTY 带颜色）。
 */
export function buildConsoleFormat(): winston.Logform.Format {
    return winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        winston.format.errors({ stack: true }),
        winston.format.ms(),
        winston.format.colorize({ all: true }),
        winston.format.printf(buildConsoleFormatLine),
    )
}

/**
 * 选择环境对应格式（dev → console，prod → file）。
 */
export function pickConsoleFormat(env: LoggerEnv): winston.Logform.Format {
    return env.__DEV__ ? buildConsoleFormat() : buildFileFormat()
}

// ---------------------------------------------------------------------------
// 可选依赖加载：Axiom Transport（mockable）
// ---------------------------------------------------------------------------

/**
 * 尝试加载 @axiomhq/winston transport 类。
 * 加载失败（Axiom 未安装）返回 null；测试可通过 mock require 注入。
 */
export function tryLoadAxiomTransport(): (new (opts: Record<string, unknown>) => winston.transport) | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mod = require('@axiomhq/winston') as {
            WinstonTransport?: new (opts: Record<string, unknown>) => winston.transport
            default?: { WinstonTransport?: new (opts: Record<string, unknown>) => winston.transport }
        }
        // vitest interop：vi.mock factory 返回值会被包到 default 字段；
        // 真实 CommonJS 模块直接暴露 WinstonTransport 字段。两种都支持。
        return mod.WinstonTransport ?? mod.default?.WinstonTransport ?? null
    } catch {
        console.warn('[logger] @axiomhq/winston not installed, Axiom logging disabled')
        return null
    }
}

// ---------------------------------------------------------------------------
// Winston Logger 创建
// ---------------------------------------------------------------------------

export interface CreateWinstonLoggerOptions {
    env?: LoggerEnv
    fsModule?: typeof fs
    axiomTransport?: (new (opts: Record<string, unknown>) => winston.transport) | null
}

/**
 * 创建 Winston Logger 实例。
 * 默认从 process.env 读取配置；测试可通过 options.env 注入 mock env + options.axiomTransport 注入 mock Axiom。
 */
export function createWinstonLogger(options: CreateWinstonLoggerOptions = {}): winston.Logger {
    const env = options.env ?? readEnv()
    const transports: winston.transport[] = [
        // 控制台输出
        new winston.transports.Console({
            format: pickConsoleFormat(env),
            level: env.LOG_LEVEL,
        }),
    ]

    // 文件输出（DailyRotateFile）
    if (env.LOGFILES) {
        const logDir = resolveLogDir(env.LOG_DIR)
        const canWriteToFile = tryInitLogDir(logDir, options.fsModule)
        if (canWriteToFile) {
            const rotateOptions = {
                dirname: logDir,
                datePattern: 'YYYY-MM-DD',
                zippedArchive: env.__PROD__,
                maxSize: '20m',
                maxFiles: '31d',
                format: buildFileFormat(),
                auditFile: path.join(logDir, '.audit.json'),
            }
            transports.push(
                new DailyRotateFile({
                    ...rotateOptions,
                    filename: '%DATE%.log',
                    level: env.LOG_LEVEL,
                }),
                new DailyRotateFile({
                    ...rotateOptions,
                    level: 'error',
                    filename: '%DATE%.errors.log',
                }),
            )
        }
    }

    // Axiom 远程日志（可选）
    if (env.AXIOM_DATASET && env.AXIOM_TOKEN) {
        const AxiomTransport = options.axiomTransport !== undefined ? options.axiomTransport : tryLoadAxiomTransport()
        if (AxiomTransport) {
            transports.push(
                new AxiomTransport({
                    dataset: env.AXIOM_DATASET,
                    token: env.AXIOM_TOKEN,
                    level: env.LOG_LEVEL,
                }),
            )
        }
    }

    return winston.createLogger({
        level: env.LOG_LEVEL,
        transports,
        exitOnError: false,
    })
}

// ---------------------------------------------------------------------------
// Logger 初始化与获取
// ---------------------------------------------------------------------------

let winstonLoggerInstance: winston.Logger = createWinstonLogger()

/**
 * 重新初始化 Winston Logger（CLI 模式 / 测试模式）。
 * 测试可通过此函数重置 winstonLogger 引用。
 */
export function initLogger(options: CreateWinstonLoggerOptions = {}): winston.Logger {
    winstonLoggerInstance = createWinstonLogger(options)
    return winstonLoggerInstance
}

/**
 * 获取当前 Winston Logger 实例。
 */
export function getWinstonLogger(): winston.Logger {
    return winstonLoggerInstance
}

// 兼容既有导入 `import { winstonLogger } from ...`
export const winstonLogger = new Proxy({} as winston.Logger, {
    get(_target, prop) {
        return Reflect.get(winstonLoggerInstance, prop)
    },
})

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
        winstonLoggerInstance.log(level, `[${name}] ${message}`, sanitized ?? {})
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
// 顶层守卫（与 scripts/shared/cli.mjs 模式一致）
// ---------------------------------------------------------------------------

/**
 * 判断当前模块是否作为 CLI 入口执行（vitest 测试环境下永远 false）。
 */
export function isDirectExecution(importMetaUrl: string, argvEntry: string | undefined = process.argv[1]): boolean {
    if (!argvEntry) {
        return false
    }
    return importMetaUrl === pathToFileURL(path.resolve(argvEntry)).href
}

// 顶层守卫：CLI 模式下不调用 initLogger（已由 createWinstonLogger() 默认初始化）；
// vitest 下 isDirectExecution 永远 false，不触发重置。
if (isDirectExecution(import.meta.url)) {
    initLogger()
}
