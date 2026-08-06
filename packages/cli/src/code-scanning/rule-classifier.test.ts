import { describe, expect, it } from 'vitest'
import { getCodeScanningFixTemplate } from '../fixers/code-scanning/templates'
import { AUTO_FIXABLE_RULES, SUGGESTED_RULES, classifyRule, suggestionFor } from './rule-classifier'

describe('classifyRule', () => {
    it('classifies auto-fixable whitelist rules (A class)', () => {
        expect(classifyRule('eol-last')).toBe('auto-fixable')
    })

    it('no-trailing-spaces falls to report-only (template removed in review)', () => {
        // 模板字符串词法歧义无法保证不改变运行时值，模板与白名单条目均已移除
        expect(classifyRule('no-trailing-spaces')).toBe('report-only')
    })

    it('jsdoc/check-alignment falls to report-only until a template exists (whitelist/template alignment)', () => {
        // 白名单与模板注册表必须一致：无模板的规则不得进入 A 类（防止永久失败语义）
        expect(classifyRule('jsdoc/check-alignment')).toBe('report-only')
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
        expect(classifyRule('  eol-last ')).toBe('auto-fixable')
    })

    it('whitelist and suggested lists are disjoint', () => {
        for (const rule of AUTO_FIXABLE_RULES) {
            expect(SUGGESTED_RULES.has(rule)).toBe(false)
        }
    })

    it('every auto-fixable whitelist rule has a fix template (whitelist/template registry alignment)', () => {
        // 防回归：白名单新增规则忘加模板会重新引入"永久失败语义"（exit 1/2）
        for (const rule of AUTO_FIXABLE_RULES) {
            expect(getCodeScanningFixTemplate(rule)).toBeDefined()
        }
    })
})

describe('suggestionFor', () => {
    it('returns rule-specific suggestions for suggested rules', () => {
        expect(suggestionFor('js/sql-injection')).toContain('参数化查询')
        expect(suggestionFor('no-unused-vars')).toContain('删除未使用')
        expect(suggestionFor('py/path-injection')).toContain('realpath')
    })

    it('returns a generic fallback for unknown rules', () => {
        expect(suggestionFor('js/exotic')).toContain('人工审查')
        expect(suggestionFor('')).toContain('人工审查')
        expect(suggestionFor(null)).toContain('人工审查')
    })

    it('trims rule id before lookup', () => {
        expect(suggestionFor('  js/sql-injection  ')).toContain('参数化查询')
    })
})
