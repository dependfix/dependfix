import { describe, expect, it } from 'vitest'
import { createEmptyRunSummary } from '@dependfix/core'
import type { ArchiveRunEntry } from './archiver'
import { formatHistory } from './history'

function makeEntry(overrides: Partial<ArchiveRunEntry> = {}): ArchiveRunEntry {
    return {
        runId: 'dependfix-test-abc',
        startedAt: '2026-08-06T10:00:00.000Z',
        durationMs: 5000,
        repositories: ['foo/bar'],
        summary: {
            ...createEmptyRunSummary(),
            alertsFound: 3,
            alertsFixed: 1,
            alertsFailed: 0,
        },
        repoStats: [{
            repository: 'foo/bar',
            alertsCount: 3,
            fixable: 2,
            fixed: 1,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 5000,
        }],
        ...overrides,
    }
}

describe('formatHistory', () => {
    it('formats entries newest first with repo-level counts and duration', () => {
        const text = formatHistory([
            makeEntry({ runId: 'a', startedAt: '2026-08-06T10:00:00.000Z' }),
            makeEntry({ runId: 'b', startedAt: '2026-08-06T08:00:00.000Z' }),
        ], 'foo/bar')

        const lines = text.split('\n')
        expect(lines[0]).toBe('Run history (newest first):')
        expect(lines[1]).toContain('2026-08-06 10:00:00 UTC')
        expect(lines[1]).toContain('alerts=3 fixed=1 failed=0')
        expect(lines[1]).toContain('duration=5s')
        expect(lines[1]).toContain('runId=a')
        expect(lines[2]).toContain('runId=b')
    })

    it('uses per-repo stats not global summary for multi-repo runs', () => {
        const entry = makeEntry({
            runId: 'multi',
            summary: { ...createEmptyRunSummary(), alertsFound: 99 }, // 全局合计
            repoStats: [{
                repository: 'foo/bar',
                alertsCount: 3,
                fixable: 2,
                fixed: 1,
                failed: 0,
                lockfileRepaired: false,
                durationMs: 5000,
            }],
        })

        const text = formatHistory([entry], 'foo/bar')
        expect(text).toContain('alerts=3 fixed=1 failed=0')
        expect(text).not.toContain('alerts=99')
    })

    it('returns a hint line when no history exists', () => {
        const text = formatHistory([], 'foo/bar')
        expect(text).toContain('No archived runs found')
    })
})
