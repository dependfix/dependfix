import { describe, expect, it } from 'vitest'
import type { NormalizedSecurityAlert } from '../alerts'
import type { AlertFixOutcome } from './alert-outcomes'
import { summarizeSkippedByPackage } from './skipped-packages'

function alert(overrides: Partial<NormalizedSecurityAlert> & { upstreamId: string }): NormalizedSecurityAlert {
    return {
        repository: 'owner/repo',
        source: 'dependabot',
        packageName: 'nodemailer',
        currentVersion: '6.9.0',
        recommendedVersion: '6.9.9',
        severity: 'high',
        manifestPath: 'pnpm-lock.yaml',
        fixable: true,
        ...overrides,
    } as NormalizedSecurityAlert
}

function skipped(alertItem: NormalizedSecurityAlert, reason: string): AlertFixOutcome {
    return {
        repository: alertItem.repository,
        source: alertItem.source,
        upstreamId: alertItem.upstreamId as string,
        manifestPath: alertItem.manifestPath,
        status: 'skipped',
        reason,
    }
}

describe('summarizeSkippedByPackage', () => {
    it('collapses many alerts of the same package into one row', () => {
        const alerts = Array.from({ length: 12 }, (_, index) => alert({
            upstreamId: `dependabot:${index}`,
            recommendedVersion: `6.9.${index}`,
        }))
        const outcomes = alerts.map((item) => skipped(item, 'cross-major'))

        const rows = summarizeSkippedByPackage(alerts, outcomes)

        expect(rows).toHaveLength(1)
        expect(rows[0]).toEqual({
            repository: 'owner/repo',
            packageName: 'nodemailer',
            count: 12,
            highestTarget: '6.9.11',
            reasons: ['cross-major'],
        })
    })

    it('keeps one row per package and sorts by repository then count', () => {
        const a = alert({ upstreamId: 'dependabot:1', packageName: 'vite', recommendedVersion: '6.0.0' })
        const b = alert({ upstreamId: 'dependabot:2', packageName: 'vite', recommendedVersion: '7.0.0' })
        const c = alert({ upstreamId: 'dependabot:3', packageName: 'esbuild', repository: 'owner/repo' })
        const d = alert({ upstreamId: 'dependabot:4', packageName: 'undici', repository: 'aaa/other' })

        const rows = summarizeSkippedByPackage([a, b, c, d], [
            skipped(a, 'peer-only'),
            skipped(b, 'cross-major'),
            skipped(c, 'override-protected'),
            skipped(d, 'subdirectory-manifest'),
        ])

        expect(rows.map((row) => `${row.repository}:${row.packageName}`)).toEqual([
            'aaa/other:undici',
            'owner/repo:vite',
            'owner/repo:esbuild',
        ])
        expect(rows[1]).toMatchObject({ count: 2, highestTarget: '7.0.0' })
        // 原因按 SKIP_REASONS 顺序（cross-major 在 peer-only 之前）
        expect(rows[1].reasons).toEqual(['cross-major', 'peer-only'])
    })

    it('ignores non-skipped outcomes and alerts without an outcome', () => {
        const success = alert({ upstreamId: 'dependabot:10' })
        const failed = alert({ upstreamId: 'dependabot:11' })
        const untracked = alert({ upstreamId: 'dependabot:12' })

        const rows = summarizeSkippedByPackage([success, failed, untracked], [
            { ...skipped(success, 'cross-major'), status: 'success', reason: undefined },
            { ...skipped(failed, 'cross-major'), status: 'failed', reason: 'install failed' },
        ])

        expect(rows).toEqual([])
    })

    it('returns an empty array when outcomes are missing', () => {
        expect(summarizeSkippedByPackage([alert({ upstreamId: 'dependabot:20' })], undefined)).toEqual([])
        expect(summarizeSkippedByPackage([alert({ upstreamId: 'dependabot:21' })], [])).toEqual([])
    })

    it('keeps the first target when versions are not comparable', () => {
        const alerts = [
            alert({ upstreamId: 'dependabot:30', recommendedVersion: 'not-a-version' }),
            alert({ upstreamId: 'dependabot:31', recommendedVersion: 'also-not-a-version' }),
        ]
        const rows = summarizeSkippedByPackage(alerts, alerts.map((item) => skipped(item, 'not-fixable')))

        expect(rows[0].highestTarget).toBe('not-a-version')
        expect(rows[0].count).toBe(2)
    })
})
