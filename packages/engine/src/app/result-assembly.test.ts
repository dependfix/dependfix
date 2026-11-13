import { describe, expect, it } from 'vitest'
import { createEmptyRunSummary } from '@dependfix/core'
import { computeSummary, formatSkippedByPackageSummary } from './result-assembly'
import type { AppContext } from './helpers'

function makeCtx(overrides: Partial<Pick<AppContext, 'allActions' | 'allAlerts' | 'allErrors' | 'alertsDisabled' | 'repoResults' | 'deliverySkips'>> = {}): Pick<AppContext, 'allActions' | 'allAlerts' | 'allErrors' | 'alertsDisabled' | 'repoResults' | 'summary'> & Pick<AppContext, 'deliverySkips'> {
    return {
        allActions: [],
        allAlerts: [],
        allErrors: [],
        alertsDisabled: [],
        repoResults: [],
        summary: createEmptyRunSummary(),
        ...overrides,
    }
}

describe('computeSummary', () => {
    it('counts reposWithAlertsDisabled by unique repository (not record count)', () => {
        const ctx = makeCtx({
            alertsDisabled: [
                { repository: 'foo/a', source: 'dependabot', message: 'disabled' },
                { repository: 'foo/a', source: 'code-scanning', message: 'disabled' },
                { repository: 'foo/b', source: 'dependabot', message: 'disabled' },
            ],
        })
        computeSummary(ctx)
        // 3 条记录但只有 2 个唯一仓库 → 计数 2（与表头「(repos)」口径一致）
        expect(ctx.summary.reposWithAlertsDisabled).toBe(2)
    })

    it('sets reposWithAlertsDisabled to 0 when no disabled records', () => {
        const ctx = makeCtx()
        computeSummary(ctx)
        expect(ctx.summary.reposWithAlertsDisabled).toBe(0)
    })

    it('counts verification-skipped repos by reason', () => {
        const ctx = makeCtx({
            repoResults: [
                { repository: 'foo/a', verificationSkipped: 'no-write' },
                { repository: 'foo/b', verificationSkipped: 'budget' },
                { repository: 'foo/c', verificationSkipped: 'no-write' },
                { repository: 'foo/d', verificationPassed: true },
            ] as never,
        })
        computeSummary(ctx)
        expect(ctx.summary.verificationsSkipped).toBe(3)
        expect(ctx.summary.verificationSkippedByReason).toEqual({ 'no-write': 2, budget: 1 })
    })

    it('counts environmental failures from ENVIRONMENT_ERROR audit entries only', () => {
        const ctx = makeCtx({
            allErrors: [
                { repository: 'foo/a', stage: 'repair', category: 'ENVIRONMENT_ERROR', message: 'killed by SIGKILL' },
                { repository: 'foo/b', stage: 'fix', category: 'ENVIRONMENT_ERROR', message: 'install timeout' },
                { repository: 'foo/a', stage: 'fix', category: 'PROCESS_FAILED', message: 'not environmental' },
            ],
            // 同一事件也可能带 action 标记；本字段只按审计条目计数，不得双计
            allActions: [{
                type: 'lockfile-repair',
                repository: 'foo/a',
                target: 'pnpm-lock.yaml',
                success: false,
                environmentalFailure: true,
            }],
        })
        computeSummary(ctx)
        expect(ctx.summary.environmentalFailures).toBe(2)
        // 环境性失败不进入归因失败计数
        expect(ctx.summary.alertsFailed).toBe(0)
    })

    it('excludes environmental upgrade actions from alertsFailed (non-attribution)', () => {
        const ctx = makeCtx({
            allErrors: [{
                repository: 'foo/a',
                target: 'lodash',
                stage: 'fix',
                category: 'ENVIRONMENT_ERROR',
                message: 'install failed (environmental): pnpm install failed: timed out',
            }],
            allActions: [
                // 常规分组 / 跨线 / 成员路径的环境性失败：动作保留可审计，但不计入失败
                {
                    type: 'dependency-upgrade',
                    repository: 'foo/a',
                    target: 'lodash',
                    success: false,
                    environmentalFailure: true,
                    error: 'pnpm install failed: timed out',
                } as never,
                // 真实失败仍照常归因
                {
                    type: 'dependency-upgrade',
                    repository: 'foo/a',
                    target: 'minimist',
                    success: false,
                    error: 'ERR_PNPM_PEER_DEP_ISSUES',
                } as never,
            ],
        })
        computeSummary(ctx)
        expect(ctx.summary.alertsFailed).toBe(1)
        expect(ctx.summary.environmentalFailures).toBe(1)
    })

    it('computes alert-level unfixed when one action fixes multiple same-package alerts', () => {
        const alert = {
            source: 'dependabot',
            repository: 'foo/a',
            packageName: 'lodash',
            recommendedVersion: '4.17.21',
        }
        const ctx = makeCtx({
            allAlerts: [{ ...alert, id: 1 }, { ...alert, id: 2 }] as never,
            allActions: [{
                type: 'dependency-upgrade',
                repository: 'foo/a',
                target: 'lodash',
                success: true,
                toVersion: '4.17.21',
            }] as never,
        })
        computeSummary(ctx)
        // action 级 fixed = 1，但两条告警都被该 action 满足 → 告警级 unfixed = 0
        expect(ctx.summary.alertsFound).toBe(2)
        expect(ctx.summary.alertsFixed).toBe(1)
        expect(ctx.summary.alertsUnfixed).toBe(0)
    })

    it('keeps alert-level unfixed for same-package alerts whose target major is not satisfied', () => {
        const ctx = makeCtx({
            allAlerts: [
                { id: 1, source: 'dependabot', repository: 'foo/a', packageName: 'vite', recommendedVersion: '6.4.3' },
                { id: 2, source: 'dependabot', repository: 'foo/a', packageName: 'vite', recommendedVersion: '5.4.21' },
            ] as never,
            allActions: [{
                type: 'dependency-upgrade',
                repository: 'foo/a',
                target: 'vite',
                success: true,
                toVersion: '6.4.3',
            }] as never,
        })
        computeSummary(ctx)
        expect(ctx.summary.alertsFound).toBe(2)
        expect(ctx.summary.alertsFixed).toBe(1)
        // 5.x 告警不能被 6.4.3 的目标满足 → 仍有一条未修复
        expect(ctx.summary.alertsUnfixed).toBe(1)
    })

    it('sets environmentalFailures to 0 when no environmental errors', () => {
        const ctx = makeCtx()
        computeSummary(ctx)
        expect(ctx.summary.environmentalFailures).toBe(0)
    })
})

describe('computeSummary — delivery skip', () => {
    it('按去重仓库集计数，载体计数按 run 级记录派生（幂等）', () => {
        const ctx = makeCtx({
            deliverySkips: [
                {
                    repositories: ['a/b', 'c/d'],
                    failingCommands: ['pnpm install --frozen-lockfile'],
                    carrier: { mode: 'issue', issue: { number: 1, htmlUrl: 'x', created: true, fingerprint: 'f' } },
                },
                {
                    repositories: ['a/b'],
                    failingCommands: ['pnpm install --frozen-lockfile'],
                    carrier: { mode: 'draft', draftPr: { number: 2, htmlUrl: 'y' } },
                },
                {
                    repositories: ['e/f'],
                    failingCommands: [],
                    carrier: { mode: 'issue', issue: { number: 3, htmlUrl: 'z', created: false, fingerprint: 'g' } },
                },
            ],
        })
        computeSummary(ctx)
        expect(ctx.summary.deliverySkipped).toBe(3)
        expect(ctx.summary.deliverySkipIssues).toBe(1)
        expect(ctx.summary.deliverySkipDraftPrs).toBe(1)

        // 幂等：重复调用不清零 / 不翻倍
        computeSummary(ctx)
        expect(ctx.summary.deliverySkipped).toBe(3)
        expect(ctx.summary.deliverySkipIssues).toBe(1)
    })

    it('无记录 → 0（行为与引入前一致）', () => {
        const ctx = makeCtx()
        computeSummary(ctx)
        expect(ctx.summary.deliverySkipped).toBe(0)
        expect(ctx.summary.deliverySkipIssues).toBe(0)
        expect(ctx.summary.deliverySkipDraftPrs).toBe(0)
    })
})

describe('formatSkippedByPackageSummary', () => {
    const makeAlert = (upstreamId: string, packageName: string, recommendedVersion: string) => ({
        repository: 'foo/bar',
        source: 'dependabot' as const,
        upstreamId,
        packageName,
        currentVersion: '1.0.0',
        recommendedVersion,
        severity: 'high' as const,
        manifestPath: 'pnpm-lock.yaml',
        fixable: true,
    })

    it('returns undefined when nothing was skipped or left unfixed', () => {
        expect(formatSkippedByPackageSummary({ alerts: [], alertOutcomes: [] })).toBeUndefined()
    })

    it('falls back to the not-fixed count when no skipped outcome was recorded', () => {
        const line = formatSkippedByPackageSummary({
            alerts: [],
            alertOutcomes: [],
            summary: { ...createEmptyRunSummary(), alertsUnfixed: 4 },
        })
        expect(line).toBe('[summary] 4 alert(s) not fixed — no skipped outcome recorded')
    })

    it('summarizes blocked alerts per package with target and reasons', () => {
        const alerts = [
            ...Array.from({ length: 12 }, (_, index) => makeAlert(`dependabot:${index}`, 'nodemailer', `6.9.${index + 1}`)),
            makeAlert('dependabot:99', 'vite', '7.0.0'),
        ]
        const outcomes = alerts.map((item) => ({
            repository: item.repository,
            source: item.source,
            upstreamId: item.upstreamId,
            manifestPath: item.manifestPath,
            status: 'skipped' as const,
            reason: item.packageName === 'vite' ? 'peer-only' : 'cross-major',
        }))

        const line = formatSkippedByPackageSummary({ alerts, alertOutcomes: outcomes } as never)

        expect(line).toContain('[summary] 13 alert(s) blocked across 2 package group(s)')
        expect(line).toContain('foo/bar:nodemailer→6.9.12 ×12 (cross-major)')
        expect(line).toContain('foo/bar:vite→7.0.0 ×1 (peer-only)')
    })
})
