import { describe, expect, it, afterEach } from 'vitest'
import nock from 'nock'
import { RequestError } from '@octokit/request-error'
import { AppError } from '@dependfix/core'
import { createGitHubClient, computeRetryDelayMs } from './client'
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

// ---------------------------------------------------------------------------
// Rate-limit retry policy（T402）：429 / 403 rate limit → 指数退避重试
// ---------------------------------------------------------------------------

describe('createGitHubClient rate-limit retry', () => {
    afterEach(() => {
        nock.cleanAll()
    })

    it('retries 429 with backoff and succeeds on retry', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(429, { message: 'You have exceeded a secondary rate limit' })
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(200, { id: 1, full_name: 'foo/bar' })

        const octokit = createGitHubClient({
            token: 'test-token',
            retry: { maxRetries: 3, baseDelayMs: 1 },
        })
        const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

        expect(data.id).toBe(1)
        expect(nock.pendingMocks()).toEqual([])
    })

    it('retries 403 primary rate limit (x-ratelimit-remaining: 0) and succeeds', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(403, { message: 'API rate limit exceeded' }, {
                'x-ratelimit-remaining': '0',
                'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 2),
            })
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(200, { id: 1, full_name: 'foo/bar' })

        const octokit = createGitHubClient({
            token: 'test-token',
            retry: { maxRetries: 3, baseDelayMs: 1 },
        })
        const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

        expect(data.id).toBe(1)
    })

    it('retries 403 secondary rate limit (abuse message) and succeeds', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(403, { message: 'You have been flagged for abuse detection' })
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(200, { id: 1, full_name: 'foo/bar' })

        const octokit = createGitHubClient({
            token: 'test-token',
            retry: { maxRetries: 3, baseDelayMs: 1 },
        })
        const { data } = await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })

        expect(data.id).toBe(1)
    })

    it('gives up after maxRetries and throws the original error', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .times(2)
            .reply(429, { message: 'Too Many Requests' })

        const octokit = createGitHubClient({
            token: 'test-token',
            retry: { maxRetries: 1, baseDelayMs: 1 },
        })

        try {
            await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })
            expect.fail('Expected request to throw after retries exhausted')
        } catch (error) {
            expect(error).toBeInstanceOf(RequestError)
            expect((error as RequestError).status).toBe(429)
        }
    })

    it('does not retry permission-denied 403 (no rate-limit signals)', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(403, { message: 'Resource not accessible by integration' })

        const octokit = createGitHubClient({
            token: 'test-token',
            retry: { maxRetries: 3, baseDelayMs: 1 },
        })

        try {
            await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })
            expect.fail('Expected permission-denied request to throw')
        } catch (error) {
            expect(error).toBeInstanceOf(RequestError)
            expect((error as RequestError).status).toBe(403)
        }
        expect(nock.pendingMocks()).toEqual([])
    })

    it('does not retry when maxRetries is 0', async () => {
        nock(API_BASE)
            .get('/repos/foo/bar')
            .reply(429, { message: 'Too Many Requests' })

        const octokit = createGitHubClient({
            token: 'test-token',
            retry: { maxRetries: 0 },
        })

        try {
            await octokit.rest.repos.get({ owner: 'foo', repo: 'bar' })
            expect.fail('Expected request to throw without retry')
        } catch (error) {
            expect((error as RequestError).status).toBe(429)
        }
        expect(nock.pendingMocks()).toEqual([])
    })
})

describe('computeRetryDelayMs', () => {
    function makeError(status: number, headers: Record<string, string> = {}, message = `HTTP ${status}`): RequestError {
        return new RequestError(message, status, {
            request: { method: 'GET', url: '/repos/foo/bar', headers: {} },
            response: { status, headers, data: {}, url: '/repos/foo/bar' },
        })
    }

    it('returns null for non-RequestError', () => {
        expect(computeRetryDelayMs(new Error('boom'), 0)).toBeNull()
    })

    it('returns null for 500', () => {
        expect(computeRetryDelayMs(makeError(500), 0)).toBeNull()
    })

    it('returns null for permission-denied 403', () => {
        expect(computeRetryDelayMs(makeError(403), 0)).toBeNull()
    })

    it('returns backoff for 429 without reset header', () => {
        expect(computeRetryDelayMs(makeError(429), 0, 1000)).toBe(1000)
        expect(computeRetryDelayMs(makeError(429), 2, 1000)).toBe(4000)
    })

    it('waits until reset + buffer when x-ratelimit-reset is present', () => {
        const reset = Math.floor(Date.now() / 1000) + 10
        const delay = computeRetryDelayMs(makeError(403, {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': String(reset),
        }), 0, 1000)

        expect(delay).not.toBeNull()
        expect(delay).toBeGreaterThan(9_000)
        expect(delay).toBeLessThanOrEqual(11_000)
    })

    it('caps backoff at 30s', () => {
        expect(computeRetryDelayMs(makeError(429), 10, 1000)).toBe(30_000)
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
