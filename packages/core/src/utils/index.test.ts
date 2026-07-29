import { describe, expect, it } from 'vitest'
import { compactRecord, ensureArray, isValidRepoIdentifier } from './index'

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
        expect(isValidRepoIdentifier('CaoMeiYouRen/dependfix')).toBe(true)
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
