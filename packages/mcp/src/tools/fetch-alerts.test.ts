import { afterEach, describe, expect, it } from 'vitest'
import nock from 'nock'
import { fetchAlerts } from './fetch-alerts'

const API = 'https://api.github.com'

const rawDependabotAlert = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    number: 42,
    state: 'open',
    security_advisory: {
        severity: 'high',
        summary: 'Prototype Pollution in lodash',
        ghsa_id: 'GHSA-xxxx',
    },
    dependency: {
        package: { name: 'lodash', ecosystem: 'npm' },
        manifest_path: 'package-lock.json',
        relationship: 'direct',
    },
    security_vulnerability: {
        vulnerable_version_range: '< 4.17.21',
        first_patched_version: { identifier: '4.17.21' },
    },
    html_url: 'https://github.com/o/r/security/dependabot/42',
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
})

afterEach(() => {
    nock.cleanAll()
    delete process.env.GITHUB_TOKEN
})

describe('fetchAlerts (一致性：与 CLI fetchDependabotAlerts 同源)', () => {
    it('returns normalized alerts matching CLI field shape', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        nock(API)
            .get('/repos/owner-a/repo-b/dependabot/alerts')
            .query(true)
            .reply(200, [rawDependabotAlert()])

        const result = await fetchAlerts({ repo: 'owner-a/repo-b', severity: 'high' })

        expect(result.ok).toBe(true)
        const alerts = (result as { alerts: Array<Record<string, unknown>> }).alerts
        expect(alerts).toHaveLength(1)
        const alert = alerts[0]
        // 字段与 cli fetchDependabotAlerts 输出对齐（source/repository/severity/packageName/recommendedVersion/fixable）
        expect(alert).toMatchObject({
            id: 42,
            severity: 'high',
            packageName: 'lodash',
            recommendedVersion: '4.17.21',
            fixable: true,
            htmlUrl: 'https://github.com/o/r/security/dependabot/42',
        })
    })

    it('filters by severity threshold (high keeps critical + high, aligned with CLI)', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        nock(API)
            .get('/repos/owner-a/repo-b/dependabot/alerts')
            .query(true)
            .reply(200, [
                rawDependabotAlert({ number: 1, security_advisory: { severity: 'critical', summary: 'x', ghsa_id: 'GHSA-1' } }),
                rawDependabotAlert({ number: 2 }),
            ])

        const result = await fetchAlerts({ repo: 'owner-a/repo-b', severity: 'high' })

        const alerts = (result as { alerts: Array<{ id: number }> }).alerts
        // 阈值语义：high 保留 critical + high（与 CLI filterAlerts 一致），保持原顺序
        expect(alerts.map((a) => a.id)).toEqual([1, 2])
    })

    it('filters by severity threshold (critical keeps only critical)', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        nock(API)
            .get('/repos/owner-a/repo-b/dependabot/alerts')
            .query(true)
            .reply(200, [
                rawDependabotAlert({ number: 1, security_advisory: { severity: 'critical', summary: 'x', ghsa_id: 'GHSA-1' } }),
                rawDependabotAlert({ number: 2 }),
            ])

        const result = await fetchAlerts({ repo: 'owner-a/repo-b', severity: 'critical' })

        const alerts = (result as { alerts: Array<{ id: number }> }).alerts
        expect(alerts.map((a) => a.id)).toEqual([1])
    })

    it('keeps all severities in original order when severity is all', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        nock(API)
            .get('/repos/owner-a/repo-b/dependabot/alerts')
            .query(true)
            .reply(200, [
                rawDependabotAlert({ number: 1, security_advisory: { severity: 'critical', summary: 'x', ghsa_id: 'GHSA-1' } }),
                rawDependabotAlert({ number: 2 }),
                rawDependabotAlert({ number: 3, security_advisory: { severity: 'medium', summary: 'y', ghsa_id: 'GHSA-3' } }),
            ])

        const result = await fetchAlerts({ repo: 'owner-a/repo-b', severity: 'all' })

        const alerts = (result as { alerts: Array<{ id: number }> }).alerts
        expect(alerts.map((a) => a.id)).toEqual([1, 2, 3])
    })

    it('returns error when GITHUB_TOKEN is not set', async () => {
        const result = await fetchAlerts({ repo: 'owner-a/repo-b', severity: 'high' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('GITHUB_TOKEN')
    })

    it('returns error for malformed repo', async () => {
        process.env.GITHUB_TOKEN = 'ghp_test'
        const result = await fetchAlerts({ repo: 'invalid', severity: 'high' })
        expect(result.ok).toBe(false)
        expect((result as { error: string }).error).toContain('owner/repo')
    })
})
