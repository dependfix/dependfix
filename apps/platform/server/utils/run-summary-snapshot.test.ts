import { describe, expect, it } from 'vitest'
import type { RunResult } from '@dependfix/core'
import { buildRunSummarySnapshot } from './run-summary-snapshot'

const summary = {
    repositoriesScanned: 1,
    alertsFound: 2,
    alertsFixable: 1,
    alertsFixed: 0,
    alertsFailed: 0,
} as RunResult['summary']

describe('buildRunSummarySnapshot', () => {
    it('returns the engine summary untouched when there is no violation', () => {
        expect(buildRunSummarySnapshot({ summary, networkViolations: [] })).toBe(summary)
    })

    it('adds the violation count and redacted targets (query strings stripped)', () => {
        const snapshot = buildRunSummarySnapshot({
            summary,
            networkViolations: [
                { time: 't', source: 'proxy', method: 'CONNECT', target: 'https://evil.example.com/x?token=secret', violation: true },
                { time: 't', source: 'command-output', method: 'GET', target: 'https://cdn.example.com/a/b', violation: true },
            ],
        })

        expect(snapshot.networkViolations).toBe(2)
        expect(snapshot.networkViolationTargets).toEqual([
            { source: 'proxy', method: 'CONNECT', target: 'evil.example.com' },
            { source: 'command-output', method: 'GET', target: 'cdn.example.com' },
        ])
        expect(JSON.stringify(snapshot)).not.toContain('token=secret')
    })

    it('caps the stored target list', () => {
        const violations = Array.from({ length: 30 }, (_, index) => ({
            time: 't',
            source: 'proxy' as const,
            method: 'CONNECT',
            target: `host-${index}.example.com:443`,
            violation: true,
        }))
        const snapshot = buildRunSummarySnapshot({ summary, networkViolations: violations })
        expect(snapshot.networkViolationTargets).toHaveLength(20)
        expect(snapshot.networkViolations).toBe(30)
    })
})
