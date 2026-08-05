import { describe, expect, it } from 'vitest'
import { AUTO_FIXABLE_RULES, SUGGESTED_RULES, classifyRule } from './rule-classifier'

describe('classifyRule', () => {
    it('classifies auto-fixable whitelist rules (A class)', () => {
        expect(classifyRule('jsdoc/check-alignment')).toBe('auto-fixable')
        expect(classifyRule('no-trailing-spaces')).toBe('auto-fixable')
        expect(classifyRule('eol-last')).toBe('auto-fixable')
    })

    it('classifies suggested rules (B class)', () => {
        expect(classifyRule('no-unused-vars')).toBe('suggested')
        expect(classifyRule('js/sql-injection')).toBe('suggested')
        expect(classifyRule('js/xss')).toBe('suggested')
        expect(classifyRule('py/path-injection')).toBe('suggested')
        expect(classifyRule('java/command-line-injection')).toBe('suggested')
    })

    it('classifies unknown rules as report-only (C class, default)', () => {
        expect(classifyRule('js/some-exotic-rule')).toBe('report-only')
        expect(classifyRule('')).toBe('report-only')
    })

    it('handles null / undefined / whitespace rule ids without throwing', () => {
        expect(classifyRule(null)).toBe('report-only')
        expect(classifyRule(undefined)).toBe('report-only')
        expect(classifyRule('   ')).toBe('report-only')
    })

    it('trims surrounding whitespace before matching', () => {
        expect(classifyRule('  js/sql-injection  ')).toBe('suggested')
        expect(classifyRule('  no-trailing-spaces ')).toBe('auto-fixable')
    })

    it('whitelist and suggested lists are disjoint', () => {
        for (const rule of AUTO_FIXABLE_RULES) {
            expect(SUGGESTED_RULES.has(rule)).toBe(false)
        }
    })
})
