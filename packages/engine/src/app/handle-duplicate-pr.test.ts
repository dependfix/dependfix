import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// M19.3 B1：重复 PR 评论 + label 集成测试
// 验证 handleDuplicatePRs 在 PR 创建流程中的集成行为：
// - 正常路径：supersedePRs 非空 → comment + addLabels 均被调用
// - 失败路径：comment 或 label 失败 → warn 不阻断主流程
// - 空路径：supersedePRs 为空 → 短路，零 API 调用
// ---------------------------------------------------------------------------

const {
    mockRunVerification,
    mockUpgradeDependency,
    mockTryLockfileRepair,
    mockCreatePullRequest,
    mockPushBranch,
    mockFindDependfixOpenPR,
    mockCommentOnPullRequest,
    mockAddLabelToPullRequest,
    mockClosePullRequest,
    mockDeleteRemoteBranch,
} = vi.hoisted(() => ({
    mockRunVerification: vi.fn(),
    mockUpgradeDependency: vi.fn(),
    mockTryLockfileRepair: vi.fn(),
    mockCreatePullRequest: vi.fn(),
    mockPushBranch: vi.fn(),
    mockFindDependfixOpenPR: vi.fn(),
    mockCommentOnPullRequest: vi.fn(),
    mockAddLabelToPullRequest: vi.fn(),
    mockClosePullRequest: vi.fn(),
    mockDeleteRemoteBranch: vi.fn(),
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
        commentOnPullRequest: mockCommentOnPullRequest,
        addLabelToPullRequest: mockAddLabelToPullRequest,
        closePullRequest: mockClosePullRequest,
        deleteRemoteBranch: mockDeleteRemoteBranch,
    }
})

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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

function verificationOk(): ReturnType<typeof mockRunVerification> extends Promise<infer R> ? R : never {
    return {
        success: true,
        commandResults: [{
            command: 'pnpm lint',
            exitCode: 0,
            durationMs: 0,
            stdout: '',
            stderr: '',
        }],
    }
}

describe('DependfixApp handleDuplicatePRs (M19.3 B1)', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-dup-pr-'))
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
        // 已跟踪的占位文件：升级 mock 修改它以制造 tracked 改动（hasGitChanges 只认 tracked）
        writeFileSync(join(workDir, 'upgraded.txt'), 'v0\n')
        execSync('git add . && git commit -qm init', { cwd: workDir })

        mockRunVerification.mockReset().mockResolvedValue(verificationOk())
        mockUpgradeDependency.mockReset()
        mockTryLockfileRepair.mockReset().mockReturnValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            durationMs: 0,
        })
        mockCreatePullRequest.mockReset().mockResolvedValue({ number: 100, htmlUrl: 'https://github.com/foo/bar/pull/100' })
        mockPushBranch.mockReset()
        mockFindDependfixOpenPR.mockReset().mockResolvedValue([])
        mockCommentOnPullRequest.mockReset().mockResolvedValue(undefined)
        mockAddLabelToPullRequest.mockReset().mockResolvedValue(undefined)
        mockClosePullRequest.mockReset().mockResolvedValue(undefined)
        mockDeleteRemoteBranch.mockReset().mockResolvedValue(undefined)
    })

    afterEach(() => {
        nock.cleanAll()
        rmSync(workDir, { recursive: true, force: true })
    })

    function nockAlerts(alerts: Record<string, unknown>[]): void {
        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, alerts)
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })
    }

    function runFixAndPr(): Promise<Awaited<ReturnType<DependfixApp['run']>>> {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
            cliOverrides: { commands: ['pnpm lint'] },
        })
        const app = new DependfixApp({ config, workDir, reportOutputDir: join(workDir, 'reports'), commands: ['pnpm lint'] })
        return app.run()
    }

    it('adds comment and duplicate label when superseded PRs exist', async () => {
        nockAlerts([esbuildAlert()])
        mockUpgradeDependency.mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'upgraded.txt'), `upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        // 存在异指纹的旧 PR（应被 supersede）
        mockFindDependfixOpenPR.mockResolvedValueOnce([
            {
                number: 50,
                htmlUrl: 'https://github.com/foo/bar/pull/50',
                headRef: 'dependfix/auto-fix-oldfp11',
            },
        ])

        const { exitCode } = await runFixAndPr()

        expect(exitCode).toBe(0)
        expect(mockCreatePullRequest).toHaveBeenCalledTimes(1)
        // 新 PR 创建后调用 comment（指向被取代的旧 PR）
        expect(mockCommentOnPullRequest).toHaveBeenCalledTimes(1)
        expect(mockCommentOnPullRequest).toHaveBeenCalledWith(
            expect.anything(),
            'foo',
            'bar',
            100,
            expect.stringContaining('#50'),
        )
        expect(mockCommentOnPullRequest.mock.calls[0][4]).toContain('https://github.com/foo/bar/pull/50')
        // 新 PR 添加 duplicate label
        expect(mockAddLabelToPullRequest).toHaveBeenCalledTimes(1)
        expect(mockAddLabelToPullRequest).toHaveBeenCalledWith(
            expect.anything(),
            'foo',
            'bar',
            100,
            ['duplicate'],
        )
        // 旧 PR 被关闭
        expect(mockClosePullRequest).toHaveBeenCalledTimes(1)
    }, 30_000)

    it('skips comment and label when no superseded PRs exist', async () => {
        nockAlerts([esbuildAlert()])
        mockUpgradeDependency.mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'upgraded.txt'), `upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        // 无 supersedePRs
        mockFindDependfixOpenPR.mockResolvedValueOnce([])

        const { exitCode } = await runFixAndPr()

        expect(exitCode).toBe(0)
        expect(mockCreatePullRequest).toHaveBeenCalledTimes(1)
        expect(mockCommentOnPullRequest).not.toHaveBeenCalled()
        expect(mockAddLabelToPullRequest).not.toHaveBeenCalled()
    }, 30_000)

    it('continues to add label when comment fails (graceful degradation)', async () => {
        nockAlerts([esbuildAlert()])
        mockUpgradeDependency.mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'upgraded.txt'), `upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        mockFindDependfixOpenPR.mockResolvedValueOnce([
            {
                number: 50,
                htmlUrl: 'https://github.com/foo/bar/pull/50',
                headRef: 'dependfix/auto-fix-oldfp11',
            },
        ])
        // comment 失败（模拟 token 缺 issues: write）
        mockCommentOnPullRequest.mockRejectedValueOnce(new Error('403 Forbidden'))

        const { exitCode } = await runFixAndPr()

        // 失败不阻断主流程
        expect(exitCode).toBe(0)
        expect(mockCommentOnPullRequest).toHaveBeenCalledTimes(1)
        // label 仍执行（独立 try/catch）
        expect(mockAddLabelToPullRequest).toHaveBeenCalledTimes(1)
        expect(mockClosePullRequest).toHaveBeenCalledTimes(1)
    }, 30_000)

    it('closes superseded PRs even when label fails', async () => {
        nockAlerts([esbuildAlert()])
        mockUpgradeDependency.mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'upgraded.txt'), `upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        mockFindDependfixOpenPR.mockResolvedValueOnce([
            {
                number: 50,
                htmlUrl: 'https://github.com/foo/bar/pull/50',
                headRef: 'dependfix/auto-fix-oldfp11',
            },
        ])
        // label 失败
        mockAddLabelToPullRequest.mockRejectedValueOnce(new Error('403 Forbidden'))

        const { exitCode } = await runFixAndPr()

        // 失败不阻断主流程
        expect(exitCode).toBe(0)
        expect(mockCommentOnPullRequest).toHaveBeenCalledTimes(1)
        expect(mockAddLabelToPullRequest).toHaveBeenCalledTimes(1)
        // 旧 PR 仍被关闭（家务活独立）
        expect(mockClosePullRequest).toHaveBeenCalledTimes(1)
    }, 30_000)
})
