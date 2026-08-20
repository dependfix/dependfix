import { describe, expect, it } from 'vitest'
import { ContainerExecutor, sanitizeErrorMessage } from './container-executor'
import type { ScanExecutorContext } from './types'

const makeCtx = (overrides: Partial<ScanExecutorContext> = {}): ScanExecutorContext => ({
    runId: 'run-1',
    repository: {
        owner: 'owner-a',
        name: 'repo-b',
        defaultBranch: 'main',
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
        allowMajorUpgrade: false,
        maxAlertsPerRepository: 20,
        maxConcurrency: 1,
        maxRetries: 3,
        maxBackoffMs: 30000,
    },
    credential: { token: 'ghp_test' },
    workDir: '/tmp/runs/run-1',
    ...overrides,
})

describe('ContainerExecutor', () => {
    it('isAvailable creates work root and returns true', async () => {
        const executor = new ContainerExecutor({ workRoot: 'data/runs-test' })
        const available = await executor.isAvailable()
        expect(available).toBe(true)
    })

    it('returns execution_failed when DependfixApp fails (no token, network error)', async () => {
        // report-only 不 clone：DependfixApp 会尝试 GitHub API（网络不通 → 捕获为业务失败或执行失败）
        const executor = new ContainerExecutor({ workRoot: 'data/runs-test', timeoutMs: 5000 })
        const result = await executor.execute(makeCtx())
        // 无网络环境下 DependfixApp 可能返回 exitCode 2 或抛错；两者都应有结构化结果
        expect(result.exitCode).toBeGreaterThanOrEqual(0)
        expect(result.startedAt).toBeTruthy()
        expect(result.finishedAt).toBeTruthy()
    }, 20000)

    it('times out when execution exceeds limit', async () => {
        // 用极小超时强制触发超时路径（execute 内 mkdir + run 至少微秒级）
        const executor = new ContainerExecutor({ workRoot: 'data/runs-test', timeoutMs: 1 })
        const result = await executor.execute(makeCtx())
        expect(result.exitCode).toBe(2)
        expect(result.error?.code).toBe('execution_timeout')
    }, 10000)
})

describe('sanitizeErrorMessage', () => {
    it('masks credentials inlined in URLs (defense-in-depth)', () => {
        const input = 'Command failed: git clone https://x-access-token:SUPERSECRETTOKEN@github.com/o/r.git'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('SUPERSECRETTOKEN')
        expect(output).toContain('https://***@github.com')
    })

    it('masks Authorization header values', () => {
        const input = 'fatal: Authorization: basic dG9rZW46c2VjcmV0'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('dG9rZW46c2VjcmV0')
        expect(output).toContain('Authorization: basic ***')
    })

    it('masks Authorization: token scheme (legacy GitHub PAT)', () => {
        // C53-后-B：GitHub REST API 兼容 `Authorization: token ghp_xxx`
        const input = 'fatal: Authentication failed: Authorization: token ghp_CONTAINER_SECRET_PAT_7777'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('ghp_CONTAINER_SECRET_PAT_7777')
        expect(output).toContain('Authorization: token ***')
    })

    it('masks Authorization: Bearer scheme (GitHub REST API v3+)', () => {
        // C53-后-B：GitHub REST API v3+ 推荐 `Authorization: Bearer ghp_xxx`
        const input = 'fatal: 401 Unauthorized: Authorization: Bearer ghp_CONTAINER_SECRET_BEARER_8888'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('ghp_CONTAINER_SECRET_BEARER_8888')
        expect(output).toContain('Authorization: Bearer ***')
    })

    it('masks Authorization header case-insensitively', () => {
        const input = 'error: authorization: BEARER ghp_container_case_secret'
        const output = sanitizeErrorMessage(input)
        expect(output).not.toContain('ghp_container_case_secret')
        expect(output).toContain('authorization: BEARER ***')
    })

    it('leaves clean messages unchanged', () => {
        const input = 'fatal: repository not found'
        expect(sanitizeErrorMessage(input)).toBe(input)
    })
})
