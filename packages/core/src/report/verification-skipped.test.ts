import { describe, expect, it } from 'vitest'
import { EMPTY_RUN_RESULT } from './report.test-helpers'
import { generateMarkdownReport, type RepositoryResult } from './index'

describe('generateMarkdownReport — Verification Skipped', () => {
    it('renders per-repo skip reason and summary counter', () => {
        const repoResult: RepositoryResult = {
            repository: 'foo/bar',
            defaultBranch: 'main',
            alertsCount: 2,
            fixable: 0,
            fixed: 0,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 100,
            verificationPassed: undefined,
            verificationBlocking: false,
            verificationSkipped: 'no-write',
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: {
                ...EMPTY_RUN_RESULT.summary,
                verificationsSkipped: 1,
                verificationSkippedByReason: { 'no-write': 1 },
            },
            repositories: [repoResult],
        }

        const md = generateMarkdownReport(result)
        expect(md).toContain('| Verifications skipped | 1 |')
        expect(md).toContain('## Verification Skipped')
        expect(md).toContain('| `foo/bar` | no writes (verification not needed) |')
    })

    it('omits the section when no repository skipped verification', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Verification Skipped')
        expect(md).toContain('| Verifications skipped | 0 |')
    })
})
