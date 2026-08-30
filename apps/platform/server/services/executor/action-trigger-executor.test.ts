import { afterEach, describe, expect, it } from 'vitest'
import nock from 'nock'
import { ActionTriggerExecutor } from './action-trigger-executor'
import type { ScanExecutorContext } from './types'

const API = 'https://api.github.com'

const makeCtx = (overrides: Partial<ScanExecutorContext> = {}): ScanExecutorContext => ({
    runId: 'run-1',
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
        actionWorkflowFile: '.github/workflows/security-auto-fix.yml',
    },
    config: {
        mode: 'report-only',
        severityThreshold: 'high',
        repositories: ['owner-a/repo-b'],
        dryRun: false,
        createPullRequest: false,
        commit: false,
        cleanupBranches: false,
        cleanupBranchesAuto: false,
        githubToken: 'ghp_test',
        alertSource: 'github-dependabot',
        codeScanningEnabled: false,
        codeQualityEnabled: false,
        allowMajorUpgrade: false,
        maxAlertsPerRepository: 20,
        maxConcurrency: 1,
        maxRetries: 3,
        maxBackoffMs: 30000,
        maxRepos: 100,
    },
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-1',
    ...overrides,
})

afterEach(() => {
    nock.cleanAll()
})

describe('ActionTriggerExecutor', () => {
    it('triggers workflow_dispatch and resolves run URL', async () => {
        nock(API)
            .get(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*security-auto-fix\.yml$/)
            .reply(200, { id: 1, path: '.github/workflows/security-auto-fix.yml' })
        nock(API)
            .post(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*dispatches$/, (body) => {
                expect(body.ref).toBe('main')
                expect(body.inputs?.mode).toBe('report-only')
                expect(body.inputs?.['severity-threshold']).toBe('high')
                expect(body.inputs?.repos).toBe('owner-a/repo-b')
                return true
            })
            .reply(204)
        nock(API)
            .get(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*\/runs/)
            .query({ event: 'workflow_dispatch', per_page: 5 })
            .reply(200, {
                workflow_runs: [
                    { id: 101, created_at: new Date(Date.now() + 10000).toISOString(), html_url: 'https://github.com/owner-a/repo-b/actions/runs/101' },
                ],
            })

        const executor = new ActionTriggerExecutor('ghp_test', { pollDelayMs: 0, pollAttempts: 1 })
        const result = await executor.execute(makeCtx())

        expect(result.exitCode).toBe(0)
        expect(result.error).toBeUndefined()
        expect(result.result?.summary).toBeDefined()
    })

    it('fails when workflow file is not configured', async () => {
        const executor = new ActionTriggerExecutor('ghp_test')
        const result = await executor.execute(makeCtx({
            repository: { owner: 'o', name: 'r', defaultBranch: 'main' },
        }))

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('workflow_not_configured')
    })

    it('fails when workflow file does not exist (404)', async () => {
        nock(API)
            .get(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*security-auto-fix\.yml$/)
            .reply(404, { message: 'Not Found' })

        const executor = new ActionTriggerExecutor('ghp_test')
        const result = await executor.execute(makeCtx())

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('workflow_not_found')
    })

    it('maps 403 to trigger_forbidden', async () => {
        nock(API)
            .get(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*security-auto-fix\.yml$/)
            .reply(200, { id: 1 })
        nock(API)
            .post(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*dispatches$/)
            .reply(403, { message: 'Resource not accessible by integration' })

        const executor = new ActionTriggerExecutor('ghp_test')
        const result = await executor.execute(makeCtx())

        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('trigger_forbidden')
    })

    it('returns run_url_not_resolved when polling finds no run', async () => {
        nock(API)
            .get(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*security-auto-fix\.yml$/)
            .reply(200, { id: 1 })
        nock(API)
            .post(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*dispatches$/)
            .reply(204)
        nock(API)
            .get(/\/repos\/owner-a\/repo-b\/actions\/workflows\/.*\/runs/)
            .query({ event: 'workflow_dispatch', per_page: 5 })
            .times(1)
            .reply(200, { workflow_runs: [] })

        const executor = new ActionTriggerExecutor('ghp_test', { pollDelayMs: 0, pollAttempts: 1 })
        const result = await executor.execute(makeCtx())

        expect(result.exitCode).toBe(0)
        expect(result.error?.code).toBe('run_url_not_resolved')
    })
})
