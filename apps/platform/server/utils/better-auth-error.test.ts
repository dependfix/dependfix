import { describe, expect, it } from 'vitest'
import { rethrowAuthError } from './better-auth-error'

/** better-auth APIError 结构（statusCode + code + message） */
const authError = (statusCode: number, message: string) => ({
    statusCode,
    code: 'SOME_CODE',
    message,
})

describe('rethrowAuthError', () => {
    it('better-auth 403 错误转换为 h3 403（message 透传）', () => {
        try {
            rethrowAuthError(authError(403, 'You are not allowed to change users role'))
            throw new Error('expected to throw')
        } catch (err) {
            const e = err as { statusCode: number, message: string }
            expect(e.statusCode).toBe(403)
            expect(e.message).toBe('You are not allowed to change users role')
        }
    })

    it('better-auth 404 错误转换为 h3 404（message 透传）', () => {
        try {
            rethrowAuthError(authError(404, 'User not found'))
            throw new Error('expected to throw')
        } catch (err) {
            const e = err as { statusCode: number, message: string }
            expect(e.statusCode).toBe(404)
            expect(e.message).toBe('User not found')
        }
    })

    it('非 better-auth 错误原样抛出（不吞异常）', () => {
        const original = new Error('db down')
        expect(() => rethrowAuthError(original)).toThrow(original)
    })

    it('无 statusCode 的对象错误原样抛出', () => {
        const original = { code: 'E_UNKNOWN' }
        expect(() => rethrowAuthError(original)).toThrow(original)
    })
})
