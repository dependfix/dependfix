import { describe, expect, it } from 'vitest'
import { isEmailNotVerifiedError, isRateLimitedError } from './auth-errors'

describe('isEmailNotVerifiedError', () => {
    it('matches the better-auth error code', () => {
        expect(isEmailNotVerifiedError({ code: 'EMAIL_NOT_VERIFIED', status: 403 })).toBe(true)
    })

    it('falls back to status + message when the code is absent', () => {
        expect(isEmailNotVerifiedError({ status: 403, message: 'Email not verified' })).toBe(true)
    })

    it('does not classify wrong password or other failures as unverified', () => {
        expect(isEmailNotVerifiedError({ code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 })).toBe(false)
        expect(isEmailNotVerifiedError({ status: 403, message: 'Forbidden' })).toBe(false)
        expect(isEmailNotVerifiedError({})).toBe(false)
    })
})

describe('isRateLimitedError', () => {
    it('matches 429 / TOO_MANY_REQUESTS', () => {
        expect(isRateLimitedError({ status: 429 })).toBe(true)
        expect(isRateLimitedError({ code: 'TOO_MANY_REQUESTS' })).toBe(true)
    })

    it('does not match other failures', () => {
        expect(isRateLimitedError({ status: 500 })).toBe(false)
        expect(isRateLimitedError({ status: 403, code: 'EMAIL_NOT_VERIFIED' })).toBe(false)
    })
})
