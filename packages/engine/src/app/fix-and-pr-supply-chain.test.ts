import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

// ---------------------------------------------------------------------------
// 供应链信号披露集成测试（fix-and-pr 模式 PR body 警示区）：
// mock 掉真实升级（fixers/dependency）、验证命令（verification-runner）、
// lockfile 修复与 PR 创建（pr-creator 部分函数），验证：
// - 升级包带 lifecycle scripts 且被 allowBuilds 批准 → PR body 出现警示区（PR 路径接入回归）
// - 升级包不在批准列表 → PR body 无警示区
// 数据收集（workspace.yaml 解析 + node_modules 脚本读取）为真实逻辑。
// ---------------------------------------------------------------------------

const { mockRunVerification, mockUpgradeDependency, mockTryLockfileRepair, mockCreatePullRequest, mockPushBranch, mockFindDependfixOpenPR } = vi.hoisted(() => ({
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

describe('DependfixApp fix-and-pr supply chain disclosure', () => {
    let workDir: string

    beforeEach(() => {
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-supply-app-'))
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
        mockCreatePullRequest.mockReset().mockResolvedValue({ number: 1, htmlUrl: 'https://github.com/foo/bar/pull/1' })
        mockPushBranch.mockReset()
        mockFindDependfixOpenPR.mockReset().mockResolvedValue([])
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

    it('PR body includes supply chain warning when upgraded package has scripts and is approved', async () => {
        nockAlerts([esbuildAlert()])
        // 升级 mock：修改已跟踪文件制造 git 改动（PR 创建的 hasGitChanges 检查需要）
        mockUpgradeDependency.mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'upgraded.txt'), `upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        // 供应链信号数据源：workspace.yaml 批准 esbuild + node_modules 真实包带 postinstall
        writeFileSync(join(workDir, 'pnpm-workspace.yaml'), 'allowBuilds:\n  esbuild: true\n')
        const esbuildDir = join(workDir, 'node_modules', '.pnpm', 'esbuild@0.25.12', 'node_modules', 'esbuild')
        mkdirSync(esbuildDir, { recursive: true })
        writeFileSync(join(esbuildDir, 'package.json'), JSON.stringify({
            name: 'esbuild',
            version: '0.25.12',
            scripts: { postinstall: 'node install.js' },
        }))

        const { exitCode, result } = await runFixAndPr()

        expect(exitCode).toBe(0)
        expect(mockCreatePullRequest).toHaveBeenCalledTimes(1)
        const prBody = mockCreatePullRequest.mock.calls[0][0].body as string
        expect(prBody).toContain('### ⚠️ Supply Chain Warnings')
        expect(prBody).toContain('`esbuild`')
        expect(prBody).toContain('`0.25.12`')
        expect(prBody).toContain('`postinstall`')
        // 报告文件同样含警示区
        expect(result.supplyChainWarnings).toHaveLength(1)
        expect(result.supplyChainWarnings?.[0]).toMatchObject({ packageName: 'esbuild', scriptTypes: ['postinstall'] })
    }, 30_000)

    it('PR body omits warning section when upgraded package is not approved', async () => {
        nockAlerts([esbuildAlert()])
        mockUpgradeDependency.mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'upgraded.txt'), `upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        // 无 pnpm-workspace.yaml（未批准任何包）
        expect(existsSync(join(workDir, 'pnpm-workspace.yaml'))).toBe(false)

        const { exitCode } = await runFixAndPr()

        expect(exitCode).toBe(0)
        expect(mockCreatePullRequest).toHaveBeenCalledTimes(1)
        const prBody = mockCreatePullRequest.mock.calls[0][0].body as string
        expect(prBody).not.toContain('Supply Chain Warnings')
    }, 30_000)
})
