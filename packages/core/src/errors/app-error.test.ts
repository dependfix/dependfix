import { describe, expect, it } from 'vitest'
import { AppError, toAppError } from './app-error'

/**
 * app-error.ts 分支覆盖补测（背景详见 docs/plan/todo.md §待评估候选「branches 阈值恢复 80% 冲刺」）：
 * toAppError 函数有 3 个返回分支（instanceof AppError / instanceof Error / catch-all），
 * 此前无单测覆盖导致 coverage 报告 16.66%；补测后预期 100%。
 */
describe('AppError', () => {
    it('constructor 保留 code / details / cause', () => {
        const cause = new Error('root')
        const error = new AppError('TEST_CODE', 'test message', { cause, details: { foo: 'bar' } })
        expect(error.code).toBe('TEST_CODE')
        expect(error.details).toEqual({ foo: 'bar' })
        expect(error.cause).toBe(cause)
        expect(error.message).toBe('test message')
        expect(error.name).toBe('AppError')
    })

    it('constructor 默认 options（无 cause / details）', () => {
        const error = new AppError('TEST_CODE', 'test message')
        expect(error.code).toBe('TEST_CODE')
        expect(error.details).toBeUndefined()
        expect(error.cause).toBeUndefined()
    })
})

describe('toAppError', () => {
    it('input 已是 AppError → 直接返回（不重新包装）', () => {
        const original = new AppError('ORIG_CODE', 'original message')
        const result = toAppError(original)
        expect(result).toBe(original)
        expect(result.code).toBe('ORIG_CODE')
    })

    it('input 是 Error 实例（非 AppError）→ 包装为 AppError，保留 message + cause', () => {
        const original = new Error('original error')
        const result = toAppError(original)
        expect(result).toBeInstanceOf(AppError)
        expect(result.code).toBe('UNKNOWN_ERROR') // 默认 fallbackCode
        expect(result.message).toBe('original error')
        expect(result.cause).toBe(original)
        expect(result.details).toBeUndefined()
    })

    it('input 是 Error 实例 + 自定义 fallbackCode', () => {
        const result = toAppError(new Error('e'), 'CUSTOM_FALLBACK')
        expect(result.code).toBe('CUSTOM_FALLBACK')
    })

    it('input 是非 Error 值（字符串 / null / undefined / 对象）→ 包装为 AppError + details 包含原值', () => {
        const cases: unknown[] = ['string error', null, undefined, 42, { foo: 'bar' }]
        for (const input of cases) {
            const result = toAppError(input)
            expect(result).toBeInstanceOf(AppError)
            expect(result.message).toBe('Unexpected non-error value thrown')
            expect(result.code).toBe('UNKNOWN_ERROR')
            expect(result.details).toEqual({ error: input })
            expect(result.cause).toBeUndefined()
        }
    })
})
