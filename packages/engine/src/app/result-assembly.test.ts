import { describe, expect, it } from 'vitest'
import { createEmptyRunSummary } from '@dependfix/core'
import { computeSummary } from './result-assembly'
import type { AppContext } from './helpers'

function makeCtx(overrides: Partial<Pick<AppContext, 'allActions' | 'allAlerts' | 'alertsDisabled' | 'repoResults'>> = {}): Pick<AppContext, 'allActions' | 'allAlerts' | 'alertsDisabled' | 'repoResults' | 'summary'> {
    return {
        allActions: [],
        allAlerts: [],
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
})
