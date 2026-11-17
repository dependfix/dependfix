import { describe, expect, it } from 'vitest'
import { createEmptyRunSummary } from './run-summary'
import {
    addSkipped,
    addTruncatedBySeverity,
    countDiscoveredAlerts,
    countUnfixedAlerts,
    formatSkipReason,
    skippedBreakdown,
    truncatedBreakdown,
} from './summary-counters'

describe('summary-counters', () => {
    it('addSkipped 同步累加总数与原因分组', () => {
        const summary = createEmptyRunSummary()
        addSkipped(summary, 'cross-major')
        addSkipped(summary, 'cross-major', 2)
        addSkipped(summary, 'not-fixable', 3)

        expect(summary.alertsSkipped).toBe(6)
        expect(summary.alertsSkippedByReason).toEqual({ 'cross-major': 3, 'not-fixable': 3 })
        expect(summary.alertsSkippedByReason && Object.values(summary.alertsSkippedByReason).reduce((a, b) => a + b, 0))
            .toBe(summary.alertsSkipped)
    })

    it('addSkipped 忽略 0 / 负数，不产生空 key', () => {
        const summary = createEmptyRunSummary()
        addSkipped(summary, 'override-protected', 0)
        addSkipped(summary, 'override-protected', -2)
        expect(summary.alertsSkipped).toBe(0)
        expect(summary.alertsSkippedByReason).toEqual({})
    })

    it('addTruncatedBySeverity 同步累加总数与严重级别分组', () => {
        const summary = createEmptyRunSummary()
        addTruncatedBySeverity(summary, [
            { severity: 'critical' },
            { severity: 'high' },
            { severity: 'high' },
        ])
        expect(summary.alertsTruncated).toBe(3)
        expect(summary.alertsTruncatedBySeverity).toEqual({ critical: 1, high: 2 })
        expect(summary.alertsTruncatedBySeverity && Object.values(summary.alertsTruncatedBySeverity).reduce((a, b) => a + b, 0))
            .toBe(summary.alertsTruncated)
    })

    it('skippedBreakdown 按稳定顺序返回，旧 summary 回退 other', () => {
        const summary = createEmptyRunSummary()
        addSkipped(summary, 'not-fixable', 2)
        addSkipped(summary, 'cross-major', 4)
        expect(skippedBreakdown(summary)).toEqual([
            { key: 'cross-major', count: 4 },
            { key: 'not-fixable', count: 2 },
        ])

        // 旧 summaryJson：只有总数，没有分组字段
        expect(skippedBreakdown({ alertsSkipped: 5 })).toEqual([{ key: 'other', count: 5 }])
        // 分组和小于总数：差额归 other，保证总数不丢
        expect(skippedBreakdown({ alertsSkipped: 7, alertsSkippedByReason: { 'cross-major': 4 } }))
            .toEqual([{ key: 'cross-major', count: 4 }, { key: 'other', count: 3 }])
    })

    it('truncatedBreakdown 按严重级别顺序返回，旧 summary 回退 other', () => {
        const summary = createEmptyRunSummary()
        addTruncatedBySeverity(summary, [
            { severity: 'medium' },
            { severity: 'critical' },
            { severity: 'critical' },
        ])
        expect(truncatedBreakdown(summary)).toEqual([
            { key: 'critical', count: 2 },
            { key: 'medium', count: 1 },
        ])

        expect(truncatedBreakdown({ alertsTruncated: 3 })).toEqual([{ key: 'other', count: 3 }])
    })

    it('无跳过 / 截断时返回空数组', () => {
        const summary = createEmptyRunSummary()
        expect(skippedBreakdown(summary)).toEqual([])
        expect(truncatedBreakdown(summary)).toEqual([])
    })

    it('countUnfixedAlerts 优先读告警级 alertsUnfixed，旧 summary 回退近似公式', () => {
        expect(countUnfixedAlerts({ alertsFound: 10, alertsFixed: 3, alertsConverged: 2 })).toBe(5)
        expect(countUnfixedAlerts({ alertsFound: 1, alertsFixed: 3, alertsConverged: 0 })).toBe(0)
        // 同包两告警只产生一个 action：canonical = 0，旧公式会误算为 1
        expect(countUnfixedAlerts({ alertsFound: 2, alertsFixed: 1, alertsConverged: 0, alertsUnfixed: 0 })).toBe(0)
    })

    it('countDiscoveredAlerts 将截断计入总数', () => {
        expect(countDiscoveredAlerts({ alertsFound: 20, alertsTruncated: 6 })).toBe(26)
    })
})

describe('formatSkipReason — 新增跳过原因', () => {
    it('混合实例 / 仅传递依赖有独立文案（不得回落 other）', () => {
        expect(formatSkipReason('mixed-instance')).toContain('Mixed instances')
        expect(formatSkipReason('transitive-only')).toContain('Transitive only')
        expect(formatSkipReason('install-baseline-failed')).toContain('Pre-fix install failed')
    })
})
