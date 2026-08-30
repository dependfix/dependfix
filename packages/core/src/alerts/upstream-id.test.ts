import { describe, expect, it } from 'vitest'
import { normalizeUpstreamId } from './upstream-id'

describe('normalizeUpstreamId（M20）', () => {
    describe('dependabot / code-scanning / code-quality', () => {
        it.each([
            ['dependabot', 42, 'dependabot:42'],
            ['dependabot', 1, 'dependabot:1'],
            ['code-scanning', 7, 'code-scanning:7'],
            ['code-quality', 99, 'code-quality:99'],
        ] as const)('numeric alertNumber: %s + %d → %s', (source, alertNumber, expected) => {
            expect(normalizeUpstreamId(source, { alertNumber })).toBe(expected)
        })

        it('accepts string alertNumber (defensive)', () => {
            expect(normalizeUpstreamId('dependabot', { alertNumber: '42' })).toBe('dependabot:42')
        })

        it('throws TypeError when raw is missing alertNumber', () => {
            expect(() => normalizeUpstreamId('dependabot', {} as never)).toThrow(TypeError)
            expect(() => normalizeUpstreamId('code-scanning', {} as never)).toThrow(TypeError)
            expect(() => normalizeUpstreamId('code-quality', {} as never)).toThrow(TypeError)
        })
    })

    describe('pnpm-audit', () => {
        it('formats with packageName + sha256(advisoryId) prefix', () => {
            const result = normalizeUpstreamId('pnpm-audit', {
                packageName: 'nanoid',
                advisoryId: 'GHSA-2v37-7h3g-55p8',
            })
            expect(result).toMatch(/^pnpm-audit:nanoid:[a-f0-9]{16}$/)
        })

        it('is deterministic for same inputs (idempotent across runs)', () => {
            const a = normalizeUpstreamId('pnpm-audit', { packageName: 'lodash', advisoryId: 'GHSA-p6mc-m468-83gw' })
            const b = normalizeUpstreamId('pnpm-audit', { packageName: 'lodash', advisoryId: 'GHSA-p6mc-m468-83gw' })
            expect(a).toBe(b)
        })

        it('distinguishes same advisory affecting different packages', () => {
            const a = normalizeUpstreamId('pnpm-audit', { packageName: 'foo', advisoryId: 'GHSA-x' })
            const b = normalizeUpstreamId('pnpm-audit', { packageName: 'bar', advisoryId: 'GHSA-x' })
            expect(a).not.toBe(b)
        })

        it('escapes packageName containing ":" to hex hash', () => {
            const result = normalizeUpstreamId('pnpm-audit', { packageName: '@scope/pkg:tag', advisoryId: 'GHSA-x' })
            // 第二段（pkg）应被 hex 化以避免与分隔符冲突
            expect(result).toMatch(/^pnpm-audit:[a-f0-9]{16}:[a-f0-9]{16}$/)
        })

        it('throws TypeError when raw is missing packageName', () => {
            expect(() => normalizeUpstreamId('pnpm-audit', { advisoryId: 'GHSA-x' } as never)).toThrow(TypeError)
        })

        it('throws TypeError when raw is missing advisoryId', () => {
            expect(() => normalizeUpstreamId('pnpm-audit', { packageName: 'foo' } as never)).toThrow(TypeError)
        })
    })

    describe('stability: same alert across multiple runs', () => {
        it('dependabot alertNumber stable', () => {
            // 同 alert 多次拉取产生相同 upstreamId
            const a = normalizeUpstreamId('dependabot', { alertNumber: 12345 })
            const b = normalizeUpstreamId('dependabot', { alertNumber: 12345 })
            expect(a).toBe(b)
        })

        it('pnpm-audit same packageName+advisoryId stable', () => {
            const a = normalizeUpstreamId('pnpm-audit', { packageName: 'axios', advisoryId: 'GHSA-42xw-2xvc-qx8m' })
            const b = normalizeUpstreamId('pnpm-audit', { packageName: 'axios', advisoryId: 'GHSA-42xw-2xvc-qx8m' })
            expect(a).toBe(b)
        })
    })
})
