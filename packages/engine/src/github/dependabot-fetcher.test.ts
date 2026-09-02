import { describe, expect, it, afterEach } from 'vitest'
import nock from 'nock'
import { AppError } from '@dependfix/core'
import { fromPat } from '../auth'
import { createGitHubClient } from './client'
import { fetchDependabotAlerts } from './dependabot-fetcher'
import fixtureAlerts from './__fixtures__/dependabot-alerts.json'

const API_BASE = 'https://api.github.com'
const GET_ALERTS_PATH = '/repos/foo/bar/dependabot/alerts'

function setupClient(token = 'test-token', retry = { maxRetries: 0 }) {
    // 默认关闭限流重试：本文件聚焦错误映射语义；
    // 重试行为由 client.test.ts 的 rate-limit retry 专项覆盖
    return createGitHubClient({ auth: fromPat(token, { retry }) })
}

describe('fetchDependabotAlerts', () => {
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
            .reply(200, fixtureAlerts)

        const client = setupClient()
        const alerts = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts).toHaveLength(5)
        expect(alerts.every((a) => a.source === 'dependabot')).toBe(true)
        expect(alerts.every((a) => a.repository === 'foo/bar')).toBe(true)
    })

    it('correctly maps all fields from Dependabot API response', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [fixtureAlerts[0]]) // lodash critical+fixable

        const client = setupClient()
        const [alert] = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.id).toBe(1)
        expect(alert.source).toBe('dependabot')
        expect(alert.upstreamId).toBe('dependabot:1')
        expect(alert.repository).toBe('foo/bar')
        expect(alert.defaultBranch).toBe('')
        expect(alert.severity).toBe('critical')
        expect(alert.packageEcosystem).toBe('npm')
        expect(alert.packageName).toBe('lodash')
        expect(alert.manifestPath).toBe('package.json')
        expect(alert.ruleId).toBe('GHSA-xxxx-xxxx-xxxx')
        expect(alert.summary).toBe('Lodash command injection vulnerability')
        expect(alert.htmlUrl).toBe('https://github.com/foo/bar/security/dependabot/1')
        expect(alert.fixable).toBe(true)
        expect(alert.fixStrategy).toBe('upgrade')
        expect(alert.recommendedVersion).toBe('4.17.21')
        // M23.3 C66-A2：透传 GHSA + CVE 字段
        expect(alert.ghsaId).toBe('GHSA-xxxx-xxxx-xxxx')
        expect(alert.cveIds).toEqual(['CVE-2021-23337'])
    })

    it('sets fixable=true and fixStrategy=upgrade when first_patched_version exists', async () => {
        const fixableAlert = { ...fixtureAlerts[1] } // express, has patch

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [fixableAlert])

        const client = setupClient()
        const [alert] = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.fixable).toBe(true)
        expect(alert.fixStrategy).toBe('upgrade')
        expect(alert.recommendedVersion).toBe('4.19.1')
    })

    it('sets fixable=false and fixStrategy=null when first_patched_version is null', async () => {
        const nonFixableAlert = { ...fixtureAlerts[2] } // minimist, no patch

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [nonFixableAlert])

        const client = setupClient()
        const [alert] = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.fixable).toBe(false)
        expect(alert.fixStrategy).toBeNull()
        expect(alert.recommendedVersion).toBe('')
    })

    it('returns empty array for repo with no alerts', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [])

        const client = setupClient()
        const alerts = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts).toEqual([])
    })

    it('auto-paginates across multiple pages', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [fixtureAlerts[0]], {
                link: `<${API_BASE}${GET_ALERTS_PATH}?state=open&per_page=100&page=2>; rel="next"`,
            })

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query({ state: 'open', per_page: 100, page: 2 })
            .reply(200, [fixtureAlerts[1]])

        const client = setupClient()
        const alerts = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alerts).toHaveLength(2)
        expect(alerts[0].id).toBe(1)
        expect(alerts[1].id).toBe(2)
        expect(alerts[0].upstreamId).toBe('dependabot:1')
        expect(alerts[1].upstreamId).toBe('dependabot:2')
    })

    it('handles scoped package names correctly', async () => {
        const scopedAlert = { ...fixtureAlerts[4] } // @babel/traverse

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [scopedAlert])

        const client = setupClient()
        const [alert] = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.packageName).toBe('@babel/traverse')
        expect(alert.packageEcosystem).toBe('npm')
        expect(alert.severity).toBe('critical')
        expect(alert.fixable).toBe(true)
        expect(alert.recommendedVersion).toBe('7.23.2')
    })

    it('respects custom state parameter', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query({ state: 'fixed', per_page: 100 })
            .reply(200, [])

        const client = setupClient()
        const alerts = await fetchDependabotAlerts(client, {
            owner: 'foo',
            repo: 'bar',
            state: 'fixed',
        })

        expect(alerts).toEqual([])
    })

    // -----------------------------------------------------------------------
    // Missing optional fields
    // -----------------------------------------------------------------------

    it('falls back to unknown when dependency.package is missing', async () => {
        const missingPackage = {
            ...fixtureAlerts[0],
            dependency: { manifest_path: 'package.json' },
        }

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [missingPackage])

        const client = setupClient()
        const [alert] = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.packageName).toBe('unknown')
        expect(alert.packageEcosystem).toBe('unknown')
    })

    it('falls back to empty string when manifest_path is missing', async () => {
        const missingManifest = {
            ...fixtureAlerts[0],
            dependency: {
                package: { ecosystem: 'npm', name: 'lodash' },
            },
        }

        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(200, [missingManifest])

        const client = setupClient()
        const [alert] = await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })

        expect(alert.manifestPath).toBe('')
    })

    // -----------------------------------------------------------------------
    // Error scenarios
    // -----------------------------------------------------------------------

    it('throws AUTHENTICATION_FAILED on 401', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(401, { message: 'Bad credentials' })

        const client = setupClient()

        try {
            await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })
            expect.fail('Expected fetchDependabotAlerts to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('AUTHENTICATION_FAILED')
            expect((error as AppError).message).toContain('foo/bar')
        }
    })

    it('throws RATE_LIMITED on 403 with rate-limit headers', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(403, {}, {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': '1719000000',
            })

        const client = setupClient()

        try {
            await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })
            expect.fail('Expected fetchDependabotAlerts to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('RATE_LIMITED')
        }
    })

    it('throws PERMISSION_DENIED on 403 without rate-limit headers', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(403, { message: 'Resource not accessible by integration' })

        const client = setupClient()

        try {
            await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })
            expect.fail('Expected fetchDependabotAlerts to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('PERMISSION_DENIED')
        }
    })

    it('throws REPO_NOT_FOUND on 404', async () => {
        nock(API_BASE)
            .get(GET_ALERTS_PATH)
            .query(true)
            .reply(404, { message: 'Not Found' })

        const client = setupClient()

        try {
            await fetchDependabotAlerts(client, { owner: 'foo', repo: 'bar' })
            expect.fail('Expected fetchDependabotAlerts to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(AppError)
            expect((error as AppError).code).toBe('REPO_NOT_FOUND')
        }
    })
})
