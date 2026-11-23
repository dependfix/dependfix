import { describe, expect, it } from 'vitest'
import { toPRCheckV1View } from './pr-checks'
import type { PRCheck } from '#server/entities/pr-check'

/** 构造最小 PRCheck 行（仅覆盖 v1 视图构建所需字段） */
const makeRow = (overrides: Partial<PRCheck> = {}): PRCheck => ({
    id: 'row-1',
    repositoryId: 'repo-1',
    repository: null,
    prNumber: 42,
    headSha: 'a'.repeat(40),
    authorLogin: 'dependabot[bot]',
    conclusion: 'failure',
    prState: 'open',
    signalsJson: null,
    overallStatus: 'failure',
    failureSourcesJson: null,
    providerLogsJson: null,
    checkRunId: null,
    detailsUrl: null,
    errorMessage: null,
    alertFiring: true,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    lastPolledAt: new Date('2026-11-23T00:00:00Z'),
    createdAt: new Date('2026-11-23T00:00:00Z'),
    updatedAt: new Date('2026-11-23T00:00:00Z'),
    ...overrides,
} as PRCheck)

describe('toPRCheckV1View providerLogs', () => {
    it('未采集 → providerLogs 为 null', () => {
        expect(toPRCheckV1View(makeRow()).providerLogs).toBeNull()
    })

    it('可用结果只暴露元数据：tail 不进入 v1', () => {
        const view = toPRCheckV1View(makeRow({
            providerLogsJson: JSON.stringify({
                available: true,
                provider: 'vercel',
                tail: 'secret build output',
                truncated: true,
                fetchedAt: '2026-11-23T00:00:00.000Z',
            }),
        }))
        expect(view.providerLogs).toEqual({
            available: true,
            provider: 'vercel',
            truncated: true,
            fetchedAt: '2026-11-23T00:00:00.000Z',
        })
        expect(JSON.stringify(view)).not.toContain('secret build output')
    })

    it('不可用结果保留稳定原因与 HTTP 状态', () => {
        const view = toPRCheckV1View(makeRow({
            providerLogsJson: JSON.stringify({
                available: false,
                provider: 'cloudflare',
                reason: 'unauthorized',
                status: 401,
                fetchedAt: '2026-11-23T00:00:00.000Z',
            }),
        }))
        expect(view.providerLogs).toEqual({
            available: false,
            provider: 'cloudflare',
            reason: 'unauthorized',
            status: 401,
            fetchedAt: '2026-11-23T00:00:00.000Z',
        })
    })
})
