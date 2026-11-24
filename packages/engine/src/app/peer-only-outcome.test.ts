import { buildAlertOutcomes, type FixAction, type NormalizedSecurityAlert } from '@dependfix/core'
import { describe, expect, it, vi } from 'vitest'
import { recordPeerOnlyManualReview } from './peer-only-outcome'

// peer-only「需人工」写入点：跳过计数 + 告警级结果 + noOp 动作 + 日志，四者必须同源。

const alerts = [
    { repository: 'foo/bar', packageName: 'vite', upstreamId: '1', source: 'dependabot' },
    { repository: 'foo/bar', packageName: 'vite', upstreamId: '2', source: 'dependabot' },
] as NormalizedSecurityAlert[]

const action: FixAction = {
    type: 'dependency-upgrade',
    repository: 'foo/bar',
    target: 'vite',
    fromVersion: '8.3.1',
    toVersion: '^8.3.3',
    isMajor: false,
    strategy: 'versioned-override',
    success: false,
    error: 'manual review: no manifest declares "vite" as a direct dependency; add it at 8.3.3',
    durationMs: 0,
}

describe('recordPeerOnlyManualReview', () => {
    it('跳过按告警级计数 + 落一条 noOp 动作（不带提升点 filePath）', () => {
        const summary = { alertsSkipped: 0, alertsSkippedByReason: {} } as never
        const allActions: FixAction[] = []
        const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
        const alertOutcomes = new Map()

        recordPeerOnlyManualReview(
            { summary, allActions, logger, alertOutcomes } as never,
            action,
            alerts,
            'no manifest declares "vite" as a direct dependency; add it at 8.3.3',
        )

        expect(allActions).toHaveLength(1)
        expect(allActions[0].success).toBe(true)
        expect(allActions[0].noOp).toBe(true)
        expect(allActions[0].filePath).toBeUndefined()
        expect(allActions[0].error).toContain('add it at 8.3.3')
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('no manifest declares'))
        expect((summary as unknown as { alertsSkipped: number }).alertsSkipped).toBe(2)
        expect((summary as unknown as { alertsSkippedByReason: Record<string, number> }).alertsSkippedByReason['peer-only']).toBe(2)

        // 告警级结果同源：两条都是 skipped(peer-only)，且不会被 noOp 动作派生成「已修复」
        const outcomes = buildAlertOutcomes(alerts, allActions, alertOutcomes as never)
        expect(outcomes.filter((outcome) => outcome.status === 'skipped')).toHaveLength(2)
        expect(outcomes.every((outcome) => outcome.reason === 'peer-only')).toBe(true)
    })
})
