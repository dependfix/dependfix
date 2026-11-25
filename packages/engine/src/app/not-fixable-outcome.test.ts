import { buildAlertOutcomes, type NormalizedSecurityAlert } from '@dependfix/core'
import { describe, expect, it } from 'vitest'
import { recordNotFixableAlerts } from './alert-outcomes'

// 不可自动修复残差的计数 + 明细必须同源：删掉 addSkipped 或 recordSkippedAlerts 任一侧都应红。

const alerts = [
    {
        repository: 'foo/bar',
        source: 'dependabot',
        upstreamId: 'dependabot:9',
        manifestPath: 'package.json',
        fixable: false,
        recommendedVersion: '',
    },
    {
        // fixable=true 但无推荐版本（等上游）：只计数、不落明细
        repository: 'foo/bar',
        source: 'dependabot',
        upstreamId: 'dependabot:10',
        manifestPath: 'package.json',
        fixable: true,
        recommendedVersion: '',
    },
    {
        // 非 Dependabot 源的不可自动修复：保持 not-fixable
        repository: 'foo/bar',
        source: 'code-quality',
        upstreamId: 'code-quality:11',
        manifestPath: 'src/foo.ts',
        fixable: false,
        recommendedVersion: '',
    },
] as NormalizedSecurityAlert[]

describe('recordNotFixableAlerts', () => {
    it('按来源拆分计数并写入告警级明细（等上游不落条目）', () => {
        const summary = { alertsSkipped: 0, alertsSkippedByReason: {} }
        const alertOutcomes = new Map()

        recordNotFixableAlerts({ summary, alertOutcomes }, alerts)

        expect(summary.alertsSkipped).toBe(3)
        expect(summary.alertsSkippedByReason).toEqual({ 'no-patch': 1, 'not-fixable': 2 })
        expect(alertOutcomes.size).toBe(2)
        expect(alertOutcomes.get('foo/bar\u0000dependabot\u0000dependabot:9\u0000package.json'))
            .toMatchObject({ status: 'skipped', reason: 'no-patch' })
        expect(alertOutcomes.get('foo/bar\u0000code-quality\u0000code-quality:11\u0000src/foo.ts'))
            .toMatchObject({ status: 'skipped', reason: 'not-fixable' })

        // 显式明细与属性推导同结论；等上游告警保持 not-tried（缺键）
        const outcomes = buildAlertOutcomes(alerts, [], alertOutcomes)
        expect(outcomes.find((outcome) => outcome.upstreamId === 'dependabot:9'))
            .toMatchObject({ status: 'skipped', reason: 'no-patch' })
        expect(outcomes.some((outcome) => outcome.upstreamId === 'dependabot:10')).toBe(false)
        expect(outcomes.find((outcome) => outcome.upstreamId === 'code-quality:11'))
            .toMatchObject({ status: 'skipped', reason: 'not-fixable' })
    })
})
