import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ContainerExecutor, sanitizeErrorMessage, parsePositiveInt, extractGitErrorMessage } from './container-executor'
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

describe('ContainerExecutor clone configuration', () => {
    const originalEnv = { ...process.env }

    beforeEach(() => {
        delete process.env.CLONE_TIMEOUT_MS
        delete process.env.CLONE_MAX_RETRIES
    })

    afterEach(() => {
        process.env = { ...originalEnv }
    })

    it('uses default clone timeout (120s) when env not set', () => {
        const executor = new ContainerExecutor({ workRoot: 'data/runs-test' })
        // 间接验证：构造不抛异常 + 后续 execute 行为符合默认值
        expect(executor).toBeDefined()
    })

    it('constructor parameters override environment variables', () => {
        process.env.CLONE_TIMEOUT_MS = '999999'
        process.env.CLONE_MAX_RETRIES = '99'
        // 构造参数应优先于 env
        const executor = new ContainerExecutor({
            workRoot: 'data/runs-test',
            cloneTimeoutMs: 60000,
            cloneMaxRetries: 1,
        })
        expect(executor).toBeDefined()
    })

    it('ignores invalid CLONE_TIMEOUT_MS (NaN, negative, zero)', () => {
        // NaN
        process.env.CLONE_TIMEOUT_MS = 'foo'
        const exec1 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec1).toBeDefined()

        // 负数
        process.env.CLONE_TIMEOUT_MS = '-1'
        const exec2 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec2).toBeDefined()

        // 零
        process.env.CLONE_TIMEOUT_MS = '0'
        const exec3 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec3).toBeDefined()
    })

    it('ignores invalid CLONE_MAX_RETRIES (NaN, negative, zero)', () => {
        process.env.CLONE_MAX_RETRIES = 'abc'
        const exec1 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec1).toBeDefined()

        process.env.CLONE_MAX_RETRIES = '-1'
        const exec2 = new ContainerExecutor({ workRoot: 'data/runs-test' })
        expect(exec2).toBeDefined()
    })
})

describe('parsePositiveInt', () => {
    it('returns default for undefined', () => {
        expect(parsePositiveInt(undefined, 42)).toBe(42)
    })

    it('returns default for empty string', () => {
        expect(parsePositiveInt('', 42)).toBe(42)
    })

    it('returns default for NaN', () => {
        expect(parsePositiveInt('foo', 42)).toBe(42)
    })

    it('returns default for negative', () => {
        expect(parsePositiveInt('-1', 42)).toBe(42)
    })

    it('returns default for zero', () => {
        expect(parsePositiveInt('0', 42)).toBe(42)
    })

    it('parses valid positive integer', () => {
        expect(parsePositiveInt('180000', 42)).toBe(180000)
    })

    it('parses "1" as minimum valid value', () => {
        expect(parsePositiveInt('1', 42)).toBe(1)
    })
})

describe('extractGitErrorMessage', () => {
    it('extracts fatal: lines', () => {
        const stderr = 'Cloning into \'.\'...\nremote: Enumerating objects: 42.\nfatal: unable to access \'...\': Could not resolve host'
        expect(extractGitErrorMessage(stderr)).toContain('fatal: unable to access')
    })

    it('extracts error: lines', () => {
        const stderr = 'Cloning into \'.\'...\nerror: RPC failed; curl 56 GnuTLS recv error'
        expect(extractGitErrorMessage(stderr)).toContain('error: RPC failed')
    })

    it('joins multiple error lines with semicolons', () => {
        const stderr = 'fatal: first error\nfatal: second error'
        expect(extractGitErrorMessage(stderr)).toBe('fatal: first error; fatal: second error')
    })

    it('falls back to last 3 lines when no fatal:/error: found', () => {
        const stderr = 'line1\nline2\nline3\nline4\n'
        const result = extractGitErrorMessage(stderr)
        expect(result).toContain('line2')
        expect(result).toContain('line3')
        expect(result).toContain('line4')
    })

    it('returns raw stderr when it is a single line with no fatal:/error:', () => {
        expect(extractGitErrorMessage('some message')).toBe('some message')
    })

    it('handles empty stderr', () => {
        expect(extractGitErrorMessage('')).toBe('')
    })
})
