import { describe, expect, it } from 'vitest'
import type { NormalizedSecurityAlert } from '../alerts'
import { filterAlerts, limitAlerts, prioritizeAlerts, type SeverityThreshold } from './alert-filter'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function alert(overrides: Partial<NormalizedSecurityAlert> & { id: number }): NormalizedSecurityAlert {
    return {
        id: overrides.id,
        source: 'dependabot',
        repository: 'test/repo',
        defaultBranch: 'main',
        severity: 'high',
        packageEcosystem: 'npm',
        packageName: 'test-pkg',
        manifestPath: 'package.json',
        ruleId: 'CVE-0000-0000',
        summary: 'Test alert',
        htmlUrl: 'https://github.com/test/repo/security/dependabot/1',
        fixable: false,
        fixStrategy: null,
        recommendedVersion: '1.0.0',
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// filterAlerts
// ---------------------------------------------------------------------------

describe('filterAlerts', () => {
    const alerts = [
        alert({ id: 1, severity: 'critical', packageName: 'pkg-a' }),
        alert({ id: 2, severity: 'high', packageName: 'pkg-b' }),
        alert({ id: 3, severity: 'medium', packageName: 'pkg-c' }),
        alert({ id: 4, severity: 'low', packageName: 'pkg-d' }),
        alert({ id: 5, severity: 'unknown', packageName: 'pkg-e' }),
    ]

    it('critical threshold keeps only critical', () => {
        const result = filterAlerts(alerts, { severityThreshold: 'critical' })
        expect(result.filtered).toHaveLength(1)
        expect(result.filtered[0].severity).toBe('critical')
        expect(result.skipped).toHaveLength(4)
    })

    it('high threshold keeps critical + high', () => {
        const result = filterAlerts(alerts, { severityThreshold: 'high' })
        expect(result.filtered).toHaveLength(2)
        expect(result.filtered.map((a) => a.severity)).toEqual(['critical', 'high'])
        expect(result.skipped).toHaveLength(3)
    })

    it('medium threshold keeps critical + high + medium', () => {
        const result = filterAlerts(alerts, { severityThreshold: 'medium' })
        expect(result.filtered).toHaveLength(3)
        expect(result.skipped).toHaveLength(2)
        expect(result.skipped.every((s) => s.alert.severity === 'low' || s.alert.severity === 'unknown')).toBe(true)
    })

    it('all threshold keeps everything', () => {
        const result = filterAlerts(alerts, { severityThreshold: 'all' })
        expect(result.filtered).toHaveLength(5)
        expect(result.skipped).toHaveLength(0)
    })

    it('skipped items include reason with severity info', () => {
        const result = filterAlerts(alerts, { severityThreshold: 'high' })
        const skippedLow = result.skipped.find((s) => s.alert.severity === 'low')
        expect(skippedLow?.reason).toContain('low')
        expect(skippedLow?.reason).toContain('high')
    })

    it('handles empty input', () => {
        const result = filterAlerts([], { severityThreshold: 'high' })
        expect(result.filtered).toHaveLength(0)
        expect(result.skipped).toHaveLength(0)
    })

    it('all thresholds produce valid results', () => {
        const thresholds: SeverityThreshold[] = ['critical', 'high', 'medium', 'all']
        for (const threshold of thresholds) {
            const result = filterAlerts(alerts, { severityThreshold: threshold })
            expect(result.filtered.length + result.skipped.length).toBe(alerts.length)
        }
    })

    it('keeps code-scanning unknown alerts regardless of threshold (SARIF no-severity passthrough)', () => {
        // 收尾审查遗留修复：cs 告警 unknown 恒透传（不静默）；Dependabot unknown 维持过滤
        const result = filterAlerts([
            ...alerts,
            alert({ id: 6, severity: 'unknown', source: 'code-scanning', packageName: 'js/x' }),
        ], { severityThreshold: 'critical' })

        expect(result.filtered.map((a) => a.id)).toContain(6)
        expect(result.filtered).toHaveLength(2) // critical + cs-unknown
        expect(result.skipped.some((s) => s.alert.id === 5)).toBe(true) // dependabot unknown 仍过滤
    })
})

// ---------------------------------------------------------------------------
// prioritizeAlerts
// ---------------------------------------------------------------------------

describe('prioritizeAlerts', () => {
    it('fixable alerts come first', () => {
        const alerts = [
            alert({ id: 1, severity: 'low', packageName: 'pkg-a', fixable: false, fixStrategy: null }),
            alert({ id: 2, severity: 'low', packageName: 'pkg-b', fixable: true, fixStrategy: 'upgrade' }),
            alert({ id: 3, severity: 'critical', packageName: 'pkg-c', fixable: false, fixStrategy: null }),
        ]
        const result = prioritizeAlerts(alerts)
        expect(result[0].id).toBe(2) // fixable with 'upgrade' strategy
        expect(result[1].id).toBe(3) // critical, not fixable
        expect(result[2].id).toBe(1) // low, not fixable
    })

    it('sorts by severity descending within same fixable group', () => {
        const alerts = [
            alert({ id: 1, severity: 'medium', packageName: 'pkg-a', fixable: true, fixStrategy: 'upgrade' }),
            alert({ id: 2, severity: 'critical', packageName: 'pkg-b', fixable: true, fixStrategy: 'upgrade' }),
            alert({ id: 3, severity: 'high', packageName: 'pkg-c', fixable: true, fixStrategy: 'upgrade' }),
        ]
        const result = prioritizeAlerts(alerts)
        expect(result.map((a) => a.severity)).toEqual(['critical', 'high', 'medium'])
    })

    it('sorts by packageName alphabetically when severity is equal', () => {
        const alerts = [
            alert({ id: 1, severity: 'high', packageName: 'z-pkg' }),
            alert({ id: 2, severity: 'high', packageName: 'a-pkg' }),
            alert({ id: 3, severity: 'high', packageName: 'm-pkg' }),
        ]
        const result = prioritizeAlerts(alerts)
        expect(result.map((a) => a.packageName)).toEqual(['a-pkg', 'm-pkg', 'z-pkg'])
    })

    it('treats fixable=false with fixStrategy=null as non-fixable', () => {
        const alerts = [
            alert({ id: 1, severity: 'critical', packageName: 'pkg-a', fixable: true, fixStrategy: null }),
            alert({ id: 2, severity: 'low', packageName: 'pkg-b', fixable: true, fixStrategy: 'upgrade' }),
        ]
        const result = prioritizeAlerts(alerts)
        // id:2 is fixable (has fixStrategy), id:1 has fixStrategy=null → not fixable
        expect(result[0].id).toBe(2)
    })

    it('returns a new array (does not mutate input)', () => {
        const alerts = [
            alert({ id: 1, severity: 'high', packageName: 'b-pkg' }),
            alert({ id: 2, severity: 'high', packageName: 'a-pkg' }),
        ]
        const original = [...alerts]
        const result = prioritizeAlerts(alerts)
        expect(result).not.toBe(alerts)
        expect(alerts).toEqual(original)
    })
})

// ---------------------------------------------------------------------------
// limitAlerts
// ---------------------------------------------------------------------------

describe('limitAlerts', () => {
    const alerts = [
        alert({ id: 1, severity: 'critical', packageName: 'pkg-a' }),
        alert({ id: 2, severity: 'high', packageName: 'pkg-b' }),
        alert({ id: 3, severity: 'high', packageName: 'pkg-c' }),
        alert({ id: 4, severity: 'medium', packageName: 'pkg-d' }),
        alert({ id: 5, severity: 'low', packageName: 'pkg-e' }),
    ]

    it('returns all alerts when under limit', () => {
        const result = limitAlerts(alerts, 10)
        expect(result.limited).toHaveLength(5)
        expect(result.truncated).toHaveLength(0)
    })

    it('returns all alerts when exactly at limit', () => {
        const result = limitAlerts(alerts, 5)
        expect(result.limited).toHaveLength(5)
        expect(result.truncated).toHaveLength(0)
    })

    it('truncates when over limit', () => {
        const result = limitAlerts(alerts, 3)
        expect(result.limited).toHaveLength(3)
        expect(result.limited.map((a) => a.id)).toEqual([1, 2, 3])
        expect(result.truncated).toHaveLength(2)
        expect(result.truncated.map((t) => t.alert.id)).toEqual([4, 5])
    })

    it('truncated items include reason', () => {
        const result = limitAlerts(alerts, 2)
        expect(result.truncated).toHaveLength(3)
        for (const item of result.truncated) {
            expect(item.reason).toContain('exceeded max alerts')
            expect(item.reason).toContain('5 > 2')
        }
    })

    it('handles empty input', () => {
        const result = limitAlerts([], 5)
        expect(result.limited).toHaveLength(0)
        expect(result.truncated).toHaveLength(0)
    })

    it('limits to 0 returns all truncated', () => {
        const result = limitAlerts(alerts, 0)
        expect(result.limited).toHaveLength(0)
        expect(result.truncated).toHaveLength(5)
    })
})
