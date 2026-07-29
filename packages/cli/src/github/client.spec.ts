import { describe, expect, it, afterEach } from 'vitest'
import nock from 'nock'
import { RequestError } from '@octokit/request-error'
import { AppError } from '@dependfix/core'
import { createGitHubClient } from './client'
import { mapGitHubError } from './errors'

const API_BASE = 'https://api.github.com'

describe('createGitHubClient', () => {
    afterEach(() => {
        nock.cleanAll()
    })

    it('returns repo info on successful GET', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(200, { id: 1, full_name: 'foo/bar', default_branch: 'main' })

        const octokit = createGitHubClient({ token: 'test-token' })
        const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

        expect(data.id).toBe(1)
        expect(data.full_name).toBe('foo/bar')
        expect(data.default_branch).toBe('main')
    })

    it('sends Authorization header with token', async () => {
        const scope = nock(API_BASE)
            .get('/repos/foo/bar')
            .matchHeader('authorization', /^token /)
            .reply(200, { id: 1, full_name: 'foo/bar' })

        const octokit = createGitHubClient({ token: 'test-token' })
        await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

        expect(scope.isDone()).toBe(true)
    })

    it('list Dependabot alerts with pagination', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query(true)
            .reply(200, [{ number: 1, state: 'open' }], {
                link: '<https://api.github.com/repos/foo/bar/dependabot/alerts?state=open&per_page=100&page=2>; rel="next"',
            })

        nock(API_BASE)
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: 100, page: 2 })
            .reply(200, [{ number: 2, state: 'open' }])

        const octokit = createGitHubClient({ token: 'test-token' })
        const alerts = await octokit.paginate(
            octokit.rest.dependabot.listAlertsForRepo,
            { owner: 'foo', repo: 'bar', state: 'open', per_page: 100 },
        )

        expect(alerts).toHaveLength(2)
        expect(alerts.map((a) => a.number)).toEqual([1, 2])
    })
})

describe('mapGitHubError', () => {
    function makeRequestError(
        status: number,
        headers: Record<string, string> = {},
    ): RequestError {
        return new RequestError(`HTTP ${status}`, status, {
            request: { method: 'GET', url: '/repos/foo/bar', headers: {} },
            response: { status, headers, data: {}, url: '/repos/foo/bar' },
        })
    }

    it('maps 401 to AUTHENTICATION_FAILED', () => {
        const error = makeRequestError(401)

        const appErr = mapGitHubError(error, 'fetch repo foo/bar')

        expect(appErr).toBeInstanceOf(AppError)
        expect(appErr.code).toBe('AUTHENTICATION_FAILED')
        expect(appErr.message).toContain('foo/bar')
        expect(appErr.message).toContain('HTTP 401')
    })

    it('maps 403 with rate limit to RATE_LIMITED', () => {
        const error = makeRequestError(403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1719000000',
        })

        const appErr = mapGitHubError(error, 'fetch alerts')

        expect(appErr.code).toBe('RATE_LIMITED')
        expect((appErr).details).toHaveProperty('rateLimitReset', '1719000000')
    })

    it('maps 403 without rate limit to PERMISSION_DENIED', () => {
        const error = makeRequestError(403)

        const appErr = mapGitHubError(error, 'fetch repo')

        expect(appErr.code).toBe('PERMISSION_DENIED')
    })

    it('maps 404 to REPO_NOT_FOUND', () => {
        const error = makeRequestError(404)

        const appErr = mapGitHubError(error, 'fetch repo foo/bar')

        expect(appErr.code).toBe('REPO_NOT_FOUND')
    })

    it('maps 422 to GITHUB_API_ERROR', () => {
        const error = makeRequestError(422)

        const appErr = mapGitHubError(error, 'validate request')

        expect(appErr.code).toBe('GITHUB_API_ERROR')
    })

    it('maps 500 to GITHUB_API_ERROR', () => {
        const error = makeRequestError(500)

        const appErr = mapGitHubError(error, 'fetch repo')

        expect(appErr.code).toBe('GITHUB_API_ERROR')
    })

    it('maps network error to NETWORK_ERROR', () => {
        const error = new TypeError('fetch failed')

        const appErr = mapGitHubError(error, 'fetch repo foo/bar')

        expect(appErr.code).toBe('NETWORK_ERROR')
        expect(appErr.message).toContain('fetch failed')
    })

    it('maps non-Error values to NETWORK_ERROR', () => {
        const error = 'something went wrong'

        const appErr = mapGitHubError(error, 'fetch repo')

        expect(appErr.code).toBe('NETWORK_ERROR')
        expect(appErr.message).toContain('unknown error')
    })
})
