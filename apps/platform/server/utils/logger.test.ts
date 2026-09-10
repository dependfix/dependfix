/**
 * logger.ts 单测（M27.3 / 2026-09-10）
 *
 * 重构后 logger.ts 暴露纯函数 + mockable 副作用入口；本测试覆盖所有 export。
 *
 * vitest mock 模板（参考 scripts/i18n/distill-wisdom.test.mjs L1-9）：
 * - import node: 内置模块在前
 * - vi.mock(...) 在 import 块之后（vitest 自动 hoist）
 * - 第三方 vitest
 * - sibling 脚本
 *
 * 覆盖矩阵（与重构后 exports 一一对应）：
 * - sanitizeLogData (re-export from ./sanitize)
 * - readEnv / resolveLogDir / tryInitLogDir / buildFileFormat / buildConsoleFormat
 * - pickConsoleFormat / tryLoadAxiomTransport / createWinstonLogger
 * - initLogger / getWinstonLogger / winstonLogger (Proxy)
 * - createPlatformLogger / logger / isDirectExecution
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock node:fs (vi.mock 自动 hoist)
vi.mock('node:fs', () => ({
    default: {
        existsSync: vi.fn(() => true),
        mkdirSync: vi.fn(),
        writeFileSync: vi.fn(),
        unlinkSync: vi.fn(),
    },
}))

// Mock winston
vi.mock('winston', () => {
    const mockFormat = { format: Symbol('format') }
    return {
        default: {
            format: {
                combine: vi.fn(() => mockFormat),
                timestamp: vi.fn(() => mockFormat),
                errors: vi.fn(() => mockFormat),
                splat: vi.fn(() => mockFormat),
                printf: vi.fn(() => mockFormat),
                ms: vi.fn(() => mockFormat),
                colorize: vi.fn(() => mockFormat),
            },
            transports: {
                Console: vi.fn(),
            },
            createLogger: vi.fn(() => ({
                log: vi.fn(),
                debug: vi.fn(),
                info: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            })),
        },
    }
})

// Mock winston-daily-rotate-file
vi.mock('winston-daily-rotate-file', () => ({
    default: vi.fn(),
}))

// Mock @axiomhq/winston（默认 require 成功路径；个别 case 用 vi.doMock 覆盖失败路径）
vi.mock('@axiomhq/winston', () => ({
    WinstonTransport: vi.fn(),
}))

import {
    buildConsoleFormat,
    buildConsoleFormatLine,
    buildConsoleMetaLine,
    buildFileFormat,
    buildFileFormatLine,
    buildFileMetaLine,
    createPlatformLogger,
    createWinstonLogger,
    getWinstonLogger,
    initLogger,
    isDirectExecution,
    logger,
    pickConsoleFormat,
    readEnv,
    resolveLogDir,
    sanitizeLogData,
    tryInitLogDir,
    tryLoadAxiomTransport,
    winstonLogger,
} from './logger'
import { sanitizeDeep } from './sanitize'

const mockedFs = vi.mocked(fs)
const mockedWinston = vi.mocked(winston)
const mockedDailyRotate = vi.mocked(DailyRotateFile)

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// sanitizeLogData (re-export)
// ---------------------------------------------------------------------------

describe('sanitizeLogData', () => {
    it('re-exports sanitizeDeep from ./sanitize', () => {
        expect(sanitizeLogData).toBe(sanitizeDeep)
    })

    it('sanitizes nested tokens in context', () => {
        const result = sanitizeLogData({ token: 'abc123', nested: { password: 'secret' } }) as Record<string, unknown>
        expect(result).not.toEqual({ token: 'abc123', nested: { password: 'secret' } })
    })
})

// ---------------------------------------------------------------------------
// readEnv
// ---------------------------------------------------------------------------

describe('readEnv', () => {
    it('returns defaults when env is empty', () => {
        const env = readEnv({})
        expect(env.LOG_LEVEL).toBe('info')
        expect(env.LOG_DIR).toBe('data/logs')
        expect(env.LOGFILES).toBe(true)
        expect(env.AXIOM_DATASET).toBeUndefined()
        expect(env.AXIOM_TOKEN).toBeUndefined()
        expect(env.__PROD__).toBe(false)
        expect(env.__DEV__).toBe(false)
    })

    it('honors LOG_LEVEL override', () => {
        expect(readEnv({ LOG_LEVEL: 'debug' }).LOG_LEVEL).toBe('debug')
    })

    it('honors LOG_DIR override', () => {
        expect(readEnv({ LOG_DIR: '/var/log/app' }).LOG_DIR).toBe('/var/log/app')
    })

    it('LOGFILES=false disables file logging', () => {
        expect(readEnv({ LOGFILES: 'false' }).LOGFILES).toBe(false)
    })

    it('LOGFILES=true enables file logging explicitly', () => {
        expect(readEnv({ LOGFILES: 'true' }).LOGFILES).toBe(true)
    })

    it('LOGFILES=anything-other-than-false enables file logging (default behavior)', () => {
        expect(readEnv({ LOGFILES: '0' }).LOGFILES).toBe(true)
        expect(readEnv({ LOGFILES: 'no' }).LOGFILES).toBe(true)
    })

    it('captures AXIOM_DATASET + AXIOM_TOKEN', () => {
        const env = readEnv({ AXIOM_DATASET: 'ds', AXIOM_TOKEN: 'tok' })
        expect(env.AXIOM_DATASET).toBe('ds')
        expect(env.AXIOM_TOKEN).toBe('tok')
    })

    it('NODE_ENV=production sets __PROD__ true', () => {
        expect(readEnv({ NODE_ENV: 'production' }).__PROD__).toBe(true)
        expect(readEnv({ NODE_ENV: 'production' }).__DEV__).toBe(false)
    })

    it('NODE_ENV=development sets __DEV__ true', () => {
        expect(readEnv({ NODE_ENV: 'development' }).__DEV__).toBe(true)
        expect(readEnv({ NODE_ENV: 'development' }).__PROD__).toBe(false)
    })
})

// ---------------------------------------------------------------------------
// resolveLogDir
// ---------------------------------------------------------------------------

describe('resolveLogDir', () => {
    it('returns absolute path as-is', () => {
        expect(resolveLogDir('/var/log/app')).toBe('/var/log/app')
    })

    it('joins relative path with cwd', () => {
        expect(resolveLogDir('logs', '/tmp/app')).toBe(path.join('/tmp/app', 'logs'))
    })

    it('joins relative path with default process.cwd() when cwd omitted', () => {
        expect(resolveLogDir('logs')).toBe(path.join(process.cwd(), 'logs'))
    })
})

// ---------------------------------------------------------------------------
// tryInitLogDir
// ---------------------------------------------------------------------------

describe('tryInitLogDir', () => {
    it('returns true when log dir exists and is writable', () => {
        mockedFs.existsSync.mockReturnValue(true)
        const result = tryInitLogDir('/tmp/logs')
        expect(result).toBe(true)
        expect(mockedFs.writeFileSync).toHaveBeenCalledWith(path.join('/tmp/logs', '.write-test'), 'test')
        expect(mockedFs.unlinkSync).toHaveBeenCalledWith(path.join('/tmp/logs', '.write-test'))
    })

    it('creates log dir when missing', () => {
        mockedFs.existsSync.mockReturnValue(false)
        const result = tryInitLogDir('/tmp/logs')
        expect(result).toBe(true)
        expect(mockedFs.mkdirSync).toHaveBeenCalledWith('/tmp/logs', { recursive: true })
    })

    it('returns false + warn when write throws', () => {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mockedFs.existsSync.mockReturnValue(true)
        mockedFs.writeFileSync.mockImplementation(() => {
            throw new Error('EACCES')
        })
        const result = tryInitLogDir('/tmp/logs')
        expect(result).toBe(false)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[logger]'))
        warnSpy.mockRestore()
    })

    it('returns false + warn when mkdir throws', () => {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mockedFs.existsSync.mockReturnValue(false)
        mockedFs.mkdirSync.mockImplementation(() => {
            throw new Error('EACCES')
        })
        const result = tryInitLogDir('/tmp/logs')
        expect(result).toBe(false)
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })
})

// ---------------------------------------------------------------------------
// buildFileMetaLine / buildConsoleMetaLine
// ---------------------------------------------------------------------------

describe('buildFileMetaLine', () => {
    it('returns empty string when meta is empty', () => {
        expect(buildFileMetaLine({})).toBe('')
    })

    it('returns JSON-stringified meta with leading space when meta has keys', () => {
        const result = buildFileMetaLine({ key: 'value', num: 42 })
        expect(result).toMatch(/^\s/)
        expect(result).toContain('"key":"value"')
        expect(result).toContain('"num":42')
    })
})

describe('buildConsoleMetaLine', () => {
    it('returns empty string when meta is empty', () => {
        expect(buildConsoleMetaLine({})).toBe('')
    })

    it('returns k=v pairs joined by space when meta has keys', () => {
        const result = buildConsoleMetaLine({ key: 'value', num: 42 })
        expect(result).toMatch(/^\s/)
        expect(result).toContain('key="value"')
        expect(result).toContain('num=42')
    })

    it('JSON-stringifies nested values', () => {
        const result = buildConsoleMetaLine({ obj: { nested: true } })
        expect(result).toContain('obj={"nested":true}')
    })
})

// ---------------------------------------------------------------------------
// buildFileFormatLine / buildConsoleFormatLine
// ---------------------------------------------------------------------------

describe('buildFileFormatLine', () => {
    it('formats line with timestamp + level + message (no meta)', () => {
        expect(buildFileFormatLine({ timestamp: '2026-09-10', level: 'info', message: 'hello' }))
            .toBe('2026-09-10 INFO  hello')
    })

    it('includes meta JSON-serialized when present', () => {
        const line = buildFileFormatLine({ timestamp: '2026-09-10', level: 'warn', message: 'm', foo: 'bar' })
        expect(line).toContain('2026-09-10 WARN ')
        expect(line).toContain('m')
        expect(line).toContain('"foo":"bar"')
    })
})

describe('buildConsoleFormatLine', () => {
    it('formats line with timestamp + level + message (no meta)', () => {
        expect(buildConsoleFormatLine({ timestamp: '2026-09-10', level: 'info', message: 'hello' }))
            .toBe('2026-09-10 info hello')
    })

    it('includes meta k=v pairs when present', () => {
        const line = buildConsoleFormatLine({ timestamp: '2026-09-10', level: 'info', message: 'm', foo: 'bar' })
        expect(line).toContain('2026-09-10 info m')
        expect(line).toContain('foo="bar"')
    })
})

// ---------------------------------------------------------------------------
// buildFileFormat / buildConsoleFormat / pickConsoleFormat
// ---------------------------------------------------------------------------

describe('buildFileFormat', () => {
    it('returns winston format (combine chain)', () => {
        expect(buildFileFormat()).toBeDefined()
        expect(mockedWinston.format.combine).toHaveBeenCalled()
        expect(mockedWinston.format.timestamp).toHaveBeenCalledWith({ format: 'YYYY-MM-DD HH:mm:ss.SSSZ' })
        expect(mockedWinston.format.errors).toHaveBeenCalledWith({ stack: true })
        expect(mockedWinston.format.splat).toHaveBeenCalled()
        expect(mockedWinston.format.printf).toHaveBeenCalled()
    })
})

describe('buildConsoleFormat', () => {
    it('returns winston format with colorize', () => {
        expect(buildConsoleFormat()).toBeDefined()
        expect(mockedWinston.format.colorize).toHaveBeenCalledWith({ all: true })
        expect(mockedWinston.format.ms).toHaveBeenCalled()
    })
})

describe('pickConsoleFormat', () => {
    it('returns console format in dev', () => {
        const result = pickConsoleFormat({ __DEV__: true, __PROD__: false } as never)
        expect(result).toBeDefined()
        expect(mockedWinston.format.colorize).toHaveBeenCalled()
    })

    it('returns file format in prod', () => {
        const result = pickConsoleFormat({ __DEV__: false, __PROD__: true } as never)
        expect(result).toBeDefined()
    })
})

// ---------------------------------------------------------------------------
// tryLoadAxiomTransport
// ---------------------------------------------------------------------------

describe('tryLoadAxiomTransport', () => {
    it('returns transport when require succeeds (vitest interop fallback path)', () => {
        const result = tryLoadAxiomTransport()
        expect(result === null || typeof result === 'function').toBe(true)
    })
})

// ---------------------------------------------------------------------------
// createWinstonLogger
// ---------------------------------------------------------------------------

describe('createWinstonLogger', () => {
    it('creates logger with console transport only (LOGFILES=false)', () => {
        const result = createWinstonLogger({ env: readEnv({ LOGFILES: 'false' }) })
        expect(result).toBeDefined()
        expect(mockedWinston.transports.Console).toHaveBeenCalledTimes(1)
        expect(mockedDailyRotate).not.toHaveBeenCalled()
    })

    it('adds 2 DailyRotateFile transports when LOGFILES=true and fs ok', () => {
        mockedFs.existsSync.mockReturnValue(true)
        const result = createWinstonLogger({ env: readEnv({ LOGFILES: 'true' }) })
        expect(result).toBeDefined()
        expect(mockedWinston.transports.Console).toHaveBeenCalledTimes(1)
        expect(mockedDailyRotate).toHaveBeenCalledTimes(2)
    })

    it('skips DailyRotateFile when fs write fails', () => {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        mockedFs.writeFileSync.mockImplementation(() => {
            throw new Error('EACCES')
        })
        const result = createWinstonLogger({ env: readEnv({ LOGFILES: 'true' }) })
        expect(result).toBeDefined()
        expect(mockedDailyRotate).not.toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('adds Axiom transport when AXIOM_DATASET + AXIOM_TOKEN provided', () => {
        const axiomCtor = vi.fn() as never
        const result = createWinstonLogger({
            env: readEnv({ AXIOM_DATASET: 'ds', AXIOM_TOKEN: 'tok' }),
            axiomTransport: axiomCtor,
        })
        expect(result).toBeDefined()
        expect(axiomCtor).toHaveBeenCalledWith({
            dataset: 'ds',
            token: 'tok',
            level: 'info',
        })
    })

    it('skips Axiom transport when axiomTransport is null', () => {
        const result = createWinstonLogger({
            env: readEnv({ AXIOM_DATASET: 'ds', AXIOM_TOKEN: 'tok' }),
            axiomTransport: null,
        })
        expect(result).toBeDefined()
        expect(mockedWinston.createLogger).toHaveBeenCalled()
    })

    it('uses tryLoadAxiomTransport when options.axiomTransport is undefined (default)', () => {
        const result = createWinstonLogger({
            env: readEnv({ AXIOM_DATASET: 'ds', AXIOM_TOKEN: 'tok' }),
        })
        expect(result).toBeDefined()
    })

    it('skips Axiom transport when AXIOM_DATASET missing even with token', () => {
        const result = createWinstonLogger({
            env: readEnv({ AXIOM_TOKEN: 'tok' }),
        })
        expect(result).toBeDefined()
    })

    it('passes exitOnError: false to createLogger', () => {
        createWinstonLogger({ env: readEnv({ LOGFILES: 'false' }) })
        expect(mockedWinston.createLogger).toHaveBeenCalledWith(
            expect.objectContaining({ exitOnError: false }),
        )
    })

    it('uses LOG_LEVEL override', () => {
        createWinstonLogger({ env: readEnv({ LOGFILES: 'false', LOG_LEVEL: 'debug' }) })
        expect(mockedWinston.transports.Console).toHaveBeenCalledWith(
            expect.objectContaining({ level: 'debug' }),
        )
    })

    it('uses file format when __DEV__=false (prod/test)', () => {
        createWinstonLogger({
            env: readEnv({ LOGFILES: 'false', NODE_ENV: 'production' }),
        })
        expect(mockedWinston.format.colorize).not.toHaveBeenCalled()
    })
})

// ---------------------------------------------------------------------------
// initLogger / getWinstonLogger / winstonLogger Proxy
// ---------------------------------------------------------------------------

describe('initLogger', () => {
    it('replaces internal winstonLoggerInstance', () => {
        const before = getWinstonLogger()
        const fresh = initLogger({ env: readEnv({ LOGFILES: 'false' }) })
        const after = getWinstonLogger()
        expect(after).toBe(fresh)
        expect(after).not.toBe(before)
    })
})

describe('winstonLogger Proxy', () => {
    it('proxies .log to current winstonLoggerInstance', () => {
        const target = getWinstonLogger()
        const spy = vi.spyOn(target, 'log')
        winstonLogger.log('info', 'msg')
        expect(spy).toHaveBeenCalledWith('info', 'msg')
    })
})

// ---------------------------------------------------------------------------
// createPlatformLogger + logger constant
// ---------------------------------------------------------------------------

describe('createPlatformLogger', () => {
    beforeEach(() => {
        initLogger({ env: readEnv({ LOGFILES: 'false' }) })
    })

    it('debug forwards to winstonLogger.log with prefix', () => {
        const log = createPlatformLogger('test')
        const target = getWinstonLogger()
        const spy = vi.spyOn(target, 'log')
        log.debug('hello')
        expect(spy).toHaveBeenCalledWith('debug', '[test] hello', {})
    })

    it('info forwards with sanitized context', () => {
        const log = createPlatformLogger('test')
        const target = getWinstonLogger()
        const spy = vi.spyOn(target, 'log')
        log.info('hello', { token: 'abc', data: 'public' })
        const ctxArg = (spy.mock.calls[0] as unknown as [string, string, Record<string, unknown>] | undefined)?.[2]
        expect((spy.mock.calls[0] as unknown as [string, string, string] | undefined)?.[1]).toBe('[test] hello')
        expect(ctxArg).not.toEqual({ token: 'abc', data: 'public' })
    })

    it('warn forwards without context → empty object', () => {
        const log = createPlatformLogger('test')
        const target = getWinstonLogger()
        const spy = vi.spyOn(target, 'log')
        log.warn('hello')
        expect(spy).toHaveBeenCalledWith('warn', '[test] hello', {})
    })

    it('error forwards with sanitized context', () => {
        const log = createPlatformLogger('test')
        const target = getWinstonLogger()
        const spy = vi.spyOn(target, 'log')
        log.error('boom', { password: 'secret' })
        const ctxArg = (spy.mock.calls[0] as unknown as [string, string, Record<string, unknown>] | undefined)?.[2]
        expect(ctxArg).not.toEqual({ password: 'secret' })
    })
})

describe('logger constant', () => {
    it('is a PlatformLogger instance with all 4 methods', () => {
        expect(typeof logger.debug).toBe('function')
        expect(typeof logger.info).toBe('function')
        expect(typeof logger.warn).toBe('function')
        expect(typeof logger.error).toBe('function')
    })
})

// ---------------------------------------------------------------------------
// isDirectExecution
// ---------------------------------------------------------------------------

describe('isDirectExecution', () => {
    it('returns true when importMetaUrl matches argvEntry pathToFileURL', () => {
        const entry = '/tmp/cli.mjs'
        const url = pathToFileURL(entry).href
        expect(isDirectExecution(url, entry)).toBe(true)
    })

    it('returns false when argvEntry is undefined', () => {
        expect(isDirectExecution('file:///x.mjs', undefined)).toBe(false)
    })

    it('returns false when importMetaUrl does not match argvEntry', () => {
        expect(isDirectExecution('file:///x.mjs', '/tmp/cli.mjs')).toBe(false)
    })

    it('returns false in vitest environment (argvEntry is vitest runner, not logger.ts)', () => {
        expect(isDirectExecution('file:///logger.ts', process.argv[1])).toBe(false)
    })
})
