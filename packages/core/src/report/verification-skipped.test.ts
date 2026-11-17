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

describe('generateMarkdownReport — Baseline Skipped（修复前基线短路）', () => {
    it('renders each not-sampled command with its reason', () => {
        const repoResult: RepositoryResult = {
            repository: 'foo/bar',
            defaultBranch: 'main',
            alertsCount: 2,
            fixable: 2,
            fixed: 1,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 100,
            verificationPassed: false,
            verificationBlocking: false,
            baselineSkippedCommands: [
                { command: 'pnpm lint', reason: 'install-baseline-failed' },
                { command: 'pnpm test', reason: 'install-baseline-failed' },
            ],
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: {
                ...EMPTY_RUN_RESULT.summary,
                baselineSkippedCommands: 2,
            },
            repositories: [repoResult],
        }

        const md = generateMarkdownReport(result)
        expect(md).toContain('## Baseline Skipped')
        expect(md).toContain(
            '| `foo/bar` | `pnpm lint` | not sampled (the install command already fails before this run) |',
        )
        expect(md).toContain(
            '| `foo/bar` | `pnpm test` | not sampled (the install command already fails before this run) |',
        )
        // 未采样不得渲染成「验证跳过」（终验照常执行）
        expect(md).not.toContain('## Verification Skipped')
    })

    it('omits the section when no command was short-circuited', () => {
        const md = generateMarkdownReport(EMPTY_RUN_RESULT)
        expect(md).not.toContain('## Baseline Skipped')
    })
})
