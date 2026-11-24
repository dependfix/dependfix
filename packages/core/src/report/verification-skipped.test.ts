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
        // 交付影响列：与运行详情同源（no-write → 无交付内容）
        expect(md).toContain('| `foo/bar` | no writes (verification not needed) | no delivery content |')
        // 未修复任何告警时不输出「修复 N 条但未交付」汇总
        expect(md).not.toContain('Delivery outcome:')
    })

    it('修了 N 条但验证跳过：输出可直接解释的交付结论（预算阻断 / 无写入 / 基线红）', () => {
        const repoResult: RepositoryResult = {
            repository: 'foo/bar',
            defaultBranch: 'main',
            alertsCount: 2,
            fixable: 2,
            fixed: 2,
            failed: 0,
            lockfileRepaired: false,
            durationMs: 100,
            verificationPassed: undefined,
            verificationBlocking: false,
            verificationSkipped: 'budget',
        }
        const result = {
            ...EMPTY_RUN_RESULT,
            summary: {
                ...EMPTY_RUN_RESULT.summary,
                alertsFixed: 3,
                verificationsSkipped: 2,
                verificationSkippedByReason: { budget: 1, 'no-write': 1 },
            },
            repositories: [
                { ...repoResult, fixed: 1 },
                { ...repoResult, repository: 'foo/baz', fixed: 1, verificationSkipped: 'no-write' as const },
            ],
            deliverySkips: [{
                repositories: ['foo/baz'],
                failingCommands: ['pnpm install'],
                carrier: { mode: 'skip' as const },
            }],
        }

        const md = generateMarkdownReport(result)
        expect(md).toContain('| `foo/bar` | run budget exhausted | blocks delivery |')
        // 只统计被跳过仓库自身的修复条数（1 + 1），不把 run 级 3 条算成「未交付」
        expect(md).toContain('Delivery outcome: 2 alert(s) fixed in the repositories listed above')
        expect(md).toContain('1 repo(s) skipped by run budget (delivery blocked)')
        expect(md).toContain('1 repo(s) skipped as no-write (nothing to deliver)')
        expect(md).toContain('1 baseline-red delivery skip record(s)')
        // 明示与 Delivery Skipped 并列、不合并计数
        expect(md).toContain('两者并列展示、不合并计数')
        expect(md).toContain('| Repository | Reason | Delivery impact |')
    })

    it('跳过仓库自身修复数为 0 时不输出「未交付」结论（避免误读 run 级 fixed）', () => {
        const repoResult: RepositoryResult = {
            repository: 'foo/bar',
            defaultBranch: 'main',
            alertsCount: 1,
            fixable: 1,
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
            summary: { ...EMPTY_RUN_RESULT.summary, alertsFixed: 5, verificationsSkipped: 1 },
            repositories: [repoResult],
        }
        const md = generateMarkdownReport(result)
        expect(md).toContain('## Verification Skipped')
        expect(md).not.toContain('Delivery outcome:')
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
