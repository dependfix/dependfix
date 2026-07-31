import { describe, expect, it } from 'vitest'
import { compactRecord, ensureArray, isValidRepoIdentifier, toErrorMessage } from './index'

describe('compactRecord', () => {
    it('filters out undefined values', () => {
        const result = compactRecord({ a: 1, b: undefined, c: 'hello' })
        expect(result).toEqual({ a: 1, c: 'hello' })
    })

    it('returns empty object when all values are undefined', () => {
        expect(compactRecord({ a: undefined, b: undefined })).toEqual({})
    })
})

describe('ensureArray', () => {
    it('wraps a single value in an array', () => {
        expect(ensureArray(42)).toEqual([42])
    })

    it('returns array as-is', () => {
        expect(ensureArray([1, 2, 3])).toEqual([1, 2, 3])
    })

    it('wraps undefined in an array', () => {
        expect(ensureArray(undefined)).toEqual([undefined])
    })

    it('returns empty array as-is', () => {
        expect(ensureArray([])).toEqual([])
    })
})

describe('isValidRepoIdentifier', () => {
    it('accepts valid owner/repo format', () => {
        expect(isValidRepoIdentifier('owner/repo')).toBe(true)
        expect(isValidRepoIdentifier('dependfix/dependfix')).toBe(true)
        expect(isValidRepoIdentifier('foo-bar/baz_qux')).toBe(true)
        expect(isValidRepoIdentifier('a.b-c_d/a.b-c_d')).toBe(true)
    })

    it('rejects missing owner part', () => {
        expect(isValidRepoIdentifier('/repo')).toBe(false)
    })

    it('rejects missing repo part', () => {
        expect(isValidRepoIdentifier('owner/')).toBe(false)
    })

    it('rejects empty string', () => {
        expect(isValidRepoIdentifier('')).toBe(false)
    })

    it('rejects strings without slash', () => {
        expect(isValidRepoIdentifier('just-a-name')).toBe(false)
    })

    it('rejects multiple slashes', () => {
        expect(isValidRepoIdentifier('a/b/c')).toBe(false)
    })

    it('rejects whitespace', () => {
        expect(isValidRepoIdentifier(' owner/repo')).toBe(false)
        expect(isValidRepoIdentifier('owner /repo')).toBe(false)
    })
})

describe('toErrorMessage', () => {
    it('returns Error message', () => {
        expect(toErrorMessage(new Error('boom'))).toBe('boom')
    })

    it('returns string as-is', () => {
        expect(toErrorMessage('plain string')).toBe('plain string')
    })

    it('serializes serializable values as JSON', () => {
        expect(toErrorMessage({ code: 42 })).toBe('{"code":42}')
        expect(toErrorMessage([1, 2])).toBe('[1,2]')
        expect(toErrorMessage(true)).toBe('true')
        expect(toErrorMessage(3)).toBe('3')
        expect(toErrorMessage(null)).toBe('null')
    })

    it('falls back to type description for non-serializable values', () => {
        expect(toErrorMessage(undefined)).toBe('undefined')
        expect(toErrorMessage(() => 'fn')).toBe('[object Function]')
        expect(toErrorMessage(Symbol('s'))).toBe('[object Symbol]')
    })

    it('never throws on circular references', () => {
        const circular: Record<string, unknown> = { name: 'circle' }
        circular.self = circular
        expect(() => toErrorMessage(circular)).not.toThrow()
        expect(typeof toErrorMessage(circular)).toBe('string')
    })

    it('always returns a string for any input', () => {
        const inputs: unknown[] = [0, '', false, NaN, Infinity, new Date(), Object('boxed'), { a: 1 }, []]
        for (const input of inputs) {
            expect(typeof toErrorMessage(input)).toBe('string')
        }
    })
})
