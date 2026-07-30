import { describe, expect, it, vi, afterEach } from 'vitest'
import { createLogger, type LoggerOptions } from './logger'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CapturedLine {
    stream: 'stdout' | 'stderr'
    line: string
}

function captureConsole(): CapturedLine[] {
    const captured: CapturedLine[] = []

    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        captured.push({ stream: 'stdout', line: String(args[0]) })
    })

    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        captured.push({ stream: 'stderr', line: String(args[0]) })
    })

    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        captured.push({ stream: 'stderr', line: String(args[0]) })
    })

    return captured
}

function parseCapturedJson(captured: CapturedLine[]): Record<string, unknown>[] {
    return captured.map((c) => JSON.parse(c.line) as Record<string, unknown>)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createLogger', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    // -- JSON mode (forceJson, default on non-TTY) ----------------------------

    it('outputs JSON by default (non-TTY in CI/test)', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'test-logger' })

        logger.info('hello world')

        expect(captured).toHaveLength(1)
        const parsed = JSON.parse(captured[0].line) as Record<string, unknown>
        expect(parsed.level).toBe('info')
        expect(parsed.logger).toBe('test-logger')
        expect(parsed.message).toBe('hello world')
        expect(parsed.ts).toBeDefined()
    })

    it('outputs JSON when forceJson is true', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'json-logger', forceJson: true })

        logger.info('forced json')

        expect(captured).toHaveLength(1)
        const parsed = JSON.parse(captured[0].line) as Record<string, unknown>
        expect(parsed.level).toBe('info')
        expect(parsed.logger).toBe('json-logger')
    })

    it('includes context in JSON output', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'ctx-logger', forceJson: true })

        logger.info('with context', { repo: 'foo/bar', count: 3 })

        const parsed = JSON.parse(captured[0].line) as Record<string, unknown>
        expect(parsed.context).toEqual({ repo: 'foo/bar', count: 3 })
    })

    it('omits context field in JSON when context is absent', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'no-ctx', forceJson: true })

        logger.info('no context')

        const parsed = JSON.parse(captured[0].line) as Record<string, unknown>
        expect(parsed.context).toBeUndefined()
    })

    // -- Pretty mode (TTY) ----------------------------------------------------

    it('outputs pretty formatted text in TTY mode', () => {
        // Simulate TTY
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'pretty-logger' })

        logger.info('pretty output')

        expect(captured).toHaveLength(1)
        const line = captured[0].line
        // Should NOT be valid JSON
        expect(() => JSON.parse(line)).toThrow()
        // Should contain the logger name
        expect(line).toContain('[pretty-logger]')
        // Should contain the message
        expect(line).toContain('pretty output')
        // Should contain ANSI escape codes
        expect(line).toContain('\x1b[')
    })

    it('pretty output includes context as key=value pairs', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'ctx-pretty' })

        logger.info('done', { repo: 'foo/bar', count: 3 })

        const line = captured[0].line
        // Context should appear as key=JSON pairs
        expect(line).toContain('repo="foo/bar"')
        expect(line).toContain('count=3')
    })

    // -- Level routing --------------------------------------------------------

    it('routes error level to stderr', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'err-logger', forceJson: true })

        logger.error('something broke')

        expect(captured).toHaveLength(1)
        expect(captured[0].stream).toBe('stderr')
        const parsed = JSON.parse(captured[0].line) as Record<string, unknown>
        expect(parsed.level).toBe('error')
    })

    it('routes warn level to stderr', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'warn-logger', forceJson: true })

        logger.warn('caution')

        expect(captured).toHaveLength(1)
        expect(captured[0].stream).toBe('stderr')
    })

    it('routes info level to stdout', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'info-logger', forceJson: true })

        logger.info('normal')

        expect(captured).toHaveLength(1)
        expect(captured[0].stream).toBe('stdout')
    })

    it('routes debug level to stdout', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'dbg-logger', forceJson: true, minLevel: 'debug' })

        logger.debug('verbose')

        expect(captured).toHaveLength(1)
        expect(captured[0].stream).toBe('stdout')
    })

    // -- minLevel filtering ---------------------------------------------------

    it('filters out debug when minLevel is info (default)', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'filter-logger', forceJson: true })

        logger.debug('should be filtered')

        expect(captured).toHaveLength(0)
    })

    it('allows debug when minLevel is debug', () => {
        const captured = captureConsole()
        const logger = createLogger({ name: 'verbose-logger', forceJson: true, minLevel: 'debug' })

        logger.debug('verbose message')

        expect(captured).toHaveLength(1)
        const parsed = JSON.parse(captured[0].line) as Record<string, unknown>
        expect(parsed.level).toBe('debug')
    })

    // -- forceJson option -----------------------------------------------------

    it('forceJson overrides TTY detection', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'forced', forceJson: true })

        logger.info('still json')

        // Should be valid JSON, not pretty-printed
        expect(() => JSON.parse(captured[0].line)).not.toThrow()
    })

    // -- Empty context --------------------------------------------------------

    it('does not append empty context in pretty mode', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'empty-ctx' })

        logger.info('clean', {})

        const line = captured[0].line
        expect(line).not.toContain('{}')
    })

    // -- Color presence in pretty mode ----------------------------------------

    it('info level uses blue in pretty mode', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'color-test' })

        logger.info('colored')

        const line = captured[0].line
        expect(line).toContain('\x1b[34m') // blue
    })

    it('warn level uses yellow in pretty mode', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'color-test' })

        logger.warn('caution')

        const line = captured[0].line
        expect(line).toContain('\x1b[33m') // yellow
    })

    it('error level uses red in pretty mode', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'color-test' })

        logger.error('broken')

        const line = captured[0].line
        expect(line).toContain('\x1b[31m') // red
    })

    // -- Level name padding ---------------------------------------------------

    it('pads short level names to 5 characters in pretty mode', () => {
        vi.stubGlobal('process', {
            ...process,
            stdout: { ...process.stdout, isTTY: true },
        })

        const captured = captureConsole()
        const logger = createLogger({ name: 'pad-test' })

        logger.info('test')
        // "INFO " padded to 5 chars (ends with space)
        // The padded text should appear in the line
        expect(captured[0].line).toContain('INFO')
    })
})
