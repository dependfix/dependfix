import { describe, expect, it, afterEach } from 'vitest'
import nock from 'nock'
import { AppError } from '@dependfix/core'
import { fromPat } from '../auth'
import { createGitHubClient } from './client'
import { fetchCodeScanningAlerts } from './code-scanning-fetcher'

const API_BASE = 'https://api.github.com'
const GET_ALERTS_PATH = '/repos/foo/bar/code-scanning/alerts'

function setupClient(token = 'test-token') {
    return createGitHubClient({ auth: fromPat(token) })
}

function makeRawAlert(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        number: 1,
        created_at: '2026-01-01T00:00:00Z',
        state: 'open',
        html_url: 'https://github.com/foo/bar/security/code-scanning/1',
        rule: {
            id: 'js/unknown-rule',
            severity: 'error',
            security_severity_level: 'high',
            name: 'SQL injection',
            description: 'SQL injection',
            tags: ['security'],
        },
        most_recent_instance: {
            ref: 'refs/heads/main',
            location: { path: 'src/db.ts', start_line: 42, end_line: 42 },
            message: { text: 'This query depends on a user-provided value.' },
        },
        ...overrides,
    }
}

describe('fetchCodeScanningAlerts', () => {
    afterEach(() => {
        nock.cleanAll()
    })

    // -----------------------------------------------------------------------
    // Happy Path
    // -----------------------------------------------------------------------

    it('returns normalized alerts for a repo with open alerts', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, [makeRawAlert(), makeRawAlert({ number: 2 })])

        const client = setupClient()
        const alerts = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts).toHaveLength(2)
        expect(alerts.every((a) => a.source === 'code-scanning')).toBe(true)
        expect(alerts.every((a) => a.repository === 'foo/bar')).toBe(true)
    })

    it('correctly maps all fields from Code Scanning API response', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [makeRawAlert()])

        const client = setupClient()
        const [alert] = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.id).toBe(1)
        expect(alert.source).toBe('code-scanning')
        expect(alert.repository).toBe('foo/bar')
        expect(alert.defaultBranch).toBe('')
        expect(alert.severity).toBe('high')
        expect(alert.packageEcosystem).toBe('code-scanning')
        expect(alert.packageName).toBe('SQL injection')
        expect(alert.manifestPath).toBe('src/db.ts')
        expect(alert.ruleId).toBe('js/unknown-rule')
        expect(alert.summary).toBe('This query depends on a user-provided value.')
        expect(alert.htmlUrl).toBe('https://github.com/foo/bar/security/code-scanning/1')
        expect(alert.recommendedVersion).toBe('')
        expect(alert.alertClass).toBe('report-only') // js/unknown-rule 不在白名单/建议列表 → C 类
    })

    it('classifies rule ids into A/B/C alert classes', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [
                // B 类建议：js/sql-injection
                makeRawAlert({ rule: { id: 'js/sql-injection', severity: 'error', security_severity_level: 'high', name: 'SQL injection' } }),
                // A 类白名单：eol-last（纯格式）
                makeRawAlert({ number: 5, rule: { id: 'eol-last', severity: 'warning', security_severity_level: null, name: 'End of line' } }),
            ])

        const client = setupClient()
        const alerts = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts[0].alertClass).toBe('suggested')
        expect(alerts[1].alertClass).toBe('auto-fixable')
    })

    it('uses security_severity_level with priority over rule.severity', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [
                // security_severity_level 与 rule.severity 不一致时，前者优先
                makeRawAlert({ rule: { id: 'js/unknown-rule', severity: 'error', security_severity_level: 'critical', name: 'SQL injection' } }),
            ])

        const client = setupClient()
        const [alert] = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.severity).toBe('critical')
    })

    it('falls back to rule.severity mapping when security_severity_level is absent', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [
                makeRawAlert({ rule: { id: 'js-no-unused', severity: 'warning', security_severity_level: null, name: 'Unused variable' } }),
                makeRawAlert({ number: 3, rule: { id: 'js-note', severity: 'note', security_severity_level: null, name: 'Style note' } }),
            ])

        const client = setupClient()
        const alerts = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts[0].severity).toBe('medium') // warning → medium
        expect(alerts[1].severity).toBe('low') // note → low
    })

    it('maps unknown severity when both levels are absent or none', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [
                makeRawAlert({ rule: { id: 'js-x', severity: 'none', security_severity_level: null, name: 'None severity' } }),
                makeRawAlert({ number: 4, rule: { id: 'js-y', severity: null, security_severity_level: null, name: 'No severity' } }),
            ])

        const client = setupClient()
        const alerts = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts[0].severity).toBe('unknown')
        expect(alerts[1].severity).toBe('unknown')
    })

    it('defaults to non-fixable semantics (fixable=false, fixStrategy=null)', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [makeRawAlert()])

        const client = setupClient()
        const [alert] = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.fixable).toBe(false)
        expect(alert.fixStrategy).toBe(null)
    })

    it('uses rule name for packageName and rule id for ruleId', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [
                makeRawAlert({
                    rule: { id: 'js/sql-injection', severity: 'error', name: 'SQL injection' },
                    most_recent_instance: { location: { path: 'src/db.ts', start_line: 7, end_line: 9 }, message: { text: 'X' } },
                }),
            ])

        const client = setupClient()
        const [alert] = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.packageName).toBe('SQL injection')
        expect(alert.ruleId).toBe('js/sql-injection')
        expect(alert.manifestPath).toBe('src/db.ts')
    })

    it('fills start/end line and suggestion for suggestion output', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [
                makeRawAlert({
                    rule: { id: 'js/sql-injection', severity: 'error', security_severity_level: 'high', name: 'SQL injection' },
                    most_recent_instance: {
                        location: { path: 'src/db.ts', start_line: 42, end_line: 46 },
                        message: { text: 'This query depends on a user-provided value.' },
                    },
                }),
            ])

        const client = setupClient()
        const [alert] = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.startLine).toBe(42)
        expect(alert.endLine).toBe(46)
        expect(alert.suggestion).toContain('参数化查询')
    })

    it('returns empty array for a repo with no alerts', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [])

        const client = setupClient()
        const alerts = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts).toHaveLength(0)
    })

    // -----------------------------------------------------------------------
    // Pagination
    // -----------------------------------------------------------------------

    it('paginates through multiple pages', async () => {
        const page1 = [makeRawAlert({ number: 1 }), makeRawAlert({ number: 2 })]
        const page2 = [makeRawAlert({ number: 3 })]

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query({ state: 'open', per_page: 100 })
            .reply(200, page1, {
                Link: '<https://api.github.com/repos/foo/bar/code-scanning/alerts?state=open&per_page=100&page=2>; rel="next", <https://api.github.com/repos/foo/bar/code-scanning/alerts?state=open&per_page=100&page=2>; rel="last"',
            })
            .get(GET_ALERTS_PATH)
            .query({ state: 'open', per_page: 100, page: 2 })
            .reply(200, page2)

        const client = setupClient()
        const alerts = await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts).toHaveLength(3)
        expect(alerts.map((a) => a.id)).toEqual([1, 2, 3])
    })

    // -----------------------------------------------------------------------
    // Error handling
    // -----------------------------------------------------------------------

    it('maps 401 to AUTHENTICATION_FAILED AppError', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(401, { message: 'Bad credentials' })

        const client = setupClient()
        await expect(fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' }))
            .rejects.toMatchObject({ code: 'AUTHENTICATION_FAILED' })
    })

    it('maps 403 to PERMISSION_DENIED AppError', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const client = setupClient()
        try {
            await fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' })
            expect.fail('Expected fetchCodeScanningAlerts to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('PERMISSION_DENIED')
            expect((error as AppError).message).toContain('fetch code scanning alerts for foo/bar')
        }
    })

    it('maps 404 to REPO_NOT_FOUND AppError', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(404, { message: 'Not Found' })

        const client = setupClient()
        await expect(fetchCodeScanningAlerts(client, { owner: 'foo', repo: 'bar' }))
            .rejects.toMatchObject({ code: 'REPO_NOT_FOUND' })
    })
})

