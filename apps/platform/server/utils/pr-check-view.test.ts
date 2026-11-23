import { describe, expect, it } from 'vitest'
import { parseProviderLogsColumn, toPRCheckView } from './pr-check-view'
import type { PRCheck } from '#server/entities/pr-check'

/** 构造最小 PRCheck 行（仅覆盖视图构建所需字段） */
const makeRow = (overrides: Partial<PRCheck> = {}): PRCheck => ({
    id: 'row-1',
    repositoryId: 'repo-1',
    repository: null,
    prNumber: 42,
    headSha: 'a'.repeat(40),
    authorLogin: 'dependabot[bot]',
    conclusion: 'success',
    signalsJson: null,
    overallStatus: null,
    failureSourcesJson: null,
    checkRunId: null,
    detailsUrl: null,
    errorMessage: null,
    alertFiring: false,
    acknowledgedAt: null,
    acknowledgedByUserId: null,
    lastPolledAt: new Date('2026-10-13T00:00:00Z'),
    createdAt: new Date('2026-10-13T00:00:00Z'),
    updatedAt: new Date('2026-10-13T00:00:00Z'),
    ...overrides,
} as PRCheck)

describe('toPRCheckView', () => {
    it('仓库关系缺失（调用方漏加载 relations）→ repository 回退 null', () => {
        expect(toPRCheckView(makeRow()).repository).toBeNull()
    })

    it('仓库关系存在 → repository 为 owner/name', () => {
        const row = makeRow({ repository: { owner: 'acme', name: 'web-app' } as PRCheck['repository'] })
        expect(toPRCheckView(row).repository).toBe('acme/web-app')
    })

    it('JSON 列解析：数组正常解析 / 缺失与非数组回退 null', () => {
        const withData = toPRCheckView(makeRow({
            signalsJson: JSON.stringify([{ kind: 'check', provider: 'github-actions' }]),
            failureSourcesJson: JSON.stringify([{ provider: 'vercel', name: 'Preview', kind: 'deployment' }]),
            overallStatus: 'failure',
        }))
        expect(withData.signals).toHaveLength(1)
        expect(withData.failureSources).toHaveLength(1)
        expect(withData.overallStatus).toBe('failure')

        expect(toPRCheckView(makeRow({ signalsJson: '{}', failureSourcesJson: '42' })).signals).toBeNull()
        expect(toPRCheckView(makeRow({ signalsJson: '{}', failureSourcesJson: '42' })).failureSources).toBeNull()
    })

    it('时间列序列化为 ISO 字符串；ack 字段透传', () => {
        const view = toPRCheckView(makeRow({
            acknowledgedAt: new Date('2026-10-12T12:00:00Z'),
            acknowledgedByUserId: 'user-1',
        }))
        expect(view.lastPolledAt).toBe('2026-10-13T00:00:00.000Z')
        expect(view.acknowledgedAt).toBe('2026-10-12T12:00:00.000Z')
        expect(view.acknowledgedByUserId).toBe('user-1')
    })

    it('provider 日志列：合法记录解析 / 缺失与脏数据回退 null', () => {
        const record = {
            available: true,
            provider: 'vercel',
            tail: 'build failed',
            truncated: false,
            fetchedAt: '2026-11-23T00:00:00.000Z',
        }
        expect(toPRCheckView(makeRow({ providerLogsJson: JSON.stringify(record) })).providerLogs).toEqual(record)
        expect(toPRCheckView(makeRow({ providerLogsJson: null })).providerLogs).toBeNull()
        expect(toPRCheckView(makeRow({ providerLogsJson: '[]' })).providerLogs).toBeNull()
        expect(toPRCheckView(makeRow({ providerLogsJson: '{"available":true}' })).providerLogs).toBeNull()
        expect(parseProviderLogsColumn('not-json')).toBeNull()
    })
})
