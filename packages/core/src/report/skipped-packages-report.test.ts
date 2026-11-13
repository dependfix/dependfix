import { describe, expect, it } from 'vitest'
import type { NormalizedSecurityAlert } from '../alerts'
import { EMPTY_RUN_RESULT } from './report.test-helpers'
import { generateMarkdownReport } from './index'

function alert(upstreamId: string, packageName: string, recommendedVersion: string, repository = 'foo/bar'): NormalizedSecurityAlert {
    return {
        repository,
        source: 'dependabot',
        upstreamId,
        packageName,
        currentVersion: '1.0.0',
        recommendedVersion,
        severity: 'high',
        manifestPath: 'pnpm-lock.yaml',
        fixable: true,
    } as NormalizedSecurityAlert
}

describe('generateMarkdownReport — Skipped by Package', () => {
    it('aggregates multiple alerts of one package into a single report row', () => {
        const alerts = Array.from({ length: 12 }, (_, index) => alert(
            `dependabot:${index}`,
            'nodemailer',
            `6.9.${index + 1}`,
        ))
        const result = {
            ...EMPTY_RUN_RESULT,
            alerts,
            alertOutcomes: alerts.map((item) => ({
                repository: item.repository,
                source: item.source,
                upstreamId: item.upstreamId as string,
                manifestPath: item.manifestPath,
                status: 'skipped' as const,
                reason: 'cross-major',
            })),
        }

        const md = generateMarkdownReport(result)

        expect(md).toContain('## Skipped by Package')
        const rows = md.split('\n').filter((line) => line.includes('nodemailer'))
        // 12 条告警只渲染 1 行（聚合后条数在单元格内）
        expect(rows).toHaveLength(1)
        expect(rows[0]).toContain('| 12 |')
        expect(rows[0]).toContain('`6.9.12`')
        expect(rows[0]).toContain('Cross-major / manual review')
    })

    it('omits the section when there is no skipped outcome', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Skipped by Package')
    })
})
