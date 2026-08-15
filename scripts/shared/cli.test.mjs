import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
    ensureAllowedValue,
    getArgValue,
    getCliArgs,
    hasFlag,
    isDirectExecution,
    parseCliOptions,
} from './cli.mjs'

describe('getCliArgs', () => {
    it('returns full argv when all args are flags', () => {
        expect(getCliArgs(['--a', '--b=1'])).toEqual(['--a', '--b=1'])
    })

    it('strips first two entries for program-style argv', () => {
        expect(getCliArgs(['node', 'script.mjs', '--a'])).toEqual(['--a'])
    })
})

describe('getArgValue', () => {
    it('extracts value from --name=value form', () => {
        expect(getArgValue(['--locale=zh-CN'], '--locale')).toBe('zh-CN')
    })

    it('returns null when not present', () => {
        expect(getArgValue(['--format=json'], '--locale')).toBeNull()
    })
})

describe('hasFlag', () => {
    it('detects flag presence', () => {
        expect(hasFlag(['--fail-on-missing'], '--fail-on-missing')).toBe(true)
        expect(hasFlag(['--format=json'], '--fail-on-missing')).toBe(false)
    })
})

describe('ensureAllowedValue', () => {
    it('returns value when allowed', () => {
        expect(ensureAllowedValue('json', ['json', 'text'], () => 'bad')).toBe('json')
    })

    it('throws with function message', () => {
        expect(() => ensureAllowedValue('xml', ['json', 'text'], (v) => `Unsupported: ${v}`))
            .toThrow('Unsupported: xml')
    })

    it('throws with string message', () => {
        expect(() => ensureAllowedValue('xml', ['json', 'text'], 'Invalid value'))
            .toThrow('Invalid value')
    })
})

describe('parseCliOptions', () => {
    const config = {
        defaults: { format: 'text', limit: 10, locales: [] },
        flags: {
            '--fail-on-missing': { key: 'failOnMissing' },
        },
        values: {
            '--format': {
                key: 'format',
                allowedValues: ['json', 'text'],
                invalidMessage: () => 'Unsupported format value',
                parse: (value) => value.trim() || 'text',
            },
            '--limit': {
                key: 'limit',
                parse: (value) => Number(value),
            },
            '--locale': {
                key: 'locales',
                parse: (value) => value.split(',').filter(Boolean),
                collect: (current = [], next = []) => [...current, ...next],
            },
        },
    }

    it('applies defaults for empty argv', () => {
        expect(parseCliOptions([], config)).toEqual({ format: 'text', limit: 10, locales: [] })
    })

    it('parses flags and values with parsing', () => {
        const options = parseCliOptions(['--fail-on-missing', '--format=json', '--limit=5'], config)
        expect(options.failOnMissing).toBe(true)
        expect(options.format).toBe('json')
        expect(options.limit).toBe(5)
    })

    it('supports flag with custom value', () => {
        const options = parseCliOptions(['--fail-on-missing'], { ...config, flags: { '--fail-on-missing': { key: 'failOnMissing', value: 'custom' } } })
        expect(options.failOnMissing).toBe('custom')
    })

    it('collects repeated values', () => {
        const options = parseCliOptions(['--locale=zh-CN', '--locale=en-US'], config)
        expect(options.locales).toEqual(['zh-CN', 'en-US'])
    })

    it('rejects unsupported option', () => {
        expect(() => parseCliOptions(['--bogus'], config)).toThrow('Unsupported argument: --bogus')
    })

    it('skips unsupported option when allowUnknown', () => {
        expect(parseCliOptions(['--bogus'], { ...config, allowUnknown: true }).format).toBe('text')
    })

    it('rejects unsupported positional argument', () => {
        // 模拟 node script.mjs positional：非全 flag argv 经 getCliArgs slice(2) 后保留 positional
        expect(() => parseCliOptions(['node', 'script.mjs', 'positional'], config)).toThrow('Unsupported argument: positional')
    })

    it('skips -- separator but keeps following options', () => {
        expect(parseCliOptions(['--', '--format=json'], config).format).toBe('json')
    })

    it('rejects disallowed value', () => {
        expect(() => parseCliOptions(['--format=xml'], config)).toThrow('Unsupported format value')
    })

    it('rejects unsupported value option', () => {
        expect(() => parseCliOptions(['--unknown-key=1'], config)).toThrow('Unsupported argument: --unknown-key=1')
    })

    it('skips positional when allowUnknown', () => {
        expect(parseCliOptions(['node', 'script.mjs', 'positional', '--format=json'], { ...config, allowUnknown: true }).format).toBe('json')
    })
})

describe('isDirectExecution', () => {
    it('matches import.meta.url against resolved argv entry', () => {
        // 使用绝对路径解析的 file URL 构造同源对比（Windows / POSIX 均适用）
        const target = 'C:/repo/scripts/x.mjs'
        expect(isDirectExecution(pathToFileURL(target).href, target)).toBe(true)
        expect(isDirectExecution(pathToFileURL(target).href, 'C:/repo/scripts/y.mjs')).toBe(false)
    })

    it('returns false when argv entry missing', () => {
        expect(isDirectExecution('file:///x/script.mjs', undefined)).toBe(false)
    })
})
