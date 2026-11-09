// verification-gate-app.test.ts — 验证门禁在 DependfixApp 交付路径的接线。
//
// 锁定「本次改动引入的验证失败 → 记录 VERIFICATION_FAILED → 回滚 → 不建 PR → exit 2」：
// 这是坏 PR 事故（#23）的防线，必须在 app 级别（而非仅门禁纯函数）有回归网。
// 升级 / 验证 / lockfile repair / PR 创建均 mock，GitHub 调用由 nock 拦截。
import { execSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import nock from 'nock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveRuntimeConfig } from '../config'
import { DependfixApp } from './index'

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

const verificationOk = () => ({
    success: true,
    commandResults: [{ command: 'pnpm lint', exitCode: 0, durationMs: 0, stdout: '', stderr: '' }],
})

const verificationFail = () => ({
    success: false,
    commandResults: [{ command: 'pnpm lint', exitCode: 1, durationMs: 0, stdout: '', stderr: 'lint failed' }],
})

describe('DependfixApp 验证门禁接线（写盘仓库）', () => {
    let workDir: string

    beforeEach(() => {
        nock.cleanAll()
        nock.disableNetConnect()
        workDir = mkdtempSync(join(tmpdir(), 'dependfix-gate-app-'))
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

        // 基线（修复前）与升级后逐包快检全绿；终验（本次改动引入）失败
        mockRunVerification.mockReset()
            .mockResolvedValueOnce(verificationOk())
            .mockResolvedValueOnce(verificationOk())
            .mockResolvedValue(verificationFail())
        mockUpgradeDependency.mockReset().mockImplementation(({ packageName }: { packageName: string }) => {
            writeFileSync(join(workDir, 'pnpm-lock.yaml'), `lockfileVersion: "9.0"\n# upgraded ${packageName}\n`)
            return { packageName, fromVersion: '0.24.0', toVersion: '0.25.12', isMajor: false, success: true }
        })
        mockTryLockfileRepair.mockReset().mockReturnValue({
            type: 'lockfile-repair',
            repository: 'foo/bar',
            target: 'pnpm-lock.yaml',
            success: true,
            noOp: true,
            durationMs: 0,
        })
        mockCreatePullRequest.mockReset()
        mockPushBranch.mockReset()
        mockFindDependfixOpenPR.mockReset().mockResolvedValue([])

        nock('https://api.github.com')
            .get('/repos/foo/bar/dependabot/alerts')
            .query({ state: 'open', per_page: '100' })
            .reply(200, [esbuildAlert()])
        nock('https://api.github.com')
            .get('/repos/foo/bar')
            .reply(200, { default_branch: 'master' })
    })

    afterEach(() => {
        nock.cleanAll()
        nock.enableNetConnect()
        rmSync(workDir, { recursive: true, force: true })
    })

    it('本次引入的验证失败 → 回滚、不建 PR、记 VERIFICATION_FAILED、exit 2', async () => {
        const config = resolveRuntimeConfig({
            env: {
                GITHUB_TOKEN: 'token',
                DEPENDFIX_MODE: 'fix-and-pr',
                DEPENDFIX_REPOSITORIES: 'foo/bar',
            },
            cliOverrides: { commands: ['pnpm lint'] },
        })
        const app = new DependfixApp({
            config, workDir, reportOutputDir: join(workDir, 'reports'), commands: ['pnpm lint'],
        })

        const { exitCode, result } = await app.run()

        expect(exitCode).toBe(2)
        expect(result.errors.some((error) => error.category === 'VERIFICATION_FAILED')).toBe(true)
        expect(mockCreatePullRequest).not.toHaveBeenCalled()
        expect(mockPushBranch).not.toHaveBeenCalled()
        // 修复改动已回滚（.gitignore 由 ensureGitignore 追加报告目录，属运行期预期副作用）
        expect(execSync('git status --porcelain --untracked-files=no package.json pnpm-lock.yaml', {
            cwd: workDir,
            encoding: 'utf-8',
        }).trim()).toBe('')
    }, 30_000)
})
