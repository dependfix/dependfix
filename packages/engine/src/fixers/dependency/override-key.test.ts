import { describe, expect, it } from 'vitest'
import { normalizeOverrideKey, normalizeOverrideSelector, upsertOverride } from './override-key'

// ---------------------------------------------------------------------------
// override key 归一化（pnpm overrides key 的语义等价判定）
// ---------------------------------------------------------------------------

describe('normalizeOverrideSelector', () => {
    it('maps equivalent major selectors to the same canonical form', () => {
        for (const selector of ['1', '^1', '1.x', '1.*', '^1.x', '^1.*', '^1.0', '^1.0.0', '1.x.x', '1.*.*']) {
            expect(normalizeOverrideSelector(selector)).toBe('major:1')
        }
    })

    it('keeps distinct selectors distinct (no over-merge)', () => {
        expect(normalizeOverrideSelector('~1')).toBe('~1')
        expect(normalizeOverrideSelector('^1.2')).toBe('^1.2')
        expect(normalizeOverrideSelector('1.1.21')).toBe('1.1.21')
        expect(normalizeOverrideSelector('1.0.0')).toBe('1.0.0')
        expect(normalizeOverrideSelector('^1.x.1')).toBe('^1.x.1')
    })

    it('does not merge major-0 caret forms (caret pins minor/patch at 0)', () => {
        // `^0.0` = <0.1.0、`^0.0.0` = <0.0.1，均不等于 `0`/`^0`（<1.0.0）
        expect(normalizeOverrideSelector('^0')).toBe('^0')
        expect(normalizeOverrideSelector('^0.0')).toBe('^0.0')
        expect(normalizeOverrideSelector('^0.0.0')).toBe('^0.0.0')
        // 裸 0 / 0.x 等价（都指 0.x），仍归一化
        expect(normalizeOverrideSelector('0')).toBe('major:0')
        expect(normalizeOverrideSelector('0.x')).toBe('major:0')
    })
})

describe('normalizeOverrideKey', () => {
    it('normalizes versioned keys including scoped packages', () => {
        expect(normalizeOverrideKey('brace-expansion@^1')).toBe('brace-expansion@major:1')
        expect(normalizeOverrideKey('brace-expansion@1')).toBe('brace-expansion@major:1')
        expect(normalizeOverrideKey('@babel/traverse@1')).toBe('@babel/traverse@major:1')
        expect(normalizeOverrideKey('@babel/traverse')).toBe('@babel/traverse')
    })

    it('normalizes each segment of path-level keys', () => {
        expect(normalizeOverrideKey('parent>child@1')).toBe('parent>child@major:1')
    })

    it('leaves selector-less keys unchanged', () => {
        expect(normalizeOverrideKey('vite')).toBe('vite')
        expect(normalizeOverrideKey('@vitejs/plugin-vue>vite')).toBe('@vitejs/plugin-vue>vite')
    })
})

describe('upsertOverride', () => {
    it('reuses existing equivalent key form instead of adding a duplicate', () => {
        const overrides: Record<string, string | undefined> = { 'brace-expansion@^1': '^1.1.16' }
        const result = upsertOverride(overrides, 'brace-expansion@1', '^1.1.21')

        expect(result.key).toBe('brace-expansion@^1')
        expect(result.oldValue).toBe('^1.1.16')
        expect(overrides).toEqual({ 'brace-expansion@^1': '^1.1.21' })
    })

    it('adds a new key when no equivalent key exists', () => {
        const overrides: Record<string, string | undefined> = {}
        const result = upsertOverride(overrides, 'brace-expansion@2', '^2.1.7')

        expect(result.key).toBe('brace-expansion@2')
        expect(result.oldValue).toBeUndefined()
        expect(overrides).toEqual({ 'brace-expansion@2': '^2.1.7' })
    })
})
