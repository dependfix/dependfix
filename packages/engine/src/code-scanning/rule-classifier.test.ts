import { afterEach, describe, expect, it } from 'vitest'
import { getCodeScanningFixTemplate } from './templates'
import {
    AUTO_FIXABLE_RULES,
    SUGGESTED_RULES,
    classifyRule,
    suggestionFor,
} from './rule-classifier'
import {
    DEFAULT_RULES_CONFIG,
    parseRulesConfig,
    resetActiveRulesConfig,
    setActiveRulesConfig,
    type CompiledRulesConfig,
} from './rule-config'

// classifyRule / suggestionFor 通过 module-level active config 工作，
// 每次测试前重置为默认，避免互相污染（即使 vitest 默认隔离 test file，
// 同 file 内 describe 共享模块状态）。
afterEach(() => {
    resetActiveRulesConfig()
})

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

    it('honours setActiveRulesConfig (custom A class)', () => {
        // 自定义配置：把 eol-last 移出 A 类，加 js/foo-fixable 为 A 类
        const custom: CompiledRulesConfig = {
            autoFixable: new Set(['js/foo-fixable']),
            suggested: DEFAULT_RULES_CONFIG.suggested,
        }
        setActiveRulesConfig(custom)

        expect(classifyRule('eol-last')).toBe('report-only')
        expect(classifyRule('js/foo-fixable')).toBe('auto-fixable')
        expect(classifyRule('js/sql-injection')).toBe('suggested') // B 类不变
    })

    it('honours setActiveRulesConfig (custom B class with override suggestion)', () => {
        // 自定义 B 类条目：覆盖 js/sql-injection 的建议文本
        const custom: CompiledRulesConfig = {
            autoFixable: DEFAULT_RULES_CONFIG.autoFixable,
            suggested: new Map([
                ['js/sql-injection', '自定义建议：使用 ORM 参数化'],
            ]),
        }
        setActiveRulesConfig(custom)

        expect(suggestionFor('js/sql-injection')).toBe('自定义建议：使用 ORM 参数化')
        expect(classifyRule('js/sql-injection')).toBe('suggested')
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

describe('parseRulesConfig', () => {
    it('parses a valid config with auto-fixable + suggested entries', () => {
        const result = parseRulesConfig({
            rules: [
                { id: 'eol-last', class: 'auto-fixable' },
                { id: 'js/sql-injection', class: 'suggested', suggestion: '使用参数化查询' },
            ],
        })
        expect(result).not.toBeNull()
        expect(result?.autoFixable.has('eol-last')).toBe(true)
        expect(result?.suggested.get('js/sql-injection')).toBe('使用参数化查询')
    })

    it('trims rule id and suggestion before storing', () => {
        const result = parseRulesConfig({
            rules: [
                { id: '  js/sql-injection  ', class: 'suggested', suggestion: '  使用参数化查询  ' },
            ],
        })
        expect(result?.suggested.get('js/sql-injection')).toBe('使用参数化查询')
    })

    it('rejects non-object input', () => {
        expect(parseRulesConfig(null)).toBeNull()
        expect(parseRulesConfig('invalid')).toBeNull()
        expect(parseRulesConfig([])).toBeNull()
    })

    it('rejects input missing rules array', () => {
        expect(parseRulesConfig({})).toBeNull()
        expect(parseRulesConfig({ rules: 'invalid' })).toBeNull()
    })

    it('rejects entry with empty id', () => {
        expect(parseRulesConfig({
            rules: [{ id: '', class: 'auto-fixable' }],
        })).toBeNull()
        expect(parseRulesConfig({
            rules: [{ id: '   ', class: 'auto-fixable' }],
        })).toBeNull()
    })

    it('rejects entry with invalid class', () => {
        expect(parseRulesConfig({
            rules: [{ id: 'foo', class: 'invalid' }],
        })).toBeNull()
    })

    it('rejects suggested entry missing suggestion', () => {
        expect(parseRulesConfig({
            rules: [{ id: 'foo', class: 'suggested' }],
        })).toBeNull()
        expect(parseRulesConfig({
            rules: [{ id: 'foo', class: 'suggested', suggestion: '' }],
        })).toBeNull()
    })

    it('rejects duplicate id across classes (disjointness)', () => {
        expect(parseRulesConfig({
            rules: [
                { id: 'js/x', class: 'auto-fixable' },
                { id: 'js/x', class: 'suggested', suggestion: 'foo' },
            ],
        })).toBeNull()
    })

    it('accepts report-only entries (no classification effect)', () => {
        const result = parseRulesConfig({
            rules: [
                { id: 'js/noop-rule', class: 'report-only' },
            ],
        })
        expect(result).not.toBeNull()
        expect(result?.autoFixable.has('js/noop-rule')).toBe(false)
        expect(result?.suggested.has('js/noop-rule')).toBe(false)
    })

    it('ignores suggestion field on auto-fixable entries (B-class only)', () => {
        const result = parseRulesConfig({
            rules: [
                { id: 'eol-last', class: 'auto-fixable', suggestion: 'should-be-ignored' },
            ],
        })
        expect(result).not.toBeNull()
        expect(result?.suggested.has('eol-last')).toBe(false)
    })
})
