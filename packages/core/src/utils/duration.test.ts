import { describe, expect, it } from 'vitest'
import { formatDurationMs, parseDurationMs } from './duration'

describe('parseDurationMs', () => {
    it('纯数字默认按毫秒解析（环境变量历史口径）', () => {
        expect(parseDurationMs('1800000')).toBe(1_800_000)
        expect(parseDurationMs(' 60000 ')).toBe(60_000)
        expect(parseDurationMs(90_000)).toBe(90_000)
    })

    it('纯数字可指定默认单位（表单按分钟）', () => {
        expect(parseDurationMs('45', { defaultUnit: 'm' })).toBe(45 * 60_000)
        expect(parseDurationMs('1.5', { defaultUnit: 'm' })).toBe(90_000)
    })

    it('带单位输入交给 ms 解析', () => {
        expect(parseDurationMs('30m')).toBe(30 * 60_000)
        expect(parseDurationMs('1h')).toBe(3_600_000)
        expect(parseDurationMs('90s')).toBe(90_000)
        expect(parseDurationMs('2.5m')).toBe(150_000)
        expect(parseDurationMs('1d')).toBe(86_400_000)
    })

    it('亚毫秒 / 超安全整数被拒绝（floor 后不透传 0）', () => {
        expect(parseDurationMs('0.5ms')).toBeUndefined()
        expect(parseDurationMs('0.0005s')).toBeUndefined()
        expect(parseDurationMs('0.5')).toBeUndefined()
        expect(parseDurationMs('9'.repeat(21))).toBeUndefined()
        expect(parseDurationMs(0.5)).toBeUndefined()
        expect(parseDurationMs(1e21)).toBeUndefined()
    })

    it('空串 / 非法 / 零与负数返回 undefined', () => {
        expect(parseDurationMs(undefined)).toBeUndefined()
        expect(parseDurationMs(null)).toBeUndefined()
        expect(parseDurationMs('')).toBeUndefined()
        expect(parseDurationMs('   ')).toBeUndefined()
        expect(parseDurationMs('abc')).toBeUndefined()
        expect(parseDurationMs('0')).toBeUndefined()
        expect(parseDurationMs('-5')).toBeUndefined()
        expect(parseDurationMs(0)).toBeUndefined()
        expect(parseDurationMs(-1)).toBeUndefined()
    })
})

describe('formatDurationMs', () => {
    it('取能整除的最大单位', () => {
        expect(formatDurationMs(86_400_000)).toBe('1d')
        expect(formatDurationMs(3_600_000)).toBe('1h')
        expect(formatDurationMs(5_400_000)).toBe('90m')
        expect(formatDurationMs(1_800_000)).toBe('30m')
        expect(formatDurationMs(90_000)).toBe('90s')
        expect(formatDurationMs(10_000)).toBe('10s')
    })

    it('无法整除到秒时保留毫秒', () => {
        expect(formatDurationMs(1_500)).toBe('1500ms')
    })

    it('非正数 / 非法值返回 0ms', () => {
        expect(formatDurationMs(undefined)).toBe('0ms')
        expect(formatDurationMs(null)).toBe('0ms')
        expect(formatDurationMs(0)).toBe('0ms')
        expect(formatDurationMs(Number.NaN)).toBe('0ms')
    })
})
