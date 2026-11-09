import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { computeAttemptKey, formatAttemptMarker } from '../github/fix-fingerprint'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// 同告警尝试上限集成测试（fix-and-pr 模式）：
// mock 掉真实升级 / 验证 / PR 创建，保留真实 repo-fix 编排与尝试索引读取，验证：
// - 首次尝试：PR body 写入尝试标记（n=1）
// - 第 3 次尝试（历史 2 个关闭 PR）：不执行升级、不建 PR，跳过计数与记录落报告
// - --retry-failed：忽略命中并标注人工强制
// ---------------------------------------------------------------------------

const {
    mockRunVerification,
    mockUpgradeDependency,
    mockTryLockfileRepair,
    mockCreatePullRequest,
    mockPushBranch,
    mockFindDependfixOpenPR,
} = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockUpgradeDependency: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
    mockCreatePullRequest: vi.fn(),
    mockPushBranch: vi.fn(),
    mockFindDependfixOpenPR: vi.fn(),
}))

vi.mock('../runners/verification-runner', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../runners/verification-runner')>()
    return { ...actual, runVerification: mockRunVerification }
})

vi.mock('../fixers/dependency', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../fixers/dependency')>()
    return { ...actual, upgradeDependency: mockUpgradeDependency }
})

vi.mock('./helpers', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./helpers')>()
    return { ...actual, tryLockfileRepair: mockTryLockfileRepair }
})

vi.mock('../github/pr-creator', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../github/pr-creator')>()
    return {
        ...actual,
        createPullRequest: mockCreatePullRequest,
        pushBranch: mockPushBranch,
        findDependfixOpenPR: mockFindDependfixOpenPR,
    }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ATTEMPT_KEY = computeAttemptKey({
    source: 'dependabot',
    packageName: 'esbuild',
    targetVersion: '0.25.12',
    planStrategy: 'direct-upgrade',
})

function esbuildAlert(): Record<string, unknown> {
    return {
        number: 1,
        state: 'open',
        dependency: {
            package: { ecosystem: 'npm', name: 'esbuild' },
            manifest_path: 'package.json',
            scope: 'runtime',
            relationship: 'direct',
        },
        security_advisory: {
            ghsa_id: 'GHSA-1234',
            cve_id: null,
            summary: 'esbuild vulnerability',
            description: 'test',
            severity: 'high',
            vulnerabilities: [{
                package: { ecosystem: 'npm', name: 'esbuild' },
                severity: 'high',
                vulnerable_version_range: '< 0.25.12',
                first_patched_version: { identifier: '0.25.12' },
            }],
            cvss: { score: 7.5, vector_string: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N' },
            cwes: [{ cwe_id: 'CWE-79', name: 'test' }],
            identifiers: [{ type: 'GHSA', value: 'GHSA-1234' }],
            references: [{ url: 'https://github.com/advisories/test' }],
            published_at: '2021-01-01T00:00:00Z',
            updated_at: '2021-01-01T00:00:00Z',
            withdrawn_at: null,
        },
        security_vulnerability: {
            package: { ecosystem: 'npm', name: 'esbuild' },
            severity: 'high',
            vulnerable_version_range: '< 0.25.12',
            first_patched_version: { identifier: '0.25.12' },
        },
        vulnerability_manifest_path: 'package.json',
        created_at: '2021-01-01T00:00:00Z',
        updated_at: '2021-01-01T00:00:00Z',
        html_url: 'https://github.com/foo/bar/security/dependabot/1',
    }
}

function closedAttemptPR(number: number, n: number): Record<string, unknown> {
    return {
        number,
        html_url: `https://github.com/foo/bar/pull/${number}`,
        state: 'closed',
        merged_at: null,
        head: { ref: `dependfix/auto-fix-deadbee${number % 10}` },
        body: `${formatAttemptMarker({ key: ATTEMPT_KEY, n })}\n\n## 🔒 Dependfix Auto Fix`,
    }
}

describe('DependfixApp fix-and-pr repeated failure attempts', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-attempt-app-'))
        execSync('git init -q', { cwd: workDir })
        execSync('git config user.name test', { cwd: workDir })
        execSync('git config user.email test@test', { cwd: workDir })
        writeFileSync(join(workDir, 'package.json'), JSON.stringify({
            name: 'fixture',
            version: '1.0.0',
            dependencies: { esbuild: '^0.24.0' },
            scripts: { lint: 'exit 0' },
        }))
        writeFileSync(join(workDir, '.gitignore'), 'node_modules\n')
        writeFileSync(join(workDir, 'pnpm-lock.yaml'), 'lockfileVersion: "9.0"\n')
        execSync('git add . && git commit -qm init', { cwd: workDir })

        mockRunVerification.mockReset().mockResolvedValue({
            success: true,
            commandResults: [{ command: 'pnpm lint', exitCode: 0, durationMs: 0, stdout: '', stderr: '' }],
        })
        mockUpgradeDependency.mockReset().mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'pnpm-lock.yaml'), `lockfileVersion: "9.0"\n# upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        mockTryLockfileRepair.mockReset().mockReturnValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        })
        mockCreatePullRequest.mockReset().mockResolvedValue({ number: 1, htmlUrl: 'https://github.com/foo/bar/pull/1' })
        mockPushBranch.mockReset()
        mockFindDependfixOpenPR.mockReset().mockResolvedValue([])
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function nockRepository(closedPRs: Record<string, unknown>[]): void {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [esbuildAlert()])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })
        nock('https://api.github.com')
            .get('/repos/foo/bar/pulls')
            .query({ state: 'closed', sort: 'updated', direction: 'desc', per_page: '50' })
            .reply(200, closedPRs)
    }

    function runFixAndPr(env: Record<string, string> = {}): Promise<Awaited<ReturnType<DependfixApp['run']>>> {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
                ...env,
            },
            cliOverrides: { commands: ['pnpm lint'] },
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports'), commands: ['pnpm lint'] })
        return app.run()
    }

    it('首次尝试：正常修复，PR body 写入 n=1 尝试标记', async () => {
        nockRepository([])

        const { exitCode, result } = await runFixAndPr()

        expect(exitCode).toBe(0)
        expect(mockUpgradeDependency).toHaveBeenCalledTimes(1)
        expect(mockCreatePullRequest).toHaveBeenCalledTimes(1)
        const prBody = mockCreatePullRequest.mock.calls[0][0].body as string
        expect(prBody.startsWith(`<!-- dependfix:attempt key=${ATTEMPT_KEY} n=1 failed=? -->`)).toBe(true)
        expect(result.attemptTracking).toEqual([{
            repository: 'foo/bar',
            packageName: 'esbuild',
            key: ATTEMPT_KEY,
            attempt: 1,
            status: 'attempt',
        }])
        expect(result.summary.alertsSkippedByReason).toEqual({})
    }, 30_000)

    it('第 3 次尝试：不执行升级、不建 PR，跳过计入 repeated-failure', async () => {
        nockRepository([closedAttemptPR(11, 1), closedAttemptPR(12, 2)])

        const { exitCode, result } = await runFixAndPr()

        expect(exitCode).toBe(0)
        expect(mockUpgradeDependency).not.toHaveBeenCalled()
        expect(mockCreatePullRequest).not.toHaveBeenCalled()
        // 全部告警被跳过 ⇒ 无写操作：跳过基线采样、lockfile repair 与后验证
        expect(mockRunVerification).not.toHaveBeenCalled()
        expect(mockTryLockfileRepair).not.toHaveBeenCalled()
        expect(result.repositories[0]?.verificationSkipped).toBe('no-write')
        expect(result.summary.alertsSkipped).toBe(1)
        expect(result.summary.alertsSkippedByReason).toEqual({ 'repeated-failure': 1 })
        expect(result.summary.alertsFailed).toBe(0)
        expect(result.actions.filter((action) => action.type === 'dependency-upgrade' && !action.noOp)).toEqual([])
        expect(result.actions).toContainEqual(expect.objectContaining({
            type: 'dependency-upgrade',
            target: 'esbuild',
            noOp: true,
            strategy: 'repeated-failure',
        }))
        expect(result.attemptTracking?.[0]).toMatchObject({ attempt: 3, status: 'skipped' })
    }, 30_000)

    it('--retry-failed：忽略命中并标注人工强制（标记 n=3）', async () => {
        nockRepository([closedAttemptPR(11, 1), closedAttemptPR(12, 2)])

        const { exitCode, result } = await runFixAndPr({ DEPENDFIX_RETRY_FAILED: 'true' })

        expect(exitCode).toBe(0)
        expect(mockUpgradeDependency).toHaveBeenCalledTimes(1)
        expect(mockCreatePullRequest).toHaveBeenCalledTimes(1)
        const prBody = mockCreatePullRequest.mock.calls[0][0].body as string
        expect(prBody).toContain(`<!-- dependfix:attempt key=${ATTEMPT_KEY} n=3 failed=? -->`)
        expect(result.attemptTracking?.[0]).toMatchObject({ attempt: 3, status: 'forced' })
        expect(result.summary.alertsSkipped).toBe(0)
    }, 30_000)
})
