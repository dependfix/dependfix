import { describe, expect, it } from 'vitest'
import { formatDurationInput, parseDurationInput } from './duration'

describe('parseDurationInput', () => {
    it('纯数字按分钟（兼容旧表单写法）', () => {
        expect(parseDurationInput('45')).toEqual({ ms: 45 * 60_000, status: 'ok' })
        expect(parseDurationInput('1.5')).toEqual({ ms: 90_000, status: 'ok' })
    })

    it('带单位按 ms 解析', () => {
        expect(parseDurationInput('30m')).toEqual({ ms: 1_800_000, status: 'ok' })
        expect(parseDurationInput('1h')).toEqual({ ms: 3_600_000, status: 'ok' })
        expect(parseDurationInput('90s')).toEqual({ ms: 90_000, status: 'ok' })
    })

    it('留空 = 继承', () => {
        expect(parseDurationInput('')).toEqual({ ms: null, status: 'empty' })
        expect(parseDurationInput('   ')).toEqual({ ms: null, status: 'empty' })
    })

    it('非法 / 非正数标记 invalid', () => {
        expect(parseDurationInput('abc')).toEqual({ ms: null, status: 'invalid' })
        expect(parseDurationInput('0')).toEqual({ ms: null, status: 'invalid' })
        expect(parseDurationInput('-5')).toEqual({ ms: null, status: 'invalid' })
    })
})

describe('formatDurationInput', () => {
    it('回显为可读单位', () => {
        expect(formatDurationInput(1_800_000)).toBe('30m')
        expect(formatDurationInput(3_600_000)).toBe('1h')
        expect(formatDurationInput(90_000)).toBe('90s')
        expect(formatDurationInput(10_000)).toBe('10s')
    })

    it('空值 / 非法值返回空串', () => {
        expect(formatDurationInput(null)).toBe('')
        expect(formatDurationInput(undefined)).toBe('')
        expect(formatDurationInput(0)).toBe('')
    })
})
